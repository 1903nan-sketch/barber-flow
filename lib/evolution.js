const cleanBase=()=>String(process.env.EVOLUTION_API_URL||"").replace(/\/+$/,"");
const apiKey=()=>String(process.env.EVOLUTION_API_KEY||"");

export function evolutionConfigured(){
  return Boolean(cleanBase()&&apiKey()&&process.env.EVOLUTION_WEBHOOK_SECRET);
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
  const base=cleanBase(),key=apiKey();
  if(!base||!key)throw new Error("Evolution API não configurada.");
  const res=await fetch(base+path,{
    method,
    cache:"no-store",
    headers:{apikey:key,"Content-Type":"application/json"},
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
      events:["QRCODE_UPDATED","MESSAGES_UPSERT","CONNECTION_UPDATE"]
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
