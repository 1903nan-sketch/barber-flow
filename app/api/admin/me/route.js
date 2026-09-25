import {createClient} from "@supabase/supabase-js";
import {NextResponse} from "next/server";

export async function GET(request){
  try{
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
    const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");

    if(!url||!serviceKey) return NextResponse.json({error:"Configuração do servidor incompleta."},{status:500});
    if(!token) return NextResponse.json({error:"Sessão inválida."},{status:401});

    const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:userError}=await admin.auth.getUser(token);
    if(userError||!user) return NextResponse.json({error:"Sessão expirada."},{status:401});

    const {data:access,error:accessError}=await admin
      .from("platform_admins")
      .select("access_role")
      .eq("user_id",user.id)
      .maybeSingle();

    if(accessError) return NextResponse.json({error:accessError.message},{status:500});
    if(!access) return NextResponse.json({role:null},{status:403});

    return NextResponse.json({role:access.access_role,email:user.email||""});
  }catch(error){
    return NextResponse.json({error:error?.message||"Não foi possível validar o acesso."},{status:500});
  }
}
