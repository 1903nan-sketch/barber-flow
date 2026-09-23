import {createClient} from "@supabase/supabase-js";
import {NextResponse} from "next/server";
import {evolutionConfigured,evolutionInstanceName,sendEvolutionButtons,sendEvolutionText} from "../../../../lib/evolution";

const digits=value=>String(value||"").replace(/\D/g,"");
const whatsappNumber=value=>{
  const phone=digits(value);
  if(phone.length===10||phone.length===11)return "55"+phone;
  return phone;
};
const text=value=>String(value||"").trim().replace(/\s+/g," ");
const fmt=(value,timezone,options)=>new Date(value).toLocaleString("pt-BR",{timeZone:timezone||"America/Sao_Paulo",...options});
const weekdayMap={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};

function localParts(value,timezone){
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:timezone||"America/Sao_Paulo",
    weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).formatToParts(new Date(value));
  const map=Object.fromEntries(parts.filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  return {weekday:weekdayMap[map.weekday],minute:Number(map.hour)*60+Number(map.minute)};
}

async function canManageAgenda(admin,tenantId,userId,barberId){
  const [{data:membership},{data:barber}]=await Promise.all([
    admin.from("memberships").select("role,permissions,active").eq("tenant_id",tenantId).eq("user_id",userId).maybeSingle(),
    admin.from("barbers").select("id,user_id,active").eq("tenant_id",tenantId).eq("id",barberId).maybeSingle()
  ]);
  if(!membership?.active)return false;
  if(membership.role==="owner")return true;
  if(["manager","reception"].includes(membership.role)&&membership.permissions?.includes?.("agenda"))return true;
  return Boolean(barber?.active&&barber.user_id===userId);
}

