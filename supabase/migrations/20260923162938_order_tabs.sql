-- Order tabs are private operational records; all mutations are audited RPCs.
alter table public.appointments add constraint appointments_tenant_id_unique unique(tenant_id,id);
create table public.order_tabs(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),unit_id uuid not null,barber_id uuid not null,client_id uuid not null,appointment_id uuid,
 status text not null default 'open' check(status in ('open','closed','cancelled')),total_cents integer not null default 0 check(total_cents>=0),
 request_key uuid not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),closed_at timestamptz,cancelled_at timestamptz,cancellation_reason text,
 unique(tenant_id,id),unique(tenant_id,request_key),foreign key(tenant_id,unit_id) references public.units(tenant_id,id),foreign key(tenant_id,barber_id) references public.barbers(tenant_id,id),foreign key(tenant_id,client_id) references public.clients(tenant_id,id),foreign key(tenant_id,appointment_id) references public.appointments(tenant_id,id)
);
create unique index order_appointment_once on public.order_tabs(appointment_id) where appointment_id is not null and status<>'cancelled';
create index orders_tenant_created on public.order_tabs(tenant_id,created_at desc);
create table public.order_items(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,order_id uuid not null,kind text not null check(kind in ('service','product','appointment')),reference_id uuid not null,
 name text not null,quantity integer not null check(quantity between 1 and 10000),unit_price_cents integer not null check(unit_price_cents>0),commission_bps integer not null check(commission_bps between 0 and 10000),
 removed_at timestamptz,created_at timestamptz not null default now(),request_key uuid not null,unique(tenant_id,request_key),foreign key(tenant_id,order_id) references public.order_tabs(tenant_id,id)
);
create index order_items_order on public.order_items(tenant_id,order_id);
alter table public.quick_sales add column order_id uuid;
alter table public.quick_sales add constraint quick_sales_order_tenant foreign key(tenant_id,order_id) references public.order_tabs(tenant_id,id);
create index quick_sales_order on public.quick_sales(order_id) where order_id is not null;
alter table public.stock_movements add column order_id uuid;
alter table public.stock_movements add constraint stock_order_tenant foreign key(barbershop_id,order_id) references public.order_tabs(tenant_id,id);
create unique index order_stock_once on public.stock_movements(order_id,product_id,movement_type) where order_id is not null;
create function private.order_access(t uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.member(t) and exists(select 1 from public.memberships m where m.tenant_id=t and m.user_id=auth.uid() and m.active and (m.role='owner' or (m.role in ('manager','reception') and ('booking'=any(m.permissions) or 'agenda'=any(m.permissions))) or (m.role='barber' and 'booking'=any(m.permissions) and exists(select 1 from public.barbers where tenant_id=t and id=b and user_id=auth.uid()))));
$$;
revoke all on function private.order_access(uuid,uuid) from public,anon;
grant execute on function private.order_access(uuid,uuid) to authenticated;
alter table public.order_tabs enable row level security;
alter table public.order_items enable row level security;
revoke all on public.order_tabs,public.order_items from anon,authenticated;
grant select on public.order_tabs,public.order_items to authenticated;
create policy order_read on public.order_tabs for select to authenticated using(private.order_access(tenant_id,barber_id));
create policy order_item_read on public.order_items for select to authenticated using(exists(select 1 from public.order_tabs o where o.id=order_id and o.tenant_id=order_items.tenant_id));

create function public.order_open(t uuid,u uuid,b uuid,c uuid,a uuid,r uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.order_tabs;ap public.appointments;i uuid;
begin
 if not private.order_access(t,b) then raise exception 'Sem permissão para esta comanda' using errcode='42501';end if;
 if r is null then raise exception 'Identificador obrigatório';end if;
 perform 1 from public.barbers where tenant_id=t and id=b and active for update;if not found then raise exception 'Profissional indisponível';end if;
 select * into o from public.order_tabs where tenant_id=t and request_key=r;
 if found then if o.unit_id<>u or o.barber_id<>b or o.client_id<>c or o.appointment_id is distinct from a then raise exception 'Identificador já utilizado';end if;return o.id;end if;
 if not exists(select 1 from public.units where tenant_id=t and id=u and active) then raise exception 'Unidade inválida';end if;
 if a is not null then
 select * into ap from public.appointments where tenant_id=t and id=a for update;
 if not found or ap.unit_id<>u or ap.barber_id<>b or ap.client_id<>c or ap.status not in ('scheduled','present','in_service') then raise exception 'Agendamento indisponível para comanda';end if;
 if exists(select 1 from public.appointment_payments where tenant_id=t and appointment_id=a) then raise exception 'Este atendimento já possui pagamento registrado';end if;
 select id into i from public.order_tabs where tenant_id=t and appointment_id=a and status<>'cancelled';if found then return i;end if;
 end if;
 insert into public.order_tabs(tenant_id,unit_id,barber_id,client_id,appointment_id,request_key,created_by) values(t,u,b,c,a,r,auth.uid()) returning id into i;
 if a is not null then
 insert into public.order_items(tenant_id,order_id,kind,reference_id,name,quantity,unit_price_cents,commission_bps,request_key)
 values(t,i,'appointment',a,'Atendimento agendado',1,ap.price_cents,ap.commission_bps,gen_random_uuid());
 end if;
 perform private.log(t,u,'order.opened',i,jsonb_build_object('appointment_id',a));return i;
end $$;

create function public.order_catalog(t uuid,i uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.order_tabs;s jsonb;p jsonb;
begin
 select * into o from public.order_tabs where tenant_id=t and id=i;
 if not found or not private.order_access(t,o.barber_id) then raise exception 'Sem permissão' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'price_cents',s.price_cents) order by s.name),'[]') into s from public.services s where s.tenant_id=t and s.active and exists(select 1 from public.barber_services bs where bs.tenant_id=t and bs.barber_id=o.barber_id and bs.service_id=s.id);
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'price_cents',(p.sale_price*100)::int,'stock',p.stock_quantity) order by p.name),'[]') into p from public.products p where p.barbershop_id=t and p.unit_id=o.unit_id and p.active;
 return jsonb_build_object('services',s,'products',p);
