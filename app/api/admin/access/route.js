import {createClient} from "@supabase/supabase-js";
import {NextResponse} from "next/server";
async function ctx(request){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
 if(!url||!key||!token)return {};
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user}}=await admin.auth.getUser(token);
 if(!user)return {};
 const {data:pa}=await admin.from("platform_admins").select("access_role").eq("user_id",user.id).maybeSingle();
 return {admin,user,role:pa?.access_role};
}
export async function GET(request){
 const {admin,role}=await ctx(request); if(!admin||role!=="full")return NextResponse.json({error:"Acesso restrito."},{status:403});
 const [{data:members},{data:staff},{data:tenants}]=await Promise.all([
  admin.from("memberships").select("tenant_id,user_id,name,role,active"),
  admin.from("staff_logins").select("tenant_id,user_id,username,login_email"),
  admin.from("tenants").select("id,name")
 ]);
 const users=[];let page=1;
 while(page<=20){const {data}=await admin.auth.admin.listUsers({page,perPage:1000});users.push(...(data?.users||[]));if((data?.users||[]).length<1000)break;page++}
 const um=new Map(users.map(u=>[u.id,u]));
 return NextResponse.json({items:(members||[]).map(m=>{const u=um.get(m.user_id),s=(staff||[]).find(x=>x.user_id===m.user_id&&x.tenant_id===m.tenant_id);return {...m,tenant:(tenants||[]).find(t=>t.id===m.tenant_id)?.name||"",email:u?.email||s?.login_email||"",username:s?.username||"",last_sign_in_at:u?.last_sign_in_at||null}})});
}
export async function POST(request){
 const {admin,role}=await ctx(request); if(!admin||role!=="full")return NextResponse.json({error:"Acesso restrito."},{status:403});
 const body=await request.json(),password=String(body.password||""); if(password.length<8)return NextResponse.json({error:"A nova senha precisa ter 8 caracteres."},{status:400});
 const {error}=await admin.auth.admin.updateUserById(body.user_id,{password});if(error)return NextResponse.json({error:error.message},{status:400});
 return NextResponse.json({ok:true});
}