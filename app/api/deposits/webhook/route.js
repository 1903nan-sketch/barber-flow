import {timingSafeEqual} from "node:crypto";
import {NextResponse} from "next/server";
import {adminClient} from "../../../../lib/server-auth";
import {getGateway} from "../../../../lib/deposits";
import {sendWhatsapp} from "../../../../lib/whatsapp-send";
import {firstName,formatWhen} from "../../../../lib/whatsapp-messages";
import {loadAppointmentInfo} from "../../../../lib/appointment-info";

const PAID=new Set(["PAYMENT_RECEIVED","PAYMENT_CONFIRMED","PAYMENT_RECEIVED_IN_CASH"]);
function same(a,b){const x=Buffer.from(String(a||"")),y=Buffer.from(String(b||""));return x.length>0&&x.length===y.length&&timingSafeEqual(x,y)}

// Webhook do Asaas da barbearia (cada barbearia tem token próprio) para confirmar sinais.
export async function POST(request){
 const tenantId=new URL(request.url).searchParams.get("tenant")||"";
 if(!/^[0-9a-f-]{36}$/i.test(tenantId))return NextResponse.json({error:"Barbearia inválida."},{status:400});
 const admin=adminClient();
 const gateway=await getGateway(admin,tenantId);
 if(!gateway||!same(request.headers.get("asaas-access-token"),gateway.webhook_token))return NextResponse.json({error:"Token inválido."},{status:401});
 let body;try{body=await request.json()}catch{return NextResponse.json({error:"Payload inválido."},{status:400})}
 const event=String(body.event||""),payment=body.payment||{};
 const ref=String(payment.externalReference||"").match(/^deposit:([0-9a-f-]{36})$/i)?.[1];
 if(!ref||!payment.id)return NextResponse.json({ok:true,ignored:true});

 const {data:deposit}=await admin.from("appointment_deposits").select("id,tenant_id,appointment_id,status,external_id,amount_cents").eq("id",ref).eq("tenant_id",tenantId).maybeSingle();
 if(!deposit||(deposit.external_id&&deposit.external_id!==payment.id))return NextResponse.json({ok:true,ignored:"unknown_deposit"});
 if(!PAID.has(event))return NextResponse.json({ok:true,event});
 if(Math.round(Number(payment.value||0)*100)<deposit.amount_cents)return NextResponse.json({ok:true,ignored:"amount_mismatch"});

 const paidAt=payment.paymentDate||payment.confirmedDate||payment.clientPaymentDate||null;
 const {data:result,error}=await admin.rpc("server_mark_deposit_paid",{p_deposit:deposit.id,p_paid_at:paidAt?new Date(paidAt).toISOString():null});
 if(error){console.error("deposit webhook",error.message);return NextResponse.json({error:"Falha ao confirmar sinal."},{status:500})}
 if(result?.duplicate)return NextResponse.json({ok:true,duplicate:true});

 // Avisa o cliente (uma única vez) que o horário está garantido.
 try{
  const {data:claim}=await admin.from("appointment_notifications").upsert({tenant_id:tenantId,appointment_id:deposit.appointment_id,kind:"deposit_paid",status:"pending"},{onConflict:"appointment_id,kind",ignoreDuplicates:true}).select("id");
  if(claim?.length){
   const a=await loadAppointmentInfo(admin,tenantId,deposit.appointment_id);
   const when=formatWhen(a?.appointment?.starts_at,a?.timezone);
   const text=result?.late
    ?`Recebemos o seu sinal, ${firstName(a?.client?.name)}, mas o prazo de reserva já havia terminado. A *${a?.tenant?.name||"barbearia"}* vai falar com você para remarcar ou devolver o valor.`
    :`✅ *Sinal recebido!* Seu horário na *${a?.tenant?.name||"barbearia"}* está garantido.\n\n✂️ ${a?.services||""}\n📅 ${when.date} às ${when.time}\n👤 ${a?.barber?.name||""}\n\nAté breve, ${firstName(a?.client?.name)}!`;
   try{
    const phone=await sendWhatsapp(admin,tenantId,a?.client?.whatsapp||a?.client?.phone,text);
    await admin.from("appointment_notifications").update({status:"sent",phone,message:text,sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",claim[0].id);
   }catch(sendError){
    await admin.from("appointment_notifications").update({status:"failed",error:String(sendError?.code||sendError?.message||"").slice(0,300),updated_at:new Date().toISOString()}).eq("id",claim[0].id);
   }
  }
 }catch(notifyError){console.error("deposit notify",notifyError?.message||notifyError)}
 return NextResponse.json({ok:true});
}
