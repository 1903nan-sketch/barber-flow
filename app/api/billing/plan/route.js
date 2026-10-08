import {NextResponse} from "next/server";
import {activeUnitCount,requireTenantOwner} from "../../../../lib/billing-server";
import {asaasConfigured,asaasRequest,calculateBillingAmount} from "../../../../lib/asaas";

const PLAN_NAMES=["Starter","Pro","Pro + Filiais"];
const ownerPermissions=name=>name==="Starter"
 ?["clients","services","team","finance","inventory","sales","reports"]
 :["agenda","booking","clients","services","team","settings","audit","finance","inventory","sales","reports"];

// Owner picks the plan during the trial (or before the first payment).
export async function POST(request){
 try{
  const body=await request.json().catch(()=>({})),tenantId=String(body.tenant_id||""),planId=String(body.plan_id||"");
  const ctx=await requireTenantOwner(request,tenantId);
  if(ctx.tenant.last_paid_at)return NextResponse.json({error:"Para trocar de plano depois do primeiro pagamento, fale com o suporte RupControl."},{status:400});
  const {data:plan}=await ctx.admin.from("plans").select("id,name,monthly_cents,extra_unit_cents,max_barbers,max_units,max_profiles,included_units").eq("id",planId).maybeSingle();
  if(!plan||!PLAN_NAMES.includes(plan.name))return NextResponse.json({error:"Plano inválido."},{status:400});
  if(plan.id===ctx.tenant.plan_id)return NextResponse.json({ok:true,unchanged:true});

  // The new plan must fit what the shop already uses.
  const [units,{count:barbers},{count:profiles}]=await Promise.all([
   activeUnitCount(ctx.admin,ctx.tenant.id),
   ctx.admin.from("barbers").select("id",{count:"exact",head:true}).eq("tenant_id",ctx.tenant.id).eq("active",true),
   ctx.admin.from("memberships").select("user_id",{count:"exact",head:true}).eq("tenant_id",ctx.tenant.id).eq("active",true).neq("role","owner")
  ]);
  const over=[];
  if(units>Number(plan.max_units??Infinity))over.push(`${units} unidades ativas (o plano permite ${plan.max_units})`);
  if(Number(barbers||0)>Number(plan.max_barbers??Infinity))over.push(`${barbers} profissionais ativos (o plano permite ${plan.max_barbers})`);
  if(Number(profiles||0)>Number(plan.max_profiles??Infinity))over.push(`${profiles} perfis de equipe (o plano permite ${plan.max_profiles})`);
  if(over.length)return NextResponse.json({error:`O plano ${plan.name} não comporta o que você já cadastrou: ${over.join("; ")}. Desative o excedente ou escolha outro plano.`},{status:400});

  // Starter has no public booking; only flip the site when crossing that line.
  const patch={plan_id:plan.id},wasStarter=ctx.plan?.name==="Starter",isStarter=plan.name==="Starter";
  if(wasStarter!==isStarter)patch.public_site_enabled=!isStarter;
  const {error}=await ctx.admin.from("tenants").update(patch).eq("id",ctx.tenant.id);
  if(error)throw error;
  await ctx.admin.from("memberships").update({permissions:ownerPermissions(plan.name)}).eq("tenant_id",ctx.tenant.id).eq("user_id",ctx.user.id).eq("role","owner");

  // Keep an existing Asaas subscription in line with the new price.
  const amountCents=calculateBillingAmount(ctx.tenant,plan,units);
  if(asaasConfigured()&&ctx.tenant.asaas_subscription_id){
   await asaasRequest("/subscriptions/"+encodeURIComponent(ctx.tenant.asaas_subscription_id),{method:"PUT",body:{value:amountCents/100,description:"RupControl - "+plan.name,updatePendingPayments:true}});
  }
  await ctx.admin.from("tenants").update({billing_amount_cents:amountCents}).eq("id",ctx.tenant.id);
  return NextResponse.json({ok:true,plan:plan.name,amount_cents:amountCents});
 }catch(err){
  console.error("billing plan",err);
  return NextResponse.json({error:err.message||"Não foi possível trocar o plano."},{status:err.status||500});
 }
}
