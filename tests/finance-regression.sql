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
SELECT pg_temp.denied('select * from public.financial_entries','Anonymous cannot read financial entries');
SELECT pg_temp.denied('select public.finance_summary(null,null,now(),now())','Anonymous cannot read financial summary');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
SELECT set_config('audit.payload',jsonb_build_object('unit_id',current_setting('audit.u'),'kind','expense','description','Rent','amount_cents',10000,'due_date',current_date)::text,true);
SELECT set_config('audit.entry',public.finance_create(current_setting('audit.t')::uuid,current_setting('audit.payload')::jsonb,'a8000000-0000-4000-8000-000000000001')::text,true);
SELECT pg_temp.ok(public.finance_create(current_setting('audit.t')::uuid,current_setting('audit.payload')::jsonb,'a8000000-0000-4000-8000-000000000001')::text=current_setting('audit.entry'),'Creation is idempotent');
SELECT pg_temp.ok((select status='open' from public.financial_entries where id=current_setting('audit.entry')::uuid),'New expense remains payable until settled');
SELECT pg_temp.denied('update public.financial_entries set amount_cents=1','Direct financial writes denied');
SELECT pg_temp.ok((public.finance_summary(current_setting('audit.t')::uuid,null,now()-interval '1 day',now()+interval '1 day')->>'payable')::bigint=10000,'Payable includes open expense');
SELECT public.finance_settle(current_setting('audit.t')::uuid,current_setting('audit.entry')::uuid,'cash');
SELECT public.finance_settle(current_setting('audit.t')::uuid,current_setting('audit.entry')::uuid,'cash');
SELECT pg_temp.ok((select count(*)=1 from public.audit_events where entity_id=current_setting('audit.entry')::uuid and action='finance.settled'),'Duplicate settlement produces no duplicate audit');
SELECT pg_temp.ok((public.finance_summary(current_setting('audit.t')::uuid,null,now()-interval '1 day',now()+interval '1 day')->>'expenses_paid')::bigint=10000,'Paid expense enters cash flow once');
SELECT public.quick_sale(current_setting('audit.t')::uuid,jsonb_build_object('unit_id',current_setting('audit.u'),'description','Sale','amount_cents',15000,'method','cash'));
SELECT pg_temp.ok((public.finance_summary(current_setting('audit.t')::uuid,null,now()-interval '1 day',now()+interval '1 day')->>'net')::bigint=5000,'Cash flow includes existing sales without duplicate ledger entries');
SELECT public.finance_cancel(current_setting('audit.t')::uuid,current_setting('audit.entry')::uuid,'Correction');
SELECT pg_temp.ok((select status='cancelled' and paid_at is not null from public.financial_entries where id=current_setting('audit.entry')::uuid),'Cancellation preserves payment history');
SELECT pg_temp.ok((public.finance_summary(current_setting('audit.t')::uuid,null,now()-interval '1 day',now()+interval '1 day')->>'net')::bigint=15000,'Cancelled expense excluded from current flow');
SELECT pg_temp.denied(format('select public.finance_settle(%L,%L,%L)',current_setting('audit.t'),current_setting('audit.entry'),'cash'),'Cancelled expense cannot be settled');
SELECT pg_temp.denied(format('select public.finance_summary(%L,%L,now()-interval %L,now())',current_setting('audit.t'),'a3000000-0000-4000-8000-000000000002','1 day'),'Other tenant unit rejected');
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.ok((select count(*)=0 from public.financial_entries),'Other tenant cannot see financial entries');
SELECT pg_temp.denied(format('select public.finance_cancel(%L,%L,%L)',current_setting('audit.t'),current_setting('audit.entry'),'Cross tenant'),'Other tenant cannot cancel entries');
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.denied(format('select public.finance_summary(%L,null,now()-interval %L,now())',current_setting('audit.t'),'1 day'),'Barber cannot access financial summary');
RESET ROLE;
UPDATE public.memberships SET role='manager',permissions='{finance}' WHERE user_id='a1000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((select count(*)=1 from public.financial_entries),'Finance permission grants manager access');
RESET ROLE;
UPDATE public.tenants SET status='suspended' WHERE id=current_setting('audit.t')::uuid;
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((select count(*)=0 from public.financial_entries),'Suspension hides financial entries');
SELECT pg_temp.denied(format('select public.finance_summary(%L,null,now()-interval %L,now())',current_setting('audit.t'),'1 day'),'Suspension blocks financial summary');
RESET ROLE;
SELECT count(*) as passed,array_agg(label) as checks FROM checks;
ROLLBACK;
