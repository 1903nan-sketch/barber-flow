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
   "User-Agent":"BarberTix/1.0"
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
export async function getSubscriptionPix(subscriptionId){
 if(!subscriptionId)return null;
 const list=await asaasRequest("/subscriptions/"+encodeURIComponent(subscriptionId)+"/payments");
 const rows=Array.isArray(list?.data)?list.data:[];
 const payment=rows.filter(x=>unpaid.has(String(x.status||"").toUpperCase())).sort((a,b)=>String(a.dueDate||"").localeCompare(String(b.dueDate||"")))[0]||null;
 if(!payment)return null;
 // The charge exists even when the QR fails (e.g. no Pix key on the Asaas account);
 // keep the invoice link so the owner can still pay.
 let qr=null,qrError="";
 try{qr=await asaasRequest("/payments/"+encodeURIComponent(payment.id)+"/pixQrCode")}
 catch(err){qrError="O Asaas não gerou o QR Code Pix. Resposta do Asaas: "+(err.message||("HTTP "+err.status));console.error("Asaas pixQrCode",err.status,err.message)}
 return {
  qr_error:qrError,
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
