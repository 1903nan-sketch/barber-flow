import {NextResponse} from "next/server";
import {connectEvolutionInstance,createEvolutionInstance,evolutionConfigured,evolutionInstanceName,extractEvolutionQr,normalizeEvolutionState,setEvolutionWebhook} from "../../../../../lib/evolution";
import {requireWhatsappSettingsAccess} from "../../../../../lib/whatsapp-server";

export async function POST(req){
  let payload;try{payload=await req.json()}catch{return NextResponse.json({error:"Requisição inválida."},{status:400})}
  const tenant=payload?.tenant;
  const auth=await requireWhatsappSettingsAccess(req,tenant);
  if(auth.error)return NextResponse.json({error:auth.error},{status:auth.status});
  if(!evolutionConfigured())return NextResponse.json({error:"A Evolution API ainda não foi configurada no servidor.",configured:false},{status:503});

  const instance=evolutionInstanceName(tenant),db=auth.admin;
  const webhook=new URL("/api/whatsapp/evolution/webhook",req.url);
  webhook.searchParams.set("secret",process.env.EVOLUTION_WEBHOOK_SECRET);

  await db.from("whatsapp_integrations").upsert({
    tenant_id:tenant,provider:"evolution",instance_name:instance,status:"creating",
    created_by:auth.user.id,updated_at:new Date().toISOString()
  },{onConflict:"tenant_id"});

  try{
    await createEvolutionInstance(instance);
    await setEvolutionWebhook(instance,webhook.toString());
    const connected=await connectEvolutionInstance(instance);
    const qr=extractEvolutionQr(connected),status=normalizeEvolutionState(connected);
    await db.from("whatsapp_integrations").update({
      status:status==="connected"?"connected":"connecting",
      metadata:{qr_base64:qr||null},
      connected_at:status==="connected"?new Date().toISOString():null,
      updated_at:new Date().toISOString()
    }).eq("tenant_id",tenant);
    return NextResponse.json({ok:true,instance,status:status==="connected"?"connected":"connecting",qrcode:qr});
  }catch(err){
    await db.from("whatsapp_integrations").update({
      status:"error",metadata:{last_error:String(err.message||err).slice(0,500)},updated_at:new Date().toISOString()
    }).eq("tenant_id",tenant);
    return NextResponse.json({error:err.message||"Não foi possível iniciar a conexão."},{status:502});
  }
}
