import {createClient} from "@supabase/supabase-js";
import {NextResponse} from "next/server";
import {evolutionConfigured,evolutionInstanceName,resolveEvolutionNumber,sendEvolutionText} from "../../../../lib/evolution";

const digits=value=>String(value||"").replace(/\D/g,"");
const whatsappNumber=value=>{
  const phone=digits(value);
  if(phone.length===10||phone.length===11)return "55"+phone;
  if((phone.length===12||phone.length===13)&&phone.startsWith("55"))return phone;
  return "";
};

function formatAppointment(startsAt,timezone){
  const tz=timezone||"America/Sao_Paulo";
  const date=new Date(startsAt);
  return {
    day:date.toLocaleDateString("pt-BR",{timeZone:tz,day:"2-digit",month:"2-digit",year:"numeric"}),
    time:date.toLocaleTimeString("pt-BR",{timeZone:tz,hour:"2-digit",minute:"2-digit"})
  };
}

export async function POST(request){
  try{
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
    const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
    if(!url||!publishable||!serviceKey)return NextResponse.json({error:"Configuração do servidor incompleta."},{status:500});
    if(!token)return NextResponse.json({error:"Sessão inválida."},{status:401});

    const userClient=createClient(url,publishable,{
      global:{headers:{Authorization:"Bearer "+token}},
      auth:{persistSession:false,autoRefreshToken:false}
    });
    const {data:{user},error:userError}=await userClient.auth.getUser(token);
    if(userError||!user)return NextResponse.json({error:"Sessão expirada."},{status:401});

    const body=await request.json();
    const tenantId=String(body.tenant_id||"");
    const appointmentId=String(body.appointment_id||"");
    const reason=String(body.reason||"").trim().slice(0,500);
    if(!tenantId||!appointmentId)return NextResponse.json({error:"Agendamento inválido."},{status:400});

    const {error:cancelError}=await userClient.rpc("set_appointment_status",{
      t:tenantId,
      i:appointmentId,
      new_status:"cancelled",
      reason
    });
    if(cancelError)return NextResponse.json({error:cancelError.message},{status:400});

    const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:appointment}=await admin.from("appointments")
      .select("id,starts_at,status,client_id,barber_id,service_id,unit_id")
      .eq("tenant_id",tenantId).eq("id",appointmentId).maybeSingle();

    if(!appointment)return NextResponse.json({ok:true,notified:false,notification_reason:"appointment_not_found"});

    const [tenantResult,clientResult,barberResult,serviceResult,unitResult]=await Promise.all([
      admin.from("tenants").select("name,slug").eq("id",tenantId).maybeSingle(),
      appointment.client_id?admin.from("clients").select("name,phone").eq("tenant_id",tenantId).eq("id",appointment.client_id).maybeSingle():Promise.resolve({data:null}),
      appointment.barber_id?admin.from("barbers").select("name").eq("tenant_id",tenantId).eq("id",appointment.barber_id).maybeSingle():Promise.resolve({data:null}),
      appointment.service_id?admin.from("services").select("name").eq("tenant_id",tenantId).eq("id",appointment.service_id).maybeSingle():Promise.resolve({data:null}),
      appointment.unit_id?admin.from("units").select("name,timezone").eq("tenant_id",tenantId).eq("id",appointment.unit_id).maybeSingle():Promise.resolve({data:null})
    ]);

    const tenant=tenantResult.data,client=clientResult.data,barber=barberResult.data,service=serviceResult.data,unit=unitResult.data;
    const storedPhone=whatsappNumber(client?.phone);
    if(!storedPhone)return NextResponse.json({ok:true,notified:false,notification_reason:"invalid_phone"});
    if(!(await evolutionConfigured()))return NextResponse.json({ok:true,notified:false,notification_reason:"whatsapp_not_configured"});
    const instance=evolutionInstanceName(tenantId);
    let phone="";
    try{
      phone=await resolveEvolutionNumber(instance,storedPhone);
    }catch(numberError){
      console.error("WhatsApp cancellation number validation failed",numberError);
      return NextResponse.json({ok:true,notified:false,notification_reason:"validation_failed"});
    }
    if(!phone)return NextResponse.json({ok:true,notified:false,notification_reason:"number_not_found"});

    const when=formatAppointment(appointment.starts_at,unit?.timezone);
    const message=[
      "❌ *Agendamento cancelado*",
      "",
      "Olá, "+(client?.name||"cliente")+". Seu agendamento na *"+(tenant?.name||"barbearia")+"* foi cancelado.",
      "",
      "✂️ *Serviço:* "+(service?.name||"Atendimento"),
      "👤 *Profissional:* "+(barber?.name||"Profissional"),
      "📅 *Data:* "+when.day,
      "⏰ *Horário:* "+when.time,
      "📍 *Unidade:* "+(unit?.name||"Unidade"),
      ...(reason?["","📝 *Motivo:* "+reason]:[]),
      "",
      "Se quiser marcar um novo horário, responda *MENU* por aqui."
    ].join("\n");

    try{
      await sendEvolutionText(instance,phone,message);
      await admin.from("whatsapp_bot_logs").insert({
        tenant_id:tenantId,
        phone,
        direction:"out",
        message
      });
      return NextResponse.json({ok:true,notified:true});
    }catch(sendError){
      console.error("WhatsApp cancellation notification failed",sendError);
      return NextResponse.json({ok:true,notified:false,notification_reason:"send_failed"});
    }
  }catch(error){
    return NextResponse.json({error:error.message||"Não foi possível cancelar o agendamento."},{status:500});
  }
}
