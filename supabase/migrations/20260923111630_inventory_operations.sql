-- Complete the previously unused inventory tables without deleting records.
alter table public.products add column category text not null default '';
alter table public.products add column supplier text not null default '';
alter table public.products add column commission_pct numeric(5,2) not null default 0;
alter table public.products add constraint products_tenant_fk foreign key(barbershop_id) references public.tenants(id);
alter table public.products add constraint products_unit_tenant_fk foreign key(barbershop_id,unit_id) references public.units(tenant_id,id);
alter table public.products alter column barbershop_id set not null;
alter table public.products alter column unit_id set not null;
alter table public.products alter column cost_price set not null;
alter table public.products alter column sale_price set not null;
alter table public.products alter column stock_quantity set not null;
alter table public.products alter column minimum_stock set not null;
alter table public.products add constraint products_amounts_valid check (cost_price>=0 and cost_price<10000000 and sale_price>0 and sale_price<10000000 and stock_quantity>=0 and stock_quantity<=100000000 and stock_quantity=trunc(stock_quantity) and minimum_stock>=0 and minimum_stock<=100000000 and minimum_stock=trunc(minimum_stock) and commission_pct between 0 and 100);
alter table public.products add constraint products_tenant_id_unique unique(barbershop_id,id);
create unique index products_sku_unit on public.products(barbershop_id,unit_id,lower(sku)) where sku is not null and sku<>'';
alter table public.stock_movements drop constraint stock_movements_movement_type_check;
alter table public.stock_movements add constraint stock_movement_kind check(movement_type in ('entry','exit','sale','adjustment','loss','return'));
alter table public.stock_movements add column unit_id uuid;
alter table public.stock_movements add column balance_after numeric;
alter table public.stock_movements add column request_key uuid;
alter table public.stock_movements add column requested_quantity integer;
alter table public.stock_movements add column sale_id uuid references public.quick_sales(id);
alter table public.stock_movements add column unit_price numeric;
alter table public.stock_movements add column unit_cost numeric;
alter table public.stock_movements add column commission_pct numeric;
alter table public.stock_movements add constraint stock_product_tenant_fk foreign key(barbershop_id,product_id) references public.products(barbershop_id,id);
alter table public.stock_movements add constraint stock_unit_tenant_fk foreign key(barbershop_id,unit_id) references public.units(tenant_id,id);
alter table public.stock_movements alter column barbershop_id set not null;
alter table public.stock_movements alter column unit_id set not null;
alter table public.stock_movements add constraint stock_delta_valid check(quantity<>0 and quantity=trunc(quantity) and abs(quantity)<=100000000 and balance_after>=0);
create unique index stock_request_unique on public.stock_movements(barbershop_id,request_key) where request_key is not null;
create unique index stock_sale_once on public.stock_movements(sale_id,movement_type) where sale_id is not null;
create index stock_history on public.stock_movements(barbershop_id,product_id,created_at desc);
-- Replace legacy policies with the current tenant permission model.
do $$ declare r record;begin for r in select tablename,policyname from pg_policies where schemaname='public' and tablename in ('products','stock_movements') loop execute format('drop policy %I on public.%I',r.policyname,r.tablename);end loop;end $$;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
revoke all on public.products,public.stock_movements from anon,authenticated;
grant select on public.products,public.stock_movements to authenticated;
create policy inventory_read on public.products for select to authenticated using(private.can(barbershop_id,'inventory'));
create policy inventory_history_read on public.stock_movements for select to authenticated using(private.can(barbershop_id,'inventory'));

