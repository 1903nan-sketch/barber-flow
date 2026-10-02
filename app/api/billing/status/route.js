import {NextResponse} from "next/server";
import {activeUnitCount,requireTenantOwner} from "../../../../lib/billing-server";
import {asaasConfigured,calculateBillingAmount,getSubscriptionPix,validTaxId} from "../../../../lib/asaas";

export async function GET(request){
 try{
  const tenantId=new URL(request.url).searchParams.get("tenant_id");
  const ctx=await requireTenantOwner(request,tenantId);
  const units=await activeUnitCount(ctx.admin,ctx.tenant.id);
  const amountCents=calculateBillingAmount(ctx.tenant,ctx.plan,units);
  let pix=null,pixError="";
  if(asaasConfigured()&&ctx.tenant.billing_method==="PIX"&&ctx.tenant.asaas_subscription_id){
   try{pix=await getSubscriptionPix(ctx.tenant.asaas_subscription_id)}
   catch(err){pixError=err.message||"Não foi possível carregar o PIX atual."}
  }
  return NextResponse.json({
   configured:asaasConfigured(),
   tenant_id:ctx.tenant.id,
   amount_cents:amountCents,
   due_date:ctx.tenant.billing_due_date,
   status:ctx.tenant.status,
   provider:ctx.tenant.billing_provider||"",
   billing_method:ctx.tenant.billing_method||"",
   provider_status:ctx.tenant.billing_provider_status||"",
   has_subscription:Boolean(ctx.tenant.asaas_subscription_id),
   needs_tax_id:!ctx.tenant.asaas_customer_id&&!validTaxId(ctx.tenant.owner_document),
   pix,
   pix_error:pixError
  });
 }catch(err){
  return NextResponse.json({error:err.message||"Não foi possível carregar a cobrança."},{status:err.status||500});
 }
}
