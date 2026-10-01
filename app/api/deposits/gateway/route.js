import {NextResponse} from "next/server";
import {jsonError,planAllows,requireMember,userClient} from "../../../../lib/server-auth";
import {asaasCall} from "../../../../lib/deposits";

const EVENTS=["PAYMENT_RECEIVED","PAYMENT_CONFIRMED","PAYMENT_OVERDUE","PAYMENT_DELETED","PAYMENT_REFUNDED"];

export async function GET(request){
 try{
  const tenantId=new URL(request.url).searchParams.get("tenant_id");
  const ctx=await requireMember(request,tenantId,{permission:"settings"});
  const {data}=await userClient(ctx.token).rpc("payment_gateway_status",{t:tenantId});
  return NextResponse.json({gateway:data||{}});
 }catch(error){return jsonError(error)}
}

// Conecta a conta Asaas da própria barbearia para receber sinais com confirmação automática.
// A chave fica no Supabase Vault e nunca é devolvida ao navegador.
export async function POST(request){
 try{
  const body=await request.json(),tenantId=String(body.tenant_id||"");
  const ctx=await requireMember(request,tenantId,{owner:true});
  if(!planAllows(ctx.tenant,"deposits"))return NextResponse.json({error:"O sinal para agendamento está disponível a partir do plano Pro."},{status:403});
  const apiKey=String(body.api_key||"").trim(),environment=body.environment==="sandbox"?"sandbox":"production";
  if(apiKey.length<20)return NextResponse.json({error:"Informe a chave de API do Asaas."},{status:400});
  const gateway={api_key:apiKey,environment};
  try{await asaasCall(gateway,"/finance/balance")}
  catch{return NextResponse.json({error:"Não foi possível validar a chave no Asaas. Confira a chave e o ambiente."},{status:400})}
  let account="";
  try{const info=await asaasCall(gateway,"/myAccount/commercialInfo");account=info?.companyName||info?.name||""}catch{}

  const {data:token,error}=await ctx.admin.rpc("server_save_payment_gateway",{p_tenant:tenantId,p_provider:"asaas",p_api_key:apiKey,p_environment:environment,p_account:account});
  if(error)throw error;

  const url=new URL("/api/deposits/webhook",request.url);url.searchParams.set("tenant",tenantId);
  const payload={name:"BarberTix Sinal",url:url.toString(),email:ctx.user.email||undefined,enabled:true,interrupted:false,apiVersion:3,authToken:token,sendType:"SEQUENTIALLY",events:EVENTS};
  let webhookId=null,webhookError="";
  try{
   const list=await asaasCall(gateway,"/webhooks?limit=100");
   const existing=(list?.data||[]).find(x=>x.url===payload.url);
   const saved=existing?await asaasCall(gateway,"/webhooks/"+encodeURIComponent(existing.id),{method:"PUT",body:payload}):await asaasCall(gateway,"/webhooks",{method:"POST",body:payload});
   webhookId=saved?.id||existing?.id||null;
  }catch(err){webhookError=err.message||"Falha ao registrar o webhook."}
  await ctx.admin.from("tenant_payment_gateways").update({webhook_id:webhookId,updated_at:new Date().toISOString()}).eq("tenant_id",tenantId).eq("provider","asaas");
  return NextResponse.json({ok:true,account,webhook_ready:Boolean(webhookId),warning:webhookError?"Conta conectada, mas o webhook não foi registrado: "+webhookError:""});
 }catch(error){return jsonError(error,"Não foi possível conectar o Asaas.")}
}

export async function DELETE(request){
 try{
  const tenantId=new URL(request.url).searchParams.get("tenant_id");
  const ctx=await requireMember(request,tenantId,{owner:true});
  await ctx.admin.from("tenant_payment_gateways").update({active:false,updated_at:new Date().toISOString()}).eq("tenant_id",tenantId).eq("provider","asaas");
  return NextResponse.json({ok:true});
 }catch(error){return jsonError(error)}
}
