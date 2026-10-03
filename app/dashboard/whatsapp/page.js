"use client";
import {notify} from "../../../lib/notify";

import {useCallback,useEffect,useMemo,useState} from "react";
import {Bot,CheckCircle2,ExternalLink,MessageCircle,RefreshCw,ShieldCheck,Smartphone,Unplug,UserRound} from "lucide-react";
import {supabase} from "../../../lib/supabase";
import ModuleShell from "../_components/ModuleShell";

const labels={
  not_configured:"Configuração pendente",
  disconnected:"Desconectado",
  creating:"Criando conexão",
  connecting:"Aguardando QR Code",
  connected:"Conectado",
  error:"Erro na conexão"
};

function WhatsAppContent({workspace}){
  const tenant=workspace.tenant,[status,setStatus]=useState("loading"),[qr,setQr]=useState(""),[phone,setPhone]=useState(""),[configured,setConfigured]=useState(true),[aiConfigured,setAiConfigured]=useState(false),[webhookSynced,setWebhookSynced]=useState(false),[webhookError,setWebhookError]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const qrSrc=useMemo(()=>!qr?"":qr.startsWith("data:image")?qr:"data:image/png;base64,"+qr,[qr]);

  const authToken=useCallback(async()=>{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.access_token)throw new Error("Sessão expirada. Entre novamente.");
    return session.access_token;
  },[]);

  const load=useCallback(async()=>{
    try{
      const token=await authToken();
      const res=await fetch("/api/whatsapp/evolution/status?tenant="+encodeURIComponent(tenant.id),{
        cache:"no-store",headers:{Authorization:"Bearer "+token}
      });
      const out=await res.json();
      if(!res.ok)throw new Error(out.error||"Não foi possível consultar o WhatsApp.");
      setError("");
      setConfigured(out.configured!==false);
      setAiConfigured(out.ai_configured===true);
      setWebhookSynced(out.webhook_synced===true);
      setWebhookError(out.webhook_error||"");
      setStatus(out.status||"disconnected");
      setPhone(out.phone||"");
      if(out.qrcode)setQr(out.qrcode);
      if(out.connected)setQr("");
    }catch(e){setError(e.message||"Não foi possível consultar o WhatsApp.")}
  },[authToken,tenant.id]);

  useEffect(()=>{let alive=true;(async()=>{if(alive)await load()})();const id=setInterval(()=>{if(alive)load()},6000);return()=>{alive=false;clearInterval(id)}},[load]);

  async function connect(){
    setBusy(true);setError("");
    try{
      const token=await authToken();
      const res=await fetch("/api/whatsapp/evolution/connect",{
        method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
        body:JSON.stringify({tenant:tenant.id})
      });
      const out=await res.json();
      if(!res.ok)throw new Error(out.error||"Não foi possível iniciar a conexão.");
      setConfigured(true);setStatus(out.status||"connecting");setQr(out.qrcode||"");
      await load();
    }catch(e){setError(e.message||"Não foi possível conectar o WhatsApp.")}finally{setBusy(false)}
  }

  async function disconnect(){
    setBusy(true);setError("");
    try{
      const token=await authToken();
      const res=await fetch("/api/whatsapp/evolution/disconnect",{
        method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
        body:JSON.stringify({tenant:tenant.id})
      });
      const out=await res.json();
      if(!res.ok)throw new Error(out.error||"Não foi possível desconectar.");notify("WhatsApp desconectado com sucesso.");
      setStatus("disconnected");setPhone("");setQr("");
    }catch(e){setError(e.message||"Não foi possível desconectar.")}finally{setBusy(false)}
  }

  return <div style={{display:"grid",gap:18,maxWidth:980}}>
    <section className="box">
      <div className="box-head">
        <div>
          <h2>WhatsApp da barbearia</h2>
          <p>Conecte o próprio número da barbearia por QR Code. O agente de IA usa a agenda real do BarberTix.</p>
        </div>
        <span style={{display:"inline-flex",alignItems:"center",gap:7,fontSize:12,fontWeight:800,padding:"8px 11px",border:"1px solid var(--line)",borderRadius:999}}>
          {status==="connected"?<CheckCircle2 size={16}/>:<MessageCircle size={16}/>}
          {status==="loading"?"Consultando...":labels[status]||status}
        </span>
      </div>

      {!configured&&<div className="form-alert error" style={{marginBottom:16}}>
        A Evolution API ainda precisa ser configurada no servidor do BarberTix. Adicione EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_WEBHOOK_SECRET na Vercel.
      </div>}
      {configured&&status==="connected"&&!webhookSynced&&<div className="form-alert error" style={{marginBottom:16}}>
        O WhatsApp está conectado, mas o recebimento de mensagens ainda não foi confirmado pela Evolution.{webhookError?" "+webhookError:""} Clique em <b>Atualizar status</b> para tentar sincronizar novamente.
      </div>}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
        <div className="appointment"><span className="quick-icon green"><Smartphone size={18}/></span><div className="appointment-main"><b>Número conectado</b><p>{phone?("+"+phone):status==="connected"?"WhatsApp conectado":"Nenhum número conectado"}</p></div></div>
        <div className="appointment"><span className="quick-icon purple"><Bot size={18}/></span><div className="appointment-main"><b>Agente de IA</b><p>{aiConfigured?"OpenAI ativa · entende linguagem natural e consulta a agenda real.":"Aguardando OPENAI_API_KEY no servidor."}</p></div></div>
        <div className="appointment"><span className="quick-icon blue"><UserRound size={18}/></span><div className="appointment-main"><b>Atendimento humano</b><p>“Atendente”, “cancelar” ou “remarcar” pausa a automação.</p></div></div>
      </div>

      {qrSrc&&status!=="connected"&&<div style={{marginTop:20,display:"grid",placeItems:"center",gap:12,padding:22,border:"1px solid var(--line)",borderRadius:16}}>
        <strong>Escaneie este QR Code no WhatsApp</strong>
        <img src={qrSrc} alt="QR Code para conectar WhatsApp" width="260" height="260" style={{width:260,maxWidth:"100%",height:"auto",background:"#fff",padding:10,borderRadius:14}}/>
        <p style={{maxWidth:520,textAlign:"center",fontSize:12,color:"var(--muted)",lineHeight:1.6}}>No celular da barbearia: WhatsApp → Aparelhos conectados → Conectar aparelho. O status será atualizado automaticamente.</p>
      </div>}

      {error&&<div className="form-alert error" style={{marginTop:16}}>{error}</div>}

      <div style={{marginTop:18,display:"flex",flexWrap:"wrap",gap:10}}>
        {status!=="connected"&&<button className="primary" type="button" onClick={connect} disabled={busy||!configured}><MessageCircle size={16}/>{busy?"Conectando...":qr?"Gerar novo QR Code":"Conectar WhatsApp"}</button>}
        <button className="secondary-action" type="button" onClick={load} disabled={busy}><RefreshCw size={16}/>Atualizar status</button>
        {status==="connected"&&<button className="secondary-action" type="button" onClick={disconnect} disabled={busy}><Unplug size={16}/>Desconectar</button>}
        {tenant.slug&&<a className="secondary-action" href={"/agendar/"+tenant.slug} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Abrir agenda pública</a>}
      </div>
    </section>

    <section className="box">
      <div className="box-head"><div><h2>Como o atendimento funciona</h2><p>O WhatsApp e o site continuam usando a mesma agenda do BarberTix.</p></div></div>
      <div style={{display:"grid",gap:12}}>
        <div className="appointment"><span className="quick-icon green">1</span><div className="appointment-main"><b>Cliente fala normalmente</b><p>Ex.: “Quero corte sexta depois das 18h com qualquer barbeiro”.</p></div></div>
        <div className="appointment"><span className="quick-icon purple">2</span><div className="appointment-main"><b>IA usa ferramentas do BarberTix</b><p>Serviços, profissionais, unidades e horários são consultados no Supabase; a IA não inventa disponibilidade.</p></div></div>
        <div className="appointment"><span className="quick-icon blue">3</span><div className="appointment-main"><b>Confirmação antes de gravar</b><p>O agente mostra o resumo e só cria o horário depois de uma confirmação explícita do cliente e nova validação da vaga.</p></div></div>
      </div>
      <div style={{marginTop:18,padding:16,border:"1px solid var(--line)",borderRadius:12}}>
        <strong style={{fontSize:12,display:"flex",alignItems:"center",gap:7}}><ShieldCheck size={17}/> Integração não oficial</strong>
        <p style={{fontSize:11,color:"var(--muted)",lineHeight:1.6}}>Esta conexão utiliza Evolution API/WhatsApp Web. Evite disparos em massa e automações de spam. O BarberTix usa esta integração para atendimento receptivo e agendamento.</p>
      </div>
    </section>
  </div>
}

export default function WhatsAppPage(){
  return <ModuleShell title="WhatsApp" eyebrow="Automação">{workspace=><WhatsAppContent workspace={workspace}/>}</ModuleShell>
}
