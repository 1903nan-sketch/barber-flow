create or replace function public.admin_report_for_product(p_password text, p_product text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  role text:=private.platform_role();
  secret text;
  product text:=lower(trim(coalesce(p_product,'')));
begin
  if role is distinct from 'full' then raise exception 'Acesso restrito'; end if;
  select value into secret from public.platform_settings where key='reports_password_hash';
  if secret is null or extensions.crypt(coalesce(p_password,''),secret)<>secret then
    raise exception 'Senha de relatórios inválida';
  end if;

  return jsonb_build_object(
    'summary',jsonb_build_object(
      'tenants',(select count(*) from public.tenants where product_slug=product),
      'active',(select count(*) from public.tenants where product_slug=product and status in ('active','trial')),
      'blocked',(select count(*) from public.tenants where product_slug=product and status in ('blocked','suspended')),
      'overdue',(select count(*) from public.tenants where product_slug=product and status='overdue'),
      'grace',(select count(*) from public.tenants where product_slug=product and billing_due_date<(now() at time zone 'America/Sao_Paulo')::date and (now() at time zone 'America/Sao_Paulo')::date<=billing_due_date+grace_days and status='overdue'),
      'mrr_cents',(select coalesce(sum(p.monthly_cents),0) from public.tenants t join public.plans p on p.id=t.plan_id where t.product_slug=product and t.status in ('active','trial','overdue'))
    ),
    'tenants',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',t.id,'name',t.name,'status',t.status,'plan',p.name,'monthly_cents',p.monthly_cents,
      'due_date',t.billing_due_date,'grace_days',t.grace_days,'last_paid_at',t.last_paid_at
    ) order by t.name),'[]'::jsonb)
    from public.tenants t
    left join public.plans p on p.id=t.plan_id
    where t.product_slug=product)
  );
end
$$;

grant execute on function public.admin_report_for_product(text,text) to authenticated;
