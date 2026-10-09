-- Foto dos serviços no site de agendamento, destaque do proprietário na lista
-- de profissionais e novos preços dos planos (R$ 89, R$ 119 e R$ 159).

-- A foto é gravada pela rota /api/services/image (envio do arquivo ou geração
-- com IA), que confere a permissão "services" antes de alterar o serviço.
alter table public.services add column if not exists image_url text;

-- Igual à versão anterior, com services.image_url e barbers.is_owner.
create or replace function public.public_booking_data(p_slug text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare t public.tenants; mb int; mu int; pn text; result jsonb; cfg public.tenant_automation_settings; deposits boolean;
begin
 select * into t from public.tenants where slug=lower(trim(p_slug));
 if t.id is null then return jsonb_build_object('state','not_found'); end if;
 select p.name,coalesce(p.max_barbers,3),coalesce(p.max_units,1),coalesce((p.features->>'deposits')::boolean,false) into pn,mb,mu,deposits from public.plans p where p.id=t.plan_id;
 if lower(coalesce(pn,''))='starter' then return jsonb_build_object('state','plan_unavailable','name',t.name); end if;
 if t.status not in ('trial','active','pending','overdue') or not t.public_site_enabled then return jsonb_build_object('state','unavailable','name',t.name); end if;
 mb:=coalesce(mb,3); mu:=coalesce(mu,1);
 select * into cfg from public.tenant_automation_settings where tenant_id=t.id;
 select jsonb_build_object('state','open',
 'tenant',jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug,'logo_url',t.logo_url,'cover_url',t.cover_url,'description',t.description,'phone',t.phone,'whatsapp',t.whatsapp,'address',t.address,'instagram',t.instagram,'public_info',t.public_info),
 'units',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (select u.id,u.name,u.timezone from public.units u where u.tenant_id=t.id and u.active order by u.name limit mu) x),'[]'::jsonb),
 'services',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (select s.id,s.name,s.description,s.duration,s.price_cents,s.image_url from public.services s where s.tenant_id=t.id and s.active order by s.name) x),'[]'::jsonb),
 'barbers',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (select b.id,b.name,b.photo_url,m.role='owner' as is_owner from public.barbers b join public.memberships m on m.tenant_id=b.tenant_id and m.user_id=b.user_id where b.tenant_id=t.id and b.active and m.active order by b.name limit mb) x),'[]'::jsonb),
 'barber_units',coalesce((select jsonb_agg(jsonb_build_object('barber_id',bu.barber_id,'unit_id',bu.unit_id)) from public.barber_units bu where bu.tenant_id=t.id),'[]'::jsonb),
 'barber_services',coalesce((select jsonb_agg(jsonb_build_object('barber_id',bs.barber_id,'service_id',bs.service_id)) from public.barber_services bs where bs.tenant_id=t.id),'[]'::jsonb),
 'deposit',case when deposits and cfg.tenant_id is not null and cfg.deposit_mode<>'none' then
   jsonb_build_object('mode',cfg.deposit_mode,'fixed_cents',cfg.deposit_fixed_cents,'percent',cfg.deposit_percent,'timeout_minutes',cfg.deposit_timeout_minutes)
   else null end) into result;
 return result;
end $function$;

-- Novos preços. Assinaturas que já existem no Asaas mantêm o valor atual; o
-- preço novo vale para novas assinaturas e para trocas de plano.
update public.plans set monthly_cents=8900 where name='Starter';
update public.plans set monthly_cents=11900 where name='Pro';
update public.plans set monthly_cents=15900 where name='Pro + Filiais';
