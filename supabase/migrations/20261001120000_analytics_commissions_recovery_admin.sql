-- BarberTix · Prioridades 3 e 4
-- Dashboard financeiro com dados reais, comissão por profissional/serviço/produto,
-- recuperação de clientes com campanhas e atribuição de receita, painel mestre.

-- ---------------------------------------------------------------------------
-- 1. Recuperação de clientes e campanhas
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_campaigns(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null default 'recovery' check (kind in ('recovery','custom')),
  name text not null check (length(name) between 1 and 120),
  message text not null check (length(message) between 5 and 1000),
  status text not null default 'sending' check (status in ('sending','sent','cancelled')),
  recipients_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists marketing_campaigns_tenant_idx on public.marketing_campaigns(tenant_id,created_at desc);

create table if not exists public.campaign_recipients(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  client_id uuid not null,
  name text not null default '',
  phone text not null,
  token text not null unique default encode(extensions.gen_random_bytes(9),'hex'),
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','skipped')),
  error text,
  attempts integer not null default 0,
  sent_at timestamptz,
  clicked_at timestamptz,
  converted_appointment_id uuid,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(campaign_id,client_id),
  foreign key (tenant_id,client_id) references public.clients(tenant_id,id) on delete cascade
);
create index if not exists campaign_recipients_client_idx on public.campaign_recipients(tenant_id,client_id,sent_at desc);
create index if not exists campaign_recipients_pending_idx on public.campaign_recipients(campaign_id) where status in ('pending','failed');

alter table public.marketing_campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
revoke all on public.marketing_campaigns from anon,authenticated;
revoke all on public.campaign_recipients from anon,authenticated;
grant select on public.marketing_campaigns to authenticated;
grant select(id,tenant_id,campaign_id,client_id,name,status,error,sent_at,clicked_at,converted_appointment_id,converted_at,created_at) on public.campaign_recipients to authenticated;
drop policy if exists marketing_campaigns_read on public.marketing_campaigns;
create policy marketing_campaigns_read on public.marketing_campaigns for select to authenticated using (private.can(tenant_id,'clients'));
drop policy if exists campaign_recipients_read on public.campaign_recipients;
create policy campaign_recipients_read on public.campaign_recipients for select to authenticated using (private.can(tenant_id,'clients'));

-- Atribui automaticamente o novo agendamento à última campanha recebida (30 dias).
create or replace function private.attribute_campaign()
returns trigger language plpgsql security definer set search_path='' as $$
declare r uuid;
begin
  if new.campaign_recipient_id is null and new.client_id is not null then
    select id into r from public.campaign_recipients
    where tenant_id=new.tenant_id and client_id=new.client_id and status='sent' and converted_appointment_id is null
      and sent_at>now()-interval '30 days'
    order by sent_at desc limit 1 for update skip locked;
    if r is not null then
      new.campaign_recipient_id:=r;
      update public.campaign_recipients set converted_appointment_id=new.id,converted_at=now() where id=r;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists appointments_attribute_campaign on public.appointments;
create trigger appointments_attribute_campaign before insert on public.appointments
  for each row execute function private.attribute_campaign();

-- Receita efetivamente recebida de um agendamento (pagamento, comanda e sinal).
create or replace function private.appointment_revenue(t uuid,a uuid)
returns bigint language sql stable security definer set search_path='' as $$
  select coalesce((select sum(amount_cents) from public.appointment_payments where tenant_id=t and appointment_id=a and status='paid'),0)
    +coalesce((select sum(q.amount_cents) from public.quick_sales q where q.tenant_id=t and q.status='paid'
       and (q.appointment_id=a or q.order_id in (select o.id from public.order_tabs o where o.tenant_id=t and o.appointment_id=a and o.status='closed'))),0)
$$;

create or replace function private.recovered_stats(t uuid,st timestamptz,en timestamptz)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'clients',count(distinct a.client_id),
    'appointments',count(*),
    'revenue_cents',coalesce(sum(private.appointment_revenue(t,a.id)),0))
  from public.appointments a
  where a.tenant_id=t and a.campaign_recipient_id is not null and a.status='completed' and a.starts_at>=st and a.starts_at<en
$$;

