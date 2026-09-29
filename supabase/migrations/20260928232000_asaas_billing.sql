begin;

alter table public.tenants
  add column if not exists billing_provider text not null default '',
  add column if not exists billing_method text not null default '',
  add column if not exists billing_provider_status text not null default '',
  add column if not exists billing_amount_cents integer not null default 0,
  add column if not exists asaas_customer_id text,
  add column if not exists asaas_subscription_id text,
  add column if not exists asaas_checkout_id text,
  add column if not exists asaas_last_payment_id text;

create unique index if not exists tenants_asaas_customer_uq
  on public.tenants(asaas_customer_id) where asaas_customer_id is not null;
create unique index if not exists tenants_asaas_subscription_uq
  on public.tenants(asaas_subscription_id) where asaas_subscription_id is not null;
create unique index if not exists tenants_asaas_checkout_uq
  on public.tenants(asaas_checkout_id) where asaas_checkout_id is not null;

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null default 'asaas',
  provider_payment_id text not null,
  provider_subscription_id text,
  status text not null default '',
  billing_type text not null default '',
  value_cents integer not null default 0 check (value_cents >= 0),
  due_date date,
  paid_at timestamptz,
  invoice_url text,
  bank_slip_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_payment_id)
);

create index if not exists billing_payments_tenant_due_idx
  on public.billing_payments(tenant_id, due_date desc);
create index if not exists billing_payments_subscription_idx
  on public.billing_payments(provider_subscription_id);

alter table public.billing_payments enable row level security;
revoke all on public.billing_payments from anon, authenticated;

create table if not exists public.billing_webhook_events (
  event_id text primary key,
  provider text not null default 'asaas',
  event_type text not null,
  resource_id text,
  tenant_id uuid references public.tenants(id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists billing_webhook_events_tenant_idx
  on public.billing_webhook_events(tenant_id, received_at desc);

alter table public.billing_webhook_events enable row level security;
revoke all on public.billing_webhook_events from anon, authenticated;

grant select (billing_provider,billing_method,billing_provider_status,billing_amount_cents)
  on public.tenants to authenticated;

commit;
