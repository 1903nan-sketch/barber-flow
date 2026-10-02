-- Quick-sale cart (Caixa Rápido) only stored the sale total, so services sold
-- there never produced commission for the selected professional. Snapshot the
-- commission (service commission_bps + product commission_pct) on the sale.
alter table public.quick_sales add column if not exists commission_cents integer check (commission_cents >= 0);

CREATE OR REPLACE FUNCTION public.quick_sale_cart(t uuid, p jsonb, items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  row jsonb;
  kind text;
  ref uuid;
  qty integer;
  service public.services;
  product public.products;
  total integer:=0;
  description_parts text[]:=array[]::text[];
  sale_unit uuid:=nullif(p->>'unit_id','')::uuid;
  sid uuid;
  amount integer;
  comm bigint:=0;
begin
  if not private.can(t,'booking') and not private.can(t,'agenda') then
    raise exception 'Sem permissão para vender' using errcode='42501';
  end if;
  if jsonb_typeof(items)<>'array' or jsonb_array_length(items)=0 then
    raise exception 'Adicione pelo menos um item';
  end if;

  for row in select value from jsonb_array_elements(items)
  loop
    kind:=row->>'kind';
    ref:=nullif(row->>'id','')::uuid;
    qty:=coalesce((row->>'qty')::integer,0);
    if ref is null or qty<1 or qty>10000 then raise exception 'Item ou quantidade inválida'; end if;

    if kind='service' then
      select * into service from public.services where tenant_id=t and id=ref and active;
      if not found then raise exception 'Serviço indisponível'; end if;
      amount:=service.price_cents*qty;
      total:=total+amount;
      comm:=comm+round(amount::numeric*service.commission_bps/10000);
      description_parts:=array_append(description_parts,qty||'x '||service.name);

    elsif kind='product' then
      select * into product from public.products where barbershop_id=t and id=ref and active for update;
      if not found then raise exception 'Produto indisponível'; end if;
      if product.stock_quantity<qty then raise exception 'Estoque insuficiente para %',product.name; end if;
      if sale_unit is null then sale_unit:=product.unit_id; end if;
      if product.unit_id<>sale_unit then raise exception 'Selecione produtos da mesma unidade na mesma venda'; end if;
      amount:=round(product.sale_price*100)::integer*qty;
      total:=total+amount;
      comm:=comm+round(amount::numeric*product.commission_pct/100);
      description_parts:=array_append(description_parts,qty||'x '||product.name);
    else
      raise exception 'Tipo de item inválido';
    end if;
  end loop;

  sid:=public.quick_sale(t,jsonb_build_object(
    'unit_id',sale_unit,
    'client_id',nullif(p->>'client_id',''),
    'barber_id',nullif(p->>'barber_id',''),
    'description',array_to_string(description_parts,' + '),
    'amount_cents',total,
    'method',p->>'method',
    'pix_payload',coalesce(p->>'pix_payload','')
  ));

  for row in select value from jsonb_array_elements(items)
  loop
    if row->>'kind'='product' then
      ref:=(row->>'id')::uuid;
      qty:=(row->>'qty')::integer;
      select * into product from public.products where barbershop_id=t and id=ref for update;

      update public.products
      set stock_quantity=stock_quantity-qty
      where id=ref and barbershop_id=t;

      insert into public.stock_movements(
        barbershop_id,unit_id,product_id,movement_type,quantity,balance_after,notes,
        created_by,sale_id,unit_price,unit_cost,commission_pct
      )
      values(
        t,product.unit_id,ref,'sale',-qty,product.stock_quantity-qty,'Venda rápida',
        auth.uid(),sid,product.sale_price,product.cost_price,product.commission_pct
      );
    end if;
  end loop;

  update public.quick_sales set commission_cents=comm where id=sid;

  perform private.log(t,sale_unit,'quick_sale.cart_created',sid,jsonb_build_object('items',items,'amount_cents',total));
  return sid;
end
$function$;
