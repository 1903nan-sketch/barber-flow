import {NextResponse} from "next/server";
import {activeUnitCount,requireTenantOwner} from "../../../../lib/billing-server";
import {asaasConfigured,asaasRequest,calculateBillingAmount} from "../../../../lib/asaas";
import {bearer,userClient} from "../../../../lib/server-auth";

// Troca de plano pelo proprietário (upgrade a qualquer momento, inclusive no teste grátis).
// Os limites (perfis/unidades) são validados no banco por owner_change_plan.
export async function POST(request){
 try{
  const body=await request.json(),tenantId=String(body.tenant_id||""),planId=String(body.plan_id||"");
  if(!planId)return NextResponse.json({error:"Plano não informado."},{status:400});
  const ctx=await requireTenantOwner(request,tenantId);
  const {data,error}=await userClient(bearer(request)).rpc("owner_change_plan",{t:tenantId,p_plan:planId});
  if(error)return NextResponse.json({error:error.message},{status:400});

  const {data:tenant}=await ctx.admin.from("tenants").select("*,plans(id,name,monthly_cents,extra_unit_cents,max_units,included_units,max_profiles,max_barbers)").eq("id",tenantId).maybeSingle();
  const units=await activeUnitCount(ctx.admin,tenantId);
  const amount=calculateBillingAmount(tenant,tenant?.plans,units);
  let gatewayUpdated=false;
  if(tenant?.asaas_subscription_id&&asaasConfigured()&&amount>0){
   try{
    await asaasRequest("/subscriptions/"+encodeURIComponent(tenant.asaas_subscription_id),{method:"PUT",body:{
     value:amount/100,description:"BarberTix - "+(tenant.plans?.name||"Plano"),updatePendingPayments:true
    }});
    gatewayUpdated=true;
   }catch(err){console.error("asaas plan update",err?.message||err)}
  }
  if(tenant?.asaas_subscription_id)await ctx.admin.from("tenants").update({billing_amount_cents:amount}).eq("id",tenantId);
  return NextResponse.json({ok:true,plan:data?.plan,amount_cents:amount,gateway_updated:gatewayUpdated});
 }catch(err){
  return NextResponse.json({error:err.message||"Não foi possível trocar o plano."},{status:err.status||500});
 }
}
