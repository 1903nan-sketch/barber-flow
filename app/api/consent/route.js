import {NextResponse} from "next/server";
import {serverSupabase} from "../../../lib/billing-server";
import {LEGAL_VERSION,REQUIRED_CONSENTS} from "../../../lib/legal";

export async function POST(request){
 try{
  const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  if(!token)return NextResponse.json({error:"Sessão inválida."},{status:401});
  const admin=serverSupabase();
  const {data:{user},error:userError}=await admin.auth.getUser(token);
  if(userError||!user)return NextResponse.json({error:"Sessão expirada. Entre novamente."},{status:401});
  const body=await request.json().catch(()=>({}));
  if(body.version!==LEGAL_VERSION)return NextResponse.json({error:"Os termos foram atualizados. Recarregue a página e leia a versão atual."},{status:409});
  const accepted=body.accepted||{};
  if(!REQUIRED_CONSENTS.every(doc=>accepted[doc]===true))return NextResponse.json({error:"Para continuar, aceite os Termos de Uso e a Política de Privacidade."},{status:400});
  const ip=(request.headers.get("x-forwarded-for")||"").split(",")[0].trim()||request.headers.get("x-real-ip")||null;
  const userAgent=String(request.headers.get("user-agent")||"").slice(0,400)||null;
  const rows=[...REQUIRED_CONSENTS,"marketing"].map(document=>({
   user_id:user.id,document,version:LEGAL_VERSION,accepted:accepted[document]===true,ip,user_agent:userAgent
  }));
  const {error}=await admin.from("user_consents").upsert(rows,{onConflict:"user_id,document,version",ignoreDuplicates:true});
  if(error)throw error;
  return NextResponse.json({ok:true,version:LEGAL_VERSION});
 }catch(err){
  console.error("consent",err?.message||err);
  return NextResponse.json({error:"Não foi possível registrar o aceite. Tente novamente."},{status:500});
 }
}
