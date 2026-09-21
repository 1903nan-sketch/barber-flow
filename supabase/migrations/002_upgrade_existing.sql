-- BARBER FLOW - ATUALIZACAO SEGURA DO BANCO EXISTENTE
-- As tabelas antigas conflitantes sao preservadas com o prefixo legacy_.
do $$
declare t text;
begin
  if to_regclass('public.platform_admins') is null then
    foreach t in array array['plans','units','barbers','clients','services','appointments'] loop
      if to_regclass('public.' || t) is not null
         and to_regclass('public.legacy_' || t) is null then
        execute format('alter table public.%I rename to %I', t, 'legacy_' || t);
      end if;
    end loop;
  end if;
end $$;

begin;
create schema if not exists private;
revoke all on schema private from public;
create table public.platform_admins (user_id uuid primary key references auth.users(id));
create table public.plans (id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 80), monthly_cents integer not null default 0 check(monthly_cents>=0), extra_unit_cents integer not null default 5000 check(extra_unit_cents>=0));
create table public.tenants (id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120), slug text not null unique check(slug ~ '^[a-z][a-z0-9-]{2,60}$'), status text not null default 'trial' check(status in ('trial','active','pending','overdue','suspended','blocked','cancelled')), plan_id uuid references public.plans(id), phone text not null default '', created_at timestamptz not null default now());
create table public.memberships (tenant_id uuid not null references public.tenants(id), user_id uuid not null references auth.users(id), name text not null, role text not null check(role in ('owner','manager','barber','reception')), permissions text[] not null default '{}', active boolean not null default true, primary key(tenant_id,user_id));
create table public.units (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), name text not null check(length(name) between 1 and 100), timezone text not null default 'America/Sao_Paulo', active boolean not null default true, unique(tenant_id,id));
create table public.barbers (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), user_id uuid not null, name text not null, active boolean not null default true, foreign key(tenant_id,user_id) references public.memberships(tenant_id,user_id), unique(tenant_id,id), unique(tenant_id,user_id));
create table public.barber_units (tenant_id uuid not null, barber_id uuid not null, unit_id uuid not null, primary key(tenant_id,barber_id,unit_id), foreign key(tenant_id,barber_id) references public.barbers(tenant_id,id), foreign key(tenant_id,unit_id) references public.units(tenant_id,id));
create table public.clients (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), name text not null check(length(name) between 1 and 120), phone text not null default '', whatsapp text not null default '', email text not null default '', birthday date, notes text not null default '', created_at timestamptz not null default now(), unique(tenant_id,id));
create table public.services (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), name text not null check(length(name) between 1 and 120), description text not null default '', duration integer not null check(duration between 5 and 480), price_cents integer not null check(price_cents>=0), commission_bps integer not null default 0 check(commission_bps between 0 and 10000), active boolean not null default true, unique(tenant_id,id));
create table public.barber_services (tenant_id uuid not null, barber_id uuid not null, service_id uuid not null, primary key(tenant_id,barber_id,service_id), foreign key(tenant_id,barber_id) references public.barbers(tenant_id,id), foreign key(tenant_id,service_id) references public.services(tenant_id,id));
create table public.weekly_windows (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, barber_id uuid not null, unit_id uuid not null, weekday integer not null check(weekday between 0 and 6), start_min integer not null check(start_min>=0), end_min integer not null check(end_min<=1440 and end_min>start_min), step_min integer not null default 15 check(step_min between 5 and 120), foreign key(tenant_id,barber_id,unit_id) references public.barber_units(tenant_id,barber_id,unit_id));
create table public.schedule_exceptions (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, barber_id uuid not null, unit_id uuid not null, starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at), kind text not null check(kind in ('block','day_off','vacation')), reason text not null default '', actor_id uuid not null references auth.users(id), created_at timestamptz not null default now(), foreign key(tenant_id,barber_id,unit_id) references public.barber_units(tenant_id,barber_id,unit_id));
create table public.appointments (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, unit_id uuid not null, barber_id uuid not null, client_id uuid not null, service_id uuid not null, starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at), status text not null default 'scheduled' check(status in ('scheduled','present','in_service','completed','no_show','cancelled')), price_cents integer not null, commission_bps integer not null, created_by uuid not null references auth.users(id), cancelled_by uuid references auth.users(id), cancelled_at timestamptz, cancellation_reason text, created_at timestamptz not null default now(), foreign key(tenant_id,barber_id,unit_id) references public.barber_units(tenant_id,barber_id,unit_id), foreign key(tenant_id,client_id) references public.clients(tenant_id,id), foreign key(tenant_id,service_id) references public.services(tenant_id,id));
create index appointments_barber_time on public.appointments(tenant_id,barber_id,starts_at,ends_at);
create index exceptions_barber_time on public.schedule_exceptions(tenant_id,barber_id,starts_at,ends_at);
create index weekly_barber_day on public.weekly_windows(tenant_id,barber_id,weekday);
create index clients_tenant_name on public.clients(tenant_id,name);
create table public.audit_events (id bigint generated always as identity primary key, tenant_id uuid references public.tenants(id), unit_id uuid, actor_id uuid references auth.users(id), action text not null, entity_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now());
create index audit_tenant_time on public.audit_events(tenant_id,created_at desc);

