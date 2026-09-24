-- Keep newly-created barbers and services linked for public booking.

create or replace function public.save_staff_member(
  p_actor uuid,
  p_tenant uuid,
  p_user uuid,
  p_name text,
  p_role text,
  p_permissions text[],
  p_username text default null,
  p_login_email text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare b uuid;
begin
 if not exists(
   select 1 from public.memberships
   where tenant_id=p_tenant and user_id=p_actor and role='owner' and active
 ) then
   raise exception 'Somente o proprietário altera acessos' using errcode='42501';
 end if;

 if p_role not in ('barber','manager','reception') then raise exception 'Função inválida'; end if;
 if exists(
   select 1 from unnest(coalesce(p_permissions,'{}')) v
   where v not in ('agenda','booking','clients','services','team','settings','audit','inventory','finance')
 ) then raise exception 'Permissão inválida'; end if;

 if p_username is not null then
   insert into public.staff_logins(user_id,tenant_id,username,login_email)
   values(p_user,p_tenant,lower(p_username),p_login_email);
 end if;

 insert into public.memberships(tenant_id,user_id,name,role,permissions,active)
 values(p_tenant,p_user,p_name,p_role,coalesce(p_permissions,'{}'),true);

 if p_role='barber' then
   insert into public.barbers(tenant_id,user_id,name,active)
   values(p_tenant,p_user,p_name,true)
   returning id into b;

   insert into public.barber_units(tenant_id,barber_id,unit_id)
   select p_tenant,b,u.id
   from public.units u
   where u.tenant_id=p_tenant and u.active
   on conflict do nothing;

   insert into public.barber_services(tenant_id,barber_id,service_id)
   select p_tenant,b,s.id
   from public.services s
   where s.tenant_id=p_tenant and s.active
   on conflict do nothing;
 end if;

 perform private.log(p_tenant,null,'member.created',p_user,jsonb_build_object('role',p_role,'username',p_username));
 return p_user;
end
$function$;

create or replace function public.save_staff_member(
  p_actor uuid,
  p_tenant uuid,
  p_user uuid,
  p_name text,
  p_role text,
  p_permissions text[]
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare b uuid;
begin
 if not exists(
   select 1 from public.memberships
   where tenant_id=p_tenant and user_id=p_actor and role='owner' and active
 ) then
   raise exception 'Somente o proprietário altera acessos' using errcode='42501';
 end if;

 if p_role not in ('barber','manager','reception') then raise exception 'Função inválida'; end if;
 if exists(
   select 1 from unnest(coalesce(p_permissions,'{}')) v
   where v not in ('agenda','booking','clients','services','team','settings','audit','inventory','finance')
 ) then raise exception 'Permissão inválida'; end if;

 insert into public.memberships(tenant_id,user_id,name,role,permissions,active)
 values(p_tenant,p_user,p_name,p_role,coalesce(p_permissions,'{}'),true);

 if p_role='barber' then
   insert into public.barbers(tenant_id,user_id,name,active)
   values(p_tenant,p_user,p_name,true)
   returning id into b;

   insert into public.barber_units(tenant_id,barber_id,unit_id)
   select p_tenant,b,u.id from public.units u
   where u.tenant_id=p_tenant and u.active
   on conflict do nothing;

   insert into public.barber_services(tenant_id,barber_id,service_id)
   select p_tenant,b,s.id from public.services s
   where s.tenant_id=p_tenant and s.active
   on conflict do nothing;
 end if;

 perform private.log(p_tenant,null,'member.created',p_user,jsonb_build_object('role',p_role));
 return p_user;
end
$function$;

create or replace function public.auto_link_new_service_to_barbers()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
 if new.active then
   insert into public.barber_services(tenant_id,barber_id,service_id)
   select new.tenant_id,b.id,new.id
   from public.barbers b
   where b.tenant_id=new.tenant_id and b.active
   on conflict do nothing;
 end if;
 return new;
end
$function$;

drop trigger if exists trg_auto_link_new_service_to_barbers on public.services;
create trigger trg_auto_link_new_service_to_barbers
after insert on public.services
for each row execute function public.auto_link_new_service_to_barbers();

insert into public.barber_services(tenant_id,barber_id,service_id)
select b.tenant_id,b.id,s.id
from public.barbers b
join public.services s on s.tenant_id=b.tenant_id and s.active
where b.active
  and exists(
    select 1 from public.weekly_windows w
    where w.tenant_id=b.tenant_id and w.barber_id=b.id
  )
on conflict do nothing;
