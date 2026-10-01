-- Run in one transaction; all fixtures and mutations are rolled back.
-- Covers the growth features: self-service signup + trial, plan changes and limits,
-- subscription status rules and gateway-independent payments, deposits (hold, expiry,
-- manual confirmation, checkout discount), reminder queue and WhatsApp replies,
-- campaign attribution, commissions, dashboard metrics and tenant isolation.
BEGIN;
CREATE TEMP TABLE checks(label text);
GRANT ALL ON checks TO authenticated,anon,service_role;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; INSERT INTO checks VALUES(label); END $$;
CREATE FUNCTION pg_temp.denied(statement text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN INSERT INTO checks VALUES(label); RETURN; END; RAISE EXCEPTION 'FAIL (unexpected success): %',label; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean,text),pg_temp.denied(text,text) TO authenticated,anon,service_role;

INSERT INTO auth.users(id,email) VALUES
 ('c1000000-0000-4000-8000-000000000001','growth-owner@audit.invalid'),
 ('c1000000-0000-4000-8000-000000000002','growth-other@audit.invalid'),
 ('c1000000-0000-4000-8000-000000000003','growth-signup@audit.invalid'),
 ('c1000000-0000-4000-8000-000000000004','growth-staff@audit.invalid');
INSERT INTO public.plans(id,name,monthly_cents,max_barbers,max_units,max_profiles,public_signup,features) VALUES
 ('c0000000-0000-4000-8000-000000000001','Pro',10000,11,1,10,false,'{"public_booking":true,"whatsapp_bot":true,"automations":true,"marketing":true,"deposits":true,"multi_unit":false}');
INSERT INTO public.tenants(id,name,slug,status,plan_id,pix_key,billing_due_date,grace_days) VALUES
 ('c2000000-0000-4000-8000-000000000001','Growth A','audit-growth-a','active','c0000000-0000-4000-8000-000000000001','pix@audit.invalid',current_date+20,7),
 ('c2000000-0000-4000-8000-000000000002','Growth B','audit-growth-b','active','c0000000-0000-4000-8000-000000000001','',current_date+20,7);
INSERT INTO public.memberships(tenant_id,user_id,name,role,permissions) VALUES
 ('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','Owner A','owner','{}'),
 ('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000004','Staff A','reception','{agenda,clients}'),
 ('c2000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002','Owner B','owner','{}');
INSERT INTO public.units(id,tenant_id,name) VALUES
 ('c3000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Unidade A'),
 ('c3000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000002','Unidade B');
INSERT INTO public.barbers(id,tenant_id,user_id,name) VALUES
 ('c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','Barbeiro A');
INSERT INTO public.services(id,tenant_id,name,duration,price_cents,commission_bps) VALUES
 ('c5000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Corte',30,6000,4000),
 ('c5000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000001','Barba',20,4000,4000);
INSERT INTO public.barber_units VALUES ('c2000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001');
INSERT INTO public.barber_services SELECT 'c2000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001',id FROM public.services WHERE tenant_id='c2000000-0000-4000-8000-000000000001' ON CONFLICT DO NOTHING;
INSERT INTO public.weekly_windows(tenant_id,barber_id,unit_id,weekday,start_min,end_min,step_min)
 SELECT 'c2000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001',d,480,1200,30 FROM generate_series(0,6) d;
INSERT INTO public.clients(id,tenant_id,name,phone,whatsapp) VALUES
 ('c6000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Cliente Fiel','11977776666','11977776666');

-- 1. Cadastro público (somente service role) ------------------------------------------
SET LOCAL ROLE anon;
SELECT pg_temp.denied($q$select public.signup_provision_tenant('c1000000-0000-4000-8000-000000000003','{"name":"X","owner_name":"Y","whatsapp":"11999999999"}')$q$,'Anon cannot provision tenants');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('audit.signup',public.signup_provision_tenant('c1000000-0000-4000-8000-000000000003',jsonb_build_object(
 'name','Barbearia Ação & Estilo','owner_name','Dono Novo','whatsapp','(11) 98888-7777','plan','Pro','slug','barbearia-acao-estilo',
 'acquisition',jsonb_build_object('utm_source','meta','utm_campaign','lancamento','click_ids',jsonb_build_object('fbclid','abc'))))::text,true);