create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.platform_admins where user_id=auth.uid()) $$;
create function private.member(t uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.memberships m join public.tenants t on t.id=m.tenant_id where m.tenant_id=$1 and m.user_id=auth.uid() and m.active and t.status in ('trial','active','pending','overdue')) $$;
create function private.can(t uuid,p text) returns boolean language sql stable security definer set search_path='' as $$ select private.member(t) and exists(select 1 from public.memberships m where m.tenant_id=t and m.user_id=auth.uid() and (m.role='owner' or (m.role in ('manager','reception') and p=any(m.permissions)) or (m.role='barber' and p='booking' and p=any(m.permissions)))) $$;
create function private.own_barber(t uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.member(t) and exists(select 1 from public.barbers where tenant_id=t and id=b and user_id=auth.uid() and active) $$;
create function private.agenda(t uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.can(t,'agenda') or private.own_barber(t,b) $$;
create function private.log(t uuid,u uuid,a text,e uuid,d jsonb) returns void language sql security definer set search_path='' as $$ insert into public.audit_events(tenant_id,unit_id,actor_id,action,entity_id,details) values(t,u,auth.uid(),a,e,d) $$;

-- No browser role can mutate tables. All writes use narrowly checked atomic RPCs.
do $$ declare n text; begin foreach n in array array['platform_admins','plans','tenants','memberships','units','barbers','barber_units','clients','services','barber_services','weekly_windows','schedule_exceptions','appointments','audit_events'] loop execute format('alter table public.%I enable row level security',n); execute format('revoke all on public.%I from anon,authenticated',n); execute format('grant select on public.%I to authenticated',n); end loop; end $$;
create policy admins_self on public.platform_admins for select to authenticated using(user_id=auth.uid());
create policy plans_read on public.plans for select to authenticated using(private.is_admin() or exists(select 1 from public.memberships where user_id=auth.uid()));
create policy tenants_read on public.tenants for select to authenticated using(private.is_admin() or exists(select 1 from public.memberships m where m.tenant_id=id and m.user_id=auth.uid() and m.active));
create policy memberships_read on public.memberships for select to authenticated using(private.is_admin() or user_id=auth.uid() or private.can(tenant_id,'team'));
create policy units_read on public.units for select to authenticated using(private.is_admin() or private.member(tenant_id));
create policy barbers_read on public.barbers for select to authenticated using(private.member(tenant_id));
create policy barber_units_read on public.barber_units for select to authenticated using(private.member(tenant_id));
create policy services_read on public.services for select to authenticated using(private.member(tenant_id));
create policy barber_services_read on public.barber_services for select to authenticated using(private.member(tenant_id));
create policy weekly_read on public.weekly_windows for select to authenticated using(private.agenda(tenant_id,barber_id));
create policy exceptions_read on public.schedule_exceptions for select to authenticated using(private.agenda(tenant_id,barber_id));
create policy appointments_read on public.appointments for select to authenticated using(private.agenda(tenant_id,barber_id));
create policy clients_read on public.clients for select to authenticated using(private.can(tenant_id,'clients') or private.can(tenant_id,'agenda') or exists(select 1 from public.appointments a where a.tenant_id=clients.tenant_id and a.client_id=clients.id and private.own_barber(a.tenant_id,a.barber_id)));
create policy audit_read on public.audit_events for select to authenticated using(private.is_admin() or private.can(tenant_id,'audit') or (private.member(tenant_id) and actor_id=auth.uid()));

create function public.admin_save(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid; o uuid; k text:=p->>'kind'; begin
 if not private.is_admin() then raise exception 'Acesso restrito ao Super Admin' using errcode='42501'; end if;
 if k='plan' then
  t:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid());
  insert into public.plans(id,name,monthly_cents,extra_unit_cents) values(t,p->>'name',(p->>'monthly_cents')::int,coalesce((p->>'extra_unit_cents')::int,5000)) on conflict(id) do update set name=excluded.name,monthly_cents=excluded.monthly_cents,extra_unit_cents=excluded.extra_unit_cents;
  perform private.log(null,null,'plan.saved',t,p-'kind');
 elsif k='tenant' then
  t:=nullif(p->>'id','')::uuid;
  if t is null then
   select id into o from auth.users where lower(email)=lower(p->>'owner_email');
   if o is null then raise exception 'O proprietário precisa criar sua conta primeiro'; end if;
   insert into public.tenants(name,slug,phone,plan_id) values(p->>'name',p->>'slug',coalesce(p->>'phone',''),nullif(p->>'plan_id','')::uuid) returning id into t;
   insert into public.memberships(tenant_id,user_id,name,role) values(t,o,p->>'owner_name','owner');
   insert into public.units(tenant_id,name) values(t,'Matriz');
  else
   update public.tenants set name=p->>'name',status=p->>'status',phone=coalesce(p->>'phone',''),plan_id=nullif(p->>'plan_id','')::uuid where id=t;
   if not found then raise exception 'Empresa não encontrada'; end if;
  end if;
  perform private.log(t,null,'tenant.saved',t,p-'owner_email');
 else raise exception 'Operação inválida'; end if;
 return t;
end $$;

create function public.save_record(t uuid,k text,p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare i uuid:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid()); u uuid; b uuid; begin
 if k='client' then
  if not private.can(t,'clients') then raise exception 'Sem permissão para clientes' using errcode='42501'; end if;
  insert into public.clients(id,tenant_id,name,phone,whatsapp,email,birthday,notes) values(i,t,p->>'name',coalesce(p->>'phone',''),coalesce(p->>'whatsapp',''),coalesce(p->>'email',''),nullif(p->>'birthday','')::date,coalesce(p->>'notes','')) on conflict(id) do update set name=excluded.name,phone=excluded.phone,whatsapp=excluded.whatsapp,email=excluded.email,birthday=excluded.birthday,notes=excluded.notes where clients.tenant_id=t;
 elsif k='unit' then
  if not private.can(t,'settings') then raise exception 'Sem permissão para unidades' using errcode='42501'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=coalesce(p->>'timezone','America/Sao_Paulo')) then raise exception 'Fuso horário inválido'; end if;
  insert into public.units(id,tenant_id,name,timezone) values(i,t,p->>'name',coalesce(p->>'timezone','America/Sao_Paulo')) on conflict(id) do update set name=excluded.name where units.tenant_id=t;
 elsif k='service' then
  if not private.can(t,'services') then raise exception 'Sem permissão para serviços' using errcode='42501'; end if;
  insert into public.services(id,tenant_id,name,description,duration,price_cents,commission_bps,active) values(i,t,p->>'name',coalesce(p->>'description',''),(p->>'duration')::int,(p->>'price_cents')::int,coalesce((p->>'commission_bps')::int,0),coalesce((p->>'active')::boolean,true)) on conflict(id) do update set name=excluded.name,description=excluded.description,duration=excluded.duration,price_cents=excluded.price_cents,commission_bps=excluded.commission_bps,active=excluded.active where services.tenant_id=t;
 elsif k='member' then
  if not private.can(t,'team') then raise exception 'Sem permissão para equipe' using errcode='42501'; end if;
  -- Only owners may grant roles and permissions, even if team viewing is delegated.
  if not exists(select 1 from public.memberships where tenant_id=t and user_id=auth.uid() and role='owner') then raise exception 'Somente o proprietário altera acessos' using errcode='42501'; end if;
  select id into u from auth.users where lower(email)=lower(p->>'email');
  if u is null then raise exception 'O funcionário precisa criar sua conta primeiro'; end if;
  if p->>'role' not in ('barber','manager','reception') then raise exception 'Função inválida'; end if;
  if exists(select 1 from public.memberships where tenant_id=t and user_id=u and role='owner') then raise exception 'O acesso do proprietário não pode ser alterado aqui'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(p->'permissions','[]')) v where v not in ('agenda','booking','clients','services','team','settings','audit')) then raise exception 'Permissão inválida'; end if;
  insert into public.memberships(tenant_id,user_id,name,role,permissions,active) values(t,u,p->>'name',p->>'role',array(select jsonb_array_elements_text(coalesce(p->'permissions','[]'))),coalesce((p->>'active')::boolean,true)) on conflict(tenant_id,user_id) do update set name=excluded.name,role=excluded.role,permissions=excluded.permissions,active=excluded.active;
  if p->>'role'='barber' then
   insert into public.barbers(tenant_id,user_id,name,active) values(t,u,p->>'name',coalesce((p->>'active')::boolean,true)) on conflict(tenant_id,user_id) do update set name=excluded.name,active=excluded.active returning id into b;
  else update public.barbers set active=false where tenant_id=t and user_id=u; end if;
  i:=u;
 elsif k='qualification' then
  if not private.can(t,'services') then raise exception 'Sem permissão' using errcode='42501'; end if;
  insert into public.barber_services(tenant_id,barber_id,service_id) values(t,(p->>'barber_id')::uuid,(p->>'service_id')::uuid) on conflict do nothing;
 elsif k='assignment' then
  b:=(p->>'barber_id')::uuid;
  if not private.agenda(t,b) then raise exception 'Sem permissão' using errcode='42501'; end if;
  insert into public.barber_units(tenant_id,barber_id,unit_id) values(t,b,(p->>'unit_id')::uuid) on conflict do nothing;
 else raise exception 'Operação inválida'; end if;
 perform private.log(t,null,k||'.saved',i,p-'email'-'phone'-'whatsapp'-'notes'-'birthday');
 return i;
