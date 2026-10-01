"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {Megaphone,MessageCircle,RefreshCw,Send,TrendingUp,UserCheck,Users} from "lucide-react";
import ModuleShell from "../_components/ModuleShell";
import {supabase} from "../../../lib/supabase";
import {notify} from "../../../lib/notify";
import {hasFeature,money} from "../../../lib/plans";
import {DEFAULT_RECOVERY,fillTemplate} from "../../../lib/whatsapp-messages";

const token=async()=>(await supabase.auth.getSession()).data.session?.access_token||"";
const phoneLabel=v=>{let d=String(v||"").replace(/\D/g,"");if(d.startsWith("55")&&d.length>11)d=d.slice(2);return d.length===11?`(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`:d.length===10?`(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`:v};
const date=v=>v?new Date(v).toLocaleDateString("pt-BR"):"—";

function Recovery({workspace}){
 const t=workspace.tenant,allowed=hasFeature(t,"marketing");
 const [rows,setRows]=useState([]),[summary,setSummary]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [selected,setSelected]=useState(new Set()),[message,setMessage]=useState(""),[name,setName]=useState(""),[sending,setSending]=useState(null);

 const load=useCallback(async()=>{
  setLoading(true);setError("");
  const [c,s,cfg]=await Promise.all([
   supabase.rpc("recovery_candidates",{t:t.id}),
   supabase.rpc("marketing_summary",{t:t.id}),
   supabase.from("tenant_automation_settings").select("recovery_message").eq("tenant_id",t.id).maybeSingle()
  ]);
  setLoading(false);
  if(c.error||s.error)return setError((c.error||s.error).message);
  setRows(c.data||[]);setSummary(s.data);
  setMessage(m=>m||cfg.data?.recovery_message||DEFAULT_RECOVERY);
 },[t.id]);
 useEffect(()=>{load()},[load]);

 const allSelected=rows.length>0&&selected.size===rows.length;
 const toggle=id=>setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n});
 const preview=useMemo(()=>{const r=rows.find(x=>selected.has(x.client_id))||rows[0];return fillTemplate(message||DEFAULT_RECOVERY,{nome:String(r?.name||"Cliente").split(" ")[0],barbearia:t.name,dias:r?.days_since??30,profissional:r?.usual_barber||"",link:(typeof window!=="undefined"?window.location.origin:"")+"/agendar/"+t.slug+"?c=…"})},[rows,selected,message,t.name,t.slug]);

 async function send(ids,label){
  if(!ids.length)return setError("Selecione pelo menos um cliente.");
  if(!message.includes("{link}")&&!confirm("A mensagem não tem {link}. O link de agendamento será adicionado ao final. Continuar?"))return;
  if(!confirm(`Enviar a mensagem para ${ids.length} cliente${ids.length>1?"s":""} pelo WhatsApp da barbearia?`))return;
  setError("");setSending({total:ids.length,sent:0,failed:0});
  const {data,error}=await supabase.rpc("create_campaign",{t:t.id,p_name:label||name||"",p_message:message,p_clients:ids,p_kind:"recovery"});
  if(error){setSending(null);return setError(error.message)}
  let pending=data.recipients,sent=0,failed=0,guard=0;
  while(pending>0&&guard<120){
   guard++;
   try{
    const r=await fetch("/api/marketing/send",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+await token()},body:JSON.stringify({tenant_id:t.id,campaign_id:data.campaign_id})});
    const j=await r.json();if(!r.ok)throw new Error(j.error||"Falha no envio.");
    sent+=j.sent||0;failed+=j.failed||0;pending=j.pending;
    setSending({total:data.recipients,sent,failed});
    if(!j.claimed&&pending>0)await new Promise(r=>setTimeout(r,4000));
   }catch(e){setError(e.message+" O envio continua automaticamente em segundo plano.");break}
  }
  setSending(null);setSelected(new Set());
  notify(`Campanha enviada: ${sent} mensagens${failed?`, ${failed} falhas`:""}.`);
  load();
 }

 if(!allowed)return <div className="gx-card gx-stack"><h2>Recuperação de clientes</h2><p>Disponível a partir do plano Pro, junto com o WhatsApp automático.</p><a className="gx-btn" style={{width:"max-content"}} href="/dashboard/mensalidade">Ver planos</a></div>;
 const m=summary?.month||{},all=summary?.all_time||{};
 return <div className="gx-stack">
  <div className="gx-kpis">
   <div className="gx-kpi green"><span><UserCheck size={14}/>Clientes recuperados no mês</span><strong>{m.clients||0}</strong><small>voltaram após campanha</small></div>
   <div className="gx-kpi green"><span><TrendingUp size={14}/>Faturamento recuperado</span><strong>{money(m.revenue_cents)}</strong><small>no mês · {money(all.revenue_cents)} no total</small></div>
   <div className="gx-kpi amber"><span><Users size={14}/>Para recuperar agora</span><strong>{rows.length}</strong><small>clientes atrasados</small></div>
   <div className="gx-kpi"><span><Megaphone size={14}/>Campanhas</span><strong>{summary?.campaigns?.length||0}</strong><small>últimos envios</small></div>
  </div>

  <section className="gx-card gx-stack">
   <div className="gx-between"><div><span className="gx-eyebrow">Inteligência de retorno</span><h2>Clientes para recuperar</h2><p>Clientes que costumavam voltar com frequência e estão atrasados em relação ao próprio ritmo (ex.: cortava a cada 20 dias e já passaram 35).</p></div>
    <button type="button" className="gx-btn ghost small" onClick={load} disabled={loading}><RefreshCw size={13}/>Atualizar</button></div>
   {error&&<div className="gx-alert error">{error}</div>}
   {loading?<p>Analisando histórico...</p>:rows.length===0?<div className="gx-empty">Nenhum cliente atrasado no momento. A lista considera clientes com pelo menos 2 atendimentos finalizados.</div>:
   <div className="gx-table-wrap"><table className="gx-table cards"><thead><tr><th><input type="checkbox" aria-label="Selecionar todos" checked={allSelected} onChange={()=>setSelected(allSelected?new Set():new Set(rows.map(r=>r.client_id)))}/></th><th>Cliente</th><th>WhatsApp</th><th>Último atendimento</th><th className="num">Frequência</th><th className="num">Sem voltar</th><th>Profissional</th><th>Último serviço</th><th></th></tr></thead>
    <tbody>{rows.map(r=><tr key={r.client_id}>
     <td data-label="Selecionar"><input type="checkbox" checked={selected.has(r.client_id)} onChange={()=>toggle(r.client_id)} aria-label={"Selecionar "+r.name}/></td>
     <td data-label="Cliente"><b>{r.name}</b>{r.last_contacted_at&&<><br/><small className="gx-muted">contatado em {date(r.last_contacted_at)}</small></>}</td>
     <td data-label="WhatsApp">{phoneLabel(r.whatsapp)}</td>
     <td data-label="Último atendimento">{date(r.last_visit)}</td>
     <td data-label="Frequência" className="num">a cada {r.avg_days} dias</td>
     <td data-label="Sem voltar" className="num"><span className={"gx-badge "+(r.overdue_ratio>=2.5?"red":"amber")}>{r.days_since} dias</span></td>
     <td data-label="Profissional">{r.usual_barber||"—"}</td>
     <td data-label="Último serviço">{r.last_service||"—"}</td>
     <td data-label=""><button type="button" className="gx-btn small" disabled={Boolean(sending)} onClick={()=>send([r.client_id],"Recuperação · "+r.name)}><MessageCircle size={13}/>Enviar mensagem</button></td>
    </tr>)}</tbody></table></div>}
  </section>

  <section className="gx-card gx-stack">
   <div><span className="gx-eyebrow">Campanha</span><h2>Mensagem de recuperação</h2><p>Variáveis: {"{nome} {barbearia} {dias} {profissional} {link}"}. O {"{link}"} leva direto para a sua agenda e identifica o retorno do cliente.</p></div>
   <div className="gx-form-grid"><label className="gx-field">Nome da campanha <small>opcional</small><input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Volta às aulas"/></label></div>
   <label className="gx-field">Mensagem<textarea value={message} onChange={e=>setMessage(e.target.value)} maxLength={1000}/></label>
   <details><summary className="gx-muted" style={{cursor:"pointer"}}>Pré-visualizar</summary><pre className="gx-alert" style={{whiteSpace:"pre-wrap",fontFamily:"inherit"}}>{preview}</pre></details>
   {sending&&<div className="gx-alert">Enviando... {sending.sent+sending.failed} de {sending.total} ({sending.failed} falhas). Mantenha esta página aberta.</div>}
   <div className="gx-row"><button type="button" className="gx-btn" disabled={Boolean(sending)||!selected.size} onClick={()=>send([...selected])}><Send size={15}/>Enviar campanha ({selected.size})</button><span className="gx-muted">Envio gradual para proteger o número da barbearia. Limite de 300 por campanha e 600 por dia.</span></div>
  </section>

  {summary?.campaigns?.length>0&&<section className="gx-card gx-stack">
   <div><span className="gx-eyebrow">Resultados</span><h2>Campanhas enviadas</h2><p>Retorno contado quando o cliente agenda em até 30 dias após receber a mensagem e o atendimento é finalizado.</p></div>
   <div className="gx-table-wrap"><table className="gx-table cards"><thead><tr><th>Campanha</th><th>Data</th><th className="num">Enviadas</th><th className="num">Cliques</th><th className="num">Agendaram</th><th className="num">Faturamento</th></tr></thead>
    <tbody>{summary.campaigns.map(c=><tr key={c.id}><td data-label="Campanha"><b>{c.name}</b>{c.status==="sending"&&<> <span className="gx-badge amber">enviando</span></>}</td><td data-label="Data">{date(c.created_at)}</td><td data-label="Enviadas" className="num">{c.sent_count}/{c.recipients_count}{c.failed_count?` · ${c.failed_count} falhas`:""}</td><td data-label="Cliques" className="num">{c.clicked}</td><td data-label="Agendaram" className="num">{c.converted}</td><td data-label="Faturamento" className="num">{money(c.revenue_cents)}</td></tr>)}</tbody></table></div>
  </section>}
 </div>;
}

export default function MarketingPage(){
 return <ModuleShell title="Recuperar clientes" eyebrow="Marketing">{workspace=><Recovery workspace={workspace}/>}</ModuleShell>;
}