create or replace function public.recovery_candidates(t uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare factor numeric:=1.5; minv int:=2; result jsonb;
begin
  if not private.can(t,'clients') then raise exception 'Sem permissão para clientes' using errcode='42501'; end if;
  select coalesce(recovery_factor,1.5),coalesce(recovery_min_visits,2) into factor,minv from public.tenant_automation_settings where tenant_id=t;
  factor:=coalesce(factor,1.5); minv:=coalesce(minv,2);
  with visits as (
    select a.id,a.client_id,a.starts_at,a.barber_id,a.service_id from public.appointments a where a.tenant_id=t and a.status='completed'
  ), agg as (
    select client_id,count(*) n,min(starts_at) first_at,max(starts_at) last_at from visits group by client_id having count(*)>=minv
  ), cand as (
    select g.*,(extract(epoch from (g.last_at-g.first_at))/86400.0)/(g.n-1) avg_days,extract(epoch from (now()-g.last_at))/86400.0 since_days from agg g
  )
  select coalesce(jsonb_agg(row_to_json(x) order by x.overdue_ratio desc),'[]'::jsonb) into result from (
    select c.client_id,cl.name,coalesce(nullif(cl.whatsapp,''),cl.phone) whatsapp,c.last_at last_visit,c.n visits,
      round(c.avg_days)::int avg_days,floor(c.since_days)::int days_since,round((c.since_days/greatest(c.avg_days,1))::numeric,2) overdue_ratio,
      (select br.name from visits v join public.barbers br on br.tenant_id=t and br.id=v.barber_id where v.client_id=c.client_id
        group by br.name order by count(*) desc,max(v.starts_at) desc limit 1) usual_barber,
      (select coalesce((select string_agg(s.name,' + ' order by s.name) from public.appointment_services x join public.services s on s.id=x.service_id where x.tenant_id=t and x.appointment_id=v.id),
        (select s.name from public.services s where s.id=v.service_id)) from visits v where v.client_id=c.client_id order by v.starts_at desc limit 1) last_service,
      (select max(r.sent_at) from public.campaign_recipients r where r.tenant_id=t and r.client_id=c.client_id and r.status='sent') last_contacted_at
    from cand c join public.clients cl on cl.tenant_id=t and cl.id=c.client_id
    where c.avg_days>=3 and c.since_days>greatest(c.avg_days*factor,c.avg_days+5)
      and not exists(select 1 from public.appointments f where f.tenant_id=t and f.client_id=c.client_id and f.status in ('scheduled','present','in_service') and f.starts_at>now())
      and length(regexp_replace(coalesce(nullif(cl.whatsapp,''),cl.phone,''),'[^0-9]','','g'))>=10
    order by c.since_days/greatest(c.avg_days,1) desc
    limit 500
  ) x;
  return result;
end $$;
revoke all on function public.recovery_candidates(uuid) from public,anon;
grant execute on function public.recovery_candidates(uuid) to authenticated;

create or replace function public.create_campaign(t uuid,p_name text,p_message text,p_clients uuid[],p_kind text default 'recovery')
returns jsonb language plpgsql security definer set search_path='' as $$
declare c uuid; n int; today_count int;
begin
  if not private.can(t,'clients') then raise exception 'Sem permissão para enviar mensagens a clientes' using errcode='42501'; end if;
  if not private.plan_feature(t,'marketing') then raise exception 'Campanhas pelo WhatsApp estão disponíveis a partir do plano Pro'; end if;
  if coalesce(cardinality(p_clients),0)=0 then raise exception 'Selecione pelo menos um cliente'; end if;
  if cardinality(p_clients)>300 then raise exception 'Envie no máximo 300 clientes por campanha'; end if;
  if length(trim(coalesce(p_message,''))) not between 5 and 1000 then raise exception 'A mensagem deve ter entre 5 e 1000 caracteres'; end if;
  select count(*) into today_count from public.campaign_recipients where tenant_id=t and created_at>now()-interval '24 hours';
  if today_count+cardinality(p_clients)>600 then raise exception 'Limite diário de 600 mensagens de campanha atingido. Tente amanhã.'; end if;
  insert into public.marketing_campaigns(tenant_id,kind,name,message,created_by)
  values(t,case when p_kind='custom' then 'custom' else 'recovery' end,left(coalesce(nullif(trim(p_name),''),'Campanha '||to_char(now() at time zone 'America/Sao_Paulo','DD/MM HH24:MI')),120),trim(p_message),auth.uid())
  returning id into c;
  insert into public.campaign_recipients(tenant_id,campaign_id,client_id,name,phone)
  select t,c,cl.id,cl.name,regexp_replace(coalesce(nullif(cl.whatsapp,''),cl.phone),'[^0-9]','','g')
  from public.clients cl where cl.tenant_id=t and cl.id=any(p_clients)
    and length(regexp_replace(coalesce(nullif(cl.whatsapp,''),cl.phone,''),'[^0-9]','','g'))>=10
  on conflict do nothing;
  get diagnostics n=row_count;
  if n=0 then raise exception 'Nenhum cliente selecionado possui WhatsApp válido'; end if;
  update public.marketing_campaigns set recipients_count=n where id=c;
  perform private.log(t,null,'campaign.created',c,jsonb_build_object('recipients',n));
  return jsonb_build_object('campaign_id',c,'recipients',n);
end $$;
revoke all on function public.create_campaign(uuid,text,text,uuid[],text) from public,anon;
grant execute on function public.create_campaign(uuid,text,text,uuid[],text) to authenticated;

create or replace function public.server_campaign_claim(p_campaign uuid,p_limit integer default 8)
returns table(recipient_id uuid,tenant_id uuid,client_name text,phone text,token text,message text,tenant_name text,tenant_slug text,
  days_since integer,usual_barber text)
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Acesso restrito' using errcode='42501'; end if;
  return query
  with picked as (
    select r.id from public.campaign_recipients r join public.marketing_campaigns c on c.id=r.campaign_id
    where r.campaign_id=p_campaign and c.status='sending'
      and (r.status='pending' or (r.status='sending' and r.attempts<2 and r.created_at<now()-interval '10 minutes'))
    order by r.created_at,r.id
    limit least(greatest(coalesce(p_limit,8),1),25)
    for update of r skip locked
  ), upd as (
    update public.campaign_recipients r set status='sending',attempts=r.attempts+1 from picked where r.id=picked.id
    returning r.id,r.tenant_id,r.client_id,r.name,r.phone,r.token,r.campaign_id
  )
  select u.id,u.tenant_id,u.name,u.phone,u.token,c.message,tn.name,tn.slug,
    (select floor(extract(epoch from now()-max(a.starts_at))/86400)::int from public.appointments a where a.tenant_id=u.tenant_id and a.client_id=u.client_id and a.status='completed'),
    (select br.name from public.appointments a join public.barbers br on br.tenant_id=a.tenant_id and br.id=a.barber_id
       where a.tenant_id=u.tenant_id and a.client_id=u.client_id and a.status='completed' group by br.name order by count(*) desc limit 1)
  from upd u join public.marketing_campaigns c on c.id=u.campaign_id join public.tenants tn on tn.id=u.tenant_id;
end $$;

create or replace function public.server_campaign_result(p_recipient uuid,p_ok boolean,p_error text default null)
returns void language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Acesso restrito' using errcode='42501'; end if;
  update public.campaign_recipients set status=case when p_ok then 'sent' else 'failed' end,sent_at=case when p_ok then now() else sent_at end,
    error=case when p_ok then null else left(p_error,300) end
  where id=p_recipient returning campaign_id into cid;
  update public.marketing_campaigns c set
    sent_count=(select count(*) from public.campaign_recipients r where r.campaign_id=c.id and r.status='sent'),
    failed_count=(select count(*) from public.campaign_recipients r where r.campaign_id=c.id and r.status='failed'),
    status=case when exists(select 1 from public.campaign_recipients r where r.campaign_id=c.id and r.status in ('pending','sending')) then c.status else 'sent' end,
    finished_at=case when exists(select 1 from public.campaign_recipients r where r.campaign_id=c.id and r.status in ('pending','sending')) then null else now() end
  where c.id=cid;
end $$;
revoke all on function public.server_campaign_claim(uuid,integer) from public,anon,authenticated;
revoke all on function public.server_campaign_result(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.server_campaign_claim(uuid,integer) to service_role;
grant execute on function public.server_campaign_result(uuid,boolean,text) to service_role;

create or replace function public.public_campaign_click(p_token text)
returns void language sql security definer set search_path='' as $$
  update public.campaign_recipients set clicked_at=coalesce(clicked_at,now()) where token=left(coalesce(p_token,''),40)
$$;
revoke all on function public.public_campaign_click(text) from public;
grant execute on function public.public_campaign_click(text) to anon,authenticated;

create or replace function public.marketing_summary(t uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tz text:='America/Sao_Paulo'; m_start timestamptz; m_end timestamptz;
begin
  if not private.can(t,'clients') then raise exception 'Sem permissão' using errcode='42501'; end if;
  m_start:=date_trunc('month',(now() at time zone tz))::timestamp at time zone tz;
  m_end:=(date_trunc('month',(now() at time zone tz))+interval '1 month')::timestamp at time zone tz;
  return jsonb_build_object(
    'month',private.recovered_stats(t,m_start,m_end),
    'all_time',private.recovered_stats(t,'-infinity'::timestamptz,'infinity'::timestamptz),
    'campaigns',coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select c.id,c.name,c.kind,c.status,c.created_at,c.recipients_count,c.sent_count,c.failed_count,
        (select count(*) from public.campaign_recipients r where r.campaign_id=c.id and r.clicked_at is not null) clicked,
        (select count(*) from public.campaign_recipients r where r.campaign_id=c.id and r.converted_appointment_id is not null) converted,
        (select coalesce(sum(private.appointment_revenue(t,a.id)),0) from public.appointments a
           join public.campaign_recipients r on r.converted_appointment_id=a.id where r.campaign_id=c.id and a.status='completed') revenue_cents
      from public.marketing_campaigns c where c.tenant_id=t order by c.created_at desc limit 30) x),'[]'::jsonb));
