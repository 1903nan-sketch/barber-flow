import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {createHmac,randomBytes} from 'node:crypto';
export async function POST(req){
 const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 let payload;try{payload=await req.json()}catch{return NextResponse.json({error:'Requisição inválida.'},{status:400})}const {tenant}=payload||{};
 if(!token||!tenant)return NextResponse.json({error:'Sessão inválida.'},{status:401});
 const appId=process.env.INSTAGRAM_APP_ID,secret=process.env.INSTAGRAM_APP_SECRET;
 if(!appId||!secret)return NextResponse.json({error:'A integração Instagram ainda precisa ser configurada pelo administrador da plataforma.'},{status:503});
 const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false}});
 const {data:{user},error}=await sb.auth.getUser(token);if(error||!user)return NextResponse.json({error:'Sessão expirada.'},{status:401});
 const {data:m}=await sb.from('memberships').select('role,permissions,active,tenants(status)').eq('user_id',user.id).eq('tenant_id',tenant).maybeSingle();
 if(!m?.active||!['active','trial','pending','overdue'].includes(m.tenants?.status)||!(m.role==='owner'||m.role==='manager'&&m.permissions?.includes('settings')))return NextResponse.json({error:'Sem permissão para configurar integrações.'},{status:403});
 const data=Buffer.from(JSON.stringify({tenant,uid:user.id,ts:Date.now(),nonce:randomBytes(24).toString('hex')})).toString('base64url');
 const state=data+'.'+createHmac('sha256',secret).update(data).digest('base64url');
 const origin=new URL(req.url).origin,auth=new URL('https://www.instagram.com/oauth/authorize');
 auth.searchParams.set('client_id',appId);auth.searchParams.set('redirect_uri',process.env.INSTAGRAM_REDIRECT_URI||origin+'/api/instagram/callback');auth.searchParams.set('response_type','code');auth.searchParams.set('scope','instagram_business_basic');auth.searchParams.set('state',state);
 const res=NextResponse.json({url:auth.toString()});res.cookies.set('ig_state',state,{httpOnly:true,secure:true,sameSite:'lax',maxAge:600,path:'/'});return res;
}
