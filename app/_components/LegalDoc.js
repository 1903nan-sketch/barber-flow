import Link from "next/link";
import {LEGAL_VERSION} from "../../lib/legal";

export default function LegalDoc({title,intro,sections}){
 const updated=new Date(LEGAL_VERSION+"T12:00:00").toLocaleDateString("pt-BR");
 return <main className="legal-page">
  <header className="legal-top"><Link href="/login" className="legal-brand"><span className="bt-mark" aria-hidden="true"/>RupControl</Link><nav><Link href="/termos">Termos de Uso</Link><Link href="/privacidade">Privacidade</Link></nav></header>
  <article className="legal-card">
   <span className="legal-kicker">DOCUMENTO LEGAL · VERSÃO {updated}</span>
   <h1>{title}</h1>
   <p className="legal-intro">{intro}</p>
   {sections.map(([heading,paragraphs])=><section key={heading}><h2>{heading}</h2>{paragraphs.map((p,i)=>Array.isArray(p)?<ul key={i}>{p.map(item=><li key={item}>{item}</li>)}</ul>:<p key={i}>{p}</p>)}</section>)}
  </article>
  <footer className="legal-foot">RupControl · by Ruptix</footer>
 </main>
}
