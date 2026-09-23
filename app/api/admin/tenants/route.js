import {createClient} from "@supabase/supabase-js";
import {NextResponse} from "next/server";
export async function POST(request){
 try{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  if(!url||!key)return NextResponse.json({error:"Falta configurar SUPABASE_SERVICE_ROLE_KEY na Vercel."},{status:500});
  if(!token)return NextResponse.json({error:"Sessão inválida."},{status:401});
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),{data:{user},error:userError}=await admin.auth.getUser(token);
  if(userError||!user)return NextResponse.json({error:"Sessão expirada."},{status:401});
  const {data:allowed}=await admin.from("platform_admins").select("user_id,access_role").eq("user_id",user.id).maybeSingle();
  if(!allowed||allowed.access_role!=="full")return NextResponse.json({error:"Acesso restrito ao administrador mestre."},{status:403});
  const body=await request.json(),email=String(body.owner_email||"").trim().toLowerCase(),password=String(body.password||"");\n  if(!String(body.name||"").trim()||!String(body.owner_name||"").trim()||!email||!String(body.slug||"").trim()||!body.plan_id)return NextResponse.json({error:"Preencha os dados obrigatórios da barbearia, proprietário e plano."},{status:400});
  if(password.length<8)return NextResponse.json({error:"A senha precisa ter pelo menos 8 caracteres."},{status:400});
  const {data:created,error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:body.owner_name}});
  if(createError)return NextResponse.json({error:createError.message.includes("already")?"Este e-mail já possui uma conta. Use outro e-mail.":createError.message},{status:400});
  const {data:tenantId,error}=await admin.rpc("admin_provision_tenant",{p_admin:user.id,p_owner:created.user.id,p:{name:String(body.name||"").trim(),slug:String(body.slug||"").trim(),phone:body.phone||"",plan_id:body.plan_id,owner_name:String(body.owner_name||"").trim()}});
  if(error){await admin.auth.admin.deleteUser(created.user.id);return NextResponse.json({error:error.message},{status:400})}
  await admin.from("tenants").update({owner_document:body.owner_document||"",manager_name:body.manager_name||"",manager_document:body.manager_document||"",grace_days:0,billing_due_date:body.billing_due_date||null,commitment_months:body.commitment_mode==="flex"?0:12,no_commitment_surcharge_pct:body.commitment_mode==="flex"?15:0,discount_pct:Math.min(100,Math.max(0,Number(body.discount_pct||0))),discount_months:Math.min(60,Math.max(0,Number(body.discount_months||0))),discount_started_at:Number(body.discount_pct||0)>0?(body.billing_due_date||new Date().toISOString().slice(0,10)):null}).eq("id",tenantId);
  return NextResponse.json({id:tenantId,slug:body.slug});
 }catch(error){return NextResponse.json({error:error.message||"Não foi possível criar a barbearia."},{status:500})}
}
