import {NextResponse} from "next/server";
import {evolutionConfigured,evolutionConnectionState,normalizeEvolutionState} from "../../../../../lib/evolution";
import {requireWhatsappSettingsAccess} from "../../../../../lib/whatsapp-server";

export async function GET(req){
  const tenant=new URL(req.url).searchParams.get("tenant");
  const auth=await requireWhatsappSettingsAccess(req,tenant);
  if(auth.error)return NextResponse.json({error:auth.error},{status:auth.status});
  if(!evolutionConfigured())return NextResponse.json({configured:false,status:"not_configured"});

  const {data:integration,error}=await auth.admin.from("whatsapp_integrations").select("*").eq("tenant_id",tenant).maybeSingle();
  if(error)return NextResponse.json({error:"Não foi possível consultar a integração."},{status:500});
  if(!integration)return NextResponse.json({configured:true,status:"disconnected",connected:false});

  let state=integration.status;
  try{
    const remote=await evolutionConnectionState(integration.instance_name);
    state=normalizeEvolutionState(remote);
    await auth.admin.from("whatsapp_integrations").update({
      status:state,
      connected_at:state==="connected"?(integration.connected_at||new Date().toISOString()):integration.connected_at,
      updated_at:new Date().toISOString(),
      metadata:state==="connected"?{}:integration.metadata
    }).eq("tenant_id",tenant);
  }catch{
    if(state==="creating")state="connecting";
  }
  return NextResponse.json({
    configured:true,
    status:state,
    connected:state==="connected",
    phone:integration.display_phone||"",
    qrcode:state==="connecting"?(integration.metadata?.qr_base64||""):"",
    instance:integration.instance_name
  });
}
