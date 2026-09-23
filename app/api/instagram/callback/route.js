import {createHmac,timingSafeEqual} from "node:crypto";
import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
export async function GET(req){
 const url=new URL(req.url),code=url.searchParams.get("code"),state=url.searchParams.get("state"),saved=req.cookies.get("ig_state")?.value;
 const back=(q)=>NextResponse.redirect(new URL("/dashboard/configuracoes?instagram="+q,url.origin));
 if(!process.env.INSTAGRAM_APP_SECRET||!process.env.SUPABASE_SERVICE_ROLE_KEY||!code||!state||state!==saved)return back("erro");
 let s;try{const [data,signature]=state.split(".");const expected=createHmac("sha256",process.env.INSTAGRAM_APP_SECRET||"").update(data).digest("base64url");if(!signature||signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return back("erro");s=JSON.parse(Buffer.from(data,"base64url").toString())}catch{return back("erro")}
 if(!Number.isFinite(s.ts)||s.ts>Date.now()||Date.now()-s.ts>600000)return back("erro");
 const redirect=process.env.INSTAGRAM_REDIRECT_URI||url.origin+"/api/instagram/callback";
 const body=new URLSearchParams({client_id:process.env.INSTAGRAM_APP_ID||"",client_secret:process.env.INSTAGRAM_APP_SECRET||"",grant_type:"authorization_code",redirect_uri:redirect,code});
 const tr=await fetch("https://api.instagram.com/oauth/access_token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});const tok=await tr.json();if(!tr.ok||!tok.access_token)return back("erro");
 const pr=await fetch("https://graph.instagram.com/me?fields=user_id,username&access_token="+encodeURIComponent(tok.access_token));const profile=await pr.json();if(!pr.ok)return back("erro");
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
 const {data:member}=await admin.from("memberships").select("active,role,permissions,tenants(status)").eq("tenant_id",s.tenant).eq("user_id",s.uid).maybeSingle();
 if(!member?.active||!["active","trial","pending","overdue"].includes(member.tenants?.status)||!(member.role==="owner"||member.role==="manager"&&member.permissions?.includes("settings")))return back("erro");
 const {error}=await admin.from("tenants").update({instagram_user_id:String(profile.user_id||tok.user_id||""),instagram_username:profile.username||"",instagram_access_token:tok.access_token,instagram_connected_at:new Date().toISOString()}).eq("id",s.tenant);
 if(error)return back("erro");const res=back("conectado");res.cookies.delete("ig_state");return res;
}