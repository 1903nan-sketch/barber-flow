import {NextResponse} from "next/server";
import {connectEvolutionInstance,evolutionConfigured,evolutionConnectionState,evolutionInstanceName,evolutionPhone,extractEvolutionQr,getEvolutionWebhookSecret,normalizeEvolutionState,setEvolutionWebhook} from "../../../../../lib/evolution";
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

  // A Vercel deploy changes the deployment URL, while Evolution keeps the old
  // webhook until it is updated. Re-sync automatically from the stable site
  // origin whenever the WhatsApp settings page checks a connected instance.
  if(state==="connected"){
    const origin=new URL(req.url).origin;
    const key=instance+"|"+origin;
    if(!syncedWebhooks.has(key)){
      try{
        const webhook=new URL("/api/whatsapp/evolution/webhook",origin);
        webhook.searchParams.set("secret",await getEvolutionWebhookSecret());
        await setEvolutionWebhook(instance,webhook.toString());
        syncedWebhooks.add(key);
      }catch(error){
        console.error("Evolution webhook status sync failed",error?.message||error);
      }
    }
  }

  return NextResponse.json({
    configured:true,
    status:state,
    connected:state==="connected",
    phone,
    qrcode:state==="connecting"?qrcode:"",
    instance,
    ai_configured:openaiWhatsappConfigured()
  });
}
