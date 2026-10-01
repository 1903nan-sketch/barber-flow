import {NextResponse} from "next/server";
import {adminClient} from "../../../lib/server-auth";
import {ensureDepositCharge,loadDepositContext,publicDeposit} from "../../../lib/deposits";

// Link público do sinal: o id do agendamento (UUID aleatório) + slug funcionam como
// credencial de acesso. Nenhum dado pessoal além do resumo do horário é retornado.
export async function GET(request){
 try{
  const url=new URL(request.url),admin=adminClient();
  const ctx=await loadDepositContext(admin,url.searchParams.get("appointment"),url.searchParams.get("slug"));
  if(!ctx)return NextResponse.json({error:"Agendamento não encontrado."},{status:404});
  return NextResponse.json(publicDeposit(ctx),{headers:{"cache-control":"no-store"}});
 }catch(error){
  return NextResponse.json({error:error.message||"Não foi possível consultar o sinal."},{status:500});
 }
}

export async function POST(request){
 try{
  const body=await request.json().catch(()=>({})),admin=adminClient();
  const ctx=await loadDepositContext(admin,body.appointment,body.slug);
  if(!ctx)return NextResponse.json({error:"Agendamento não encontrado."},{status:404});
  const result=await ensureDepositCharge(admin,ctx,{document:body.document});
  return NextResponse.json({...publicDeposit(result.ctx),needs_document:Boolean(result.needs_document),manual:Boolean(result.manual),missing_key:Boolean(result.missing_key)},{headers:{"cache-control":"no-store"}});
 }catch(error){
  return NextResponse.json({error:error.message||"Não foi possível gerar o PIX."},{status:error.status||500});
 }
}