end $$;

-- Weekly windows are separate from date-specific exceptions. Split windows represent lunch.
create function public.save_week(t uuid,b uuid,p jsonb) returns void language plpgsql security definer set search_path='' as $$
declare w jsonb; begin
 if not private.agenda(t,b) then raise exception 'Sem permissão para esta agenda' using errcode='42501'; end if;
 perform 1 from public.barbers where tenant_id=t and id=b for update;
 if jsonb_typeof(p)<>'array' or jsonb_array_length(p)>56 then raise exception 'Rotina inválida'; end if;
 delete from public.weekly_windows where tenant_id=t and barber_id=b;
 for w in select * from jsonb_array_elements(p) loop
  insert into public.weekly_windows(tenant_id,barber_id,unit_id,weekday,start_min,end_min,step_min) values(t,b,(w->>'unit_id')::uuid,(w->>'weekday')::int,(w->>'start_min')::int,(w->>'end_min')::int,coalesce((w->>'step_min')::int,15));
 end loop;
 if exists(select 1 from public.weekly_windows a join public.weekly_windows c on a.tenant_id=c.tenant_id and a.barber_id=c.barber_id and a.weekday=c.weekday and a.id<>c.id and a.start_min<c.end_min and c.start_min<a.end_min where a.tenant_id=t and a.barber_id=b) then raise exception 'Há períodos sobrepostos na rotina semanal'; end if;
 perform private.log(t,null,'schedule.week_updated',b,p);
