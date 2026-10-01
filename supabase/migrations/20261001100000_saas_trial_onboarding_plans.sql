-- BarberTix · Prioridade 1
-- Onboarding automático, teste grátis de 14 dias, planos com recursos controlados
-- pelo backend, histórico de assinatura, aquisição (UTM/click IDs) e endurecimento
-- de permissões. Somente alterações aditivas: nenhum dado existente é apagado.

-- ---------------------------------------------------------------------------
-- 1. Planos: preços e recursos (verificados no banco, não só no frontend)
-- ---------------------------------------------------------------------------
alter table public.plans
  add column if not exists features jsonb not null default '{}'::jsonb,
  add column if not exists description text not null default '',
  add column if not exists sort_order integer not null default 0,
  add column if not exists public_signup boolean not null default false;

update public.plans set monthly_cents=7000,extra_unit_cents=0,max_barbers=1,max_units=1,max_profiles=1,included_units=1,
  sort_order=1,public_signup=true,
  description='Sistema interno · proprietário + 1 perfil · sem agendamento público · sem robô de WhatsApp',
  features='{"public_booking":false,"whatsapp_bot":false,"automations":false,"marketing":false,"deposits":false,"multi_unit":false}'::jsonb
where name='Starter';

update public.plans set monthly_cents=10000,extra_unit_cents=0,max_barbers=11,max_units=1,max_profiles=10,included_units=1,
  sort_order=2,public_signup=true,
  description='Todos os recursos · proprietário + até 10 perfis · agendamento público · automações · WhatsApp',
  features='{"public_booking":true,"whatsapp_bot":true,"automations":true,"marketing":true,"deposits":true,"multi_unit":false}'::jsonb
where name='Pro';

update public.plans set monthly_cents=15000,extra_unit_cents=4990,max_barbers=11,max_units=9999,max_profiles=10,included_units=1,
  sort_order=3,public_signup=true,
  description='Tudo do Pro · múltiplas unidades · R$ 49,90 por unidade adicional',
  features='{"public_booking":true,"whatsapp_bot":true,"automations":true,"marketing":true,"deposits":true,"multi_unit":true}'::jsonb
where name='Pro + Filiais';

create or replace function private.plan_feature(t uuid,f text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select coalesce((p.features->>f)::boolean,false)
    from public.tenants tn join public.plans p on p.id=tn.plan_id where tn.id=t),false)
$$;

-- ---------------------------------------------------------------------------
-- 2. Assinatura: teste grátis, status normalizado, onboarding
-- ---------------------------------------------------------------------------
alter table public.tenants
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists subscription_status text not null default 'trial',
  add column if not exists onboarding_step integer not null default 0,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists signup_source text not null default 'admin',
  add column if not exists blocked_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists manual_release_until date;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='tenants_subscription_status_check' and conrelid='public.tenants'::regclass) then
    alter table public.tenants add constraint tenants_subscription_status_check
      check (subscription_status in ('trial','active','overdue','blocked','cancelled'));
  end if;
  if not exists(select 1 from pg_constraint where conname='tenants_signup_source_check' and conrelid='public.tenants'::regclass) then
    alter table public.tenants add constraint tenants_signup_source_check check (signup_source in ('admin','self'));
  end if;
end $$;

-- status (legado, usado em todo o sistema) continua sendo a fonte; subscription_status
-- é o espelho normalizado pedido pelo produto.
create or replace function private.tenant_subscription_status()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.subscription_status:=case new.status when 'pending' then 'active' when 'suspended' then 'blocked' else new.status end;
  if tg_op='UPDATE' and new.status is distinct from old.status then
    if new.status in ('blocked','suspended') then new.blocked_at:=now(); end if;
    if new.status='cancelled' then new.cancelled_at:=now(); end if;
  end if;
  return new;
end $$;

drop trigger if exists tenants_subscription_status on public.tenants;
create trigger tenants_subscription_status before insert or update of status on public.tenants
  for each row execute function private.tenant_subscription_status();

update public.tenants set subscription_status=case status when 'pending' then 'active' when 'suspended' then 'blocked' else status end;
-- Barbearias já existentes não passam pelo assistente de configuração.
update public.tenants set onboarding_completed_at=coalesce(onboarding_completed_at,created_at),onboarding_step=greatest(onboarding_step,6)
where onboarding_completed_at is null;

