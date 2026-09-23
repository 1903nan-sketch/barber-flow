-- Run in one transaction; all fixtures and mutations are rolled back.
BEGIN;
CREATE TEMP TABLE checks(label text);
GRANT ALL ON checks TO authenticated,anon;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; INSERT INTO checks VALUES(label); END $$;
CREATE FUNCTION pg_temp.denied(statement text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN INSERT INTO checks VALUES(label); RETURN; END; RAISE EXCEPTION 'FAIL (unexpected success): %',label; END $$;
INSERT INTO auth.users(id,email) VALUES
 ('a1000000-0000-4000-8000-000000000001','owner-a@audit.invalid'),
 ('a1000000-0000-4000-8000-000000000002','owner-b@audit.invalid'),
 ('a1000000-0000-4000-8000-000000000003','barber-a@audit.invalid'),
 ('a1000000-0000-4000-8000-000000000004','unlinked@audit.invalid');
INSERT INTO public.tenants(id,name,slug,status) VALUES
 ('a2000000-0000-4000-8000-000000000001','Audit A','audit-transient-a','active'),
 ('a2000000-0000-4000-8000-000000000002','Audit B','audit-transient-b','active');
INSERT INTO public.memberships(tenant_id,user_id,name,role,permissions) VALUES
 ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Owner A','owner','{}'),
 ('a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','Owner B','owner','{}'),
 ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003','Barber A','barber','{booking}');
INSERT INTO public.units(id,tenant_id,name) VALUES
 ('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','Unit A'),
 ('a3000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002','Unit B');
INSERT INTO public.barbers(id,tenant_id,user_id,name) VALUES
 ('a4000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Owner barber'),
 ('a4000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003','Barber A');
INSERT INTO public.services(id,tenant_id,name,duration,price_cents) VALUES
 ('a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','Cut',30,5000),
 ('a5000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001','Beard',30,3000);
INSERT INTO public.clients(id,tenant_id,name,phone) VALUES
 ('a6000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','Client A','11999990000'),
 ('a6000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002','Client B','11999990001');
INSERT INTO public.barber_units SELECT 'a2000000-0000-4000-8000-000000000001',id,'a3000000-0000-4000-8000-000000000001' FROM public.barbers WHERE tenant_id='a2000000-0000-4000-8000-000000000001';
INSERT INTO public.barber_services SELECT b.tenant_id,b.id,s.id FROM public.barbers b JOIN public.services s ON s.tenant_id=b.tenant_id WHERE b.tenant_id='a2000000-0000-4000-8000-000000000001';
INSERT INTO public.weekly_windows(tenant_id,barber_id,unit_id,weekday,start_min,end_min,step_min) SELECT b.tenant_id,b.id,'a3000000-0000-4000-8000-000000000001',d,lo,hi,15 FROM public.barbers b CROSS JOIN generate_series(0,6) d CROSS JOIN (VALUES(540,720),(840,1080)) w(lo,hi) WHERE b.tenant_id='a2000000-0000-4000-8000-000000000001';
SELECT set_config('audit.t','a2000000-0000-4000-8000-000000000001',true),set_config('audit.u','a3000000-0000-4000-8000-000000000001',true),set_config('audit.b','a4000000-0000-4000-8000-000000000001',true),set_config('audit.s','a5000000-0000-4000-8000-000000000001',true),set_config('audit.c','a6000000-0000-4000-8000-000000000001',true);
SELECT set_config('audit.st',((current_date+2)::timestamp+interval '10 hours')::text||'-03',true);
SET LOCAL ROLE anon;
SELECT pg_temp.denied('select * from public.clients','Anonymous cannot read clients');
SELECT pg_temp.denied('select * from public.appointments','Anonymous cannot read appointments');
SELECT pg_temp.denied('select public.set_appointment_status(null,null,''cancelled'','''')','Anonymous cannot cancel');
SELECT pg_temp.ok(public.public_booking_data('audit-transient-a')->>'state'='open','Public booking data works under RLS');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.tenants),'Owner only sees own tenant');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.clients),'Owner only sees own clients');
SELECT pg_temp.denied('update public.appointments set status=''cancelled''','Direct booking writes denied');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM public.available_slots(current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,current_setting('audit.s')::uuid,current_date+2)),'Owner barber has available slots');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.available_slots(current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,current_setting('audit.s')::uuid,current_date+2) WHERE extract(hour from starts_at AT TIME ZONE 'America/Sao_Paulo') in (12,13)),'Lunch not offered');
SELECT set_config('audit.a',public.book_appointment(current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,current_setting('audit.c')::uuid,current_setting('audit.s')::uuid,current_setting('audit.st')::timestamptz)::text,true);
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM public.appointments WHERE id=current_setting('audit.a')::uuid),'Booking saved');
SELECT pg_temp.denied($q$select public.book_appointment(current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,current_setting('audit.c')::uuid,current_setting('audit.s')::uuid,current_setting('audit.st')::timestamptz)$q$,'Duplicate booking rejected');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.available_slots(current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,current_setting('audit.s')::uuid,current_date+2) WHERE starts_at=current_setting('audit.st')::timestamptz),'Booked slot disappears');
SELECT public.reschedule_appointment(current_setting('audit.t')::uuid,current_setting('audit.a')::uuid,current_setting('audit.st')::timestamptz+interval '1 hour');
SELECT pg_temp.ok((SELECT ends_at-starts_at=interval '30 minutes' AND price_cents=5000 FROM public.appointments WHERE id=current_setting('audit.a')::uuid),'Reschedule preserves duration and price');
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.denied($q$select public.checkout_appointment(current_setting('audit.t')::uuid,current_setting('audit.a')::uuid,'cash')$q$,'Barber cannot checkout another professional');
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000004',true);
SELECT pg_temp.denied($q$select public.save_record(current_setting('audit.t')::uuid,'client','{"name":"Intruder"}')$q$,'Unlinked user cannot create clients');
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok((public.block_period(current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,current_setting('audit.st')::timestamptz,current_setting('audit.st')::timestamptz+interval '8 hours','block','Audit',null)->'affected')@>jsonb_build_array(jsonb_build_object('id',current_setting('audit.a'))),'Block preview lists affected client');
SELECT pg_temp.ok((SELECT status='scheduled' FROM public.appointments WHERE id=current_setting('audit.a')::uuid),'Preview does not cancel');
SELECT pg_temp.ok((public.block_period(current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,current_setting('audit.st')::timestamptz,current_setting('audit.st')::timestamptz+interval '8 hours','block','Audit','{}')->>'needs_confirmation')::boolean,'Stale confirmation rejected');
SELECT public.block_period(current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,current_setting('audit.st')::timestamptz,current_setting('audit.st')::timestamptz+interval '8 hours','block','Audit',array[current_setting('audit.a')::uuid]);
SELECT pg_temp.ok((SELECT status='cancelled' AND cancelled_by=auth.uid() AND cancelled_at IS NOT NULL FROM public.appointments WHERE id=current_setting('audit.a')::uuid),'Confirmed block keeps cancellation history');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.available_slots(current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,current_setting('audit.s')::uuid,current_date+2) WHERE starts_at>=current_setting('audit.st')::timestamptz),'Blocked period not offered');
SELECT pg_temp.denied($q$select public.quick_sale(current_setting('audit.t')::uuid,'{"amount_cents":1000,"method":"cash","unit_id":"a3000000-0000-4000-8000-000000000002"}')$q$,'Sale cannot use another tenant unit');
SELECT set_config('audit.sale',public.quick_sale(current_setting('audit.t')::uuid,jsonb_build_object('amount_cents',1200,'method','account','client_id',current_setting('audit.c')))::text,true);
SELECT public.settle_sale(current_setting('audit.t')::uuid,current_setting('audit.sale')::uuid,'quick','cash');
SELECT pg_temp.ok((SELECT status='paid' FROM public.quick_sales WHERE id=current_setting('audit.sale')::uuid),'Quick sale balance settled');
SELECT pg_temp.denied($q$select public.settle_sale(current_setting('audit.t')::uuid,current_setting('audit.sale')::uuid,'quick','cash')$q$,'Duplicate settlement rejected');
SELECT public.owner_manage_sale(current_setting('audit.t')::uuid,current_setting('audit.sale')::uuid,'quick','delete');
SELECT pg_temp.ok((SELECT status='cancelled' FROM public.quick_sales WHERE id=current_setting('audit.sale')::uuid),'Sale cancellation preserves row');
RESET ROLE;
UPDATE public.tenants SET status='suspended' WHERE id=current_setting('audit.t')::uuid;
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.clients),'Suspension hides operational data');
SELECT pg_temp.denied($q$select public.quick_sale(current_setting('audit.t')::uuid,'{"amount_cents":1000,"method":"cash"}')$q$,'Suspension blocks sales');
SELECT pg_temp.ok(public.public_booking_data('audit-transient-a')->>'state'='unavailable','Suspension blocks public booking');
SELECT count(*) passed,jsonb_agg(label) checks FROM checks;
ROLLBACK;