RESET ROLE;
SELECT pg_temp.ok((SELECT status='trial' AND subscription_status='trial' AND signup_source='self' AND onboarding_completed_at IS NULL
 AND trial_ends_at BETWEEN now()+interval '13 days 23 hours' AND now()+interval '14 days 1 hour' FROM public.tenants WHERE id=(current_setting('audit.signup')::jsonb->>'tenant_id')::uuid),'Signup starts a 14-day trial');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.memberships WHERE tenant_id=(current_setting('audit.signup')::jsonb->>'tenant_id')::uuid AND role='owner' AND user_id='c1000000-0000-4000-8000-000000000003'),'Signup links owner');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.units WHERE tenant_id=(current_setting('audit.signup')::jsonb->>'tenant_id')::uuid),'Signup creates first unit');
SELECT pg_temp.ok((current_setting('audit.signup')::jsonb->>'slug') ~ '^barbearia-acao-estilo','Signup generates slug');
SELECT pg_temp.ok((SELECT utm_source='meta' AND click_ids->>'fbclid'='abc' FROM public.tenant_acquisition WHERE tenant_id=(current_setting('audit.signup')::jsonb->>'tenant_id')::uuid),'Signup stores acquisition');
SET LOCAL ROLE service_role;
SELECT pg_temp.denied($q$select public.signup_provision_tenant('c1000000-0000-4000-8000-000000000003','{"name":"Outra","owner_name":"Y","whatsapp":"11999999999"}')$q$,'Same owner cannot create a second shop via signup');
RESET ROLE;

-- 2. Status da assinatura ---------------------------------------------------------------
UPDATE public.tenants SET trial_ends_at=now()-interval '1 hour',billing_due_date=current_date WHERE id=(current_setting('audit.signup')::jsonb->>'tenant_id')::uuid;
SELECT private.run_billing_sync((current_setting('audit.signup')::jsonb->>'tenant_id')::uuid);
SELECT pg_temp.ok((SELECT status='overdue' AND subscription_status='overdue' FROM public.tenants WHERE id=(current_setting('audit.signup')::jsonb->>'tenant_id')::uuid),'Expired trial becomes overdue');
SELECT private.run_billing_sync((current_setting('audit.signup')::jsonb->>'tenant_id')::uuid);
SELECT pg_temp.ok((SELECT status='overdue' FROM public.tenants WHERE id=(current_setting('audit.signup')::jsonb->>'tenant_id')::uuid),'Unpaid expired trial is not reactivated');
UPDATE public.tenants SET billing_due_date=current_date-8 WHERE id=(current_setting('audit.signup')::jsonb->>'tenant_id')::uuid;
SELECT private.run_billing_sync((current_setting('audit.signup')::jsonb->>'tenant_id')::uuid);
SELECT pg_temp.ok((SELECT status='blocked' AND blocked_at IS NOT NULL FROM public.tenants WHERE id=(current_setting('audit.signup')::jsonb->>'tenant_id')::uuid),'Blocked after 7 days late');
SET LOCAL ROLE service_role;
SELECT public.billing_record_payment(jsonb_build_object('tenant_id',current_setting('audit.signup')::jsonb->>'tenant_id','provider','asaas','external_id','pay_audit_1','state','paid','amount_cents',10000,'due_date',(current_date-8)::text,'method','pix'));
SELECT public.billing_record_payment(jsonb_build_object('tenant_id',current_setting('audit.signup')::jsonb->>'tenant_id','provider','asaas','external_id','pay_audit_1','state','paid','amount_cents',10000,'due_date',(current_date-8)::text,'method','pix'));
RESET ROLE;
SELECT pg_temp.ok((SELECT status='active' AND last_paid_at IS NOT NULL AND billing_due_date>current_date FROM public.tenants WHERE id=(current_setting('audit.signup')::jsonb->>'tenant_id')::uuid),'Confirmed payment reactivates and moves due date');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.subscription_events WHERE tenant_id=(current_setting('audit.signup')::jsonb->>'tenant_id')::uuid AND kind='payment_confirmed'),'Duplicate webhook does not duplicate payment');
SELECT pg_temp.ok((SELECT first_paid_at IS NOT NULL AND first_payment_cents=10000 FROM public.tenant_acquisition WHERE tenant_id=(current_setting('audit.signup')::jsonb->>'tenant_id')::uuid),'First payment linked to acquisition');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.denied($q$select public.billing_record_payment('{"tenant_id":"c2000000-0000-4000-8000-000000000001","external_id":"x","state":"paid"}')$q$,'Users cannot record payments');
SELECT pg_temp.denied($q$select public.admin_set_subscription('c2000000-0000-4000-8000-000000000002','release',7,'')$q$,'Owners cannot use master panel actions');

