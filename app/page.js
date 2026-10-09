import Link from "next/link";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {createClient} from "@supabase/supabase-js";
import {ArrowUpRight,BarChart3,Bot,CalendarCheck,CalendarDays,Check,Code2,Cpu,GitBranch,Globe2,Mail,Package,Percent,ShieldCheck,Sparkles,Users,WalletCards,Workflow,Zap} from "lucide-react";
import RuptixFx from "./_components/RuptixFx";
import {APP_HOSTS,SIGNUP_URL} from "../lib/site";
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
const rcFeatures=[["Agenda por profissional",CalendarDays],["Site de agendamento",Globe2],["Caixa rápido e PIX",WalletCards],["Clientes e conta do cliente",Users],["Comissões da equipe",Percent],["Estoque",Package],["Financeiro e relatórios",BarChart3],["Robô do WhatsApp",Bot]];
const capabilities=["SISTEMAS INTERNOS","SAAS","AUTOMAÇÕES","PORTAIS","INTEGRAÇÕES","APLICATIVOS WEB","PAGAMENTOS","WHATSAPP","PAINÉIS DE GESTÃO","APIs"];

export default async function HomePage(){
 const activeUsers=await getActiveUsers();
 const host=(await headers()).get("host")?.split(":")[0]?.toLowerCase();
 if(APP_HOSTS.includes(host)) redirect("/login");

 return <main className="rx">
  <RuptixFx/>
  <div className="rx-aurora" aria-hidden="true"><i/><i/><i/><i/></div>
  <div className="rx-grid" aria-hidden="true"/>

  <a className="rx-announce" href={SIGNUP_URL}><b>14 DIAS GRÁTIS</b><span>Teste o RupControl, o sistema de gestão da Ruptix para todo tipo de negócio</span><ArrowUpRight/></a>

  <nav className="rx-nav">
   <Link href="/" className="rx-logo" aria-label="Ruptix — início">RUPTIX<sup>®</sup></Link>
   <div className="rx-nav-links"><a href="#rupcontrol">RupControl</a><a href="#sob-medida">Software sob medida</a><a href="#produtos">Produtos</a><a href="#sobre">Sobre</a><a href="#contato">Contato</a></div>
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
     <a className="rx-btn rx-btn-glass" href="#rupcontrol">RupControl: 14 dias grátis</a>
    </div>
    <div className="rx-trust" data-reveal style={{"--d":".8s"}}><span><ShieldCheck/>Código próprio</span><span><Zap/>Entrega contínua</span><span><Cpu/>Nuvem e IA</span></div>
   </div>
  </section>

  <div className="rx-marquee" aria-label="O que desenvolvemos">
   <div className="rx-marquee-track">{[...capabilities,...capabilities].map((c,i)=><span key={i}>{c}<i/></span>)}</div>
  </div>

  <section className="rx-section rx-rc" id="rupcontrol">
   <div className="rx-rc-trial" data-reveal>
    <span>TESTE GRÁTIS</span>
    <b>14</b>
    <strong>dias grátis</strong>
    <small>Sem cartão de crédito e sem cobrança no cadastro. O pagamento só começa depois do teste, se você quiser continuar.</small>
   </div>
   <div className="rx-rc-copy" data-reveal style={{"--d":".1s"}}>
    <span className="rx-kicker">PRODUTO RUPTIX · PARA TODO TIPO DE NEGÓCIO</span>
    <h2>A gestão completa do seu negócio, grátis por 14 dias.</h2>
    <p>Seja qual for o seu ramo, o RupControl reúne em um só painel tudo o que você usa no dia a dia para atender clientes: agenda de cada profissional, página própria para os clientes agendarem, caixa rápido com PIX, clientes, comissões, estoque e financeiro. O robô do WhatsApp confirma e lembra os horários sozinho.</p>
    <ul className="rx-rc-features">{rcFeatures.map(([t,Icon])=><li key={t}><Icon/>{t}</li>)}</ul>
    <p className="rx-rc-note">Site de agendamento e robô do WhatsApp nos planos Pro.</p>
    <div className="rx-actions"><a className="rx-btn rx-btn-primary" href={SIGNUP_URL}>Criar conta grátis <ArrowUpRight/></a><Link className="rx-btn rx-btn-glass" href="/produtos/rupcontrol">Ver planos e recursos</Link></div>
   </div>
  </section>

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
   <div className="rx-glass rx-stat" data-reveal style={{"--d":".2s"}}><b data-count="2">0</b><span>produtos próprios em operação</span></div>
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
   <div className="rx-line-head" data-reveal><span>LINHA 01</span><h3>Gestão.</h3><p>Sistemas prontos para organizar agenda, atendimento, vendas e financeiro de qualquer negócio.</p></div>
   <div className="rx-cards">
    <Link href="/produtos/rupcontrol" className="rx-glass rx-product" data-reveal>
     <div className="rx-product-head"><span className="rx-live"><i/> 14 DIAS GRÁTIS</span><span>01</span></div>
     <div className="rx-product-icon"><CalendarCheck/></div>
     <span className="rx-product-tag">PARA TODO TIPO DE NEGÓCIO</span>
     <h3>Rup<br/>Control.</h3>
     <p>Gestão completa para qualquer negócio que atende clientes: agenda, site de agendamento, caixa, equipe e financeiro. Teste grátis por 14 dias.</p>
     <b>Conhecer e testar grátis <ArrowUpRight/></b>
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