async function proposedSlotAvailable(admin,appointment,unit,startsAt){
  const start=new Date(startsAt),duration=Math.ceil((new Date(appointment.ends_at)-new Date(appointment.starts_at))/60000);
  const end=new Date(start.getTime()+duration*60000),local=localParts(start,unit.timezone);

  const {data:windows,error:windowError}=await admin.from("weekly_windows")
    .select("start_min,end_min,step_min")
    .eq("tenant_id",appointment.tenant_id)
    .eq("barber_id",appointment.barber_id)
    .eq("unit_id",appointment.unit_id)
    .eq("weekday",local.weekday);
  if(windowError)throw windowError;
  const inside=(windows||[]).some(w=>
    local.minute>=w.start_min&&
    local.minute+duration<=w.end_min&&
    (local.minute-w.start_min)%w.step_min===0
  );
  if(!inside)return false;

  const [{data:exceptions,error:exceptionError},{data:conflicts,error:conflictError}]=await Promise.all([
    admin.from("schedule_exceptions").select("id").eq("tenant_id",appointment.tenant_id).eq("barber_id",appointment.barber_id)
      .lt("starts_at",end.toISOString()).gt("ends_at",start.toISOString()).limit(1),
    admin.from("appointments").select("id").eq("tenant_id",appointment.tenant_id).eq("barber_id",appointment.barber_id)
      .neq("id",appointment.id).neq("status","cancelled")
      .lt("starts_at",end.toISOString()).gt("ends_at",start.toISOString()).limit(1)
  ]);
  if(exceptionError)throw exceptionError;
  if(conflictError)throw conflictError;
  return !(exceptions||[]).length&&!(conflicts||[]).length;
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
    const startsAt=new Date(body.starts_at);
    if(!tenantId||!appointmentId||Number.isNaN(startsAt.getTime()))return NextResponse.json({error:"Nova data ou agendamento inválido."},{status:400});
    if(startsAt<=new Date()||startsAt>new Date(Date.now()+180*86400000)||startsAt.getUTCSeconds()!==0||startsAt.getUTCMilliseconds()!==0){
      return NextResponse.json({error:"Escolha um horário futuro válido."},{status:400});
    }

    const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:appointment,error:appointmentError}=await admin.from("appointments")
      .select("id,tenant_id,starts_at,ends_at,status,client_id,barber_id,service_id,unit_id")
      .eq("tenant_id",tenantId).eq("id",appointmentId).maybeSingle();
    if(appointmentError||!appointment)return NextResponse.json({error:"Agendamento não encontrado."},{status:404});
    if(!["scheduled","present"].includes(appointment.status))return NextResponse.json({error:"Este atendimento não pode ser reagendado."},{status:400});
    if(!(await canManageAgenda(admin,tenantId,user.id,appointment.barber_id)))return NextResponse.json({error:"Sem permissão para reagendar este atendimento."},{status:403});

    const [tenantResult,clientResult,barberResult,serviceResult,unitResult]=await Promise.all([
      admin.from("tenants").select("name").eq("id",tenantId).maybeSingle(),
      admin.from("clients").select("name,phone").eq("tenant_id",tenantId).eq("id",appointment.client_id).maybeSingle(),
      admin.from("barbers").select("name").eq("tenant_id",tenantId).eq("id",appointment.barber_id).maybeSingle(),
      admin.from("services").select("name").eq("tenant_id",tenantId).eq("id",appointment.service_id).maybeSingle(),
      admin.from("units").select("name,timezone,active").eq("tenant_id",tenantId).eq("id",appointment.unit_id).maybeSingle()
    ]);
    const tenant=tenantResult.data,client=clientResult.data,barber=barberResult.data,service=serviceResult.data,unit=unitResult.data;
    if(!unit?.active)return NextResponse.json({error:"A unidade deste atendimento não está ativa."},{status:400});
    const phone=whatsappNumber(client?.phone);
    if(!phone)return NextResponse.json({error:"Este cliente não possui WhatsApp cadastrado."},{status:400});
    if(!(await evolutionConfigured()))return NextResponse.json({error:"O WhatsApp da barbearia não está conectado."},{status:503});

    if(!(await proposedSlotAvailable(admin,appointment,unit,startsAt))){
      return NextResponse.json({error:"Esse horário não está disponível para este profissional."},{status:409});
    }

    const timezone=unit.timezone||"America/Sao_Paulo";
    const oldDate=fmt(appointment.starts_at,timezone,{day:"2-digit",month:"2-digit",year:"numeric"});
    const oldTime=fmt(appointment.starts_at,timezone,{hour:"2-digit",minute:"2-digit"});
    const newDate=fmt(startsAt,timezone,{day:"2-digit",month:"2-digit",year:"numeric"});
    const newTime=fmt(startsAt,timezone,{hour:"2-digit",minute:"2-digit"});
    const expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
    const sessionData={
      appointment_id:appointment.id,
      original_starts_at:appointment.starts_at,
      proposed_starts_at:startsAt.toISOString(),
      expires_at:expiresAt,
      client_name:text(client?.name||"Cliente"),
      service_name:text(service?.name||"Atendimento"),
      barber_name:text(barber?.name||"Profissional"),
      unit_name:text(unit?.name||"Unidade"),
      timezone,
      requested_by:user.id
    };

    const {data:previous}=await admin.from("whatsapp_booking_sessions").select("state,data").eq("tenant_id",tenantId).eq("phone",phone).maybeSingle();
    const {error:sessionError}=await admin.from("whatsapp_booking_sessions").upsert({
      tenant_id:tenantId,phone,state:"reschedule_pending",data:sessionData,updated_at:new Date().toISOString()
    },{onConflict:"phone,tenant_id"});
    if(sessionError)return NextResponse.json({error:"Não foi possível preparar a confirmação do cliente."},{status:500});

    const message=[
      "📅 *Proposta de novo horário*",
      "",
      "Olá, "+sessionData.client_name+". A *"+text(tenant?.name||"barbearia")+"* quer reagendar seu atendimento.",
      "",
      "✂️ *Serviço:* "+sessionData.service_name,
      "👤 *Profissional:* "+sessionData.barber_name,
      "📍 *Unidade:* "+sessionData.unit_name,
      "",
      "Horário atual: *"+oldDate+" às "+oldTime+"*",
      "Novo horário: *"+newDate+" às "+newTime+"*",
      "",
      "Seu horário atual continua reservado até você confirmar a alteração."
    ].join("\n");

    try{
      await sendEvolutionText(evolutionInstanceName(tenantId),phone,message);
      try{
        await sendEvolutionButtons(
          evolutionInstanceName(tenantId),
          phone,
          "Confirmar reagendamento",
          "Toque em uma opção abaixo:",
          ["Confirmar novo horário","Manter horário atual","Falar com atendente"]
        );
      }catch{
        await sendEvolutionText(evolutionInstanceName(tenantId),phone,"Responda *CONFIRMAR* para aceitar o novo horário ou *MANTER* para ficar com o horário atual.");
      }
      await admin.from("whatsapp_bot_logs").insert([
        {tenant_id:tenantId,phone,direction:"out",message},
        {tenant_id:tenantId,phone,direction:"out",message:"[BOTÕES] Confirmar novo horário | Manter horário atual | Falar com atendente"}
      ]);
      return NextResponse.json({ok:true,notified:true,pending:true,new_date:newDate,new_time:newTime});
    }catch(sendError){
      if(previous){
        await admin.from("whatsapp_booking_sessions").upsert({
          tenant_id:tenantId,phone,state:previous.state,data:previous.data||{},updated_at:new Date().toISOString()
        },{onConflict:"phone,tenant_id"});
      }else{
        await admin.from("whatsapp_booking_sessions").delete().eq("tenant_id",tenantId).eq("phone",phone);
      }
      console.error("WhatsApp reschedule proposal failed",sendError);
      return NextResponse.json({error:"Não consegui enviar a proposta pelo WhatsApp. O horário original foi mantido."},{status:502});
    }
  }catch(error){
    return NextResponse.json({error:error.message||"Não foi possível enviar a proposta de reagendamento."},{status:500});
  }
}
