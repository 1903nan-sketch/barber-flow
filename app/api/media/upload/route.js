import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
export async function POST(request){
 try{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  if(!url||!key)return NextResponse.json({error:"Configuração do servidor incompleta."},{status:500});
  if(!token)return NextResponse.json({error:"Sessão inválida."},{status:401});
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),{data:{user}}=await admin.auth.getUser(token);
  if(!user)return NextResponse.json({error:"Sessão expirada."},{status:401});
  const form=await request.formData(),file=form.get("file"),tenant=String(form.get("tenant_id")||""),field=String(form.get("field")||"");
  if(!file||!tenant||!["logo_url","cover_url","professional_photo"].includes(field))return NextResponse.json({error:"Envio inválido."},{status:400});
  const {data:member}=await admin.from("memberships").select("role,active").eq("tenant_id",tenant).eq("user_id",user.id).eq("active",true).maybeSingle();
  if(!member||!["owner","manager"].includes(member.role))return NextResponse.json({error:"Sem permissão para enviar imagens."},{status:403});
  if(file.size>6*1024*1024)return NextResponse.json({error:"A imagem deve ter no máximo 6 MB."},{status:400});
  const type=String(file.type||"");if(!["image/jpeg","image/png","image/webp"].includes(type))return NextResponse.json({error:"Use JPG, PNG ou WebP."},{status:400});
  const ext=type==="image/png"?"png":type==="image/webp"?"webp":"jpg",path=`${tenant}/${field}-${Date.now()}.${ext}`,bytes=Buffer.from(await file.arrayBuffer());
  const {error}=await admin.storage.from("tenant-public-media").upload(path,bytes,{upsert:true,contentType:type});
  if(error)return NextResponse.json({error:error.message},{status:400});
  const {data}=admin.storage.from("tenant-public-media").getPublicUrl(path);
  return NextResponse.json({url:data.publicUrl+"?v="+Date.now()});
 }catch(error){return NextResponse.json({error:error.message||"Não foi possível enviar a imagem."},{status:500})}
}