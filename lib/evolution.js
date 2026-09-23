import {createClient} from "@supabase/supabase-js";

let configCache={value:null,expiresAt:0};

async function loadPlatformSettings(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return {};
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await sb.from("platform_settings")
    .select("key,value")
    .in("key",["evolution_api_url","evolution_api_key","evolution_webhook_secret"]);
  if(error)return {};
  return Object.fromEntries((data||[]).map(row=>[row.key,row.value]));
}

export async function getEvolutionConfig(){
  const now=Date.now();
  if(configCache.value&&configCache.expiresAt>now)return configCache.value;

  const env={
    url:String(process.env.EVOLUTION_API_URL||"").replace(/\/+$/,""),
    apiKey:String(process.env.EVOLUTION_API_KEY||""),
    webhookSecret:String(process.env.EVOLUTION_WEBHOOK_SECRET||"")
  };
  if(env.url&&env.apiKey&&env.webhookSecret){
    configCache={value:env,expiresAt:now+60000};
    return env;
  }

  const settings=await loadPlatformSettings();
  const config={
    url:String(settings.evolution_api_url||env.url||"").replace(/\/+$/,""),
    apiKey:String(settings.evolution_api_key||env.apiKey||""),
    webhookSecret:String(settings.evolution_webhook_secret||env.webhookSecret||"")
  };
  configCache={value:config,expiresAt:now+60000};
  return config;
}

export async function evolutionConfigured(){
  const config=await getEvolutionConfig();
  return Boolean(config.url&&config.apiKey&&config.webhookSecret);
}

export async function getEvolutionWebhookSecret(){
  const config=await getEvolutionConfig();
  return config.webhookSecret;
}

export function evolutionInstanceName(tenantId){
  return "barberflow-"+String(tenantId||"").toLowerCase().replace(/[^a-z0-9]/g,"");
}

export function tenantIdFromEvolutionInstance(instanceName){
  const match=String(instanceName||"").toLowerCase().match(/^barberflow-([0-9a-f]{32})$/);
  if(!match)return "";
  const h=match[1];
  return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);
}

