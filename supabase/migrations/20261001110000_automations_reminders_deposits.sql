-- BarberTix · Prioridades 2 e 3
-- Confirmação e lembretes por WhatsApp, sinal (PIX) com reserva temporária,
-- agendamento público com "qualquer profissional". Apenas alterações aditivas.

-- ---------------------------------------------------------------------------
-- 1. Configurações de automação por barbearia
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_automation_settings(
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  confirmation_enabled boolean not null default true,
  confirmation_hours integer not null default 24 check (confirmation_hours between 2 and 168),
  reminder_enabled boolean not null default true,
  reminder_hours integer not null default 2 check (reminder_hours between 1 and 48),
  confirmation_message text not null default '' check (length(confirmation_message)<=1000),
  reminder_message text not null default '' check (length(reminder_message)<=1000),
  deposit_mode text not null default 'none' check (deposit_mode in ('none','fixed','percent')),
  deposit_fixed_cents integer not null default 0 check (deposit_fixed_cents between 0 and 1000000),
  deposit_percent integer not null default 0 check (deposit_percent between 0 and 100),
  deposit_timeout_minutes integer not null default 15 check (deposit_timeout_minutes between 5 and 1440),
  recovery_message text not null default '' check (length(recovery_message)<=1000),
  recovery_factor numeric not null default 1.5 check (recovery_factor between 1.1 and 5),
  recovery_min_visits integer not null default 2 check (recovery_min_visits between 2 and 20),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.tenant_automation_settings enable row level security;
revoke all on public.tenant_automation_settings from anon,authenticated;
grant select on public.tenant_automation_settings to authenticated;
drop policy if exists automation_settings_read on public.tenant_automation_settings;
create policy automation_settings_read on public.tenant_automation_settings for select to authenticated
  using (private.member(tenant_id));

create or replace function public.save_automation_settings(t uuid,p jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare cur public.tenant_automation_settings; mode text;
begin
  if not private.can(t,'settings') then raise exception 'Sem permissão para configurar automações' using errcode='42501'; end if;
  select * into cur from public.tenant_automation_settings where tenant_id=t;
  mode:=coalesce(p->>'deposit_mode',cur.deposit_mode,'none');
  if not private.plan_feature(t,'automations') and (coalesce((p->>'confirmation_enabled')::boolean,false) or coalesce((p->>'reminder_enabled')::boolean,false)) then
    raise exception 'Confirmações e lembretes automáticos estão disponíveis a partir do plano Pro';
  end if;
  if mode<>'none' and not private.plan_feature(t,'deposits') then
    raise exception 'O sinal para agendamento está disponível a partir do plano Pro';
  end if;
  if mode='fixed' and coalesce((p->>'deposit_fixed_cents')::int,0)<=0 then raise exception 'Informe o valor do sinal'; end if;
  if mode='percent' and coalesce((p->>'deposit_percent')::int,0) not between 1 and 100 then raise exception 'Informe o percentual do sinal'; end if;
  if coalesce((p->>'reminder_hours')::int,2)>=coalesce((p->>'confirmation_hours')::int,24) then
    raise exception 'O lembrete deve ser enviado mais perto do horário do que a confirmação';
  end if;
  insert into public.tenant_automation_settings(tenant_id,confirmation_enabled,confirmation_hours,reminder_enabled,reminder_hours,
    confirmation_message,reminder_message,deposit_mode,deposit_fixed_cents,deposit_percent,deposit_timeout_minutes,
    recovery_message,recovery_factor,recovery_min_visits,updated_by,updated_at)
  values(t,coalesce((p->>'confirmation_enabled')::boolean,true),coalesce((p->>'confirmation_hours')::int,24),
    coalesce((p->>'reminder_enabled')::boolean,true),coalesce((p->>'reminder_hours')::int,2),
    left(coalesce(p->>'confirmation_message',''),1000),left(coalesce(p->>'reminder_message',''),1000),mode,
    coalesce((p->>'deposit_fixed_cents')::int,0),coalesce((p->>'deposit_percent')::int,0),coalesce((p->>'deposit_timeout_minutes')::int,15),
    left(coalesce(p->>'recovery_message',cur.recovery_message,''),1000),coalesce((p->>'recovery_factor')::numeric,cur.recovery_factor,1.5),
    coalesce((p->>'recovery_min_visits')::int,cur.recovery_min_visits,2),auth.uid(),now())
  on conflict(tenant_id) do update set
    confirmation_enabled=excluded.confirmation_enabled,confirmation_hours=excluded.confirmation_hours,
    reminder_enabled=excluded.reminder_enabled,reminder_hours=excluded.reminder_hours,
    confirmation_message=excluded.confirmation_message,reminder_message=excluded.reminder_message,
    deposit_mode=excluded.deposit_mode,deposit_fixed_cents=excluded.deposit_fixed_cents,deposit_percent=excluded.deposit_percent,
    deposit_timeout_minutes=excluded.deposit_timeout_minutes,recovery_message=excluded.recovery_message,
    recovery_factor=excluded.recovery_factor,recovery_min_visits=excluded.recovery_min_visits,
    updated_by=excluded.updated_by,updated_at=now();
  perform private.log(t,null,'automation.settings_saved',t,p);
end $$;
revoke all on function public.save_automation_settings(uuid,jsonb) from public,anon;
grant execute on function public.save_automation_settings(uuid,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Agendamentos: confirmação do cliente, sinal e campanha de origem
-- ---------------------------------------------------------------------------
alter table public.appointments
  add column if not exists client_confirmed_at timestamptz,
  add column if not exists deposit_status text not null default 'none',
  add column if not exists deposit_cents integer not null default 0,
  add column if not exists hold_expires_at timestamptz,
  add column if not exists campaign_recipient_id uuid;
do $$
begin
  if not exists(select 1 from pg_constraint where conname='appointments_deposit_status_check' and conrelid='public.appointments'::regclass) then
    alter table public.appointments add constraint appointments_deposit_status_check
      check (deposit_status in ('none','pending','paid','expired','refunded'));
  end if;
end $$;
create index if not exists appointments_deposit_hold_idx on public.appointments(hold_expires_at) where deposit_status='pending';
create index if not exists appointments_upcoming_idx on public.appointments(starts_at) where status='scheduled';

alter table public.quick_sales add column if not exists appointment_id uuid;
create index if not exists quick_sales_appointment_idx on public.quick_sales(tenant_id,appointment_id) where appointment_id is not null;

-- Registro de cada mensagem automática (evita duplicidade com unique por tipo).
create table if not exists public.appointment_notifications(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  appointment_id uuid not null,
  kind text not null check (kind in ('confirmation','reminder','deposit_request','deposit_paid')),
  channel text not null default 'whatsapp',
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  phone text,
  message text,
  error text,
  attempts integer not null default 1,
  response text check (response in ('confirmed','cancelled','reschedule_requested','rescheduled')),
  responded_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(appointment_id,kind),
  foreign key (tenant_id,appointment_id) references public.appointments(tenant_id,id) on delete cascade
);
create index if not exists appointment_notifications_tenant_idx on public.appointment_notifications(tenant_id,created_at desc);
create index if not exists appointment_notifications_phone_idx on public.appointment_notifications(tenant_id,phone) where response is null;
alter table public.appointment_notifications enable row level security;
revoke all on public.appointment_notifications from anon,authenticated;
grant select on public.appointment_notifications to authenticated;
drop policy if exists appointment_notifications_read on public.appointment_notifications;
create policy appointment_notifications_read on public.appointment_notifications for select to authenticated
  using (exists(select 1 from public.appointments a where a.tenant_id=appointment_notifications.tenant_id and a.id=appointment_notifications.appointment_id and private.agenda(a.tenant_id,a.barber_id)));

-- ---------------------------------------------------------------------------
-- 3. Sinal: credenciais do gateway da barbearia (no Vault) e cobranças
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_payment_gateways(
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('asaas')),
  environment text not null default 'production' check (environment in ('sandbox','production')),
  secret_id uuid,
  webhook_token text not null default encode(extensions.gen_random_bytes(24),'hex'),
  webhook_id text,
  account_name text,
  active boolean not null default true,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(tenant_id,provider)
);
alter table public.tenant_payment_gateways enable row level security;
revoke all on public.tenant_payment_gateways from anon,authenticated;

create table if not exists public.appointment_deposits(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  appointment_id uuid not null unique,
  amount_cents integer not null check (amount_cents>0),
  status text not null default 'pending' check (status in ('pending','paid','expired','cancelled','refunded')),
  gateway text not null check (gateway in ('asaas','manual_pix')),
  external_id text,
  pix_payload text,
  pix_qr_image text,
  invoice_url text,
  expires_at timestamptz,
  paid_at timestamptz,
  late_payment boolean not null default false,
  confirmed_by uuid,
  sale_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id,appointment_id) references public.appointments(tenant_id,id) on delete cascade
);
create unique index if not exists appointment_deposits_external_uq on public.appointment_deposits(gateway,external_id) where external_id is not null;
alter table public.appointment_deposits enable row level security;
revoke all on public.appointment_deposits from anon,authenticated;
grant select(id,tenant_id,appointment_id,amount_cents,status,gateway,expires_at,paid_at,late_payment,created_at) on public.appointment_deposits to authenticated;
drop policy if exists appointment_deposits_read on public.appointment_deposits;
create policy appointment_deposits_read on public.appointment_deposits for select to authenticated
  using (exists(select 1 from public.appointments a where a.tenant_id=appointment_deposits.tenant_id and a.id=appointment_deposits.appointment_id and private.agenda(a.tenant_id,a.barber_id)));

-- Gravação/leitura da chave do gateway somente pelo servidor.
create or replace function public.server_save_payment_gateway(p_tenant uuid,p_provider text,p_api_key text,p_environment text,p_account text default null)
returns text language plpgsql security definer set search_path='' as $$
declare sid uuid; tok text;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Acesso restrito' using errcode='42501'; end if;
  if p_provider<>'asaas' or length(coalesce(p_api_key,''))<20 then raise exception 'Chave inválida'; end if;
  select secret_id into sid from public.tenant_payment_gateways where tenant_id=p_tenant and provider=p_provider;
  if sid is null then
    sid:=vault.create_secret(p_api_key,'gateway_'||p_provider||'_'||replace(p_tenant::text,'-',''),'Chave do gateway de sinal da barbearia');
  else
    perform vault.update_secret(sid,p_api_key);
  end if;
  insert into public.tenant_payment_gateways(tenant_id,provider,environment,secret_id,account_name,active,last_verified_at,updated_at)
  values(p_tenant,p_provider,coalesce(nullif(p_environment,''),'production'),sid,left(p_account,120),true,now(),now())
  on conflict(tenant_id,provider) do update set environment=excluded.environment,secret_id=excluded.secret_id,account_name=excluded.account_name,
    active=true,last_verified_at=now(),updated_at=now()
  returning webhook_token into tok;
  return tok;
end $$;

create or replace function public.server_get_payment_gateway(p_tenant uuid,p_provider text default 'asaas')
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.tenant_payment_gateways; k text;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Acesso restrito' using errcode='42501'; end if;
  select * into g from public.tenant_payment_gateways where tenant_id=p_tenant and provider=p_provider and active;
  if g.tenant_id is null then return null; end if;
  select decrypted_secret into k from vault.decrypted_secrets where id=g.secret_id;
  return jsonb_build_object('provider',g.provider,'environment',g.environment,'api_key',k,'webhook_token',g.webhook_token,'webhook_id',g.webhook_id);
end $$;
revoke all on function public.server_save_payment_gateway(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.server_get_payment_gateway(uuid,text) from public,anon,authenticated;
grant execute on function public.server_save_payment_gateway(uuid,text,text,text,text) to service_role;
grant execute on function public.server_get_payment_gateway(uuid,text) to service_role;

create or replace function public.payment_gateway_status(t uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select case when private.can(t,'settings') then coalesce((select jsonb_build_object('provider',provider,'environment',environment,
    'account_name',account_name,'active',active,'webhook_ready',webhook_id is not null,'updated_at',updated_at)
    from public.tenant_payment_gateways where tenant_id=t and provider='asaas'),'{}'::jsonb) else '{}'::jsonb end
$$;
revoke all on function public.payment_gateway_status(uuid) from public,anon;
grant execute on function public.payment_gateway_status(uuid) to authenticated;

-- Libera horários cujo sinal não foi pago no prazo.
create or replace function private.expire_deposit_holds()
returns integer language plpgsql security definer set search_path='' as $$
declare n int;
begin
  with x as (
    update public.appointments set status='cancelled',cancelled_at=now(),cancellation_reason='Sinal não pago dentro do prazo',deposit_status='expired'
    where deposit_status='pending' and hold_expires_at<now() and status in ('scheduled','present')
    returning id,tenant_id,unit_id
  ), d as (
    update public.appointment_deposits dd set status='expired',updated_at=now() from x
    where dd.appointment_id=x.id and dd.status='pending' returning dd.id
  )
  insert into public.audit_events(tenant_id,unit_id,actor_id,action,entity_id,details)
  select tenant_id,unit_id,null,'appointment.deposit_expired',id,jsonb_build_object('deposits',(select count(*) from d)) from x;
  get diagnostics n=row_count;
  return n;
end $$;

-- Confirmação do sinal (webhook do gateway ou confirmação manual).
create or replace function private.apply_deposit_payment(p_deposit uuid,p_paid_at timestamptz,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare dep public.appointment_deposits; ap public.appointments; sid uuid; names text; late boolean:=false;
begin
  select * into dep from public.appointment_deposits where id=p_deposit for update;
  if dep.id is null then raise exception 'Sinal não encontrado'; end if;
  if dep.status='paid' then return jsonb_build_object('status','paid','duplicate',true,'appointment_id',dep.appointment_id); end if;
  select * into ap from public.appointments where tenant_id=dep.tenant_id and id=dep.appointment_id for update;
  late:=ap.status='cancelled';
  select string_agg(s.name,' + ' order by s.name) into names from public.appointment_services x join public.services s on s.id=x.service_id
    where x.tenant_id=ap.tenant_id and x.appointment_id=ap.id;
  insert into public.quick_sales(tenant_id,unit_id,client_id,barber_id,description,amount_cents,method,status,paid_at,created_by,appointment_id)
  values(ap.tenant_id,ap.unit_id,ap.client_id,ap.barber_id,left('Sinal · '||coalesce(names,'Agendamento'),200),dep.amount_cents,'pix','paid',
    coalesce(p_paid_at,now()),p_actor,ap.id) returning id into sid;
  update public.appointment_deposits set status='paid',paid_at=coalesce(p_paid_at,now()),late_payment=late,confirmed_by=p_actor,sale_id=sid,updated_at=now()
    where id=dep.id;
  update public.appointments set deposit_status='paid',hold_expires_at=null where id=ap.id;
  insert into public.audit_events(tenant_id,unit_id,actor_id,action,entity_id,details)
  values(ap.tenant_id,ap.unit_id,p_actor,'appointment.deposit_paid',ap.id,jsonb_build_object('deposit_id',dep.id,'amount_cents',dep.amount_cents,'late',late));
  return jsonb_build_object('status','paid','late',late,'appointment_id',ap.id,'tenant_id',ap.tenant_id);
end $$;

create or replace function public.server_mark_deposit_paid(p_deposit uuid,p_paid_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Acesso restrito' using errcode='42501'; end if;
  return private.apply_deposit_payment(p_deposit,p_paid_at,null);
end $$;
revoke all on function public.server_mark_deposit_paid(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.server_mark_deposit_paid(uuid,timestamptz) to service_role;

create or replace function public.confirm_deposit_manually(t uuid,a uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ap public.appointments; dep uuid;
begin
  select * into ap from public.appointments where tenant_id=t and id=a;
  if ap.id is null or not private.agenda(t,ap.barber_id) then raise exception 'Sem permissão' using errcode='42501'; end if;
  if ap.deposit_status not in ('pending','expired') then raise exception 'Este agendamento não possui sinal pendente'; end if;
  select id into dep from public.appointment_deposits where tenant_id=t and appointment_id=a;
  if dep is null then
    insert into public.appointment_deposits(tenant_id,appointment_id,amount_cents,status,gateway,expires_at)
    values(t,a,greatest(ap.deposit_cents,1),'pending','manual_pix',ap.hold_expires_at) returning id into dep;
  end if;
  return private.apply_deposit_payment(dep,now(),auth.uid());
end $$;
revoke all on function public.confirm_deposit_manually(uuid,uuid) from public,anon;
grant execute on function public.confirm_deposit_manually(uuid,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Disponibilidade: reservas com sinal expirado não ocupam a agenda
-- ---------------------------------------------------------------------------
create or replace function private.available_multi(t uuid,u uuid,b uuid,service_ids uuid[],st timestamptz,ignore_id uuid default null)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare tz text; localst timestamp; mins int; dur int; en timestamptz; cnt int;
begin
 select timezone into tz from public.units where tenant_id=t and id=u and active;
 select coalesce(sum(duration),0),count(*) into dur,cnt from public.services where tenant_id=t and id=any(service_ids) and active;
 if service_ids is null or cardinality(service_ids)=0 or st is null or tz is null or dur<=0 or cnt<>cardinality(service_ids) or st<now() or st>now()+interval '180 days' or date_trunc('minute',st)<>st then return false; end if;
 if not exists(select 1 from public.tenants where id=t and status in ('trial','active','pending','overdue')) or not exists(select 1 from public.barbers br join public.memberships m on m.tenant_id=br.tenant_id and m.user_id=br.user_id where br.tenant_id=t and br.id=b and br.active and m.active) then return false; end if;
 if exists(select 1 from unnest(service_ids) x where not exists(select 1 from public.barber_services bs where bs.tenant_id=t and bs.barber_id=b and bs.service_id=x)) then return false; end if;
 if not exists(select 1 from public.barber_units where tenant_id=t and barber_id=b and unit_id=u) then return false; end if;
 localst:=st at time zone tz; mins:=extract(hour from localst)::int*60+extract(minute from localst)::int; en:=st+make_interval(mins=>dur);
 return exists(select 1 from public.weekly_windows where tenant_id=t and barber_id=b and unit_id=u and weekday=extract(dow from localst)::int and mins>=start_min and mins+dur<=end_min and (mins-start_min)%step_min=0)
 and not exists(select 1 from public.schedule_exceptions where tenant_id=t and barber_id=b and starts_at<en and ends_at>st)
 and not exists(select 1 from public.appointments where tenant_id=t and barber_id=b and status in ('scheduled','present','in_service','completed','no_show')
   and not (deposit_status='pending' and hold_expires_at<=now())
   and starts_at<en and ends_at>st and (ignore_id is null or id<>ignore_id));
end $$;

-- ---------------------------------------------------------------------------
-- 5. Página pública: dados, "qualquer profissional", dias com horários e sinal
-- ---------------------------------------------------------------------------
create or replace function private.public_tenant(p_slug text)
returns uuid language sql stable security definer set search_path='' as $$
  select tn.id from public.tenants tn join public.plans p on p.id=tn.plan_id
  where tn.slug=lower(trim(p_slug)) and tn.status in ('trial','active','pending','overdue') and tn.public_site_enabled
    and lower(p.name)<>'starter' and coalesce((p.features->>'public_booking')::boolean,true)
$$;

create or replace function public.public_booking_data(p_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.tenants; mb int; mu int; pn text; result jsonb; cfg public.tenant_automation_settings; deposits boolean;
begin
 select * into t from public.tenants where slug=lower(trim(p_slug));
 if t.id is null then return jsonb_build_object('state','not_found'); end if;
 select p.name,coalesce(p.max_barbers,3),coalesce(p.max_units,1),coalesce((p.features->>'deposits')::boolean,false) into pn,mb,mu,deposits from public.plans p where p.id=t.plan_id;
 if lower(coalesce(pn,''))='starter' then return jsonb_build_object('state','plan_unavailable','name',t.name); end if;
 if t.status not in ('trial','active','pending','overdue') or not t.public_site_enabled then return jsonb_build_object('state','unavailable','name',t.name); end if;
 mb:=coalesce(mb,3); mu:=coalesce(mu,1);
 select * into cfg from public.tenant_automation_settings where tenant_id=t.id;
 select jsonb_build_object('state','open',
 'tenant',jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug,'logo_url',t.logo_url,'cover_url',t.cover_url,'description',t.description,'phone',t.phone,'whatsapp',t.whatsapp,'address',t.address,'instagram',t.instagram,'public_info',t.public_info),
 'units',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (select u.id,u.name,u.timezone from public.units u where u.tenant_id=t.id and u.active order by u.name limit mu) x),'[]'::jsonb),
 'services',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (select s.id,s.name,s.description,s.duration,s.price_cents from public.services s where s.tenant_id=t.id and s.active order by s.name) x),'[]'::jsonb),
 'barbers',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (select b.id,b.name,b.photo_url from public.barbers b join public.memberships m on m.tenant_id=b.tenant_id and m.user_id=b.user_id where b.tenant_id=t.id and b.active and m.active order by b.name limit mb) x),'[]'::jsonb),
 'barber_units',coalesce((select jsonb_agg(jsonb_build_object('barber_id',bu.barber_id,'unit_id',bu.unit_id)) from public.barber_units bu where bu.tenant_id=t.id),'[]'::jsonb),
 'barber_services',coalesce((select jsonb_agg(jsonb_build_object('barber_id',bs.barber_id,'service_id',bs.service_id)) from public.barber_services bs where bs.tenant_id=t.id),'[]'::jsonb),
 'deposit',case when deposits and cfg.tenant_id is not null and cfg.deposit_mode<>'none' then
   jsonb_build_object('mode',cfg.deposit_mode,'fixed_cents',cfg.deposit_fixed_cents,'percent',cfg.deposit_percent,'timeout_minutes',cfg.deposit_timeout_minutes)
   else null end) into result;
 return result;
end $$;

create or replace function public.public_available_slots_any(p_slug text,p_unit uuid,p_services uuid[],p_date date)
returns table(starts_at timestamptz,barber_id uuid,barber_name text)
language plpgsql stable security definer set search_path='' as $$
declare t uuid:=private.public_tenant(p_slug);
begin
 if t is null or p_date is null or p_date<current_date or p_date>current_date+90 or coalesce(cardinality(p_services),0)=0 then return; end if;
 return query
 select x.st,b.id,b.name
 from public.barbers b
 join public.memberships m on m.tenant_id=b.tenant_id and m.user_id=b.user_id and m.active
 cross join lateral (
   select distinct ((p_date::timestamp+make_interval(mins=>g.m)) at time zone u.timezone) as st
   from public.weekly_windows w
   join public.units u on u.tenant_id=w.tenant_id and u.id=w.unit_id and u.active
   cross join lateral generate_series(w.start_min,w.end_min-1,w.step_min) g(m)
   where w.tenant_id=t and w.unit_id=p_unit and w.barber_id=b.id and w.weekday=extract(dow from p_date)::int
 ) x
 where b.tenant_id=t and b.active and private.available_multi(t,p_unit,b.id,p_services,x.st,null)
 order by x.st,b.name;
end $$;

create or replace function public.public_available_days(p_slug text,p_unit uuid,p_barber uuid,p_services uuid[],p_from date,p_days integer default 21)
returns table(day date,slots integer)
language plpgsql stable security definer set search_path='' as $$
declare t uuid:=private.public_tenant(p_slug); d date; n int; lim int:=least(greatest(coalesce(p_days,21),1),45);
begin
 if t is null or coalesce(cardinality(p_services),0)=0 then return; end if;
 for i in 0..lim-1 loop
   d:=greatest(coalesce(p_from,current_date),current_date)+i;
   exit when d>current_date+90;
   if p_barber is null then
     select count(distinct s.starts_at) into n from public.public_available_slots_any(p_slug,p_unit,p_services,d) s;
   else
     select count(*) into n from public.public_available_slots_multi(p_slug,p_unit,p_barber,p_services,d) s;
   end if;
   day:=d; slots:=n; return next;
 end loop;
end $$;

revoke all on function public.public_available_slots_any(text,uuid,uuid[],date) from public;
revoke all on function public.public_available_days(text,uuid,uuid,uuid[],date,integer) from public;
grant execute on function public.public_available_slots_any(text,uuid,uuid[],date) to anon,authenticated,service_role;
grant execute on function public.public_available_days(text,uuid,uuid,uuid[],date,integer) to anon,authenticated,service_role;

create or replace function public.public_book_multi(p_slug text,p_unit uuid,p_barber uuid,p_services uuid[],p_starts_at timestamptz,p_name text,p_phone text,p_email text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tenants; c uuid; a uuid; un public.units; br public.barbers; normalized text; total int; dur int; first_service uuid; names text;
  cfg public.tenant_automation_settings; dep int:=0; hold timestamptz;
begin
 perform private.expire_deposit_holds();
 select tn.* into t
 from public.tenants tn
 join public.plans p on p.id=tn.plan_id
 where tn.slug=lower(trim(p_slug))
   and tn.status in ('trial','active','pending','overdue')
   and tn.public_site_enabled
   and lower(p.name) <> 'starter'
   and coalesce((p.features->>'public_booking')::boolean,true);
 if t.id is null then raise exception 'Agendamento indisponível para este plano'; end if;
 if cardinality(p_services)=0 then raise exception 'Escolha pelo menos um serviço'; end if;
 if length(trim(p_name))<2 or length(trim(p_phone))<8 then raise exception 'Informe nome e telefone válidos'; end if;
 select coalesce(sum(price_cents),0),coalesce(sum(duration),0),string_agg(name,', ' order by name) into total,dur,names from public.services where tenant_id=t.id and id=any(p_services) and active;
 select id into first_service from public.services where tenant_id=t.id and id=any(p_services) and active order by name,id limit 1;
 if (select count(*) from public.services where tenant_id=t.id and id=any(p_services) and active)<>cardinality(p_services) then raise exception 'Serviço inválido'; end if;
 normalized:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 if length(normalized) not between 10 and 15 or length(trim(coalesce(p_name,''))) not between 2 and 120 then raise exception 'Informe nome e telefone válidos'; end if;
 select * into un from public.units where id=p_unit and tenant_id=t.id and active;
 select * into br from public.barbers where id=p_barber and tenant_id=t.id and active for update;
 if un.id is null or br.id is null then raise exception 'Unidade ou profissional inválido'; end if;
 if not private.available_multi(t.id,p_unit,p_barber,p_services,p_starts_at,null) then raise exception 'Este horário acabou de ficar indisponível. Escolha outro.'; end if;
 select id into c from public.clients where tenant_id=t.id and regexp_replace(coalesce(nullif(phone,''),whatsapp),'[^0-9]','','g')=normalized order by created_at limit 1;
 if c is null then insert into public.clients(tenant_id,name,phone,whatsapp,email) values(t.id,trim(p_name),p_phone,p_phone,coalesce(p_email,'')) returning id into c; end if;
 insert into public.appointments(tenant_id,unit_id,barber_id,client_id,service_id,starts_at,ends_at,status,price_cents,commission_bps,created_by,source)
 values(t.id,p_unit,p_barber,c,first_service,p_starts_at,p_starts_at+make_interval(mins=>dur),'scheduled',total,0,null,'public') returning id into a;
 insert into public.appointment_services(tenant_id,appointment_id,service_id,price_cents,duration)
 select t.id,a,id,price_cents,duration from public.services where tenant_id=t.id and id=any(p_services);
 select * into cfg from public.tenant_automation_settings where tenant_id=t.id;
 if cfg.tenant_id is not null and cfg.deposit_mode<>'none' and private.plan_feature(t.id,'deposits') then
   dep:=case when cfg.deposit_mode='fixed' then cfg.deposit_fixed_cents else round(total*cfg.deposit_percent/100.0)::int end;
   dep:=least(greatest(dep,0),total);
   if dep>0 then
     hold:=now()+make_interval(mins=>cfg.deposit_timeout_minutes);
     update public.appointments set deposit_status='pending',deposit_cents=dep,hold_expires_at=hold where id=a;
   end if;
 end if;
 insert into public.audit_events(tenant_id,unit_id,actor_id,action,entity_id,details) values(t.id,p_unit,null,'appointment.public_created',a,jsonb_build_object('barber_id',p_barber,'client_id',c,'services',p_services,'deposit_cents',dep));
 return jsonb_build_object('id',a,'barbershop',t.name,'unit',un.name,'service',names,'barber',br.name,'starts_at',p_starts_at,'price_cents',total,'duration',dur,
   'phone',t.phone,'whatsapp',t.whatsapp,'deposit_required',dep>0,'deposit_cents',dep,'hold_expires_at',hold,'client_id',c);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Checkout e comanda descontam o sinal já pago (sem receita em dobro)
-- ---------------------------------------------------------------------------
create or replace function public.checkout_appointment(t uuid,a uuid,m text,p_pix_payload text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare ap public.appointments; pay uuid; st text; usr uuid:=auth.uid(); paid_deposit int:=0; amount int;
begin
 if not private.member(t) then raise exception 'Sem permissão para finalizar atendimento' using errcode='42501'; end if;
 if m not in ('pix','cash','credit','debit','account') then raise exception 'Forma de pagamento inválida'; end if;
 select * into ap from public.appointments where id=a and tenant_id=t;
 if ap.id is null or not private.agenda(t,ap.barber_id) then raise exception 'Sem permissão' using errcode='42501'; end if;
 perform 1 from public.barbers where tenant_id=t and id=ap.barber_id for update;
 select * into ap from public.appointments where id=a and tenant_id=t for update;
 if ap.id is null then raise exception 'Atendimento não encontrado'; end if;
 if ap.status not in ('scheduled','present','in_service','completed') then raise exception 'Atendimento cancelado não pode ser finalizado'; end if;
 if exists(select 1 from public.appointment_payments where appointment_id=a and status<>'cancelled') then raise exception 'Este atendimento já foi finalizado'; end if;
 select coalesce(sum(amount_cents),0) into paid_deposit from public.appointment_deposits where tenant_id=t and appointment_id=a and status='paid';
 amount:=greatest(0,ap.price_cents-paid_deposit);
 st:=case when m='account' and amount>0 then 'open' else 'paid' end;
 insert into public.appointment_payments(tenant_id,unit_id,appointment_id,client_id,barber_id,service_id,method,amount_cents,status,pix_payload,paid_at,created_by)
 values(t,ap.unit_id,a,ap.client_id,ap.barber_id,ap.service_id,m,amount,st,case when m='pix' then coalesce(p_pix_payload,'') else '' end,case when st='paid' then now() else null end,usr) returning id into pay;
 update public.appointments set status='completed' where id=a and tenant_id=t;
 perform private.log(t,ap.unit_id,'appointment.checked_out',a,jsonb_build_object('payment_id',pay,'method',m,'amount_cents',amount,'deposit_cents',paid_deposit,'payment_status',st));
 return jsonb_build_object('payment_id',pay,'status',st,'amount_cents',amount,'deposit_cents',paid_deposit);
end $$;

create or replace function public.order_open(t uuid,u uuid,b uuid,c uuid,a uuid,r uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare o public.order_tabs;ap public.appointments;i uuid;paid_deposit int:=0;
begin
 if not private.order_access(t,b) then raise exception 'Sem permissão para esta comanda' using errcode='42501';end if;
 if r is null then raise exception 'Identificador obrigatório';end if;
 perform 1 from public.barbers where tenant_id=t and id=b and active for update;if not found then raise exception 'Profissional indisponível';end if;
 select * into o from public.order_tabs where tenant_id=t and request_key=r;
 if found then if o.unit_id<>u or o.barber_id<>b or o.client_id<>c or o.appointment_id is distinct from a then raise exception 'Identificador já utilizado';end if;return o.id;end if;
 if not exists(select 1 from public.units where tenant_id=t and id=u and active) then raise exception 'Unidade inválida';end if;
 if a is not null then
 select * into ap from public.appointments where tenant_id=t and id=a for update;
 if not found or ap.unit_id<>u or ap.barber_id<>b or ap.client_id<>c or ap.status not in ('scheduled','present','in_service') then raise exception 'Agendamento indisponível para comanda';end if;
 if exists(select 1 from public.appointment_payments where tenant_id=t and appointment_id=a) then raise exception 'Este atendimento já possui pagamento registrado';end if;
 select id into i from public.order_tabs where tenant_id=t and appointment_id=a and status<>'cancelled';if found then return i;end if;
 select coalesce(sum(amount_cents),0) into paid_deposit from public.appointment_deposits where tenant_id=t and appointment_id=a and status='paid';
 end if;
 insert into public.order_tabs(tenant_id,unit_id,barber_id,client_id,appointment_id,request_key,created_by) values(t,u,b,c,a,r,auth.uid()) returning id into i;
 if a is not null and ap.price_cents-paid_deposit>0 then
 insert into public.order_items(tenant_id,order_id,kind,reference_id,name,quantity,unit_price_cents,commission_bps,request_key)
 values(t,i,'appointment',a,case when paid_deposit>0 then 'Atendimento agendado (sinal descontado)' else 'Atendimento agendado' end,1,ap.price_cents-paid_deposit,ap.commission_bps,gen_random_uuid());
 end if;
 perform private.log(t,u,'order.opened',i,jsonb_build_object('appointment_id',a,'deposit_cents',paid_deposit));return i;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Fila de confirmações e lembretes (lida pelo servidor)
-- ---------------------------------------------------------------------------
create or replace function public.automation_due_notifications(p_limit integer default 40)
returns table(kind text,appointment_id uuid,tenant_id uuid,tenant_name text,tenant_slug text,tenant_address text,starts_at timestamptz,
  timezone text,client_name text,client_phone text,services text,barber_name text,unit_name text,price_cents integer,template text)
language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Acesso restrito' using errcode='42501'; end if;
 return query
 with cfg as (
   select tn.id,tn.name,tn.slug,tn.address,
     coalesce(s.confirmation_enabled,true) ce,coalesce(s.confirmation_hours,24) ch,
     coalesce(s.reminder_enabled,true) re,coalesce(s.reminder_hours,2) rh,
     coalesce(s.confirmation_message,'') cm,coalesce(s.reminder_message,'') rm
   from public.tenants tn join public.plans p on p.id=tn.plan_id
   left join public.tenant_automation_settings s on s.tenant_id=tn.id
   where tn.status in ('trial','active','pending','overdue') and coalesce((p.features->>'automations')::boolean,false)
 ), base as (
   select a.*,cfg.name tname,cfg.slug tslug,cfg.address taddr,cfg.ce,cfg.ch,cfg.re,cfg.rh,cfg.cm,cfg.rm
   from public.appointments a join cfg on cfg.id=a.tenant_id
   where a.status='scheduled' and a.deposit_status<>'pending' and a.starts_at>now() and a.starts_at<now()+interval '8 days'
 ), due as (
   select 'confirmation'::text k,b.* from base b
   where b.ce and b.client_confirmed_at is null
     and b.starts_at<=now()+make_interval(hours=>b.ch) and b.starts_at>now()+make_interval(hours=>b.rh)
     and b.created_at<now()-interval '2 hours'
   union all
   select 'reminder'::text,b.* from base b
   where b.re and b.starts_at<=now()+make_interval(hours=>b.rh) and b.starts_at>now()+interval '10 minutes'
     and b.created_at<now()-interval '30 minutes'
 )
 select d.k,d.id,d.tenant_id,d.tname,d.tslug,d.taddr,d.starts_at,coalesce(u.timezone,'America/Sao_Paulo'),c.name,
   coalesce(nullif(c.whatsapp,''),c.phone),
   coalesce((select string_agg(s.name,' + ' order by s.name) from public.appointment_services x join public.services s on s.id=x.service_id where x.tenant_id=d.tenant_id and x.appointment_id=d.id),
     (select s.name from public.services s where s.id=d.service_id)),
   br.name,u.name,d.price_cents,case when d.k='confirmation' then d.cm else d.rm end
 from due d
 join public.clients c on c.tenant_id=d.tenant_id and c.id=d.client_id
 left join public.barbers br on br.tenant_id=d.tenant_id and br.id=d.barber_id
 left join public.units u on u.tenant_id=d.tenant_id and u.id=d.unit_id
 where not exists(select 1 from public.appointment_notifications n where n.appointment_id=d.id and n.kind=d.k)
   and length(regexp_replace(coalesce(nullif(c.whatsapp,''),c.phone,''),'[^0-9]','','g'))>=10
 order by d.starts_at
 limit least(greatest(coalesce(p_limit,40),1),200);
end $$;
revoke all on function public.automation_due_notifications(integer) from public,anon,authenticated;
grant execute on function public.automation_due_notifications(integer) to service_role;

-- Ações do cliente pelo WhatsApp (somente servidor).
create or replace function public.server_client_appointment_action(p_tenant uuid,p_appointment uuid,p_action text,p_phone text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ap public.appointments;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Acesso restrito' using errcode='42501'; end if;
 select * into ap from public.appointments where tenant_id=p_tenant and id=p_appointment for update;
 if ap.id is null then raise exception 'Agendamento não encontrado'; end if;
 if p_action='confirm' then
   if ap.status not in ('scheduled','present') then raise exception 'Este agendamento não está mais ativo'; end if;
   update public.appointments set client_confirmed_at=coalesce(client_confirmed_at,now()) where id=ap.id;
   update public.appointment_notifications set response='confirmed',responded_at=now(),updated_at=now()
     where appointment_id=ap.id and kind='confirmation' and response is null;
 elsif p_action='cancel' then
   if ap.status not in ('scheduled','present') then raise exception 'Este agendamento não pode mais ser cancelado'; end if;
   update public.appointments set status='cancelled',cancelled_at=now(),cancellation_reason='Cancelado pelo cliente via WhatsApp' where id=ap.id;
   update public.appointment_notifications set response='cancelled',responded_at=now(),updated_at=now()
     where appointment_id=ap.id and kind in ('confirmation','reminder') and response is null;
 elsif p_action='reschedule_requested' then
   update public.appointment_notifications set response='reschedule_requested',responded_at=now(),updated_at=now()
     where appointment_id=ap.id and kind='confirmation' and response is null;
 elsif p_action='rescheduled' then
   update public.appointment_notifications set response='rescheduled',responded_at=now(),updated_at=now()
     where appointment_id=ap.id and kind='confirmation';
   update public.appointments set client_confirmed_at=now() where id=ap.id;
 else raise exception 'Ação inválida'; end if;
 insert into public.audit_events(tenant_id,unit_id,actor_id,action,entity_id,details)
 values(ap.tenant_id,ap.unit_id,null,'appointment.client_'||p_action,ap.id,jsonb_build_object('channel','whatsapp','phone_suffix',right(coalesce(p_phone,''),4)));
 return jsonb_build_object('ok',true,'action',p_action);
end $$;
revoke all on function public.server_client_appointment_action(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.server_client_appointment_action(uuid,uuid,text,text) to service_role;

revoke all on function private.expire_deposit_holds() from public;
revoke all on function private.apply_deposit_payment(uuid,timestamptz,uuid) from public;
