import Link from "next/link";
import {ArrowRight,Boxes,Code2,Scissors,Sparkles} from "lucide-react";

export default function HomePage(){return <main className="ruptix-hub">
 <nav className="rh-nav"><Link href="/" className="rh-logo">RUPTIX<span>.</span></Link><div><a href="#produtos">Produtos</a><a href="#empresa">Ruptix</a></div><Link href="/login" className="rh-access">Área do cliente</Link></nav>
 <section className="rh-hero"><div className="rh-orb"/><span className="rh-kicker"><Sparkles/> SOFTWARE. PRODUTO. INOVAÇÃO.</span><h1>Ideias que viram<br/><em>tecnologia.</em></h1><p>A Ruptix desenvolve softwares para transformar operações, simplificar negócios e criar novas experiências digitais.</p><a className="rh-down" href="#produtos">Conheça nossos produtos <ArrowRight/></a></section>
 <section className="rh-products" id="produtos"><header><div><span>ECOSSISTEMA RUPTIX</span><h2>Nossos produtos.</h2></div><p>Soluções independentes, criadas pela Ruptix para diferentes mercados e operações.</p></header>
 <div className="rh-product-grid">
  <Link href="/produtos/barber-flow" className="rh-product-card live"><div className="rh-product-top"><span className="rh-status">DISPONÍVEL</span><div className="rh-product-icon"><Scissors/></div></div><div className="rh-product-body"><small>GESTÃO PARA BARBEARIAS</small><h3>Barber Flow</h3><p>Agenda, clientes, equipe, vendas, pagamentos e presença digital em uma única plataforma.</p><span className="rh-product-link">Conhecer produto <ArrowRight/></span></div><b className="rh-number">01</b></Link>
  <article className="rh-product-card soon"><div className="rh-product-top"><span className="rh-status">EM BREVE</span><div className="rh-product-icon"><Boxes/></div></div><div className="rh-product-body"><small>PRÓXIMO PRODUTO</small><h3>O próximo pode mudar tudo.</h3><p>Novas soluções estão sendo desenvolvidas para ampliar o ecossistema Ruptix.</p></div><b className="rh-number">02</b></article>
 </div></section>
 <section className="rh-about" id="empresa"><div className="rh-about-icon"><Code2/></div><div><span>POR TRÁS DOS PRODUTOS</span><h2>Ruptix.</h2><p>Uma software house focada em construir produtos digitais simples, fortes e preparados para crescer.</p></div><strong>BUILD.<br/>BREAK.<br/><em>EVOLVE.</em></strong></section>
 <footer className="rh-footer"><b>RUPTIX<span>.</span></b><p>Produtos digitais para negócios reais.</p><small>© 2026 Ruptix. Todos os direitos reservados.</small></footer>
 </main>}