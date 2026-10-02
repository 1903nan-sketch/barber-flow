-- Step 1 of 2 (additive): safe lookups that replace direct table reads.
-- Step 2 (after the frontend using these functions is deployed) removes the
-- anonymous read policy on staff_logins and the authenticated column grants
-- on tenant personal documents.

-- Username login: resolve one exact username without exposing the table.
create or replace function public.staff_login_email(p_username text)
 returns text
 language sql
 stable security definer
 set search_path to ''
as $function$
 select case when count(*)=1 then min(login_email) end
 from public.staff_logins
 where username=lower(trim(regexp_replace(coalesce(p_username,''),'^@','')))
$function$;
revoke execute on function public.staff_login_email(text) from public;
grant execute on function public.staff_login_email(text) to anon, authenticated;

-- Master admin panel: owner/manager documents only for platform admins.
create or replace function public.admin_tenant_documents()
 returns table(id uuid, owner_document text, manager_name text, manager_document text)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
 if private.platform_role() is null then raise exception 'Acesso restrito' using errcode='42501'; end if;
 return query select t.id,t.owner_document,t.manager_name,t.manager_document from public.tenants t;
end $function$;
revoke execute on function public.admin_tenant_documents() from public;
grant execute on function public.admin_tenant_documents() to authenticated;
