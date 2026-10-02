-- Run in one transaction; all fixtures and mutations are rolled back.
-- Covers the RPCs behind the dashboard screens that the other suites do not:
-- service editing, public multi-service booking, quick-sale cart, client
-- account settlement, appointment status flow, weekly schedule and owner sale edits.
BEGIN;
CREATE TEMP TABLE checks(label text);
GRANT ALL ON checks TO authenticated,anon;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; INSERT INTO checks VALUES(label); END $$;
CREATE FUNCTION pg_temp.denied(statement text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN INSERT INTO checks VALUES(label); RETURN; END; RAISE EXCEPTION 'FAIL (unexpected success): %',label; END $$;
INSERT INTO auth.users(id,email) VALUES
 ('b1000000-0000-4000-8000-000000000001','owner-flow@audit.invalid'),
 ('b1000000-0000-4000-8000-000000000003','barber-flow@audit.invalid'),
 ('b1000000-0000-4000-8000-000000000005','owner-starter@audit.invalid');
INSERT INTO public.plans(id,name,monthly_cents,max_barbers,max_units,max_profiles) VALUES
 ('b0000000-0000-4000-8000-000000000001','Pro',9990,5,1,5),
 ('b0000000-0000-4000-8000-000000000002','Starter',4990,5,1,5);
INSERT INTO public.tenants(id,name,slug,status,plan_id) VALUES
 ('b2000000-0000-4000-8000-000000000001','Flow A','audit-flow-a','active','b0000000-0000-4000-8000-000000000001'),
 ('b2000000-0000-4000-8000-000000000002','Flow Starter','audit-flow-starter','active','b0000000-0000-4000-8000-000000000002');
INSERT INTO public.memberships(tenant_id,user_id,name,role,permissions) VALUES
 ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Owner Flow','owner','{}'),
 ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000003','Barber Flow','barber','{booking}'),
 ('b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000005','Owner Starter','owner','{}');
INSERT INTO public.units(id,tenant_id,name) VALUES
 ('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','Unit Flow'),
 ('b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','Unit Starter');
INSERT INTO public.barbers(id,tenant_id,user_id,name) VALUES
 ('b4000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Owner barber'),
 ('b4000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000003','Barber Flow');
INSERT INTO public.services(id,tenant_id,name,duration,price_cents,commission_bps) VALUES
 ('b5000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','Corte',30,5000,4000),
 ('b5000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','Barba',20,3000,4000);
INSERT INTO public.clients(id,tenant_id,name,phone) VALUES
 ('b6000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','Cliente Flow','11988887777');
INSERT INTO public.products(id,barbershop_id,unit_id,name,sale_price,cost_price,stock_quantity,commission_pct) VALUES
 ('b7000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','Pomada',35,15,5,10);
INSERT INTO public.barber_units SELECT 'b2000000-0000-4000-8000-000000000001',id,'b3000000-0000-4000-8000-000000000001' FROM public.barbers WHERE tenant_id='b2000000-0000-4000-8000-000000000001';
INSERT INTO public.barber_services SELECT b.tenant_id,b.id,s.id FROM public.barbers b JOIN public.services s ON s.tenant_id=b.tenant_id WHERE b.tenant_id='b2000000-0000-4000-8000-000000000001' ON CONFLICT DO NOTHING;
INSERT INTO public.weekly_windows(tenant_id,barber_id,unit_id,weekday,start_min,end_min,step_min) SELECT b.tenant_id,b.id,'b3000000-0000-4000-8000-000000000001',d,lo,hi,15 FROM public.barbers b CROSS JOIN generate_series(0,6) d CROSS JOIN (VALUES(540,720),(840,1080)) w(lo,hi) WHERE b.tenant_id='b2000000-0000-4000-8000-000000000001';
SELECT set_config('audit.t','b2000000-0000-4000-8000-000000000001',true),set_config('audit.u','b3000000-0000-4000-8000-000000000001',true),set_config('audit.b','b4000000-0000-4000-8000-000000000001',true),set_config('audit.b2','b4000000-0000-4000-8000-000000000002',true),set_config('audit.s1','b5000000-0000-4000-8000-000000000001',true),set_config('audit.s2','b5000000-0000-4000-8000-000000000002',true),set_config('audit.c','b6000000-0000-4000-8000-000000000001',true),set_config('audit.p','b7000000-0000-4000-8000-000000000001',true);

-- Public site (anonymous customer)
SET LOCAL ROLE anon;
SELECT pg_temp.ok(public.public_booking_data('audit-flow-a')->>'state'='open','Public site opens for Pro plan');
SELECT pg_temp.ok(jsonb_array_length(public.public_booking_data('audit-flow-a')->'services')=2,'Public site lists active services');
SELECT pg_temp.ok(public.public_booking_data('audit-flow-starter')->>'state'='plan_unavailable','Starter plan has no public site');
SELECT set_config('audit.slot',(SELECT min(starts_at)::text FROM public.public_available_slots_multi('audit-flow-a',current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,ARRAY[current_setting('audit.s1')::uuid,current_setting('audit.s2')::uuid],current_date+2)),true);
SELECT pg_temp.ok(current_setting('audit.slot')<>'','Public multi-service slots offered');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.public_available_slots_multi('audit-flow-a',current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,ARRAY[current_setting('audit.s1')::uuid,current_setting('audit.s2')::uuid],current_date+2) WHERE extract(hour from starts_at AT TIME ZONE 'America/Sao_Paulo')*60+extract(minute from starts_at AT TIME ZONE 'America/Sao_Paulo')+50>720 AND extract(hour from starts_at AT TIME ZONE 'America/Sao_Paulo')<14),'Combined duration never overlaps lunch');
SELECT pg_temp.denied($q$select public.public_book_multi('audit-flow-a',current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,ARRAY[current_setting('audit.s1')::uuid],current_setting('audit.slot')::timestamptz,'X','123')$q$,'Public booking rejects invalid name/phone');
SELECT set_config('audit.pub',public.public_book_multi('audit-flow-a',current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,ARRAY[current_setting('audit.s1')::uuid,current_setting('audit.s2')::uuid],current_setting('audit.slot')::timestamptz,'Novo Cliente','(11) 97777-6666','')->>'id',true);
SELECT pg_temp.denied($q$select public.public_book_multi('audit-flow-a',current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,ARRAY[current_setting('audit.s1')::uuid],current_setting('audit.slot')::timestamptz,'Outro Cliente','11966665555','')$q$,'Public double booking rejected');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.public_available_slots_multi('audit-flow-a',current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,ARRAY[current_setting('audit.s1')::uuid],current_date+2) WHERE starts_at=current_setting('audit.slot')::timestamptz),'Publicly booked slot disappears');
SELECT pg_temp.denied('select * from public.appointments','Anonymous still cannot read appointments');
RESET ROLE;
SELECT pg_temp.ok((SELECT ends_at-starts_at=interval '50 minutes' AND price_cents=8000 AND source='public' FROM public.appointments WHERE id=current_setting('audit.pub')::uuid),'Public booking sums duration and price');
SELECT pg_temp.ok((SELECT commission_bps=4000 FROM public.appointments WHERE id=current_setting('audit.pub')::uuid),'Public booking stores service commission');
SELECT pg_temp.ok((SELECT count(*)=2 FROM public.appointment_services WHERE appointment_id=current_setting('audit.pub')::uuid),'Public booking records each service');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.clients WHERE tenant_id=current_setting('audit.t')::uuid AND phone='(11) 97777-6666'),'Public booking creates the client');

