"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {FileDown,Percent,Plus,Printer,Save,Trash2} from "lucide-react";
import ModuleShell from "../_components/ModuleShell";
import {supabase} from "../../../lib/supabase";
import {notify} from "../../../lib/notify";
import {money} from "../../../lib/plans";

const iso=d=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const monthStart=()=>{const d=new Date();return iso(new Date(d.getFullYear(),d.getMonth(),1))};
const pct=bps=>(Number(bps||0)/100).toLocaleString("pt-BR",{maximumFractionDigits:2});

function Commissions({workspace}){
 const t=workspace.tenant,perms=workspace.membership?.permissions||[],canFinance=workspace.membership?.role==="owner"||perms.includes("finance");
 const [from,setFrom]=useState(monthStart()),[to,setTo]=useState(iso(new Date())),[barber,setBarber]=useState("");
 const [report,setReport]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
 const [barbers,setBarbers]=useState([]),[services,setServices]=useState([]);

 useEffect(()=>{Promise.all([supabase.from("barbers").select("id,name,active").eq("tenant_id",t.id).order("name"),supabase.from("services").select("id,name").eq("tenant_id",t.id).eq("active",true).order("name")]).then(([b,s])=>{setBarbers(b.data||[]);setServices(s.data||[])})},[t.id]);
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  const {data,error}=await supabase.rpc("commission_report",{t:t.id,p_from:from,p_to:to,p_barber:barber||null});
  setLoading(false);
  if(error)return setError(error.message);
  setReport(data);
 },[t.id,from,to,barber]);
 useEffect(()=>{load()},[load]);

 const rows=report?.barbers||[],totals=useMemo(()=>rows.reduce((a,r)=>({services:a.services+Number(r.services_count||0),revenue:a.revenue+Number(r.service_revenue_cents||0)+Number(r.product_revenue_cents||0),sc:a.sc+Number(r.service_commission_cents||0),pc:a.pc+Number(r.product_commission_cents||0),total:a.total+Number(r.total_commission_cents||0)}),{services:0,revenue:0,sc:0,pc:0,total:0}),[rows]);

 function exportCsv(){
  const head=["Profissional","Serviços realizados","Faturamento serviços","Faturamento produtos","Comissão serviços","Comissão produtos","Comissão total"];
  const body=rows.map(r=>[r.name,r.services_count,(r.service_revenue_cents/100).toFixed(2),(r.product_revenue_cents/100).toFixed(2),(r.service_commission_cents/100).toFixed(2),(r.product_commission_cents/100).toFixed(2),(r.total_commission_cents/100).toFixed(2)].map(String));
  const csv=[head,...body].map(r=>r.map(v=>`"${String(v).replace(/^[=+@-]/,"'").replace(/\./g,",").replace(/"/g,'""')}"`).join(";")).join("\n");
  const url=URL.createObjectURL(new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");
  a.href=url;a.download=`comissoes-${from}-a-${to}.csv`;a.click();URL.revokeObjectURL(url);
 }

 return <div className="gx-stack">
  <section className="gx-card gx-stack">
   <div className="gx-between">
    <div><span className="gx-eyebrow">Relatório</span><h2>Comissões por período</h2><p>{canFinance?"Serviços e produtos de cada profissional com a comissão calculada pelas regras abaixo.":"Sua comissão no período."}</p></div>
    <div className="gx-row gx-noprint"><button type="button" className="gx-btn ghost small" onClick={()=>window.print()}><Printer size={13}/>Imprimir / PDF</button><button type="button" className="gx-btn ghost small" onClick={exportCsv} disabled={!rows.length}><FileDown size={13}/>CSV</button></div>
   </div>
   <div className="gx-form-grid gx-noprint">
    <label className="gx-field">De<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
    <label className="gx-field">Até<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
    {canFinance&&<label className="gx-field">Profissional<select value={barber} onChange={e=>setBarber(e.target.value)}><option value="">Todos</option>{barbers.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
   </div>
   <p className="gx-muted" style={{display:"none"}} data-print>{t.name} · {new Date(from+"T12:00:00").toLocaleDateString("pt-BR")} a {new Date(to+"T12:00:00").toLocaleDateString("pt-BR")}</p>
   {error&&<div className="gx-alert error">{error}</div>}
   {loading?<p>Calculando...</p>:rows.length===0?<div className="gx-empty">Nenhum serviço ou produto finalizado no período.</div>:
   <div className="gx-table-wrap"><table className="gx-table cards"><thead><tr><th>Profissional</th><th className="num">Serviços</th><th className="num">Faturamento</th><th className="num">Comissão serviços</th><th className="num">Comissão produtos</th><th className="num">Comissão total</th></tr></thead>
    <tbody>{rows.map(r=><tr key={r.barber_id}><td data-label="Profissional"><b>{r.name}</b></td><td data-label="Serviços" className="num">{r.services_count}</td><td data-label="Faturamento" className="num">{money(Number(r.service_revenue_cents)+Number(r.product_revenue_cents))}</td><td data-label="Comissão serviços" className="num">{money(r.service_commission_cents)}</td><td data-label="Comissão produtos" className="num">{money(r.product_commission_cents)}</td><td data-label="Comissão total" className="num"><b>{money(r.total_commission_cents)}</b></td></tr>)}</tbody>
    {rows.length>1&&<tfoot><tr><td data-label="Total">Total</td><td data-label="Serviços" className="num">{totals.services}</td><td data-label="Faturamento" className="num">{money(totals.revenue)}</td><td data-label="Comissão serviços" className="num">{money(totals.sc)}</td><td data-label="Comissão produtos" className="num">{money(totals.pc)}</td><td data-label="Comissão total" className="num">{money(totals.total)}</td></tr></tfoot>}
   </table></div>}
   <p className="gx-muted">Atendimentos com sinal entram pelo valor integral do serviço. Vendas rápidas sem item específico usam a comissão padrão de serviços do profissional.</p>
  </section>
  {canFinance&&<Rules tenant={t} barbers={barbers.filter(b=>b.active)} services={services} onSaved={load}/>}
 </div>;
}

function Rules({tenant,barbers,services,onSaved}){
 const [barber,setBarber]=useState(""),[rules,setRules]=useState({service:"",product:"",overrides:[]}),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{if(!barber&&barbers[0])setBarber(barbers[0].id)},[barbers,barber]);
 useEffect(()=>{if(!barber)return;supabase.from("commission_rules").select("kind,service_id,rate_bps").eq("tenant_id",tenant.id).eq("barber_id",barber).then(({data})=>{
  const list=data||[];
  const val=r=>r?pct(r.rate_bps):"";
  setRules({service:val(list.find(r=>r.kind==="service"&&!r.service_id)),product:val(list.find(r=>r.kind==="product")),overrides:list.filter(r=>r.kind==="service"&&r.service_id).map(r=>({service_id:r.service_id,rate:pct(r.rate_bps)}))});
 })},[tenant.id,barber]);
 const toBps=v=>{const n=Number(String(v).replace(",","."));return Number.isFinite(n)?Math.round(n*100):null};
 async function save(e){
  e.preventDefault();setError("");
  const payload=[];
  if(rules.service!==""){const b=toBps(rules.service);if(b===null||b<0||b>10000)return setError("Percentual de serviços inválido.");payload.push({kind:"service",rate_bps:b})}
  if(rules.product!==""){const b=toBps(rules.product);if(b===null||b<0||b>10000)return setError("Percentual de produtos inválido.");payload.push({kind:"product",rate_bps:b})}
  for(const o of rules.overrides){if(!o.service_id||o.rate==="")continue;const b=toBps(o.rate);if(b===null||b<0||b>10000)return setError("Percentual por serviço inválido.");payload.push({kind:"service",service_id:o.service_id,rate_bps:b})}
  setBusy(true);
  const {error}=await supabase.rpc("save_commission_rules",{t:tenant.id,b:barber,p:payload});
  setBusy(false);
  if(error)return setError(error.message);
  notify("Regras de comissão salvas.");onSaved?.();
 }
 if(!barbers.length)return null;
 return <form className="gx-card gx-stack gx-noprint" onSubmit={save}>
  <div><span className="gx-eyebrow">Regras</span><h2><Percent size={16}/> Comissão por profissional</h2><p>Defina o percentual padrão de serviços e de produtos e, se quiser, um percentual específico por serviço (ex.: Corte 50%, Barba 50%, Produtos 10%).</p></div>
  <div className="gx-form-grid">
   <label className="gx-field">Profissional<select value={barber} onChange={e=>setBarber(e.target.value)}>{barbers.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
   <label className="gx-field">Serviços (padrão %)<input inputMode="decimal" value={rules.service} onChange={e=>setRules(r=>({...r,service:e.target.value}))} placeholder="Ex.: 50"/></label>
   <label className="gx-field">Produtos (%)<input inputMode="decimal" value={rules.product} onChange={e=>setRules(r=>({...r,product:e.target.value}))} placeholder="Ex.: 10"/></label>
  </div>
  <div className="gx-stack" style={{gap:8}}>
   <b style={{fontSize:12.5}}>Percentual por serviço</b>
   {rules.overrides.map((o,i)=><div className="gx-row" key={i}>
    <select className="gx-input" style={{flex:"1 1 200px"}} value={o.service_id} onChange={e=>setRules(r=>({...r,overrides:r.overrides.map((x,j)=>j===i?{...x,service_id:e.target.value}:x)}))}><option value="">Selecione o serviço</option>{services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
    <input className="gx-input" style={{width:110}} inputMode="decimal" value={o.rate} onChange={e=>setRules(r=>({...r,overrides:r.overrides.map((x,j)=>j===i?{...x,rate:e.target.value}:x)}))} placeholder="%"/>
    <button type="button" className="gx-btn danger small" onClick={()=>setRules(r=>({...r,overrides:r.overrides.filter((_,j)=>j!==i)}))} aria-label="Remover"><Trash2 size={13}/></button>
   </div>)}
   <button type="button" className="gx-btn ghost small" style={{width:"max-content"}} onClick={()=>setRules(r=>({...r,overrides:[...r.overrides,{service_id:"",rate:""}]}))}><Plus size={13}/>Adicionar serviço</button>
  </div>
  <p>Sem regra definida, vale o percentual cadastrado no próprio serviço/produto.</p>
  {error&&<div className="gx-alert error">{error}</div>}
  <div><button className="gx-btn" disabled={busy||!barber}><Save size={15}/>{busy?"Salvando...":"Salvar regras"}</button></div>
 </form>;
}

export default function CommissionsPage(){
 return <ModuleShell title="Comissões" eyebrow="Equipe e financeiro">{workspace=><Commissions workspace={workspace}/>}</ModuleShell>;
}
