import Link from "next/link";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {createClient} from "@supabase/supabase-js";
import {ArrowUpRight,Check,Code2,Cpu,GitBranch,Mail,Scissors,ShieldCheck,Sparkles,Workflow,Zap} from "lucide-react";
import RuptixFx from "./_components/RuptixFx";
import "./ruptix-home.css";

export const metadata={
 title:"Ruptix | Software sob medida",
 description:"A Ruptix desenvolve softwares personalizados, automações e produtos digitais. Fale com a gente: rup@3ruptix.com."
};
export const viewport={themeColor:"#eef1f8"};

const EMAIL="rup@3ruptix.com";
const mail=subject=>`mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`;

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

const words=(text,start=0)=>text.split(" ").map((w,i)=><span className="rx-word" style={{"--i":start+i}} key={i}>{w}&nbsp;</span>);
const capabilities=["SISTEMAS INTERNOS","SAAS","AUTOMAÇÕES","PORTAIS","INTEGRAÇÕES","APLICATIVOS WEB","PAGAMENTOS","WHATSAPP","PAINÉIS DE GESTÃO","APIs"];

export default async function HomePage(){
 const activeUsers=await getActiveUsers();
 const host=(await headers()).get("host")?.split(":")[0]?.toLowerCase();
 if(host==="barberflow.3ruptix.com"||host==="barbertix.3ruptix.com") redirect("/login");

 return <main className="rx">
  <RuptixFx/>
  <div className="rx-aurora" aria-hidden="true"><i/><i/><i/><i/></div>
  <div className="rx-grid" aria-hidden="true"/>

  <nav className="rx-nav">
   <Link href="/" className="rx-logo" aria-label="Ruptix — início">RUPTIX<sup>®</sup></Link>
   <div className="rx-nav-links"><a href="#sob-medida">Software sob medida</a><a href="#produtos">Produtos</a><a href="#sobre">Sobre</a><a href="#contato">Contato</a></div>
   <div className="rx-nav-right">
    <span className="rx-status"><i/> ONLINE{activeUsers>0&&<b>· {activeUsers} usuários</b>}</span>
    <a href={mail("Software personalizado")} className="rx-btn rx-btn-dark rx-btn-sm">Criar um sistema <ArrowUpRight/></a>
   </div>
  </nav>

  <section className="rx-hero">
   <div className="rx-hero-copy">
    <span className="rx-chip" data-reveal><i/> SOFTWARE STUDIO · SÃO PAULO</span>
    <h1 aria-label="Software feito para o seu negócio.">
     <span className="rx-line">{words("Software")}</span>
     <span className="rx-line">{words("feito para",1)}</span>
     <span className="rx-line rx-grad">{words("o seu negócio.",3)}</span>
    </h1>
    <p data-reveal style={{"--d":".5s"}}>A Ruptix desenvolve <strong>softwares personalizados</strong> para empresas que precisam organizar operações, automatizar processos e transformar uma necessidade real em um sistema próprio.</p>
    <div className="rx-actions" data-reveal style={{"--d":".65s"}}>
     <a className="rx-btn rx-btn-primary" href={mail("Quero um software personalizado")}>Quero um software personalizado <ArrowUpRight/></a>
     <a className="rx-btn rx-btn-glass" href="#produtos">Ver produtos Ruptix</a>
    </div>
    <div className="rx-trust" data-reveal style={{"--d":".8s"}}><span><ShieldCheck/>Código próprio</span><span><Zap/>Entrega contínua</span><span><Cpu/>Nuvem e IA</span></div>
   </div>
  </section>

  <div className="rx-marquee" aria-label="O que desenvolvemos">
   <div className="rx-marquee-track">{[...capabilities,...capabilities].map((c,i)=><span key={i}>{c}<i/></span>)}</div>
  </div>

  <section className="rx-section rx-custom" id="sob-medida">
   <div className="rx-custom-copy" data-reveal>
    <span className="rx-kicker">01 / SOFTWARE SOB MEDIDA</span>
    <h2>Seu negócio não precisa caber em um software genérico.</h2>
    <p>Desenvolvemos sistemas personalizados em torno da sua operação — com as telas, permissões, automações, integrações e regras que a sua empresa realmente precisa.</p>
    <ul className="rx-checks">
     <li><Check/> Sistema criado para o seu fluxo</li>
     <li><Check/> Integrações com serviços que você já usa</li>
     <li><Check/> Estrutura pronta para crescer com a empresa</li>
    </ul>
    <a className="rx-btn rx-btn-primary" href={mail("Quero apresentar meu projeto")}>Apresentar meu projeto <ArrowUpRight/></a>
   </div>
   <div className="rx-flow" data-reveal style={{"--d":".15s"}}>
    {[["01","Entender","processos e gargalos",Workflow],["02","Construir","sistema sob medida",Code2],["03","Integrar","APIs, pagamentos e automações",GitBranch],["04","Evoluir","novas funções conforme o negócio cresce",Sparkles]].map(([n,t,s,Icon],i)=>
     <article className="rx-glass rx-step" style={{"--s":i}} key={n}><span className="rx-step-n">{n}</span><div className="rx-step-icon"><Icon/></div><b>{t}</b><small>{s}</small><i className="rx-step-bar"/></article>)}
   </div>
  </section>

  <section className="rx-stats" aria-label="Números da Ruptix">
   <div className="rx-glass rx-stat" data-reveal><b data-count="100" data-suffix="%">0%</b><span>código próprio, sem software de prateleira</span></div>
   <div className="rx-glass rx-stat" data-reveal style={{"--d":".1s"}}><b data-count="24" data-suffix="/7">0/7</b><span>sistemas e automações em operação</span></div>
   <div className="rx-glass rx-stat" data-reveal style={{"--d":".2s"}}><b data-count="2">0</b><span>produtos próprios na linha beleza</span></div>
   {activeUsers>0
    ?<div className="rx-glass rx-stat" data-reveal style={{"--d":".3s"}}><b data-count={activeUsers}>0</b><span>usuários ativos agora nas plataformas</span></div>
    :<div className="rx-glass rx-stat" data-reveal style={{"--d":".3s"}}><b data-count="4">0</b><span>etapas do problema ao produto em produção</span></div>}
  </section>

  <section className="rx-section rx-products" id="produtos">
   <div className="rx-title" data-reveal>
    <span className="rx-kicker">02 / PRODUTOS PRÓPRIOS</span>
    <h2>Tecnologia<br/>que já opera.</h2>
    <p>Além de projetos sob medida, a Ruptix cria produtos próprios para segmentos específicos. São sistemas reais, construídos a partir de operações reais.</p>
   </div>
   <div className="rx-line-head" data-reveal><span>LINHA 01</span><h3>Beleza.</h3><p>Soluções digitais para barbearias, salões, estética e outros negócios do setor de beleza.</p></div>
   <div className="rx-cards">
    <Link href="/produtos/barber-flow" className="rx-glass rx-product" data-reveal>
     <div className="rx-product-head"><span className="rx-live"><i/> PRODUTO ATIVO</span><span>01</span></div>
     <div className="rx-product-icon"><Scissors/></div>
     <span className="rx-product-tag">BARBEARIAS · LINHA BELEZA</span>
     <h3>Barber<br/>Tix.</h3>
     <p>Plataforma completa para agenda, clientes, equipe, vendas e crescimento da barbearia.</p>
     <b>Explorar produto <ArrowUpRight/></b>
    </Link>
    <Link href="/produtos/beautytix" className="rx-glass rx-product rx-product-beauty" data-reveal style={{"--d":".12s"}}>
     <div className="rx-product-head"><span className="rx-live"><i/> PRODUTO ATIVO</span><span>02</span></div>
     <div className="rx-product-icon"><Sparkles/></div>
     <span className="rx-product-tag">SALÕES & ESTÉTICA · LINHA BELEZA</span>
     <h3>Beauty<br/>Tix.</h3>
     <p>Gestão completa para salões, estúdios e clínicas de estética, com agendamento on-line.</p>
     <b>Explorar produto <ArrowUpRight/></b>
    </Link>
   </div>
  </section>

  <section className="rx-section rx-manifesto" id="sobre">
   <span className="rx-kicker" data-reveal>03 / RUPTIX</span>
   <p data-reveal>Da ideia à operação.<br/>Criamos tecnologia para <strong>resolver o problema da sua empresa.</strong></p>
   <div className="rx-pills" data-reveal style={{"--d":".15s"}}><b>Estratégia</b><b>Design</b><b>Desenvolvimento</b><b>Automação</b><b>Inteligência artificial</b></div>
  </section>

  <section className="rx-end" id="contato">
   <div className="rx-glass rx-end-card" data-reveal>
    <div>
     <span className="rx-kicker">SOFTWARE SOB MEDIDA · RUPTIX®</span>
     <h2>Tem um processo que ainda depende de planilha e improviso?</h2>
     <p>Conte o que sua empresa precisa. Respondemos pelo e-mail <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.</p>
    </div>
    <div className="rx-end-actions">
     <a className="rx-btn rx-btn-primary rx-btn-lg" href={mail("Quero transformar um processo em software")}>Vamos transformar em software <ArrowUpRight/></a>
     <a className="rx-btn rx-btn-glass" href={`mailto:${EMAIL}`}><Mail/> {EMAIL}</a>
    </div>
   </div>
  </section>

  <footer className="rx-footer">
   <b className="rx-logo">RUPTIX<sup>®</sup></b>
   <div><span>SOFTWARE STUDIO</span><small>Softwares personalizados · Produtos digitais · Automações</small><small>Contato: <a href={`mailto:${EMAIL}`}>{EMAIL}</a></small></div>
   <small>Idealizado em 15.09.2026</small>
  </footer>
 </main>
}