-- Owner: service editing (Serviços > Editar)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
SELECT public.save_record(current_setting('audit.t')::uuid,'service',jsonb_build_object('id',current_setting('audit.s2'),'name','Barba Premium','description','','duration',25,'price_cents',3500,'commission_bps',5000,'active',true));
SELECT pg_temp.ok((SELECT name='Barba Premium' AND duration=25 AND price_cents=3500 AND commission_bps=5000 FROM public.services WHERE id=current_setting('audit.s2')::uuid),'Service edit updates in place');
SELECT pg_temp.ok((SELECT count(*)=2 FROM public.services WHERE tenant_id=current_setting('audit.t')::uuid),'Service edit does not duplicate');
SELECT public.save_record(current_setting('audit.t')::uuid,'service',jsonb_build_object('id',current_setting('audit.s2'),'name','Barba Premium','description','','duration',25,'price_cents',3500,'commission_bps',5000,'active',false));
SELECT pg_temp.ok(NOT (public.quick_sale_catalog(current_setting('audit.t')::uuid)->'services') @> jsonb_build_array(jsonb_build_object('id',current_setting('audit.s2'))),'Inactive service leaves quick-sale catalog');
SELECT pg_temp.ok(jsonb_array_length(public.public_booking_data('audit-flow-a')->'services')=1,'Inactive service leaves public site');
SELECT pg_temp.denied($q$select public.book_appointment(current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,current_setting('audit.c')::uuid,current_setting('audit.s2')::uuid,(((current_date+3)::timestamp+interval '10 hours') AT TIME ZONE 'America/Sao_Paulo'))$q$,'Inactive service cannot be booked');
SELECT pg_temp.ok((SELECT price_cents=8000 AND status='scheduled' FROM public.appointments WHERE id=current_setting('audit.pub')::uuid),'Existing appointments keep price after service edit');
SELECT pg_temp.denied($q$select public.save_record(current_setting('audit.t')::uuid,'service',jsonb_build_object('id',current_setting('audit.s1'),'name','Corte','duration',2,'price_cents',5000))$q$,'Service duration limits enforced');

