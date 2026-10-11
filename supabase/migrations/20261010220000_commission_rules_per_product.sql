-- Comissão por produto específico (ex.: o gel paga 50% e outro produto 20%)
-- para cada profissional. Antes só havia regra por serviço específico ou geral.
alter table public.commission_rules add column if not exists product_id uuid references public.products(id) on delete cascade;

alter table public.commission_rules drop constraint if exists commission_rules_product_scope;
alter table public.commission_rules drop constraint if exists commission_rules_item_scope;
alter table public.commission_rules add constraint commission_rules_item_scope
  check ((kind='service' and product_id is null) or (kind='product' and service_id is null));

alter table public.commission_rules drop constraint if exists commission_rules_unique;
alter table public.commission_rules add constraint commission_rules_unique
  unique nulls not distinct (tenant_id,barber_id,kind,service_id,product_id);

create or replace function public.save_commission_rules(t uuid, b uuid, p jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare r jsonb; n int:=0; sid uuid; pid uuid;
begin
  if not private.can(t,'finance') then raise exception 'Sem permissão para comissões' using errcode='42501'; end if;
  if not exists(select 1 from public.barbers where tenant_id=t and id=b) then raise exception 'Profissional inválido'; end if;
  if jsonb_typeof(p)<>'array' or jsonb_array_length(p)>300 then raise exception 'Regras inválidas'; end if;
  delete from public.commission_rules where tenant_id=t and barber_id=b;
  for r in select value from jsonb_array_elements(p) loop
    if coalesce(r->>'kind','') not in ('service','product') then raise exception 'Tipo de comissão inválido'; end if;
    if (r->>'rate_bps') is null or (r->>'rate_bps')::int not between 0 and 10000 then raise exception 'Percentual inválido'; end if;
    sid:=case when r->>'kind'='service' then nullif(r->>'service_id','')::uuid end;
    pid:=case when r->>'kind'='product' then nullif(r->>'product_id','')::uuid end;
    if sid is not null and not exists(select 1 from public.services where tenant_id=t and id=sid) then raise exception 'Serviço inválido'; end if;
    if pid is not null and not exists(select 1 from public.products where barbershop_id=t and id=pid) then raise exception 'Produto inválido'; end if;
    insert into public.commission_rules(tenant_id,barber_id,kind,service_id,product_id,rate_bps,updated_by)
    values(t,b,r->>'kind',sid,pid,(r->>'rate_bps')::int,auth.uid())
    on conflict on constraint commission_rules_unique do update set rate_bps=excluded.rate_bps,updated_by=excluded.updated_by,updated_at=now();
    n:=n+1;
  end loop;
  perform private.log(t,null,'commission.rules_saved',b,jsonb_build_object('rules',p));
  return n;
end $function$;

-- Relatório de comissões no banco: considera também a regra por produto.
create or replace function public.commission_report(t uuid, p_from date, p_to date, p_barber uuid default null::uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
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
    select a.id appointment_id,a.barber_id,coalesce(p.paid_at,p.created_at) done_at
    from public.appointment_payments p join public.appointments a on a.tenant_id=p.tenant_id and a.id=p.appointment_id
    where p.tenant_id=t and p.status<>'cancelled' and coalesce(p.paid_at,p.created_at)>=st and coalesce(p.paid_at,p.created_at)<en
    union all
    select o.appointment_id,o.barber_id,o.closed_at
    from public.order_tabs o where o.tenant_id=t and o.status='closed' and o.appointment_id is not null and o.closed_at>=st and o.closed_at<en
  ), lines as (
    select d.barber_id,'service'::text kind,x.service_id,null::uuid product_id,x.price_cents::bigint amount,s.commission_bps snapshot
    from appt_done d join public.appointment_services x on x.tenant_id=t and x.appointment_id=d.appointment_id
    left join public.services s on s.id=x.service_id
    union all
    select d.barber_id,'service',a.service_id,null::uuid,a.price_cents::bigint,coalesce(nullif(a.commission_bps,0),s.commission_bps)
    from appt_done d join public.appointments a on a.tenant_id=t and a.id=d.appointment_id
    left join public.services s on s.id=a.service_id
    where not exists(select 1 from public.appointment_services x where x.tenant_id=t and x.appointment_id=d.appointment_id)
    union all
    select o.barber_id,i.kind,case when i.kind='service' then i.reference_id end,case when i.kind='product' then i.reference_id end,(i.quantity*i.unit_price_cents)::bigint,i.commission_bps
    from public.order_tabs o join public.order_items i on i.tenant_id=t and i.order_id=o.id and i.removed_at is null and i.kind in ('service','product')
    where o.tenant_id=t and o.status='closed' and o.closed_at>=st and o.closed_at<en
    union all
    select q.barber_id,'product',null,sm.product_id,round(-sm.quantity*coalesce(sm.unit_price,0)*100)::bigint,round(coalesce(sm.commission_pct,0)*100)::int
    from public.quick_sales q join public.stock_movements sm on sm.barbershop_id=t and sm.sale_id=q.id and sm.movement_type='sale'
    where q.tenant_id=t and q.status<>'cancelled' and q.order_id is null and q.appointment_id is null and q.created_at>=st and q.created_at<en
    union all
    select q.barber_id,'service',null,null,(q.amount_cents-coalesce((select round(sum(-sm.quantity*coalesce(sm.unit_price,0)*100)) from public.stock_movements sm
        where sm.barbershop_id=t and sm.sale_id=q.id and sm.movement_type='sale'),0))::bigint,null
    from public.quick_sales q
    where q.tenant_id=t and q.status<>'cancelled' and q.order_id is null and q.appointment_id is null and q.created_at>=st and q.created_at<en
  ), rated as (
    select l.*,
      coalesce(
        (select r.rate_bps from public.commission_rules r where r.tenant_id=t and r.barber_id=l.barber_id and r.kind='service' and l.kind='service' and r.service_id=l.service_id),
        (select r.rate_bps from public.commission_rules r where r.tenant_id=t and r.barber_id=l.barber_id and r.kind='product' and l.kind='product' and r.product_id=l.product_id),
        (select r.rate_bps from public.commission_rules r where r.tenant_id=t and r.barber_id=l.barber_id and r.kind=l.kind and r.service_id is null and r.product_id is null),
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
end $function$;
