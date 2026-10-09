import {NextResponse} from "next/server";
import {serverSupabase} from "../../../../lib/billing-server";

// Foto do serviço exibida no site de agendamento.
// action=upload (com file), action=generate (IA a partir do nome) ou action=remove.
export const maxDuration=60;

const BUCKET="tenant-public-media";
const IMAGE_MODEL=process.env.OPENAI_IMAGE_MODEL||"gpt-image-1-mini";
// Gerações com IA por empresa a cada 24 horas (cada uma tem custo na OpenAI).
const DAILY_AI_LIMIT=20;

const fail=(error,status)=>NextResponse.json({error},{status});

// Caminho do arquivo no bucket a partir da URL pública, só para fotos de
// serviço desta empresa (nunca apaga logo, capa ou foto de profissional).
function storedPath(url,tenantId){
 const marker="/storage/v1/object/public/"+BUCKET+"/",i=String(url||"").indexOf(marker);
 if(i<0)return "";
 const path=decodeURIComponent(String(url).slice(i+marker.length).split("?")[0]);
 return path.startsWith(tenantId+"/service-")?path:"";
}

function imagePrompt(service,tenantName){
 return [
  "Square photo for the service menu of a small business booking page.",
  `Business name: "${tenantName}". Service name (Brazilian Portuguese): "${service.name}".`,
  service.description?`Service details: "${service.description}".`:"",
  "Show the service being performed or its finished result in a realistic, professional way, with natural soft lighting and a clean, modern setting.",
  "Close framing, appealing and premium look. No text, letters, numbers, logos or watermarks."
 ].filter(Boolean).join(" ");
}

async function generateImage(service,tenantName){
 const key=process.env.OPENAI_API_KEY;
 if(!key)throw Object.assign(new Error("A geração de fotos com IA ainda não foi ativada."),{status:503});
 const res=await fetch("https://api.openai.com/v1/images/generations",{
  method:"POST",
  headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
  body:JSON.stringify({model:IMAGE_MODEL,prompt:imagePrompt(service,tenantName),n:1,size:"1024x1024",quality:"medium",output_format:"webp",output_compression:82}),
  signal:AbortSignal.timeout(55000)
 });
 const body=await res.json().catch(()=>null);
 if(!res.ok){
  console.error("service image generation",res.status,body?.error?.message);
  throw Object.assign(new Error("Não foi possível gerar a foto agora. Tente de novo ou envie uma imagem."),{status:502});
 }
 const b64=body?.data?.[0]?.b64_json;
 if(!b64)throw Object.assign(new Error("A IA não devolveu a imagem. Tente de novo."),{status:502});
 return {bytes:Buffer.from(b64,"base64"),type:"image/webp"};
}

export async function POST(request){
 try{
  const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  if(!token)return fail("Sessão inválida.",401);
  const admin=serverSupabase(),{data:{user}}=await admin.auth.getUser(token);
  if(!user)return fail("Sessão expirada.",401);

  const form=await request.formData(),tenantId=String(form.get("tenant_id")||""),serviceId=String(form.get("service_id")||""),action=String(form.get("action")||"");
  if(!tenantId||!serviceId||!["upload","generate","remove"].includes(action))return fail("Envio inválido.",400);

  // Mesma regra do banco (private.can): empresa ativa e permissão "services".
  const {data:member}=await admin.from("memberships").select("role,permissions,tenants(name,status)").eq("tenant_id",tenantId).eq("user_id",user.id).eq("active",true).maybeSingle();
  if(!member||!["trial","active","pending","overdue"].includes(member.tenants?.status))return fail("Sem acesso a esta empresa.",403);
  if(member.role!=="owner"&&!(member.permissions||[]).includes("services"))return fail("Seu perfil não tem permissão para editar serviços.",403);

  const {data:service}=await admin.from("services").select("id,name,description,image_url").eq("id",serviceId).eq("tenant_id",tenantId).maybeSingle();
  if(!service)return fail("Serviço não encontrado.",404);
  const oldPath=storedPath(service.image_url,tenantId);

  let image=null;
  if(action==="upload"){
   const file=form.get("file");
   if(!file||typeof file==="string")return fail("Escolha uma imagem.",400);
   if(file.size>5*1024*1024)return fail("A imagem deve ter no máximo 5 MB.",400);
   const type=String(file.type||"");
   if(!["image/jpeg","image/png","image/webp"].includes(type))return fail("Use JPG, PNG ou WebP.",400);
   image={bytes:Buffer.from(await file.arrayBuffer()),type};
  }else if(action==="generate"){
   const {data:allowed,error:limitError}=await admin.rpc("api_rate_limit_hit",{p_bucket:"service-image:"+tenantId,p_limit:DAILY_AI_LIMIT,p_window_seconds:86400});
   if(!limitError&&allowed===false)return fail(`Limite de ${DAILY_AI_LIMIT} fotos com IA por dia atingido. Amanhã você pode gerar mais, ou envie uma imagem.`,429);
   image=await generateImage(service,member.tenants?.name||"");
  }

  let url=null;
  if(image){
   const ext=image.type==="image/png"?"png":image.type==="image/webp"?"webp":"jpg",path=`${tenantId}/service-${serviceId}-${Date.now()}.${ext}`;
   const {error}=await admin.storage.from(BUCKET).upload(path,image.bytes,{contentType:image.type,upsert:false});
   if(error)return fail(error.message,400);
   url=admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  const {error:updateError}=await admin.from("services").update({image_url:url}).eq("id",serviceId).eq("tenant_id",tenantId);
  if(updateError)return fail(updateError.message,400);
  if(oldPath)await admin.storage.from(BUCKET).remove([oldPath]).catch(()=>{});
  return NextResponse.json({url});
 }catch(err){
  console.error("service image",err);
  return fail(err.message||"Não foi possível salvar a foto.",err.status||500);
 }
}
