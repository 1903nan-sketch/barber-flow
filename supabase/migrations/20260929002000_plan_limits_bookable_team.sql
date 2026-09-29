alter table public.plans
  add column if not exists max_profiles integer not null default 10,
  add column if not exists included_units integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='plans_max_profiles_check' and conrelid='public.plans'::regclass
  ) then
    alter table public.plans add constraint plans_max_profiles_check check (max_profiles >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname='plans_included_units_check' and conrelid='public.plans'::regclass
  ) then
    alter table public.plans add constraint plans_included_units_check check (included_units > 0);
  end if;
end $$;

alter table public.barbers add column if not exists photo_url text not null default '';

alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships add constraint memberships_role_check
  check (role in ('owner','manager','barber','reception','attendant'));

update public.plans set monthly_cents=8990,extra_unit_cents=0,max_barbers=1,max_units=1,max_profiles=1,included_units=1 where name='Starter';
update public.plans set monthly_cents=14990,extra_unit_cents=0,max_barbers=11,max_units=1,max_profiles=10,included_units=1 where name='Pro';
update public.plans set name='Pro + Filiais',monthly_cents=23990,extra_unit_cents=4990,max_barbers=11,max_units=50,max_profiles=10,included_units=1 where name='Premium';

create or replace function private.can(t uuid,p text) returns boolean language sql stable security definer set search_path='' as $$
 select private.member(t) and exists(select 1 from public.memberships m where m.tenant_id=t and m.user_id=auth.uid() and m.active and (m.role='owner' or (m.role in ('manager','reception','attendant') and p=any(m.permissions)) or (m.role='barber' and p='booking' and p=any(m.permissions))))
$$;

create or replace function private.order_access(t uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.member(t) and exists(select 1 from public.memberships m where m.tenant_id=t and m.user_id=auth.uid() and m.active and (m.role='owner' or (m.role in ('manager','reception','attendant') and ('booking'=any(m.permissions) or 'agenda'=any(m.permissions))) or (m.role='barber' and 'booking'=any(m.permissions) and exists(select 1 from public.barbers where tenant_id=t and id=b and user_id=auth.uid() and active))))
$$;

create or replace function private.available_multi(t uuid,u uuid,b uuid,service_ids uuid[],st timestamptz,ignore_id uuid default null) returns boolean language plpgsql stable security definer set search_path='' as $$
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
 and not exists(select 1 from public.appointments where tenant_id=t and barber_id=b and status in ('scheduled','present','in_service','completed','no_show') and starts_at<en and ends_at>st and (ignore_id is null or id<>ignore_id));
end $$;

create or replace function public.can_manage_operation() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select role in ('owner','manager','reception','attendant','platform_admin') from public.profiles where id=auth.uid() and active=true limit 1),false)
$$;

