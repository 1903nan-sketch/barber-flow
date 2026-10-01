import {makePixPayload} from "./pix";

const MIN_GATEWAY_CENTS=500;
const digits=v=>String(v||"").replace(/\D/g,"");

export async function asaasCall(gateway,path,{method="GET",body}={}){
 const base=gateway.environment==="sandbox"?"https://api-sandbox.asaas.com/v3":"https://api.asaas.com/v3";
 const res=await fetch(base+path,{
  method,cache:"no-store",
  headers:{accept:"application/json","content-type":"application/json",access_token:gateway.api_key,"User-Agent":"BarberTix/1.0"},
  body:body===undefined?undefined:JSON.stringify(body)
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok){
  const message=Array.isArray(data?.errors)?data.errors.map(x=>x.description||x.code).filter(Boolean).join(" · "):data?.message;
  throw Object.assign(new Error(message||("Erro Asaas HTTP "+res.status)),{status:res.status});
 }
 return data;
}

export async function getGateway(admin,tenantId){
 const {data,error}=await admin.rpc("server_get_payment_gateway",{p_tenant:tenantId,p_provider:"asaas"});
 if(error||!data?.api_key)return null;
 return data;
}

// Carrega o agendamento validando que pertence à barbearia do link público.
export async function loadDepositContext(admin,appointmentId,slug){
 if(!/^[0-9a-f-]{36}$/i.test(String(appointmentId||"")))return null;
 const {data:tenant}=await admin.from("tenants").select("id,name,slug,pix_key,pix_name,pix_city,whatsapp,phone").eq("slug",String(slug||"").toLowerCase()).maybeSingle();
 if(!tenant)return null;
 const {data:appointment}=await admin.from("appointments")
  .select("id,tenant_id,unit_id,barber_id,client_id,starts_at,ends_at,status,price_cents,deposit_status,deposit_cents,hold_expires_at")
  .eq("tenant_id",tenant.id).eq("id",appointmentId).maybeSingle();
 if(!appointment)return null;
 const [{data:deposit},{data:client},{data:barber},{data:unit},{data:lines}]=await Promise.all([
  admin.from("appointment_deposits").select("*").eq("tenant_id",tenant.id).eq("appointment_id",appointment.id).maybeSingle(),
  admin.from("clients").select("id,name,phone,whatsapp,email").eq("tenant_id",tenant.id).eq("id",appointment.client_id).maybeSingle(),
  admin.from("barbers").select("name").eq("tenant_id",tenant.id).eq("id",appointment.barber_id).maybeSingle(),
  admin.from("units").select("name,timezone").eq("tenant_id",tenant.id).eq("id",appointment.unit_id).maybeSingle(),
  admin.from("appointment_services").select("services(name)").eq("tenant_id",tenant.id).eq("appointment_id",appointment.id)
 ]);
 const services=(lines||[]).map(x=>x.services?.name).filter(Boolean).join(" + ")||"Atendimento";
 return {tenant,appointment,deposit,client,barber,unit,services};
}

export function publicDeposit(ctx){
 const {appointment,deposit,tenant,barber,unit,services}=ctx;
 return {
  appointment_id:appointment.id,
  barbershop:tenant.name,
  whatsapp:tenant.whatsapp||tenant.phone||"",
  service:services,
  barber:barber?.name||"",
  unit:unit?.name||"",
  timezone:unit?.timezone||"America/Sao_Paulo",
  starts_at:appointment.starts_at,
  price_cents:appointment.price_cents,
  amount_cents:appointment.deposit_cents,
  status:appointment.deposit_status==="paid"?"paid":appointment.status==="cancelled"?"expired":appointment.deposit_status,
  expires_at:appointment.hold_expires_at,
  gateway:deposit?.gateway||null,
  pix_payload:deposit?.status==="pending"?deposit?.pix_payload||null:null,
  pix_qr_image:deposit?.status==="pending"?deposit?.pix_qr_image||null:null,
  invoice_url:deposit?.status==="pending"?deposit?.invoice_url||null:null
 };
}

function manualPix(ctx){
 const {tenant,appointment}=ctx;
 return makePixPayload({key:tenant.pix_key,name:tenant.pix_name||tenant.name,city:tenant.pix_city,amountCents:appointment.deposit_cents,
  txid:"SINAL"+appointment.id.replace(/-/g,"").slice(0,12),description:"Sinal "+tenant.name});
}

// Gera (uma única vez) a cobrança do sinal: PIX automático no Asaas da barbearia quando
// configurado; caso contrário, PIX da chave da barbearia com confirmação manual pela equipe.
export async function ensureDepositCharge(admin,ctx,{document}={}){
 const {appointment,tenant,client}=ctx;
 if(appointment.deposit_status!=="pending"||appointment.status!=="scheduled")return {ctx};
 if(new Date(appointment.hold_expires_at).getTime()<=Date.now())return {ctx};
 if(ctx.deposit?.status==="pending"&&ctx.deposit.pix_payload)return {ctx};

 let deposit=ctx.deposit;
 if(!deposit){
  const {data,error}=await admin.from("appointment_deposits").insert({
   tenant_id:tenant.id,appointment_id:appointment.id,amount_cents:appointment.deposit_cents,status:"pending",gateway:"manual_pix",expires_at:appointment.hold_expires_at
  }).select("*").single();
  if(error){
   const {data:existing}=await admin.from("appointment_deposits").select("*").eq("appointment_id",appointment.id).maybeSingle();
   if(!existing)throw error;
   deposit=existing;
  }else deposit=data;
 }

 const gateway=appointment.deposit_cents>=MIN_GATEWAY_CENTS?await getGateway(admin,tenant.id):null;
 if(gateway){
  const cpf=digits(document);
  if(![11,14].includes(cpf.length))return {ctx:{...ctx,deposit},needs_document:true};
  try{
   const found=await asaasCall(gateway,"/customers?cpfCnpj="+cpf+"&limit=1");
   const customer=found?.data?.[0]?.id||(await asaasCall(gateway,"/customers",{method:"POST",body:{
    name:client?.name||"Cliente",cpfCnpj:cpf,mobilePhone:digits(client?.whatsapp||client?.phone).replace(/^55/,"")||undefined,
    email:client?.email||undefined,notificationDisabled:true,externalReference:"client:"+client?.id
   }}))?.id;
   const today=new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});
   const payment=await asaasCall(gateway,"/payments",{method:"POST",body:{
    customer,billingType:"PIX",value:appointment.deposit_cents/100,dueDate:today,
    description:("Sinal de agendamento · "+tenant.name).slice(0,500),externalReference:"deposit:"+deposit.id
   }});
   const qr=await asaasCall(gateway,"/payments/"+encodeURIComponent(payment.id)+"/pixQrCode");
   const patch={gateway:"asaas",external_id:payment.id,pix_payload:qr?.payload||null,pix_qr_image:qr?.encodedImage?"data:image/png;base64,"+qr.encodedImage:null,
    invoice_url:payment.invoiceUrl||null,updated_at:new Date().toISOString()};
   await admin.from("appointment_deposits").update(patch).eq("id",deposit.id);
   return {ctx:{...ctx,deposit:{...deposit,...patch}}};
  }catch(error){
   console.error("deposit asaas",error?.message||error);
   if(error?.status===400)throw Object.assign(new Error(error.message||"Não foi possível gerar o PIX."),{status:400});
  }
 }

 const payload=manualPix(ctx);
 const patch={gateway:"manual_pix",pix_payload:payload||null,updated_at:new Date().toISOString()};
 await admin.from("appointment_deposits").update(patch).eq("id",deposit.id);
 return {ctx:{...ctx,deposit:{...deposit,...patch}},manual:true,missing_key:!payload};
}