-- 3. Planos e limites --------------------------------------------------------------------
SELECT pg_temp.denied($q$select public.owner_change_plan('c2000000-0000-4000-8000-000000000002',(select id from public.plans where name='Starter' and public_signup limit 1))$q$,'Owner cannot change another shop plan');
RESET ROLE;
INSERT INTO auth.users(id,email) VALUES ('c1000000-0000-4000-8000-000000000005','growth-staff2@audit.invalid');
INSERT INTO public.memberships(tenant_id,user_id,name,role,permissions) VALUES ('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000005','Staff 2','barber','{}');
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$select public.owner_change_plan('c2000000-0000-4000-8000-000000000001',(select id from public.plans where name='Starter' and public_signup limit 1))$q$,'Downgrade blocked above Starter profile limit');

-- 4. Isolamento entre barbearias -----------------------------------------------------------
SELECT pg_temp.denied($q$select public.dashboard_overview('c2000000-0000-4000-8000-000000000002',null)$q$,'Dashboard of another shop denied');
SELECT pg_temp.denied($q$select public.recovery_candidates('c2000000-0000-4000-8000-000000000002')$q$,'Recovery list of another shop denied');
SELECT pg_temp.denied($q$select public.commission_report('c2000000-0000-4000-8000-000000000002',current_date-30,current_date,null)$q$,'Commission report of another shop denied');
SELECT pg_temp.denied($q$select public.save_automation_settings('c2000000-0000-4000-8000-000000000002','{"deposit_mode":"none"}')$q$,'Automation settings of another shop denied');
SELECT pg_temp.denied('select * from public.tenant_payment_gateways','Gateway secrets table not readable');
SELECT pg_temp.denied('select * from public.tenant_acquisition','Acquisition table not readable by shops');
SELECT pg_temp.denied('select instagram_access_token from public.tenants','Integration tokens not readable');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.tenants WHERE id='c2000000-0000-4000-8000-000000000002'),'Other tenant row invisible');

