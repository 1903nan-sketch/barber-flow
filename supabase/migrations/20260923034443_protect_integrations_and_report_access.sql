-- Keep integration secrets out of authenticated browser queries.
revoke select on public.tenants from authenticated;
grant select (id,name,slug,status,plan_id,phone,created_at,logo_url,cover_url,description,whatsapp,address,instagram,public_info,public_site_enabled,pix_key,pix_name,pix_city,billing_due_date,owner_document,manager_name,manager_document,grace_days,last_paid_at,instagram_user_id,instagram_username,instagram_connected_at,commitment_months,no_commitment_surcharge_pct,discount_pct,discount_months,discount_started_at) on public.tenants to authenticated;
CREATE OR REPLACE FUNCTION public.admin_set_reports_password(p_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from public.platform_admins where user_id=auth.uid() and access_role='full') then raise exception 'Acesso restrito'; end if;
 if length(coalesce(p_password,''))<6 then raise exception 'Use pelo menos 6 caracteres'; end if;
 insert into public.platform_settings(key,value,updated_at)
 values('reports_password_hash',extensions.crypt(p_password,extensions.gen_salt('bf')),now())
 on conflict(key) do nothing;
 if not found then raise exception 'Use a alteração de senha informando a senha atual'; end if;
end $function$
;

revoke execute on function public.save_instagram_connection(uuid,text,text,text) from public,anon,authenticated;
