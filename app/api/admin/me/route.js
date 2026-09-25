import {createClient} from "@supabase/supabase-js";
import {NextResponse} from "next/server";

export async function GET(request){
  try{
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");

    if(!url||!publicKey) return NextResponse.json({error:"Configuração pública do Supabase incompleta."},{status:500});
    if(!token) return NextResponse.json({error:"Sessão inválida."},{status:401});

    const client=createClient(url,publicKey,{
      auth:{persistSession:false,autoRefreshToken:false},
      global:{headers:{Authorization:"Bearer "+token}}
    });

    const {data:{user},error:userError}=await client.auth.getUser(token);
    if(userError||!user) return NextResponse.json({error:"Sessão expirada."},{status:401});

    const {data:role,error:roleError}=await client.rpc("platform_admin_me");
    if(roleError){
      console.error("platform_admin_me failed",roleError.message);
      return NextResponse.json({error:"Não foi possível validar o acesso mestre."},{status:500});
    }
    if(!role) return NextResponse.json({role:null},{status:403});

    return NextResponse.json({role,email:user.email||""});
  }catch(error){
    console.error("admin/me failed",error?.message||error);
    return NextResponse.json({error:error?.message||"Não foi possível validar o acesso."},{status:500});
  }
}
