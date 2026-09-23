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
SELECT pg_temp.denied('select * from public.order_tabs','Anonymous cannot read tabs');
SELECT pg_temp.denied('select public.order_catalog(null,null)','Anonymous cannot access catalog');
RESET ROLE;
UPDATE public.services SET commission_bps=2000 WHERE id=current_setting('audit.s')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
SELECT set_config('audit.product',public.inventory_save(current_setting('audit.t')::uuid,jsonb_build_object('name','Pomade','unit_id',current_setting('audit.u'),'cost_price',10,'sale_price',25,'minimum_stock',2,'commission_pct',10))::text,true);
SELECT public.inventory_move(current_setting('audit.t')::uuid,current_setting('audit.product')::uuid,'entry',10,'Initial stock','a9000000-0000-4000-8000-000000000001');
SELECT set_config('audit.order',public.order_open(current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,current_setting('audit.c')::uuid,null,'a9000000-0000-4000-8000-000000000002')::text,true);
SELECT pg_temp.ok(public.order_open(current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,current_setting('audit.c')::uuid,null,'a9000000-0000-4000-8000-000000000002')::text=current_setting('audit.order'),'Opening is idempotent');
SELECT pg_temp.denied('update public.order_tabs set status=''closed''','Direct tab updates denied');
SELECT set_config('audit.item',public.order_add_item(current_setting('audit.t')::uuid,current_setting('audit.order')::uuid,'service',current_setting('audit.s')::uuid,1,'a9000000-0000-4000-8000-000000000003')::text,true);
SELECT public.order_add_item(current_setting('audit.t')::uuid,current_setting('audit.order')::uuid,'product',current_setting('audit.product')::uuid,2,'a9000000-0000-4000-8000-000000000004');
SELECT public.order_add_item(current_setting('audit.t')::uuid,current_setting('audit.order')::uuid,'product',current_setting('audit.product')::uuid,2,'a9000000-0000-4000-8000-000000000004');
SELECT pg_temp.ok((select count(*)=2 from public.order_items where order_id=current_setting('audit.order')::uuid),'Adding same request does not duplicate item');
SELECT pg_temp.ok((select stock_quantity=10 from public.products where id=current_setting('audit.product')::uuid),'Open tab does not reserve or deduct stock');
SELECT pg_temp.denied(format('select public.order_close(%L,%L,%L::jsonb,10000)',current_setting('audit.t'),current_setting('audit.order'),'[{"method":"cash","amount_cents":5000}]'),'Unbalanced payment rejected');
SELECT pg_temp.ok((select stock_quantity=10 from public.products where id=current_setting('audit.product')::uuid),'Failed close keeps stock unchanged');
SELECT public.inventory_move(current_setting('audit.t')::uuid,current_setting('audit.product')::uuid,'adjustment',1,'Stock count','a9000000-0000-4000-8000-000000000011');
SELECT pg_temp.denied(format('select public.order_close(%L,%L,%L::jsonb,10000)',current_setting('audit.t'),current_setting('audit.order'),'[{"method":"cash","amount_cents":10000}]'),'Insufficient stock blocks checkout');
SELECT pg_temp.ok((select status='open' from public.order_tabs where id=current_setting('audit.order')::uuid) and not exists(select 1 from public.quick_sales where order_id=current_setting('audit.order')::uuid),'Stock failure preserves open tab without payments');
SELECT public.inventory_move(current_setting('audit.t')::uuid,current_setting('audit.product')::uuid,'adjustment',10,'Stock corrected','a9000000-0000-4000-8000-000000000012');
SELECT public.order_close(current_setting('audit.t')::uuid,current_setting('audit.order')::uuid,'[{"method":"cash","amount_cents":6000},{"method":"account","amount_cents":4000}]',10000);
SELECT public.order_close(current_setting('audit.t')::uuid,current_setting('audit.order')::uuid,'[]',10000);
SELECT pg_temp.ok((select count(*)=2 and sum(amount_cents)=10000 from public.quick_sales where order_id=current_setting('audit.order')::uuid),'Split payments posted exactly once');
SELECT pg_temp.ok((select stock_quantity=8 from public.products where id=current_setting('audit.product')::uuid),'Close deducts product quantity once');
SELECT pg_temp.ok((select commission_bps=2000 from public.order_items where id=current_setting('audit.item')::uuid),'Service commission snapshot saved');
SELECT pg_temp.ok((select commission_bps=1000 from public.order_items where order_id=current_setting('audit.order')::uuid and kind='product'),'Product commission snapshot saved');
SELECT pg_temp.ok((public.finance_summary(current_setting('audit.t')::uuid,null,now()-interval '1 day',now()+interval '1 day')->>'sales_received')::bigint=6000,'Paid share appears in financial summary');
SELECT pg_temp.ok((public.finance_summary(current_setting('audit.t')::uuid,null,now()-interval '1 day',now()+interval '1 day')->>'receivable')::bigint=4000,'Pending share appears as receivable');
SELECT pg_temp.denied(format('select public.order_remove_item(%L,%L,%L)',current_setting('audit.t'),current_setting('audit.order'),current_setting('audit.item')),'Closed tab cannot be edited');
SELECT set_config('audit.payment',(select id::text from public.quick_sales where order_id=current_setting('audit.order')::uuid and status='paid'),true);
SELECT pg_temp.denied(format('select public.owner_manage_sale(%L,%L,%L,%L)',current_setting('audit.t'),current_setting('audit.payment'),'quick','delete'),'Individual order payment cannot be cancelled');
SELECT public.settle_sale(current_setting('audit.t')::uuid,(select id from public.quick_sales where order_id=current_setting('audit.order')::uuid and status='open'),'quick','pix');
SELECT pg_temp.ok((select count(*)=2 and sum(amount_cents)=10000 from public.quick_sales where order_id=current_setting('audit.order')::uuid and status='paid'),'Pending share can be settled without duplicate payments');
SELECT public.order_cancel(current_setting('audit.t')::uuid,current_setting('audit.order')::uuid,'Customer refund');
SELECT public.order_cancel(current_setting('audit.t')::uuid,current_setting('audit.order')::uuid,'Customer refund');
SELECT pg_temp.ok((select stock_quantity=10 from public.products where id=current_setting('audit.product')::uuid),'Cancellation returns products exactly once');
SELECT pg_temp.ok((select count(*)=2 from public.quick_sales where order_id=current_setting('audit.order')::uuid and status='cancelled'),'Cancellation preserves payment rows');
SELECT set_config('audit.appointment',public.book_appointment(current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,current_setting('audit.c')::uuid,current_setting('audit.s')::uuid,current_setting('audit.st')::timestamptz,null)::text,true);
SELECT set_config('audit.order2',public.order_open(current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,current_setting('audit.b')::uuid,current_setting('audit.c')::uuid,current_setting('audit.appointment')::uuid,'a9000000-0000-4000-8000-000000000005')::text,true);
SELECT pg_temp.ok((select unit_price_cents=5000 from public.order_items where order_id=current_setting('audit.order2')::uuid),'Appointment price preserved');
SELECT pg_temp.denied(format('select public.checkout_appointment(%L,%L,%L)',current_setting('audit.t'),current_setting('audit.appointment'),'cash'),'Legacy checkout blocked for appointment with tab');
SELECT public.order_close(current_setting('audit.t')::uuid,current_setting('audit.order2')::uuid,'[{"method":"pix","amount_cents":5000}]',5000);
SELECT pg_temp.ok((select status='completed' from public.appointments where id=current_setting('audit.appointment')::uuid),'Closing tab completes appointment');
SELECT pg_temp.ok((select count(*)=0 from public.appointment_payments where appointment_id=current_setting('audit.appointment')::uuid),'No duplicate appointment payment');
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.ok((select count(*)=0 from public.order_tabs),'Other tenant cannot see tabs');
SELECT pg_temp.denied(format('select public.order_catalog(%L,%L)',current_setting('audit.t'),current_setting('audit.order2')),'Other tenant cannot read tab catalog');
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.ok((select count(*)=0 from public.order_tabs),'Barber cannot see another professionals tabs');
RESET ROLE;
UPDATE public.tenants SET status='suspended' WHERE id=current_setting('audit.t')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok((select count(*)=0 from public.order_tabs),'Suspension hides order tabs');
SELECT pg_temp.denied(format('select public.order_cancel(%L,%L,%L)',current_setting('audit.t'),current_setting('audit.order2'),'Suspended'),'Suspension blocks tab cancellation');
RESET ROLE;
SELECT count(*) as passed,array_agg(label) as checks FROM checks;
ROLLBACK;
