-- Barber Flow: site publico multi-tenant e agendamento real
begin;

alter table public.tenants add column if not exists logo_url text not null default '';
alter table public.tenants add column if not exists cover_url text not null default '';
alter table public.tenants add column if not exists description text not null default '';
alter table public.tenants add column if not exists whatsapp text not null default '';
alter table public.tenants add column if not exists address text not null default '';
alter table public.tenants add column if not exists instagram text not null default '';
alter table public.tenants add column if not exists public_info text not null default '';
alter table public.tenants add column if not exists public_site_enabled boolean not null default true;
alter table public.plans add column if not exists max_barbers integer not null default 3 check(max_barbers > 0);
alter table public.plans add column if not exists max_units integer not null default 1 check(max_units > 0);
alter table public.appointments alter column created_by drop not null;
alter table public.appointments add column if not exists source text not null default 'internal' check(source in ('internal','public'));

update public.plans set max_barbers=3,max_units=1 where lower(name)='start';
update public.plans set max_barbers=8,max_units=2 where lower(name)='pro';
update public.plans set max_barbers=30,max_units=10 where lower(name)='premium';

create or replace function private.tenant_open(t uuid) returns boolean
language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.tenants where id=t and status in ('trial','active','pending','overdue')) $$;

create or replace function public.public_booking_data(p_slug text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.tenants; mb int; mu int; result jsonb;
begin
 select * into t from public.tenants where slug=lower(trim(p_slug));
 if t.id is null then return jsonb_build_object('state','not_found'); end if;
 if t.status not in ('trial','active','pending','overdue') or not t.public_site_enabled then
  return jsonb_build_object('state','unavailable','name',t.name);
 end if;
 select coalesce(p.max_barbers,3),coalesce(p.max_units,1) into mb,mu from public.plans p where p.id=t.plan_id;
 mb:=coalesce(mb,3); mu:=coalesce(mu,1);
 select jsonb_build_object(
  'state','open',
  'tenant',jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug,'logo_url',t.logo_url,'cover_url',t.cover_url,'description',t.description,'phone',t.phone,'whatsapp',t.whatsapp,'address',t.address,'instagram',t.instagram,'public_info',t.public_info),
  'units',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (select u.id,u.name,u.timezone from public.units u where u.tenant_id=t.id and u.active order by u.name limit mu) x),'[]'::jsonb),
  'services',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (select s.id,s.name,s.description,s.duration,s.price_cents from public.services s where s.tenant_id=t.id and s.active order by s.name) x),'[]'::jsonb),
  'barbers',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (select b.id,b.name from public.barbers b join public.memberships m on m.tenant_id=b.tenant_id and m.user_id=b.user_id where b.tenant_id=t.id and b.active and m.active order by b.name limit mb) x),'[]'::jsonb),
  'barber_units',coalesce((select jsonb_agg(jsonb_build_object('barber_id',bu.barber_id,'unit_id',bu.unit_id)) from public.barber_units bu where bu.tenant_id=t.id),'[]'::jsonb),
  'barber_services',coalesce((select jsonb_agg(jsonb_build_object('barber_id',bs.barber_id,'service_id',bs.service_id)) from public.barber_services bs where bs.tenant_id=t.id),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create or replace function public.public_available_slots(p_slug text,p_unit uuid,p_barber uuid,p_service uuid,p_date date)
returns table(starts_at timestamptz) language plpgsql stable security definer set search_path='' as $$
declare t uuid;
begin
 select id into t from public.tenants where slug=lower(trim(p_slug)) and status in ('trial','active','pending','overdue') and public_site_enabled;
 if t is null or p_date<current_date or p_date>current_date+90 then return; end if;
 return query
 select distinct ((p_date::timestamp+make_interval(mins=>g.m)) at time zone u.timezone)
 from public.weekly_windows w
 join public.units u on u.tenant_id=w.tenant_id and u.id=w.unit_id and u.active
 cross join lateral generate_series(w.start_min,w.end_min-1,w.step_min) g(m)
 where w.tenant_id=t and w.unit_id=p_unit and w.barber_id=p_barber
 and w.weekday=extract(dow from p_date)::int
 and private.available(t,p_unit,p_barber,p_service,(p_date::timestamp+make_interval(mins=>g.m)) at time zone u.timezone)
 order by 1;
end $$;

create or replace function public.public_book(p_slug text,p_unit uuid,p_barber uuid,p_service uuid,p_starts_at timestamptz,p_name text,p_phone text,p_email text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tenants; c uuid; a uuid; sv public.services; un public.units; br public.barbers; normalized text;
begin
 select * into t from public.tenants where slug=lower(trim(p_slug)) and status in ('trial','active','pending','overdue') and public_site_enabled;
 if t.id is null then raise exception 'Agendamento indisponível no momento'; end if;
 if length(trim(p_name))<2 or length(trim(p_phone))<8 then raise exception 'Informe nome e telefone válidos'; end if;
 normalized:=regexp_replace(p_phone,'[^0-9]','','g');
 select * into un from public.units where id=p_unit and tenant_id=t.id and active;
 select * into sv from public.services where id=p_service and tenant_id=t.id and active;
 select * into br from public.barbers where id=p_barber and tenant_id=t.id and active for update;
 if un.id is null or sv.id is null or br.id is null then raise exception 'Unidade, serviço ou profissional inválido'; end if;
 if not private.available(t.id,p_unit,p_barber,p_service,p_starts_at) then raise exception 'Este horário acabou de ficar indisponível. Escolha outro.'; end if;
 select id into c from public.clients where tenant_id=t.id and regexp_replace(coalesce(phone,whatsapp),'[^0-9]','','g')=normalized order by created_at limit 1;
 if c is null then
  insert into public.clients(tenant_id,name,phone,whatsapp,email) values(t.id,trim(p_name),p_phone,p_phone,coalesce(p_email,'')) returning id into c;
 else
  update public.clients set name=trim(p_name),phone=p_phone,whatsapp=p_phone,email=case when coalesce(p_email,'')='' then email else p_email end where id=c and tenant_id=t.id;
 end if;
 insert into public.appointments(tenant_id,unit_id,barber_id,client_id,service_id,starts_at,ends_at,status,price_cents,commission_bps,created_by,source)
 values(t.id,p_unit,p_barber,c,p_service,p_starts_at,p_starts_at+make_interval(mins=>sv.duration),'scheduled',sv.price_cents,sv.commission_bps,null,'public') returning id into a;
 insert into public.audit_events(tenant_id,unit_id,actor_id,action,entity_id,details) values(t.id,p_unit,null,'appointment.public_created',a,jsonb_build_object('barber_id',p_barber,'client_id',c));
 return jsonb_build_object('id',a,'barbershop',t.name,'unit',un.name,'service',sv.name,'barber',br.name,'starts_at',p_starts_at,'price_cents',sv.price_cents,'duration',sv.duration,'phone',t.phone,'whatsapp',t.whatsapp);
end $$;

create or replace function public.save_site_settings(t uuid,p jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.can(t,'settings') then raise exception 'Sem permissão para configurações' using errcode='42501'; end if;
 update public.tenants set
  name=coalesce(nullif(trim(p->>'name'),''),name), logo_url=coalesce(p->>'logo_url',''), cover_url=coalesce(p->>'cover_url',''),
  description=coalesce(p->>'description',''), phone=coalesce(p->>'phone',''), whatsapp=coalesce(p->>'whatsapp',''),
  address=coalesce(p->>'address',''), instagram=coalesce(p->>'instagram',''), public_info=coalesce(p->>'public_info',''),
  public_site_enabled=coalesce((p->>'public_site_enabled')::boolean,true)
 where id=t;
 perform private.log(t,null,'site.settings_saved',t,p-'phone'-'whatsapp');
end $$;

create or replace function public.admin_provision_tenant(p_admin uuid,p_owner uuid,p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare t uuid;
begin
 if not exists(select 1 from public.platform_admins where user_id=p_admin) then raise exception 'Acesso restrito'; end if;
 insert into public.tenants(name,slug,phone,whatsapp,plan_id,status) values(trim(p->>'name'),lower(trim(p->>'slug')),coalesce(p->>'phone',''),coalesce(p->>'phone',''),nullif(p->>'plan_id','')::uuid,'active') returning id into t;
 insert into public.memberships(tenant_id,user_id,name,role,permissions) values(t,p_owner,p->>'owner_name','owner','{agenda,booking,clients,services,team,settings,audit}');
 insert into public.units(tenant_id,name) values(t,'Matriz');
 return t;
end $$;

revoke all on function public.public_booking_data(text),public.public_available_slots(text,uuid,uuid,uuid,date),public.public_book(text,uuid,uuid,uuid,timestamptz,text,text,text),public.save_site_settings(uuid,jsonb),public.admin_provision_tenant(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.public_booking_data(text),public.public_available_slots(text,uuid,uuid,uuid,date),public.public_book(text,uuid,uuid,uuid,timestamptz,text,text,text) to anon,authenticated;
grant execute on function public.save_site_settings(uuid,jsonb) to authenticated;
grant execute on function public.admin_provision_tenant(uuid,uuid,jsonb) to service_role;
grant execute on function private.tenant_open(uuid) to authenticated;

commit;