-- Quick sale cart with client auto-registration (Visão geral > Vender agora)
SELECT set_config('audit.qc',public.quick_client(current_setting('audit.t')::uuid,'Walk In','11955554444')::text,true);
SELECT pg_temp.ok(public.quick_client(current_setting('audit.t')::uuid,'Walk In','(11) 95555-4444')::text=current_setting('audit.qc'),'Quick client reuses phone match');
SELECT set_config('audit.sale',public.quick_sale_cart(current_setting('audit.t')::uuid,jsonb_build_object('client_id',current_setting('audit.qc'),'barber_id',current_setting('audit.b'),'method','account'),jsonb_build_array(jsonb_build_object('kind','service','id',current_setting('audit.s1'),'qty',1),jsonb_build_object('kind','product','id',current_setting('audit.p'),'qty',2)))::text,true);
SELECT pg_temp.ok((SELECT amount_cents=12000 AND status='open' FROM public.quick_sales WHERE id=current_setting('audit.sale')::uuid),'Cart total and account status correct');
SELECT pg_temp.ok((SELECT stock_quantity=3 FROM public.products WHERE id=current_setting('audit.p')::uuid),'Cart deducts product stock');
SELECT pg_temp.ok((SELECT commission_cents=2700 FROM public.quick_sales WHERE id=current_setting('audit.sale')::uuid),'Cart stores service and product commission');
SELECT pg_temp.denied($q$select public.quick_sale_cart(current_setting('audit.t')::uuid,'{"method":"cash"}',jsonb_build_array(jsonb_build_object('kind','product','id',current_setting('audit.p'),'qty',99)))$q$,'Cart rejects oversold product');
SELECT public.settle_sale(current_setting('audit.t')::uuid,current_setting('audit.sale')::uuid,'quick','pix');
SELECT pg_temp.ok((SELECT status='paid' AND method='pix' AND paid_at IS NOT NULL FROM public.quick_sales WHERE id=current_setting('audit.sale')::uuid),'Client account balance settled');
SELECT pg_temp.denied($q$select public.settle_sale(current_setting('audit.t')::uuid,current_setting('audit.sale')::uuid,'quick','cash')$q$,'Account cannot be settled twice');

