import {createClient} from "@supabase/supabase-js";

export function whatsappAdmin(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("Supabase server não configurado.");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}

export async function requireWhatsappSettingsAccess(req,tenantId){
  const token=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  if(!token||!tenantId)return {error:"Sessão inválida.",status:401};
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return {error:"Supabase não configurado.",status:503};
  const sb=createClient(url,key,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await sb.auth.getUser(token);
  if(error||!user)return {error:"Sessão expirada.",status:401};
  const {data:m}=await sb.from("memberships")
    .select("role,permissions,active,tenants(status)")
    .eq("user_id",user.id).eq("tenant_id",tenantId).maybeSingle();
  const allowedStatus=["active","trial","pending","overdue"].includes(m?.tenants?.status);
  const canSettings=m?.role==="owner"||(m?.role==="manager"&&m?.permissions?.includes?.("settings"));
  if(!m?.active||!allowedStatus||!canSettings)return {error:"Sem permissão para configurar o WhatsApp.",status:403};
  return {user,membership:m,admin:whatsappAdmin()};
}
