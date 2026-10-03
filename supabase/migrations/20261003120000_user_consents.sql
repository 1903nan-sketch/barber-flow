-- LGPD consent records: which user accepted which document version, when and from where.
-- Rows are written only by the server (service role) so IP/user agent come from the request.
create table if not exists public.user_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document text not null check (document in ('terms','privacy','marketing')),
  version text not null check (length(version) between 1 and 40),
  accepted boolean not null default true,
  accepted_at timestamptz not null default now(),
  ip text,
  user_agent text,
  unique (user_id, document, version)
);

create index if not exists user_consents_user_idx on public.user_consents(user_id);

alter table public.user_consents enable row level security;

drop policy if exists user_consents_read_own on public.user_consents;
create policy user_consents_read_own on public.user_consents
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.user_consents from anon, authenticated;
grant select on public.user_consents to authenticated;
