CREATE OR REPLACE FUNCTION private.available_multi(t uuid, u uuid, b uuid, service_ids uuid[], st timestamp with time zone, ignore_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tz text; localst timestamp; mins int; dur int; en timestamptz; cnt int;
begin
 select timezone into tz from public.units where tenant_id=t and id=u and active;
 select coalesce(sum(duration),0),count(*) into dur,cnt from public.services where tenant_id=t and id=any(service_ids) and active;
 if service_ids is null or cardinality(service_ids)=0 or st is null or tz is null or dur<=0 or cnt<>cardinality(service_ids) or st<now() or st>now()+interval '180 days' or date_trunc('minute',st)<>st then return false; end if;
 if not exists(select 1 from public.tenants where id=t and status in ('trial','active','pending','overdue')) or not exists(select 1 from public.barbers br join public.memberships m on m.tenant_id=br.tenant_id and m.user_id=br.user_id where br.tenant_id=t and br.id=b and br.active and m.active and m.role in ('barber','owner')) then return false; end if;
 if exists(select 1 from unnest(service_ids) x where not exists(select 1 from public.barber_services bs where bs.tenant_id=t and bs.barber_id=b and bs.service_id=x)) then return false; end if;
 if not exists(select 1 from public.barber_units where tenant_id=t and barber_id=b and unit_id=u) then return false; end if;
 localst:=st at time zone tz; mins:=extract(hour from localst)::int*60+extract(minute from localst)::int; en:=st+make_interval(mins=>dur);
 return exists(select 1 from public.weekly_windows where tenant_id=t and barber_id=b and unit_id=u and weekday=extract(dow from localst)::int and mins>=start_min and mins+dur<=end_min and (mins-start_min)%step_min=0)
 and not exists(select 1 from public.schedule_exceptions where tenant_id=t and barber_id=b and starts_at<en and ends_at>st)
 and not exists(select 1 from public.appointments where tenant_id=t and barber_id=b and status in ('scheduled','present','in_service','completed','no_show') and starts_at<en and ends_at>st and (ignore_id is null or id<>ignore_id));
end $function$;

CREATE OR REPLACE FUNCTION private.available(t uuid,u uuid,b uuid,s uuid,st timestamptz,ignore_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 select private.available_multi(t,u,b,array[s],st,ignore_id)
$$;

CREATE OR REPLACE FUNCTION public.save_record(t uuid, k text, p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i uuid:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid()); u uuid; b uuid; r text;
begin
 if not private.member(t) then raise exception 'Acesso negado' using errcode='42501'; end if;
 if k='client' then
  select role into r from public.memberships where tenant_id=t and user_id=auth.uid() and active=true limit 1;
  if not private.can(t,'clients') then raise exception 'Seu perfil não tem permissão para editar clientes' using errcode='42501'; end if;
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
  if not exists(select 1 from public.memberships where tenant_id=t and user_id=auth.uid() and role='owner') then raise exception 'Somente o proprietário altera acessos' using errcode='42501'; end if;
  select id into u from auth.users where lower(email)=lower(p->>'email');
  if u is null then raise exception 'O funcionário precisa criar sua conta primeiro'; end if;
  if p->>'role' not in ('barber','manager','reception') then raise exception 'Função inválida'; end if;
  if exists(select 1 from public.memberships where tenant_id=t and user_id=u and role='owner') then raise exception 'O acesso do proprietário não pode ser alterado aqui'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(p->'permissions','[]')) v where v not in ('agenda','booking','clients','services','team','settings','audit')) then raise exception 'Permissão inválida'; end if;
  insert into public.memberships(tenant_id,user_id,name,role,permissions,active) values(t,u,p->>'name',p->>'role',array(select jsonb_array_elements_text(coalesce(p->'permissions','[]'))),coalesce((p->>'active')::boolean,true)) on conflict(tenant_id,user_id) do update set name=excluded.name,role=excluded.role,permissions=excluded.permissions,active=excluded.active;
  if p->>'role'='barber' then insert into public.barbers(tenant_id,user_id,name,active) values(t,u,p->>'name',coalesce((p->>'active')::boolean,true)) on conflict(tenant_id,user_id) do update set name=excluded.name,active=excluded.active returning id into b; else update public.barbers set active=false where tenant_id=t and user_id=u; end if; i:=u;
 elsif k='qualification' then
  if not private.can(t,'services') then raise exception 'Sem permissão' using errcode='42501'; end if;
  insert into public.barber_services(tenant_id,barber_id,service_id) values(t,(p->>'barber_id')::uuid,(p->>'service_id')::uuid) on conflict do nothing;
 elsif k='assignment' then
  b:=(p->>'barber_id')::uuid;if not private.agenda(t,b) then raise exception 'Sem permissão' using errcode='42501'; end if;
  insert into public.barber_units(tenant_id,barber_id,unit_id) values(t,b,(p->>'unit_id')::uuid) on conflict do nothing;
 else raise exception 'Operação inválida'; end if;
 perform private.log(t,null,k||'.saved',i,p-'email'-'phone'-'whatsapp'-'notes'-'birthday'); return i;
