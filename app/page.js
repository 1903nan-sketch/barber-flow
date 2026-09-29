import Link from "next/link";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {createClient} from "@supabase/supabase-js";
import {ArrowUpRight,Check,Code2,GitBranch,Scissors,Sparkles,Workflow} from "lucide-react";

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
 if(host==="barberflow.3ruptix.com"||host==="barbertix.3ruptix.com") redirect("/login");

 return <main className="ruptix-hub rh-v2">
 <nav className="rh2-nav"><Link href="/" className="rh2-logo">RUPTIX<span>®</span></Link><div><a href="#sob-medida">SOFTWARE SOB MEDIDA</a><a href="#produtos">PRODUTOS</a><a href="#sobre">SOBRE</a></div><span className="rh2-nav-right"><span className="rh2-system-status"><i/> ONLINE <b>USERS: {activeUsers}</b></span><a href="mailto:vendas@3ruptix.com?subject=Software%20personalizado" className="rh2-client">CRIAR UM SISTEMA <ArrowUpRight/></a></span></nav>

 <section className="rh2-hero"><div className="rh2-grid"/><div className="rh2-copy"><span className="rh2-label"><i/> SOFTWARE STUDIO · SÃO PAULO</span><h1>Software<br/>feito para<br/><em>o seu negócio.</em></h1><p>A Ruptix desenvolve <strong>softwares personalizados</strong> para empresas que precisam organizar operações, automatizar processos e transformar uma necessidade real em um sistema próprio.</p><div className="rh2-hero-actions"><a className="rh2-hero-primary" href="mailto:vendas@3ruptix.com?subject=Quero%20um%20software%20personalizado">QUERO UM SOFTWARE PERSONALIZADO <ArrowUpRight/></a><a href="#produtos">VER PRODUTOS RUPTIX</a></div></div><div className="rh2-side"><span>RUPTIX / 2026</span><b>BUILD<br/>FOR YOUR<br/>BUSINESS.</b><Sparkles/></div></section>

 <section className="rh2-custom-v2" id="sob-medida">
  <div className="rh2-custom-v2-copy">
   <span>01 / SOFTWARE SOB MEDIDA</span>
   <h2>Seu negócio não precisa caber em um software genérico.</h2>
   <p>Desenvolvemos sistemas personalizados em torno da sua operação — com as telas, permissões, automações, integrações e regras que a sua empresa realmente precisa.</p>
   <div className="rh2-custom-v2-points">
    <b><Check/> Sistema criado para o seu fluxo</b>
    <b><Check/> Integrações com serviços que você já usa</b>
    <b><Check/> Estrutura pronta para crescer com a empresa</b>
   </div>
   <a href="mailto:vendas@3ruptix.com?subject=Quero%20um%20software%20personalizado">APRESENTAR MEU PROJETO <ArrowUpRight/></a>
  </div>

  <div className="rh2-custom-v2-stage">
   <div className="rh2-custom-v2-window">
    <header><span><i/><i/><i/></span><b>RUPTIX / PROJETO PERSONALIZADO</b><small>BUILD_01</small></header>
    <div className="rh2-custom-v2-window-body">
     <div className="rh2-custom-v2-project">
      <small>DO PROBLEMA AO PRODUTO</small>
      <h3>Transformamos processos em software.</h3>
      <p>Do primeiro mapeamento até o sistema rodando em produção.</p>
     </div>
     <div className="rh2-custom-v2-flow">
      <article><span>01</span><div><Workflow/><b>Entender</b><small>processos e gargalos</small></div></article>
      <article><span>02</span><div><Code2/><b>Construir</b><small>sistema sob medida</small></div></article>
      <article><span>03</span><div><GitBranch/><b>Integrar</b><small>APIs, pagamentos e automações</small></div></article>
      <article><span>04</span><div><Sparkles/><b>Evoluir</b><small>novas funções conforme o negócio cresce</small></div></article>
     </div>
    </div>
   </div>
   <div className="rh2-custom-v2-tags"><span>SISTEMAS INTERNOS</span><span>SAAS</span><span>AUTOMAÇÕES</span><span>PORTAIS</span><span>INTEGRAÇÕES</span></div>
  </div>
 </section>

 <section className="rh2-products" id="produtos"><div className="rh2-title"><span>02 / PRODUTOS PRÓPRIOS</span><h2>Tecnologia<br/>que já opera.</h2><p>Além de projetos sob medida, a Ruptix cria produtos próprios para segmentos específicos. São sistemas reais construídos a partir de operações reais.</p></div>
 <div className="rh2-line">
  <div className="rh2-line-head"><div><span>LINHA 01</span><h3>Beleza.</h3></div><p>Soluções digitais para barbearias, salões, estética e outros negócios do setor de beleza.</p></div>
  <Link href="/produtos/barber-flow" className="rh2-featured"><div className="rh2-card-head"><span className="rh2-live"><i/> PRODUTO ATIVO</span><span>01</span></div><div className="rh2-card-icon"><Scissors/></div><div className="rh2-card-copy"><span>BARBEARIAS · LINHA BELEZA</span><h3>Barber<br/>Tix.</h3><p>Uma plataforma completa para agenda, clientes, equipe, vendas e crescimento.</p><b>EXPLORAR PRODUTO <ArrowUpRight/></b></div></Link>
  <a className="rh2-featured rh2-featured-beauty" href="https://beautytix.3ruptix.com/login"><div className="rh2-card-head"><span className="rh2-live rh2-live-beauty"><i/> PRODUTO ATIVO</span><span>02</span></div><div className="rh2-card-icon rh2-card-icon-beauty"><Sparkles/></div><div className="rh2-card-copy"><span>SALÕES & ESTÉTICA · LINHA BELEZA</span><h3>Beauty<br/>Tix.</h3><p>Gestão completa para salões, estética e negócios de beleza.</p><b>EXPLORAR PRODUTO <ArrowUpRight/></b></div></a>
 </div></section>

 <section className="rh2-manifesto" id="sobre"><span>03 / RUPTIX</span><p>Da ideia à operação.<br/>Criamos tecnologia para <strong>resolver o problema da sua empresa.</strong></p><div><b>ESTRATÉGIA</b><b>DESIGN</b><b>DESENVOLVIMENTO</b><b>AUTOMAÇÃO</b></div></section>
 <section className="rh2-end"><div><span>SOFTWARE SOB MEDIDA · RUPTIX®</span><h2>Tem um processo<br/>que ainda depende<br/>de planilha e improviso?</h2></div><a href="mailto:vendas@3ruptix.com?subject=Quero%20transformar%20um%20processo%20em%20software">VAMOS TRANSFORMAR EM SOFTWARE <ArrowUpRight/></a></section>
 <footer className="rh2-footer"><b>RUPTIX®</b><div className="rh2-footer-info"><span>SOFTWARE STUDIO</span><small>Softwares personalizados · Produtos digitais · Automações</small><small>Contato: <a href="mailto:vendas@3ruptix.com">vendas@3ruptix.com</a></small></div><small>Idealizado em 15.09.2026</small></footer>
 </main>
}