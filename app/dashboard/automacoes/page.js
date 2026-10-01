"use client";
import {useCallback,useEffect,useState} from "react";
import {BellRing,CheckCircle2,CreditCard,KeyRound,MessageCircle,Save,ShieldCheck} from "lucide-react";
import ModuleShell from "../_components/ModuleShell";
import {supabase} from "../../../lib/supabase";
import {notify} from "../../../lib/notify";
import {hasFeature,money} from "../../../lib/plans";
import {DEFAULT_CONFIRMATION,DEFAULT_REMINDER,fillTemplate} from "../../../lib/whatsapp-messages";

const token=async()=>(await supabase.auth.getSession()).data.session?.access_token||"";
const SAMPLE={nome:"Lucas",barbearia:"Sua Barbearia",servico:"Corte + Barba",profissional:"Rafael",data:"sexta-feira, 03/10",hora:"15:00",quando:"amanhã às 15:00",unidade:"Matriz",endereco:" · Rua das Flores, 120"};

function Automations({workspace}){
 const t=workspace.tenant,owner=workspace.membership?.role==="owner";
 const [cfg,setCfg]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[stats,setStats]=useState(null);
 const [gateway,setGateway]=useState({}),[gwForm,setGwForm]=useState({api_key:"",environment:"production"}),[gwBusy,setGwBusy]=useState(false),[gwMsg,setGwMsg]=useState("");
 const allowed=hasFeature(t,"automations"),depositsAllowed=hasFeature(t,"deposits");

 const load=useCallback(async()=>{
  const {data}=await supabase.from("tenant_automation_settings").select("*").eq("tenant_id",t.id).maybeSingle();
  setCfg(data||{confirmation_enabled:true,confirmation_hours:24,reminder_enabled:true,reminder_hours:2,confirmation_message:"",reminder_message:"",deposit_mode:"none",deposit_fixed_cents:1000,deposit_percent:20,deposit_timeout_minutes:15});
  const since=new Date(Date.now()-30*86400000).toISOString();
  const {data:n}=await supabase.from("appointment_notifications").select("kind,status,response").eq("tenant_id",t.id).gte("created_at",since).limit(2000);
  const rows=n||[],count=f=>rows.filter(f).length;
  setStats({sent:count(x=>x.status==="sent"),failed:count(x=>x.status==="failed"),confirmed:count(x=>x.response==="confirmed"),cancelled:count(x=>x.response==="cancelled"),rescheduled:count(x=>x.response==="rescheduled")});
  if(owner){try{const r=await fetch("/api/deposits/gateway?tenant_id="+t.id,{headers:{authorization:"Bearer "+await token()}});const j=await r.json();if(r.ok)setGateway(j.gateway||{})}catch{}}
 },[t.id,owner]);
 useEffect(()=>{load()},[load]);
 const set=(k,v)=>setCfg(c=>({...c,[k]:v}));

 async function save(e){
  e.preventDefault();setBusy(true);setError("");
  const p={...cfg,confirmation_hours:Number(cfg.confirmation_hours),reminder_hours:Number(cfg.reminder_hours),deposit_fixed_cents:Number(cfg.deposit_fixed_cents||0),
   deposit_percent:Number(cfg.deposit_percent||0),deposit_timeout_minutes:Number(cfg.deposit_timeout_minutes||15)};
  const {error}=await supabase.rpc("save_automation_settings",{t:t.id,p});
  setBusy(false);
  if(error)return setError(error.message);
  notify("Automações salvas.");load();
 }
 async function connectGateway(e){
  e.preventDefault();setGwBusy(true);setGwMsg("");setError("");
  try{
   const r=await fetch("/api/deposits/gateway",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+await token()},body:JSON.stringify({tenant_id:t.id,...gwForm})});
   const j=await r.json();if(!r.ok)throw new Error(j.error||"Não foi possível conectar.");
   setGwForm({api_key:"",environment:gwForm.environment});setGwMsg(j.warning||"Asaas conectado. Os sinais serão confirmados automaticamente.");load();
  }catch(err){setError(err.message)}finally{setGwBusy(false)}
 }
 async function disconnectGateway(){
  if(!confirm("Desconectar o Asaas? Os novos sinais passam a usar sua chave PIX com confirmação manual."))return;
  await fetch("/api/deposits/gateway?tenant_id="+t.id,{method:"DELETE",headers:{authorization:"Bearer "+await token()}});load();
 }
 if(!cfg)return <div className="gx-card"><p>Carregando...</p></div>;
 const exampleDeposit=cfg.deposit_mode==="fixed"?Number(cfg.deposit_fixed_cents||0):cfg.deposit_mode==="percent"?Math.round(6000*Number(cfg.deposit_percent||0)/100):0;

 return <form className="gx-stack" onSubmit={save}>
  {!allowed&&<div className="gx-alert warn">Confirmações, lembretes e sinal estão disponíveis a partir do plano Pro. <a href="/dashboard/mensalidade" style={{color:"inherit",fontWeight:800}}>Fazer upgrade</a></div>}
  {stats&&<div className="gx-kpis">
   <div className="gx-kpi"><span><MessageCircle size={14}/>Mensagens (30 dias)</span><strong>{stats.sent}</strong><small>{stats.failed} falhas de envio</small></div>
   <div className="gx-kpi green"><span><CheckCircle2 size={14}/>Confirmados</span><strong>{stats.confirmed}</strong><small>pelo WhatsApp</small></div>
   <div className="gx-kpi blue"><span><BellRing size={14}/>Reagendados</span><strong>{stats.rescheduled}</strong><small>sem perder o cliente</small></div>
   <div className="gx-kpi red"><span><BellRing size={14}/>Cancelados</span><strong>{stats.cancelled}</strong><small>horários liberados a tempo</small></div>
  </div>}

  <section className="gx-card gx-stack">
   <div><span className="gx-eyebrow">Confirmação</span><h2>Pedido de confirmação</h2><p>Enviado antes do horário com as opções Confirmar, Reagendar e Cancelar. O robô entende a resposta e atualiza a agenda.</p></div>
   <label className="gx-check"><input type="checkbox" checked={cfg.confirmation_enabled} disabled={!allowed} onChange={e=>set("confirmation_enabled",e.target.checked)}/><span><b>Enviar confirmação automática</b><small>Somente para agendamentos marcados com mais de 2 horas de antecedência.</small></span></label>
   <div className="gx-form-grid"><label className="gx-field">Enviar com antecedência de<select value={cfg.confirmation_hours} onChange={e=>set("confirmation_hours",e.target.value)}>{[6,12,24,36,48,72].map(h=><option key={h} value={h}>{h} horas</option>)}</select></label></div>
   <label className="gx-field">Mensagem <small>Deixe em branco para usar a mensagem padrão. Variáveis: {"{nome} {barbearia} {servico} {profissional} {data} {hora} {unidade}"}</small><textarea value={cfg.confirmation_message} onChange={e=>set("confirmation_message",e.target.value)} placeholder={DEFAULT_CONFIRMATION} maxLength={1000}/></label>
   <details><summary className="gx-muted" style={{cursor:"pointer"}}>Pré-visualizar</summary><pre className="gx-alert" style={{whiteSpace:"pre-wrap",fontFamily:"inherit"}}>{fillTemplate(cfg.confirmation_message||DEFAULT_CONFIRMATION,SAMPLE)}</pre></details>
  </section>

  <section className="gx-card gx-stack">
   <div><span className="gx-eyebrow">Lembrete</span><h2>Lembrete antes do horário</h2><p>Mensagem curta para reduzir faltas.</p></div>
   <label className="gx-check"><input type="checkbox" checked={cfg.reminder_enabled} disabled={!allowed} onChange={e=>set("reminder_enabled",e.target.checked)}/><span><b>Enviar lembrete automático</b></span></label>
   <div className="gx-form-grid"><label className="gx-field">Enviar com antecedência de<select value={cfg.reminder_hours} onChange={e=>set("reminder_hours",e.target.value)}>{[1,2,3,4,6].map(h=><option key={h} value={h}>{h} {h===1?"hora":"horas"}</option>)}</select></label></div>
   <label className="gx-field">Mensagem <small>Variáveis extras: {"{quando} {endereco}"}</small><textarea value={cfg.reminder_message} onChange={e=>set("reminder_message",e.target.value)} placeholder={DEFAULT_REMINDER} maxLength={1000}/></label>
  </section>

  <section className="gx-card gx-stack">
   <div><span className="gx-eyebrow">Sinal</span><h2>Sinal para agendamento</h2><p>O cliente escolhe o horário, o sistema reserva temporariamente e gera um PIX. Sem pagamento no prazo, o horário é liberado automaticamente.</p></div>
   {!depositsAllowed&&<div className="gx-alert warn">Disponível a partir do plano Pro.</div>}
   <div className="gx-form-grid">
    <label className="gx-field">Cobrar sinal<select value={cfg.deposit_mode} disabled={!depositsAllowed} onChange={e=>set("deposit_mode",e.target.value)}><option value="none">Sem sinal</option><option value="fixed">Valor fixo</option><option value="percent">Percentual do serviço</option></select></label>
    {cfg.deposit_mode==="fixed"&&<label className="gx-field">Valor (R$)<input type="number" min="1" step="0.01" value={(Number(cfg.deposit_fixed_cents||0)/100).toString()} onChange={e=>set("deposit_fixed_cents",Math.round(Number(e.target.value||0)*100))}/></label>}
    {cfg.deposit_mode==="percent"&&<label className="gx-field">Percentual<select value={cfg.deposit_percent} onChange={e=>set("deposit_percent",e.target.value)}>{[10,20,25,30,40,50,100].map(p=><option key={p} value={p}>{p}%</option>)}</select></label>}
    {cfg.deposit_mode!=="none"&&<label className="gx-field">Prazo para pagar<select value={cfg.deposit_timeout_minutes} onChange={e=>set("deposit_timeout_minutes",e.target.value)}>{[5,10,15,20,30,60,120].map(m=><option key={m} value={m}>{m} minutos</option>)}</select></label>}
   </div>
   {cfg.deposit_mode!=="none"&&<p>Exemplo: em um serviço de {money(6000)}, o sinal será de <b style={{color:"#fff"}}>{money(exampleDeposit)}</b>, descontado no checkout.</p>}
   {cfg.deposit_mode!=="none"&&owner&&<div className="gx-card" style={{background:"rgba(255,255,255,.02)"}}>
    <div className="gx-between"><div><h3><CreditCard size={15}/> Recebimento do sinal</h3>
     <p>{gateway?.active?<>Asaas conectado{gateway.account_name?` · ${gateway.account_name}`:""} ({gateway.environment==="sandbox"?"teste":"produção"}). Confirmação automática {gateway.webhook_ready?"ativa":"pendente"}.</>:<>Sem gateway conectado: o cliente paga no PIX da sua chave (Configurações) e a equipe confirma o sinal na agenda. Conecte sua conta Asaas para confirmação automática.</>}</p></div>
     {gateway?.active&&<span className="gx-badge green"><ShieldCheck size={12}/>Automático</span>}</div>
    {!gateway?.active?<div className="gx-form-grid" style={{marginTop:12}}>
     <label className="gx-field">Chave de API do Asaas<input type="password" autoComplete="off" value={gwForm.api_key} onChange={e=>setGwForm(f=>({...f,api_key:e.target.value}))} placeholder="$aact_..."/></label>
     <label className="gx-field">Ambiente<select value={gwForm.environment} onChange={e=>setGwForm(f=>({...f,environment:e.target.value}))}><option value="production">Produção</option><option value="sandbox">Teste (sandbox)</option></select></label>
     <div style={{display:"flex",alignItems:"flex-end"}}><button type="button" className="gx-btn block" disabled={gwBusy||gwForm.api_key.length<20} onClick={connectGateway}><KeyRound size={14}/>{gwBusy?"Validando...":"Conectar Asaas"}</button></div>
    </div>:<div className="gx-row" style={{marginTop:10}}><button type="button" className="gx-btn danger small" onClick={disconnectGateway}>Desconectar</button></div>}
    {gwMsg&&<div className="gx-alert success" style={{marginTop:10}}>{gwMsg}</div>}
    <p style={{marginTop:8}}>A chave fica guardada de forma criptografada e nunca é exibida novamente. PIX automático exige sinal mínimo de R$ 5,00 e CPF do pagador.</p>
   </div>}
  </section>

  {error&&<div className="gx-alert error">{error}</div>}
  <div className="gx-row"><button className="gx-btn" disabled={busy||(!allowed&&!depositsAllowed)}><Save size={15}/>{busy?"Salvando...":"Salvar automações"}</button>
   <a className="gx-btn ghost" href="/dashboard/whatsapp"><MessageCircle size={15}/>Conexão do WhatsApp</a></div>
 </form>;
}

export default function AutomationsPage(){
 return <ModuleShell title="Automações" eyebrow="WhatsApp e agenda">{workspace=><Automations workspace={workspace}/>}</ModuleShell>;
}
