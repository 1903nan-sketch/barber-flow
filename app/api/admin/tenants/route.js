import {createClient} from "@supabase/supabase-js";
import {NextResponse} from "next/server";
export async function POST(request){
 try{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  if(!url||!key)return NextResponse.json({error:"Falta configurar SUPABASE_SERVICE_ROLE_KEY na Vercel."},{status:500});
  if(!token)return NextResponse.json({error:"Sessão inválida."},{status:401});
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),{data:{user},error:userError}=await admin.auth.getUser(token);
  if(userError||!user)return NextResponse.json({error:"Sessão expirada."},{status:401});
  const {data:allowed}=await admin.from("platform_admins").select("user_id").eq("user_id",user.id).maybeSingle();
  if(!allowed)return NextResponse.json({error:"Acesso restrito ao administrador mestre."},{status:403});
  const body=await request.json(),email=String(body.owner_email||"").trim().toLowerCase(),password=String(body.password||"");
  if(password.length<8)return NextResponse.json({error:"A senha precisa ter pelo menos 8 caracteres."},{status:400});
  const {data:created,error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:body.owner_name}});
  if(createError)return NextResponse.json({error:createError.message.includes("already")?"Este e-mail já possui uma conta. Use outro e-mail.":createError.message},{status:400});
  const {data:tenantId,error}=await admin.rpc("admin_provision_tenant",{p_admin:user.id,p_owner:created.user.id,p:{name:body.name,slug:body.slug,phone:body.phone||"",plan_id:body.plan_id,owner_name:body.owner_name}});
  if(error){await admin.auth.admin.deleteUser(created.user.id);return NextResponse.json({error:error.message},{status:400})}
  return NextResponse.json({id:tenantId,slug:body.slug});
 }catch(error){return NextResponse.json({error:error.message||"Não foi possível criar a barbearia."},{status:500})}
}
