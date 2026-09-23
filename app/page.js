import Link from "next/link";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {createClient} from "@supabase/supabase-js";
import {ArrowUpRight,Scissors,Sparkles} from "lucide-react";
import {createClient} from "@supabase/supabase-js";
import RuptixLogo from "./_components/RuptixLogo";

async function getActiveUsers(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return 0;
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {count,error}=await admin.from("memberships").select("user_id,tenants!inner(status)",{count:"exact",head:true}).eq("active",true).eq("tenants.status","active");
 return error?0:(count||0);
}

async function getActiveUsers(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return 0;
 try{
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:tenants,error:tenantError}=await admin.from("tenants").select("id").eq("status","active");
  if(tenantError||!tenants?.length)return 0;
  const {data:memberships,error}=await admin.from("memberships").select("user_id").eq("active",true).in("tenant_id",tenants.map(t=>t.id));
  if(error)return 0;
  return new Set((memberships||[]).map(m=>m.user_id).filter(Boolean)).size;
 }catch{return 0}
}

export default async function HomePage(){
 const activeUsers=await getActiveUsers();
 const host=(await headers()).get("host")?.split(":")[0]?.toLowerCase();
 if(host==="barberflow.3ruptix.com") redirect("/login");
 const activeUsers=await getActiveUsers();

 return <main className="ruptix-hub rh-v2">
 <nav className="rh2-nav"><Link href="/" className="rh2-logo"><RuptixLogo/></Link><div><a href="#produtos">PRODUTOS</a><a href="#sobre">SOBRE</a></div><span className="rh2-nav-right"><span className="rh2-system-status"><i/> ONLINE <b>USERS: {activeUsers}</b></span><a href="#produtos" className="rh2-client">PRODUTOS <ArrowUpRight/></a></span></nav>
 <section className="rh2-hero"><div className="rh2-grid"/><div className="rh2-copy"><span className="rh2-label"><i/> SOFTWARE STUDIO · SÃO PAULO</span><h1>Construímos<br/>software que<br/><em>move negócios.</em></h1><p>Produtos digitais criados para resolver operações reais, automatizar processos e transformar empresas.</p></div><div className="rh2-side"><span>RUPTIX / 2026</span><b>BUILD<br/>BETTER<br/>SYSTEMS.</b><Sparkles/></div></section>
 <section className="rh2-products" id="produtos"><div className="rh2-title"><span>01 / ECOSSISTEMA</span><h2>Linhas<br/>Ruptix.</h2><p>Os softwares da Ruptix são organizados por linhas de negócio, preparados para crescer conforme novos sistemas entram no ecossistema.</p></div>
 <div className="rh2-line">
  <div className="rh2-line-head"><div><span>LINHA 01</span><h3>Beleza.</h3></div><p>Soluções digitais para barbearias, salões, estética e outros negócios do setor de beleza.</p></div>
  <Link href="/produtos/barber-flow" className="rh2-featured"><div className="rh2-card-head"><span className="rh2-live"><i/> PRODUTO ATIVO</span><span>01</span></div><div className="rh2-card-icon"><Scissors/></div><div className="rh2-card-copy"><span>BARBEARIAS · LINHA BELEZA</span><h3>Barber<br/>Flow.</h3><p>Uma plataforma completa para agenda, clientes, equipe, vendas e crescimento.</p><b>EXPLORAR PRODUTO <ArrowUpRight/></b></div></Link>
  <div className="rh2-next"><span>02</span><div><small>EM DESENVOLVIMENTO · LINHA BELEZA</small><h3>BeautyFlow.</h3></div><p>Software da linha de beleza voltado a salões, estética e operações do segmento.</p></div>
 </div></section>
 <section className="rh2-manifesto" id="sobre"><span>02 / RUPTIX</span><p>Não fazemos software para <i>parecer moderno.</i><br/>Fazemos software para <strong>funcionar melhor.</strong></p><div><b>PRODUTO</b><b>DESIGN</b><b>TECNOLOGIA</b></div></section>
 <section className="rh2-end"><div><span>RUPTIX®</span><h2>O próximo<br/>grande produto<br/>começa aqui.</h2></div><a href="mailto:contato@3ruptix.com">FALAR COM A RUPTIX <ArrowUpRight/></a></section>
 <footer className="rh2-footer"><b><RuptixLogo/></b><div className="rh2-footer-info"><span>SOFTWARE STUDIO</span><small>SAC: (11) 99999-9999</small><small>CNPJ: 12.345.678/0001-90</small></div><small>Idealizado em 15.09.2026</small></footer>
 </main>
}