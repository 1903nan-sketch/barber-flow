alter table public.tenants
  add column if not exists product_slug text not null default 'barberflow';

update public.tenants
set product_slug = 'barberflow'
where product_slug is null or btrim(product_slug) = '';

create index if not exists tenants_product_slug_idx
  on public.tenants(product_slug);