create function public.inventory_save(t uuid,p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare i uuid:=nullif(p->>'id','')::uuid; u uuid:=(p->>'unit_id')::uuid;
begin
 if not private.can(t,'inventory') then raise exception 'Sem permissão para estoque' using errcode='42501';end if;
 if length(trim(coalesce(p->>'name','')))<2 or length(p->>'name')>120 then raise exception 'Informe um nome de 2 a 120 caracteres';end if;
 if not exists(select 1 from public.units where tenant_id=t and id=u and active) then raise exception 'Unidade inválida';end if;
 if i is null then
 insert into public.products(barbershop_id,unit_id,name,sku,category,supplier,cost_price,sale_price,minimum_stock,commission_pct,stock_quantity,active)
 values(t,u,trim(p->>'name'),nullif(trim(p->>'sku'),''),coalesce(p->>'category',''),coalesce(p->>'supplier',''),(p->>'cost_price')::numeric,(p->>'sale_price')::numeric,(p->>'minimum_stock')::numeric,coalesce((p->>'commission_pct')::numeric,0),0,true) returning id into i;
 else
 perform 1 from public.products where barbershop_id=t and id=i and unit_id=u for update;
 if not found then raise exception 'Produto ou unidade inválidos';end if;
 update public.products set name=trim(p->>'name'),sku=nullif(trim(p->>'sku'),''),category=coalesce(p->>'category',''),supplier=coalesce(p->>'supplier',''),cost_price=(p->>'cost_price')::numeric,sale_price=(p->>'sale_price')::numeric,minimum_stock=(p->>'minimum_stock')::numeric,commission_pct=coalesce((p->>'commission_pct')::numeric,0),active=coalesce((p->>'active')::boolean,true) where id=i and barbershop_id=t;
 end if;
 perform private.log(t,u,'inventory.product_saved',i,jsonb_build_object('name',p->>'name'));
 return i;
end $$;

create function public.inventory_move(t uuid,i uuid,k text,q integer,n text,r uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare product public.products; previous public.stock_movements; delta numeric; mid uuid;
begin
 if not private.can(t,'inventory') then raise exception 'Sem permissão para estoque' using errcode='42501';end if;
 if r is null or k is null or k not in ('entry','exit','adjustment','loss') or q is null or q<0 or q>100000000 then raise exception 'Movimentação inválida';end if;
 if length(trim(coalesce(n,'')))<3 then raise exception 'Informe o motivo da movimentação';end if;
 select * into product from public.products where id=i and barbershop_id=t for update;
 if not found or not product.active then raise exception 'Produto indisponível';end if;
 select * into previous from public.stock_movements where barbershop_id=t and request_key=r;
 if found then
 if previous.product_id<>i or previous.movement_type<>k or previous.requested_quantity<>q or previous.notes is distinct from n then raise exception 'Identificador já utilizado';end if;
 return previous.id;end if;
 delta:=case when k='adjustment' then q-product.stock_quantity when k in ('loss','exit') then -q else q end;
 if delta=0 then raise exception 'A movimentação não altera o saldo';end if;
 if product.stock_quantity+delta<0 then raise exception 'Estoque insuficiente';end if;
 update public.products set stock_quantity=stock_quantity+delta where id=i;
 insert into public.stock_movements(barbershop_id,unit_id,product_id,movement_type,quantity,balance_after,notes,created_by,request_key,requested_quantity)
 values(t,product.unit_id,i,k,delta,product.stock_quantity+delta,n,auth.uid(),r,q) returning id into mid;
 perform private.log(t,product.unit_id,'inventory.'||k,i,jsonb_build_object('delta',delta,'balance',product.stock_quantity+delta,'reason',n));return mid;
end $$;

create function public.inventory_sell(t uuid,i uuid,q integer,c uuid,b uuid,m text,r uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare product public.products; sid uuid; previous public.stock_movements;
begin
 if not private.can(t,'inventory') or (not private.can(t,'booking') and not private.can(t,'agenda')) then raise exception 'Sem permissão para vender produtos' using errcode='42501';end if;
 if m is null or m not in ('pix','cash','credit','debit','account') then raise exception 'Pagamento inválido';end if;
 if q is null or q<1 or q>1000000 or r is null then raise exception 'Quantidade inválida';end if;
 select * into product from public.products where id=i and barbershop_id=t for update;
 if not found or not product.active then raise exception 'Produto indisponível';end if;
 select * into previous from public.stock_movements where barbershop_id=t and request_key=r;
 if found then if previous.product_id<>i or previous.movement_type<>'sale' or previous.quantity<>-q then raise exception 'Identificador já utilizado';end if;return previous.sale_id;end if;
 if product.stock_quantity<q then raise exception 'Estoque insuficiente';end if;
 sid:=public.quick_sale(t,jsonb_build_object('unit_id',product.unit_id,'client_id',c,'barber_id',b,'description',q||'x '||product.name,'amount_cents',(product.sale_price*100*q)::integer,'method',m));
 update public.products set stock_quantity=stock_quantity-q where id=i;
 insert into public.stock_movements(barbershop_id,unit_id,product_id,movement_type,quantity,balance_after,notes,created_by,request_key,sale_id,unit_price,unit_cost,commission_pct)
 values(t,product.unit_id,i,'sale',-q,product.stock_quantity-q,'Venda de produto',auth.uid(),r,sid,product.sale_price,product.cost_price,product.commission_pct);
 perform private.log(t,product.unit_id,'inventory.sold',i,jsonb_build_object('sale_id',sid,'quantity',q));return sid;
end $$;

create function private.inventory_sale_cancel() returns trigger language plpgsql security definer set search_path='' as $$
declare movement public.stock_movements; balance numeric;
begin
 select * into movement from public.stock_movements where sale_id=new.id and movement_type='sale';
 if not found then return new;end if;
 if old.status='cancelled' and new.status<>'cancelled' then raise exception 'Venda de produto cancelada não pode ser reaberta. Registre uma nova venda.';end if;
 if old.status<>'cancelled' and new.status='cancelled' then
 update public.products set stock_quantity=stock_quantity-movement.quantity where id=movement.product_id and barbershop_id=new.tenant_id returning stock_quantity into balance;
 insert into public.stock_movements(barbershop_id,unit_id,product_id,movement_type,quantity,balance_after,notes,created_by,sale_id)
 values(new.tenant_id,movement.unit_id,movement.product_id,'return',-movement.quantity,balance,'Cancelamento da venda',auth.uid(),new.id);
 perform private.log(new.tenant_id,movement.unit_id,'inventory.sale_returned',movement.product_id,jsonb_build_object('sale_id',new.id));
 end if;return new;
end $$;
create trigger inventory_cancel_sale after update of status on public.quick_sales for each row execute function private.inventory_sale_cancel();
revoke all on function public.inventory_save(uuid,jsonb),public.inventory_move(uuid,uuid,text,integer,text,uuid),public.inventory_sell(uuid,uuid,integer,uuid,uuid,text,uuid) from public,anon;
grant execute on function public.inventory_save(uuid,jsonb),public.inventory_move(uuid,uuid,text,integer,text,uuid),public.inventory_sell(uuid,uuid,integer,uuid,uuid,text,uuid) to authenticated;
revoke all on function private.inventory_sale_cancel() from public,anon,authenticated;
-- Preserve the current role checks while extending the permission allow-list.
do $$ declare r record;begin for r in select oid,pg_get_functiondef(oid) as def from pg_proc where pronamespace='public'::regnamespace and proname in ('save_record','save_staff_member') loop
 execute replace(r.def,'''settings'',''audit''','''settings'',''audit'',''inventory''');
end loop;end $$;
