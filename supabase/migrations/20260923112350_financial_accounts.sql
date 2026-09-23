create table public.financial_entries(
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),unit_id uuid not null,
 kind text not null check(kind in ('income','expense')),description text not null check(length(trim(description)) between 2 and 200),
 category text not null default '',counterparty text not null default '',amount_cents integer not null check(amount_cents>0),due_date date not null,
 status text not null default 'open' check(status in ('open','paid','cancelled')),method text check(method in ('cash','pix','credit','debit','transfer')),
 paid_at timestamptz,created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 cancellation_reason text,request_key uuid not null,request_payload jsonb not null,
 unique(tenant_id,id),unique(tenant_id,request_key),foreign key(tenant_id,unit_id) references public.units(tenant_id,id),
 check(status<>'paid' or (paid_at is not null and method is not null))
);
create index financial_due on public.financial_entries(tenant_id,status,due_date);
create index financial_paid on public.financial_entries(tenant_id,paid_at) where status='paid';
alter table public.financial_entries enable row level security;
revoke all on public.financial_entries from anon,authenticated;
grant select on public.financial_entries to authenticated;
create policy financial_read on public.financial_entries for select to authenticated using(private.can(tenant_id,'finance'));
create function public.finance_create(t uuid,p jsonb,r uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare entry public.financial_entries; i uuid;u uuid:=(p->>'unit_id')::uuid;
begin
 if not private.can(t,'finance') then raise exception 'Sem permissão para o financeiro' using errcode='42501';end if;
 if r is null then raise exception 'Identificador obrigatório';end if;
 select * into entry from public.financial_entries where tenant_id=t and request_key=r;
 if found then if entry.request_payload<>p then raise exception 'Identificador já utilizado';end if;return entry.id;end if;
 if not exists(select 1 from public.units where tenant_id=t and id=u and active) then raise exception 'Unidade inválida';end if;
 insert into public.financial_entries(tenant_id,unit_id,kind,description,category,counterparty,amount_cents,due_date,created_by,request_key,request_payload)
 values(t,u,p->>'kind',trim(p->>'description'),coalesce(p->>'category',''),coalesce(p->>'counterparty',''),(p->>'amount_cents')::integer,(p->>'due_date')::date,auth.uid(),r,p)
 on conflict(tenant_id,request_key) do nothing returning id into i;
 if i is null then select * into entry from public.financial_entries where tenant_id=t and request_key=r;if entry.request_payload<>p then raise exception 'Identificador já utilizado';end if;return entry.id;end if;
 perform private.log(t,u,'finance.created',i,jsonb_build_object('kind',p->>'kind','amount_cents',p->>'amount_cents'));return i;
end $$;
create function public.finance_settle(t uuid,i uuid,m text) returns void language plpgsql security definer set search_path='' as $$
declare entry public.financial_entries;
begin
 if not private.can(t,'finance') then raise exception 'Sem permissão para o financeiro' using errcode='42501';end if;
 if m is null or m not in ('cash','pix','credit','debit','transfer') then raise exception 'Pagamento inválido';end if;
 select * into entry from public.financial_entries where tenant_id=t and id=i for update;
 if not found then raise exception 'Lançamento não encontrado';end if;
 if entry.status='paid' and entry.method=m then return;end if;
 if entry.status<>'open' then raise exception 'Somente contas em aberto podem receber baixa';end if;
 update public.financial_entries set status='paid',method=m,paid_at=now(),updated_at=now() where id=i;
 perform private.log(t,entry.unit_id,'finance.settled',i,jsonb_build_object('method',m,'amount_cents',entry.amount_cents));
end $$;
create function public.finance_cancel(t uuid,i uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare entry public.financial_entries;
begin
 if not private.can(t,'finance') then raise exception 'Sem permissão para o financeiro' using errcode='42501';end if;
 if length(trim(coalesce(reason,'')))<3 then raise exception 'Informe o motivo do cancelamento';end if;
 select * into entry from public.financial_entries where tenant_id=t and id=i for update;
 if not found then raise exception 'Lançamento não encontrado';end if;
 if entry.status='cancelled' then return;end if;
 update public.financial_entries set status='cancelled',cancellation_reason=reason,updated_at=now() where id=i;
 perform private.log(t,entry.unit_id,'finance.cancelled',i,jsonb_build_object('previous_status',entry.status,'reason',reason,'amount_cents',entry.amount_cents));
end $$;
create function public.finance_summary(t uuid,u uuid,st timestamptz,en timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare received bigint;other_income bigint;expenses bigint;receivable bigint;payable bigint;series jsonb;
begin
 if not private.can(t,'finance') then raise exception 'Sem permissão para o financeiro' using errcode='42501';end if;
 if st is null or en is null or en<=st or en-st>interval '367 days' then raise exception 'Período inválido: máximo de um ano';end if;
 if u is not null and not exists(select 1 from public.units where tenant_id=t and id=u) then raise exception 'Unidade inválida';end if;
 select coalesce(sum(amount_cents),0) into received from (
 select amount_cents from public.quick_sales where tenant_id=t and (u is null or unit_id=u) and status='paid' and paid_at>=st and paid_at<en
 union all select amount_cents from public.appointment_payments where tenant_id=t and (u is null or unit_id=u) and status='paid' and paid_at>=st and paid_at<en) s;
 select coalesce(sum(amount_cents) filter(where kind='income'),0),coalesce(sum(amount_cents) filter(where kind='expense'),0) into other_income,expenses from public.financial_entries where tenant_id=t and (u is null or unit_id=u) and status='paid' and paid_at>=st and paid_at<en;
 select coalesce(sum(amount_cents),0) into receivable from (
 select amount_cents from public.quick_sales where tenant_id=t and (u is null or unit_id=u) and status='open'
 union all select amount_cents from public.appointment_payments where tenant_id=t and (u is null or unit_id=u) and status='open'
 union all select amount_cents from public.financial_entries where tenant_id=t and (u is null or unit_id=u) and status='open' and kind='income') s;
 select coalesce(sum(amount_cents),0) into payable from public.financial_entries where tenant_id=t and (u is null or unit_id=u) and status='open' and kind='expense';
 return jsonb_build_object('sales_received',received,'other_income',other_income,'expenses_paid',expenses,'net',received+other_income-expenses,'receivable',receivable,'payable',payable);
end $$;
revoke all on function public.finance_create(uuid,jsonb,uuid),public.finance_settle(uuid,uuid,text),public.finance_cancel(uuid,uuid,text),public.finance_summary(uuid,uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.finance_create(uuid,jsonb,uuid),public.finance_settle(uuid,uuid,text),public.finance_cancel(uuid,uuid,text),public.finance_summary(uuid,uuid,timestamptz,timestamptz) to authenticated;
do $$ declare r record;begin for r in select oid,pg_get_functiondef(oid) as def from pg_proc where pronamespace='public'::regnamespace and proname in ('save_record','save_staff_member') loop
 execute replace(r.def,'''audit'',''inventory''','''audit'',''inventory'',''finance''');end loop;end $$;
