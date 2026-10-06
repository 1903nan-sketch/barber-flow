import {timingSafeEqual} from "crypto";
import {NextResponse} from "next/server";
import {serverSupabase} from "../../../../lib/billing-server";
import {addMonth} from "../../../../lib/asaas";

function validToken(actual,expected){
 if(!actual||!expected)return false;
 const a=Buffer.from(actual),b=Buffer.from(expected);
 return a.length===b.length&&timingSafeEqual(a,b);
}
function tenantRef(value){
 const m=String(value||"").match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
 return m?.[0]||null;
}
async function byField(admin,field,value){
 if(!value)return null;
 const {data}=await admin.from("tenants").select("id,product_slug,billing_due_date,grace_days,asaas_subscription_id").eq(field,value).maybeSingle();
 return data||null;
}
async function locateTenant(admin,body){
 const payment=body.payment||{},subscription=body.subscription||{},checkout=body.checkout||{};
 const ref=tenantRef(checkout.externalReference||subscription.externalReference||payment.externalReference);
 if(ref){
  const {data}=await admin.from("tenants").select("id,product_slug,billing_due_date,grace_days,asaas_subscription_id").eq("id",ref).maybeSingle();
  if(data)return data;
 }
 return await byField(admin,"asaas_checkout_id",checkout.id)
  ||await byField(admin,"asaas_subscription_id",subscription.id||payment.subscription)
  ||await byField(admin,"asaas_customer_id",payment.customer||subscription.customer||checkout.customer)
  ||null;
}

export async function POST(request){
 const expected=process.env.ASAAS_WEBHOOK_TOKEN||"";
 if(expected.length<32)return NextResponse.json({error:"Webhook Asaas não configurado."},{status:503});
 if(!validToken(request.headers.get("asaas-access-token")||"",expected))return NextResponse.json({error:"Token inválido."},{status:401});
 let body;
 try{body=await request.json()}catch{return NextResponse.json({error:"Payload inválido."},{status:400})}
 const eventId=String(body.id||""),event=String(body.event||"");
 if(!eventId||!event)return NextResponse.json({error:"Evento inválido."},{status:400});
 const admin=serverSupabase();

 try{
  const {data:known}=await admin.from("billing_webhook_events").select("event_id,processed_at").eq("event_id",eventId).maybeSingle();
  if(known?.processed_at)return NextResponse.json({ok:true,duplicate:true});
  if(!known){
   const {error:insertError}=await admin.from("billing_webhook_events").insert({
    event_id:eventId,event_type:event,resource_id:body.payment?.id||body.subscription?.id||body.checkout?.id||null
   });
   if(insertError&&insertError.code!=="23505")throw insertError;
  }

  const tenant=await locateTenant(admin,body);
  if(!tenant){
   await admin.from("billing_webhook_events").update({processed_at:new Date().toISOString()}).eq("event_id",eventId);
   return NextResponse.json({ok:true,ignored:true});
  }
  if(tenant.product_slug!=="beautytix"){
   await admin.from("billing_webhook_events").update({processed_at:new Date().toISOString()}).eq("event_id",eventId);
   return NextResponse.json({ok:true,ignored_product:true});
  }

  const patch={billing_provider:"asaas"};
  const subscription=body.subscription||{},checkout=body.checkout||{},payment=body.payment||{};
  if(event.startsWith("CHECKOUT_")){
   if(checkout.id)patch.asaas_checkout_id=checkout.id;
   if(event==="CHECKOUT_PAID"){patch.status="active";patch.last_paid_at=new Date().toISOString()}
  }

  const current=tenant.asaas_subscription_id||null,eventSub=subscription.id||payment.subscription||null;
  const tracked=!eventSub||!current||eventSub===current;
  const paidEvent=event==="PAYMENT_RECEIVED"||event==="PAYMENT_CONFIRMED";
  if(tracked||paidEvent)patch.billing_provider_status=event;

  if(event.startsWith("SUBSCRIPTION_")){
   if(event==="SUBSCRIPTION_DELETED"||event==="SUBSCRIPTION_INACTIVATED"){
    if(current&&subscription.id===current){patch.asaas_subscription_id=null;patch.billing_method=""}
   }else if(tracked){
    if(subscription.id)patch.asaas_subscription_id=subscription.id;
    if(subscription.customer)patch.asaas_customer_id=subscription.customer;
    if(subscription.billingType)patch.billing_method=subscription.billingType==="BOLETO"?"PIX":subscription.billingType;
    if(subscription.value!=null)patch.billing_amount_cents=Math.round(Number(subscription.value)*100);
    if(subscription.nextDueDate)patch.billing_due_date=String(subscription.nextDueDate).slice(0,10);
   }
  }

  if(event.startsWith("PAYMENT_")&&payment.id){
   if(tracked&&paidEvent){
    if(payment.subscription&&!current)patch.asaas_subscription_id=payment.subscription;
    if(payment.billingType)patch.billing_method=payment.billingType==="BOLETO"?"PIX":payment.billingType;
   }
   if(payment.customer)patch.asaas_customer_id=payment.customer;
   patch.asaas_last_payment_id=payment.id;
   const paidAt=payment.paymentDate||payment.confirmedDate||payment.clientPaymentDate||null;
   await admin.from("billing_payments").upsert({
    tenant_id:tenant.id,
    provider:"asaas",
    provider_payment_id:payment.id,
    provider_subscription_id:payment.subscription||null,
    status:event==="PAYMENT_DELETED"?"DELETED":event==="PAYMENT_REFUNDED"?"REFUNDED":(payment.status||event),
    billing_type:payment.billingType||"",
    value_cents:Math.max(0,Math.round(Number(payment.value||0)*100)),
    due_date:payment.dueDate||null,
    paid_at:paidAt?new Date(paidAt).toISOString():null,
    invoice_url:payment.invoiceUrl||null,
    bank_slip_url:payment.bankSlipUrl||null,
    updated_at:new Date().toISOString()
   },{onConflict:"provider,provider_payment_id"});

   if(paidEvent){
    patch.status="active";
    patch.last_paid_at=new Date().toISOString();
    if(payment.dueDate)patch.billing_due_date=addMonth(String(payment.dueDate).slice(0,10));
   }else if(event==="PAYMENT_OVERDUE"&&tracked){
    patch.status="overdue";
    if(payment.dueDate)patch.billing_due_date=String(payment.dueDate).slice(0,10);
   }
  }

  await admin.from("tenants").update(patch).eq("id",tenant.id);
  await admin.rpc("sync_tenant_billing_status",{p_tenant:tenant.id});
  await admin.from("billing_webhook_events").update({tenant_id:tenant.id,processed_at:new Date().toISOString()}).eq("event_id",eventId);
  return NextResponse.json({ok:true});
 }catch(err){
  console.error("BeautyTix Asaas webhook",eventId,event,err);
  return NextResponse.json({error:"Falha ao processar webhook."},{status:500});
 }
}