end $$;

create function private.available(t uuid,u uuid,b uuid,s uuid,st timestamptz,ignore_id uuid default null) returns boolean language plpgsql stable security definer set search_path='' as $$
declare tz text; mins int; localst timestamp; en timestamptz; dur int; begin
 select timezone into tz from public.units where tenant_id=t and id=u and active;
 select duration into dur from public.services where tenant_id=t and id=s and active;
 if tz is null or dur is null or st<now() or st>now()+interval '180 days' or date_trunc('minute',st)<>st then return false; end if;
 if not exists(select 1 from public.tenants where id=t and status in ('trial','active','pending','overdue')) or not exists(select 1 from public.barbers br join public.memberships m on m.tenant_id=br.tenant_id and m.user_id=br.user_id where br.tenant_id=t and br.id=b and br.active and m.active and m.role='barber') then return false; end if;
 if not exists(select 1 from public.barber_services where tenant_id=t and barber_id=b and service_id=s) then return false; end if;
 localst:=st at time zone tz; mins:=extract(hour from localst)::int*60+extract(minute from localst)::int; en:=st+make_interval(mins=>dur);
 return exists(select 1 from public.weekly_windows where tenant_id=t and barber_id=b and unit_id=u and weekday=extract(dow from localst)::int and mins>=start_min and mins+dur<=end_min and (mins-start_min)%step_min=0)
 and not exists(select 1 from public.schedule_exceptions where tenant_id=t and barber_id=b and starts_at<en and ends_at>st)
 and not exists(select 1 from public.appointments where tenant_id=t and barber_id=b and status in ('scheduled','present','in_service','completed','no_show') and starts_at<en and ends_at>st and (ignore_id is null or id<>ignore_id));
