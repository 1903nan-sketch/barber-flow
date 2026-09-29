import {createClient} from "@supabase/supabase-js";
import {NextResponse} from "next/server";

function server(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Object.assign(new Error("Configuração do servidor incompleta."),{status:500});
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}

async function context(request,tenant){
 const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
 if(!token)throw Object.assign(new Error("Sessão inválida."),{status:401});
 const admin=server(),{data:{user},error:userError}=await admin.auth.getUser(token);
 if(userError||!user)throw Object.assign(new Error("Sessão expirada."),{status:401});
 const {data:owner}=await admin.from("memberships").select("tenant_id").eq("tenant_id",tenant).eq("user_id",user.id).eq("role","owner").eq("active",true).maybeSingle();
 if(!owner)throw Object.assign(new Error("Somente o proprietário pode administrar acessos."),{status:403});
 const {data:company,error}=await admin.from("tenants").select("id,plan_id,plans(name,max_profiles,max_barbers)").eq("id",tenant).maybeSingle();
 if(error||!company)throw Object.assign(new Error("Barbearia não encontrada."),{status:404});
 return {admin,user,company,plan:company.plans||{}};
}

async function setProvider(admin,tenant,userId,name,enabled,photo=""){
 if(!enabled){
  await admin.from("barbers").update({active:false}).eq("tenant_id",tenant).eq("user_id",userId);
  return null;
 }
 const row={tenant_id:tenant,user_id:userId,name,active:true};
 if(photo)row.photo_url=photo;
 const {data:barber,error}=await admin.from("barbers").upsert(row,{onConflict:"tenant_id,user_id"}).select("id").single();
 if(error)throw error;
 const [units,services]=await Promise.all([
  admin.from("units").select("id").eq("tenant_id",tenant).eq("active",true),
  admin.from("services").select("id").eq("tenant_id",tenant).eq("active",true)
 ]);
 if(units.data?.length)await admin.from("barber_units").upsert(units.data.map(x=>({tenant_id:tenant,barber_id:barber.id,unit_id:x.id})),{onConflict:"tenant_id,barber_id,unit_id"});
 if(services.data?.length)await admin.from("barber_services").upsert(services.data.map(x=>({tenant_id:tenant,barber_id:barber.id,service_id:x.id})),{onConflict:"tenant_id,barber_id,service_id"});
 return barber.id;
}

export async function POST(request){
 try{
  const body=await request.json(),tenant=String(body.tenant_id||""),username=String(body.username||"").trim().toLowerCase().replace(/^@/,""),password=String(body.password||"");
  if(!/^[a-z0-9._-]{3,24}$/.test(username))return NextResponse.json({error:"O usuário deve ter de 3 a 24 caracteres: letras, números, ponto, traço ou _."},{status:400});
  if(password.length<6)return NextResponse.json({error:"A senha precisa ter pelo menos 6 caracteres."},{status:400});
  const ctx=await context(request,tenant),{admin,user,plan}=ctx;
  const maxProfiles=Math.max(0,Number(plan.max_profiles||0));
  const {count}=await admin.from("memberships").select("user_id",{count:"exact",head:true}).eq("tenant_id",tenant).eq("active",true).neq("role","owner");
  if(Number(count||0)>=maxProfiles)return NextResponse.json({error:`Seu plano permite o proprietário + ${maxProfiles} ${maxProfiles===1?"perfil adicional":"perfis adicionais"}. Faça upgrade para adicionar mais usuários.`},{status:409});

  const role=String(body.role||"");
  if(!["barber","manager","reception","attendant"].includes(role))return NextResponse.json({error:"Função inválida."},{status:400});
  const name=String(body.name||"").trim();
  if(!name)return NextResponse.json({error:"Informe o nome do funcionário."},{status:400});
  const starter=String(plan.name||"").toLowerCase()==="starter";
  const isProvider=!starter&&Boolean(body.is_provider);
  if(isProvider){
   const {count:providers}=await admin.from("barbers").select("id",{count:"exact",head:true}).eq("tenant_id",tenant).eq("active",true);
   if(Number(providers||0)>=Number(plan.max_barbers||11))return NextResponse.json({error:"O limite de profissionais agendáveis do plano foi atingido."},{status:409});
  }
  const loginEmail=`${username}.${tenant.replace(/-/g,"").slice(0,10)}@staff.barberflow.app`;
  const {data:created,error:createError}=await admin.auth.admin.createUser({email:loginEmail,password,email_confirm:true,user_metadata:{name,staff_username:"@"+username,avatar_url:body.photo_url||""}});
  if(createError)return NextResponse.json({error:createError.message.includes("already")?"Este usuário já está em uso nesta barbearia.":createError.message},{status:400});

  const {error}=await admin.rpc("save_staff_member",{p_actor:user.id,p_tenant:tenant,p_user:created.user.id,p_name:name,p_role:role,p_permissions:body.permissions||[],p_username:username,p_login_email:loginEmail});
  if(error){await admin.auth.admin.deleteUser(created.user.id);return NextResponse.json({error:error.message},{status:400})}

  const whatsapp=String(body.whatsapp||"").replace(/[^0-9]/g,"");
  if(whatsapp)await admin.from("memberships").update({whatsapp}).eq("tenant_id",tenant).eq("user_id",created.user.id);

  await setProvider(admin,tenant,created.user.id,name,isProvider,String(body.photo_url||""));

  return NextResponse.json({username:"@"+username,is_provider:isProvider,profiles_used:Number(count||0)+1,profiles_limit:maxProfiles});
 }catch(error){
  return NextResponse.json({error:error.message||"Não foi possível criar o funcionário."},{status:error.status||500});
 }
}

export async function PATCH(request){
 try{
  const body=await request.json(),tenant=String(body.tenant_id||""),target=String(body.user_id||"");
  const ctx=await context(request,tenant),{admin,plan}=ctx;
  if(!target)return NextResponse.json({error:"Usuário não informado."},{status:400});
  const {data:member}=await admin.from("memberships").select("user_id,name,role,active").eq("tenant_id",tenant).eq("user_id",target).maybeSingle();
  if(!member)return NextResponse.json({error:"Perfil não encontrado."},{status:404});
  const enabled=Boolean(body.is_provider);
  if(enabled&&String(plan.name||"").toLowerCase()==="starter")return NextResponse.json({error:"O plano Starter não inclui agenda nem profissionais agendáveis."},{status:409});
  if(enabled){
   const {count}=await admin.from("barbers").select("id",{count:"exact",head:true}).eq("tenant_id",tenant).eq("active",true).neq("user_id",target);
   if(Number(count||0)>=Number(plan.max_barbers||11))return NextResponse.json({error:"O limite de profissionais agendáveis do plano foi atingido."},{status:409});
  }
  await setProvider(admin,tenant,target,member.name,enabled);
  return NextResponse.json({ok:true,is_provider:enabled});
 }catch(error){
  return NextResponse.json({error:error.message||"Não foi possível atualizar o perfil."},{status:error.status||500});
 }
}
