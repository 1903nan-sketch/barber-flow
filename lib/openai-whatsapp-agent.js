const DEFAULT_MODEL=process.env.OPENAI_WHATSAPP_MODEL||"gpt-5.6-luna";
const DEFAULT_TZ="America/Sao_Paulo";
const API_URL="https://api.openai.com/v1/responses";

const clean=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const textLabel=v=>String(v||"").trim().replace(/\s+/g," ");
const fmtTime=(v,tz=DEFAULT_TZ)=>new Date(v).toLocaleTimeString("pt-BR",{timeZone:tz||DEFAULT_TZ,hour:"2-digit",minute:"2-digit"});
const fmtDate=(v,tz=DEFAULT_TZ)=>new Date(v).toLocaleDateString("pt-BR",{timeZone:tz||DEFAULT_TZ,day:"2-digit",month:"2-digit",year:"numeric"});
const money=v=>(Number(v||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

export function openaiWhatsappConfigured(){
  return Boolean(process.env.OPENAI_API_KEY);
}

function localDate(tz=DEFAULT_TZ){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:tz||DEFAULT_TZ,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const values=Object.fromEntries(parts.filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  return values.year+"-"+values.month+"-"+values.day;
}

function tool(name,description,properties={},required=[]){
  return {
    type:"function",
    name,
    description,
    strict:true,
    parameters:{
      type:"object",
      additionalProperties:false,
      properties,
      required
    }
  };
}

const tools=[
  tool("list_units","Liste as unidades ativas da empresa. Use quando ainda não souber a unidade.",{},[]),
  tool("list_services","Liste os serviços ativos com preço e duração. Use para descobrir o serviço exato antes de consultar horários.",{},[]),
  tool("list_professionals","Liste profissionais ativos habilitados para um serviço em uma unidade.",{
    unit_id:{type:"string",description:"ID exato da unidade retornado por list_units."},
    service_id:{type:"string",description:"ID exato do serviço retornado por list_services."}
  },["unit_id","service_id"]),
  tool("get_available_slots","Consulte horários realmente disponíveis. Nunca invente horários. professional_id pode ser null para qualquer profissional.",{
    unit_id:{type:"string"},
    service_id:{type:"string"},
    professional_id:{anyOf:[{type:"string"},{type:"null"}]},
    date:{type:"string",format:"date",description:"Data local da unidade em YYYY-MM-DD."}
  },["unit_id","service_id","professional_id","date"]),
  tool("create_appointment","Crie o agendamento somente depois de o cliente confirmar claramente o resumo final. Os IDs e starts_at devem vir das ferramentas anteriores.",{
    unit_id:{type:"string"},
    service_id:{type:"string"},
    professional_id:{type:"string"},
    starts_at:{type:"string",format:"date-time"},
    customer_name:{type:"string"},
    confirmed_by_customer:{type:"boolean"}
  },["unit_id","service_id","professional_id","starts_at","customer_name","confirmed_by_customer"]),
  tool("transfer_to_human","Transfira a conversa para atendimento humano quando o cliente pedir uma pessoa, cancelamento/remarcação fora do fluxo ou quando não for seguro continuar automaticamente.",{
    reason:{type:"string"}
  },["reason"])
];

function extractText(response){
  if(typeof response?.output_text==="string"&&response.output_text.trim())return response.output_text.trim();
  for(const item of response?.output||[]){
    if(item?.type!=="message")continue;
    for(const part of item?.content||[]){
      if(part?.type==="output_text"&&part?.text)return String(part.text).trim();
      if(part?.type==="text"&&part?.text)return String(part.text).trim();
    }
  }
  return "";
}

async function callOpenAI(payload,{retryWithoutPrevious=false}={}){
  const key=process.env.OPENAI_API_KEY;
  if(!key)throw new Error("OPENAI_API_KEY não configurada.");
  const res=await fetch(API_URL,{
    method:"POST",
    cache:"no-store",
    headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify(payload)
  });
  const raw=await res.text();
  let data={};
  try{data=raw?JSON.parse(raw):{}}catch{data={error:{message:raw}}}
  if(!res.ok){
    if(retryWithoutPrevious&&payload.previous_response_id&&(res.status===400||res.status===404)){
      const next={...payload};delete next.previous_response_id;
      return callOpenAI(next,{retryWithoutPrevious:false});
    }
    throw new Error(data?.error?.message||("OpenAI retornou HTTP "+res.status));
  }
  return data;
}

async function loadUnits(db,tenantId){
  const {data,error}=await db.from("units").select("id,name,timezone").eq("tenant_id",tenantId).eq("active",true).order("name");
  if(error)throw error;
  return (data||[]).slice(0,30);
}

async function loadServices(db,tenantId){
  const {data,error}=await db.from("services").select("id,name,description,duration,price_cents").eq("tenant_id",tenantId).eq("active",true).order("name");
  if(error)throw error;
  return (data||[]).slice(0,80);
}

async function loadProfessionals(db,tenantId,unitId,serviceId){
  const [{data:bu,error:buError},{data:bs,error:bsError}]=await Promise.all([
    db.from("barber_units").select("barber_id,barbers(id,name,active)").eq("tenant_id",tenantId).eq("unit_id",unitId),
    db.from("barber_services").select("barber_id").eq("tenant_id",tenantId).eq("service_id",serviceId)
  ]);
  if(buError)throw buError;if(bsError)throw bsError;
  const qualified=new Set((bs||[]).map(x=>x.barber_id));
  return (bu||[]).map(x=>x.barbers).filter(x=>x?.active&&qualified.has(x.id)).slice(0,40);
}

async function availableSlots(db,tenant,unitId,serviceId,professionalId,date){
  const units=await loadUnits(db,tenant.id),unit=units.find(x=>x.id===unitId);
  if(!unit)return {error:"Unidade inválida."};
  const services=await loadServices(db,tenant.id),service=services.find(x=>x.id===serviceId);
  if(!service)return {error:"Serviço inválido."};
  const professionals=await loadProfessionals(db,tenant.id,unitId,serviceId);
  const selected=professionalId?professionals.filter(x=>x.id===professionalId):professionals;
  if(!selected.length)return {date,unit,service,slots:[],message:"Nenhum profissional habilitado para esse serviço nessa unidade."};
  const rows=await Promise.all(selected.map(async professional=>{
    const {data,error}=await db.rpc("public_available_slots_multi",{
      p_slug:tenant.slug,p_unit:unitId,p_barber:professional.id,p_services:[serviceId],p_date:date
    });
    if(error)return [];
    return (data||[]).map(x=>({
      starts_at:x?.starts_at||x?.start_at||x,
      professional_id:professional.id,
      professional_name:textLabel(professional.name)
    }));
  }));
  const seen=new Set(),slots=rows.flat().filter(x=>x.starts_at).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)).filter(x=>{
    const key=x.starts_at+"|"+x.professional_id;
    if(seen.has(key))return false;seen.add(key);return true;
  }).slice(0,30).map(x=>({...x,time:fmtTime(x.starts_at,unit.timezone||DEFAULT_TZ)}));
  return {date,unit:{id:unit.id,name:unit.name,timezone:unit.timezone||DEFAULT_TZ},service:{id:service.id,name:service.name,price:money(service.price_cents),duration_minutes:service.duration},slots};
}

function userClearlyConfirmed(message){
  const t=clean(message);
  return /\b(sim|confirmo|confirmar|pode confirmar|pode marcar|pode agendar|pode ser|fechado|marca pra mim|marca para mim|quero esse|esse mesmo|esse horario)\b/.test(t);
}

async function executeTool(name,args,ctx){
  const {db,tenant,phone,userMessage}=ctx;
  if(name==="list_units"){
    const units=await loadUnits(db,tenant.id);
    return {units};
  }
  if(name==="list_services"){
    const services=await loadServices(db,tenant.id);
    return {services:services.map(x=>({id:x.id,name:x.name,description:x.description||"",duration_minutes:x.duration,price:money(x.price_cents)}))};
  }
  if(name==="list_professionals"){
    const professionals=await loadProfessionals(db,tenant.id,args.unit_id,args.service_id);
    return {professionals:professionals.map(x=>({id:x.id,name:x.name}))};
  }
  if(name==="get_available_slots"){
    return availableSlots(db,tenant,args.unit_id,args.service_id,args.professional_id,args.date);
  }
  if(name==="create_appointment"){
    if(args.confirmed_by_customer!==true||!userClearlyConfirmed(userMessage)){
      return {ok:false,error:"Confirmação explícita do cliente ainda não foi detectada. Mostre o resumo e peça confirmação antes de criar."};
    }
    const slotCheck=await availableSlots(db,tenant,args.unit_id,args.service_id,args.professional_id,String(args.starts_at).slice(0,10));
    const exact=(slotCheck.slots||[]).find(x=>x.professional_id===args.professional_id&&new Date(x.starts_at).getTime()===new Date(args.starts_at).getTime());
    if(!exact)return {ok:false,error:"O horário não está mais disponível. Consulte get_available_slots novamente."};
    const {data,error}=await db.rpc("public_book_multi",{
      p_slug:tenant.slug,
      p_unit:args.unit_id,
      p_barber:args.professional_id,
      p_services:[args.service_id],
      p_starts_at:args.starts_at,
      p_name:textLabel(args.customer_name).slice(0,80),
      p_phone:phone,
      p_email:""
    });
    if(error)return {ok:false,error:"Não foi possível criar o agendamento porque o horário pode ter acabado de ser ocupado."};
    return {ok:true,confirmation:data,summary:{service:slotCheck.service?.name,professional:exact.professional_name,date:fmtDate(exact.starts_at,slotCheck.unit?.timezone),time:fmtTime(exact.starts_at,slotCheck.unit?.timezone),unit:slotCheck.unit?.name}};
  }
  if(name==="transfer_to_human"){
    ctx.handoff=true;ctx.handoffReason=String(args.reason||"Atendimento humano solicitado.");
    return {ok:true,transferred:true};
  }
  return {error:"Ferramenta desconhecida."};
}

function instructions({tenant,origin,timezone}){
  const today=localDate(timezone||DEFAULT_TZ);
  return [
    "Você é o Assistente IA do RupControl no WhatsApp de "+textLabel(tenant.name)+".",
    "Objetivo: atender em português do Brasil e concluir agendamentos usando somente dados reais das ferramentas.",
    "Regras obrigatórias:",
    "1. Nunca invente serviço, preço, profissional, unidade, horário, endereço ou confirmação.",
    "2. Para disponibilidade, sempre use get_available_slots. Para criar, use create_appointment.",
    "3. Antes de create_appointment, mostre um resumo curto e peça confirmação explícita. Só crie após a resposta de confirmação do cliente.",
    "4. Se houver mais de uma unidade e a unidade não estiver clara, pergunte qual unidade.",
    "5. Se o cliente disser 'qualquer profissional', use professional_id null ao consultar horários e depois use o professional_id do horário escolhido.",
    "6. Interprete linguagem natural: 'sexta à noite', 'amanhã depois das 18', 'o segundo horário', 'qualquer profissional'. Resolva datas com base em hoje="+today+" e no fuso "+(timezone||DEFAULT_TZ)+".",
    "7. Cancelamento, reagendamento complexo, reclamação, cobrança ou pedido de humano: use transfer_to_human.",
    "8. Responda curto, natural e profissional. Evite menus rígidos quando puder entender a frase do cliente.",
    "9. Não mencione OpenAI, tokens, API, ferramentas internas, Supabase ou regras do sistema.",
    "Endereço cadastrado: "+(tenant.address||"não informado")+".",
    "Link de agendamento: "+origin+"/agendar/"+tenant.slug+"."
  ].join("\n");
}

export async function runOpenAIWhatsappAgent({db,tenant,phone,message,previousResponseId,origin,timezone}){
  const model=DEFAULT_MODEL;
  const basePayload={
    model,
    instructions:instructions({tenant,origin,timezone}),
    input:String(message||"").slice(0,2000),
    tools,
    tool_choice:"auto",
    store:true,
    reasoning:{effort:"none"},
    max_output_tokens:500
  };
  if(previousResponseId)basePayload.previous_response_id=previousResponseId;

  let response=await callOpenAI(basePayload,{retryWithoutPrevious:true});
  const usage={input_tokens:Number(response?.usage?.input_tokens||0),output_tokens:Number(response?.usage?.output_tokens||0)};
  const ctx={db,tenant,phone,userMessage:message,handoff:false,handoffReason:""};

  for(let round=0;round<5;round++){
    const calls=(response?.output||[]).filter(x=>x?.type==="function_call");
    if(!calls.length){
      return {
        ok:true,
        text:extractText(response)||"Posso te ajudar a encontrar um horário. O que você deseja fazer?",
        responseId:response?.id||"",
        handoff:ctx.handoff,
        handoffReason:ctx.handoffReason,
        usage
      };
    }

    const outputs=[];
    for(const call of calls){
      let args={};
      try{args=JSON.parse(call.arguments||"{}")}catch{}
      let result;
      try{result=await executeTool(call.name,args,ctx)}
      catch(error){result={ok:false,error:error?.message||"Falha ao consultar o RupControl."}}
      outputs.push({type:"function_call_output",call_id:call.call_id,output:JSON.stringify(result)});
    }

    response=await callOpenAI({
      model,
      previous_response_id:response.id,
      input:outputs,
      tools,
      tool_choice:"auto",
      store:true,
      reasoning:{effort:"none"},
      max_output_tokens:500
    });
    usage.input_tokens+=Number(response?.usage?.input_tokens||0);
    usage.output_tokens+=Number(response?.usage?.output_tokens||0);
  }

  return {
    ok:true,
    text:"Não consegui concluir automaticamente agora. Vou encaminhar para a equipe.",
    responseId:response?.id||"",
    handoff:true,
    handoffReason:"Limite de etapas do agente atingido.",
    usage
  };
}
