import {createClient} from "@supabase/supabase-js";
import {NextResponse} from "next/server";
import {TRIAL_DAYS,addDaysISO,todaySP} from "../../../../lib/legal";

const cleanSlug=value=>String(value||"")
 .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");

export async function POST(request){
 try{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  if(!url||!key)return NextResponse.json({error:"Falta configurar SUPABASE_SERVICE_ROLE_KEY na Vercel."},{status:500});
  if(!token)return NextResponse.json({error:"Sessão inválida."},{status:401});

  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await admin.auth.getUser(token);
  if(userError||!user)return NextResponse.json({error:"Sessão expirada."},{status:401});

  const {data:allowed}=await admin.from("platform_admins").select("user_id,access_role").eq("user_id",user.id).maybeSingle();
  if(!allowed||allowed.access_role!=="full")return NextResponse.json({error:"Acesso restrito ao administrador mestre."},{status:403});

  const body=await request.json();
  const name=String(body.name||"").trim(),ownerName=String(body.owner_name||"").trim(),email=String(body.owner_email||"").trim().toLowerCase();
  let slug=cleanSlug(body.slug||name);

  if(!name||!ownerName||!email||!slug||!body.plan_id)return NextResponse.json({error:"Preencha os dados obrigatórios da barbearia, proprietário e plano."},{status:400});

  const {data:plan,error:planError}=await admin.from("plans").select("id,name,monthly_cents,default_grace_days").eq("id",body.plan_id).maybeSingle();
  if(planError||!plan||!["Starter","Pro","Pro + Filiais"].includes(plan.name))return NextResponse.json({error:"Selecione um plano válido."},{status:400});

  const baseSlug=slug;
  let suffix=2;
  while(true){
   const {data:existing}=await admin.from("tenants").select("id").eq("slug",slug).maybeSingle();
   if(!existing)break;
   slug=baseSlug+"-"+suffix++;
   if(suffix>99)return NextResponse.json({error:"Não foi possível gerar uma URL única para esta barbearia."},{status:400});
  }

  const redirectTo="https://barbertix.3ruptix.com/login?setup=password";
  const {data:created,error:createError}=await admin.auth.admin.inviteUserByEmail(email,{
   redirectTo,
   data:{full_name:ownerName,tenant_name:name,product:"BarberTix"}
  });
  if(createError){
   const duplicate=/already|registered|exists|user.*exists/i.test(createError.message||"");
   const rate=/rate|limit|too many/i.test(createError.message||"");
   return NextResponse.json({error:duplicate?"Este e-mail já possui uma conta. Confira os acessos existentes antes de cadastrar novamente.":rate?"O serviço de e-mail atingiu o limite temporário de envios. Aguarde alguns minutos e tente novamente.":createError.message},{status:400});
  }
  if(!created?.user?.id)return NextResponse.json({error:"O convite não retornou um usuário válido. Tente novamente."},{status:500});

  const {data:tenantId,error:provisionError}=await admin.rpc("admin_provision_tenant",{p_admin:user.id,p_owner:created.user.id,p:{name,slug,phone:String(body.phone||"").trim(),plan_id:plan.id,owner_name:ownerName}});
  if(provisionError){
   await admin.auth.admin.deleteUser(created.user.id);
   console.error("admin_provision_tenant failed",provisionError.message);
   return NextResponse.json({error:provisionError.message},{status:400});
  }

  const discountPct=Math.min(100,Math.max(0,Number(body.discount_pct||0)));
  const discountMonths=Math.min(60,Math.max(0,Number(body.discount_months||0)));
  const billingMethod=["PIX","CREDIT_CARD"].includes(String(body.billing_method||"").toUpperCase())?String(body.billing_method).toUpperCase():"";
  // Every new shop starts with a free trial; the first charge is due when it ends
  // unless the admin set another due date.
  const trialEnd=addDaysISO(todaySP(),TRIAL_DAYS);
  const patch={
   status:"trial",
   trial_ends_at:trialEnd,
   owner_document:String(body.owner_document||"").trim(),
   manager_name:String(body.manager_name||"").trim(),
   manager_document:String(body.manager_document||"").trim(),
   grace_days:Number(plan.default_grace_days||7),
   billing_due_date:body.billing_due_date||trialEnd,
   billing_provider:billingMethod?"asaas":"",
   billing_method:billingMethod,
   billing_provider_status:billingMethod?"PENDING_SETUP":"",
   commitment_months:body.commitment_mode==="flex"?0:12,
   no_commitment_surcharge_pct:body.commitment_mode==="flex"?15:0,
   discount_pct:discountPct,
   discount_months:discountMonths,
   discount_started_at:discountPct>0?(body.billing_due_date||new Date().toISOString().slice(0,10)):null
  };
  const {error:updateError}=await admin.from("tenants").update(patch).eq("id",tenantId);
  if(updateError){
   console.error("Tenant billing setup failed",updateError.message);
   return NextResponse.json({error:"A barbearia foi criada, mas houve erro ao salvar a assinatura. Atualize a página e revise o cadastro em Barbearias."},{status:500});
  }

  const ownerIsProvider=plan.name!=="Starter"&&["on","true","1",true].includes(body.owner_is_provider);
  if(ownerIsProvider){
   const {data:barber,error:barberError}=await admin.from("barbers").upsert({tenant_id:tenantId,user_id:created.user.id,name:ownerName,active:true},{onConflict:"tenant_id,user_id"}).select("id").single();
   if(barberError)return NextResponse.json({error:"A barbearia foi criada, mas não foi possível habilitar o proprietário na agenda."},{status:500});
   const [units,services]=await Promise.all([
    admin.from("units").select("id").eq("tenant_id",tenantId).eq("active",true),
    admin.from("services").select("id").eq("tenant_id",tenantId).eq("active",true)
   ]);
   if(units.data?.length)await admin.from("barber_units").upsert(units.data.map(x=>({tenant_id:tenantId,barber_id:barber.id,unit_id:x.id})),{onConflict:"tenant_id,barber_id,unit_id"});
   if(services.data?.length)await admin.from("barber_services").upsert(services.data.map(x=>({tenant_id:tenantId,barber_id:barber.id,service_id:x.id})),{onConflict:"tenant_id,barber_id,service_id"});
  }

  return NextResponse.json({id:tenantId,slug,name,plan:plan.name,owner_is_provider:ownerIsProvider,invite_sent:true,owner_email:email});
 }catch(error){
  console.error("Create tenant route failed",error?.message||error);
  return NextResponse.json({error:error.message||"Não foi possível criar a barbearia."},{status:500});
 }
}
