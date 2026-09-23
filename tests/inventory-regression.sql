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
SELECT pg_temp.denied('select * from public.products','Anonymous cannot read inventory');
SELECT pg_temp.denied('select public.inventory_save(null,null)','Anonymous cannot mutate inventory');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
SELECT set_config('audit.product',public.inventory_save(current_setting('audit.t')::uuid,jsonb_build_object('name','Pomade','sku','P01','unit_id',current_setting('audit.u'),'cost_price',10,'sale_price',25,'minimum_stock',2,'commission_pct',10))::text,true);
SELECT pg_temp.ok((select stock_quantity=0 from public.products where id=current_setting('audit.product')::uuid),'New product starts with zero balance');
SELECT pg_temp.denied('update public.products set stock_quantity=999','Direct inventory writes denied');
SELECT public.inventory_move(current_setting('audit.t')::uuid,current_setting('audit.product')::uuid,'entry',10,'Initial stock','a7000000-0000-4000-8000-000000000001');
SELECT public.inventory_move(current_setting('audit.t')::uuid,current_setting('audit.product')::uuid,'entry',10,'Initial stock','a7000000-0000-4000-8000-000000000001');
SELECT pg_temp.ok((select stock_quantity=10 from public.products where id=current_setting('audit.product')::uuid),'Repeated request does not duplicate stock');
SELECT pg_temp.denied(format('select public.inventory_move(%L,%L,%L,11,%L,%L)',current_setting('audit.t'),current_setting('audit.product'),'exit','Too much','a7000000-0000-4000-8000-000000000002'),'Negative inventory rejected');
SELECT pg_temp.denied(format('select public.inventory_move(%L,%L,%L,9,%L,%L)',current_setting('audit.t'),current_setting('audit.product'),'entry','Initial stock','a7000000-0000-4000-8000-000000000001'),'Idempotency key cannot be reused with different quantity');
SELECT set_config('audit.sale',public.inventory_sell(current_setting('audit.t')::uuid,current_setting('audit.product')::uuid,2,current_setting('audit.c')::uuid,current_setting('audit.b')::uuid,'account','a7000000-0000-4000-8000-000000000003')::text,true);
SELECT pg_temp.ok(public.inventory_sell(current_setting('audit.t')::uuid,current_setting('audit.product')::uuid,2,current_setting('audit.c')::uuid,current_setting('audit.b')::uuid,'account','a7000000-0000-4000-8000-000000000003')::text=current_setting('audit.sale'),'Sale request is idempotent');
SELECT pg_temp.ok((select stock_quantity=8 from public.products where id=current_setting('audit.product')::uuid),'Sale decrements stock');
SELECT pg_temp.ok((select amount_cents=5000 and status='open' from public.quick_sales where id=current_setting('audit.sale')::uuid),'Product sale creates financial pending balance');
SELECT public.inventory_save(current_setting('audit.t')::uuid,jsonb_build_object('id',current_setting('audit.product'),'unit_id',current_setting('audit.u'),'name','Pomade renamed','sku','P01','cost_price',15,'sale_price',30,'minimum_stock',2,'commission_pct',20));
SELECT pg_temp.ok((select unit_price=25 and unit_cost=10 and commission_pct=10 from public.stock_movements where sale_id=current_setting('audit.sale')::uuid),'Original price cost and commission preserved');
SELECT public.owner_manage_sale(current_setting('audit.t')::uuid,current_setting('audit.sale')::uuid,'quick','delete');
SELECT public.owner_manage_sale(current_setting('audit.t')::uuid,current_setting('audit.sale')::uuid,'quick','delete');
SELECT pg_temp.ok((select stock_quantity=10 from public.products where id=current_setting('audit.product')::uuid),'Cancelled sale returns stock exactly once');
SELECT pg_temp.ok((select count(*)=1 from public.stock_movements where sale_id=current_setting('audit.sale')::uuid and movement_type='return'),'Return preserves audit trail');
SELECT pg_temp.denied(format('select public.owner_manage_sale(%L,%L,%L,%L,%L,%L)',current_setting('audit.t'),current_setting('audit.sale'),'quick','update','cash','paid'),'Cancelled inventory sale cannot be reopened');
SELECT public.inventory_move(current_setting('audit.t')::uuid,current_setting('audit.product')::uuid,'adjustment',4,'Physical count','a7000000-0000-4000-8000-000000000004');
SELECT pg_temp.ok((select stock_quantity=4 from public.products where id=current_setting('audit.product')::uuid),'Adjustment sets counted balance');
SELECT public.inventory_move(current_setting('audit.t')::uuid,current_setting('audit.product')::uuid,'loss',1,'Damaged product','a7000000-0000-4000-8000-000000000005');
SELECT pg_temp.ok((select stock_quantity=3 from public.products where id=current_setting('audit.product')::uuid),'Loss decrements balance');
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.ok((select count(*)=0 from public.products),'Other tenant cannot read inventory');
SELECT pg_temp.denied(format('select public.inventory_move(%L,%L,%L,1,%L,%L)','a2000000-0000-4000-8000-000000000002',current_setting('audit.product'),'entry','Cross tenant','a7000000-0000-4000-8000-000000000006'),'Other tenant cannot mutate inventory');
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.ok((select count(*)=0 from public.products),'Unprivileged barber cannot read costs');
SELECT pg_temp.denied(format('select public.inventory_move(%L,%L,%L,1,%L,%L)',current_setting('audit.t'),current_setting('audit.product'),'entry','No permission','a7000000-0000-4000-8000-000000000007'),'Unprivileged barber cannot move inventory');
RESET ROLE;
UPDATE public.memberships SET role='manager',permissions='{inventory}' WHERE user_id='a1000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((select count(*)=1 from public.products),'Manager with inventory permission can read inventory');
SELECT pg_temp.denied(format('select public.inventory_sell(%L,%L,1,null,null,%L,%L)',current_setting('audit.t'),current_setting('audit.product'),'cash','a7000000-0000-4000-8000-000000000008'),'Inventory permission alone cannot sell');
RESET ROLE;
UPDATE public.tenants SET status='suspended' WHERE id=current_setting('audit.t')::uuid;
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((select count(*)=0 from public.products),'Suspension hides inventory');
SELECT pg_temp.denied(format('select public.inventory_move(%L,%L,%L,1,%L,%L)',current_setting('audit.t'),current_setting('audit.product'),'entry','Suspended','a7000000-0000-4000-8000-000000000009'),'Suspension blocks stock changes');
RESET ROLE;
SELECT count(*) as passed,array_agg(label) as checks FROM checks;
ROLLBACK;
