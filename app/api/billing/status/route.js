import {NextResponse} from "next/server";
import {activeUnitCount,requireTenantOwner} from "../../../../lib/billing-server";
import {asaasConfigured,calculateBillingAmount,findOpenAdvance,getSubscriptionPix,paymentPix,validTaxId} from "../../../../lib/asaas";
import {todaySP} from "../../../../lib/legal";

export async function GET(request){
 try{
  const tenantId=new URL(request.url).searchParams.get("tenant_id");
  const ctx=await requireTenantOwner(request,tenantId);
  const units=await activeUnitCount(ctx.admin,ctx.tenant.id);
  const amountCents=calculateBillingAmount(ctx.tenant,ctx.plan,units);
  let pix=null,pixError="";
  if(asaasConfigured()&&ctx.tenant.billing_method==="PIX"&&ctx.tenant.asaas_subscription_id){
   try{pix=await getSubscriptionPix(ctx.tenant.asaas_subscription_id)}
   catch(err){pixError="Não foi possível consultar a cobrança no Asaas"+(err.status?" (HTTP "+err.status+")":"")+". Resposta do Asaas: "+(err.message||"sem detalhes")}
  }
  // An advance Pix generated earlier and not paid yet is shown again instead of a new one.
  let advance=null;
  if(asaasConfigured()&&pix?.no_pending&&ctx.tenant.asaas_customer_id){
   try{const open=await findOpenAdvance(ctx.tenant.asaas_customer_id,ctx.tenant.id,String(ctx.tenant.billing_due_date||todaySP()).slice(0,10));if(open)advance=await paymentPix(open)}
   catch(err){console.error("billing status advance",err.status,err.message)}
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
   pix_error:pixError,
   advance,
   plan_id:ctx.tenant.plan_id,
   trial_ends_at:ctx.tenant.trial_ends_at||null,
   last_paid_at:ctx.tenant.last_paid_at||null,
   // The plan can be picked freely until the first payment; after that, through support.
   can_change_plan:!ctx.tenant.last_paid_at
  });
 }catch(err){
  return NextResponse.json({error:err.message||"Não foi possível carregar a cobrança."},{status:err.status||500});
 }
}
