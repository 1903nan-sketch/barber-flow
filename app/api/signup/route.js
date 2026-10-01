import {createHash} from "node:crypto";
import {NextResponse} from "next/server";
import {adminClient} from "../../../lib/server-auth";

// Limite simples por instância contra cadastros em massa (o Supabase Auth também limita).
const attempts=new Map();
function rateLimited(key){
 const now=Date.now(),windowMs=60*60*1000,list=(attempts.get(key)||[]).filter(t=>now-t<windowMs);
 list.push(now);attempts.set(key,list);
 if(attempts.size>5000)attempts.clear();
 return list.length>6;
}

const clean=(v,n=120)=>String(v||"").trim().replace(/\s+/g," ").slice(0,n);
const slugify=v=>String(v||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const PLANS=new Set(["Starter","Pro","Pro + Filiais"]);

function acquisitionPayload(raw){
 const a=raw&&typeof raw==="object"?raw:{};
 const pick=k=>clean(a[k],200)||undefined;
 const clicks={};
 for(const [k,v] of Object.entries(a.click_ids&&typeof a.click_ids==="object"?a.click_ids:{}).slice(0,12)){
  if(/^[a-z_]{2,20}$/i.test(k))clicks[k]=String(v||"").slice(0,300);
 }
 const last=a.last_touch&&typeof a.last_touch==="object"?a.last_touch:{};
 return {
  utm_source:pick("utm_source"),utm_medium:pick("utm_medium"),utm_campaign:pick("utm_campaign"),
  utm_content:pick("utm_content"),utm_term:pick("utm_term"),
  landing_page:String(a.landing_page||"").slice(0,500)||undefined,
  referrer:String(a.referrer||"").slice(0,500)||undefined,
  first_touch_at:/^\d{4}-\d{2}-\d{2}T/.test(String(a.first_touch_at||""))?a.first_touch_at:undefined,
  click_ids:clicks,
  last_touch:Object.fromEntries(Object.entries(last).slice(0,12).map(([k,v])=>[String(k).slice(0,30),typeof v==="object"?v:String(v||"").slice(0,200)]))
 };
}

export async function POST(request){
 let body;
 try{body=await request.json()}catch{return NextResponse.json({error:"Requisição inválida."},{status:400})}
 if(body.website)return NextResponse.json({error:"Não foi possível concluir o cadastro."},{status:400});

 const ownerName=clean(body.owner_name),barbershop=clean(body.barbershop),email=String(body.email||"").trim().toLowerCase().slice(0,160);
 const whatsapp=String(body.whatsapp||"").replace(/\D/g,""),password=String(body.password||"");
 const plan=PLANS.has(body.plan)?body.plan:"Pro";
 if(ownerName.length<2)return NextResponse.json({error:"Informe o nome do responsável."},{status:400});
 if(barbershop.length<2)return NextResponse.json({error:"Informe o nome da barbearia."},{status:400});
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))return NextResponse.json({error:"Informe um e-mail válido."},{status:400});
 if(whatsapp.length<10||whatsapp.length>13)return NextResponse.json({error:"Informe um WhatsApp válido com DDD."},{status:400});
 if(password.length<8)return NextResponse.json({error:"A senha precisa ter pelo menos 8 caracteres."},{status:400});

 const ip=(request.headers.get("x-forwarded-for")||"").split(",")[0].trim()||request.headers.get("x-real-ip")||"unknown";
 if(rateLimited(ip)||rateLimited("email:"+email))return NextResponse.json({error:"Muitas tentativas. Aguarde alguns minutos e tente novamente."},{status:429});

 let admin;
 try{admin=adminClient()}catch(error){return NextResponse.json({error:error.message},{status:500})}

 const {data:created,error:createError}=await admin.auth.admin.createUser({
  email,password,email_confirm:true,
  user_metadata:{name:ownerName,full_name:ownerName,phone:whatsapp,signup:"self"}
 });
 if(createError||!created?.user){
  const duplicate=/already|registered|exists/i.test(createError?.message||"");
  return NextResponse.json({error:duplicate?"Este e-mail já possui uma conta. Entre com sua senha ou recupere o acesso.":"Não foi possível criar sua conta. Confira os dados e tente novamente."},{status:duplicate?409:400});
 }

 const serverContext={
  user_agent:String(request.headers.get("user-agent")||"").slice(0,300),
  country:request.headers.get("x-vercel-ip-country")||"",
  region:request.headers.get("x-vercel-ip-country-region")||"",
  city:decodeURIComponent(request.headers.get("x-vercel-ip-city")||""),
  referer_header:String(request.headers.get("referer")||"").slice(0,300),
  ip_hash:createHash("sha256").update(ip+":"+(process.env.SUPABASE_SERVICE_ROLE_KEY||"").slice(-12)).digest("hex").slice(0,32),
  received_at:new Date().toISOString()
 };

 const {data,error}=await admin.rpc("signup_provision_tenant",{p_owner:created.user.id,p:{
  name:barbershop,owner_name:ownerName,whatsapp,plan,slug:slugify(barbershop),
  acquisition:acquisitionPayload(body.acquisition),server_context:serverContext
 }});
 if(error){
  await admin.auth.admin.deleteUser(created.user.id);
  console.error("signup_provision_tenant",error.message);
  return NextResponse.json({error:error.message||"Não foi possível criar a barbearia."},{status:400});
 }
 return NextResponse.json({ok:true,tenant_id:data?.tenant_id,slug:data?.slug,plan:data?.plan});
}
