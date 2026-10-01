-- Run against the migrated schema. All fixtures and onboarding data roll back.
BEGIN;
CREATE TEMP TABLE checks(label text);
GRANT ALL ON checks TO authenticated;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; INSERT INTO checks VALUES(label); END $$;
CREATE FUNCTION pg_temp.denied(statement text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN INSERT INTO checks VALUES(label); RETURN; END; RAISE EXCEPTION 'FAIL (unexpected success): %',label; END $$;

INSERT INTO auth.users(id,email) VALUES
 ('c1000000-0000-4000-8000-000000000001','onboarding-owner@audit.invalid'),
 ('c1000000-0000-4000-8000-000000000002','onboarding-second@audit.invalid');
INSERT INTO public.plans(name,monthly_cents,extra_unit_cents,max_barbers,max_units,max_profiles,included_units)
SELECT 'Pro',14990,0,11,1,10,1 WHERE NOT EXISTS(SELECT 1 FROM public.plans WHERE name='Pro');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok(jsonb_array_length(public.onboarding_options())>0,'Authenticated unlinked user can list onboarding plans');
SELECT set_config('audit.result',public.self_service_onboard(jsonb_build_object(
 'owner_name','Owner Audit','name','Barbearia Onboarding','slug','onboarding-audit-shop','phone','11999998888',
 'plan_id',(SELECT id FROM public.plans WHERE name='Pro' LIMIT 1),'service_name','Corte','service_duration',30,
 'service_price_cents',5000,'weekdays',jsonb_build_array(1,2,3,4,5,6),'start_min',540,'end_min',1080
))::text,true);
SELECT set_config('audit.tenant',(current_setting('audit.result')::jsonb->>'tenant_id'),true);
SELECT pg_temp.ok((SELECT status='trial' AND slug='onboarding-audit-shop' AND trial_ends_at=current_date+14 FROM public.tenants WHERE id=current_setting('audit.tenant')::uuid),'Onboarding creates 14-day trial tenant');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.memberships WHERE tenant_id=current_setting('audit.tenant')::uuid AND user_id=auth.uid() AND role='owner'),'Onboarding creates owner membership');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.units WHERE tenant_id=current_setting('audit.tenant')::uuid),'Onboarding creates initial unit');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.barbers WHERE tenant_id=current_setting('audit.tenant')::uuid AND user_id=auth.uid()),'Onboarding creates owner professional');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.services WHERE tenant_id=current_setting('audit.tenant')::uuid AND price_cents=5000),'Onboarding creates first service');
SELECT pg_temp.ok((SELECT count(*)=6 FROM public.weekly_windows WHERE tenant_id=current_setting('audit.tenant')::uuid),'Onboarding publishes weekly hours');
SELECT pg_temp.ok((public.self_service_onboard('{}'::jsonb)->>'existing')::boolean,'Onboarding is idempotent for linked account');

SELECT set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.tenants),'Unlinked user cannot read another onboarding tenant');
SELECT pg_temp.denied($q$select public.self_service_onboard(jsonb_build_object(
 'owner_name','Other Owner','name','Other Shop','slug','onboarding-audit-shop','phone','11988887777',
 'plan_id',(select id from public.plans where name='Pro' limit 1),'service_name','Barba','service_duration',30,
 'service_price_cents',4000,'weekdays',jsonb_build_array(1),'start_min',540,'end_min',1080
))$q$,'Duplicate public slug is rejected');

RESET ROLE;
SELECT count(*) passed,jsonb_agg(label) checks FROM checks;
ROLLBACK;
