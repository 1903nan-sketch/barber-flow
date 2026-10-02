-- Step 2 of 2: apply only after the frontend that uses staff_login_email()
-- and admin_tenant_documents() is live.
-- Anyone could list every staff username/login e-mail of every barbershop.
drop policy if exists staff_login_lookup on public.staff_logins;
-- Any member (barbers included) could read the owner's and manager's documents.
revoke select (owner_document, manager_name, manager_document) on public.tenants from authenticated;
-- The table is only read server-side (service role) and through staff_login_email().
revoke all on public.staff_logins from anon, authenticated;