end $$;
create function public.available_slots(t uuid,u uuid,b uuid,s uuid,d date) returns table(starts_at timestamptz,barber_id uuid) language plpgsql stable security definer set search_path='' as $$
begin
 if not private.member(t) then raise exception 'Acesso negado' using errcode='42501'; end if;
 return query select distinct ((d::timestamp + make_interval(mins=>g.m)) at time zone un.timezone),w.barber_id from public.weekly_windows w join public.units un on un.tenant_id=w.tenant_id and un.id=w.unit_id cross join lateral generate_series(w.start_min,w.end_min-1,w.step_min) g(m) where w.tenant_id=t and w.unit_id=u and (b is null or w.barber_id=b) and w.weekday=extract(dow from d)::int and private.available(t,u,w.barber_id,s,(d::timestamp+make_interval(mins=>g.m)) at time zone un.timezone) order by 1;
end $$;

create function public.book_appointment(t uuid,u uuid,b uuid,c uuid,s uuid,st timestamptz,existing_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare i uuid; sv public.services; old public.appointments; begin
 if not (private.can(t,'agenda') or (private.own_barber(t,b) and private.can(t,'booking')) or (existing_id is not null and private.own_barber(t,b))) then raise exception 'Sem permissão para agendar' using errcode='42501'; end if;
 perform 1 from public.barbers where tenant_id=t and id=b for update;
 if not found then raise exception 'Profissional inválido'; end if;
 if existing_id is not null then
  select * into old from public.appointments where tenant_id=t and id=existing_id for update;
  if old.id is null or old.barber_id<>b or old.status not in ('scheduled','present') then raise exception 'Agendamento não pode ser alterado'; end if;
 end if;
 perform 1 from public.services where tenant_id=t and id=s for share;
 if not private.available(t,u,b,s,st,existing_id) then raise exception 'Horário indisponível. Atualize a agenda.' using errcode='P0001'; end if;
 select * into sv from public.services where tenant_id=t and id=s;
 if existing_id is null then
  insert into public.appointments(tenant_id,unit_id,barber_id,client_id,service_id,starts_at,ends_at,price_cents,commission_bps,created_by) values(t,u,b,c,s,st,st+make_interval(mins=>sv.duration),sv.price_cents,sv.commission_bps,auth.uid()) returning id into i;
 else
  i:=existing_id;
  update public.appointments set unit_id=u,starts_at=st,ends_at=st+make_interval(mins=>sv.duration),service_id=s,client_id=c,price_cents=sv.price_cents,commission_bps=sv.commission_bps where tenant_id=t and id=i;
 end if;
 perform private.log(t,u,case when existing_id is null then 'appointment.created' else 'appointment.rescheduled' end,i,jsonb_build_object('previous',to_jsonb(old),'starts_at',st,'barber_id',b));
 return i;
end $$;

create function public.set_appointment_status(t uuid,i uuid,new_status text,reason text default '') returns void language plpgsql security definer set search_path='' as $$
declare a public.appointments; begin
 select * into a from public.appointments where tenant_id=t and id=i;
 if a.id is null or not private.agenda(t,a.barber_id) then raise exception 'Sem permissão' using errcode='42501'; end if;
 perform 1 from public.barbers where tenant_id=t and id=a.barber_id for update;
 select * into a from public.appointments where tenant_id=t and id=i for update;
 if not ((a.status='scheduled' and new_status in ('present','no_show','cancelled')) or (a.status='present' and new_status in ('in_service','cancelled','no_show')) or (a.status='in_service' and new_status='completed')) then raise exception 'Mudança de status inválida'; end if;
 update public.appointments set status=new_status,cancelled_by=case when new_status='cancelled' then auth.uid() end,cancelled_at=case when new_status='cancelled' then now() end,cancellation_reason=case when new_status='cancelled' then reason end where tenant_id=t and id=i;
 perform private.log(t,a.unit_id,'appointment.'||new_status,i,jsonb_build_object('before',a.status,'reason',reason,'barber_id',a.barber_id,'client_id',a.client_id));
end $$;

create function public.block_period(t uuid,u uuid,b uuid,st timestamptz,en timestamptz,kind text,reason text,confirmed_ids uuid[] default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare affected jsonb; ids uuid[]; i uuid; begin
 if not private.agenda(t,b) then raise exception 'Sem permissão' using errcode='42501'; end if;
 if st>=en or en-st>interval '366 days' then raise exception 'Período inválido'; end if;
 perform 1 from public.barbers where tenant_id=t and id=b for update;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'client',c.name,'service',s.name,'starts_at',a.starts_at,'unit',un.name) order by a.id),'[]'),coalesce(array_agg(a.id order by a.id),'{}'::uuid[]) into affected,ids from public.appointments a join public.clients c on c.tenant_id=a.tenant_id and c.id=a.client_id join public.services s on s.tenant_id=a.tenant_id and s.id=a.service_id join public.units un on un.tenant_id=a.tenant_id and un.id=a.unit_id where a.tenant_id=t and a.barber_id=b and a.status in ('scheduled','present','in_service') and a.starts_at<en and a.ends_at>st;
 if confirmed_ids is null or (select coalesce(array_agg(x order by x),'{}'::uuid[]) from unnest(confirmed_ids) x)<>ids then return jsonb_build_object('needs_confirmation',true,'affected',affected); end if;
 if exists(select 1 from public.appointments where tenant_id=t and id=any(ids) and status='in_service') then raise exception 'Finalize o atendimento em andamento antes de bloquear'; end if;
 insert into public.schedule_exceptions(tenant_id,unit_id,barber_id,starts_at,ends_at,kind,reason,actor_id) values(t,u,b,st,en,kind,coalesce(reason,''),auth.uid()) returning id into i;
 update public.appointments set status='cancelled',cancelled_by=auth.uid(),cancelled_at=now(),cancellation_reason=reason where tenant_id=t and id=any(ids);
 perform private.log(t,u,'schedule.blocked',i,jsonb_build_object('barber_id',b,'starts_at',st,'ends_at',en,'reason',reason,'affected',affected));
 return jsonb_build_object('needs_confirmation',false,'id',i,'affected',affected);