end $$;

create function public.order_add_item(t uuid,i uuid,k text,ref uuid,q integer,r uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.order_tabs;item public.order_items;s public.services;p public.products;item_name text;price integer;rate integer;mid uuid;
begin
 select * into o from public.order_tabs where tenant_id=t and id=i for update;
 if not found or not private.order_access(t,o.barber_id) then raise exception 'Sem permissão' using errcode='42501';end if;
 if o.status<>'open' or q is null or q not between 1 and 10000 or r is null then raise exception 'Comanda ou quantidade inválida';end if;
 select * into item from public.order_items where tenant_id=t and request_key=r;
 if found then if item.order_id<>i or item.kind<>k or item.reference_id<>ref or item.quantity<>q then raise exception 'Identificador já utilizado';end if;return item.id;end if;
 if k='service' then
 select * into s from public.services where tenant_id=t and id=ref and active;
 if not found or not exists(select 1 from public.barber_services where tenant_id=t and barber_id=o.barber_id and service_id=ref) then raise exception 'Serviço não habilitado para este profissional';end if;
 item_name:=s.name;price:=s.price_cents;rate:=s.commission_bps;
 elsif k='product' then
 select * into p from public.products where barbershop_id=t and id=ref and unit_id=o.unit_id and active;
 if not found then raise exception 'Produto indisponível nesta unidade';end if;
 item_name:=p.name;price:=(p.sale_price*100)::int;rate:=(p.commission_pct*100)::int;
 else raise exception 'Tipo inválido';end if;
 insert into public.order_items(tenant_id,order_id,kind,reference_id,name,quantity,unit_price_cents,commission_bps,request_key) values(t,i,k,ref,item_name,q,price,rate,r) returning id into mid;
 perform private.log(t,o.unit_id,'order.item_added',i,jsonb_build_object('item_id',mid,'quantity',q,'price_cents',price));return mid;
end $$;
create function public.order_remove_item(t uuid,i uuid,item_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.order_tabs;
begin
 select * into o from public.order_tabs where tenant_id=t and id=i for update;
 if not found or not private.order_access(t,o.barber_id) then raise exception 'Sem permissão' using errcode='42501';end if;
 if o.status<>'open' then raise exception 'A comanda não está aberta';end if;
 update public.order_items set removed_at=now() where tenant_id=t and order_id=i and id=item_id and removed_at is null and kind<>'appointment';
 if not found then raise exception 'Item indisponível; o atendimento original não pode ser removido';end if;
 perform private.log(t,o.unit_id,'order.item_removed',i,jsonb_build_object('item_id',item_id));
end $$;

create function public.order_close(t uuid,i uuid,payments jsonb,expected_total integer) returns void language plpgsql security definer set search_path='' as $$
declare o public.order_tabs;ap public.appointments;total bigint;paid bigint;line record;product public.products;payment jsonb;
begin
 select * into o from public.order_tabs where tenant_id=t and id=i;
 if not found or not private.order_access(t,o.barber_id) then raise exception 'Sem permissão' using errcode='42501';end if;
 perform 1 from public.barbers where tenant_id=t and id=o.barber_id for update;
 select * into o from public.order_tabs where tenant_id=t and id=i for update;
 if o.status='closed' then return;end if;if o.status<>'open' then raise exception 'Comanda cancelada';end if;
 if o.appointment_id is not null then
 select * into ap from public.appointments where tenant_id=t and id=o.appointment_id for update;
 if ap.status not in ('scheduled','present','in_service') or exists(select 1 from public.appointment_payments where tenant_id=t and appointment_id=ap.id) then raise exception 'Atendimento já finalizado ou cancelado';end if;
 end if;
 select sum(quantity::bigint*unit_price_cents) into total from public.order_items where tenant_id=t and order_id=i and removed_at is null;
 if total is null or total<=0 or total>2147483647 or expected_total is distinct from total then raise exception 'Total alterado. Atualize a comanda antes de confirmar';end if;
 if jsonb_typeof(payments) is distinct from 'array' or jsonb_array_length(payments) not between 1 and 8 then raise exception 'Informe os pagamentos';end if;
 paid:=0;
 for payment in select value from jsonb_array_elements(payments) loop
 if coalesce(payment->>'method','') not in ('cash','pix','credit','debit','account') or coalesce((payment->>'amount_cents')::integer,0)<=0 then raise exception 'Pagamento inválido';end if;
 paid:=paid+(payment->>'amount_cents')::integer;
 end loop;
 if paid<>total then raise exception 'A soma dos pagamentos deve ser igual ao total da comanda';end if;
 -- Consistent lock order prevents overselling between concurrent tabs.
 for line in select reference_id,sum(quantity)::integer as qty from public.order_items where tenant_id=t and order_id=i and kind='product' and removed_at is null group by reference_id order by reference_id loop
 select * into product from public.products where barbershop_id=t and id=line.reference_id and unit_id=o.unit_id for update;
 if not found or not product.active or product.stock_quantity<line.qty then raise exception 'Estoque insuficiente ou produto indisponível';end if;
 update public.products set stock_quantity=stock_quantity-line.qty where id=product.id;
 insert into public.stock_movements(barbershop_id,unit_id,product_id,movement_type,quantity,balance_after,notes,created_by,order_id,unit_cost)
 values(t,o.unit_id,product.id,'sale',-line.qty,product.stock_quantity-line.qty,'Fechamento de comanda',auth.uid(),i,product.cost_price);
 end loop;
 for payment in select value from jsonb_array_elements(payments) loop
 insert into public.quick_sales(tenant_id,unit_id,client_id,barber_id,description,amount_cents,method,status,paid_at,created_by,order_id)
 values(t,o.unit_id,o.client_id,o.barber_id,'Comanda '||left(i::text,8),(payment->>'amount_cents')::integer,payment->>'method',case when payment->>'method'='account' then 'open' else 'paid' end,case when payment->>'method'='account' then null else now() end,auth.uid(),i);
 end loop;
 update public.order_tabs set status='closed',total_cents=total,closed_at=now() where id=i;
 if o.appointment_id is not null then update public.appointments set status='completed' where id=o.appointment_id and tenant_id=t;end if;
 perform private.log(t,o.unit_id,'order.closed',i,jsonb_build_object('total_cents',total,'payments',payments));
end $$;

create function public.order_cancel(t uuid,i uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare o public.order_tabs;line record;balance numeric;
begin
 if not private.can(t,'finance') then raise exception 'Permissão financeira necessária para cancelar comandas' using errcode='42501';end if;
 if length(trim(coalesce(reason,'')))<3 then raise exception 'Informe o motivo';end if;
 select * into o from public.order_tabs where tenant_id=t and id=i for update;
 if not found then raise exception 'Comanda inválida';end if;if o.status='cancelled' then return;end if;
 update public.order_tabs set status='cancelled',cancelled_at=now(),cancellation_reason=reason where id=i;
 update public.quick_sales set status='cancelled' where tenant_id=t and order_id=i;
 if o.status='closed' then
 for line in select * from public.stock_movements where barbershop_id=t and order_id=i and movement_type='sale' order by product_id loop
 update public.products set stock_quantity=stock_quantity-line.quantity where barbershop_id=t and id=line.product_id returning stock_quantity into balance;
 insert into public.stock_movements(barbershop_id,unit_id,product_id,movement_type,quantity,balance_after,notes,created_by,order_id)
 values(t,o.unit_id,line.product_id,'return',-line.quantity,balance,'Cancelamento de comanda: '||reason,auth.uid(),i);
 end loop;
 end if;
 perform private.log(t,o.unit_id,'order.cancelled',i,jsonb_build_object('reason',reason,'previous_status',o.status));
end $$;
create function private.order_payment_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.order_id is null then return new;end if;
 if new.status='cancelled' and exists(select 1 from public.order_tabs where id=old.order_id and tenant_id=old.tenant_id and status='cancelled') then return new;end if;
 if old.status='open' and new.status='paid' and new.method in ('cash','pix','credit','debit') and new.amount_cents=old.amount_cents then return new;end if;
 raise exception 'Este pagamento pertence a uma comanda. Faça o cancelamento pela tela de Comandas.';
end $$;
create trigger order_payment_guard before update on public.quick_sales for each row when(old.order_id is not null) execute function private.order_payment_guard();
create function private.order_appointment_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.order_tabs where tenant_id=new.tenant_id and appointment_id=new.appointment_id and status<>'cancelled') then raise exception 'Este atendimento possui comanda. Finalize pela tela de Comandas.';end if;return new;
end $$;
create trigger order_appointment_guard before insert on public.appointment_payments for each row execute function private.order_appointment_guard();
revoke all on function private.order_payment_guard(),private.order_appointment_guard() from public,anon,authenticated;
revoke all on function public.order_open(uuid,uuid,uuid,uuid,uuid,uuid),public.order_catalog(uuid,uuid),public.order_add_item(uuid,uuid,text,uuid,integer,uuid),public.order_remove_item(uuid,uuid,uuid),public.order_close(uuid,uuid,jsonb,integer),public.order_cancel(uuid,uuid,text) from public,anon;
grant execute on function public.order_open(uuid,uuid,uuid,uuid,uuid,uuid),public.order_catalog(uuid,uuid),public.order_add_item(uuid,uuid,text,uuid,integer,uuid),public.order_remove_item(uuid,uuid,uuid),public.order_close(uuid,uuid,jsonb,integer),public.order_cancel(uuid,uuid,text) to authenticated;
