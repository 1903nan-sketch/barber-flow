import {NextResponse} from "next/server";
import {connectEvolutionInstance,evolutionConfigured,evolutionConnectionState,evolutionInstanceName,evolutionPhone,extractEvolutionQr,findEvolutionWebhook,getEvolutionWebhookSecret,normalizeEvolutionState,setEvolutionWebhook} from "../../../../../lib/evolution";
import {requireWhatsappSettingsAccess} from "../../../../../lib/whatsapp-server";
import {openaiWhatsappConfigured} from "../../../../../lib/openai-whatsapp-agent";

const syncedWebhooks=new Set();

export async function GET(req){
  const tenant=new URL(req.url).searchParams.get("tenant");
  const auth=await requireWhatsappSettingsAccess(req,tenant);
  if(auth.error)return NextResponse.json({error:auth.error},{status:auth.status});
  if(!(await evolutionConfigured()))return NextResponse.json({configured:false,status:"not_configured",ai_configured:openaiWhatsappConfigured()});

  const instance=evolutionInstanceName(tenant);
  let remote,state="disconnected",qrcode="",phone="";
  try{
    remote=await evolutionConnectionState(instance);
    state=normalizeEvolutionState(remote);
    phone=evolutionPhone(remote);
  }catch{
    return NextResponse.json({configured:true,status:"disconnected",connected:false,phone:"",qrcode:"",instance,ai_configured:openaiWhatsappConfigured()});
  }

  if(state!=="connected"){
    try{
      const connection=await connectEvolutionInstance(instance);
      qrcode=extractEvolutionQr(connection);
      phone=phone||evolutionPhone(connection);
      const connectionState=normalizeEvolutionState(connection);
      if(connectionState==="connected")state="connected";
      else if(qrcode)state="connecting";
    }catch{}
  }

  let webhookSynced=false,webhookError="";
  if(state==="connected"){
    const origin=new URL(req.url).origin;
    const desired=new URL("/api/whatsapp/evolution/webhook",origin);
    desired.searchParams.set("secret",await getEvolutionWebhookSecret());
    const desiredUrl=desired.toString();
    const key=instance+"|"+desiredUrl;
    try{
      let found=null;
      try{found=await findEvolutionWebhook(instance)}catch{}
      const current=found?.webhook?.webhook||found?.webhook||found||{};
      const currentUrl=String(current?.url||"");
      const events=Array.isArray(current?.events)?current.events:[];
      const enabled=current?.enabled!==false;
      const hasMessages=events.includes("MESSAGES_UPSERT");
      if(currentUrl!==desiredUrl||!enabled||!hasMessages||!syncedWebhooks.has(key)){
        await setEvolutionWebhook(instance,desiredUrl);
        syncedWebhooks.add(key);
        try{found=await findEvolutionWebhook(instance)}catch{}
      }
      const after=found?.webhook?.webhook||found?.webhook||found||{};
      const afterEvents=Array.isArray(after?.events)?after.events:[];
      webhookSynced=String(after?.url||"")===desiredUrl&&after?.enabled!==false&&afterEvents.includes("MESSAGES_UPSERT");
      if(!webhookSynced)webhookError="O Evolution não confirmou o webhook de mensagens.";
    }catch(error){
      webhookError=error?.message||"Não foi possível verificar o webhook.";
      console.error("Evolution webhook status sync failed",webhookError);
    }
  }

  return NextResponse.json({
    configured:true,
    status:state,
    connected:state==="connected",
    phone,
    qrcode:state==="connecting"?qrcode:"",
    instance,
    ai_configured:openaiWhatsappConfigured(),
    webhook_synced:webhookSynced,
    webhook_error:webhookError
  });
}
