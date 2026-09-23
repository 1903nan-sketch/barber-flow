import {timingSafeEqual} from "node:crypto";
import {NextResponse} from "next/server";
import {normalizeEvolutionState,sendEvolutionText,tenantIdFromEvolutionInstance} from "../../../../../lib/evolution";
import {whatsappAdmin} from "../../../../../lib/whatsapp-server";

const TZ="America/Sao_Paulo";
const digits=v=>String(v||"").replace(/\D/g,"");
const clean=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const money=v=>(Number(v||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const fmtTime=v=>new Date(v).toLocaleTimeString("pt-BR",{timeZone:TZ,hour:"2-digit",minute:"2-digit"});
const fmtDate=v=>new Date(v).toLocaleDateString("pt-BR",{timeZone:TZ,day:"2-digit",month:"2-digit",year:"numeric"});

function safeSecret(req){
  const expected=String(process.env.EVOLUTION_WEBHOOK_SECRET||"");
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
function localDate(offset=0){
  const d=new Date(new Date().toLocaleString("en-US",{timeZone:TZ}));
  d.setDate(d.getDate()+offset);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function parseRequestedDate(text){
  const t=clean(text);
  if(/\bhoje\b/.test(t))return localDate(0);
  if(/\bamanha\b/.test(t))return localDate(1);
  const m=t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if(!m)return "";
  const now=new Date(new Date().toLocaleString("en-US",{timeZone:TZ}));
  let y=m[3]?Number(m[3].length===2?"20"+m[3]:m[3]):now.getFullYear(),mo=Number(m[2]),day=Number(m[1]);
  const d=new Date(Date.UTC(y,mo-1,day));
  if(d.getUTCFullYear()!==y||d.getUTCMonth()!==mo-1||d.getUTCDate()!==day)return "";
  const out=y+"-"+String(mo).padStart(2,"0")+"-"+String(day).padStart(2,"0");
  return out>=localDate(0)?out:"";
}
function pick(items,text,label=x=>x.name){
  const n=Number(String(text).trim());
  if(Number.isInteger(n)&&n>=1&&n<=items.length)return items[n-1];
  const t=clean(text);
  return items.find(x=>clean(label(x))===t)||items.find(x=>clean(label(x)).includes(t)&&t.length>=3);
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
async function availableSlots(db,slug,unit,service,barbers,date){
  const rows=await Promise.all(barbers.map(async b=>{
    const {data,error}=await db.rpc("public_available_slots_multi",{
      p_slug:slug,p_unit:unit,p_barber:b.id,p_services:[service],p_date:date
    });
    if(error)return [];
    return (data||[]).map(x=>({starts_at:x?.starts_at||x?.start_at||x,barber_id:b.id,barber_name:b.name}));
  }));
  const seen=new Set();
  return rows.flat().filter(x=>x.starts_at).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)).filter(x=>{
    const k=x.starts_at+"|"+x.barber_id;if(seen.has(k))return false;seen.add(k);return true;
  }).slice(0,12);
}
export async function POST(req){
  if(!safeSecret(req))return NextResponse.json({error:"Webhook não autorizado."},{status:401});
  let body;try{body=await req.json()}catch{return NextResponse.json({error:"JSON inválido."},{status:400})}
  const db=whatsappAdmin(),event=eventName(body),instance=String(body?.instance||body?.instanceName||body?.data?.instance||"");
  if(!instance)return NextResponse.json({ok:true,ignored:"missing_instance"});

  const tenantId=tenantIdFromEvolutionInstance(instance);
  if(!tenantId)return NextResponse.json({ok:true,ignored:"unknown_instance"});
  const {data:tenant}=await db.from("tenants")
    .select("id,name,slug,address,whatsapp,status")
    .eq("id",tenantId).maybeSingle();
  if(!tenant)return NextResponse.json({ok:true,ignored:"unknown_tenant"});

  if(event==="QRCODE_UPDATED"){
    return NextResponse.json({ok:true,status:"connecting"});
  }

  if(event==="CONNECTION_UPDATE"){
    const status=normalizeEvolutionState(payloadData(body));
    return NextResponse.json({ok:true,status});
  }

  if(event!=="MESSAGES_UPSERT")return NextResponse.json({ok:true,ignored:event||"unknown_event"});
  if(!["active","trial","pending","overdue"].includes(tenant?.status))return NextResponse.json({ok:true,ignored:"tenant_inactive"});

  const key=extractKey(body),message=extractMessage(body);
  if(key?.fromMe)return NextResponse.json({ok:true,ignored:"from_me"});
  const jid=String(key?.remoteJid||"");
  if(!jid||jid.includes("@g.us")||jid.includes("status@broadcast"))return NextResponse.json({ok:true,ignored:"non_direct"});
  const phone=digits(jid.split("@")[0]),text=extractText(message),messageId=String(key?.id||"");
  if(!phone||!text)return NextResponse.json({ok:true,ignored:"empty"});
  const {data:session}=await db.from("whatsapp_booking_sessions").select("*").eq("phone",phone).eq("tenant_id",tenantId).maybeSingle();
  if(messageId&&session?.data?.last_message_id===messageId)return NextResponse.json({ok:true,duplicate:true});

  await log(db,tenantId,phone,"in",text);
  let state=session?.state||"start",d={...(session?.data||{}),last_message_id:messageId||session?.data?.last_message_id||""};
  const t=clean(text),origin=new URL(req.url).origin;

  const wantsHuman=/\b(atendente|humano|pessoa|recepcao|falar com alguem|cancelar|cancelamento|desmarcar|remarcar)\b/.test(t);
  const reset=/^(oi|ola|menu|inicio|comecar|recomecar)$/.test(t);
  const resume=/^(bot|robo|voltar ao bot|voltar|menu)$/.test(t);

  if(wantsHuman){
    state="human";await saveSession(db,tenantId,phone,state,d);
    const contact=digits(tenant?.whatsapp);
    await reply(db,tenantId,instance,phone,"Certo. A automação foi pausada para atendimento humano."+ (contact?"\n\nWhatsApp da barbearia: +"+contact:"") +"\n\nPara voltar ao robô, envie MENU.");
    return NextResponse.json({ok:true,handoff:true});
  }
  if(state==="human"&&!resume){
    await saveSession(db,tenantId,phone,state,d);
    return NextResponse.json({ok:true,handoff:true});
  }
  if(reset||resume){state="start";d={last_message_id:d.last_message_id}}

  if(/\b(endereco|localizacao|onde fica)\b/.test(t)&&tenant?.address){
    await saveSession(db,tenantId,phone,state,d);
    await reply(db,tenantId,instance,phone,"Nosso endereço: "+tenant.address+"\n\nPara agendar, envie MENU.");
    return NextResponse.json({ok:true});
  }
  if(/\b(site|link|agenda online)\b/.test(t)){
    await saveSession(db,tenantId,phone,state,d);
    await reply(db,tenantId,instance,phone,"Você também pode agendar pelo site:\n"+origin+"/agendar/"+tenant.slug);
    return NextResponse.json({ok:true});
  }

  if(state==="start"){
    const [{data:units},{data:services}]=await Promise.all([
      db.from("units").select("id,name,timezone").eq("tenant_id",tenantId).eq("active",true).order("name"),
      db.from("services").select("id,name,description,duration,price_cents").eq("tenant_id",tenantId).eq("active",true).order("name")
    ]);
    if(!units?.length||!services?.length){
      await saveSession(db,tenantId,phone,"start",d);
      await reply(db,tenantId,instance,phone,"A agenda ainda não está pronta para receber agendamentos pelo WhatsApp. Fale com a barbearia.");
      return NextResponse.json({ok:true});
    }
    d={last_message_id:d.last_message_id,units,services};
    if(units.length>1){
      state="unit";await saveSession(db,tenantId,phone,state,d);
      await reply(db,tenantId,instance,phone,"Olá! Sou o assistente de agendamento da "+tenant.name+".\n\nEscolha a unidade:\n"+units.map((x,i)=>(i+1)+". "+x.name).join("\n"));
    }else{
      d.unit=units[0];state="service";await saveSession(db,tenantId,phone,state,d);
      await reply(db,tenantId,instance,phone,"Olá! Sou o assistente de agendamento da "+tenant.name+".\n\nEscolha o serviço:\n"+services.map((x,i)=>(i+1)+". "+x.name+" — "+money(x.price_cents)+" · "+x.duration+" min").join("\n"));
    }
    return NextResponse.json({ok:true,state});
  }

  if(state==="unit"){
    const unit=pick(d.units||[],text);
    if(!unit){await saveSession(db,tenantId,phone,state,d);await reply(db,tenantId,instance,phone,"Não reconheci essa unidade. Digite o número da opção.");return NextResponse.json({ok:true})}
    d.unit=unit;state="service";await saveSession(db,tenantId,phone,state,d);
    await reply(db,tenantId,instance,phone,"Escolha o serviço:\n"+(d.services||[]).map((x,i)=>(i+1)+". "+x.name+" — "+money(x.price_cents)+" · "+x.duration+" min").join("\n"));
    return NextResponse.json({ok:true,state});
  }

  if(state==="service"){
    const service=pick(d.services||[],text);
    if(!service){await saveSession(db,tenantId,phone,state,d);await reply(db,tenantId,instance,phone,"Não reconheci esse serviço. Digite o número ou o nome do serviço.");return NextResponse.json({ok:true})}
    const [{data:bu},{data:bs}]=await Promise.all([
      db.from("barber_units").select("barber_id,barbers(id,name,active)").eq("tenant_id",tenantId).eq("unit_id",d.unit.id),
      db.from("barber_services").select("barber_id").eq("tenant_id",tenantId).eq("service_id",service.id)
    ]);
    const qualified=new Set((bs||[]).map(x=>x.barber_id));
    const barbers=(bu||[]).map(x=>x.barbers).filter(x=>x?.active&&qualified.has(x.id));
    if(!barbers.length){await saveSession(db,tenantId,phone,state,d);await reply(db,tenantId,instance,phone,"Nenhum profissional está disponível para esse serviço no momento. Envie MENU para escolher novamente.");return NextResponse.json({ok:true})}
    d={...d,service,barbers};state="barber";await saveSession(db,tenantId,phone,state,d);
    await reply(db,tenantId,instance,phone,"Escolha o profissional:\n"+barbers.map((x,i)=>(i+1)+". "+x.name).join("\n")+"\n0. Qualquer profissional disponível");
    return NextResponse.json({ok:true,state});
  }

  if(state==="barber"){
    const any=/^(0|qualquer|qualquer um|sem preferencia|primeiro disponivel)$/.test(t);
    const barber=any?null:pick(d.barbers||[],text);
    if(!any&&!barber){await saveSession(db,tenantId,phone,state,d);await reply(db,tenantId,instance,phone,"Não reconheci o profissional. Digite o número, o nome ou 0 para qualquer disponível.");return NextResponse.json({ok:true})}
    d={...d,barber,barberAny:any};state="date";await saveSession(db,tenantId,phone,state,d);
    await reply(db,tenantId,instance,phone,"Qual dia você prefere?\n\nPode escrever HOJE, AMANHÃ ou uma data como 25/09.");
    return NextResponse.json({ok:true,state});
  }

  if(state==="date"){
    const date=parseRequestedDate(text);
    if(!date){await saveSession(db,tenantId,phone,state,d);await reply(db,tenantId,instance,phone,"Não entendi a data. Envie HOJE, AMANHÃ ou no formato DD/MM.");return NextResponse.json({ok:true})}
    const barbers=d.barberAny?(d.barbers||[]):[d.barber].filter(Boolean);
    const slots=await availableSlots(db,tenant.slug,d.unit.id,d.service.id,barbers,date);
    if(!slots.length){await saveSession(db,tenantId,phone,state,d);await reply(db,tenantId,instance,phone,"Não encontrei horários disponíveis nessa data. Envie outra data.");return NextResponse.json({ok:true})}
    d={...d,date,slots};state="slot";await saveSession(db,tenantId,phone,state,d);
    await reply(db,tenantId,instance,phone,"Horários disponíveis em "+date.split("-").reverse().join("/") +":\n"+slots.map((x,i)=>(i+1)+". "+fmtTime(x.starts_at)+(d.barberAny?" — "+x.barber_name:"")).join("\n")+"\n\nDigite o número do horário.");
    return NextResponse.json({ok:true,state});
  }

  if(state==="slot"){
    let slot=pick(d.slots||[],text,x=>fmtTime(x.starts_at));
    if(!slot){
      const hm=t.match(/\b(\d{1,2})(?::|h)(\d{2})?\b/);
      if(hm){const wanted=String(Number(hm[1])).padStart(2,"0")+":"+String(Number(hm[2]||0)).padStart(2,"0");slot=(d.slots||[]).find(x=>fmtTime(x.starts_at)===wanted)}
    }
    if(!slot){await saveSession(db,tenantId,phone,state,d);await reply(db,tenantId,instance,phone,"Esse horário não está na lista. Digite o número de uma opção disponível.");return NextResponse.json({ok:true})}
    d={...d,slot};state="name";await saveSession(db,tenantId,phone,state,d);
    await reply(db,tenantId,instance,phone,"Perfeito. Qual é o seu nome?");
    return NextResponse.json({ok:true,state});
  }

  if(state==="name"){
    const name=String(text).trim().replace(/\s+/g," ").slice(0,80);
    if(name.length<2){await saveSession(db,tenantId,phone,state,d);await reply(db,tenantId,instance,phone,"Digite seu nome para eu concluir o agendamento.");return NextResponse.json({ok:true})}
    d={...d,customerName:name};state="confirm";await saveSession(db,tenantId,phone,state,d);
    await reply(db,tenantId,instance,phone,
      "Confira seu agendamento:\n\n"+
      "Serviço: "+d.service.name+"\n"+
      "Profissional: "+d.slot.barber_name+"\n"+
      "Data: "+fmtDate(d.slot.starts_at)+"\n"+
      "Horário: "+fmtTime(d.slot.starts_at)+"\n"+
      "Valor: "+money(d.service.price_cents)+"\n"+
      "Unidade: "+d.unit.name+"\n\n"+
      "Posso confirmar? Responda SIM ou NÃO."
    );
    return NextResponse.json({ok:true,state});
  }

  if(state==="confirm"){
    if(/^(nao|n|cancelar|voltar)$/.test(t)){
      d={last_message_id:d.last_message_id};state="start";await saveSession(db,tenantId,phone,state,d);
      await reply(db,tenantId,instance,phone,"Tudo bem. O agendamento não foi criado. Envie MENU para começar novamente.");
      return NextResponse.json({ok:true,state});
    }
    if(!/^(sim|s|confirmo|confirmar|pode|pode confirmar|ok|beleza)$/.test(t)){
      await saveSession(db,tenantId,phone,state,d);await reply(db,tenantId,instance,phone,"Para concluir, responda SIM. Para desistir deste pedido, responda NÃO.");return NextResponse.json({ok:true})
    }
    const {data:confirmation,error}=await db.rpc("public_book_multi",{
      p_slug:tenant.slug,p_unit:d.unit.id,p_barber:d.slot.barber_id,p_services:[d.service.id],
      p_starts_at:d.slot.starts_at,p_name:d.customerName,p_phone:phone,p_email:""
    });
    if(error){
      state="date";d={...d,slots:[],slot:null};await saveSession(db,tenantId,phone,state,d);
      await reply(db,tenantId,instance,phone,"Esse horário acabou de ficar indisponível. Envie outra data e eu consulto a agenda novamente.");
      return NextResponse.json({ok:true,booking:false});
    }
    await saveSession(db,tenantId,phone,"start",{last_message_id:d.last_message_id});
    await reply(db,tenantId,instance,phone,
      "Agendamento confirmado!\n\n"+
      d.service.name+" com "+d.slot.barber_name+"\n"+
      fmtDate(d.slot.starts_at)+" às "+fmtTime(d.slot.starts_at)+"\n"+
      "Valor: "+money(d.service.price_cents)+"\n\n"+
      "Seu horário já está registrado na agenda da "+tenant.name+".\n"+
      "Para um novo agendamento, envie MENU."
    );
    return NextResponse.json({ok:true,booking:true,confirmation});
  }

  await saveSession(db,tenantId,phone,"start",{last_message_id:d.last_message_id});
  await reply(db,tenantId,instance,phone,"Envie MENU para iniciar um agendamento.");
  return NextResponse.json({ok:true,state:"start"});
}
