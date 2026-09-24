-- Add initial stock on product creation and prevent duplicate product records in the same unit.
create or replace function public.inventory_save(t uuid,p jsonb)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
 i uuid:=nullif(p->>'id','')::uuid;
 u uuid:=(p->>'unit_id')::uuid;
 initial_qty integer:=greatest(0,coalesce(nullif(p->>'initial_quantity','')::integer,0));
 existing uuid;
begin
 if not private.can(t,'inventory') then raise exception 'Sem permissão para estoque' using errcode='42501'; end if;
 if length(trim(coalesce(p->>'name','')))<2 or length(p->>'name')>120 then raise exception 'Informe um nome de 2 a 120 caracteres'; end if;
 if not exists(select 1 from public.units where tenant_id=t and id=u and active) then raise exception 'Unidade inválida'; end if;

 if i is null then
  select pr.id into existing from public.products pr
  where pr.barbershop_id=t and pr.unit_id=u and pr.active
   and (lower(trim(pr.name))=lower(trim(p->>'name'))
     or (nullif(trim(coalesce(p->>'sku','')),'') is not null and lower(trim(coalesce(pr.sku,'')))=lower(trim(p->>'sku'))))
  limit 1;
  if existing is not null then raise exception 'Produto já cadastrado nesta unidade. Use "Registrar entrada" para somar a nova quantidade.'; end if;

  insert into public.products(barbershop_id,unit_id,name,sku,category,supplier,cost_price,sale_price,minimum_stock,commission_pct,stock_quantity,active)
  values(t,u,trim(p->>'name'),nullif(trim(p->>'sku'),''),coalesce(p->>'category',''),coalesce(p->>'supplier',''),(p->>'cost_price')::numeric,(p->>'sale_price')::numeric,(p->>'minimum_stock')::numeric,coalesce((p->>'commission_pct')::numeric,0),initial_qty,true)
  returning id into i;

  if initial_qty>0 then
   insert into public.stock_movements(barbershop_id,unit_id,product_id,movement_type,quantity,balance_after,notes,created_by,request_key,requested_quantity)
   values(t,u,i,'entry',initial_qty,initial_qty,'Estoque inicial',auth.uid(),gen_random_uuid(),initial_qty);
  end if;
 else
  perform 1 from public.products where barbershop_id=t and id=i and unit_id=u for update;
  if not found then raise exception 'Produto ou unidade inválidos'; end if;
  update public.products set name=trim(p->>'name'),sku=nullif(trim(p->>'sku'),''),category=coalesce(p->>'category',''),supplier=coalesce(p->>'supplier',''),cost_price=(p->>'cost_price')::numeric,sale_price=(p->>'sale_price')::numeric,minimum_stock=(p->>'minimum_stock')::numeric,commission_pct=coalesce((p->>'commission_pct')::numeric,0),active=coalesce((p->>'active')::boolean,true)
  where id=i and barbershop_id=t;
 end if;
 perform private.log(t,u,'inventory.product_saved',i,jsonb_build_object('name',p->>'name','initial_quantity',initial_qty));
 return i;
end $$;
