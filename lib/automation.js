import {evolutionInstanceName} from "./evolution";
import {getPlatformSetting,sendWhatsapp} from "./whatsapp-send";
import {DEFAULT_CONFIRMATION,DEFAULT_RECOVERY,DEFAULT_REMINDER,fillTemplate,firstName,formatWhen,relativeWhen} from "./whatsapp-messages";

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const now=()=>new Date().toISOString();
const failCode=e=>String(e?.code||e?.message||"send_failed").slice(0,300);

// Confirmações (24h) e lembretes (2h). A linha em appointment_notifications é criada
// antes do envio: o unique (appointment_id, kind) impede mensagens duplicadas mesmo com
// execuções simultâneas.
export async function runAppointmentNotifications(admin,{deadline,limit=40}={}){
 const {data:due,error}=await admin.rpc("automation_due_notifications",{p_limit:limit});
 if(error)throw error;
 const out={sent:0,failed:0,skipped:0};
 for(const row of due||[]){
  if(deadline&&Date.now()>deadline)break;
  const {data:claim}=await admin.from("appointment_notifications")
   .upsert({tenant_id:row.tenant_id,appointment_id:row.appointment_id,kind:row.kind,status:"pending"},{onConflict:"appointment_id,kind",ignoreDuplicates:true})
   .select("id");
  if(!claim?.length){out.skipped++;continue}
  const when=formatWhen(row.starts_at,row.timezone);
  const values={nome:firstName(row.client_name),barbearia:row.tenant_name,servico:row.services,profissional:row.barber_name||"",
   data:when.date,hora:when.time,quando:relativeWhen(row.starts_at,row.timezone),unidade:row.unit_name||"",endereco:row.tenant_address?" · "+row.tenant_address:""};
  const text=fillTemplate(row.template||(row.kind==="confirmation"?DEFAULT_CONFIRMATION:DEFAULT_REMINDER),values);
  try{
   const phone=await sendWhatsapp(admin,row.tenant_id,row.client_phone,text,row.kind==="confirmation"?{list:{title:"Confirme seu horário",options:["Confirmar","Reagendar","Cancelar"]}}:{});
   await admin.from("appointment_notifications").update({status:"sent",phone,message:text,sent_at:now(),updated_at:now()}).eq("id",claim[0].id);
   if(row.kind==="confirmation"){
    // O robô do WhatsApp usa esta sessão para entender "1/2/3" como resposta à confirmação.
    await admin.from("whatsapp_booking_sessions").upsert({tenant_id:row.tenant_id,phone,state:"appt_confirm",
     data:{appointment_id:row.appointment_id,timezone:row.timezone,expires_at:row.starts_at},updated_at:now()},{onConflict:"phone,tenant_id"});
   }
   out.sent++;
  }catch(e){
   await admin.from("appointment_notifications").update({status:e?.code==="invalid_phone"||e?.code==="number_not_found"?"skipped":"failed",error:failCode(e),updated_at:now()}).eq("id",claim[0].id);
   out.failed++;
  }
  await sleep(350);
 }
 return out;
}

// Aviso 3 dias antes do vencimento e do fim do teste grátis (registro único por data).
export async function runBillingReminders(admin){
 const tz="America/Sao_Paulo",day=offset=>new Date(Date.now()+offset*86400000).toLocaleDateString("en-CA",{timeZone:tz});
 const in3=day(3),out={due:0,trial:0,sent:0};
 const instance=await getPlatformSetting(admin,"platform_whatsapp_instance");
 const [{data:due},{data:trials}]=await Promise.all([
  admin.from("tenants").select("id,name,whatsapp,phone,billing_due_date").in("status",["active","pending"]).eq("billing_due_date",in3),
  admin.from("tenants").select("id,name,whatsapp,phone,trial_ends_at").eq("status","trial").gte("trial_ends_at",day(2)+"T03:00:00Z").lt("trial_ends_at",day(3)+"T03:00:00Z")
 ]);
 const notify=async(t,kind,reference,text)=>{
  const {error}=await admin.from("subscription_events").insert({tenant_id:t.id,kind,reference,details:{channel:instance?"whatsapp":"panel"}});
  if(error)return false;
  if(instance){
   const {data:owner}=await admin.from("memberships").select("whatsapp").eq("tenant_id",t.id).eq("role","owner").eq("active",true).limit(1).maybeSingle();
   try{await sendWhatsapp(admin,null,owner?.whatsapp||t.whatsapp||t.phone,text,{instance});out.sent++}catch{}
  }
  return true;
 };
 for(const t of due||[]){
  if(await notify(t,"due_reminder",t.billing_due_date,`Olá! A mensalidade do BarberTix da *${t.name}* vence em 3 dias (${t.billing_due_date.split("-").reverse().join("/")}). Para pagar ou conferir, acesse Mensalidade no painel.`))out.due++;
 }
 for(const t of trials||[]){
  const end=new Date(t.trial_ends_at).toLocaleDateString("pt-BR",{timeZone:tz});
  if(await notify(t,"trial_ending_reminder",end,`Seu teste grátis do BarberTix na *${t.name}* termina em ${end}. Escolha um plano em Mensalidade para continuar sem interrupção.`))out.trial++;
 }
 return out;
}

// Envia um lote de uma campanha (chamado pela tela e continuado pelo cron).
export async function runCampaignBatch(admin,campaignId,{origin,deadline,limit=8}={}){
 const {data:rows,error}=await admin.rpc("server_campaign_claim",{p_campaign:campaignId,p_limit:limit});
 if(error)throw error;
 const out={sent:0,failed:0};
 for(const r of rows||[]){
  if(deadline&&Date.now()>deadline){
   await admin.from("campaign_recipients").update({status:"pending"}).eq("id",r.recipient_id).eq("status","sending");
   continue;
  }
  const link=`${origin}/agendar/${r.tenant_slug}?c=${r.token}`;
  const text=fillTemplate(r.message||DEFAULT_RECOVERY,{nome:firstName(r.client_name),barbearia:r.tenant_name,dias:r.days_since??"",profissional:r.usual_barber||"",link});
  try{
   await sendWhatsapp(admin,r.tenant_id,r.phone,text.includes(link)?text:text+"\n\n"+link,{instance:evolutionInstanceName(r.tenant_id)});
   await admin.rpc("server_campaign_result",{p_recipient:r.recipient_id,p_ok:true,p_error:null});
   out.sent++;
  }catch(e){
   await admin.rpc("server_campaign_result",{p_recipient:r.recipient_id,p_ok:false,p_error:failCode(e)});
   out.failed++;
  }
  await sleep(900);
 }
 return {...out,claimed:(rows||[]).length};
}

export async function runPendingCampaigns(admin,{origin,deadline}={}){
 const {data:campaigns}=await admin.from("marketing_campaigns").select("id").eq("status","sending").order("created_at").limit(5);
 const out={campaigns:0,sent:0,failed:0};
 for(const c of campaigns||[]){
  if(deadline&&Date.now()>deadline)break;
  const r=await runCampaignBatch(admin,c.id,{origin,deadline,limit:10});
  out.campaigns++;out.sent+=r.sent;out.failed+=r.failed;
 }
 return out;
}
