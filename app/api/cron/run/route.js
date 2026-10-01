import {timingSafeEqual} from "node:crypto";
import {NextResponse} from "next/server";
import {adminClient} from "../../../../lib/server-auth";
import {getPlatformSetting} from "../../../../lib/whatsapp-send";
import {runAppointmentNotifications,runBillingReminders,runPendingCampaigns} from "../../../../lib/automation";

export const maxDuration=60;
export const dynamic="force-dynamic";

function same(a,b){const x=Buffer.from(String(a||"")),y=Buffer.from(String(b||""));return x.length>0&&x.length===y.length&&timingSafeEqual(x,y)}

// Executor das automações. Chamado a cada 5 minutos pelo pg_cron (cabeçalho x-cron-secret,
// segredo em platform_settings) e, como reserva, pelo Vercel Cron (Authorization: Bearer CRON_SECRET).
async function run(request){
 let admin;
 try{admin=adminClient()}catch(error){return NextResponse.json({error:error.message},{status:500})}
 const bearer=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||"";
 const envSecret=process.env.CRON_SECRET||"";
 const dbSecret=await getPlatformSetting(admin,"cron_secret");
 if(!(envSecret&&same(bearer,envSecret))&&!(dbSecret&&same(request.headers.get("x-cron-secret"),dbSecret)))return NextResponse.json({error:"Não autorizado."},{status:401});

 const started=Date.now(),deadline=started+45000;
 const origin=(process.env.NEXT_PUBLIC_APP_URL||await getPlatformSetting(admin,"app_base_url")||new URL(request.url).origin).replace(/\/+$/,"");
 const report={};
 const step=async(name,fn)=>{try{report[name]=await fn()}catch(error){report[name]={error:error?.message||String(error)};console.error("cron",name,error)}};
 await step("billing_status",async()=>{const {data,error}=await admin.rpc("sync_tenant_billing_status",{p_tenant:null});if(error)throw error;return {updated:data}});
 await step("notifications",()=>runAppointmentNotifications(admin,{deadline}));
 await step("billing_reminders",()=>runBillingReminders(admin));
 await step("campaigns",()=>runPendingCampaigns(admin,{origin,deadline}));
 return NextResponse.json({ok:true,ms:Date.now()-started,...report});
}

export const POST=run;
export const GET=run;