-- Histórico da assinatura (pagamentos, mudanças de status, liberações manuais, avisos).
create table if not exists public.subscription_events(
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null,
  from_status text,
  to_status text,
  amount_cents integer,
  reference text,
  details jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists subscription_events_tenant_idx on public.subscription_events(tenant_id,created_at desc);
create unique index if not exists subscription_events_once_idx on public.subscription_events(tenant_id,kind,reference)
  where kind in ('due_reminder','trial_ending_reminder');
alter table public.subscription_events enable row level security;
revoke all on public.subscription_events from anon,authenticated;
grant select on public.subscription_events to authenticated;
drop policy if exists subscription_events_read on public.subscription_events;
create policy subscription_events_read on public.subscription_events for select to authenticated
  using (private.is_admin() or exists(select 1 from public.memberships m where m.tenant_id=subscription_events.tenant_id and m.user_id=auth.uid() and m.active and m.role='owner'));

create or replace function private.tenant_status_history()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status then
    insert into public.subscription_events(tenant_id,kind,from_status,to_status,created_by,details)
    values(new.id,'status_changed',old.status,new.status,auth.uid(),jsonb_build_object('billing_due_date',new.billing_due_date));
  end if;
  return new;
end $$;
drop trigger if exists tenants_status_history on public.tenants;
create trigger tenants_status_history after update of status on public.tenants
  for each row execute function private.tenant_status_history();

-- Regras: teste expirado -> inadimplente; vencido -> inadimplente; após a tolerância
-- (grace_days, padrão 7) -> bloqueado. Liberação manual suspende a regra até a data.
create or replace function private.run_billing_sync(p_tenant uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
declare n int; today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
  update public.tenants tn set status=c.next_status
  from (
    select id,case
      when status='trial' and trial_ends_at is not null and now()>trial_ends_at then 'overdue'
      when status='trial' then status
      when billing_due_date is null then status
      when today>billing_due_date+grace_days and status in ('active','pending','overdue') then 'blocked'
      when today>billing_due_date and status in ('active','pending') then 'overdue'
      when today<=billing_due_date and status in ('overdue','pending')
        and not (trial_ends_at is not null and now()>trial_ends_at and last_paid_at is null) then 'active'
      else status end as next_status
    from public.tenants
    where (p_tenant is null or id=p_tenant)
      and status not in ('suspended','cancelled')
      and (manual_release_until is null or manual_release_until<today)
  ) c
  where tn.id=c.id and c.next_status<>tn.status;
  get diagnostics n=row_count;
  return n;
end $$;

create or replace function public.sync_tenant_billing_status(p_tenant uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.role(),'')<>'service_role' and private.platform_role() is null then
    raise exception 'Acesso restrito' using errcode='42501';
  end if;
  return private.run_billing_sync(p_tenant);
end $$;
revoke all on function public.sync_tenant_billing_status(uuid) from public,anon;
grant execute on function public.sync_tenant_billing_status(uuid) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 3. Aquisição (UTM + IDs de clique + contexto de servidor)
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_acquisition(
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  landing_page text,
  referrer text,
  click_ids jsonb not null default '{}'::jsonb,
  first_touch_at timestamptz,
  last_touch jsonb not null default '{}'::jsonb,
  server_context jsonb not null default '{}'::jsonb,
  plan_at_signup text,
  signup_at timestamptz not null default now(),
  trial_started_at timestamptz,
  subscribed_at timestamptz,
  first_paid_at timestamptz,
  first_payment_cents integer,
  created_at timestamptz not null default now()
);
create index if not exists tenant_acquisition_campaign_idx on public.tenant_acquisition(utm_source,utm_campaign);
alter table public.tenant_acquisition enable row level security;
revoke all on public.tenant_acquisition from anon,authenticated;

-- ---------------------------------------------------------------------------
-- 4. Cadastro público (executado somente pelo servidor com service role)
-- ---------------------------------------------------------------------------
create or replace function private.unique_slug(base text)
returns text language plpgsql stable security definer set search_path='' as $$
declare s text; candidate text; n int:=1;
begin
  s:=lower(regexp_replace(coalesce(base,''),'[^a-zA-Z0-9]+','-','g'));
  s:=trim(both '-' from s);
  if s !~ '^[a-z]' then s:='barbearia-'||s; end if;
  s:=trim(both '-' from left(s,52));
  if length(s)<3 then s:='barbearia-'||substr(md5(random()::text),1,6); end if;
  candidate:=s;
  while exists(select 1 from public.tenants where slug=candidate) loop
    n:=n+1;
    candidate:=s||'-'||n;
    if n>500 then candidate:=s||'-'||substr(md5(random()::text),1,6); exit; end if;
  end loop;
  return candidate;
end $$;

create or replace function public.signup_provision_tenant(p_owner uuid,p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  t uuid; v_plan public.plans; v_slug text; v_name text:=trim(coalesce(p->>'name',''));
  v_owner text:=trim(coalesce(p->>'owner_name','')); v_phone text:=regexp_replace(coalesce(p->>'whatsapp',''),'[^0-9]','','g');
  v_trial_days int:=14; a jsonb:=coalesce(p->'acquisition','{}'::jsonb);
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Acesso restrito' using errcode='42501'; end if;
  if p_owner is null or not exists(select 1 from auth.users where id=p_owner) then raise exception 'Usuário inválido'; end if;
  if exists(select 1 from public.memberships where user_id=p_owner and role='owner') then raise exception 'Este usuário já possui uma barbearia'; end if;
  if length(v_name) not between 2 and 120 then raise exception 'Informe o nome da barbearia'; end if;
  if length(v_owner) not between 2 and 120 then raise exception 'Informe o nome do responsável'; end if;
  if length(v_phone) not between 10 and 13 then raise exception 'Informe um WhatsApp válido com DDD'; end if;

  select * into v_plan from public.plans where public_signup and name=coalesce(nullif(p->>'plan',''),'Pro');
  if v_plan.id is null then select * into v_plan from public.plans where name='Pro'; end if;
  if v_plan.id is null then raise exception 'Plano indisponível'; end if;

  v_slug:=private.unique_slug(coalesce(nullif(p->>'slug',''),v_name));

  insert into public.tenants(name,slug,phone,whatsapp,plan_id,status,public_site_enabled,trial_started_at,trial_ends_at,
    billing_due_date,grace_days,signup_source,onboarding_step,onboarding_completed_at,product_slug)
  values(v_name,v_slug,v_phone,v_phone,v_plan.id,'trial',coalesce((v_plan.features->>'public_booking')::boolean,false),now(),now()+make_interval(days=>v_trial_days),
    ((now()+make_interval(days=>v_trial_days)) at time zone 'America/Sao_Paulo')::date,coalesce(v_plan.default_grace_days,7),'self',1,null,'barberflow')
  returning id into t;

  insert into public.memberships(tenant_id,user_id,name,role,permissions,whatsapp)
  values(t,p_owner,v_owner,'owner',array['agenda','booking','clients','services','team','settings','audit','finance','inventory','sales','reports']::text[],v_phone);
  insert into public.units(tenant_id,name) values(t,'Matriz');

  insert into public.tenant_acquisition(tenant_id,utm_source,utm_medium,utm_campaign,utm_content,utm_term,landing_page,referrer,
    click_ids,first_touch_at,last_touch,server_context,plan_at_signup,trial_started_at)
  values(t,left(nullif(a->>'utm_source',''),200),left(nullif(a->>'utm_medium',''),200),left(nullif(a->>'utm_campaign',''),200),
    left(nullif(a->>'utm_content',''),200),left(nullif(a->>'utm_term',''),200),left(nullif(a->>'landing_page',''),500),
    left(nullif(a->>'referrer',''),500),coalesce(a->'click_ids','{}'::jsonb),nullif(a->>'first_touch_at','')::timestamptz,
    coalesce(a->'last_touch','{}'::jsonb),coalesce(p->'server_context','{}'::jsonb),v_plan.name,now());

  insert into public.subscription_events(tenant_id,kind,to_status,created_by,details)
  values(t,'trial_started','trial',p_owner,jsonb_build_object('plan',v_plan.name,'trial_days',v_trial_days));
  insert into public.audit_events(tenant_id,actor_id,action,entity_id,details)
  values(t,p_owner,'tenant.self_signup',t,jsonb_build_object('plan',v_plan.name));

  return jsonb_build_object('tenant_id',t,'slug',v_slug,'plan',v_plan.name);
end $$;
revoke all on function public.signup_provision_tenant(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.signup_provision_tenant(uuid,jsonb) to service_role;

-- Progresso do assistente de configuração (somente proprietário).
create or replace function public.save_onboarding_progress(t uuid,p_step integer,p_completed boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.memberships where tenant_id=t and user_id=auth.uid() and role='owner' and active) then
    raise exception 'Somente o proprietário pode configurar a barbearia' using errcode='42501';
  end if;
  update public.tenants set onboarding_step=greatest(onboarding_step,least(greatest(coalesce(p_step,0),0),6)),
    onboarding_completed_at=case when p_completed then coalesce(onboarding_completed_at,now()) else onboarding_completed_at end
  where id=t;
  return (select jsonb_build_object('step',onboarding_step,'completed_at',onboarding_completed_at) from public.tenants where id=t);
end $$;
revoke all on function public.save_onboarding_progress(uuid,integer,boolean) from public,anon;
grant execute on function public.save_onboarding_progress(uuid,integer,boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. "Trabalha em atendimentos?" + serviços por profissional
-- ---------------------------------------------------------------------------
create or replace function public.set_barber_services(t uuid,b uuid,p_services uuid[])
returns integer language plpgsql security definer set search_path='' as $$
declare n int;
begin
  if not (private.can(t,'services') or private.can(t,'team')) then raise exception 'Sem permissão para vincular serviços' using errcode='42501'; end if;
  if not exists(select 1 from public.barbers where tenant_id=t and id=b) then raise exception 'Profissional inválido'; end if;
  if exists(select 1 from unnest(coalesce(p_services,'{}')) x where not exists(select 1 from public.services s where s.tenant_id=t and s.id=x)) then
    raise exception 'Serviço inválido';
  end if;
  delete from public.barber_services where tenant_id=t and barber_id=b and not (service_id=any(coalesce(p_services,'{}')));
  insert into public.barber_services(tenant_id,barber_id,service_id) select t,b,x from unnest(coalesce(p_services,'{}')) x on conflict do nothing;
  select count(*) into n from public.barber_services where tenant_id=t and barber_id=b;
  perform private.log(t,null,'barber.services_updated',b,jsonb_build_object('services',p_services));
  return n;
end $$;
revoke all on function public.set_barber_services(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.set_barber_services(uuid,uuid,uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Troca de plano pelo proprietário (upgrade a qualquer momento, inclusive no teste)
-- ---------------------------------------------------------------------------
create or replace function public.owner_change_plan(t uuid,p_plan uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_plan public.plans; profiles int; units int; providers int; old_plan text;
begin
  if not exists(select 1 from public.memberships where tenant_id=t and user_id=auth.uid() and role='owner' and active) then
    raise exception 'Somente o proprietário pode trocar o plano' using errcode='42501';
  end if;
  select * into v_plan from public.plans where id=p_plan and public_signup;
  if v_plan.id is null then raise exception 'Plano inválido'; end if;
  select p.name into old_plan from public.tenants tn left join public.plans p on p.id=tn.plan_id where tn.id=t;
  select count(*) into profiles from public.memberships where tenant_id=t and active and role<>'owner';
  select count(*) into units from public.units where tenant_id=t and active;
  select count(*) into providers from public.barbers where tenant_id=t and active;
  if profiles>v_plan.max_profiles then raise exception 'Desative perfis antes: o plano % permite proprietário + % perfil(is)',v_plan.name,v_plan.max_profiles; end if;
  if units>v_plan.max_units then raise exception 'Desative unidades antes: o plano % permite % unidade(s)',v_plan.name,v_plan.max_units; end if;
  update public.tenants set plan_id=v_plan.id,public_site_enabled=coalesce((v_plan.features->>'public_booking')::boolean,false) where id=t;
  update public.memberships set permissions=case when v_plan.name='Starter'
      then array['clients','services','team','finance','inventory','sales','reports']::text[]
      else array['agenda','booking','clients','services','team','settings','audit','finance','inventory','sales','reports']::text[] end
    where tenant_id=t and role='owner';
  insert into public.subscription_events(tenant_id,kind,created_by,details)
  values(t,'plan_changed',auth.uid(),jsonb_build_object('from',old_plan,'to',v_plan.name,'active_providers',providers));
  return jsonb_build_object('plan',v_plan.name,'monthly_cents',v_plan.monthly_cents);
end $$;
revoke all on function public.owner_change_plan(uuid,uuid) from public,anon;
grant execute on function public.owner_change_plan(uuid,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Endurecimento: credenciais de integração nunca chegam ao navegador
-- ---------------------------------------------------------------------------
revoke select on public.tenants from authenticated;
grant select (id,name,slug,status,plan_id,phone,created_at,logo_url,cover_url,description,whatsapp,address,instagram,public_info,
  public_site_enabled,pix_key,pix_name,pix_city,billing_due_date,owner_document,manager_name,manager_document,grace_days,last_paid_at,
  instagram_user_id,instagram_username,instagram_connected_at,commitment_months,no_commitment_surcharge_pct,discount_pct,discount_months,
  discount_started_at,product_slug,billing_provider,billing_method,billing_provider_status,billing_amount_cents,asaas_customer_id,
  asaas_subscription_id,asaas_checkout_id,asaas_last_payment_id,trial_started_at,trial_ends_at,subscription_status,onboarding_step,
  onboarding_completed_at,signup_source,blocked_at,cancelled_at,manual_release_until)
  on public.tenants to authenticated;

-- Tabelas internas com RLS sem políticas de escrita: remove privilégios desnecessários.
revoke all on public.platform_settings from anon,authenticated;
revoke all on public.whatsapp_booking_sessions from anon,authenticated;
revoke insert,update,delete,truncate,references,trigger on public.whatsapp_bot_logs from anon,authenticated;
revoke select on public.whatsapp_bot_logs from anon;
revoke insert,update,delete,truncate,references,trigger on public.appointment_payments from anon,authenticated;
revoke select on public.appointment_payments from anon;
revoke insert,update,delete,truncate,references,trigger on public.appointment_services from anon,authenticated;
revoke select on public.appointment_services from anon;
revoke insert,update,delete,truncate,references,trigger on public.quick_sales from anon,authenticated;
revoke select on public.quick_sales from anon;
revoke insert,update,delete,truncate,references,trigger on public.staff_logins from anon,authenticated;

-- ---------------------------------------------------------------------------
-- 8. Histórico de cobranças independente do gateway
-- ---------------------------------------------------------------------------
alter table public.billing_payments
  add column if not exists state text not null default 'pending',
  add column if not exists method text not null default '',
  add column if not exists kind text not null default 'subscription',
  add column if not exists pix_payload text,
  add column if not exists external_reference text,
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists raw jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists(select 1 from pg_constraint where conname='billing_payments_state_check' and conrelid='public.billing_payments'::regclass) then
    alter table public.billing_payments add constraint billing_payments_state_check
      check (state in ('pending','paid','overdue','cancelled','refunded'));
  end if;
end $$;
update public.billing_payments set state=case
  when upper(status) in ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH','PAYMENT_RECEIVED','PAYMENT_CONFIRMED') then 'paid'
  when upper(status) in ('OVERDUE','PAYMENT_OVERDUE') then 'overdue'
  when upper(status) in ('REFUNDED','PAYMENT_REFUNDED','REFUND_REQUESTED') then 'refunded'
  when upper(status) in ('DELETED','PAYMENT_DELETED','CANCELLED') then 'cancelled'
  else 'pending' end;
alter table public.billing_webhook_events add column if not exists payload jsonb;

-- Registro normalizado vindo de qualquer gateway (Asaas hoje; outros no futuro).
create or replace function public.billing_record_payment(p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  t uuid:=nullif(p->>'tenant_id','')::uuid; prov text:=coalesce(nullif(p->>'provider',''),'manual');
  ext text:=nullif(p->>'external_id',''); st text:=coalesce(nullif(p->>'state',''),'pending');
  due date:=nullif(p->>'due_date','')::date; paid timestamptz:=nullif(p->>'paid_at','')::timestamptz;
  amount int:=greatest(0,coalesce((p->>'amount_cents')::int,0));
  prev text; v_tenant public.tenants; new_due date; today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Acesso restrito' using errcode='42501'; end if;
  if t is null or ext is null then raise exception 'Cobrança inválida'; end if;
  if st not in ('pending','paid','overdue','cancelled','refunded') then raise exception 'Status inválido'; end if;
  select * into v_tenant from public.tenants where id=t for update;
  if v_tenant.id is null then raise exception 'Barbearia não encontrada'; end if;
  select state into prev from public.billing_payments where provider=prov and provider_payment_id=ext;

  insert into public.billing_payments as bp(tenant_id,provider,provider_payment_id,provider_subscription_id,status,state,billing_type,method,
    value_cents,due_date,paid_at,invoice_url,bank_slip_url,pix_payload,external_reference,kind,raw,updated_at)
  values(t,prov,ext,nullif(p->>'subscription_id',''),coalesce(p->>'raw_status',st),st,coalesce(p->>'billing_type',''),coalesce(p->>'method',''),
    amount,due,case when st='paid' then coalesce(paid,now()) else paid end,nullif(p->>'invoice_url',''),nullif(p->>'bank_slip_url',''),
    nullif(p->>'pix_payload',''),nullif(p->>'external_reference',''),coalesce(nullif(p->>'kind',''),'subscription'),coalesce(p->'raw','{}'::jsonb),now())
  on conflict(provider,provider_payment_id) do update set
    status=excluded.status,
    state=case when bp.state='paid' and excluded.state in ('pending','overdue') then bp.state else excluded.state end,
    billing_type=coalesce(nullif(excluded.billing_type,''),bp.billing_type),
    method=coalesce(nullif(excluded.method,''),bp.method),
    value_cents=case when excluded.value_cents>0 then excluded.value_cents else bp.value_cents end,
    due_date=coalesce(excluded.due_date,bp.due_date),
    paid_at=coalesce(bp.paid_at,excluded.paid_at),
    invoice_url=coalesce(excluded.invoice_url,bp.invoice_url),
    bank_slip_url=coalesce(excluded.bank_slip_url,bp.bank_slip_url),
    pix_payload=coalesce(excluded.pix_payload,bp.pix_payload),
    provider_subscription_id=coalesce(excluded.provider_subscription_id,bp.provider_subscription_id),
    raw=excluded.raw,updated_at=now();

  if st='paid' and prev is distinct from 'paid' then
    new_due:=(coalesce(due,v_tenant.billing_due_date,today)+interval '1 month')::date;
    if new_due<=today then new_due:=(today+interval '1 month')::date; end if;
    update public.tenants set status='active',last_paid_at=coalesce(paid,now()),billing_due_date=new_due,manual_release_until=null where id=t;
    update public.tenant_acquisition set first_paid_at=coalesce(first_paid_at,coalesce(paid,now())),
      first_payment_cents=coalesce(first_payment_cents,amount),subscribed_at=coalesce(subscribed_at,coalesce(paid,now()))
    where tenant_id=t;
    insert into public.subscription_events(tenant_id,kind,from_status,to_status,amount_cents,reference,details)
    values(t,'payment_confirmed',v_tenant.status,'active',amount,prov||':'||ext,jsonb_build_object('due_date',due,'next_due_date',new_due,'method',p->>'method'));
  elsif st='overdue' and prev is distinct from 'overdue' then
    insert into public.subscription_events(tenant_id,kind,amount_cents,reference,details)
    values(t,'payment_overdue',amount,prov||':'||ext,jsonb_build_object('due_date',due));
    perform private.run_billing_sync(t);
  elsif st in ('refunded','cancelled') and prev is distinct from st then
    insert into public.subscription_events(tenant_id,kind,amount_cents,reference)
    values(t,'payment_'||st,amount,prov||':'||ext);
  end if;
  return jsonb_build_object('tenant_id',t,'state',st,'previous',prev);
end $$;
revoke all on function public.billing_record_payment(jsonb) from public,anon,authenticated;
grant execute on function public.billing_record_payment(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Painel mestre: liberação manual, bloqueio, cancelamento
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_subscription(p_tenant uuid,p_action text,p_days integer default 7,p_reason text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare r text:=private.platform_role(); v public.tenants; today date:=(now() at time zone 'America/Sao_Paulo')::date; d int:=least(greatest(coalesce(p_days,7),1),90);
begin
  if r is null then raise exception 'Acesso restrito' using errcode='42501'; end if;
  select * into v from public.tenants where id=p_tenant for update;
  if v.id is null then raise exception 'Barbearia não encontrada'; end if;
  if p_action='release' then
    update public.tenants set status='active',manual_release_until=today+d,
      billing_due_date=greatest(coalesce(billing_due_date,today),today) where id=p_tenant;
  elsif p_action='extend_trial' then
    update public.tenants set status='trial',trial_ends_at=greatest(coalesce(trial_ends_at,now()),now())+make_interval(days=>d),
      billing_due_date=((greatest(coalesce(trial_ends_at,now()),now())+make_interval(days=>d)) at time zone 'America/Sao_Paulo')::date where id=p_tenant;
  elsif p_action='block' then
    update public.tenants set status='blocked',manual_release_until=null where id=p_tenant;
  elsif p_action='cancel' then
    if r<>'full' then raise exception 'Somente o administrador mestre pode cancelar'; end if;
    update public.tenants set status='cancelled',manual_release_until=null where id=p_tenant;
  elsif p_action='reactivate' then
    update public.tenants set status='active',manual_release_until=null,
      billing_due_date=greatest(coalesce(billing_due_date,today),today) where id=p_tenant;
  else raise exception 'Ação inválida'; end if;
  insert into public.subscription_events(tenant_id,kind,from_status,to_status,created_by,details)
  values(p_tenant,'manual_'||p_action,v.status,(select status from public.tenants where id=p_tenant),auth.uid(),
    jsonb_build_object('days',d,'reason',left(coalesce(p_reason,''),500)));
  return (select jsonb_build_object('status',status,'manual_release_until',manual_release_until,'billing_due_date',billing_due_date,'trial_ends_at',trial_ends_at)
    from public.tenants where id=p_tenant);
end $$;
revoke all on function public.admin_set_subscription(uuid,text,integer,text) from public,anon;
grant execute on function public.admin_set_subscription(uuid,text,integer,text) to authenticated;

-- Baixa manual também passa a registrar histórico.
create or replace function public.admin_mark_paid(p_tenant uuid)
returns date language plpgsql security definer set search_path='' as $$
declare d date; r text:=private.platform_role(); v public.tenants; amount int;
begin
  if r is null then raise exception 'Acesso restrito' using errcode='42501'; end if;
  select * into v from public.tenants where id=p_tenant for update;
  if v.id is null then raise exception 'Barbearia não encontrada'; end if;
  d:=coalesce(v.billing_due_date,current_date);
  if d<current_date then d:=current_date; end if;
  d:=(d+interval '1 month')::date;
  select coalesce(nullif(v.billing_amount_cents,0),p.monthly_cents,0) into amount from public.plans p where p.id=v.plan_id;
  update public.tenants set billing_due_date=d,status='active',last_paid_at=now(),manual_release_until=null where id=p_tenant;
  update public.tenant_acquisition set first_paid_at=coalesce(first_paid_at,now()),first_payment_cents=coalesce(first_payment_cents,amount),
    subscribed_at=coalesce(subscribed_at,now()) where tenant_id=p_tenant;
  insert into public.billing_payments(tenant_id,provider,provider_payment_id,status,state,method,value_cents,due_date,paid_at,kind)
  values(p_tenant,'manual','manual-'||gen_random_uuid(),'MANUAL','paid','manual',coalesce(amount,0),v.billing_due_date,now(),'subscription');
  insert into public.subscription_events(tenant_id,kind,from_status,to_status,amount_cents,created_by,details)
  values(p_tenant,'payment_confirmed',v.status,'active',amount,auth.uid(),jsonb_build_object('manual',true,'next_due_date',d));
  return d;
end $$;
