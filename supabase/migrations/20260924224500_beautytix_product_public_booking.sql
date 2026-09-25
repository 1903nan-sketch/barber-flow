create or replace function public.public_booking_data_for_product(p_slug text, p_product text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not exists (
    select 1 from public.tenants
    where slug=lower(trim(p_slug))
      and product_slug=lower(trim(p_product))
  ) then
    return jsonb_build_object('state','not_found');
  end if;
  return public.public_booking_data(p_slug);
end
$$;

create or replace function public.public_available_slots_multi_for_product(
  p_slug text,
  p_product text,
  p_unit uuid,
  p_barber uuid,
  p_services uuid[],
  p_date date
)
returns table(starts_at timestamptz)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not exists (
    select 1 from public.tenants
    where slug=lower(trim(p_slug))
      and product_slug=lower(trim(p_product))
  ) then
    return;
  end if;
  return query
  select s.starts_at
  from public.public_available_slots_multi(p_slug,p_unit,p_barber,p_services,p_date) s;
end
$$;

create or replace function public.public_book_multi_for_product(
  p_slug text,
  p_product text,
  p_unit uuid,
  p_barber uuid,
  p_services uuid[],
  p_starts_at timestamptz,
  p_name text,
  p_phone text,
  p_email text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists (
    select 1 from public.tenants
    where slug=lower(trim(p_slug))
      and product_slug=lower(trim(p_product))
  ) then
    raise exception 'Agenda não encontrada';
  end if;
  return public.public_book_multi(p_slug,p_unit,p_barber,p_services,p_starts_at,p_name,p_phone,p_email);
end
$$;

grant execute on function public.public_booking_data_for_product(text,text) to anon, authenticated;
grant execute on function public.public_available_slots_multi_for_product(text,text,uuid,uuid,uuid[],date) to anon, authenticated;
grant execute on function public.public_book_multi_for_product(text,text,uuid,uuid,uuid[],timestamptz,text,text,text) to anon, authenticated;
