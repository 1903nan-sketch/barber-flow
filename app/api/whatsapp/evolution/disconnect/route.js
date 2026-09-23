import {NextResponse} from "next/server";
import {evolutionConfigured,logoutEvolutionInstance} from "../../../../../../lib/evolution";
import {requireWhatsappSettingsAccess} from "../../../../../../lib/whatsapp-server";

export async function POST(req){
  let payload;try{payload=await req.json()}catch{return NextResponse.json({error:"Requisição inválida."},{status:400})}
  const tenant=payload?.tenant;
  const auth=await requireWhatsappSettingsAccess(req,tenant);
  if(auth.error)return NextResponse.json({error:auth.error},{status:auth.status});
  const {data:integration}=await auth.admin.from("whatsapp_integrations").select("instance_name").eq("tenant_id",tenant).maybeSingle();
  if(!integration)return NextResponse.json({ok:true,status:"disconnected"});
  if(evolutionConfigured()){
    try{await logoutEvolutionInstance(integration.instance_name)}catch{}
  }
  await auth.admin.from("whatsapp_integrations").update({
    status:"disconnected",display_phone:null,connected_jid:null,connected_at:null,metadata:{},updated_at:new Date().toISOString()
  }).eq("tenant_id",tenant);
  return NextResponse.json({ok:true,status:"disconnected"});
}
