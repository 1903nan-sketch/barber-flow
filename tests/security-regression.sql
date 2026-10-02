-- Run in one transaction; all fixtures are rolled back.
-- Requires migrations 20261002130000 and 20261002140000.
BEGIN;
CREATE TEMP TABLE checks(label text);
GRANT ALL ON checks TO authenticated,anon;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; INSERT INTO checks VALUES(label); END $$;
CREATE FUNCTION pg_temp.denied(statement text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN INSERT INTO checks VALUES(label); RETURN; END; RAISE EXCEPTION 'FAIL (unexpected success): %',label; END $$;
INSERT INTO auth.users(id,email) VALUES
 ('c1000000-0000-4000-8000-000000000001','owner-sec@audit.invalid'),
 ('c1000000-0000-4000-8000-000000000003','barber-sec@audit.invalid'),
 ('c1000000-0000-4000-8000-000000000009','admin-sec@audit.invalid');
INSERT INTO public.tenants(id,name,slug,status,owner_document,manager_name,manager_document,pix_key) VALUES
 ('c2000000-0000-4000-8000-000000000001','Sec A','audit-sec-a','active','12345678900','Gerente','98765432100','pix@sec.a');
INSERT INTO public.memberships(tenant_id,user_id,name,role,permissions) VALUES
 ('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','Owner Sec','owner','{}'),
 ('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000003','Barber Sec','barber','{booking}');
INSERT INTO public.platform_admins(user_id,access_role) VALUES ('c1000000-0000-4000-8000-000000000009','full');
INSERT INTO public.staff_logins(user_id,tenant_id,username,login_email) VALUES
 ('c1000000-0000-4000-8000-000000000003','c2000000-0000-4000-8000-000000000001','barbersec','barbersec.c2000000@staff.barberflow.app');
SET LOCAL ROLE anon;
SELECT pg_temp.denied('select * from public.staff_logins','Anonymous cannot list staff logins');
SELECT pg_temp.ok(public.staff_login_email('@barbersec')='barbersec.c2000000@staff.barberflow.app','Username login resolves with @');
SELECT pg_temp.ok(public.staff_login_email('BarberSec')='barbersec.c2000000@staff.barberflow.app','Username login resolves without @ and case-insensitive');
SELECT pg_temp.ok(public.staff_login_email('nobody') IS NULL,'Unknown username returns nothing');
SELECT pg_temp.denied('select public.admin_tenant_documents()','Anonymous cannot read tenant documents');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.denied('select owner_document from public.tenants','Barber cannot read owner document');
SELECT pg_temp.denied('select manager_document from public.tenants','Barber cannot read manager document');
SELECT pg_temp.denied('select * from public.admin_tenant_documents()','Barber cannot use admin documents lookup');
SELECT pg_temp.ok((SELECT name='Sec A' AND pix_key='pix@sec.a' FROM public.tenants),'Barber still reads workspace fields needed for checkout');
SELECT set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.memberships m JOIN public.tenants t ON t.id=m.tenant_id WHERE t.slug='audit-sec-a' AND m.user_id=auth.uid()),'Owner workspace query still works');
SELECT set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000009',true);
SELECT pg_temp.ok((SELECT owner_document='12345678900' FROM public.admin_tenant_documents() WHERE id='c2000000-0000-4000-8000-000000000001'),'Platform admin reads documents through lookup');
RESET ROLE;
SELECT count(*) passed,jsonb_agg(label) checks FROM checks;
ROLLBACK;
