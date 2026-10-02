-- Public multi-service bookings stored commission_bps = 0, so every appointment
-- created through the booking site lost the professional's commission.
-- Store the price-weighted commission of the booked services instead
-- (same rule used by book_appointment, which snapshots the service rate).
CREATE OR REPLACE FUNCTION public.public_book_multi(p_slug text, p_unit uuid, p_barber uuid, p_services uuid[], p_starts_at timestamp with time zone, p_name text, p_phone text, p_email text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.tenants; c uuid; a uuid; un public.units; br public.barbers; normalized text; total int; dur int; first_service uuid; names text; comm int;
begin
 select tn.* into t
 from public.tenants tn
 join public.plans p on p.id=tn.plan_id
 where tn.slug=lower(trim(p_slug))
   and tn.status in ('trial','active','pending','overdue')
   and tn.public_site_enabled
   and lower(p.name) <> 'starter';
 if t.id is null then raise exception 'Agendamento indisponível para este plano'; end if;
 if cardinality(p_services)=0 then raise exception 'Escolha pelo menos um serviço'; end if;
 if length(trim(p_name))<2 or length(trim(p_phone))<8 then raise exception 'Informe nome e telefone válidos'; end if;
 select coalesce(sum(price_cents),0),coalesce(sum(duration),0),string_agg(name,', ' order by name),coalesce(round(sum(price_cents::numeric*commission_bps)/nullif(sum(price_cents),0)),0)::int into total,dur,names,comm from public.services where tenant_id=t.id and id=any(p_services) and active;
 select id into first_service from public.services where tenant_id=t.id and id=any(p_services) and active order by name,id limit 1;
 if (select count(*) from public.services where tenant_id=t.id and id=any(p_services) and active)<>cardinality(p_services) then raise exception 'Serviço inválido'; end if;
 normalized:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 if length(normalized) not between 10 and 15 or length(trim(coalesce(p_name,''))) not between 2 and 120 then raise exception 'Informe nome e telefone válidos'; end if;
 select * into un from public.units where id=p_unit and tenant_id=t.id and active;
 select * into br from public.barbers where id=p_barber and tenant_id=t.id and active for update;
 if un.id is null or br.id is null then raise exception 'Unidade ou profissional inválido'; end if;
 if not private.available_multi(t.id,p_unit,p_barber,p_services,p_starts_at,null) then raise exception 'Este horário acabou de ficar indisponível. Escolha outro.'; end if;
 select id into c from public.clients where tenant_id=t.id and regexp_replace(coalesce(nullif(phone,''),whatsapp),'[^0-9]','','g')=normalized order by created_at limit 1;
 if c is null then insert into public.clients(tenant_id,name,phone,whatsapp,email) values(t.id,trim(p_name),p_phone,p_phone,coalesce(p_email,'')) returning id into c; end if;
 insert into public.appointments(tenant_id,unit_id,barber_id,client_id,service_id,starts_at,ends_at,status,price_cents,commission_bps,created_by,source)
 values(t.id,p_unit,p_barber,c,first_service,p_starts_at,p_starts_at+make_interval(mins=>dur),'scheduled',total,comm,null,'public') returning id into a;
 insert into public.appointment_services(tenant_id,appointment_id,service_id,price_cents,duration)
 select t.id,a,id,price_cents,duration from public.services where tenant_id=t.id and id=any(p_services);
 insert into public.audit_events(tenant_id,unit_id,actor_id,action,entity_id,details) values(t.id,p_unit,null,'appointment.public_created',a,jsonb_build_object('barber_id',p_barber,'client_id',c,'services',p_services));
 return jsonb_build_object('id',a,'barbershop',t.name,'unit',un.name,'service',names,'barber',br.name,'starts_at',p_starts_at,'price_cents',total,'duration',dur,'phone',t.phone,'whatsapp',t.whatsapp);
end $function$
;
