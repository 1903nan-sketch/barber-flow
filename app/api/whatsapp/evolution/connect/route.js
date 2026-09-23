import {NextResponse} from "next/server";
import {connectEvolutionInstance,createEvolutionInstance,evolutionConfigured,evolutionInstanceName,extractEvolutionQr,getEvolutionWebhookSecret,normalizeEvolutionState,setEvolutionWebhook} from "../../../../../lib/evolution";
import {requireWhatsappSettingsAccess} from "../../../../../lib/whatsapp-server";

export async function POST(req){
  let payload;try{payload=await req.json()}catch{return NextResponse.json({error:"Requisição inválida."},{status:400})}
  const tenant=payload?.tenant;
  const auth=await requireWhatsappSettingsAccess(req,tenant);
  if(auth.error)return NextResponse.json({error:auth.error},{status:auth.status});
  if(!(await evolutionConfigured()))return NextResponse.json({error:"A Evolution API ainda não foi configurada no servidor.",configured:false},{status:503});

  const instance=evolutionInstanceName(tenant);
  const webhook=new URL("/api/whatsapp/evolution/webhook",req.url);
  webhook.searchParams.set("secret",await getEvolutionWebhookSecret());

  try{
    await createEvolutionInstance(instance);
    await setEvolutionWebhook(instance,webhook.toString());
    const connected=await connectEvolutionInstance(instance);
    const qr=extractEvolutionQr(connected),status=normalizeEvolutionState(connected);
    return NextResponse.json({
      ok:true,
      instance,
      status:status==="connected"?"connected":"connecting",
      connected:status==="connected",
      qrcode:qr
    });
  }catch(err){
    return NextResponse.json({error:err.message||"Não foi possível iniciar a conexão."},{status:502});
  }
}
