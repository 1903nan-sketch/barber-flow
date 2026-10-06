import {createClient} from "@supabase/supabase-js";
import {asaasRequest,digits,validTaxId} from "./asaas";

export function serverSupabase(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error("Supabase de servidor não configurado.");
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}

export async function requireTenantOwner(request,tenantId){
 if(!tenantId)throw Object.assign(new Error("Espaço não informado."),{status:400});
 const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
 if(!token)throw Object.assign(new Error("Sessão inválida."),{status:401});
 const admin=serverSupabase();
 const {data:{user},error:userError}=await admin.auth.getUser(token);
 if(userError||!user)throw Object.assign(new Error("Sessão expirada."),{status:401});
 const {data:membership}=await admin.from("memberships").select("tenant_id,name,role,active").eq("tenant_id",tenantId).eq("user_id",user.id).eq("active",true).maybeSingle();
 if(!membership||membership.role!=="owner")throw Object.assign(new Error("Somente a proprietária pode administrar a mensalidade."),{status:403});
 const {data:tenant,error}=await admin.from("tenants").select("*,plans(id,name,monthly_cents,extra_unit_cents,max_units,included_units,max_profiles,max_barbers)").eq("id",tenantId).maybeSingle();
 if(error||!tenant)throw Object.assign(new Error("Espaço não encontrado."),{status:404});
 if(tenant.product_slug!=="beautytix")throw Object.assign(new Error("Esta conta não pertence ao BeautyTix."),{status:403});
 return {admin,user,membership,tenant,plan:tenant.plans||null};
}

export async function activeUnitCount(admin,tenantId){
 const {count}=await admin.from("units").select("id",{count:"exact",head:true}).eq("tenant_id",tenantId).eq("active",true);
 return Number(count||0);
}

// taxId: CPF/CNPJ typed by the owner on the billing screen when none is on file.
async function asaasCustomerExists(id){
 try{const c=await asaasRequest("/customers/"+encodeURIComponent(id));return Boolean(c?.id&&!c.deleted)}
 catch(err){if([400,404].includes(err.status))return false;throw err}
}

// A subscription id saved under another Asaas account/environment is useless: drop it so
// the owner can start a new one instead of seeing an empty or failing billing screen.
export async function ensureLiveSubscription(ctx){
 const {admin,tenant}=ctx;
 if(!tenant.asaas_subscription_id)return null;
 try{
  const sub=await asaasRequest("/subscriptions/"+encodeURIComponent(tenant.asaas_subscription_id));
  if(sub?.id&&!sub.deleted&&String(sub.status||"").toUpperCase()!=="INACTIVE")return sub;
 }catch(err){if(![400,404].includes(err.status))throw err}
 await admin.from("tenants").update({asaas_subscription_id:null,billing_provider_status:"SUBSCRIPTION_NOT_FOUND"}).eq("id",tenant.id);
 tenant.asaas_subscription_id=null;tenant.billing_provider_status="SUBSCRIPTION_NOT_FOUND";
 return null;
}

export async function ensureAsaasCustomer(ctx,taxId){
 const {admin,user,membership,tenant}=ctx;
 if(tenant.asaas_customer_id){
  // The stored id may belong to another Asaas account/environment (e.g. after the API key
  // changed). Keep it only if this account still knows it.
  if(await asaasCustomerExists(tenant.asaas_customer_id))return tenant.asaas_customer_id;
  await admin.from("tenants").update({asaas_customer_id:null}).eq("id",tenant.id);
  tenant.asaas_customer_id=null;
 }
 if(!validTaxId(tenant.owner_document)&&taxId){
  if(!validTaxId(taxId))throw Object.assign(new Error("CPF ou CNPJ inválido. Confira os números."),{status:400,code:"tax_id_required"});
  await admin.from("tenants").update({owner_document:digits(taxId)}).eq("id",tenant.id);
  tenant.owner_document=digits(taxId);
 }
 const cpfCnpj=digits(tenant.owner_document);
 if(!validTaxId(cpfCnpj))throw Object.assign(new Error("Informe o CPF ou CNPJ do responsável para gerar a cobrança."),{status:400,code:"tax_id_required"});
 // Reuse a customer this account already has for the shop before creating a duplicate.
 for(const query of ["externalReference="+encodeURIComponent(tenant.id),"cpfCnpj="+cpfCnpj]){
  const found=await asaasRequest("/customers?"+query+"&limit=10").catch(()=>null);
  const match=(found?.data||[]).find(c=>!c.deleted);
  if(match?.id){
   await admin.from("tenants").update({asaas_customer_id:match.id,billing_provider:"asaas"}).eq("id",tenant.id);
   tenant.asaas_customer_id=match.id;tenant.billing_provider="asaas";
   return match.id;
  }
 }
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
