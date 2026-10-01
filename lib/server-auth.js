import {createClient} from "@supabase/supabase-js";

// Cliente com service role: somente no servidor (rotas /api). Nunca importar em componentes "use client".
export function adminClient(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Object.assign(new Error("Configuração do servidor incompleta."),{status:500});
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}

// Cliente com a sessão do usuário: as RPCs continuam aplicando RLS e auth.uid().
export function userClient(token){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw Object.assign(new Error("Configuração do servidor incompleta."),{status:500});
 return createClient(url,key,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
}

export function bearer(request){
 return request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||"";
}

export const memberCan=(membership,permission)=>membership?.role==="owner"||Boolean(membership?.permissions?.includes?.(permission));

const OPEN=["trial","active","pending","overdue"];

// Valida sessão + vínculo ativo com a barbearia. Opcionalmente exige permissão/proprietário.
export async function requireMember(request,tenantId,{permission,owner=false,allowRestricted=false}={}){
 const token=bearer(request);
 if(!token)throw Object.assign(new Error("Sessão inválida."),{status:401});
 if(!tenantId)throw Object.assign(new Error("Barbearia não informada."),{status:400});
 const admin=adminClient();
 const {data:{user},error}=await admin.auth.getUser(token);
 if(error||!user)throw Object.assign(new Error("Sessão expirada."),{status:401});
 const {data:membership}=await admin.from("memberships").select("tenant_id,user_id,name,role,permissions,active,whatsapp")
  .eq("tenant_id",tenantId).eq("user_id",user.id).eq("active",true).maybeSingle();
 if(!membership)throw Object.assign(new Error("Sem acesso a esta barbearia."),{status:403});
 if(owner&&membership.role!=="owner")throw Object.assign(new Error("Somente o proprietário pode fazer isso."),{status:403});
 if(permission&&!memberCan(membership,permission))throw Object.assign(new Error("Seu perfil não tem permissão para esta ação."),{status:403});
 const {data:tenant}=await admin.from("tenants").select("id,name,slug,status,whatsapp,phone,address,pix_key,pix_name,pix_city,plan_id,plans(name,features,monthly_cents)").eq("id",tenantId).maybeSingle();
 if(!tenant)throw Object.assign(new Error("Barbearia não encontrada."),{status:404});
 if(!allowRestricted&&!OPEN.includes(tenant.status))throw Object.assign(new Error("O acesso desta barbearia está bloqueado. Regularize a assinatura."),{status:403});
 return {admin,user,membership,tenant,token};
}

export function planAllows(tenant,feature){
 const f=tenant?.plans?.features;
 if(f&&typeof f==="object"&&feature in f)return Boolean(f[feature]);
 return String(tenant?.plans?.name||"").toLowerCase()!=="starter";
}

export function jsonError(error,fallback="Não foi possível concluir a operação."){
 const status=Number(error?.status)||500;
 if(status>=500)console.error(fallback,error?.message||error);
 return Response.json({error:error?.message||fallback},{status});
}