create or replace function public.admin_provision_tenant(p_admin uuid,p_owner uuid,p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid; v_plan_id uuid; v_plan_name text; v_permissions text[];
begin
 if not exists(select 1 from public.platform_admins where user_id=p_admin and access_role='full') then raise exception 'Acesso restrito ao administrador mestre'; end if;
 v_plan_id:=nullif(p->>'plan_id','')::uuid;
 select name into v_plan_name from public.plans where id=v_plan_id;
 if v_plan_name is null or v_plan_name not in ('Starter','Pro','Pro + Filiais') then raise exception 'Plano inválido'; end if;
 v_permissions:=case when v_plan_name='Starter' then array['clients','services','team','finance','inventory','sales','reports']::text[] else array['agenda','booking','clients','services','team','settings','audit','finance','inventory','sales','reports']::text[] end;
 insert into public.tenants(name,slug,phone,whatsapp,plan_id,status,public_site_enabled)
 values(trim(p->>'name'),lower(trim(p->>'slug')),coalesce(p->>'phone',''),coalesce(p->>'phone',''),v_plan_id,'active',v_plan_name<>'Starter') returning id into t;
 insert into public.memberships(tenant_id,user_id,name,role,permissions) values(t,p_owner,trim(p->>'owner_name'),'owner',v_permissions);
 insert into public.units(tenant_id,name) values(t,'Matriz');
 return t;
end $$;

create or replace function public.admin_save(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid; k text:=p->>'kind'; r text:=private.platform_role(); v_plan_name text; v_plan_id uuid;
begin
 if r is null then raise exception 'Acesso restrito ao Super Admin' using errcode='42501'; end if;
 if k='plan' then
  if r<>'full' then raise exception 'Somente o administrador mestre pode alterar planos'; end if;
  t:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid());
  insert into public.plans(id,name,monthly_cents,extra_unit_cents,max_barbers,max_units,default_grace_days,max_profiles,included_units)
  values(t,p->>'name',(p->>'monthly_cents')::int,coalesce((p->>'extra_unit_cents')::int,0),coalesce((p->>'max_barbers')::int,1),coalesce((p->>'max_units')::int,1),coalesce((p->>'default_grace_days')::int,7),coalesce((p->>'max_profiles')::int,10),coalesce((p->>'included_units')::int,1))
  on conflict(id) do update set name=excluded.name,monthly_cents=excluded.monthly_cents,extra_unit_cents=excluded.extra_unit_cents,max_barbers=excluded.max_barbers,max_units=excluded.max_units,default_grace_days=excluded.default_grace_days,max_profiles=excluded.max_profiles,included_units=excluded.included_units;
 elsif k='tenant' then
  t:=nullif(p->>'id','')::uuid; if t is null then raise exception 'Use o cadastro completo para novas empresas'; end if;
  if r='operations' then
   update public.tenants set status=coalesce(p->>'status',status),billing_due_date=case when p ? 'billing_due_date' then nullif(p->>'billing_due_date','')::date else billing_due_date end where id=t;
   if not found then raise exception 'Empresa não encontrada'; end if;
  else
   if p ? 'plan_id' then v_plan_id:=nullif(p->>'plan_id','')::uuid; select name into v_plan_name from public.plans where id=v_plan_id; if v_plan_name is null or v_plan_name not in ('Starter','Pro','Pro + Filiais') then raise exception 'Plano inválido'; end if; end if;
   update public.tenants set name=coalesce(p->>'name',name),status=coalesce(p->>'status',status),phone=coalesce(p->>'phone',phone),plan_id=case when p ? 'plan_id' then v_plan_id else plan_id end,public_site_enabled=case when p ? 'plan_id' then v_plan_name<>'Starter' else public_site_enabled end,billing_due_date=case when p ? 'billing_due_date' then nullif(p->>'billing_due_date','')::date else billing_due_date end,owner_document=case when p ? 'owner_document' then p->>'owner_document' else owner_document end,manager_name=case when p ? 'manager_name' then p->>'manager_name' else manager_name end,manager_document=case when p ? 'manager_document' then p->>'manager_document' else manager_document end,grace_days=case when p ? 'grace_days' then greatest(0,(p->>'grace_days')::int) else grace_days end where id=t;
   if not found then raise exception 'Empresa não encontrada'; end if;
   if p ? 'plan_id' then update public.memberships set permissions=case when v_plan_name='Starter' then array['clients','services','team','finance','inventory','sales','reports']::text[] else array['agenda','booking','clients','services','team','settings','audit','finance','inventory','sales','reports']::text[] end where tenant_id=t and role='owner'; end if;
  end if;
 else raise exception 'Operação inválida'; end if;
 return t;
end $$;

create or replace function public.save_staff_member(p_actor uuid,p_tenant uuid,p_user uuid,p_name text,p_role text,p_permissions text[]) returns uuid language plpgsql security definer set search_path='' as $$
declare b uuid;
begin
 if not exists(select 1 from public.memberships where tenant_id=p_tenant and user_id=p_actor and role='owner' and active) then raise exception 'Somente o proprietário altera acessos' using errcode='42501'; end if;
 if p_role not in ('barber','manager','reception','attendant') then raise exception 'Função inválida'; end if;
 if exists(select 1 from unnest(coalesce(p_permissions,'{}')) v where v not in ('agenda','booking','clients','services','team','settings','audit','inventory','finance','sales','reports')) then raise exception 'Permissão inválida'; end if;
 insert into public.memberships(tenant_id,user_id,name,role,permissions,active) values(p_tenant,p_user,p_name,p_role,coalesce(p_permissions,'{}'),true);
 if p_role='barber' then
  insert into public.barbers(tenant_id,user_id,name,active) values(p_tenant,p_user,p_name,true) returning id into b;
  insert into public.barber_units(tenant_id,barber_id,unit_id) select p_tenant,b,u.id from public.units u where u.tenant_id=p_tenant and u.active on conflict do nothing;
  insert into public.barber_services(tenant_id,barber_id,service_id) select p_tenant,b,s.id from public.services s where s.tenant_id=p_tenant and s.active on conflict do nothing;
 end if;
 perform private.log(p_tenant,null,'member.created',p_user,jsonb_build_object('role',p_role));
 return p_user;
end $$;

create or replace function public.save_staff_member(p_actor uuid,p_tenant uuid,p_user uuid,p_name text,p_role text,p_permissions text[],p_username text default null,p_login_email text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare b uuid;
begin
 if not exists(select 1 from public.memberships where tenant_id=p_tenant and user_id=p_actor and role='owner' and active) then raise exception 'Somente o proprietário altera acessos' using errcode='42501'; end if;
 if p_role not in ('barber','manager','reception','attendant') then raise exception 'Função inválida'; end if;
 if exists(select 1 from unnest(coalesce(p_permissions,'{}')) v where v not in ('agenda','booking','clients','services','team','settings','audit','inventory','finance','sales','reports')) then raise exception 'Permissão inválida'; end if;
 if p_username is not null then insert into public.staff_logins(user_id,tenant_id,username,login_email) values(p_user,p_tenant,lower(p_username),p_login_email); end if;
 insert into public.memberships(tenant_id,user_id,name,role,permissions,active) values(p_tenant,p_user,p_name,p_role,coalesce(p_permissions,'{}'),true);
 if p_role='barber' then
  insert into public.barbers(tenant_id,user_id,name,active) values(p_tenant,p_user,p_name,true) returning id into b;
  insert into public.barber_units(tenant_id,barber_id,unit_id) select p_tenant,b,u.id from public.units u where u.tenant_id=p_tenant and u.active on conflict do nothing;
  insert into public.barber_services(tenant_id,barber_id,service_id) select p_tenant,b,s.id from public.services s where s.tenant_id=p_tenant and s.active on conflict do nothing;
 end if;
 perform private.log(p_tenant,null,'member.created',p_user,jsonb_build_object('role',p_role,'username',p_username));
 return p_user;
end $$;

revoke all on function public.save_staff_member(uuid,uuid,uuid,text,text,text[]) from public,anon;
revoke all on function public.save_staff_member(uuid,uuid,uuid,text,text,text[],text,text) from public,anon;
grant execute on function public.save_staff_member(uuid,uuid,uuid,text,text,text[]) to authenticated;
grant execute on function public.save_staff_member(uuid,uuid,uuid,text,text,text[],text,text) to authenticated;
