const isProduction=()=>String(process.env.ASAAS_ENV||"sandbox").toLowerCase()==="production";
export const asaasConfigured=()=>Boolean(process.env.ASAAS_API_KEY);

export async function asaasRequest(path,{method="GET",body}={}){
 if(!asaasConfigured())throw new Error("ASAAS_API_KEY não configurada.");
 const base=isProduction()?"https://api.asaas.com/v3":"https://api-sandbox.asaas.com/v3";
 const res=await fetch(base+path,{
  method,
  headers:{
   accept:"application/json",
   "content-type":"application/json",
   access_token:process.env.ASAAS_API_KEY,
   "User-Agent":"BarberTix/1.0"
  },
  body:body===undefined?undefined:JSON.stringify(body),
  cache:"no-store"
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok){
  const message=Array.isArray(data?.errors)?data.errors.map(x=>x.description||x.code).filter(Boolean).join(" · "):data?.message;
  const err=new Error(message||("Erro Asaas HTTP "+res.status));
  err.status=res.status;err.payload=data;throw err;
 }
 return data;
}

export function asaasCheckoutUrl(id,link){
 if(link)return link;
 const host=isProduction()?"https://asaas.com":"https://sandbox.asaas.com";
 return host+"/checkoutSession/show?id="+encodeURIComponent(id);
}

export function digits(value){return String(value||"").replace(/\D/g,"")}

export function effectiveDueDate(value){
 const today=new Date();const iso=today.toISOString().slice(0,10);
 return value&&String(value)>=iso?String(value):iso;
}

export function addMonth(dateValue){
 const d=new Date(String(dateValue)+"T12:00:00Z");
 d.setUTCMonth(d.getUTCMonth()+1);
 return d.toISOString().slice(0,10);
}

export function calculateBillingAmount(tenant,plan,activeUnits=1){
 const base=Number(plan?.monthly_cents||0);
 const included=Math.max(1,Number(plan?.max_units||1));
 const extras=Math.max(0,Number(activeUnits||0)-included);
 const withUnits=base+extras*Number(plan?.extra_unit_cents||0);
 const surcharge=Number(tenant?.no_commitment_surcharge_pct||0);
 const discount=Number(tenant?.discount_pct||0);
 const months=Number(tenant?.discount_months||0);
 let discountActive=false;
 if(discount>0&&months>0&&tenant?.discount_started_at){
  const start=new Date(String(tenant.discount_started_at)+"T12:00:00");
  const end=new Date(start);end.setMonth(end.getMonth()+months);
  discountActive=new Date()<end;
 }
 return Math.max(0,Math.round(withUnits*(1+surcharge/100)*(1-(discountActive?discount:0)/100)));
}

const unpaid=new Set(["PENDING","OVERDUE","AWAITING_RISK_ANALYSIS","DUNNING_REQUESTED","DUNNING_RECEIVED"]);
export async function getSubscriptionPix(subscriptionId){
 if(!subscriptionId)return null;
 const list=await asaasRequest("/subscriptions/"+encodeURIComponent(subscriptionId)+"/payments");
 const rows=Array.isArray(list?.data)?list.data:[];
 const payment=rows.filter(x=>unpaid.has(String(x.status||"").toUpperCase())).sort((a,b)=>String(a.dueDate||"").localeCompare(String(b.dueDate||"")))[0]||null;
 if(!payment)return null;
 const qr=await asaasRequest("/payments/"+encodeURIComponent(payment.id)+"/pixQrCode");
 return {
  payment_id:payment.id,
  status:payment.status||"",
  due_date:payment.dueDate||null,
  value_cents:Math.round(Number(payment.value||0)*100),
  invoice_url:payment.invoiceUrl||null,
  encoded_image:qr?.encodedImage||null,
  payload:qr?.payload||null,
  expiration_date:qr?.expirationDate||null
 };
}
