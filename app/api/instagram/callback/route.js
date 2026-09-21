import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
export async function GET(req){
 const url=new URL(req.url),code=url.searchParams.get("code"),state=url.searchParams.get("state"),saved=req.cookies.get("ig_state")?.value;
 const back=(q)=>NextResponse.redirect(new URL("/dashboard/configuracoes?instagram="+q,url.origin));
 if(!code||!state||state!==saved)return back("erro");
 let s;try{s=JSON.parse(Buffer.from(state,"base64url").toString())}catch{return back("erro")}
 if(Date.now()-Number(s.ts)>600000)return back("erro");
 const redirect=process.env.INSTAGRAM_REDIRECT_URI||url.origin+"/api/instagram/callback";
 const body=new URLSearchParams({client_id:process.env.INSTAGRAM_APP_ID||"",client_secret:process.env.INSTAGRAM_APP_SECRET||"",grant_type:"authorization_code",redirect_uri:redirect,code});
 const tr=await fetch("https://api.instagram.com/oauth/access_token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});const tok=await tr.json();if(!tr.ok||!tok.access_token)return back("erro");
 const pr=await fetch("https://graph.instagram.com/me?fields=user_id,username&access_token="+encodeURIComponent(tok.access_token));const profile=await pr.json();if(!pr.ok)return back("erro");
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
 const {error}=await admin.rpc("save_instagram_connection",{t:s.tenant,p_user_id:String(profile.user_id||tok.user_id||""),p_username:profile.username||"",p_token:tok.access_token});
 if(error)return back("erro");const res=back("conectado");res.cookies.delete("ig_state");return res;
}