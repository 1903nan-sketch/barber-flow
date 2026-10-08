// Asaas keys start with "$aact_"; copy/paste into env panels often adds quotes, spaces,
// a "\$" escape or drops the "$" entirely, all of which Asaas rejects as an invalid key.
const apiKey=()=>{
 let key=String(process.env.ASAAS_API_KEY||"").trim().replace(/^["']|["']$/g,"").trim().replace(/^\\+/,"");
 if(key.startsWith("aact_"))key="$"+key;
 return key;
};
// The key itself says which environment it belongs to; ASAAS_ENV only decides for legacy keys.
const isProduction=()=>{
 const key=apiKey();
 if(key.startsWith("$aact_prod_"))return true;
 if(key.startsWith("$aact_hmlg_"))return false;
 return String(process.env.ASAAS_ENV||"sandbox").trim().toLowerCase()==="production";
};
export const asaasConfigured=()=>Boolean(apiKey());

export async function asaasRequest(path,{method="GET",body}={}){
 if(!asaasConfigured())throw new Error("ASAAS_API_KEY não configurada.");
 const base=isProduction()?"https://api.asaas.com/v3":"https://api-sandbox.asaas.com/v3";
 const res=await fetch(base+path,{
  method,
  headers:{
   accept:"application/json",
   "content-type":"application/json",
   access_token:apiKey(),
   "User-Agent":"RupControl/1.0"
  },
  body:body===undefined?undefined:JSON.stringify(body),
  cache:"no-store"
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok){
  const message=Array.isArray(data?.errors)?data.errors.map(x=>x.description||x.code).filter(Boolean).join(" · "):data?.message;
  const hint=res.status===401?` (ambiente ${isProduction()?"produção":"sandbox"}; confira se ASAAS_API_KEY é uma chave ativa desse ambiente e faça redeploy após alterá-la)`:"";
  const err=new Error((message||("Erro Asaas HTTP "+res.status))+hint);
  err.status=res.status;err.payload=data;throw err;
 }
 return data;
}

export function asaasCheckoutUrl(id,link){
 if(link)return link;
 if(isProduction())return "https://asaas.com/checkoutSession/show?id="+encodeURIComponent(id);
 return "https://sandbox.asaas.com/checkoutSession/show/"+encodeURIComponent(id);
}

export function digits(value){return String(value||"").replace(/\D/g,"")}

// CPF (11) or CNPJ (14) with valid check digits; Asaas rejects anything else.
export function validTaxId(value){
 const d=digits(value);
 if(/^(\d)\1+$/.test(d))return false;
 const check=(base,weights)=>{const sum=weights.reduce((s,w,i)=>s+Number(base[i])*w,0),r=sum%11;return r<2?0:11-r};
 if(d.length===11){
  const v1=(()=>{const sum=[...d.slice(0,9)].reduce((s,n,i)=>s+Number(n)*(10-i),0),r=(sum*10)%11;return r===10?0:r})();
  const v2=(()=>{const sum=[...d.slice(0,10)].reduce((s,n,i)=>s+Number(n)*(11-i),0),r=(sum*10)%11;return r===10?0:r})();
  return v1===Number(d[9])&&v2===Number(d[10]);
 }
 if(d.length===14){
  const w1=[5,4,3,2,9,8,7,6,5,4,3,2],w2=[6,...w1];
  return check(d,w1)===Number(d[12])&&check(d,w2)===Number(d[13]);
 }
 return false;
}

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
 const included=Math.max(1,Number(plan?.included_units||1));
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

// QR Code + invoice for one Asaas payment. The charge exists even when the QR fails
// (e.g. no Pix key on the Asaas account); keep the invoice link so the owner can still pay.
export async function paymentPix(payment){
 let qr=null,qrError="",lastError=null;
 // A cobrança pode existir antes do QR Pix ficar pronto no Asaas. Tente de novo
 // por alguns segundos antes de tratar a resposta como falha definitiva.
 for(let attempt=0;attempt<3;attempt++){
  try{
   qr=await asaasRequest("/payments/"+encodeURIComponent(payment.id)+"/pixQrCode");
   if(qr?.payload||qr?.encodedImage)break;
  }catch(err){
   lastError=err;
   if(attempt<2)await new Promise(resolve=>setTimeout(resolve,700*(attempt+1)));
  }
 }
 if(!qr?.payload&&!qr?.encodedImage&&lastError){
  qrError="O Asaas ainda não liberou o QR Code Pix. Resposta do Asaas: "+(lastError.message||("HTTP "+lastError.status));
  console.error("Asaas pixQrCode",lastError.status,lastError.message);
 }
 const retryable=Boolean(qrError)&&![401,403].includes(Number(lastError?.status||0));
 return {
  qr_error:qrError,
  qr_retryable:retryable,
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

export async function getSubscriptionPix(subscriptionId){
 if(!subscriptionId)return null;
 const list=await asaasRequest("/subscriptions/"+encodeURIComponent(subscriptionId)+"/payments");
 const rows=Array.isArray(list?.data)?list.data:[];
 const payment=rows.filter(x=>unpaid.has(String(x.status||"").toUpperCase())).sort((a,b)=>String(a.dueDate||"").localeCompare(String(b.dueDate||"")))[0]||null;
 if(!payment){
  // Asaas only creates a subscription's monthly charge 40 days before its due date,
  // so a subscription with a distant due date has nothing to pay (and no QR) yet.
  let sub=null;
  try{sub=await asaasRequest("/subscriptions/"+encodeURIComponent(subscriptionId))}catch{}
  const next=sub?.nextDueDate?String(sub.nextDueDate).slice(0,10):null;
  let available=null;
  if(next){const d=new Date(next+"T12:00:00Z");d.setUTCDate(d.getUTCDate()-40);available=d.toISOString().slice(0,10)}
  return {no_pending:true,next_due_date:next,available_from:available,subscription_status:sub?.status||""};
 }
 return await paymentPix(payment);
}

// Advance payments are standalone charges tagged "tenant:<id>:advance:<due date they cover>".
// The webhook pushes billing_due_date one month forward when one is paid.
export const advanceReference=(tenantId,coveredDue)=>`tenant:${tenantId}:advance:${coveredDue}`;
export function parseAdvanceReference(value){
 const m=String(value||"").match(/^tenant:([0-9a-f-]{36}):advance:(\d{4}-\d{2}-\d{2})$/i);
 return m?{tenantId:m[1],coveredDue:m[2]}:null;
}
export async function findOpenAdvance(customer,tenantId,coveredDue){
 if(!customer||!coveredDue)return null;
 const list=await asaasRequest("/payments?customer="+encodeURIComponent(customer)+"&externalReference="+encodeURIComponent(advanceReference(tenantId,coveredDue))+"&limit=10");
 const rows=Array.isArray(list?.data)?list.data:[];
 return rows.find(x=>unpaid.has(String(x.status||"").toUpperCase())&&!x.deleted)||null;
}
