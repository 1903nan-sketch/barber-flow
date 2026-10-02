-- Run in one transaction; all fixtures and mutations are rolled back.
-- Requires migration 20261002150000_cash_register.
BEGIN;
CREATE TEMP TABLE checks(label text);
GRANT ALL ON checks TO authenticated,anon;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; INSERT INTO checks VALUES(label); END $$;
CREATE FUNCTION pg_temp.denied(statement text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN INSERT INTO checks VALUES(label); RETURN; END; RAISE EXCEPTION 'FAIL (unexpected success): %',label; END $$;
INSERT INTO auth.users(id,email) VALUES
 ('d1000000-0000-4000-8000-000000000001','owner-cash@audit.invalid'),
 ('d1000000-0000-4000-8000-000000000002','reception-cash@audit.invalid'),
 ('d1000000-0000-4000-8000-000000000003','barber-cash@audit.invalid'),
 ('d1000000-0000-4000-8000-000000000004','owner-other@audit.invalid');
INSERT INTO public.tenants(id,name,slug,status) VALUES
 ('d2000000-0000-4000-8000-000000000001','Cash A','audit-cash-a','active'),
 ('d2000000-0000-4000-8000-000000000002','Cash B','audit-cash-b','active');
INSERT INTO public.memberships(tenant_id,user_id,name,role,permissions) VALUES
 ('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','Owner','owner','{}'),
 ('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','Recepção','reception','{booking}'),
 ('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000003','Barber','barber','{booking}'),
 ('d2000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000004','Other','owner','{}');
INSERT INTO public.units(id,tenant_id,name) VALUES
 ('d3000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Unit Cash'),
 ('d3000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000002','Unit Other');
INSERT INTO public.clients(id,tenant_id,name,phone) VALUES ('d6000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Cliente','11999990000');
SELECT set_config('audit.t','d2000000-0000-4000-8000-000000000001',true),set_config('audit.u','d3000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.denied($q$select public.cash_open(current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,5000)$q$,'Barber cannot open register');
SELECT set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
SELECT set_config('audit.s',public.cash_open(current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,10000)::text,true);
SELECT pg_temp.ok(current_setting('audit.s')<>'','Reception with booking opens register');
SELECT pg_temp.denied($q$select public.cash_open(current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,0)$q$,'Only one open register per unit');
SELECT pg_temp.denied('update public.cash_sessions set opening_cents=0','Direct register writes denied');
RESET ROLE;
-- Sales during the session (cash 5000 + pix 3000, one cancelled, one open account, one from before opening)
INSERT INTO public.quick_sales(tenant_id,unit_id,description,amount_cents,method,status,paid_at) VALUES
 (current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,'Corte',5000,'cash','paid',now()),
 (current_setting('audit.t')::uuid,null,'Barba',3000,'pix','paid',now()),
 (current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,'Cancelada',9000,'cash','cancelled',now()),
 (current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,'Fiado',7000,'account','open',null),
 (current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,'Ontem',4000,'cash','paid',now()-interval '1 day');
INSERT INTO public.financial_entries(tenant_id,unit_id,kind,description,amount_cents,due_date,status,method,paid_at,created_by,request_key,request_payload) VALUES
 (current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,'expense','Lanche',1500,current_date,'paid','cash',now(),'d1000000-0000-4000-8000-000000000001',gen_random_uuid(),'{}');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
SELECT public.cash_move(current_setting('audit.t')::uuid,current_setting('audit.s')::uuid,'withdrawal',2000,'Sangria para cofre');
SELECT public.cash_move(current_setting('audit.t')::uuid,current_setting('audit.s')::uuid,'deposit',500,'Troco extra');
SELECT pg_temp.denied($q$select public.cash_move(current_setting('audit.t')::uuid,current_setting('audit.s')::uuid,'withdrawal',100,'')$q$,'Movement requires a reason');
SELECT set_config('audit.sum',public.cash_summary(current_setting('audit.t')::uuid,current_setting('audit.s')::uuid)::text,true);
SELECT pg_temp.ok((current_setting('audit.sum')::jsonb->'methods'->'cash'->>'total')::int=5000,'Only paid cash sales after opening counted');
SELECT pg_temp.ok((current_setting('audit.sum')::jsonb->'methods'->'pix'->>'total')::int=3000,'Unit-less sale counted for single-unit shop');
SELECT pg_temp.ok(NOT (current_setting('audit.sum')::jsonb->'methods') ? 'account','Open account not counted as received');
-- expected = 10000 opening + 5000 cash - 1500 expense + 500 deposit - 2000 withdrawal = 12000
SELECT pg_temp.ok((current_setting('audit.sum')::jsonb->>'expected_cash_cents')::int=12000,'Expected cash in drawer correct');
SELECT set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000004',true);
SELECT pg_temp.denied($q$select public.cash_summary(current_setting('audit.t')::uuid,current_setting('audit.s')::uuid)$q$,'Other tenant cannot read register');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.cash_sessions),'Other tenant sees no sessions');
SELECT set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.ok((public.cash_close(current_setting('audit.t')::uuid,current_setting('audit.s')::uuid,11500,'Faltou troco')->>'expected_cash_cents')::int=12000,'Closing returns expected cash');
SELECT pg_temp.ok((SELECT status='closed' AND counted_cash_cents=11500 AND expected_cash_cents=12000 AND notes='Faltou troco' FROM public.cash_sessions WHERE id=current_setting('audit.s')::uuid),'Closing stores counted, expected and notes');
SELECT pg_temp.denied($q$select public.cash_close(current_setting('audit.t')::uuid,current_setting('audit.s')::uuid,11500)$q$,'Register cannot be closed twice');
SELECT pg_temp.denied($q$select public.cash_move(current_setting('audit.t')::uuid,current_setting('audit.s')::uuid,'deposit',100,'Depois')$q$,'No movements after closing');
SELECT pg_temp.ok(public.cash_open(current_setting('audit.t')::uuid,current_setting('audit.u')::uuid,0) IS NOT NULL,'New register can open after closing');
SELECT set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.ok((SELECT count(*)=2 FROM public.cash_sessions),'Owner sees register history');
RESET ROLE;
SELECT count(*) passed,jsonb_agg(label) checks FROM checks;
ROLLBACK;
