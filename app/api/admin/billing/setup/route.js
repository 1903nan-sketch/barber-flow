import {NextResponse} from "next/server";
import {asaasConfigured,asaasRequest} from "../../../../../lib/asaas";
import {requireFullAdmin} from "../../../../../lib/billing-server";

const EVENTS=[
 "CHECKOUT_CREATED","CHECKOUT_PAID","CHECKOUT_CANCELED","CHECKOUT_EXPIRED",
 "SUBSCRIPTION_CREATED","SUBSCRIPTION_UPDATED","SUBSCRIPTION_INACTIVATED","SUBSCRIPTION_DELETED",
 "PAYMENT_CREATED","PAYMENT_UPDATED","PAYMENT_CONFIRMED","PAYMENT_RECEIVED","PAYMENT_OVERDUE","PAYMENT_DELETED","PAYMENT_REFUNDED"
];

export async function POST(request){
 try{
  const {user}=await requireFullAdmin(request);
  if(!asaasConfigured())return NextResponse.json({error:"Adicione ASAAS_API_KEY no projeto BeautyTix da Vercel antes de configurar o webhook."},{status:503});
  const token=process.env.ASAAS_WEBHOOK_TOKEN||"";
  if(token.length<32)return NextResponse.json({error:"ASAAS_WEBHOOK_TOKEN precisa ter pelo menos 32 caracteres."},{status:503});
  const origin=new URL(request.url).origin,webhookUrl=origin+"/api/billing/webhook";
  let list=null;
  try{list=await asaasRequest("/webhooks?limit=100")}catch{}
  const existing=Array.isArray(list?.data)?list.data.find(x=>x.url===webhookUrl):null;
  const payload={name:"BeautyTix Billing",url:webhookUrl,email:user.email,enabled:true,interrupted:false,apiVersion:3,authToken:token,sendType:"SEQUENTIALLY",events:EVENTS};
  const webhook=existing
   ?await asaasRequest("/webhooks/"+encodeURIComponent(existing.id),{method:"PUT",body:payload})
   :await asaasRequest("/webhooks",{method:"POST",body:payload});
  return NextResponse.json({ok:true,id:webhook.id||existing?.id||null,url:webhookUrl,updated:Boolean(existing)});
 }catch(err){
  console.error("BeautyTix Asaas webhook setup",err);
  return NextResponse.json({error:err.message||"Não foi possível configurar o webhook."},{status:err.status||500});
 }
}
