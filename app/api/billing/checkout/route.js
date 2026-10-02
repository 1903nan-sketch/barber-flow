import {NextResponse} from "next/server";
import {activeUnitCount,ensureAsaasCustomer,requireTenantOwner} from "../../../../lib/billing-server";
import {asaasCheckoutUrl,asaasConfigured,asaasRequest,calculateBillingAmount,effectiveDueDate,getSubscriptionPix} from "../../../../lib/asaas";

export async function POST(request){
 try{
  if(!asaasConfigured())return NextResponse.json({error:"Cobrança online ainda não foi ativada."},{status:503});
  const body=await request.json(),tenantId=String(body.tenant_id||""),method=String(body.method||"").toUpperCase();
  if(!["PIX","CREDIT_CARD"].includes(method))return NextResponse.json({error:"Forma de pagamento inválida."},{status:400});
  const ctx=await requireTenantOwner(request,tenantId);
  const units=await activeUnitCount(ctx.admin,ctx.tenant.id);
  const amountCents=calculateBillingAmount(ctx.tenant,ctx.plan,units);
  if(amountCents<=0)return NextResponse.json({error:"O valor da assinatura precisa ser maior que zero."},{status:400});
  const customer=await ensureAsaasCustomer(ctx,body.tax_id);
  const due=effectiveDueDate(ctx.tenant.billing_due_date);
  const currentMethod=String(ctx.tenant.billing_method||"").toUpperCase();

  if(ctx.tenant.asaas_subscription_id){
   if(currentMethod!==method)return NextResponse.json({error:"Já existe uma assinatura ativa em outra forma de pagamento. Altere a cobrança pelo suporte antes de trocar."},{status:409});
   if(method==="PIX"){
    const pix=await getSubscriptionPix(ctx.tenant.asaas_subscription_id);
    return NextResponse.json({kind:"pix",pix,subscription_id:ctx.tenant.asaas_subscription_id,amount_cents:amountCents});
   }
   return NextResponse.json({kind:"active",message:"O cartão já está configurado para cobrança recorrente.",subscription_id:ctx.tenant.asaas_subscription_id});
  }

  if(method==="CREDIT_CARD"&&ctx.tenant.asaas_checkout_id&&ctx.tenant.billing_provider_status==="CHECKOUT_PENDING"){
   return NextResponse.json({kind:"redirect",url:asaasCheckoutUrl(ctx.tenant.asaas_checkout_id),checkout_id:ctx.tenant.asaas_checkout_id});
  }

  if(method==="PIX"){
   const subscription=await asaasRequest("/subscriptions",{method:"POST",body:{
    customer,
    billingType:"PIX",
    value:amountCents/100,
    nextDueDate:due,
    cycle:"MONTHLY",
    description:"BarberTix - "+(ctx.plan?.name||"Plano"),
    externalReference:"tenant:"+ctx.tenant.id
   }});
   await ctx.admin.from("tenants").update({
    asaas_subscription_id:subscription.id,
    billing_provider:"asaas",
    billing_method:"PIX",
    billing_provider_status:subscription.status||"ACTIVE",
    billing_amount_cents:amountCents
   }).eq("id",ctx.tenant.id);
   let pix=null;
   try{pix=await getSubscriptionPix(subscription.id)}catch{}
   return NextResponse.json({kind:"pix",pix,subscription_id:subscription.id,amount_cents:amountCents});
  }

  const origin=new URL(request.url).origin;
  const checkout=await asaasRequest("/checkouts",{method:"POST",body:{
   billingTypes:["CREDIT_CARD"],
   chargeTypes:["RECURRENT"],
   minutesToExpire:60,
   externalReference:"tenant:"+ctx.tenant.id,
   callback:{
    successUrl:origin+"/dashboard/mensalidade?pagamento=sucesso",
    cancelUrl:origin+"/dashboard/mensalidade?pagamento=cancelado",
    expiredUrl:origin+"/dashboard/mensalidade?pagamento=expirado"
   },
   items:[{
    name:"BarberTix "+(ctx.plan?.name||"Plano"),
    description:"Mensalidade BarberTix",
    quantity:1,
    value:amountCents/100
   }],
   customer,
   subscription:{cycle:"MONTHLY",nextDueDate:due+" 12:00:00"}
  }});
  if(!checkout?.id)throw new Error("O Asaas não retornou o identificador do checkout.");
  await ctx.admin.from("tenants").update({
   asaas_checkout_id:checkout.id,
   billing_provider:"asaas",
   billing_method:"CREDIT_CARD",
   billing_provider_status:"CHECKOUT_PENDING",
   billing_amount_cents:amountCents
  }).eq("id",ctx.tenant.id);
  return NextResponse.json({kind:"redirect",url:asaasCheckoutUrl(checkout.id),checkout_id:checkout.id});
 }catch(err){
  console.error("billing checkout",err);
  return NextResponse.json({error:err.message||"Não foi possível iniciar o pagamento.",code:err.code||undefined},{status:err.status||500});
 }
}
