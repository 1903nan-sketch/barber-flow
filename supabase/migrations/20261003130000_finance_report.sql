-- One call for the Finance screen: receipts split into services/products, products sold,
-- cash register sessions (closings) and totals by payment method for a period.
create or replace function public.finance_report(t uuid, u uuid, st timestamptz, en timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  single boolean;
  result jsonb;
begin
  if not private.can(t,'finance') then raise exception 'Sem permissão para o financeiro' using errcode='42501'; end if;
  if st is null or en is null or en<=st or en-st>interval '367 days' then raise exception 'Período inválido: máximo de um ano'; end if;
  if u is not null and not exists(select 1 from public.units where tenant_id=t and id=u) then raise exception 'Unidade inválida'; end if;
  single:=(select count(*)=1 from public.units where tenant_id=t and active);

  with qs as (
    select q.*,
      case
        -- Tab (comanda) paid in several payments: each payment carries its share of products.
        when q.order_id is not null then coalesce((
          select round(q.amount_cents::numeric*sum(oi.quantity::bigint*oi.unit_price_cents)/nullif(o.total_cents,0))
          from public.order_items oi join public.order_tabs o on o.id=oi.order_id and o.tenant_id=t
          where oi.tenant_id=t and oi.order_id=q.order_id and oi.kind='product' and oi.removed_at is null
          group by o.total_cents),0)
        -- Quick sale / product sale: products recorded with their sale price on the stock movement.
        else coalesce((
          select sum(round(-sm.quantity*coalesce(sm.unit_price,0)*100))
          from public.stock_movements sm
          where sm.barbershop_id=t and sm.sale_id=q.id and sm.movement_type='sale'),0)
      end::bigint as product_raw
    from public.quick_sales q
    where q.tenant_id=t and q.status='paid' and q.paid_at>=st and q.paid_at<en
      and (u is null or q.unit_id=u or (q.unit_id is null and single))
  ),
  receipts as (
    select ap.id, 'appointment'::text as source, ap.paid_at as at, ap.method, ap.amount_cents::bigint as amount_cents,
      ap.amount_cents::bigint as service_cents, 0::bigint as product_cents,
      coalesce(s.name,'Atendimento') as description, c.name as client, b.name as professional, ap.unit_id
    from public.appointment_payments ap
    left join public.services s on s.id=ap.service_id
    left join public.clients c on c.id=ap.client_id
    left join public.barbers b on b.id=ap.barber_id
    where ap.tenant_id=t and ap.status='paid' and ap.paid_at>=st and ap.paid_at<en and (u is null or ap.unit_id=u)
    union all
    select q.id, case when q.order_id is not null then 'order' else 'quick' end, q.paid_at, q.method, q.amount_cents::bigint,
      greatest(q.amount_cents-least(q.product_raw,q.amount_cents),0), least(q.product_raw,q.amount_cents),
      case when q.order_id is not null then coalesce((
          select string_agg(oi.quantity||'x '||oi.name,' + ' order by oi.created_at)
          from public.order_items oi where oi.tenant_id=t and oi.order_id=q.order_id and oi.removed_at is null),q.description)
        else q.description end,
      c.name, b.name, q.unit_id
    from qs q
    left join public.clients c on c.id=q.client_id
    left join public.barbers b on b.id=q.barber_id
  ),
  product_lines as (
    -- Quick sales and direct product sales
    select sm.id, q.paid_at as at, p.name as product, (-sm.quantity)::numeric as qty,
      round(coalesce(sm.unit_price,0)*100)::bigint as unit_price_cents,
      round(coalesce(sm.unit_cost,0)*100)::bigint as unit_cost_cents,
      q.method, c.name as client, b.name as professional, 'quick'::text as source
    from public.stock_movements sm
    join qs q on q.order_id is null and sm.sale_id=q.id
    join public.products p on p.id=sm.product_id
    left join public.clients c on c.id=q.client_id
    left join public.barbers b on b.id=q.barber_id
    where sm.barbershop_id=t and sm.movement_type='sale'
    union all
    -- Products sold in closed tabs (price from the tab, cost from the stock movement)
    select oi.id, o.closed_at, oi.name, oi.quantity::numeric, oi.unit_price_cents::bigint,
      coalesce((select round(coalesce(sm.unit_cost,0)*100) from public.stock_movements sm
                where sm.barbershop_id=t and sm.order_id=o.id and sm.product_id=oi.reference_id and sm.movement_type='sale' limit 1),0)::bigint,
      'order', c.name, b.name, 'order'
    from public.order_items oi
    join public.order_tabs o on o.id=oi.order_id and o.tenant_id=t
    left join public.clients c on c.id=o.client_id
    left join public.barbers b on b.id=o.barber_id
    where oi.tenant_id=t and oi.kind='product' and oi.removed_at is null
      and o.status='closed' and o.closed_at>=st and o.closed_at<en and (u is null or o.unit_id=u)
  ),
  manual as (
    select coalesce(sum(amount_cents) filter (where kind='income'),0)::bigint as income,
           coalesce(sum(amount_cents) filter (where kind='expense'),0)::bigint as expense
    from public.financial_entries
    where tenant_id=t and (u is null or unit_id=u) and status='paid' and paid_at>=st and paid_at<en
  ),
  sessions as (
    select cs.*, un.name as unit_name,
      (select m.name from public.memberships m where m.tenant_id=t and m.user_id=cs.opened_by limit 1) as opened_by_name,
      (select m.name from public.memberships m where m.tenant_id=t and m.user_id=cs.closed_by limit 1) as closed_by_name
    from public.cash_sessions cs
    left join public.units un on un.id=cs.unit_id
    where cs.tenant_id=t and (u is null or cs.unit_id=u)
      and cs.opened_at<en and coalesce(cs.closed_at,now())>=st
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'received', (select coalesce(sum(amount_cents),0) from receipts),
      'services', (select coalesce(sum(service_cents),0) from receipts),
      'products', (select coalesce(sum(product_cents),0) from receipts),
      'receipts_count', (select count(*) from receipts),
      'other_income', (select income from manual),
      'expenses_paid', (select expense from manual),
      'net', (select coalesce(sum(amount_cents),0) from receipts)+(select income from manual)-(select expense from manual),
      'receivable', (select coalesce(sum(amount_cents),0) from (
          select amount_cents from public.quick_sales where tenant_id=t and (u is null or unit_id=u) and status='open'
          union all select amount_cents from public.appointment_payments where tenant_id=t and (u is null or unit_id=u) and status='open'
          union all select amount_cents from public.financial_entries where tenant_id=t and (u is null or unit_id=u) and status='open' and kind='income') x),
      'payable', (select coalesce(sum(amount_cents),0) from public.financial_entries where tenant_id=t and (u is null or unit_id=u) and status='open' and kind='expense'),
      'products_sold_cents', (select coalesce(sum(round(qty*unit_price_cents)),0) from product_lines),
      'products_cost_cents', (select coalesce(sum(round(qty*unit_cost_cents)),0) from product_lines),
      'products_qty', (select coalesce(sum(qty),0) from product_lines)
    ),
    'by_method', coalesce((select jsonb_object_agg(method, jsonb_build_object('total',total,'count',qty)) from (
        select method, sum(amount_cents)::bigint as total, count(*) as qty from receipts group by method) m),'{}'::jsonb),
    'receipts', coalesce((select jsonb_agg(to_jsonb(r) order by r.at desc) from (select * from receipts order by at desc limit 500) r),'[]'::jsonb),
    'top_services', coalesce((select jsonb_agg(x order by x.total desc) from (
        select regexp_replace(description,'^[0-9]+x ','') as name, count(*) as qty, sum(service_cents)::bigint as total
        from receipts where service_cents>0 group by 1 order by sum(service_cents) desc limit 10) x),'[]'::jsonb),
    'products', coalesce((select jsonb_agg(x order by x.revenue_cents desc) from (
        select product as name, sum(qty) as qty, sum(round(qty*unit_price_cents))::bigint as revenue_cents, sum(round(qty*unit_cost_cents))::bigint as cost_cents
        from product_lines group by product) x),'[]'::jsonb),
    'product_lines', coalesce((select jsonb_agg(to_jsonb(l) order by l.at desc) from (select * from product_lines order by at desc limit 500) l),'[]'::jsonb),
    'cash_sessions', coalesce((select jsonb_agg(jsonb_build_object(
        'id',s.id,'unit_id',s.unit_id,'unit_name',s.unit_name,'status',s.status,'opened_at',s.opened_at,'closed_at',s.closed_at,
        'opening_cents',s.opening_cents,'counted_cash_cents',s.counted_cash_cents,'expected_cash_cents',s.expected_cash_cents,
        'notes',s.notes,'opened_by',s.opened_by_name,'closed_by',s.closed_by_name,
        'summary',case when s.status='open' then public.cash_summary(t,s.id) else s.summary end,
        'movements',coalesce((select jsonb_agg(jsonb_build_object('kind',mv.kind,'amount_cents',mv.amount_cents,'reason',mv.reason,'created_at',mv.created_at) order by mv.created_at)
                              from public.cash_movements mv where mv.session_id=s.id),'[]'::jsonb)
      ) order by s.opened_at desc) from sessions s),'[]'::jsonb)
  ) into result;

  return result;
end $$;

revoke all on function public.finance_report(uuid,uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.finance_report(uuid,uuid,timestamptz,timestamptz) to authenticated;
