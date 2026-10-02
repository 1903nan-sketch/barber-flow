-- Cash register (abertura/fechamento de caixa) per unit.
-- Additive only: two new tables and RPCs; no existing object changes.

create table public.cash_sessions (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 unit_id uuid not null,
 status text not null default 'open' check (status in ('open','closed')),
 opening_cents integer not null check (opening_cents between 0 and 100000000),
 opened_by uuid not null references auth.users(id),
 opened_at timestamptz not null default now(),
 closed_by uuid references auth.users(id),
 closed_at timestamptz,
 counted_cash_cents integer check (counted_cash_cents between 0 and 100000000),
 expected_cash_cents integer,
 summary jsonb,
 notes text not null default '',
 foreign key (tenant_id, unit_id) references public.units(tenant_id, id),
 check ((status='open' and closed_at is null) or (status='closed' and closed_at is not null and counted_cash_cents is not null))
);
create unique index cash_one_open_per_unit on public.cash_sessions(tenant_id, unit_id) where status='open';
create index cash_sessions_history on public.cash_sessions(tenant_id, opened_at desc);

create table public.cash_movements (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 session_id uuid not null references public.cash_sessions(id),
 kind text not null check (kind in ('withdrawal','deposit')),
 amount_cents integer not null check (amount_cents between 1 and 100000000),
 reason text not null check (length(trim(reason)) between 3 and 300),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index cash_movements_session on public.cash_movements(session_id, created_at);

alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;

-- Who operates the register: owner, finance permission, or front desk with booking/agenda.
create or replace function private.cash_access(t uuid)
 returns boolean language sql stable security definer set search_path to ''
as $function$ select private.can(t,'finance') or (private.member(t) and exists(select 1 from public.memberships m where m.tenant_id=t and m.user_id=auth.uid() and m.active and m.role in ('manager','reception','attendant') and ('booking'=any(m.permissions) or 'agenda'=any(m.permissions)))) $function$;
revoke execute on function private.cash_access(uuid) from public;
grant execute on function private.cash_access(uuid) to authenticated;

create policy cash_sessions_read on public.cash_sessions for select to authenticated using (private.cash_access(tenant_id));
create policy cash_movements_read on public.cash_movements for select to authenticated using (private.cash_access(tenant_id));
-- Supabase default privileges grant everything on new tables; keep writes RPC-only.
revoke all on public.cash_sessions, public.cash_movements from anon, authenticated;
grant select on public.cash_sessions, public.cash_movements to authenticated;

-- Totals received/paid while the session was open, per payment method.
-- Sales without a unit (quick sale of services) count when the tenant has a single active unit.
create or replace function public.cash_summary(t uuid, s uuid)
 returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare cs public.cash_sessions; en timestamptz; single boolean; methods jsonb; dep bigint; wd bigint; cash_in bigint; cash_out bigint;
begin
 if not private.cash_access(t) then raise exception 'Sem permissão para o caixa' using errcode='42501'; end if;
 select * into cs from public.cash_sessions where tenant_id=t and id=s;
 if not found then raise exception 'Caixa não encontrado'; end if;
 en:=coalesce(cs.closed_at,'infinity'::timestamptz);
 single:=(select count(*)=1 from public.units where tenant_id=t and active);
 with receipts as (
  select method,amount_cents from public.appointment_payments where tenant_id=t and status='paid' and paid_at>=cs.opened_at and paid_at<=en and unit_id=cs.unit_id
  union all
  select method,amount_cents from public.quick_sales where tenant_id=t and status='paid' and paid_at>=cs.opened_at and paid_at<=en and (unit_id=cs.unit_id or (unit_id is null and single))
 ), bym as (select method,sum(amount_cents)::bigint total,count(*) qty from receipts group by method)
 select coalesce(jsonb_object_agg(method,jsonb_build_object('total',total,'count',qty)),'{}'::jsonb) into methods from bym;
 select coalesce(sum(amount_cents) filter(where kind='deposit'),0),coalesce(sum(amount_cents) filter(where kind='withdrawal'),0) into dep,wd from public.cash_movements where session_id=s;
 select coalesce(sum(amount_cents) filter(where kind='income'),0),coalesce(sum(amount_cents) filter(where kind='expense'),0) into cash_in,cash_out
  from public.financial_entries where tenant_id=t and unit_id=cs.unit_id and status='paid' and method='cash' and paid_at>=cs.opened_at and paid_at<=en;
 return jsonb_build_object(
  'session_id',cs.id,'status',cs.status,'opened_at',cs.opened_at,'closed_at',cs.closed_at,'opening_cents',cs.opening_cents,
  'methods',methods,'deposits_cents',dep,'withdrawals_cents',wd,'cash_income_cents',cash_in,'cash_expense_cents',cash_out,
  'expected_cash_cents',cs.opening_cents+coalesce((methods->'cash'->>'total')::bigint,0)+cash_in-cash_out+dep-wd,
  'counted_cash_cents',cs.counted_cash_cents);
end $function$;

create or replace function public.cash_open(t uuid, u uuid, opening integer)
 returns uuid language plpgsql security definer set search_path to ''
as $function$
declare i uuid;
begin
 if not private.cash_access(t) then raise exception 'Sem permissão para o caixa' using errcode='42501'; end if;
 if not exists(select 1 from public.units where tenant_id=t and id=u and active) then raise exception 'Unidade inválida'; end if;
 if opening is null or opening<0 or opening>100000000 then raise exception 'Informe o troco inicial'; end if;
 select id into i from public.cash_sessions where tenant_id=t and unit_id=u and status='open';
 if found then raise exception 'Já existe um caixa aberto nesta unidade'; end if;
 insert into public.cash_sessions(tenant_id,unit_id,opening_cents,opened_by) values(t,u,opening,auth.uid()) returning id into i;
 perform private.log(t,u,'cash.opened',i,jsonb_build_object('opening_cents',opening));
 return i;
end $function$;

create or replace function public.cash_move(t uuid, s uuid, k text, amount integer, reason text)
 returns uuid language plpgsql security definer set search_path to ''
as $function$
declare cs public.cash_sessions; i uuid;
begin
 if not private.cash_access(t) then raise exception 'Sem permissão para o caixa' using errcode='42501'; end if;
 select * into cs from public.cash_sessions where tenant_id=t and id=s for update;
 if not found or cs.status<>'open' then raise exception 'O caixa não está aberto'; end if;
 if k not in ('withdrawal','deposit') then raise exception 'Movimento inválido'; end if;
 if amount is null or amount<=0 or amount>100000000 then raise exception 'Informe um valor válido'; end if;
 if length(trim(coalesce(reason,'')))<3 then raise exception 'Informe o motivo'; end if;
 insert into public.cash_movements(tenant_id,session_id,kind,amount_cents,reason,created_by) values(t,s,k,amount,trim(reason),auth.uid()) returning id into i;
 perform private.log(t,cs.unit_id,'cash.'||k,s,jsonb_build_object('amount_cents',amount,'reason',reason));
 return i;
end $function$;

create or replace function public.cash_close(t uuid, s uuid, counted integer, p_notes text default '')
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare cs public.cash_sessions; summ jsonb;
begin
 if not private.cash_access(t) then raise exception 'Sem permissão para o caixa' using errcode='42501'; end if;
 select * into cs from public.cash_sessions where tenant_id=t and id=s for update;
 if not found then raise exception 'Caixa não encontrado'; end if;
 if cs.status<>'open' then raise exception 'Este caixa já foi fechado'; end if;
 if counted is null or counted<0 or counted>100000000 then raise exception 'Informe o dinheiro contado'; end if;
 summ:=public.cash_summary(t,s);
 update public.cash_sessions set status='closed',closed_at=now(),closed_by=auth.uid(),counted_cash_cents=counted,
  expected_cash_cents=(summ->>'expected_cash_cents')::int,summary=summ,notes=coalesce(p_notes,'') where id=s;
 summ:=public.cash_summary(t,s);
 update public.cash_sessions set summary=summ where id=s;
 perform private.log(t,cs.unit_id,'cash.closed',s,jsonb_build_object('counted_cents',counted,'expected_cents',summ->>'expected_cash_cents'));
 return summ;
end $function$;

revoke execute on function public.cash_summary(uuid,uuid), public.cash_open(uuid,uuid,integer), public.cash_move(uuid,uuid,text,integer,text), public.cash_close(uuid,uuid,integer,text) from public;
grant execute on function public.cash_summary(uuid,uuid), public.cash_open(uuid,uuid,integer), public.cash_move(uuid,uuid,text,integer,text), public.cash_close(uuid,uuid,integer,text) to authenticated;
