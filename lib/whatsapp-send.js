import {evolutionConfigured,evolutionInstanceName,resolveEvolutionNumber,sendEvolutionList,sendEvolutionText} from "./evolution";

// Normaliza para o formato internacional usado pelo WhatsApp (55 + DDD + número).
export function toWhatsappNumber(value){
 const phone=String(value||"").replace(/\D/g,"");
 if(phone.length===10||phone.length===11)return "55"+phone;
 if((phone.length===12||phone.length===13)&&phone.startsWith("55"))return phone;
 return "";
}

function fail(code,message){return Object.assign(new Error(message||code),{code})}

export async function getPlatformSetting(admin,key){
 const {data}=await admin.from("platform_settings").select("value").eq("key",key).maybeSingle();
 return data?.value||"";
}

// Envia texto pela instância Evolution da barbearia (ou outra instância informada)
// e registra no log do robô. Retorna o número confirmado pelo WhatsApp.
export async function sendWhatsapp(admin,tenantId,rawPhone,text,{instance,list}={}){
 const number=toWhatsappNumber(rawPhone);
 if(!number)throw fail("invalid_phone","Número de WhatsApp inválido.");
 if(!(await evolutionConfigured()))throw fail("not_configured","WhatsApp não configurado no servidor.");
 const inst=instance||evolutionInstanceName(tenantId);
 let phone="";
 try{phone=await resolveEvolutionNumber(inst,number)}
 catch(error){throw fail("instance_unavailable",error?.message||"WhatsApp da barbearia desconectado.")}
 if(!phone)throw fail("number_not_found","Número sem WhatsApp.");
 await sendEvolutionText(inst,phone,text);
 if(list?.options?.length){
  try{await sendEvolutionList(inst,phone,list.title,list.description||"Toque em *Escolher opção*.",list.options)}catch{}
 }
 if(tenantId)await admin.from("whatsapp_bot_logs").insert({tenant_id:tenantId,phone,direction:"out",message:String(text).slice(0,4000)});
 return phone;
}
