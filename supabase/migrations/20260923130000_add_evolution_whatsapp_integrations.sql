create table if not exists public.whatsapp_integrations (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  provider text not null default 'evolution' check (provider = 'evolution'),
  instance_name text not null unique,
  status text not null default 'disconnected'
    check (status in ('disconnected','creating','connecting','connected','error')),
  display_phone text,
  connected_jid text,
  created_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz,
  last_event_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_integrations enable row level security;

revoke all on table public.whatsapp_integrations from public, anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_integrations to service_role;

create index if not exists whatsapp_integrations_status_idx
  on public.whatsapp_integrations(status);

comment on table public.whatsapp_integrations is
  'Server-only mapping between BarberFlow tenants and Evolution API WhatsApp instances. Provider credentials stay in server environment variables.';
