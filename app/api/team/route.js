import {createClient} from "@supabase/supabase-js";
import {NextResponse} from "next/server";
export async function POST(request){
 try{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  if(!url||!key)return NextResponse.json({error:"Configuração do servidor incompleta."},{status:500});
  if(!token)return NextResponse.json({error:"Sessão inválida."},{status:401});
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),{data:{user},error:userError}=await admin.auth.getUser(token);
  if(userError||!user)return NextResponse.json({error:"Sessão expirada."},{status:401});
  const body=await request.json(),tenant=String(body.tenant_id||""),username=String(body.username||"").trim().toLowerCase().replace(/^@/,""),password=String(body.password||"");
  if(!/^[a-z0-9._-]{3,24}$/.test(username))return NextResponse.json({error:"O usuário deve ter de 3 a 24 caracteres: letras, números, ponto, traço ou _."},{status:400});
  if(password.length<6)return NextResponse.json({error:"A senha precisa ter pelo menos 6 caracteres."},{status:400});
  const {data:owner}=await admin.from("memberships").select("tenant_id").eq("tenant_id",tenant).eq("user_id",user.id).eq("role","owner").eq("active",true).maybeSingle();
  if(!owner)return NextResponse.json({error:"Somente o proprietário pode criar acessos."},{status:403});
  const loginEmail=`${username}.${tenant.replace(/-/g,"").slice(0,10)}@staff.barberflow.app`;
  const {data:created,error:createError}=await admin.auth.admin.createUser({email:loginEmail,password,email_confirm:true,user_metadata:{name:body.name,staff_username:"@"+username}});
  if(createError)return NextResponse.json({error:createError.message.includes("already")?"Este usuário já está em uso nesta barbearia.":createError.message},{status:400});
  const {error}=await admin.rpc("save_staff_member",{p_actor:user.id,p_tenant:tenant,p_user:created.user.id,p_name:body.name,p_role:body.role,p_permissions:body.permissions||[]});
  if(error){await admin.auth.admin.deleteUser(created.user.id);return NextResponse.json({error:error.message},{status:400})}
  return NextResponse.json({username:"@"+username});
 }catch(error){return NextResponse.json({error:error.message||"Não foi possível criar o funcionário."},{status:500})}
}