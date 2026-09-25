create or replace function public.platform_admin_me()
returns text
language sql
stable
security definer
set search_path=''
as $function$
  select pa.access_role
  from public.platform_admins pa
  where pa.user_id = auth.uid()
  limit 1
$function$;

revoke all on function public.platform_admin_me() from public, anon;
grant execute on function public.platform_admin_me() to authenticated;
