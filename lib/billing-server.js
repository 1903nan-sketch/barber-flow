import {createClient} from "@supabase/supabase-js";
import {asaasRequest,digits} from "./asaas";

export function serverSupabase(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error("Supabase de servidor não configurado.");
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}

export async function requireTenantOwner(request,tenantId){
 if(!tenantId)throw Object.assign(new Error("Barbearia não informada."),{status:400});
 const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
 if(!token)throw Object.assign(new Error("Sessão inválida."),{status:401});
 const admin=serverSupabase();
 const {data:{user},error:userError}=await admin.auth.getUser(token);
 if(userError||!user)throw Object.assign(new Error("Sessão expirada."),{status:401});
 const {data:membership}=await admin.from("memberships").select("tenant_id,name,role,active").eq("tenant_id",tenantId).eq("user_id",user.id).eq("active",true).maybeSingle();
 if(!membership||membership.role!=="owner")throw Object.assign(new Error("Somente o proprietário pode administrar a mensalidade."),{status:403});
 const {data:tenant,error}=await admin.from("tenants").select("*,plans(id,name,monthly_cents,extra_unit_cents,max_units)").eq("id",tenantId).maybeSingle();
 if(error||!tenant)throw Object.assign(new Error("Barbearia não encontrada."),{status:404});
 return {admin,user,membership,tenant,plan:tenant.plans||null};
}

export async function activeUnitCount(admin,tenantId){
 const {count}=await admin.from("units").select("id",{count:"exact",head:true}).eq("tenant_id",tenantId).eq("active",true);
 return Number(count||0);
}

export async function ensureAsaasCustomer(ctx){
 const {admin,user,membership,tenant}=ctx;
 if(tenant.asaas_customer_id)return tenant.asaas_customer_id;
 const cpfCnpj=digits(tenant.owner_document);
 if(![11,14].includes(cpfCnpj.length))throw Object.assign(new Error("Cadastre um CPF/CNPJ válido do proprietário antes de ativar a cobrança online."),{status:400});
 const customer=await asaasRequest("/customers",{method:"POST",body:{
  name:membership.name||tenant.name,
  cpfCnpj,
  email:user.email||undefined,
  mobilePhone:digits(tenant.phone)||undefined,
  externalReference:tenant.id,
  notificationDisabled:false
 }});
 if(!customer?.id)throw new Error("O Asaas não retornou o identificador do cliente.");
 await admin.from("tenants").update({asaas_customer_id:customer.id,billing_provider:"asaas"}).eq("id",tenant.id);
 tenant.asaas_customer_id=customer.id;tenant.billing_provider="asaas";
 return customer.id;
}

export async function requireFullAdmin(request){
 const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
 if(!token)throw Object.assign(new Error("Sessão inválida."),{status:401});
 const admin=serverSupabase();
 const {data:{user},error}=await admin.auth.getUser(token);
 if(error||!user)throw Object.assign(new Error("Sessão expirada."),{status:401});
 const {data:row}=await admin.from("platform_admins").select("access_role").eq("user_id",user.id).maybeSingle();
 if(!row||row.access_role!=="full")throw Object.assign(new Error("Acesso restrito ao administrador mestre."),{status:403});
 return {admin,user};
}