-- 5. Sinal: reserva temporária, expiração e confirmação ---------------------------------
SELECT public.save_automation_settings('c2000000-0000-4000-8000-000000000001',jsonb_build_object('confirmation_enabled',true,'confirmation_hours',24,'reminder_enabled',true,'reminder_hours',2,'deposit_mode','percent','deposit_percent',50,'deposit_timeout_minutes',15));
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.ok((public.public_booking_data('audit-growth-a')->'deposit'->>'percent')::int=50,'Public page exposes deposit rule');
SELECT set_config('audit.slot',(SELECT min(starts_at)::text FROM public.public_available_slots_any('audit-growth-a','c3000000-0000-4000-8000-000000000001',ARRAY['c5000000-0000-4000-8000-000000000001'::uuid],current_date+3)),true);
SELECT pg_temp.ok(current_setting('audit.slot')<>'','Any-professional slots offered');
SELECT pg_temp.ok((SELECT count(*)>0 FROM public.public_available_days('audit-growth-a','c3000000-0000-4000-8000-000000000001',null,ARRAY['c5000000-0000-4000-8000-000000000001'::uuid],current_date,7) WHERE slots>0),'Available days computed');
SELECT set_config('audit.book',public.public_book_multi('audit-growth-a','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001',ARRAY['c5000000-0000-4000-8000-000000000001'::uuid],current_setting('audit.slot')::timestamptz,'Cliente Sinal','11966665555','')::text,true);
SELECT pg_temp.ok((current_setting('audit.book')::jsonb->>'deposit_cents')::int=3000 AND (current_setting('audit.book')::jsonb->>'deposit_required')::boolean,'Booking requires 50% deposit');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.public_available_slots_any('audit-growth-a','c3000000-0000-4000-8000-000000000001',ARRAY['c5000000-0000-4000-8000-000000000001'::uuid],current_date+3) WHERE starts_at=current_setting('audit.slot')::timestamptz),'Pending deposit holds the slot');
RESET ROLE;
UPDATE public.appointments SET hold_expires_at=now()-interval '1 minute' WHERE id=(current_setting('audit.book')::jsonb->>'id')::uuid;
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM public.public_available_slots_any('audit-growth-a','c3000000-0000-4000-8000-000000000001',ARRAY['c5000000-0000-4000-8000-000000000001'::uuid],current_date+3) WHERE starts_at=current_setting('audit.slot')::timestamptz),'Expired hold frees the slot immediately');
SELECT private.expire_deposit_holds();
SELECT pg_temp.ok((SELECT status='cancelled' AND deposit_status='expired' FROM public.appointments WHERE id=(current_setting('audit.book')::jsonb->>'id')::uuid),'Expiry job cancels unpaid hold');
SET LOCAL ROLE anon;
SELECT set_config('audit.book2',public.public_book_multi('audit-growth-a','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001',ARRAY['c5000000-0000-4000-8000-000000000001'::uuid],current_setting('audit.slot')::timestamptz,'Cliente Sinal','11966665555','')::text,true);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
SELECT public.confirm_deposit_manually('c2000000-0000-4000-8000-000000000001',(current_setting('audit.book2')::jsonb->>'id')::uuid);
SELECT pg_temp.ok((SELECT deposit_status='paid' AND status='scheduled' FROM public.appointments WHERE id=(current_setting('audit.book2')::jsonb->>'id')::uuid),'Manual deposit confirmation keeps the booking');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.quick_sales WHERE appointment_id=(current_setting('audit.book2')::jsonb->>'id')::uuid AND amount_cents=3000 AND status='paid'),'Deposit recorded as paid sale');
SELECT pg_temp.ok((public.checkout_appointment('c2000000-0000-4000-8000-000000000001',(current_setting('audit.book2')::jsonb->>'id')::uuid,'cash')->>'amount_cents')::int=3000,'Checkout charges only the remaining amount');

-- 6. Fila de confirmações/lembretes e respostas pelo WhatsApp ---------------------------
RESET ROLE;
INSERT INTO public.appointments(id,tenant_id,unit_id,barber_id,client_id,service_id,starts_at,ends_at,status,price_cents,commission_bps,created_at)
VALUES ('c7000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001',
 'c6000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001',date_trunc('minute',now())+interval '20 hours',date_trunc('minute',now())+interval '20 hours 30 minutes','scheduled',6000,4000,now()-interval '3 days');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM public.automation_due_notifications(200) WHERE appointment_id='c7000000-0000-4000-8000-000000000001' AND kind='confirmation'),'Confirmation queued 24h before');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.automation_due_notifications(200) WHERE appointment_id='c7000000-0000-4000-8000-000000000001' AND kind='reminder'),'Reminder not queued yet');
INSERT INTO public.appointment_notifications(tenant_id,appointment_id,kind,status,phone,sent_at) VALUES ('c2000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000001','confirmation','sent','5511977776666',now());
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.automation_due_notifications(200) WHERE appointment_id='c7000000-0000-4000-8000-000000000001' AND kind='confirmation'),'Confirmation never sent twice');
SELECT public.server_client_appointment_action('c2000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000001','confirm','5511977776666');
RESET ROLE;
SELECT pg_temp.ok((SELECT client_confirmed_at IS NOT NULL FROM public.appointments WHERE id='c7000000-0000-4000-8000-000000000001'),'Client confirmation recorded');
SELECT pg_temp.ok((SELECT response='confirmed' FROM public.appointment_notifications WHERE appointment_id='c7000000-0000-4000-8000-000000000001' AND kind='confirmation'),'Confirmation response logged');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT pg_temp.denied($q$select public.server_client_appointment_action('c2000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000001','cancel',null)$q$,'Only the server can apply WhatsApp actions');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT public.server_client_appointment_action('c2000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000001','cancel','5511977776666');
RESET ROLE;
SELECT pg_temp.ok((SELECT status='cancelled' FROM public.appointments WHERE id='c7000000-0000-4000-8000-000000000001'),'Client cancellation via WhatsApp');

