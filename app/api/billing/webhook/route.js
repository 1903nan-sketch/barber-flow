import {timingSafeEqual} from "crypto";
import {NextResponse} from "next/server";
import {serverSupabase} from "../../../../lib/billing-server";

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
 const {data}=await admin.from("tenants").select("id,billing_due_date,grace_days").eq(field,value).maybeSingle();
 return data||null;
}
async function locateTenant(admin,body){
 const payment=body.payment||{},subscription=body.subscription||{},checkout=body.checkout||{};
 const ref=tenantRef(checkout.externalReference||subscription.externalReference||payment.externalReference);
 if(ref){
  const {data}=await admin.from("tenants").select("id,billing_due_date,grace_days").eq("id",ref).maybeSingle();
  if(data)return data;
 }
 return await byField(admin,"asaas_checkout_id",checkout.id)
  ||await byField(admin,"asaas_subscription_id",subscription.id||payment.subscription)
  ||await byField(admin,"asaas_customer_id",payment.customer||subscription.customer||checkout.customer)
  ||null;
}

const METHOD={PIX:"pix",CREDIT_CARD:"credit_card",BOLETO:"boleto",UNDEFINED:""};
function paymentState(event,status){
 const e=String(event||""),st=String(status||"").toUpperCase();
 if(["PAYMENT_RECEIVED","PAYMENT_CONFIRMED","PAYMENT_RECEIVED_IN_CASH"].includes(e)||["RECEIVED","CONFIRMED","RECEIVED_IN_CASH"].includes(st))return "paid";
 if(e==="PAYMENT_OVERDUE"||st==="OVERDUE")return "overdue";
 if(e.includes("REFUND")||e.includes("CHARGEBACK")||st.includes("REFUND"))return "refunded";
 if(e==="PAYMENT_DELETED"||st==="DELETED")return "cancelled";
 return "pending";
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
    event_id:eventId,event_type:event,resource_id:body.payment?.id||body.subscription?.id||body.checkout?.id||null,payload:body
   });
   if(insertError&&insertError.code!=="23505")throw insertError;
  }

  const tenant=await locateTenant(admin,body);
  if(!tenant){
   await admin.from("billing_webhook_events").update({processed_at:new Date().toISOString()}).eq("event_id",eventId);
   return NextResponse.json({ok:true,ignored:true});
  }

  const patch={billing_provider:"asaas",billing_provider_status:event};
  const subscription=body.subscription||{},checkout=body.checkout||{},payment=body.payment||{};

  if(event.startsWith("CHECKOUT_")){
   if(checkout.id)patch.asaas_checkout_id=checkout.id;
   if(event==="CHECKOUT_PAID"){patch.status="active";patch.last_paid_at=new Date().toISOString()}
  }

  if(event.startsWith("SUBSCRIPTION_")){
   if(subscription.id)patch.asaas_subscription_id=subscription.id;
   if(subscription.customer)patch.asaas_customer_id=subscription.customer;
   if(subscription.billingType)patch.billing_method=subscription.billingType;
   if(subscription.value!=null)patch.billing_amount_cents=Math.round(Number(subscription.value)*100);
   if(subscription.nextDueDate)patch.billing_due_date=String(subscription.nextDueDate).slice(0,10);
  }

  if(event.startsWith("PAYMENT_")&&payment.id){
   if(payment.subscription)patch.asaas_subscription_id=payment.subscription;
   if(payment.customer)patch.asaas_customer_id=payment.customer;
   if(payment.billingType)patch.billing_method=payment.billingType;
   patch.asaas_last_payment_id=payment.id;
  }

  await admin.from("tenants").update(patch).eq("id",tenant.id);

  // Registro normalizado e independente do gateway: ativa a assinatura, atualiza o
  // vencimento e grava o histórico quando o pagamento é confirmado.
  if(event.startsWith("PAYMENT_")&&payment.id){
   const paidAt=payment.paymentDate||payment.confirmedDate||payment.clientPaymentDate||null;
   const {error:recordError}=await admin.rpc("billing_record_payment",{p:{
    tenant_id:tenant.id,provider:"asaas",external_id:payment.id,subscription_id:payment.subscription||null,
    state:paymentState(event,payment.status),raw_status:payment.status||event,billing_type:payment.billingType||"",
    method:METHOD[payment.billingType]||"",amount_cents:Math.max(0,Math.round(Number(payment.value||0)*100)),
    due_date:payment.dueDate||null,paid_at:paidAt?new Date(paidAt).toISOString():null,
    invoice_url:payment.invoiceUrl||null,bank_slip_url:payment.bankSlipUrl||null,
    external_reference:payment.externalReference||null,kind:"subscription",
    raw:{event,status:payment.status,id:payment.id,netValue:payment.netValue}
   }});
   if(recordError)throw recordError;
  }

  await admin.rpc("sync_tenant_billing_status",{p_tenant:tenant.id});
  await admin.from("billing_webhook_events").update({tenant_id:tenant.id,processed_at:new Date().toISOString()}).eq("event_id",eventId);
  return NextResponse.json({ok:true});
 }catch(err){
  console.error("asaas webhook",eventId,event,err);
  return NextResponse.json({error:"Falha ao processar webhook."},{status:500});
 }
}
