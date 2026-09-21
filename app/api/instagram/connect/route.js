import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
export async function GET(req){
 const url=new URL(req.url),token=url.searchParams.get("token"),tenant=url.searchParams.get("tenant");
 if(!token||!tenant)return NextResponse.redirect(new URL("/dashboard/configuracoes?instagram=erro",url.origin));
 const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{global:{headers:{Authorization:"Bearer "+token}}});
 const {data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.redirect(new URL("/login",url.origin));
 const {data}=await sb.from("memberships").select("tenant_id").eq("user_id",user.id).eq("tenant_id",tenant).maybeSingle();if(!data)return NextResponse.redirect(new URL("/dashboard/configuracoes?instagram=erro",url.origin));
 const state=Buffer.from(JSON.stringify({tenant,uid:user.id,ts:Date.now()})).toString("base64url");
 const redirect=process.env.INSTAGRAM_REDIRECT_URI||url.origin+"/api/instagram/callback";
 const auth=new URL("https://www.instagram.com/oauth/authorize");
 auth.searchParams.set("client_id",process.env.INSTAGRAM_APP_ID||"");auth.searchParams.set("redirect_uri",redirect);auth.searchParams.set("response_type","code");auth.searchParams.set("scope","instagram_business_basic");auth.searchParams.set("state",state);
 const res=NextResponse.redirect(auth);res.cookies.set("ig_state",state,{httpOnly:true,secure:true,sameSite:"lax",maxAge:600,path:"/"});return res;
}