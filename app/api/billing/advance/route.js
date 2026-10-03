import {NextResponse} from "next/server";
import {activeUnitCount,ensureAsaasCustomer,requireTenantOwner} from "../../../../lib/billing-server";
import {advanceReference,asaasConfigured,asaasRequest,calculateBillingAmount,findOpenAdvance,getSubscriptionPix,paymentPix} from "../../../../lib/asaas";
import {addDaysISO,todaySP} from "../../../../lib/legal";

// Pay the next month ahead of time with a standalone Pix charge.
// When it is paid, the webhook moves billing_due_date one month forward.
export async function POST(request){
 try{
  if(!asaasConfigured())return NextResponse.json({error:"Cobrança online ainda não foi ativada."},{status:503});
  const body=await request.json().catch(()=>({})),tenantId=String(body.tenant_id||"");
  const ctx=await requireTenantOwner(request,tenantId);
  const tenant=ctx.tenant;
  if(String(tenant.billing_method||"").toUpperCase()==="CREDIT_CARD"&&tenant.asaas_subscription_id)
   return NextResponse.json({error:"Sua mensalidade está no cartão recorrente e é cobrada automaticamente no vencimento."},{status:400});

  // An open charge from the subscription comes first: paying it already counts as paying ahead.
  if(tenant.asaas_subscription_id){
   const pix=await getSubscriptionPix(tenant.asaas_subscription_id);
   if(pix&&!pix.no_pending)return NextResponse.json({kind:"pix",source:"subscription",pix});
  }

  const covered=String(tenant.billing_due_date||todaySP()).slice(0,10);
  const customer=await ensureAsaasCustomer(ctx,body.tax_id);
  let payment=await findOpenAdvance(customer,tenant.id,covered);
  if(!payment){
   const units=await activeUnitCount(ctx.admin,tenant.id);
   const amountCents=calculateBillingAmount(tenant,ctx.plan,units);
   if(amountCents<=0)return NextResponse.json({error:"O valor da assinatura precisa ser maior que zero."},{status:400});
   const coveredBR=new Date(covered+"T12:00:00").toLocaleDateString("pt-BR");
   payment=await asaasRequest("/payments",{method:"POST",body:{
    customer,
    // Same as the monthly subscription: BOLETO charges also expose a Pix QR Code.
    billingType:"BOLETO",
    value:amountCents/100,
    dueDate:addDaysISO(todaySP(),3),
    description:`BarberTix ${ctx.plan?.name||"Plano"} - mensalidade adiantada (vencimento ${coveredBR})`,
    externalReference:advanceReference(tenant.id,covered)
   }});
   if(!payment?.id)throw new Error("O Asaas não retornou a cobrança adiantada.");
  }
  const pix=await paymentPix(payment);
  return NextResponse.json({kind:"pix",source:"advance",covered_due:covered,pix});
 }catch(err){
  console.error("billing advance",err);
  return NextResponse.json({error:err.message||"Não foi possível gerar o pagamento adiantado.",code:err.code||undefined},{status:err.status||500});
 }
}
