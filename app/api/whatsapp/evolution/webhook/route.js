import {timingSafeEqual} from "node:crypto";
import {NextResponse} from "next/server";
import {getEvolutionWebhookSecret,normalizeEvolutionState,sendEvolutionPoll,sendEvolutionText,tenantIdFromEvolutionInstance} from "../../../../../lib/evolution";
import {whatsappAdmin} from "../../../../../lib/whatsapp-server";

const DEFAULT_TZ="America/Sao_Paulo";
const digits=v=>String(v||"").replace(/\D/g,"");
const clean=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const textLabel=v=>String(v||"").trim().replace(/\s+/g," ");
const brandLabel=v=>{const s=textLabel(v);return s&&s===s.toLowerCase()?s.charAt(0).toUpperCase()+s.slice(1):s};
const money=v=>(Number(v||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const formatPhone=v=>{
  let d=digits(v);
  if(d.startsWith("55")&&(d.length===12||d.length===13))d=d.slice(2);
  if(d.length===11)return "("+d.slice(0,2)+") "+d.slice(2,7)+"-"+d.slice(7);
  if(d.length===10)return "("+d.slice(0,2)+") "+d.slice(2,6)+"-"+d.slice(6);
  return d;
};
const fmtTime=(v,tz=DEFAULT_TZ)=>new Date(v).toLocaleTimeString("pt-BR",{timeZone:tz||DEFAULT_TZ,hour:"2-digit",minute:"2-digit"});
const fmtDate=(v,tz=DEFAULT_TZ)=>new Date(v).toLocaleDateString("pt-BR",{timeZone:tz||DEFAULT_TZ,day:"2-digit",month:"2-digit",year:"numeric"});

async function safeSecret(req){
  const expected=String(await getEvolutionWebhookSecret()||"");
  const got=String(new URL(req.url).searchParams.get("secret")||req.headers.get("x-barberflow-webhook")||"");
  if(!expected||!got||expected.length!==got.length)return false;
  return timingSafeEqual(Buffer.from(expected),Buffer.from(got));
}
function eventName(body){return String(body?.event||body?.type||"").replace(/[.\-]/g,"_").toUpperCase()}
function payloadData(body){return body?.data||body}
function extractKey(body){
  const d=payloadData(body),candidate=Array.isArray(d)?d[0]:d;
  return candidate?.key||candidate?.message?.key||candidate?.messages?.[0]?.key||{};
}
function extractMessage(body){
  const d=payloadData(body),candidate=Array.isArray(d)?d[0]:d;
  return candidate?.message||candidate?.messages?.[0]?.message||{};
}
function extractText(message){
  return String(
    message?.conversation||
    message?.extendedTextMessage?.text||
    message?.buttonsResponseMessage?.selectedDisplayText||
    message?.buttonsResponseMessage?.selectedButtonId||
    message?.listResponseMessage?.title||
    message?.listResponseMessage?.singleSelectReply?.selectedRowId||
    message?.templateButtonReplyMessage?.selectedDisplayText||
    ""
  ).trim();
}
function eventCandidate(body){
  const d=payloadData(body);
  return Array.isArray(d)?d[0]:d;
}
function extractPollSelection(body){
  const candidate=eventCandidate(body),updates=candidate?.pollUpdates||candidate?.message?.pollUpdates||[];
  const selected=(updates||[]).find(x=>Array.isArray(x?.voters)&&x.voters.length>0);
  return String(selected?.name||"").trim();
}
function localDate(offset=0,tz=DEFAULT_TZ){
  const d=new Date(new Date().toLocaleString("en-US",{timeZone:tz||DEFAULT_TZ}));
  d.setDate(d.getDate()+offset);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function parseDateText(text,tz=DEFAULT_TZ,{allowPast=false}={}){
  const t=clean(text);
  if(/\bhoje\b/.test(t))return localDate(0,tz);
  if(/\bamanha\b/.test(t))return localDate(1,tz);
  const m=t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if(!m)return "";
  const now=new Date(new Date().toLocaleString("en-US",{timeZone:tz||DEFAULT_TZ}));
  const y=m[3]?Number(m[3].length===2?"20"+m[3]:m[3]):now.getFullYear(),mo=Number(m[2]),day=Number(m[1]);
  const d=new Date(Date.UTC(y,mo-1,day));
  if(d.getUTCFullYear()!==y||d.getUTCMonth()!==mo-1||d.getUTCDate()!==day)return "";
  let out=y+"-"+String(mo).padStart(2,"0")+"-"+String(day).padStart(2,"0");
  if(!allowPast&&!m[3]&&out<localDate(0,tz)){
    y+=1;
    out=y+"-"+String(mo).padStart(2,"0")+"-"+String(day).padStart(2,"0");
  }
  return allowPast||out>=localDate(0,tz)?out:"";
}
function parseRequestedDate(text,tz=DEFAULT_TZ){return parseDateText(text,tz,{allowPast:false})}
function pick(items,text,label=x=>x.name){
  const raw=String(text).trim(),n=Number(raw);
  if(Number.isInteger(n)&&n>=1&&n<=items.length)return items[n-1];
  const numbers=raw.match(/\b\d+\b/g);
  if(numbers?.length===1){
    const option=Number(numbers[0]);
    if(Number.isInteger(option)&&option>=1&&option<=items.length)return items[option-1];
  }
  const t=clean(text);
  if(!t)return null;
  return items.find(x=>clean(label(x))===t)||
    items.find(x=>{const name=clean(label(x));return name.length>=3&&t.includes(name)})||
    items.find(x=>{const name=clean(label(x));return t.length>=3&&name.includes(t)});
}
function phoneKeys(value){
  const d=digits(value),out=new Set();
  if(!d)return out;
  out.add(d);
  if(d.startsWith("55")&&d.length>=12)out.add(d.slice(2));
  else if(d.length===10||d.length===11)out.add("55"+d);
  return out;
}
function samePhone(a,b){
  const aa=phoneKeys(a),bb=phoneKeys(b);
  for(const key of aa)if(bb.has(key))return true;
  return false;
}
function shiftDateKey(dateKey,offset){
  const [y,m,d]=String(dateKey).split("-").map(Number),value=new Date(Date.UTC(y,m-1,d+offset,12));
  return value.getUTCFullYear()+"-"+String(value.getUTCMonth()+1).padStart(2,"0")+"-"+String(value.getUTCDate()).padStart(2,"0");
}
function dateKeyForInstant(value,tz=DEFAULT_TZ){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:tz||DEFAULT_TZ,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(value));
  const values=Object.fromEntries(parts.filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  return values.year+"-"+values.month+"-"+values.day;
}
function statusLabel(value){
  const s=clean(value).replace(/\s+/g,"_");
  const labels={
    scheduled:"Agendado",
    booked:"Agendado",
    confirmed:"Confirmado",
    pending:"Pendente",
    completed:"Concluído",
    finished:"Concluído",
    cancelled:"Cancelado",
    canceled:"Cancelado",
    no_show:"Não compareceu"
  };
  return labels[s]||String(value||"Agendado");
}
function serviceOptions(services){
  return services.map((x,i)=>
    "*"+(i+1)+" — "+textLabel(x.name)+"*\n"+
    money(x.price_cents)+" · "+x.duration+" min"
  ).join("\n\n");
}
function professionalOptions(barbers){
  return barbers.map((x,i)=>"*"+(i+1)+" — "+textLabel(x.name)+"*").join("\n")+"\n*0 — Qualquer profissional disponível*";
}
function dateChoiceOptions(tz=DEFAULT_TZ){
  return Array.from({length:7},(_,i)=>{
    const key=localDate(i,tz),parts=key.split("-"),label=parts[2]+"/"+parts[1];
    if(i===0)return "Hoje · "+label;
    if(i===1)return "Amanhã · "+label;
    const weekday=new Date(key+"T12:00:00Z").toLocaleDateString("pt-BR",{timeZone:"UTC",weekday:"short"}).replace(".","");
    return weekday.charAt(0).toUpperCase()+weekday.slice(1)+" · "+label;
  });
}
function slotChoiceOptions(data){
  const slots=data?.slots||[],page=Math.max(0,Number(data?.slotPage||0)),pageSize=9,start=page*pageSize,tz=data?.unit?.timezone||DEFAULT_TZ;
  const options=slots.slice(start,start+pageSize).map(x=>
    fmtTime(x.starts_at,tz)+(data?.barberAny?" · "+textLabel(x.barber_name):"")
  );
  if(page>0)options.push("Horários anteriores");
  if(start+pageSize<slots.length)options.push("Mais horários");
  options.push("Falar com atendente");
  return options;
}
async function saveSession(db,tenant,phone,state,data){
  await db.from("whatsapp_booking_sessions").upsert({
    tenant_id:tenant,phone,state,data,updated_at:new Date().toISOString()
  },{onConflict:"phone,tenant_id"});
}
async function log(db,tenant,phone,direction,message){
  await db.from("whatsapp_bot_logs").insert({tenant_id:tenant,phone,direction,message:String(message||"").slice(0,4000)});
}
async function reply(db,tenant,instance,phone,text){
  await sendEvolutionText(instance,phone,text);
  await log(db,tenant,phone,"out",text);
}
async function replyChoice(db,tenant,instance,phone,question,options,fallbackText){
  const values=[...new Set((options||[]).map(textLabel).filter(Boolean))].slice(0,12);
  if(values.length>=2){
    try{
      await sendEvolutionPoll(instance,phone,question,values);
      await log(db,tenant,phone,"out","[OPÇÕES] "+question+" | "+values.join(" | "));
      return true;
    }catch{}
  }
  await reply(db,tenant,instance,phone,fallbackText);
  return false;
}
async function availableSlots(db,slug,unit,service,barbers,date){
  const rows=await Promise.all(barbers.map(async b=>{
    const {data,error}=await db.rpc("public_available_slots_multi",{
      p_slug:slug,p_unit:unit,p_barber:b.id,p_services:[service],p_date:date
    });
    if(error)return [];
    return (data||[]).map(x=>({starts_at:x?.starts_at||x?.start_at||x,barber_id:b.id,barber_name:textLabel(b.name)}));
  }));
  const seen=new Set(),anyProfessional=barbers.length>1;
  return rows.flat().filter(x=>x.starts_at).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)).filter(x=>{
    const k=anyProfessional?x.starts_at:x.starts_at+"|"+x.barber_id;
    if(seen.has(k))return false;
    seen.add(k);
    return true;
  }).slice(0,40);
}
async function findEmployee(db,tenantId,phone){
  const [{data:members},{data:professionals}]=await Promise.all([
    db.from("memberships").select("tenant_id,user_id,name,role,active,whatsapp").eq("tenant_id",tenantId).eq("active",true),
    db.from("professionals").select("id,barbershop_id,unit_id,user_id,name,phone,active").eq("barbershop_id",tenantId).eq("active",true)
  ]);
  const matches=new Map();
  for(const m of members||[]){
    if(!samePhone(m.whatsapp,phone))continue;
    matches.set("user:"+m.user_id,{user_id:m.user_id,name:m.name,role:m.role,unit_id:"",source:"membership"});
  }
  for(const p of professionals||[]){
    if(!samePhone(p.phone,phone))continue;
    const key=p.user_id?"user:"+p.user_id:"professional:"+p.id,previous=matches.get(key)||{};
    matches.set(key,{
      ...previous,
      user_id:p.user_id||previous.user_id||"",
      professional_id:p.id,
      name:p.name||previous.name||"",
      role:previous.role||"barber",
      unit_id:p.unit_id||previous.unit_id||"",
      source:previous.source?"membership+professional":"professional"
    });
  }
  if(!matches.size)return {matched:false};
  if(matches.size>1)return {matched:true,ambiguous:true};

  const employee=[...matches.values()][0];
  const {data:barbers}=await db.from("barbers").select("id,user_id,name,active").eq("tenant_id",tenantId).eq("active",true);
  const barber=(employee.user_id?(barbers||[]).find(x=>x.user_id===employee.user_id):null)||
    (employee.professional_id?(barbers||[]).find(x=>x.id===employee.professional_id):null);
  if(!barber)return {matched:true,unlinked:true,employee};

  let unitId=employee.unit_id||"";
  if(!unitId){
    const {data:links}=await db.from("barber_units").select("unit_id").eq("tenant_id",tenantId).eq("barber_id",barber.id).limit(1);
    unitId=links?.[0]?.unit_id||"";
  }
  let unit=null;
  if(unitId){
    const {data}=await db.from("units").select("id,name,timezone").eq("tenant_id",tenantId).eq("id",unitId).maybeSingle();
    unit=data||null;
  }
  return {matched:true,employee,barber,unit,timezone:unit?.timezone||DEFAULT_TZ};
}
async function employeeAppointments(db,tenantId,barberId,date,tz){
  const start=shiftDateKey(date,-1)+"T00:00:00.000Z",end=shiftDateKey(date,2)+"T00:00:00.000Z";
  const {data:appointments,error}=await db.from("appointments")
    .select("id,starts_at,status,client_id,service_id")
    .eq("tenant_id",tenantId)
    .eq("barber_id",barberId)
    .gte("starts_at",start)
    .lt("starts_at",end)
    .order("starts_at");
  if(error)throw error;
  const rows=(appointments||[]).filter(x=>dateKeyForInstant(x.starts_at,tz)===date);
  const clientIds=[...new Set(rows.map(x=>x.client_id).filter(Boolean))],serviceIds=[...new Set(rows.map(x=>x.service_id).filter(Boolean))];
  const [clientsResult,servicesResult]=await Promise.all([
    clientIds.length?db.from("clients").select("id,name").eq("tenant_id",tenantId).in("id",clientIds):Promise.resolve({data:[]}),
    serviceIds.length?db.from("services").select("id,name").eq("tenant_id",tenantId).in("id",serviceIds):Promise.resolve({data:[]})
  ]);
  const clients=new Map((clientsResult.data||[]).map(x=>[x.id,x.name])),services=new Map((servicesResult.data||[]).map(x=>[x.id,x.name]));
  return rows.map(x=>({...x,client_name:textLabel(clients.get(x.client_id)||"Cliente"),service_name:textLabel(services.get(x.service_id)||"Atendimento")}));
}
function employeeAgendaText(rows,date,tz){
  const label=new Date(date+"T12:00:00Z").toLocaleDateString("pt-BR",{timeZone:"UTC",day:"2-digit",month:"2-digit",year:"numeric"});
  if(!rows.length)return "📅 *Agenda · "+label+"*\n\nNenhum atendimento marcado para esse dia.\n\n_Use HOJE, AMANHÃ, AGENDA DD/MM ou PRÓXIMO CLIENTE._";
  const items=rows.map(x=>
    "*"+fmtTime(x.starts_at,tz)+" — "+x.client_name+"*\n"+
    x.service_name+" · "+statusLabel(x.status)
  ).join("\n\n");
  return "📅 *Agenda · "+label+"*\n\n"+items+"\n\n_"+rows.length+" atendimento"+(rows.length===1?"":"s")+" no dia._";
}
function nextClientText(rows,tz){
  const now=Date.now(),next=rows.find(x=>new Date(x.starts_at).getTime()>now&&!["cancelled","canceled","completed","finished"].includes(clean(x.status).replace(/\s+/g,"_")));
  if(!next)return "📅 *Próximo cliente*\n\nSua agenda de hoje não tem mais atendimentos pendentes.";
  return "📅 *Próximo cliente*\n\n"+
    "*"+fmtTime(next.starts_at,tz)+" — "+next.client_name+"*\n"+
    next.service_name+" · "+statusLabel(next.status);
}

export async function POST(req){
  if(!(await safeSecret(req)))return NextResponse.json({error:"Webhook não autorizado."},{status:401});
  let body;try{body=await req.json()}catch{return NextResponse.json({error:"JSON inválido."},{status:400})}
  const db=whatsappAdmin(),event=eventName(body),instance=String(body?.instance||body?.instanceName||body?.data?.instance||"");
  if(!instance)return NextResponse.json({ok:true,ignored:"missing_instance"});

  const tenantId=tenantIdFromEvolutionInstance(instance);
  if(!tenantId)return NextResponse.json({ok:true,ignored:"unknown_instance"});
  const {data:tenant}=await db.from("tenants")
    .select("id,name,slug,address,whatsapp,status")
    .eq("id",tenantId).maybeSingle();
  if(!tenant)return NextResponse.json({ok:true,ignored:"unknown_tenant"});
  const shopName=brandLabel(tenant.name)||"barbearia";

  if(event==="QRCODE_UPDATED")return NextResponse.json({ok:true,status:"connecting"});
  if(event==="CONNECTION_UPDATE")return NextResponse.json({ok:true,status:normalizeEvolutionState(payloadData(body))});
  if(!["MESSAGES_UPSERT","MESSAGES_UPDATE"].includes(event))return NextResponse.json({ok:true,ignored:event||"unknown_event"});
  if(!["active","trial","pending","overdue"].includes(tenant?.status))return NextResponse.json({ok:true,ignored:"tenant_inactive"});

  let key,message,jid,text,messageId;
  if(event==="MESSAGES_UPDATE"){
    const candidate=eventCandidate(body);
    text=extractPollSelection(body);
    if(!text)return NextResponse.json({ok:true,ignored:"non_poll_update"});
    jid=String(candidate?.remoteJid||candidate?.key?.remoteJid||"");
    messageId="poll:"+String(candidate?.keyId||candidate?.id||"")+":"+clean(text);
    key={remoteJid:jid,fromMe:false,id:messageId};
    message={};
  }else{
    key=extractKey(body);message=extractMessage(body);
    if(key?.fromMe)return NextResponse.json({ok:true,ignored:"from_me"});
    jid=String(key?.remoteJid||"");
    text=extractText(message);
    messageId=String(key?.id||"");
  }
  if(!jid||jid.includes("@g.us")||jid.includes("status@broadcast"))return NextResponse.json({ok:true,ignored:"non_direct"});
  const phone=digits(jid.split("@")[0]);
  if(!phone||!text)return NextResponse.json({ok:true,ignored:"empty"});

  const employee=await findEmployee(db,tenantId,phone);
  if(employee.matched){
    const {data:employeeSession}=await db.from("whatsapp_booking_sessions").select("state,data").eq("phone",phone).eq("tenant_id",tenantId).maybeSingle();
    if(messageId&&employeeSession?.state==="employee"&&employeeSession?.data?.last_message_id===messageId)return NextResponse.json({ok:true,duplicate:true,employee:true});
    await log(db,tenantId,phone,"in",text);
    await saveSession(db,tenantId,phone,"employee",{last_message_id:messageId||employeeSession?.data?.last_message_id||""});

    if(employee.ambiguous){
      await reply(db,tenantId,instance,phone,"👤 *Não consegui abrir sua agenda*\n\nEste WhatsApp aparece em mais de um cadastro ativo. Revise os números na área *Equipe* e tente novamente.");
      return NextResponse.json({ok:true,employee:true,ambiguous:true});
    }
    if(employee.unlinked){
      await reply(db,tenantId,instance,phone,"👤 *Seu número foi reconhecido*\n\nFalta apenas vincular seu usuário a uma agenda ativa. Faça o ajuste em *Equipe* para consultar seus horários pelo WhatsApp.");
      return NextResponse.json({ok:true,employee:true,unlinked:true});
    }

    const tz=employee.timezone||DEFAULT_TZ,t=clean(text),isNext=/^(proximo cliente|proximo|próximo cliente|próximo)$/.test(String(text).toLowerCase().trim())||/\bproximo cliente\b/.test(t);
    const date=isNext?localDate(0,tz):(parseDateText(text,tz,{allowPast:true})||localDate(0,tz));
    try{
      const rows=await employeeAppointments(db,tenantId,employee.barber.id,date,tz);
      const response=isNext?nextClientText(rows,tz):employeeAgendaText(rows,date,tz);
      await reply(db,tenantId,instance,phone,response);
      return NextResponse.json({ok:true,employee:true,barber_id:employee.barber.id,date});
    }catch{
      await reply(db,tenantId,instance,phone,"Não consegui carregar sua agenda agora. Tente novamente daqui a pouco.");
      return NextResponse.json({ok:true,employee:true,agenda_error:true});
    }
  }

  const {data:session}=await db.from("whatsapp_booking_sessions").select("*").eq("phone",phone).eq("tenant_id",tenantId).maybeSingle();
  if(messageId&&session?.data?.last_message_id===messageId)return NextResponse.json({ok:true,duplicate:true});

  await log(db,tenantId,phone,"in",text);
  let state=session?.state==="employee"?"start":(session?.state||"start");
  let d=session?.state==="employee"?{last_message_id:messageId||""}:{...(session?.data||{}),last_message_id:messageId||session?.data?.last_message_id||""};
  const t=clean(text),origin=new URL(req.url).origin;

  const wantsCancelOrReschedule=/\b(cancelar|cancelamento|desmarcar|remarcar|remarcacao)\b/.test(t);
  const wantsHuman=wantsCancelOrReschedule||/\b(atendente|humano|pessoa|recepcao|falar com alguem)\b/.test(t);
  const asksAvailability=/\b(horario|horarios|agenda|disponibilidade|disponivel|disponiveis|vaga|vagas)\b/.test(t);
  const reset=/^(oi|ola|menu|inicio|comecar|recomecar|bom dia|boa tarde|boa noite)$/.test(t);
  const resume=/^(bot|robo|voltar ao bot|voltar|menu)$/.test(t);

  if(wantsHuman){
    state="human";await saveSession(db,tenantId,phone,state,d);
    const contact=formatPhone(tenant?.whatsapp);
    const reason=wantsCancelOrReschedule?"Para alterar ou cancelar um horário, nossa equipe continua com você por aqui.":"Nossa equipe continua o atendimento com você a partir daqui.";
    await reply(db,tenantId,instance,phone,"👤 *Atendimento humano*\n\n"+reason+(contact?"\n\n📲 "+contact:"")+"\n\n_Para voltar ao agendamento automático, envie *MENU*._");
    return NextResponse.json({ok:true,handoff:true});
  }
  if(state==="human"&&!resume){
    await saveSession(db,tenantId,phone,state,d);
    return NextResponse.json({ok:true,handoff:true});
  }
  if(reset||resume){state="start";d={last_message_id:d.last_message_id}}

  if(/\b(endereco|localizacao|onde fica)\b/.test(t)&&tenant?.address){
    await saveSession(db,tenantId,phone,state,d);
    await reply(db,tenantId,instance,phone,"📍 *Onde estamos*\n\n"+tenant.address+"\n\n_Para fazer um agendamento, envie *MENU*._");
    return NextResponse.json({ok:true});
  }
  if(/\b(site|link|agenda online|agendamento online)\b/.test(t)){
    await saveSession(db,tenantId,phone,state,d);
    await reply(db,tenantId,instance,phone,"📲 *Prefere agendar pelo site?*\n\n"+origin+"/agendar/"+tenant.slug+"\n\n_O link abre direto na agenda da "+shopName+"._");
    return NextResponse.json({ok:true});
  }

  if(state==="start"){
    const [{data:units},{data:services}]=await Promise.all([
      db.from("units").select("id,name,timezone").eq("tenant_id",tenantId).eq("active",true).order("name"),
      db.from("services").select("id,name,description,duration,price_cents").eq("tenant_id",tenantId).eq("active",true).order("name")
    ]);
    if(!units?.length||!services?.length){
      await saveSession(db,tenantId,phone,"start",d);
      await reply(db,tenantId,instance,phone,"*Agenda temporariamente indisponível*\n\nAinda não há serviços ou unidades configurados para agendamento pelo WhatsApp. Fale com nossa equipe para continuar.");
      return NextResponse.json({ok:true});
    }
    d={last_message_id:d.last_message_id,units,services};
    if(units.length>1){
      state="unit";await saveSession(db,tenantId,phone,state,d);
      const unitFallback=
        "👋 *Olá! Bem-vindo à "+shopName+".*\n"+
        "Vou te ajudar a reservar seu horário.\n\n"+
        "📍 *Escolha a unidade*\n\n"+
        units.map((x,i)=>"*"+(i+1)+" — "+x.name+"*").join("\n")+
        "\n\n_Envie o número ou nome da unidade._";
      const unitChoices=units.slice(0,10).map(x=>textLabel(x.name));
      if(units.length>10)unitChoices.push("Mais opções");
      unitChoices.push("Falar com atendente");
      await replyChoice(db,tenantId,instance,phone,"📍 Escolha a unidade",unitChoices,unitFallback);
    }else{
      d.unit=units[0];state="service";await saveSession(db,tenantId,phone,state,d);
      const serviceFallback=
        "👋 *Olá! Bem-vindo à "+shopName+".*\n"+
        "Vou te ajudar a reservar seu horário.\n\n"+
        "✂️ *Qual serviço você deseja?*\n\n"+
        serviceOptions(services)+
        "\n\n_Envie o número ou o nome do serviço._";
      const serviceChoices=services.slice(0,10).map(x=>textLabel(x.name)+" · "+money(x.price_cents)+" · "+x.duration+" min");
      if(services.length>10)serviceChoices.push("Mais opções");
      serviceChoices.push("Falar com atendente");
      await replyChoice(db,tenantId,instance,phone,"✂️ Qual serviço você deseja?",serviceChoices,serviceFallback);
    }
    return NextResponse.json({ok:true,state});
  }

  if(state==="unit"){
    const unit=pick(d.units||[],text);
    if(!unit){
      await saveSession(db,tenantId,phone,state,d);
      const unitFallback=
        "Não consegui identificar a unidade.\n\n📍 *Escolha uma opção*\n\n"+
        (d.units||[]).map((x,i)=>"*"+(i+1)+" — "+textLabel(x.name)+"*").join("\n")+
        "\n\n_Envie o número ou nome da unidade._";
      const unitChoices=(d.units||[]).slice(0,10).map(x=>textLabel(x.name));
      if((d.units||[]).length>10)unitChoices.push("Mais opções");
      unitChoices.push("Falar com atendente");
      await replyChoice(db,tenantId,instance,phone,"📍 Escolha a unidade",unitChoices,unitFallback);
      return NextResponse.json({ok:true});
    }
    d.unit=unit;state="service";await saveSession(db,tenantId,phone,state,d);
    const serviceChoices=(d.services||[]).slice(0,10).map(x=>textLabel(x.name)+" · "+money(x.price_cents)+" · "+x.duration+" min");
    if((d.services||[]).length>10)serviceChoices.push("Mais opções");
    serviceChoices.push("Falar com atendente");
    await replyChoice(
      db,tenantId,instance,phone,"✂️ Qual serviço você deseja?",serviceChoices,
      "✂️ *Qual serviço você deseja?*\n\n"+serviceOptions(d.services||[])+"\n\n_Envie o número ou o nome do serviço._"
    );
    return NextResponse.json({ok:true,state});
  }

  if(state==="service"){
    const service=pick(d.services||[],text);
    if(!service){
      await saveSession(db,tenantId,phone,state,d);
      const intro=asksAvailability?"Para consultar os horários, primeiro preciso saber qual serviço você quer.":"Não consegui identificar o serviço na sua mensagem.";
      const serviceChoices=(d.services||[]).slice(0,10).map(x=>textLabel(x.name)+" · "+money(x.price_cents)+" · "+x.duration+" min");
      if((d.services||[]).length>10)serviceChoices.push("Mais opções");
      serviceChoices.push("Falar com atendente");
      await replyChoice(
        db,tenantId,instance,phone,
        asksAvailability?"✂️ Escolha um serviço para ver os horários":"✂️ Escolha um serviço",
        serviceChoices,
        intro+"\n\n✂️ *Escolha um serviço*\n\n"+serviceOptions(d.services||[])+"\n\n_Envie o número ou escreva o nome do serviço._"
      );
      return NextResponse.json({ok:true});
    }
    const [{data:bu},{data:bs}]=await Promise.all([
      db.from("barber_units").select("barber_id,barbers(id,name,active)").eq("tenant_id",tenantId).eq("unit_id",d.unit.id),
      db.from("barber_services").select("barber_id").eq("tenant_id",tenantId).eq("service_id",service.id)
    ]);
    const qualified=new Set((bs||[]).map(x=>x.barber_id));
    const barbers=(bu||[]).map(x=>x.barbers).filter(x=>x?.active&&qualified.has(x.id));
    if(!barbers.length){
      await saveSession(db,tenantId,phone,state,d);
      await reply(db,tenantId,instance,phone,"👤 *Nenhum profissional disponível agora*\n\nEsse serviço não tem profissionais disponíveis nesta unidade no momento.\n\n_Envie *MENU* para escolher outra opção._");
      return NextResponse.json({ok:true});
    }
    d={...d,service,barbers};state="barber";await saveSession(db,tenantId,phone,state,d);
    const barberChoices=["Qualquer profissional disponível",...barbers.slice(0,9).map(x=>textLabel(x.name))];
    if(barbers.length>9)barberChoices.push("Mais opções");
    barberChoices.push("Falar com atendente");
    await replyChoice(
      db,tenantId,instance,phone,"👤 Com quem você quer agendar?",barberChoices,
      "👤 *Com quem você quer agendar?*\n\n"+professionalOptions(barbers)+"\n\n_Envie o número ou nome do profissional._"
    );
    return NextResponse.json({ok:true,state});
  }

  if(state==="barber"){
    const any=/^0$/.test(String(text).trim())||/\b(qualquer|sem preferencia|primeiro disponivel)\b/.test(t);
    const barber=any?null:pick(d.barbers||[],text);
    if(!any&&!barber){
      await saveSession(db,tenantId,phone,state,d);
      const intro=asksAvailability?"Antes de mostrar os horários, escolha o profissional.":"Não consegui identificar o profissional.";
      const barberChoices=["Qualquer profissional disponível",...(d.barbers||[]).slice(0,9).map(x=>textLabel(x.name))];
      if((d.barbers||[]).length>9)barberChoices.push("Mais opções");
      barberChoices.push("Falar com atendente");
      await replyChoice(
        db,tenantId,instance,phone,"👤 Escolha o profissional",barberChoices,
        intro+"\n\n👤 *Escolha uma opção*\n\n"+professionalOptions(d.barbers||[])+"\n\n_Envie o número ou nome do profissional._"
      );
      return NextResponse.json({ok:true});
    }
    d={...d,barber,barberAny:any};state="date";await saveSession(db,tenantId,phone,state,d);
    const dateChoices=[...dateChoiceOptions(d.unit?.timezone||DEFAULT_TZ),"Falar com atendente"];
    await replyChoice(
      db,tenantId,instance,phone,"📅 Escolha a data",dateChoices,
      "📅 *Escolha a data*\n\nEnvie *HOJE*, *AMANHÃ* ou uma data como *25/09*."
    );
    return NextResponse.json({ok:true,state});
  }

  if(state==="date"){
    const date=parseRequestedDate(text,d.unit?.timezone||DEFAULT_TZ);
    if(!date){
      await saveSession(db,tenantId,phone,state,d);
      await replyChoice(
        db,tenantId,instance,phone,"📅 Escolha a data",
        [...dateChoiceOptions(d.unit?.timezone||DEFAULT_TZ),"Falar com atendente"],
        "*Não entendi essa data.*\n\nEnvie *HOJE*, *AMANHÃ* ou use o formato *DD/MM*."
      );
      return NextResponse.json({ok:true});
    }
    const barbers=d.barberAny?(d.barbers||[]):[d.barber].filter(Boolean);
    const slots=await availableSlots(db,tenant.slug,d.unit.id,d.service.id,barbers,date);
    if(!slots.length){
      await saveSession(db,tenantId,phone,state,d);
      await replyChoice(
        db,tenantId,instance,phone,"⏰ Sem horários nesse dia. Escolha outra data",
        [...dateChoiceOptions(d.unit?.timezone||DEFAULT_TZ),"Falar com atendente"],
        "⏰ *Essa data está sem horários*\n\nEscolha outro dia e eu verifico a agenda para você.\n\n_Envie *AMANHÃ* ou uma nova data no formato *DD/MM*._"
      );
      return NextResponse.json({ok:true});
    }
    d={...d,date,slots,slotPage:0};state="slot";await saveSession(db,tenantId,phone,state,d);
    await replyChoice(
      db,tenantId,instance,phone,
      "⏰ Horários disponíveis · "+date.split("-").reverse().join("/"),
      slotChoiceOptions(d),
      "⏰ *Horários disponíveis · "+date.split("-").reverse().join("/")+"*\n\n"+
      slots.map((x,i)=>"*"+(i+1)+" — "+fmtTime(x.starts_at,d.unit?.timezone||DEFAULT_TZ)+"*"+(d.barberAny?" · "+x.barber_name:"")).join("\n")+
      "\n\n_Envie o número do horário que prefere._"
    );
    return NextResponse.json({ok:true,state});
  }

  if(state==="slot"){
    if(/\bmais horarios\b/.test(t)){
      const maxPage=Math.max(0,Math.ceil((d.slots||[]).length/9)-1);
      d={...d,slotPage:Math.min(maxPage,Number(d.slotPage||0)+1)};
      await saveSession(db,tenantId,phone,state,d);
      await replyChoice(
        db,tenantId,instance,phone,
        "⏰ Mais horários · "+String(d.date||"").split("-").reverse().join("/"),
        slotChoiceOptions(d),
        "Envie o horário que prefere ou *MENU* para recomeçar."
      );
      return NextResponse.json({ok:true,state,page:d.slotPage});
    }
    if(/\bhorarios anteriores\b/.test(t)){
      d={...d,slotPage:Math.max(0,Number(d.slotPage||0)-1)};
      await saveSession(db,tenantId,phone,state,d);
      await replyChoice(
        db,tenantId,instance,phone,
        "⏰ Horários anteriores · "+String(d.date||"").split("-").reverse().join("/"),
        slotChoiceOptions(d),
        "Envie o horário que prefere ou *MENU* para recomeçar."
      );
      return NextResponse.json({ok:true,state,page:d.slotPage});
    }
    let slot=pick(d.slots||[],text,x=>fmtTime(x.starts_at,d.unit?.timezone||DEFAULT_TZ));
    if(!slot){
      const hm=t.match(/\b(\d{1,2})(?::|h)(\d{2})?\b/);
      if(hm){
        const wanted=String(Number(hm[1])).padStart(2,"0")+":"+String(Number(hm[2]||0)).padStart(2,"0");
        slot=(d.slots||[]).find(x=>fmtTime(x.starts_at,d.unit?.timezone||DEFAULT_TZ)===wanted);
      }
    }
    if(!slot){
      await saveSession(db,tenantId,phone,state,d);
      await replyChoice(
        db,tenantId,instance,phone,
        "⏰ Escolha um dos horários disponíveis",
        slotChoiceOptions(d),
        "*Esse horário não está mais disponível.*\n\nEscolha um dos horários disponíveis."
      );
      return NextResponse.json({ok:true});
    }
    d={...d,slot};state="name";await saveSession(db,tenantId,phone,state,d);
    await reply(db,tenantId,instance,phone,"*Quase lá.*\n\n👤 Qual nome devo colocar no agendamento?");
    return NextResponse.json({ok:true,state});
  }

  if(state==="name"){
    const name=String(text).trim().replace(/\s+/g," ").slice(0,80);
    if(name.length<2){
      await saveSession(db,tenantId,phone,state,d);
      await reply(db,tenantId,instance,phone,"Digite seu nome para eu continuar com a reserva.");
      return NextResponse.json({ok:true});
    }
    d={...d,customerName:name};state="confirm";await saveSession(db,tenantId,phone,state,d);
    const confirmText=
      "✅ *Revise antes de confirmar*\n\n"+
      "*"+textLabel(d.service.name)+"*\n"+
      textLabel(d.slot.barber_name)+" · "+textLabel(d.unit.name)+"\n"+
      fmtDate(d.slot.starts_at,d.unit?.timezone||DEFAULT_TZ)+" às "+fmtTime(d.slot.starts_at,d.unit?.timezone||DEFAULT_TZ)+"\n"+
      "*"+money(d.service.price_cents)+"*\n\n"+
      "Está tudo certo?";
    await reply(db,tenantId,instance,phone,confirmText);
    await replyChoice(
      db,tenantId,instance,phone,"✅ Confirmar agendamento",
      ["Confirmar","Voltar","Falar com atendente"],
      "Responda *SIM* para confirmar ou *NÃO* para voltar."
    );
    return NextResponse.json({ok:true,state});
  }

  if(state==="confirm"){
    const confirmNo=/^(nao|n)\b/.test(t)||/\b(voltar|desistir)\b/.test(t);
    const confirmYes=/^(sim|s|ok|beleza)\b/.test(t)||/\b(confirmo|confirmar|pode confirmar)\b/.test(t);
    if(confirmNo){
      d={last_message_id:d.last_message_id};state="start";await saveSession(db,tenantId,phone,state,d);
      await reply(db,tenantId,instance,phone,"Sem problema. Nenhum agendamento foi criado.\n\n_Envie *MENU* quando quiser começar de novo._");
      return NextResponse.json({ok:true,state});
    }
    if(!confirmYes){
      await saveSession(db,tenantId,phone,state,d);
      await replyChoice(
        db,tenantId,instance,phone,"✅ Confirmar agendamento",
        ["Confirmar","Voltar","Falar com atendente"],
        "Responda *SIM* para confirmar ou *NÃO* para voltar."
      );
      return NextResponse.json({ok:true});
    }
    const {data:confirmation,error}=await db.rpc("public_book_multi",{
      p_slug:tenant.slug,p_unit:d.unit.id,p_barber:d.slot.barber_id,p_services:[d.service.id],
      p_starts_at:d.slot.starts_at,p_name:textLabel(d.customerName),p_phone:phone,p_email:""
    });
    if(error){
      state="date";d={...d,slots:[],slot:null};await saveSession(db,tenantId,phone,state,d);
      await reply(db,tenantId,instance,phone,"⏰ *Esse horário acabou de ser reservado*\n\nEnvie outra data e eu mostro as próximas opções disponíveis.");
      return NextResponse.json({ok:true,booking:false});
    }
    await saveSession(db,tenantId,phone,"start",{last_message_id:d.last_message_id});
    await reply(db,tenantId,instance,phone,
      "🎉 *Seu horário está confirmado*\n\n"+
      "*"+textLabel(d.service.name)+"* com "+textLabel(d.slot.barber_name)+"\n"+
      fmtDate(d.slot.starts_at,d.unit?.timezone||DEFAULT_TZ)+" · "+fmtTime(d.slot.starts_at,d.unit?.timezone||DEFAULT_TZ)+"\n"+
      textLabel(d.unit.name)+"\n"+
      "*"+money(d.service.price_cents)+"*\n\n"+
      "Até breve, "+textLabel(d.customerName)+"."
    );
    return NextResponse.json({ok:true,booking:true,confirmation});
  }

  await saveSession(db,tenantId,phone,"start",{last_message_id:d.last_message_id});
  await reply(db,tenantId,instance,phone,"Para começar um agendamento, envie *MENU*.");
  return NextResponse.json({ok:true,state:"start"});
}