end $function$;

CREATE OR REPLACE FUNCTION public.checkout_appointment(t uuid, a uuid, m text, p_pix_payload text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ap public.appointments; pay uuid; st text; usr uuid:=auth.uid();
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
 st:=case when m='account' then 'open' else 'paid' end;
 insert into public.appointment_payments(tenant_id,unit_id,appointment_id,client_id,barber_id,service_id,method,amount_cents,status,pix_payload,paid_at,created_by)
 values(t,ap.unit_id,a,ap.client_id,ap.barber_id,ap.service_id,m,ap.price_cents,st,case when m='pix' then coalesce(p_pix_payload,'') else '' end,case when st='paid' then now() else null end,usr) returning id into pay;
 update public.appointments set status='completed' where id=a and tenant_id=t;
 perform private.log(t,ap.unit_id,'appointment.checked_out',a,jsonb_build_object('payment_id',pay,'method',m,'amount_cents',ap.price_cents,'payment_status',st));
 return jsonb_build_object('payment_id',pay,'status',st,'amount_cents',ap.price_cents);
end $function$;

CREATE OR REPLACE FUNCTION public.quick_sale(t uuid, p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sid uuid; m text:=p->>'method'; st text; amount integer; c uuid; u uuid; b uuid;
begin
 if not private.can(t,'booking') and not private.can(t,'agenda') then raise exception 'Sem permissão para vender' using errcode='42501'; end if;
 amount:=coalesce((p->>'amount_cents')::int,0); if amount<=0 then raise exception 'Informe um valor válido'; end if;
 if m not in ('pix','cash','credit','debit','account') then raise exception 'Forma de pagamento inválida'; end if;
 c:=nullif(p->>'client_id','')::uuid;u:=nullif(p->>'unit_id','')::uuid;b:=nullif(p->>'barber_id','')::uuid;
 if c is not null and not exists(select 1 from public.clients where id=c and tenant_id=t) then raise exception 'Cliente inválido'; end if;
 if u is not null and not exists(select 1 from public.units where tenant_id=t and id=u and active) then raise exception 'Unidade inválida'; end if;
 if b is not null and not exists(select 1 from public.barbers where tenant_id=t and id=b and active) then raise exception 'Profissional inválido'; end if;
 if m='account' and c is null then raise exception 'Selecione o cliente para registrar saldo pendente'; end if;
 st:=case when m='account' then 'open' else 'paid' end;
 insert into public.quick_sales(tenant_id,unit_id,client_id,barber_id,description,amount_cents,method,status,pix_payload,paid_at,created_by)
 values(t,u,c,b,coalesce(nullif(trim(p->>'description'),''),'Venda avulsa'),amount,m,st,case when m='pix' then coalesce(p->>'pix_payload','') else '' end,case when st='paid' then now() else null end,auth.uid()) returning id into sid;
 perform private.log(t,u,'quick_sale.created',sid,jsonb_build_object('method',m,'amount_cents',amount,'client_id',c));
 return sid;
end $function$;

CREATE OR REPLACE FUNCTION public.public_book(p_slug text, p_unit uuid, p_barber uuid, p_service uuid, p_starts_at timestamp with time zone, p_name text, p_phone text, p_email text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.tenants; c uuid; a uuid; sv public.services; un public.units; br public.barbers; normalized text;
begin
 select * into t from public.tenants where slug=lower(trim(p_slug)) and status in ('trial','active','pending','overdue') and public_site_enabled;
 if t.id is null then raise exception 'Agendamento indisponível no momento'; end if;
 if length(trim(p_name))<2 or length(trim(p_phone))<8 then raise exception 'Informe nome e telefone válidos'; end if;
 normalized:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 if length(normalized) not between 10 and 15 or length(trim(coalesce(p_name,''))) not between 2 and 120 then raise exception 'Informe nome e telefone válidos'; end if;
 select * into un from public.units where id=p_unit and tenant_id=t.id and active;
 select * into sv from public.services where id=p_service and tenant_id=t.id and active;
 select * into br from public.barbers where id=p_barber and tenant_id=t.id and active for update;
 if un.id is null or sv.id is null or br.id is null then raise exception 'Unidade, serviço ou profissional inválido'; end if;
 if not private.available(t.id,p_unit,p_barber,p_service,p_starts_at,null) then raise exception 'Este horário acabou de ficar indisponível. Escolha outro.'; end if;
 select id into c from public.clients where tenant_id=t.id and regexp_replace(coalesce(nullif(phone,''),whatsapp),'[^0-9]','','g')=normalized order by created_at limit 1;
 if c is null then insert into public.clients(tenant_id,name,phone,whatsapp,email) values(t.id,trim(p_name),p_phone,p_phone,coalesce(p_email,'')) returning id into c;
 end if;
 insert into public.appointments(tenant_id,unit_id,barber_id,client_id,service_id,starts_at,ends_at,status,price_cents,commission_bps,created_by,source)
 values(t.id,p_unit,p_barber,c,p_service,p_starts_at,p_starts_at+make_interval(mins=>sv.duration),'scheduled',sv.price_cents,sv.commission_bps,null,'public') returning id into a;
 insert into public.audit_events(tenant_id,unit_id,actor_id,action,entity_id,details) values(t.id,p_unit,null,'appointment.public_created',a,jsonb_build_object('barber_id',p_barber,'client_id',c));
 return jsonb_build_object('id',a,'barbershop',t.name,'unit',un.name,'service',sv.name,'barber',br.name,'starts_at',p_starts_at,'price_cents',sv.price_cents,'duration',sv.duration,'phone',t.phone,'whatsapp',t.whatsapp);
end $function$;

CREATE OR REPLACE FUNCTION public.public_book_multi(p_slug text, p_unit uuid, p_barber uuid, p_services uuid[], p_starts_at timestamp with time zone, p_name text, p_phone text, p_email text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.tenants; c uuid; a uuid; un public.units; br public.barbers; normalized text; total int; dur int; first_service uuid; names text;
begin
 select * into t from public.tenants where slug=lower(trim(p_slug)) and status in ('trial','active','pending','overdue') and public_site_enabled;
 if t.id is null then raise exception 'Agendamento indisponível no momento'; end if;
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
 if c is null then insert into public.clients(tenant_id,name,phone,whatsapp,email) values(t.id,trim(p_name),p_phone,p_phone,coalesce(p_email,'')) returning id into c;
 end if;
 insert into public.appointments(tenant_id,unit_id,barber_id,client_id,service_id,starts_at,ends_at,status,price_cents,commission_bps,created_by,source)
 values(t.id,p_unit,p_barber,c,first_service,p_starts_at,p_starts_at+make_interval(mins=>dur),'scheduled',total,0,null,'public') returning id into a;
 insert into public.appointment_services(tenant_id,appointment_id,service_id,price_cents,duration)
 select t.id,a,id,price_cents,duration from public.services where tenant_id=t.id and id=any(p_services);
 insert into public.audit_events(tenant_id,unit_id,actor_id,action,entity_id,details) values(t.id,p_unit,null,'appointment.public_created',a,jsonb_build_object('barber_id',p_barber,'client_id',c,'services',p_services));
 return jsonb_build_object('id',a,'barbershop',t.name,'unit',un.name,'service',names,'barber',br.name,'starts_at',p_starts_at,'price_cents',total,'duration',dur,'phone',t.phone,'whatsapp',t.whatsapp);
end $function$;

CREATE OR REPLACE FUNCTION public.reschedule_appointment(t uuid,i uuid,st timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.appointments; tz text; localst timestamp; mins int; dur int; en timestamptz;
BEGIN
 select * into a from public.appointments where tenant_id=t and id=i;
 if a.id is null or not private.agenda(t,a.barber_id) then raise exception 'Sem permissão' using errcode='42501'; end if;
 perform 1 from public.barbers where tenant_id=t and id=a.barber_id for update;
 select * into a from public.appointments where tenant_id=t and id=i for update;
 if a.status not in ('scheduled','present') then raise exception 'Este atendimento não pode ser reagendado'; end if;
 select timezone into tz from public.units where tenant_id=t and id=a.unit_id and active;
 if st is null or tz is null or st<now() or st>now()+interval '180 days' or date_trunc('minute',st)<>st then raise exception 'Data inválida'; end if;
 dur:=ceil(extract(epoch from (a.ends_at-a.starts_at))/60)::int;
 en:=st+make_interval(mins=>dur); localst:=st at time zone tz;
 mins:=extract(hour from localst)::int*60+extract(minute from localst)::int;
 if not exists(select 1 from public.weekly_windows where tenant_id=t and barber_id=a.barber_id and unit_id=a.unit_id and weekday=extract(dow from localst)::int and mins>=start_min and mins+dur<=end_min and (mins-start_min)%step_min=0)
 or exists(select 1 from public.schedule_exceptions where tenant_id=t and barber_id=a.barber_id and starts_at<en and ends_at>st)
 or exists(select 1 from public.appointments where tenant_id=t and barber_id=a.barber_id and id<>i and status<>'cancelled' and starts_at<en and ends_at>st)
 then raise exception 'Horário indisponível. Escolha outro.'; end if;
 update public.appointments set starts_at=st,ends_at=en where tenant_id=t and id=i;
 perform private.log(t,a.unit_id,'appointment.rescheduled',i,jsonb_build_object('before',to_jsonb(a),'starts_at',st,'ends_at',en));
END $$;
REVOKE ALL ON FUNCTION public.reschedule_appointment(uuid,uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(uuid,uuid,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.book_appointment(t uuid, u uuid, b uuid, c uuid, s uuid, st timestamp with time zone, existing_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i uuid; sv public.services; old public.appointments; begin
 if not (private.can(t,'agenda') or (private.own_barber(t,b) and private.can(t,'booking')) or (existing_id is not null and private.own_barber(t,b))) then raise exception 'Sem permissão para agendar' using errcode='42501'; end if;
 perform 1 from public.barbers where tenant_id=t and id=b for update;
 if not found then raise exception 'Profissional inválido'; end if;
 if existing_id is not null then
  select * into old from public.appointments where tenant_id=t and id=existing_id for update;
  if old.id is null or old.barber_id<>b or old.status not in ('scheduled','present') then raise exception 'Agendamento não pode ser alterado'; end if;
 end if;
 perform 1 from public.services where tenant_id=t and id=s for share;
 if existing_id is not null then
  if old.unit_id<>u or old.client_id<>c or old.service_id<>s then raise exception 'No reagendamento, mantenha cliente, serviço e unidade'; end if;
  perform public.reschedule_appointment(t,existing_id,st); return existing_id;
 end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.settle_sale(t uuid,p_payment uuid,p_type text,m text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x jsonb; u uuid;
BEGIN
 if not (private.can(t,'clients') or private.can(t,'agenda')) then raise exception 'Sem permissão' using errcode='42501'; end if;
 if m is null or m not in ('pix','cash','credit','debit') then raise exception 'Forma de pagamento inválida'; end if;
 if p_type='quick' then
  select to_jsonb(q),q.unit_id into x,u from public.quick_sales q where q.tenant_id=t and q.id=p_payment and q.status='open' for update;
  if x is null then raise exception 'Saldo pendente não encontrado'; end if;
  update public.quick_sales set status='paid',method=m,paid_at=now() where tenant_id=t and id=p_payment;
 elsif p_type='appointment' then
  select to_jsonb(q),q.unit_id into x,u from public.appointment_payments q where q.tenant_id=t and q.id=p_payment and q.status='open' for update;
  if x is null then raise exception 'Saldo pendente não encontrado'; end if;
  update public.appointment_payments set status='paid',method=m,paid_at=now() where tenant_id=t and id=p_payment;
 else raise exception 'Tipo de venda inválido'; end if;
 perform private.log(t,u,'sale.settled',p_payment,jsonb_build_object('before',x,'method',m,'type',p_type));
END $$;
REVOKE ALL ON FUNCTION public.settle_sale(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.settle_sale(uuid,uuid,text,text) TO authenticated;


CREATE OR REPLACE FUNCTION public.owner_manage_sale(t uuid, sale_id uuid, sale_type text, action text, new_method text DEFAULT NULL::text, new_status text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not private.member(t) or not exists(select 1 from public.memberships where tenant_id=t and user_id=auth.uid() and role='owner' and active=true) then raise exception 'Somente o proprietário pode alterar o histórico financeiro' using errcode='42501'; end if;
 if action='delete' then
  if sale_type='quick' then update public.quick_sales set status='cancelled' where id=sale_id and tenant_id=t;
  elsif sale_type='appointment' then update public.appointment_payments set status='cancelled' where id=sale_id and tenant_id=t;
  else raise exception 'Tipo de venda inválido'; end if;
 elsif action='update' then
  if new_method not in ('pix','cash','credit','debit','account') then raise exception 'Forma de pagamento inválida'; end if;
  if new_status not in ('paid','open','cancelled') then raise exception 'Status inválido'; end if;
  if sale_type='quick' then update public.quick_sales set method=new_method,status=new_status,paid_at=case when new_status='paid' then coalesce(paid_at,now()) else null end where id=sale_id and tenant_id=t;
  elsif sale_type='appointment' then update public.appointment_payments set method=new_method,status=new_status,paid_at=case when new_status='paid' then coalesce(paid_at,now()) else null end where id=sale_id and tenant_id=t;
  else raise exception 'Tipo de venda inválido'; end if;
 else raise exception 'Ação inválida'; end if;
 perform private.log(t,null,'sale.'||action,sale_id,jsonb_build_object('type',sale_type,'method',new_method,'status',new_status));
end $function$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public' AND l.lanname IN ('sql','plpgsql') AND p.proname NOT IN ('public_booking_data','public_available_slots','public_book','public_available_slots_multi','public_book_multi') LOOP
 EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC,anon',f.signature);
 END LOOP;
END $$;
