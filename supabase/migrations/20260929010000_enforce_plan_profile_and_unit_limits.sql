update public.plans set max_units=9999 where name='Pro + Filiais';

create or replace function private.enforce_membership_plan_limit()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_limit int; v_used int;
begin
 if new.role='owner' or not new.active then return new; end if;
 select p.max_profiles into v_limit from public.tenants t join public.plans p on p.id=t.plan_id where t.id=new.tenant_id;
 if v_limit is null then return new; end if;
 select count(*) into v_used from public.memberships m where m.tenant_id=new.tenant_id and m.active and m.role<>'owner' and (tg_op='INSERT' or m.user_id<>new.user_id);
 if v_used>=v_limit then raise exception 'Limite de perfis do plano atingido'; end if;
 return new;
end $$;

drop trigger if exists memberships_plan_limit on public.memberships;
create trigger memberships_plan_limit before insert or update of active,role,tenant_id on public.memberships for each row execute function private.enforce_membership_plan_limit();

create or replace function private.enforce_unit_plan_limit()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_limit int; v_used int;
begin
 if not new.active then return new; end if;
 select p.max_units into v_limit from public.tenants t join public.plans p on p.id=t.plan_id where t.id=new.tenant_id;
 if v_limit is null then return new; end if;
 select count(*) into v_used from public.units u where u.tenant_id=new.tenant_id and u.active and (tg_op='INSERT' or u.id<>new.id);
 if v_used>=v_limit then raise exception 'Seu plano não permite adicionar mais unidades'; end if;
 return new;
end $$;

drop trigger if exists units_plan_limit on public.units;
create trigger units_plan_limit before insert or update of active,tenant_id on public.units for each row execute function private.enforce_unit_plan_limit();
