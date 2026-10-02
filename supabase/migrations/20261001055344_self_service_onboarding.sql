-- Self-service onboarding for authenticated owners.
-- The function is intentionally the only browser-writable entry point: it derives
-- the owner from auth.uid(), validates the commercial plan allow-list and creates
-- all tenant-scoped records in one transaction.

do $$
begin
  -- Older installations called this plan "Start". Normalize it without creating
  -- a duplicate plan row or changing an existing Starter plan.
  if exists(select 1 from public.plans where name='Start')
     and not exists(select 1 from public.plans where name='Starter') then
    update public.plans set name='Starter' where name='Start';
  end if;
end $$;

alter table public.tenants add column if not exists trial_ends_at date;
update public.tenants
set trial_ends_at=(created_at at time zone 'America/Sao_Paulo')::date+14
where status='trial' and trial_ends_at is null;
grant select (trial_ends_at) on public.tenants to authenticated;

create or replace function public.onboarding_options()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',p.id,
        'name',p.name,
        'monthly_cents',p.monthly_cents,
        'max_profiles',coalesce(p.max_profiles,p.max_barbers,1),
        'max_units',coalesce(p.max_units,1)
      ) order by
        case p.name when 'Starter' then 1 when 'Pro' then 2 else 3 end
    ),
    '[]'::jsonb
  )
  from public.plans p
  where p.name in ('Starter','Pro','Pro + Filiais');
$$;

create or replace function public.self_service_onboard(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_tenant uuid;
  v_unit uuid;
  v_barber uuid;
  v_service uuid;
  v_plan uuid:=nullif(p->>'plan_id','')::uuid;
  v_plan_name text;
  v_owner_name text:=trim(coalesce(p->>'owner_name',''));
  v_shop_name text:=trim(coalesce(p->>'name',''));
  v_slug text:=lower(trim(coalesce(p->>'slug','')));
  v_phone text:=trim(coalesce(p->>'phone',''));
  v_service_name text:=trim(coalesce(p->>'service_name',''));
  v_duration integer:=coalesce(nullif(p->>'service_duration','')::integer,30);
  v_price integer:=coalesce(nullif(p->>'service_price_cents','')::integer,0);
  v_start integer:=coalesce(nullif(p->>'start_min','')::integer,540);
  v_end integer:=coalesce(nullif(p->>'end_min','')::integer,1080);
  v_days integer[]:=coalesce(
    array(select value::integer from jsonb_array_elements_text(coalesce(p->'weekdays','[1,2,3,4,5,6]'::jsonb))),
    array[1,2,3,4,5,6]
  );
  v_permissions text[];
  v_day integer;
begin
  if v_user is null then
    raise exception 'Entre na sua conta para criar a barbearia' using errcode='42501';
  end if;

  -- Idempotency and abuse guard: an account already linked to a tenant cannot
  -- provision additional tenants through this public onboarding entry point.
  select m.tenant_id into v_tenant
  from public.memberships m
  where m.user_id=v_user and m.active
  order by (m.role='owner') desc, m.tenant_id
  limit 1;
  if v_tenant is not null then
    return jsonb_build_object('tenant_id',v_tenant,'existing',true);
  end if;

  if length(v_owner_name) not between 2 and 120 then raise exception 'Informe o nome do proprietário'; end if;
  if length(v_shop_name) not between 2 and 120 then raise exception 'Informe o nome da barbearia'; end if;
  if v_slug !~ '^[a-z][a-z0-9-]{2,60}$' then raise exception 'Use um endereço com letras, números e hífens'; end if;
  if length(regexp_replace(v_phone,'\D','','g')) not between 10 and 13 then raise exception 'Informe um WhatsApp válido'; end if;
  if length(v_service_name) not between 2 and 120 then raise exception 'Informe o primeiro serviço'; end if;
  if v_duration not between 5 and 480 then raise exception 'Duração do serviço inválida'; end if;
  if v_price < 0 or v_price > 100000000 then raise exception 'Preço do serviço inválido'; end if;
  if v_start < 0 or v_end > 1440 or v_end-v_start < v_duration then raise exception 'Horário de funcionamento inválido'; end if;
  if cardinality(v_days) not between 1 and 7 or exists(select 1 from unnest(v_days) d where d not between 0 and 6) then raise exception 'Dias de funcionamento inválidos'; end if;

  select id,name into v_plan,v_plan_name
  from public.plans
  where id=v_plan and name in ('Starter','Pro','Pro + Filiais');
  if v_plan is null then raise exception 'Escolha um plano válido'; end if;

  v_permissions:=case when v_plan_name='Starter'
    then array['clients','services','team','finance','inventory','sales','reports']::text[]
    else array['agenda','booking','clients','services','team','settings','audit','finance','inventory','sales','reports']::text[]
  end;

  insert into public.tenants(name,slug,status,plan_id,phone,whatsapp,public_site_enabled,trial_ends_at)
  values(v_shop_name,v_slug,'trial',v_plan,v_phone,v_phone,v_plan_name<>'Starter',current_date+14)
  returning id into v_tenant;

  insert into public.memberships(tenant_id,user_id,name,role,permissions,active)
  values(v_tenant,v_user,v_owner_name,'owner',v_permissions,true);

  insert into public.units(tenant_id,name,timezone,active)
  values(v_tenant,'Matriz','America/Sao_Paulo',true)
  returning id into v_unit;

  insert into public.barbers(tenant_id,user_id,name,active)
  values(v_tenant,v_user,v_owner_name,true)
  returning id into v_barber;

  insert into public.barber_units(tenant_id,barber_id,unit_id)
  values(v_tenant,v_barber,v_unit);

  insert into public.services(tenant_id,name,description,duration,price_cents,commission_bps,active)
  values(v_tenant,v_service_name,'',v_duration,v_price,0,true)
  returning id into v_service;

  insert into public.barber_services(tenant_id,barber_id,service_id)
  values(v_tenant,v_barber,v_service)
  on conflict do nothing;

  foreach v_day in array v_days loop
    insert into public.weekly_windows(tenant_id,barber_id,unit_id,weekday,start_min,end_min,step_min)
    values(v_tenant,v_barber,v_unit,v_day,v_start,v_end,15);
  end loop;

  insert into public.audit_events(tenant_id,unit_id,actor_id,action,entity_id,details)
  values(v_tenant,v_unit,v_user,'tenant.self_service_created',v_tenant,jsonb_build_object('plan',v_plan_name,'slug',v_slug));

  return jsonb_build_object(
    'tenant_id',v_tenant,
    'unit_id',v_unit,
    'barber_id',v_barber,
    'service_id',v_service,
    'slug',v_slug,
    'existing',false
  );
exception
  when unique_violation then
    raise exception 'Este endereço já está em uso. Escolha outro.' using errcode='23505';
end $$;

revoke all on function public.onboarding_options() from public,anon,authenticated;
revoke all on function public.self_service_onboard(jsonb) from public,anon,authenticated;
grant execute on function public.onboarding_options() to authenticated;
grant execute on function public.self_service_onboard(jsonb) to authenticated;