async function request(path,{method="GET",body}={}){
  const config=await getEvolutionConfig();
  if(!config.url||!config.apiKey)throw new Error("Evolution API não configurada.");
  const res=await fetch(config.url+path,{
    method,
    cache:"no-store",
    headers:{apikey:config.apiKey,"Content-Type":"application/json"},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const raw=await res.text();
  let data={};
  try{data=raw?JSON.parse(raw):{}}catch{data={message:raw}}
  if(!res.ok){
    const message=data?.response?.message?.[0]||data?.message||data?.error||("Evolution API retornou HTTP "+res.status);
    const err=new Error(Array.isArray(message)?message.join(", "):String(message));
    err.status=res.status;err.payload=data;throw err;
  }
  return data;
}

export async function createEvolutionInstance(instanceName){
  try{
    return await request("/instance/create",{
      method:"POST",
      body:{instanceName,qrcode:true,integration:"WHATSAPP-BAILEYS"}
    });
  }catch(err){
    if(err.status===403||err.status===409||/already|exist|instance.*used/i.test(err.message))return {alreadyExists:true};
    throw err;
  }
}

export async function setEvolutionWebhook(instanceName,url){
  return request("/webhook/set/"+encodeURIComponent(instanceName),{
    method:"POST",
    body:{webhook:{
      enabled:true,
      url,
      webhookByEvents:false,
      webhookBase64:false,
      events:["QRCODE_UPDATED","MESSAGES_UPSERT","MESSAGES_UPDATE","CONNECTION_UPDATE"]
    }}
  });
}

export function connectEvolutionInstance(instanceName){
  return request("/instance/connect/"+encodeURIComponent(instanceName));
}

export function evolutionConnectionState(instanceName){
  return request("/instance/connectionState/"+encodeURIComponent(instanceName));
}

export function logoutEvolutionInstance(instanceName){
  return request("/instance/logout/"+encodeURIComponent(instanceName),{method:"DELETE"});
}

export function sendEvolutionText(instanceName,number,text){
  const phone=String(number||"").replace(/\D/g,"");
  if(!phone)throw new Error("Número de WhatsApp inválido.");
  return request("/message/sendText/"+encodeURIComponent(instanceName),{
    method:"POST",
    body:{number:phone,text:String(text||"").slice(0,4000),delay:500,linkPreview:false}
  });
}

function brazilPhoneVariants(value){
  const phone=String(value||"").replace(/\D/g,"");
  const values=[];
  const add=v=>{if(v&&!values.includes(v))values.push(v)};
  add(phone);
  if(phone.startsWith("55")){
    if(phone.length===13&&phone.slice(4,5)==="9")add(phone.slice(0,4)+phone.slice(5));
    if(phone.length===12)add(phone.slice(0,4)+"9"+phone.slice(4));
  }
  return values;
}

export async function resolveEvolutionNumber(instanceName,number){
  const variants=brazilPhoneVariants(number);
  if(!variants.length)return "";
  const result=await request("/chat/whatsappNumbers/"+encodeURIComponent(instanceName),{
    method:"POST",
    body:{numbers:variants}
  });
  const rows=Array.isArray(result)?result:[];
  const found=rows.find(row=>row?.exists);
  if(!found)return "";
  const fromJid=String(found?.jid||"").split("@")[0].replace(/\D/g,"");
  const fromNumber=String(found?.number||"").replace(/\D/g,"");
  return fromJid||fromNumber||variants[0];
}

export function sendEvolutionButtons(instanceName,number,title,description,values){
  const phone=String(number||"").replace(/\D/g,"");
  if(!phone)throw new Error("Número de WhatsApp inválido.");
  const options=[...new Set((values||[]).map(v=>String(v||"").trim()).filter(Boolean))].slice(0,3);
  if(!options.length)throw new Error("Informe ao menos uma opção.");
  return request("/message/sendButtons/"+encodeURIComponent(instanceName),{
    method:"POST",
    body:{
      number:phone,
      title:String(title||"Escolha uma opção").trim().slice(0,60),
      description:String(description||"").trim().slice(0,1024),
      footer:"BarberFlow",
      buttons:options.map(label=>({
        type:"reply",
        displayText:label.slice(0,20),
        id:label.slice(0,200)
      })),
      delay:500
    }
  });
}

export function sendEvolutionList(instanceName,number,title,description,values){
  const phone=String(number||"").replace(/\D/g,"");
  if(!phone)throw new Error("Número de WhatsApp inválido.");
  const options=[...new Set((values||[]).map(v=>String(v||"").trim()).filter(Boolean))].slice(0,10);
  if(!options.length)throw new Error("Informe ao menos uma opção.");
  const rows=options.map(label=>{
    const parts=label.split(" · ").map(x=>x.trim()).filter(Boolean);
    const rowTitle=String(parts.shift()||label).slice(0,24);
    const rowDescription=parts.join(" · ").slice(0,72)||"Toque para selecionar";
    return {
      title:rowTitle||"Opção",
      description:rowDescription,
      rowId:label.slice(0,200)
    };
  });
  return request("/message/sendList/"+encodeURIComponent(instanceName),{
    method:"POST",
    body:{
      number:phone,
      title:String(title||"Escolha uma opção").trim().slice(0,60),
      description:String(description||"Toque abaixo para escolher.").trim().slice(0,1024),
      footerText:"BarberFlow",
      buttonText:"Escolher opção",
      sections:[{title:"Opções",rows}],
      delay:500
    }
  });
}

export function sendEvolutionPoll(instanceName,number,name,values){
  const phone=String(number||"").replace(/\D/g,"");
  if(!phone)throw new Error("Número de WhatsApp inválido.");
  const options=[...new Set((values||[]).map(v=>String(v||"").trim()).filter(Boolean))].slice(0,12);
  if(options.length<2)throw new Error("A enquete precisa de pelo menos duas opções.");
  return request("/message/sendPoll/"+encodeURIComponent(instanceName),{
    method:"POST",
    body:{
      number:phone,
      name:String(name||"Escolha uma opção").trim().slice(0,255),
      selectableCount:1,
      values:options,
      delay:500
    }
  });
}

export function extractEvolutionQr(payload){
  const q=payload?.qrcode?.base64||payload?.base64||payload?.qrcode||payload?.data?.qrcode?.base64||payload?.data?.base64;
  return typeof q==="string"?q:"";
}

export function normalizeEvolutionState(payload){
  const raw=String(payload?.instance?.state||payload?.state||payload?.status||payload?.data?.state||payload?.data?.status||"").toLowerCase();
  if(["open","connected","online"].includes(raw))return "connected";
  if(["connecting","created","qr","qrcode"].includes(raw))return "connecting";
  if(["close","closed","disconnected","offline"].includes(raw))return "disconnected";
  return raw||"disconnected";
}

export function evolutionPhone(payload){
  const jid=payload?.instance?.wuid||payload?.wuid||payload?.instance?.owner||payload?.owner||payload?.data?.instance?.wuid||payload?.data?.wuid||"";
  return String(jid).split("@")[0].replace(/\D/g,"");
}
