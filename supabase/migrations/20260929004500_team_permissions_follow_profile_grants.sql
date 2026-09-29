create or replace function private.can(t uuid,p text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
 select private.member(t) and exists(
   select 1
   from public.memberships m
   where m.tenant_id=t
     and m.user_id=auth.uid()
     and m.active
     and (m.role='owner' or p=any(m.permissions))
 )
$$;
