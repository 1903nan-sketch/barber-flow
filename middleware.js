import {NextResponse} from "next/server";
import {APP_HOST,LEGACY_APP_HOSTS} from "./lib/site";

// Limite por IP nas rotas /api. A contagem fica no Postgres (public.api_rate_limit_hit),
// então vale para todas as instâncias da Vercel ao mesmo tempo.
// [prefixo, nome do grupo, máximo de requisições, janela em segundos]
const API_LIMITS=[
 ["/api/whatsapp/evolution/webhook","webhook",600,60],
 ["/api/whatsapp/webhook","webhook",600,60],
 ["/api/billing/webhook","webhook",600,60],
 ["/api/admin/","admin",60,60],
 ["/api/appointments/","appointments",20,60],
 ["/api/media/upload","upload",30,60],
 ["/api/instagram/","instagram",30,60],
 ["/api/","api",120,60]
];

function clientIp(request){
 return request.headers.get("x-real-ip")||request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"";
}

// Devolve false só quando o banco confirma que o limite estourou. Qualquer
// falha (banco fora, timeout, chave ausente) libera a requisição.
async function withinLimit(bucket,limit,windowSeconds){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return true;
 try{
  const res=await fetch(url+"/rest/v1/rpc/api_rate_limit_hit",{
   method:"POST",
   headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},
   body:JSON.stringify({p_bucket:bucket,p_limit:limit,p_window_seconds:windowSeconds}),
   signal:AbortSignal.timeout(1500),
   cache:"no-store"
  });
  if(!res.ok)return true;
  return (await res.json())!==false;
 }catch{
  return true;
 }
}

export async function middleware(request){
 const {pathname}=request.nextUrl;

 if(!pathname.startsWith("/api/")){
  // Páginas abertas pelo domínio antigo vão para o novo. As APIs continuam
  // respondendo nele porque webhooks e cobranças ainda apontam para lá.
  const host=(request.headers.get("host")||"").split(":")[0].toLowerCase();
  if(LEGACY_APP_HOSTS.includes(host)&&(request.method==="GET"||request.method==="HEAD")){
   const target=new URL(pathname+request.nextUrl.search,"https://"+APP_HOST);
   return NextResponse.redirect(target,308);
  }
  return NextResponse.next();
 }

 if(request.method==="OPTIONS")return NextResponse.next();
 const ip=clientIp(request);
 if(!ip)return NextResponse.next();
 const [,group,limit,windowSeconds]=API_LIMITS.find(([prefix])=>pathname.startsWith(prefix));
 if(await withinLimit(group+":"+ip,limit,windowSeconds))return NextResponse.next();
 return NextResponse.json(
  {error:"Muitas requisições. Aguarde um minuto e tente novamente."},
  {status:429,headers:{"Retry-After":String(windowSeconds)}}
 );
}

export const config={
 matcher:["/((?!_next/static|_next/image|favicon.ico|icon.svg|ruptix-icon.svg|manifest.webmanifest).*)"]
};