-- 7. Recuperação de clientes, campanha e atribuição ---------------------------------------
INSERT INTO public.appointments(tenant_id,unit_id,barber_id,client_id,service_id,starts_at,ends_at,status,price_cents,commission_bps)
SELECT 'c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000001',
 'c5000000-0000-4000-8000-000000000001',now()-make_interval(days=>d),now()-make_interval(days=>d)+interval '30 minutes','completed',6000,4000 FROM unnest(array[95,75,55,35]) d;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok(public.recovery_candidates('c2000000-0000-4000-8000-000000000001') @> '[{"client_id":"c6000000-0000-4000-8000-000000000001","avg_days":20}]','Client with 20-day rhythm and 35 days away is listed');
SELECT set_config('audit.camp',(public.create_campaign('c2000000-0000-4000-8000-000000000001','Teste','Olá {nome}, volte! {link}',ARRAY['c6000000-0000-4000-8000-000000000001'::uuid],'recovery')->>'campaign_id'),true);
SELECT set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.denied($q$select public.create_campaign('c2000000-0000-4000-8000-000000000001','X','Olá {nome}',ARRAY['c6000000-0000-4000-8000-000000000001'::uuid],'recovery')$q$,'Other shop cannot message our clients');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('audit.rcp',(SELECT recipient_id::text FROM public.server_campaign_claim(current_setting('audit.camp')::uuid,8) LIMIT 1),true);
SELECT public.server_campaign_result(current_setting('audit.rcp')::uuid,true,null);
RESET ROLE;
INSERT INTO public.appointments(id,tenant_id,unit_id,barber_id,client_id,service_id,starts_at,ends_at,status,price_cents,commission_bps)
VALUES ('c7000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001',
 'c6000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001',now()-interval '2 hours',now()-interval '90 minutes','completed',6000,4000);
SELECT pg_temp.ok((SELECT campaign_recipient_id=current_setting('audit.rcp')::uuid FROM public.appointments WHERE id='c7000000-0000-4000-8000-000000000002'),'Return attributed to campaign');
INSERT INTO public.appointment_payments(tenant_id,unit_id,appointment_id,client_id,barber_id,service_id,method,amount_cents,status,paid_at)
VALUES ('c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','pix',6000,'paid',now());
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok((public.marketing_summary('c2000000-0000-4000-8000-000000000001')->'month'->>'revenue_cents')::int=6000,'Recovered revenue measured');

-- 8. Comissões e dashboard -------------------------------------------------------------------
SELECT public.save_commission_rules('c2000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001',
 '[{"kind":"service","rate_bps":5000},{"kind":"service","service_id":"c5000000-0000-4000-8000-000000000002","rate_bps":3000},{"kind":"product","rate_bps":1000}]');
SELECT pg_temp.ok((SELECT (x->>'service_commission_cents')::int=(x->>'service_revenue_cents')::int/2 FROM jsonb_array_elements(public.commission_report('c2000000-0000-4000-8000-000000000001',current_date-1,current_date,null)->'barbers') x),'Commission uses professional rule (50%)');
SELECT pg_temp.denied($q$select public.save_commission_rules('c2000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','[{"kind":"service","rate_bps":20000}]')$q$,'Commission above 100% rejected');
SELECT pg_temp.ok((public.dashboard_overview('c2000000-0000-4000-8000-000000000001',null)->>'revenue_today')::int>=6000,'Dashboard revenue uses real receipts');
SELECT pg_temp.ok(jsonb_array_length(public.dashboard_overview('c2000000-0000-4000-8000-000000000001',null)->'series')=30,'Dashboard returns 30-day series');
SELECT set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000004',true);
SELECT pg_temp.denied($q$select public.dashboard_overview('c2000000-0000-4000-8000-000000000001',null)$q$,'Staff without reports/finance cannot see revenue');
RESET ROLE;
SELECT count(*) passed,jsonb_agg(label) checks FROM checks;
ROLLBACK;
