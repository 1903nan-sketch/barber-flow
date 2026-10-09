"use client";
import {useState} from "react";
import {ShieldCheck} from "lucide-react";
import {supabase} from "../../lib/supabase";
import {LEGAL_VERSION} from "../../lib/legal";

// Shown once per user (and again whenever LEGAL_VERSION changes) before any panel loads.
export default function ConsentScreen({onAccepted}){
 const [terms,setTerms]=useState(false),[privacy,setPrivacy]=useState(false),[marketing,setMarketing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function accept(e){
  e.preventDefault();if(!terms||!privacy||busy)return;
  setBusy(true);setError("");
  try{
   const token=(await supabase.auth.getSession()).data.session?.access_token||"";
   const r=await fetch("/api/consent",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},body:JSON.stringify({version:LEGAL_VERSION,accepted:{terms,privacy,marketing}})});
   const j=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(j.error||"Não foi possível registrar o aceite.");
   onAccepted?.();
  }catch(err){setError(err.message)}finally{setBusy(false)}
 }
 async function leave(){await supabase.auth.signOut();window.location.href="/login"}
 return <main className="consent-screen"><form className="consent-card" onSubmit={accept}>
  <span>ANTES DE CONTINUAR</span>
  <h1>Seus dados, suas regras</h1>
  <p>Para usar o RupControl precisamos do seu aceite aos Termos de Uso e à Política de Privacidade. Veja de forma resumida o que tratamos:</p>
  <div className="consent-data">
   <div><b>Sua conta:</b> nome, e-mail, telefone e, para cobrança, CPF/CNPJ e endereço.</div>
   <div><b>Sua barbearia:</b> serviços, equipe, agenda, clientes, vendas e financeiro que você cadastrar.</div>
   <div><b>Segurança:</b> IP, navegador e registros de acesso, para proteger sua conta.</div>
   <div><b>Parceiros:</b> Supabase (dados), Vercel (hospedagem), Asaas (pagamentos) e WhatsApp/Instagram quando você ativar as integrações. Não vendemos dados.</div>
  </div>
  <label className="consent-check"><input type="checkbox" checked={terms} onChange={e=>setTerms(e.target.checked)} required/><span>Li e aceito os <a href="/termos" target="_blank" rel="noreferrer">Termos de Uso</a>, incluindo o teste grátis de 14 dias e a cobrança mensal após a escolha do plano.</span></label>
  <label className="consent-check"><input type="checkbox" checked={privacy} onChange={e=>setPrivacy(e.target.checked)} required/><span>Li a <a href="/privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a> e autorizo o tratamento dos meus dados e dos dados da barbearia para a prestação do serviço, conforme a LGPD.</span></label>
  <label className="consent-check"><input type="checkbox" checked={marketing} onChange={e=>setMarketing(e.target.checked)}/><span>Quero receber novidades e dicas do RupControl por e-mail e WhatsApp.<small>Opcional. Você pode cancelar quando quiser.</small></span></label>
  {error&&<div className="consent-error" role="alert">{error}</div>}
  <div className="consent-actions"><button className="primary" type="submit" disabled={!terms||!privacy||busy}><ShieldCheck size={17}/> {busy?"Registrando...":"Aceitar e continuar"}</button><button type="button" className="link" onClick={leave}>Não aceito, sair</button></div>
 </form></main>
}
