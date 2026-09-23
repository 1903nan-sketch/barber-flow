import {NextResponse} from "next/server";
import {evolutionConfigured,evolutionInstanceName,logoutEvolutionInstance} from "../../../../../lib/evolution";
import {requireWhatsappSettingsAccess} from "../../../../../lib/whatsapp-server";

export async function POST(req){
  let payload;try{payload=await req.json()}catch{return NextResponse.json({error:"Requisição inválida."},{status:400})}
  const tenant=payload?.tenant;
  const auth=await requireWhatsappSettingsAccess(req,tenant);
  if(auth.error)return NextResponse.json({error:auth.error},{status:auth.status});
  if(!evolutionConfigured())return NextResponse.json({ok:true,status:"disconnected"});

  const instance=evolutionInstanceName(tenant);
  try{await logoutEvolutionInstance(instance)}catch{}
  return NextResponse.json({ok:true,status:"disconnected"});
}
