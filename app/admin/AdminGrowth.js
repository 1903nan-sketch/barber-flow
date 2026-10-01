"use client";
import {useEffect,useState} from "react";
import {AlertTriangle,Ban,Building2,CircleDollarSign,Clock,Lock,RefreshCw,TrendingUp,UserPlus,X,XCircle} from "lucide-react";
import {supabase} from "../../lib/supabase";
import {notify} from "../../lib/notify";
import {money,statusLabel} from "../../lib/plans";

const date=v=>v?new Date(String(v).length===10?v+"T12:00:00":v).toLocaleDateString("pt-BR"):"—";
const tone={trial:"",active:"green",pending:"green",overdue:"amber",blocked:"red",suspended:"red",cancelled:"gray"};

export function AdminOverview({onOpen}){
 const [data,setData]=useState(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 async function load(){setLoading(true);const {data,error}=await supabase.rpc("admin_overview");setLoading(false);setData(data);setError(error?.message||"")}
 useEffect(()=>{load()},[]);
 if(error)return <div className="gx-alert error">{error}</div>;
 if(!data)return <div className="gx-card"><p>{loading?"Carregando indicadores...":"Sem dados."}</p></div>;
 const s=data.tenants||{},conv=data.trial_conversion||{},topPlan=(data.plans||[])[0];
 return <div className="gx-stack">
  <div className="gx-between"><div><span className="gx-eyebrow">Negócio BarberTix</span><h2 style={{margin:"4px 0 0"}}>Visão geral</h2></div><button type="button" className="gx-btn ghost small" onClick={load} disabled={loading}><RefreshCw size={13}/>Atualizar</button></div>
  <div className="gx-kpis">
   <div className="gx-kpi"><span><Building2 size={14}/>Barbearias</span><strong>{s.total}</strong><small>{s.trial} em teste</small></div>
   <div className="gx-kpi green"><span><TrendingUp size={14}/>Ativas</span><strong>{s.active}</strong><small>pagantes em dia</small></div>
   <div className="gx-kpi amber"><span><AlertTriangle size={14}/>Inadimplentes</span><strong>{s.overdue}</strong><small>em tolerância</small></div>
   <div className="gx-kpi red"><span><Lock size={14}/>Bloqueadas</span><strong>{s.blocked}</strong><small>{s.cancelled} canceladas</small></div>
   <div className="gx-kpi green"><span><CircleDollarSign size={14}/>MRR</span><strong>{money(data.mrr_cents)}</strong><small>receita recorrente mensal</small></div>
   <div className="gx-kpi blue"><span><CircleDollarSign size={14}/>Faturamento no mês</span><strong>{money(data.revenue_month_cents)}</strong><small>{money(data.revenue_total_cents)} desde o início</small></div>
   <div className="gx-kpi"><span><UserPlus size={14}/>Conversão do teste</span><strong>{conv.rate||0}%</strong><small>{conv.converted||0} de {conv.trials||0} testes viraram pagantes</small></div>
   <div className="gx-kpi red"><span><XCircle size={14}/>Cancelamentos</span><strong>{data.cancellations_month}</strong><small>no mês · plano mais usado: {topPlan?.plan||"—"}</small></div>
  </div>
  <div className="gx-grid-2">
   <section className="gx-card gx-stack"><div><h3>Aquisição por campanha</h3><p>UTM do primeiro acesso. Cadastros → testes → assinaturas → receita.</p></div>
    {(data.acquisition||[]).length===0?<div className="gx-empty">Nenhum cadastro público ainda. Divulgue /cadastro com utm_source e utm_campaign.</div>:
    <div className="gx-table-wrap"><table className="gx-table cards"><thead><tr><th>Origem / campanha</th><th className="num">Cadastros</th><th className="num">Testes</th><th className="num">Assinaturas</th><th className="num">Receita</th><th className="num">Conversão</th></tr></thead>
     <tbody>{data.acquisition.map(a=><tr key={a.source+a.campaign}><td data-label="Origem"><b>{a.source}</b><br/><small className="gx-muted">{a.campaign}</small></td><td data-label="Cadastros" className="num">{a.signups}</td><td data-label="Testes" className="num">{a.trials}</td><td data-label="Assinaturas" className="num">{a.subscriptions}</td><td data-label="Receita" className="num">{money(a.revenue_cents)}</td><td data-label="Conversão" className="num">{a.conversion}%</td></tr>)}</tbody></table></div>}
   </section>
   <section className="gx-card gx-stack"><div><h3>Planos</h3><p>Barbearias não canceladas</p></div>
    <div className="gx-hbars">{(data.plans||[]).map(p=><div className="gx-hbar" key={p.plan}><div><span>{p.plan}</span><b>{p.tenants}</b></div><i><em style={{width:Math.max(4,p.tenants/Math.max(1,s.total)*100)+"%"}}/></i></div>)}</div>
    <h3 style={{marginTop:10}}>Cadastros recentes</h3>
    <div className="gx-list">{(data.recent_signups||[]).length===0?<div className="gx-empty">Sem cadastros pelo site ainda.</div>:data.recent_signups.map(r=><button type="button" key={r.id} className="gx-list-item" style={{cursor:"pointer",textAlign:"left",color:"inherit",font:"inherit"}} onClick={()=>onOpen?.(r.id)}><div><b>{r.name}</b><small>{date(r.created_at)} · {r.plan} · {r.utm_source||"direto"}</small></div><span className={"gx-badge "+(tone[r.status]||"")}>{statusLabel[r.status]||r.status}</span></button>)}</div>
   </section>
  </div>
 </div>;
}

export function TenantDrawer({tenantId,role,onClose,onChanged}){
 const [data,setData]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(""),[days,setDays]=useState(7);
 async function load(){const {data,error}=await supabase.rpc("admin_tenant_details",{p_tenant:tenantId});setData(data);setError(error?.message||"")}
 useEffect(()=>{if(tenantId)load()},[tenantId]);
 async function act(action){
  const labels={release:`Liberar o acesso por ${days} dias?`,extend_trial:`Estender o teste em ${days} dias?`,block:"Bloquear o acesso desta barbearia?",cancel:"Cancelar a assinatura desta barbearia?",reactivate:"Reativar a assinatura?"};
  if(!confirm(labels[action]))return;
  const reason=action==="block"||action==="cancel"||action==="release"?prompt("Motivo (opcional):")||"":"";
  setBusy(action);
  const {error}=await supabase.rpc("admin_set_subscription",{p_tenant:tenantId,p_action:action,p_days:Number(days),p_reason:reason});
  setBusy("");
  if(error)return setError(error.message);
  notify("Assinatura atualizada.");await load();onChanged?.();
 }
 if(!tenantId)return null;
 const t=data?.tenant,a=data?.acquisition,c=data?.counts||{};
 return <div className="gx-drawer-back" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
  <aside className="gx-drawer" role="dialog" aria-modal="true" aria-label="Detalhes da barbearia">
   <div className="gx-between"><div><span className="gx-eyebrow">Barbearia</span><h2 style={{margin:"4px 0 0"}}>{t?.name||"Carregando..."}</h2>{t&&<p className="gx-muted">/{t.slug} · {data?.plan?.name||"sem plano"}</p>}</div><button type="button" className="gx-btn ghost small" onClick={onClose} aria-label="Fechar"><X size={15}/></button></div>
   {error&&<div className="gx-alert error">{error}</div>}
   {t&&<>
    <div className="gx-row"><span className={"gx-badge "+(tone[t.status]||"")}>{statusLabel[t.status]||t.status}</span>{t.manual_release_until&&<span className="gx-badge amber">Liberada manualmente até {date(t.manual_release_until)}</span>}{t.signup_source==="self"&&<span className="gx-badge">Cadastro pelo site</span>}</div>
    <div className="gx-kv">
     <div><small>MRR</small><b>{money(t.mrr_cents)}</b></div>
     <div><small>Vencimento</small><b>{date(t.billing_due_date)}</b></div>
     <div><small>Tolerância</small><b>{t.grace_days} dias</b></div>
     <div><small>Fim do teste</small><b>{date(t.trial_ends_at)}</b></div>
     <div><small>Último pagamento</small><b>{date(t.last_paid_at)}</b></div>
     <div><small>Cobrança</small><b>{t.billing_provider?`${t.billing_provider} · ${t.billing_method||"—"}`:"manual"}</b></div>
     <div><small>Unidades</small><b>{c.units}</b></div>
     <div><small>Perfis / profissionais</small><b>{c.profiles} / {c.professionals}</b></div>
     <div><small>Clientes</small><b>{c.clients}</b></div>
     <div><small>Agendamentos 30d</small><b>{c.appointments_30d}</b></div>
     <div><small>Onboarding</small><b>{t.onboarding_completed_at?"Concluído":`Etapa ${t.onboarding_step||1}/6`}</b></div>
     <div><small>Criada em</small><b>{date(t.created_at)}</b></div>
    </div>
    <section className="gx-card gx-stack"><h3>Proprietário</h3>{(data.owners||[]).map(o=><div key={o.email} className="gx-list-item"><div><b>{o.name}</b><small>{o.email} · {o.whatsapp||"sem WhatsApp"} · último acesso {date(o.last_sign_in_at)}</small></div></div>)}</section>
    <section className="gx-card gx-stack"><h3>Ações da assinatura</h3>
     <div className="gx-row"><label className="gx-field" style={{width:130}}>Dias<select value={days} onChange={e=>setDays(e.target.value)}>{[3,7,15,30].map(d=><option key={d} value={d}>{d} dias</option>)}</select></label></div>
     <div className="gx-row">
      <button type="button" className="gx-btn green small" disabled={Boolean(busy)} onClick={()=>act("release")}><Clock size={13}/>Liberar manualmente</button>
      {t.status==="trial"||t.trial_ends_at?<button type="button" className="gx-btn ghost small" disabled={Boolean(busy)} onClick={()=>act("extend_trial")}>Estender teste</button>:null}
      <button type="button" className="gx-btn ghost small" disabled={Boolean(busy)} onClick={()=>act("reactivate")}>Reativar</button>
      <button type="button" className="gx-btn danger small" disabled={Boolean(busy)} onClick={()=>act("block")}><Ban size={13}/>Bloquear</button>
      {role==="full"&&<button type="button" className="gx-btn danger small" disabled={Boolean(busy)} onClick={()=>act("cancel")}><XCircle size={13}/>Cancelar</button>}
     </div>
     <p>A liberação manual mantém a barbearia ativa até a data, mesmo com mensalidade vencida. O histórico registra quem fez e o motivo.</p>
    </section>
    {a&&<section className="gx-card gx-stack"><h3>Aquisição</h3><div className="gx-kv">
     <div><small>Origem</small><b>{a.utm_source||"direto"}</b></div><div><small>Mídia</small><b>{a.utm_medium||"—"}</b></div><div><small>Campanha</small><b>{a.utm_campaign||"—"}</b></div>
     <div><small>Conteúdo / termo</small><b>{[a.utm_content,a.utm_term].filter(Boolean).join(" · ")||"—"}</b></div><div><small>Página de entrada</small><b>{a.landing_page||"—"}</b></div><div><small>Referência</small><b>{a.referrer||"—"}</b></div>
     <div><small>IDs de clique</small><b>{Object.keys(a.click_ids||{}).join(", ")||"—"}</b></div><div><small>Primeiro pagamento</small><b>{a.first_paid_at?`${date(a.first_paid_at)} · ${money(a.first_payment_cents)}`:"—"}</b></div>
    </div></section>}
    <section className="gx-card gx-stack"><h3>Cobranças</h3>{(data.payments||[]).length===0?<div className="gx-empty">Nenhuma cobrança registrada.</div>:<div className="gx-list">{data.payments.map(p=><div className="gx-list-item" key={p.provider+p.provider_payment_id}><div><b>{money(p.value_cents)} · {p.method||p.billing_type||p.provider}</b><small>venc. {date(p.due_date)} · {p.paid_at?"pago em "+date(p.paid_at):"não pago"}</small></div><span className={"gx-badge "+(p.state==="paid"?"green":p.state==="overdue"?"red":"amber")}>{p.state}</span></div>)}</div>}</section>
    <section className="gx-card gx-stack"><h3>Histórico</h3><div className="gx-list">{(data.events||[]).map((e,i)=><div className="gx-list-item" key={i}><div><b>{e.kind.replace(/_/g," ")}</b><small>{new Date(e.created_at).toLocaleString("pt-BR")}{e.from_status||e.to_status?` · ${e.from_status||"—"} → ${e.to_status||"—"}`:""}{e.amount_cents?` · ${money(e.amount_cents)}`:""}{e.details?.reason?` · ${e.details.reason}`:""}</small></div></div>)}</div></section>
   </>}
  </aside>
 </div>;
}
