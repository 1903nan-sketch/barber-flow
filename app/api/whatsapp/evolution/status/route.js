import {NextResponse} from "next/server";
import {connectEvolutionInstance,evolutionConfigured,evolutionConnectionState,evolutionInstanceName,evolutionPhone,extractEvolutionQr,normalizeEvolutionState} from "../../../../../lib/evolution";
import {requireWhatsappSettingsAccess} from "../../../../../lib/whatsapp-server";

export async function GET(req){
  const tenant=new URL(req.url).searchParams.get("tenant");
  const auth=await requireWhatsappSettingsAccess(req,tenant);
  if(auth.error)return NextResponse.json({error:auth.error},{status:auth.status});
  if(!evolutionConfigured())return NextResponse.json({configured:false,status:"not_configured"});

  const instance=evolutionInstanceName(tenant);
  let remote,state="disconnected",qrcode="",phone="";
  try{
    remote=await evolutionConnectionState(instance);
    state=normalizeEvolutionState(remote);
    phone=evolutionPhone(remote);
  }catch{
    return NextResponse.json({configured:true,status:"disconnected",connected:false,phone:"",qrcode:"",instance});
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

  return NextResponse.json({
    configured:true,
    status:state,
    connected:state==="connected",
    phone,
    qrcode:state==="connecting"?qrcode:"",
    instance
  });
}