end $$;

-- Explicit allowlist: no anonymous bookings/cancellations or direct writes in this foundation.
revoke all on all functions in schema public from public,anon,authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_admin(),private.member(uuid),private.can(uuid,text),private.own_barber(uuid,uuid),private.agenda(uuid,uuid) to authenticated;
grant execute on function public.admin_save(jsonb),public.save_record(uuid,text,jsonb),public.save_week(uuid,uuid,jsonb),public.available_slots(uuid,uuid,uuid,uuid,date),public.book_appointment(uuid,uuid,uuid,uuid,uuid,timestamptz,uuid),public.set_appointment_status(uuid,uuid,text,text),public.block_period(uuid,uuid,uuid,timestamptz,timestamptz,text,text,uuid[]) to authenticated;
commit;

-- Ativa o administrador mestre e cria os planos comerciais iniciais.
begin;
insert into public.platform_admins(user_id)
select id from auth.users where lower(email)=lower('1903nan@gmail.com')
on conflict(user_id) do nothing;

insert into public.plans(name,monthly_cents,extra_unit_cents)
select 'Start',8990,5000 where not exists(select 1 from public.plans where lower(name)='start');
insert into public.plans(name,monthly_cents,extra_unit_cents)
select 'Pro',14990,5000 where not exists(select 1 from public.plans where lower(name)='pro');
insert into public.plans(name,monthly_cents,extra_unit_cents)
select 'Premium',24990,5000 where not exists(select 1 from public.plans where lower(name)='premium');
commit;
