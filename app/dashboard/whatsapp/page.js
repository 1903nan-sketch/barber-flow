"use client";
import {notify} from "../../../lib/notify";

import {useCallback,useEffect,useMemo,useState} from "react";
import {Bot,ExternalLink,MessageCircle,QrCode,RefreshCw,ShieldCheck,Smartphone,Unplug,UserRound} from "lucide-react";
import {supabase} from "../../../lib/supabase";
import {bookingUrl} from "../../../lib/site";
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

  const connected=status==="connected",tone=connected?"on":status==="error"||!configured?"bad":status==="loading"?"":"wait";
  return <div className="wa">
    <section className={"wa-hero "+tone}>
      <div className="wa-hero-main">
        <span className="wa-hero-icon"><MessageCircle size={26}/></span>
        <div>
          <span className="wa-status"><i/>{status==="loading"?"Consultando...":labels[status]||status}</span>
          <h2>{connected?"WhatsApp conectado":"Conecte o WhatsApp da empresa"}</h2>
          <p>{connected?(phone?`Número +${phone} atendendo clientes com a agenda do RupControl.`:"O robô já está respondendo com a agenda do RupControl."):"Use o próprio número da empresa. O robô responde, mostra horários livres e agenda sozinho."}</p>
        </div>
      </div>
      <div className="wa-actions">
        {!connected&&<button className="primary" type="button" onClick={connect} disabled={busy||!configured}><QrCode size={17}/>{busy?"Gerando QR Code...":qr?"Gerar novo QR Code":"Conectar WhatsApp"}</button>}
        <button className="secondary-action" type="button" onClick={load} disabled={busy}><RefreshCw size={16}/>Atualizar</button>
        {connected&&<button className="secondary-action" type="button" onClick={disconnect} disabled={busy}><Unplug size={16}/>Desconectar</button>}
      </div>
    </section>

    {!configured&&<div className="form-alert error">A conexão de WhatsApp ainda não foi liberada no servidor do RupControl. Fale com o suporte Ruptix para ativar.</div>}
    {configured&&connected&&!webhookSynced&&<div className="form-alert error">O WhatsApp está conectado, mas o recebimento de mensagens ainda não foi confirmado.{webhookError?" "+webhookError:""} Toque em <b>Atualizar</b> para sincronizar de novo.</div>}
    {error&&<div className="form-alert error">{error}</div>}

    {qrSrc&&!connected&&<section className="box wa-qr">
      <div className="wa-qr-code"><img src={qrSrc} alt="QR Code para conectar o WhatsApp" width="240" height="240"/></div>
      <div className="wa-qr-steps">
        <h3>Escaneie com o celular da empresa</h3>
        <ol><li><b>1</b>Abra o <strong>WhatsApp</strong> no celular da empresa.</li><li><b>2</b>Toque em <strong>⋮ Mais opções</strong> (ou Configurações no iPhone) e depois em <strong>Aparelhos conectados</strong>.</li><li><b>3</b>Toque em <strong>Conectar aparelho</strong> e aponte a câmera para este QR Code.</li></ol>
        <small>A tela atualiza sozinha quando conectar. O QR Code expira em cerca de 1 minuto. Se expirar, gere um novo.</small>
      </div>
    </section>}

    <section className="wa-cards">
      <div className="wa-card"><span className="quick-icon green"><Smartphone size={18}/></span><div><b>Número</b><p>{phone?"+"+phone:connected?"Conectado":"Nenhum número conectado"}</p></div></div>
      <div className="wa-card"><span className="quick-icon purple"><Bot size={18}/></span><div><b>Agente de IA</b><p>{aiConfigured?"Ativo: entende o cliente e consulta a agenda real.":"Desligado no servidor (falta a chave da OpenAI)."}</p></div></div>
      <div className="wa-card"><span className="quick-icon blue"><UserRound size={18}/></span><div><b>Atendimento humano</b><p>Se o cliente pedir “atendente”, o robô pausa e você assume.</p></div></div>
    </section>

    <section className="box wa-how">
      <div className="box-head"><div><h2>Como funciona</h2><p>WhatsApp e site usam a mesma agenda do RupControl.</p></div>{tenant.slug&&<a className="secondary-action" href={bookingUrl(location.origin,tenant.slug)} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Ver site</a>}</div>
      <ol className="wa-steps">
        <li><b>1</b><div><strong>Cliente escreve normalmente</strong><p>Ex.: “Quero marcar sexta depois das 18h”.</p></div></li>
        <li><b>2</b><div><strong>O robô consulta a agenda</strong><p>Serviços, profissionais e horários livres de verdade, sem inventar.</p></div></li>
        <li><b>3</b><div><strong>Confirma antes de marcar</strong><p>Mostra o resumo e só agenda depois do “sim” do cliente.</p></div></li>
      </ol>
      <p className="wa-note"><ShieldCheck size={15}/>Conexão pelo WhatsApp Web. Evite disparos em massa: o RupControl usa a conexão só para atendimento e agendamento.</p>
    </section>
  </div>
}

export default function WhatsAppPage(){
  return <ModuleShell title="WhatsApp" eyebrow="Automação">{workspace=><WhatsAppContent workspace={workspace}/>}</ModuleShell>
}
