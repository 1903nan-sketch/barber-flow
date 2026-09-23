"use client";

import { MessageCircle, Bot, UserRound, ExternalLink, ShieldCheck } from "lucide-react";

export default function WhatsAppPage(){
  return <main className="content">
    <div className="topbar">
      <div>
        <p className="eyebrow">Automação</p>
        <h1>WhatsApp</h1>
        <p className="topbar-copy">Conecte o número da barbearia e transforme conversas em agendamentos.</p>
      </div>
    </div>

    <section className="box" style={{maxWidth:900}}>
      <div className="box-head"><div><h2>Conexão do WhatsApp</h2><p>Integração oficial via WhatsApp Business Platform.</p></div></div>
      <div style={{display:"grid",gap:12}}>
        <div className="appointment"><span className="quick-icon green"><MessageCircle size={18}/></span><div className="appointment-main"><b>Status</b><p>Nenhum número conectado ainda.</p></div></div>
        <div className="appointment"><span className="quick-icon purple"><Bot size={18}/></span><div className="appointment-main"><b>Robô de agendamento</b><p>Serviço → profissional → horário → confirmação automática.</p></div></div>
        <div className="appointment"><span className="quick-icon blue"><UserRound size={18}/></span><div className="appointment-main"><b>Atendimento humano</b><p>Ao pedir um atendente, a automação pausa a conversa.</p></div></div>
      </div>
      <div style={{marginTop:20,padding:16,border:"1px solid var(--line)",borderRadius:12}}>
        <strong style={{fontSize:12,display:"flex",alignItems:"center",gap:7}}><ShieldCheck size={17}/> Próxima etapa</strong>
        <p style={{fontSize:11,color:"var(--muted)",lineHeight:1.6}}>Vamos conectar a conta Meta da barbearia. Tokens e credenciais serão mantidos somente no servidor e nunca no navegador.</p>
        <button className="primary" type="button" disabled style={{border:0,opacity:.55,cursor:"not-allowed"}}><ExternalLink size={16}/> Conectar WhatsApp</button>
      </div>
    </section>
  </main>;
}
