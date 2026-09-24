-- Quick sale can sell services and stock products in one transaction.
drop index if exists public.stock_sale_once;
create unique index if not exists stock_sale_product_once
on public.stock_movements(sale_id,product_id,movement_type)
where sale_id is not null and product_id is not null;

create or replace function private.inventory_sale_cancel()
returns trigger language plpgsql security definer set search_path='' as $$
declare movement public.stock_movements; balance numeric;
begin
 if old.status='cancelled' and new.status<>'cancelled' then raise exception 'Venda de produto cancelada não pode ser reaberta. Registre uma nova venda.'; end if;
 if old.status<>'cancelled' and new.status='cancelled' then
  for movement in select * from public.stock_movements where sale_id=new.id and movement_type='sale' order by created_at,id loop
   update public.products set stock_quantity=stock_quantity-movement.quantity where id=movement.product_id and barbershop_id=new.tenant_id returning stock_quantity into balance;
   insert into public.stock_movements(barbershop_id,unit_id,product_id,movement_type,quantity,balance_after,notes,created_by,sale_id,unit_price,unit_cost,commission_pct)
   values(new.tenant_id,movement.unit_id,movement.product_id,'return',-movement.quantity,balance,'Cancelamento da venda',auth.uid(),new.id,movement.unit_price,movement.unit_cost,movement.commission_pct);
   perform private.log(new.tenant_id,movement.unit_id,'inventory.sale_returned',movement.product_id,jsonb_build_object('sale_id',new.id,'quantity',-movement.quantity));
  end loop;
 end if;
 return new;
end $$;

create or replace function public.quick_sale_catalog(t uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.can(t,'booking') and not private.can(t,'agenda') then raise exception 'Sem permissão para vender' using errcode='42501'; end if;
 return jsonb_build_object(
  'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'kind','service','name',s.name,'price_cents',s.price_cents,'duration',s.duration) order by s.name) from public.services s where s.tenant_id=t and s.active),'[]'::jsonb),
  'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'kind','product','name',p.name,'price_cents',round(p.sale_price*100)::integer,'stock',p.stock_quantity::integer,'unit_id',p.unit_id,'unit_name',u.name) order by p.name) from public.products p join public.units u on u.tenant_id=p.barbershop_id and u.id=p.unit_id where p.barbershop_id=t and p.active and u.active),'[]'::jsonb)
 );
end $$;

create or replace function public.quick_sale_cart(t uuid,p jsonb,items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare row jsonb;kind text;ref uuid;qty integer;service public.services;product public.products;total integer:=0;description_parts text[]:=array[]::text[];sale_unit uuid:=nullif(p->>'unit_id','')::uuid;sid uuid;amount integer;
begin
 if not private.can(t,'booking') and not private.can(t,'agenda') then raise exception 'Sem permissão para vender' using errcode='42501'; end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items)=0 then raise exception 'Adicione pelo menos um item'; end if;
 for row in select value from jsonb_array_elements(items) loop
  kind:=row->>'kind';ref:=nullif(row->>'id','')::uuid;qty:=coalesce((row->>'qty')::integer,0);
  if ref is null or qty<1 or qty>10000 then raise exception 'Item ou quantidade inválida'; end if;
  if kind='service' then
   select * into service from public.services where tenant_id=t and id=ref and active;
   if not found then raise exception 'Serviço indisponível'; end if;
   amount:=service.price_cents*qty;total:=total+amount;description_parts:=array_append(description_parts,qty||'x '||service.name);
  elsif kind='product' then
   select * into product from public.products where barbershop_id=t and id=ref and active for update;
   if not found then raise exception 'Produto indisponível'; end if;
   if product.stock_quantity<qty then raise exception 'Estoque insuficiente para %',product.name; end if;
   if sale_unit is null then sale_unit:=product.unit_id; end if;
   if product.unit_id<>sale_unit then raise exception 'Selecione produtos da mesma unidade na mesma venda'; end if;
   amount:=round(product.sale_price*100)::integer*qty;total:=total+amount;description_parts:=array_append(description_parts,qty||'x '||product.name);
  else raise exception 'Tipo de item inválido'; end if;
 end loop;
 sid:=public.quick_sale(t,jsonb_build_object('unit_id',sale_unit,'client_id',nullif(p->>'client_id',''),'barber_id',nullif(p->>'barber_id',''),'description',array_to_string(description_parts,' + '),'amount_cents',total,'method',p->>'method','pix_payload',coalesce(p->>'pix_payload','')));
 for row in select value from jsonb_array_elements(items) loop
  if row->>'kind'='product' then
   ref:=(row->>'id')::uuid;qty:=(row->>'qty')::integer;
   select * into product from public.products where barbershop_id=t and id=ref for update;
   update public.products set stock_quantity=stock_quantity-qty where id=ref and barbershop_id=t;
   insert into public.stock_movements(barbershop_id,unit_id,product_id,movement_type,quantity,balance_after,notes,created_by,sale_id,unit_price,unit_cost,commission_pct)
   values(t,product.unit_id,ref,'sale',-qty,product.stock_quantity-qty,'Venda rápida',auth.uid(),sid,product.sale_price,product.cost_price,product.commission_pct);
  end if;
 end loop;
 perform private.log(t,sale_unit,'quick_sale.cart_created',sid,jsonb_build_object('items',items,'amount_cents',total));
 return sid;
end $$;

revoke all on function public.quick_sale_catalog(uuid),public.quick_sale_cart(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.quick_sale_catalog(uuid),public.quick_sale_cart(uuid,jsonb,jsonb) to authenticated;