end $$;
revoke all on function public.marketing_summary(uuid) from public,anon;
grant execute on function public.marketing_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Dashboard financeiro (dados reais)
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_overview(t uuid,p_unit uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tz text; today date; d_start timestamptz; d_end timestamptz; m_start timestamptz; m_end timestamptz; since timestamptz;
  result jsonb; slot_total int; slot_busy int;
begin
  if not (private.can(t,'reports') or private.can(t,'finance')) then raise exception 'Sem permissão para indicadores' using errcode='42501'; end if;
  if p_unit is not null and not exists(select 1 from public.units where tenant_id=t and id=p_unit) then raise exception 'Unidade inválida'; end if;
  select coalesce((select timezone from public.units where tenant_id=t and active and (p_unit is null or id=p_unit) order by name limit 1),'America/Sao_Paulo') into tz;
  today:=(now() at time zone tz)::date;
  d_start:=today::timestamp at time zone tz; d_end:=(today+1)::timestamp at time zone tz;
  m_start:=date_trunc('month',today::timestamp) at time zone tz; m_end:=(date_trunc('month',today::timestamp)+interval '1 month') at time zone tz;
  since:=least(m_start,(today-29)::timestamp at time zone tz);

  -- Capacidade de hoje em blocos da agenda (step) de cada profissional ativo.
  with slots as (
    select w.barber_id,((today::timestamp+make_interval(mins=>g.m)) at time zone u.timezone) st,w.step_min
    from public.weekly_windows w
    join public.units u on u.tenant_id=w.tenant_id and u.id=w.unit_id and u.active
    join public.barbers b on b.tenant_id=w.tenant_id and b.id=w.barber_id and b.active
    cross join lateral generate_series(w.start_min,w.end_min-w.step_min,w.step_min) g(m)
    where w.tenant_id=t and w.weekday=extract(dow from today)::int and (p_unit is null or w.unit_id=p_unit)
  )
  select count(*),count(*) filter (where exists(select 1 from public.appointments a where a.tenant_id=t and a.barber_id=s.barber_id
      and a.status in ('scheduled','present','in_service','completed','no_show') and not (a.deposit_status='pending' and a.hold_expires_at<=now())
      and a.starts_at<s.st+make_interval(mins=>s.step_min) and a.ends_at>s.st)
    or exists(select 1 from public.schedule_exceptions e where e.tenant_id=t and e.barber_id=s.barber_id and e.starts_at<s.st+make_interval(mins=>s.step_min) and e.ends_at>s.st))
  into slot_total,slot_busy from slots s;

  with rec as (
    select q.amount_cents::bigint amount,q.paid_at,q.barber_id,q.unit_id,(q.order_id is null and q.appointment_id is null) standalone
    from public.quick_sales q where q.tenant_id=t and q.status='paid' and q.paid_at>=since and (p_unit is null or q.unit_id=p_unit)
    union all
    select p.amount_cents::bigint,p.paid_at,p.barber_id,p.unit_id,false
    from public.appointment_payments p where p.tenant_id=t and p.status='paid' and p.paid_at>=since and (p_unit is null or p.unit_id=p_unit)
  ), sc as (
    select count(*)::int n from (
      select 1 from public.appointments a where a.tenant_id=t and a.status='completed' and a.starts_at>=m_start and a.starts_at<m_end and (p_unit is null or a.unit_id=p_unit)
      union all
      select 1 from rec r where r.standalone and r.paid_at>=m_start and r.paid_at<m_end
      union all
      select 1 from public.order_tabs o where o.tenant_id=t and o.status='closed' and o.appointment_id is null and o.closed_at>=m_start and o.closed_at<m_end and (p_unit is null or o.unit_id=p_unit)
    ) z
  )
  select jsonb_build_object(
    'timezone',tz,'today',today,
    'revenue_today',(select coalesce(sum(amount),0) from rec where paid_at>=d_start and paid_at<d_end),
    'revenue_month',(select coalesce(sum(amount),0) from rec where paid_at>=m_start and paid_at<m_end),
    'sales_count_month',(select n from sc),
    'ticket_average',(select case when (select n from sc)>0 then round(coalesce(sum(amount),0)::numeric/(select n from sc)) else 0 end from rec where paid_at>=m_start and paid_at<m_end),
    'appointments_today',(select count(*) from public.appointments a where a.tenant_id=t and a.starts_at>=d_start and a.starts_at<d_end and a.status<>'cancelled' and (p_unit is null or a.unit_id=p_unit)),
    'attendances_month',(select count(*) from public.appointments a where a.tenant_id=t and a.status='completed' and a.starts_at>=m_start and a.starts_at<m_end and (p_unit is null or a.unit_id=p_unit)),
    'cancellations_month',(select count(*) from public.appointments a where a.tenant_id=t and a.status='cancelled' and coalesce(a.cancelled_at,a.starts_at)>=m_start and coalesce(a.cancelled_at,a.starts_at)<m_end and (p_unit is null or a.unit_id=p_unit)),
    'no_shows_month',(select count(*) from public.appointments a where a.tenant_id=t and a.status='no_show' and a.starts_at>=m_start and a.starts_at<m_end and (p_unit is null or a.unit_id=p_unit)),
    'slots_today',jsonb_build_object('total',slot_total,'busy',slot_busy,'free',greatest(slot_total-slot_busy,0)),
    'new_clients_month',(select count(*) from public.clients c where c.tenant_id=t and c.created_at>=m_start and c.created_at<m_end),
    'recurring_clients_month',(select count(distinct a.client_id) from public.appointments a where a.tenant_id=t and a.status='completed' and a.starts_at>=m_start and a.starts_at<m_end
       and (p_unit is null or a.unit_id=p_unit)
       and exists(select 1 from public.appointments b where b.tenant_id=t and b.client_id=a.client_id and b.status='completed' and b.starts_at<m_start)),
    'clients_served_month',(select count(distinct a.client_id) from public.appointments a where a.tenant_id=t and a.status='completed' and a.starts_at>=m_start and a.starts_at<m_end and (p_unit is null or a.unit_id=p_unit)),
    'products_month',(select jsonb_build_object('quantity',coalesce(-sum(sm.quantity),0),'revenue_cents',coalesce(round(-sum(sm.quantity*coalesce(sm.unit_price,
        (select oi.unit_price_cents/100.0 from public.order_items oi where oi.tenant_id=t and oi.order_id=sm.order_id and oi.reference_id=sm.product_id and oi.kind='product' limit 1),0))*100),0))
      from public.stock_movements sm where sm.barbershop_id=t and sm.movement_type in ('sale','return') and sm.created_at>=m_start and sm.created_at<m_end and (p_unit is null or sm.unit_id=p_unit)),
    'by_professional',coalesce((select jsonb_agg(x order by x.revenue_cents desc) from (
       select r.barber_id,coalesce(b.name,'Sem profissional') as name,sum(r.amount) revenue_cents,count(*) receipts
       from rec r left join public.barbers b on b.tenant_id=t and b.id=r.barber_id
       where r.paid_at>=m_start and r.paid_at<m_end group by r.barber_id,b.name) x),'[]'::jsonb),
    'by_unit',coalesce((select jsonb_agg(x order by x.revenue_cents desc) from (
       select r.unit_id,coalesce(u.name,'Sem unidade') as name,sum(r.amount) revenue_cents
       from rec r left join public.units u on u.tenant_id=t and u.id=r.unit_id
       where r.paid_at>=m_start and r.paid_at<m_end group by r.unit_id,u.name) x),'[]'::jsonb),
    'series',(select jsonb_agg(jsonb_build_object('day',d::date,
        'revenue_cents',(select coalesce(sum(r.amount),0) from rec r where r.paid_at>=(d at time zone tz) and r.paid_at<((d+interval '1 day') at time zone tz)),
        'appointments',(select count(*) from public.appointments a where a.tenant_id=t and a.status<>'cancelled' and (p_unit is null or a.unit_id=p_unit)
           and a.starts_at>=(d at time zone tz) and a.starts_at<((d+interval '1 day') at time zone tz))) order by d)
      from generate_series((today-29)::timestamp,today::timestamp,interval '1 day') d),
    'deposits_pending',(select count(*) from public.appointments a where a.tenant_id=t and a.deposit_status='pending' and a.status='scheduled' and a.hold_expires_at>now()),
    'recovered_month',private.recovered_stats(t,m_start,m_end)
  ) into result;
  return result;
end $$;
revoke all on function public.dashboard_overview(uuid,uuid) from public,anon;
grant execute on function public.dashboard_overview(uuid,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Comissão por profissional (serviço específico, padrão de serviços, produtos)
-- ---------------------------------------------------------------------------
create table if not exists public.commission_rules(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  barber_id uuid not null,
  kind text not null check (kind in ('service','product')),
  service_id uuid,
  rate_bps integer not null check (rate_bps between 0 and 10000),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  foreign key (tenant_id,barber_id) references public.barbers(tenant_id,id) on delete cascade,
  constraint commission_rules_unique unique nulls not distinct (tenant_id,barber_id,kind,service_id),
  constraint commission_rules_product_scope check (kind='service' or service_id is null)
);
alter table public.commission_rules enable row level security;
revoke all on public.commission_rules from anon,authenticated;
grant select on public.commission_rules to authenticated;
drop policy if exists commission_rules_read on public.commission_rules;
create policy commission_rules_read on public.commission_rules for select to authenticated
  using (private.can(tenant_id,'finance') or private.own_barber(tenant_id,barber_id));

create or replace function public.save_commission_rules(t uuid,b uuid,p jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare r jsonb; n int:=0;
begin
  if not private.can(t,'finance') then raise exception 'Sem permissão para comissões' using errcode='42501'; end if;
  if not exists(select 1 from public.barbers where tenant_id=t and id=b) then raise exception 'Profissional inválido'; end if;
  if jsonb_typeof(p)<>'array' or jsonb_array_length(p)>200 then raise exception 'Regras inválidas'; end if;
  delete from public.commission_rules where tenant_id=t and barber_id=b;
  for r in select value from jsonb_array_elements(p) loop
    if coalesce(r->>'kind','') not in ('service','product') then raise exception 'Tipo de comissão inválido'; end if;
    if (r->>'rate_bps') is null or (r->>'rate_bps')::int not between 0 and 10000 then raise exception 'Percentual inválido'; end if;
    if nullif(r->>'service_id','') is not null and not exists(select 1 from public.services where tenant_id=t and id=(r->>'service_id')::uuid) then raise exception 'Serviço inválido'; end if;
    insert into public.commission_rules(tenant_id,barber_id,kind,service_id,rate_bps,updated_by)
    values(t,b,r->>'kind',case when r->>'kind'='service' then nullif(r->>'service_id','')::uuid end,(r->>'rate_bps')::int,auth.uid())
    on conflict on constraint commission_rules_unique do update set rate_bps=excluded.rate_bps,updated_by=excluded.updated_by,updated_at=now();
    n:=n+1;
  end loop;
  perform private.log(t,null,'commission.rules_saved',b,jsonb_build_object('rules',p));
  return n;
end $$;
revoke all on function public.save_commission_rules(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_commission_rules(uuid,uuid,jsonb) to authenticated;

create or replace function public.commission_report(t uuid,p_from date,p_to date,p_barber uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tz text; st timestamptz; en timestamptz; result jsonb; own uuid;
begin
  select id into own from public.barbers where tenant_id=t and user_id=auth.uid() and active;
  if not private.can(t,'finance') then
    if own is null or not private.member(t) then raise exception 'Sem permissão para comissões' using errcode='42501'; end if;
    p_barber:=own;
  end if;
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Período inválido (máximo de um ano)'; end if;
  select coalesce((select timezone from public.units where tenant_id=t and active order by name limit 1),'America/Sao_Paulo') into tz;
  st:=p_from::timestamp at time zone tz; en:=(p_to+1)::timestamp at time zone tz;

  with appt_done as (
    -- Atendimentos finalizados pelo checkout (pagamento de agendamento)
    select a.id appointment_id,a.barber_id,coalesce(p.paid_at,p.created_at) done_at
    from public.appointment_payments p join public.appointments a on a.tenant_id=p.tenant_id and a.id=p.appointment_id
    where p.tenant_id=t and p.status<>'cancelled' and coalesce(p.paid_at,p.created_at)>=st and coalesce(p.paid_at,p.created_at)<en
    union all
    -- Atendimentos finalizados por comanda
    select o.appointment_id,o.barber_id,o.closed_at
    from public.order_tabs o where o.tenant_id=t and o.status='closed' and o.appointment_id is not null and o.closed_at>=st and o.closed_at<en
  ), lines as (
    select d.barber_id,'service'::text kind,x.service_id,x.price_cents::bigint amount,s.commission_bps snapshot
    from appt_done d join public.appointment_services x on x.tenant_id=t and x.appointment_id=d.appointment_id
    left join public.services s on s.id=x.service_id
    union all
    select d.barber_id,'service',a.service_id,a.price_cents::bigint,coalesce(nullif(a.commission_bps,0),s.commission_bps)
    from appt_done d join public.appointments a on a.tenant_id=t and a.id=d.appointment_id
    left join public.services s on s.id=a.service_id
    where not exists(select 1 from public.appointment_services x where x.tenant_id=t and x.appointment_id=d.appointment_id)
    union all
    -- Itens avulsos de comanda
    select o.barber_id,i.kind,case when i.kind='service' then i.reference_id end,(i.quantity*i.unit_price_cents)::bigint,i.commission_bps
    from public.order_tabs o join public.order_items i on i.tenant_id=t and i.order_id=o.id and i.removed_at is null and i.kind in ('service','product')
    where o.tenant_id=t and o.status='closed' and o.closed_at>=st and o.closed_at<en
    union all
    -- Produtos de vendas rápidas
    select q.barber_id,'product',null,round(-sm.quantity*coalesce(sm.unit_price,0)*100)::bigint,round(coalesce(sm.commission_pct,0)*100)::int
    from public.quick_sales q join public.stock_movements sm on sm.barbershop_id=t and sm.sale_id=q.id and sm.movement_type='sale'
    where q.tenant_id=t and q.status<>'cancelled' and q.order_id is null and q.appointment_id is null and q.created_at>=st and q.created_at<en
    union all
    -- Serviços de vendas rápidas (valor da venda menos os produtos)
    select q.barber_id,'service',null,(q.amount_cents-coalesce((select round(sum(-sm.quantity*coalesce(sm.unit_price,0)*100)) from public.stock_movements sm
        where sm.barbershop_id=t and sm.sale_id=q.id and sm.movement_type='sale'),0))::bigint,null
    from public.quick_sales q
    where q.tenant_id=t and q.status<>'cancelled' and q.order_id is null and q.appointment_id is null and q.created_at>=st and q.created_at<en
  ), rated as (
    select l.*,
      coalesce(
        (select r.rate_bps from public.commission_rules r where r.tenant_id=t and r.barber_id=l.barber_id and r.kind=l.kind and l.kind='service' and r.service_id=l.service_id),
        (select r.rate_bps from public.commission_rules r where r.tenant_id=t and r.barber_id=l.barber_id and r.kind=l.kind and r.service_id is null),
        l.snapshot,0) rate_bps
    from lines l where l.barber_id is not null and l.amount>0 and (p_barber is null or l.barber_id=p_barber)
  )
  select jsonb_build_object('from',p_from,'to',p_to,
    'barbers',coalesce(jsonb_agg(x order by x.total_commission_cents desc),'[]'::jsonb),
    'totals',jsonb_build_object('revenue_cents',coalesce(sum(x.service_revenue_cents+x.product_revenue_cents),0),'commission_cents',coalesce(sum(x.total_commission_cents),0)))
  into result from (
    select r.barber_id,b.name,
      count(*) filter (where r.kind='service') services_count,
      coalesce(sum(r.amount) filter (where r.kind='service'),0) service_revenue_cents,
      coalesce(sum(r.amount) filter (where r.kind='product'),0) product_revenue_cents,
      coalesce(round(sum(r.amount*r.rate_bps/10000.0) filter (where r.kind='service')),0) service_commission_cents,
      coalesce(round(sum(r.amount*r.rate_bps/10000.0) filter (where r.kind='product')),0) product_commission_cents,
      coalesce(round(sum(r.amount*r.rate_bps/10000.0)),0) total_commission_cents
    from rated r join public.barbers b on b.tenant_id=t and b.id=r.barber_id
    group by r.barber_id,b.name
  ) x;
  return result;
end $$;
revoke all on function public.commission_report(uuid,date,date,uuid) from public,anon;
grant execute on function public.commission_report(uuid,date,date,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Painel mestre: indicadores do negócio BarberTix e detalhes da barbearia
-- ---------------------------------------------------------------------------
create or replace function private.tenant_mrr_cents(v public.tenants)
returns integer language sql stable security definer set search_path='' as $$
  select case when v.billing_amount_cents>0 then v.billing_amount_cents else
    round((p.monthly_cents+greatest(0,(select count(*) from public.units u where u.tenant_id=v.id and u.active)-p.included_units)*p.extra_unit_cents)
      *(1+coalesce(v.no_commitment_surcharge_pct,0)/100.0)
      *(1-case when v.discount_pct>0 and v.discount_months>0 and v.discount_started_at is not null
          and current_date<(v.discount_started_at+make_interval(months=>v.discount_months))::date then v.discount_pct else 0 end/100.0))::int end
  from public.plans p where p.id=v.plan_id
$$;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m_start timestamptz:=date_trunc('month',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  if private.platform_role() is distinct from 'full' then raise exception 'Acesso restrito ao administrador mestre' using errcode='42501'; end if;
  return jsonb_build_object(
    'tenants',(select jsonb_build_object(
      'total',count(*),
      'trial',count(*) filter (where status='trial'),
      'active',count(*) filter (where status in ('active','pending')),
      'overdue',count(*) filter (where status='overdue'),
      'blocked',count(*) filter (where status in ('blocked','suspended')),
      'cancelled',count(*) filter (where status='cancelled')) from public.tenants),
    'mrr_cents',(select coalesce(sum(private.tenant_mrr_cents(tn)),0) from public.tenants tn where tn.status in ('active','pending','overdue')),
    'revenue_month_cents',(select coalesce(sum(value_cents),0) from public.billing_payments where state='paid' and paid_at>=m_start),
    'revenue_total_cents',(select coalesce(sum(value_cents),0) from public.billing_payments where state='paid'),
    'trial_conversion',(select jsonb_build_object('trials',count(*),'converted',count(*) filter (where tn.last_paid_at is not null),
        'rate',case when count(*)>0 then round(100.0*count(*) filter (where tn.last_paid_at is not null)/count(*),1) else 0 end)
      from public.tenants tn where tn.trial_started_at is not null),
    'cancellations_month',(select count(*) from public.subscription_events where kind='status_changed' and to_status='cancelled' and created_at>=m_start),
    'plans',coalesce((select jsonb_agg(x order by x.tenants desc) from (
      select coalesce(p.name,'Sem plano') plan,count(*) tenants from public.tenants tn left join public.plans p on p.id=tn.plan_id
      where tn.status<>'cancelled' group by p.name) x),'[]'::jsonb),
    'acquisition',coalesce((select jsonb_agg(x order by x.signups desc) from (
      select coalesce(nullif(a.utm_source,''),'(direto)') source,coalesce(nullif(a.utm_campaign,''),'(sem campanha)') campaign,
        count(*) signups,count(a.trial_started_at) trials,count(a.subscribed_at) subscriptions,
        coalesce(sum((select sum(b.value_cents) from public.billing_payments b where b.tenant_id=a.tenant_id and b.state='paid')),0) revenue_cents,
        case when count(*)>0 then round(100.0*count(a.subscribed_at)/count(*),1) else 0 end conversion
      from public.tenant_acquisition a group by 1,2) x),'[]'::jsonb),
    'recent_signups',coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select tn.id,tn.name,tn.slug,tn.status,tn.created_at,tn.trial_ends_at,p.name plan,a.utm_source,a.utm_campaign
      from public.tenants tn left join public.plans p on p.id=tn.plan_id left join public.tenant_acquisition a on a.tenant_id=tn.id
      where tn.signup_source='self' order by tn.created_at desc limit 10) x),'[]'::jsonb)
  );
end $$;
revoke all on function public.admin_overview() from public,anon;
grant execute on function public.admin_overview() to authenticated;

create or replace function public.admin_tenant_details(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v public.tenants;
begin
  if private.platform_role() is null then raise exception 'Acesso restrito' using errcode='42501'; end if;
  select * into v from public.tenants where id=p_tenant;
  if v.id is null then raise exception 'Barbearia não encontrada'; end if;
  return jsonb_build_object(
    'tenant',(to_jsonb(v)-'instagram_access_token'-'asaas_customer_id'-'asaas_checkout_id')||jsonb_build_object('mrr_cents',private.tenant_mrr_cents(v)),
    'plan',(select to_jsonb(p) from public.plans p where p.id=v.plan_id),
    'owners',coalesce((select jsonb_agg(jsonb_build_object('name',m.name,'email',u.email,'whatsapp',m.whatsapp,'last_sign_in_at',u.last_sign_in_at))
      from public.memberships m join auth.users u on u.id=m.user_id where m.tenant_id=v.id and m.role='owner'),'[]'::jsonb),
    'counts',jsonb_build_object(
      'units',(select count(*) from public.units where tenant_id=v.id and active),
      'profiles',(select count(*) from public.memberships where tenant_id=v.id and active and role<>'owner'),
      'professionals',(select count(*) from public.barbers where tenant_id=v.id and active),
      'clients',(select count(*) from public.clients where tenant_id=v.id),
      'services',(select count(*) from public.services where tenant_id=v.id and active),
      'appointments_30d',(select count(*) from public.appointments where tenant_id=v.id and starts_at>now()-interval '30 days' and status<>'cancelled')),
    'payments',coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select provider,provider_payment_id,state,method,billing_type,value_cents,due_date,paid_at,invoice_url,created_at
      from public.billing_payments where tenant_id=v.id order by created_at desc limit 12) x),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select kind,from_status,to_status,amount_cents,details,created_at from public.subscription_events where tenant_id=v.id order by created_at desc limit 25) x),'[]'::jsonb),
    'acquisition',(select to_jsonb(a) from public.tenant_acquisition a where a.tenant_id=v.id)
  );
end $$;
revoke all on function public.admin_tenant_details(uuid) from public,anon;
grant execute on function public.admin_tenant_details(uuid) to authenticated;

revoke all on function private.attribute_campaign() from public;
revoke all on function private.appointment_revenue(uuid,uuid) from public;
revoke all on function private.recovered_stats(uuid,timestamptz,timestamptz) from public;
revoke all on function private.tenant_mrr_cents(public.tenants) from public;
