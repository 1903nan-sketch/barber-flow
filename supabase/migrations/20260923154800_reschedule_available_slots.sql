create or replace function public.server_reschedule_slots(
  p_tenant uuid,
  p_appointment uuid,
  p_date date
)
returns table(starts_at timestamptz)
language sql
security definer
set search_path = ''
as $function$
  with appt as (
    select
      a.id,
      a.tenant_id,
      a.unit_id,
      a.barber_id,
      greatest(1, ceil(extract(epoch from (a.ends_at-a.starts_at))/60.0)::int) as duration_min
    from public.appointments a
    where a.tenant_id=p_tenant
      and a.id=p_appointment
      and a.status in ('scheduled','present')
  ),
  ctx as (
    select a.*,u.timezone
    from appt a
    join public.units u
      on u.tenant_id=a.tenant_id
     and u.id=a.unit_id
     and u.active
  ),
  candidates as (
    select
      c.*,
      ((p_date::timestamp + make_interval(mins=>g.minute_value)) at time zone c.timezone) as candidate_start
    from ctx c
    join public.weekly_windows w
      on w.tenant_id=c.tenant_id
     and w.barber_id=c.barber_id
     and w.unit_id=c.unit_id
     and w.weekday=extract(dow from p_date)::int
    cross join lateral generate_series(
      w.start_min,
      w.end_min-c.duration_min,
      greatest(1,w.step_min)
    ) as g(minute_value)
  )
  select candidate_start as starts_at
  from candidates c
  where candidate_start > now()
    and candidate_start <= now()+interval '180 days'
    and not exists (
      select 1
      from public.schedule_exceptions e
      where e.tenant_id=c.tenant_id
        and e.barber_id=c.barber_id
        and e.starts_at < c.candidate_start + make_interval(mins=>c.duration_min)
        and e.ends_at > c.candidate_start
    )
    and not exists (
      select 1
      from public.appointments x
      where x.tenant_id=c.tenant_id
        and x.barber_id=c.barber_id
        and x.id<>c.id
        and x.status<>'cancelled'
        and x.starts_at < c.candidate_start + make_interval(mins=>c.duration_min)
        and x.ends_at > c.candidate_start
    )
  order by candidate_start;
$function$;

revoke all on function public.server_reschedule_slots(uuid,uuid,date) from public;
revoke all on function public.server_reschedule_slots(uuid,uuid,date) from anon;
revoke all on function public.server_reschedule_slots(uuid,uuid,date) from authenticated;
grant execute on function public.server_reschedule_slots(uuid,uuid,date) to service_role;