-- Appointment status flow and checkout to client account (Agenda)
SELECT set_config('audit.a',public.book_appointment(current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,current_setting('audit.c')::uuid,current_setting('audit.s1')::uuid,(((current_date+3)::timestamp+interval '15 hours') AT TIME ZONE 'America/Sao_Paulo'))::text,true);
SELECT pg_temp.denied($q$select public.set_appointment_status(current_setting('audit.t')::uuid,current_setting('audit.a')::uuid,'in_service','')$q$,'Cannot skip from scheduled to in service');
SELECT public.set_appointment_status(current_setting('audit.t')::uuid,current_setting('audit.a')::uuid,'present','');
SELECT public.set_appointment_status(current_setting('audit.t')::uuid,current_setting('audit.a')::uuid,'in_service','');
SELECT pg_temp.ok((public.checkout_appointment(current_setting('audit.t')::uuid,current_setting('audit.a')::uuid,'account')->>'status')='open','Checkout to client account leaves balance open');
SELECT pg_temp.ok((SELECT status='completed' FROM public.appointments WHERE id=current_setting('audit.a')::uuid),'Checkout completes appointment');
SELECT pg_temp.denied($q$select public.checkout_appointment(current_setting('audit.t')::uuid,current_setting('audit.a')::uuid,'cash')$q$,'Appointment cannot be checked out twice');
SELECT public.settle_sale(current_setting('audit.t')::uuid,(SELECT id FROM public.appointment_payments WHERE appointment_id=current_setting('audit.a')::uuid),'appointment','cash');
SELECT pg_temp.ok((SELECT status='paid' AND method='cash' FROM public.appointment_payments WHERE appointment_id=current_setting('audit.a')::uuid),'Appointment balance settled from client account');
SELECT pg_temp.ok((public.finance_summary(current_setting('audit.t')::uuid,null,now()-interval '1 day',now()+interval '1 day')->>'sales_received')::int=17000,'Settled sales appear in finance summary');

-- Owner corrects a sale (Vendas > Editar)
SELECT public.owner_manage_sale(current_setting('audit.t')::uuid,current_setting('audit.sale')::uuid,'quick','update','debit','paid');
SELECT pg_temp.ok((SELECT method='debit' FROM public.quick_sales WHERE id=current_setting('audit.sale')::uuid),'Owner can correct payment method');

-- Weekly schedule (Agenda > Horários)
SELECT pg_temp.denied($q$select public.save_week(current_setting('audit.t')::uuid,current_setting('audit.b')::uuid,jsonb_build_array(jsonb_build_object('unit_id',current_setting('audit.u'),'weekday',1,'start_min',540,'end_min',720,'step_min',15),jsonb_build_object('unit_id',current_setting('audit.u'),'weekday',1,'start_min',700,'end_min',800,'step_min',15)))$q$,'Overlapping schedule periods rejected');
SELECT pg_temp.ok((SELECT count(*)=14 FROM public.weekly_windows WHERE barber_id=current_setting('audit.b')::uuid),'Rejected schedule keeps previous routine');
SELECT public.save_week(current_setting('audit.t')::uuid,current_setting('audit.b')::uuid,jsonb_build_array(jsonb_build_object('unit_id',current_setting('audit.u'),'weekday',1,'start_min',540,'end_min',720,'step_min',30)));
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.weekly_windows WHERE barber_id=current_setting('audit.b')::uuid),'Valid schedule replaces routine');
SELECT pg_temp.ok(public.owner_enable_as_barber(current_setting('audit.t')::uuid)::text=current_setting('audit.b'),'Owner professional profile is idempotent');

-- Barber limits
SELECT set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.denied($q$select public.save_record(current_setting('audit.t')::uuid,'service',jsonb_build_object('id',current_setting('audit.s1'),'name','Hack','duration',30,'price_cents',1,'active',true))$q$,'Barber cannot edit services');
SELECT pg_temp.denied($q$select public.owner_manage_sale(current_setting('audit.t')::uuid,current_setting('audit.sale')::uuid,'quick','delete')$q$,'Barber cannot cancel sales');
SELECT pg_temp.denied($q$select public.save_week(current_setting('audit.t')::uuid,current_setting('audit.b')::uuid,'[]'::jsonb)$q$,'Barber cannot change another professional schedule');
SELECT pg_temp.ok((SELECT price_cents=5000 FROM public.services WHERE id=current_setting('audit.s1')::uuid),'Service unchanged after denied edit');
RESET ROLE;
SELECT count(*) passed,jsonb_agg(label) checks FROM checks;
ROLLBACK;
