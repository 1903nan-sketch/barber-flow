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

  // Recurring card checkout requires the customer's address on Asaas.
  // Checked before any subscription is cancelled when switching from Pix.
  const addr=body.address||null,needsCardCheckout=method==="CREDIT_CARD"&&!(ctx.tenant.asaas_subscription_id&&currentMethod==="CREDIT_CARD");
  if(needsCardCheckout&&addr){
   const postalCode=String(addr.postalCode||"").replace(/\D/g,""),address=String(addr.address||"").trim(),addressNumber=String(addr.addressNumber||"").trim(),province=String(addr.province||"").trim();
   if(postalCode.length!==8||!address||!addressNumber||!province)return NextResponse.json({error:"Preencha CEP, rua, número e bairro.",code:"address_required"},{status:400});
   await asaasRequest("/customers/"+encodeURIComponent(customer),{method:"PUT",body:{postalCode,address,addressNumber,complement:String(addr.complement||"").trim()||undefined,province}});
  }else if(needsCardCheckout){
   const c=await asaasRequest("/customers/"+encodeURIComponent(customer));
   if(!c?.postalCode||!c?.address||!c?.addressNumber||!c?.province)return NextResponse.json({error:"Para pagar com cartão, o Asaas pede o endereço do responsável.",code:"address_required"},{status:400});
  }


  // Switching method: cancel the old subscription (Asaas removes its pending charges;
  // paid ones stay) and continue below to create the new one.
  if(ctx.tenant.asaas_subscription_id&&currentMethod!==method){
   try{await asaasRequest("/subscriptions/"+encodeURIComponent(ctx.tenant.asaas_subscription_id),{method:"DELETE"})}
   catch(err){if(err.status!==404)throw err}
   await ctx.admin.from("tenants").update({asaas_subscription_id:null,asaas_checkout_id:null,billing_method:"",billing_provider_status:"SWITCHING_METHOD"}).eq("id",ctx.tenant.id);
   ctx.tenant.asaas_subscription_id=null;ctx.tenant.asaas_checkout_id=null;ctx.tenant.billing_provider_status="SWITCHING_METHOD";
  }

  if(ctx.tenant.asaas_subscription_id){
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
    // Asaas subscriptions do not support PIX directly. BOLETO subscriptions
    // generate a monthly charge that also exposes a Pix QR Code.
    billingType:"BOLETO",
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
    asaas_checkout_id:null,
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
