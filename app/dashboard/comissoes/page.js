"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {ChevronDown,FileDown,Info,Percent,Printer,UserRound} from "lucide-react";
import {supabase} from "../../../lib/supabase";
import ModuleShell from "../_components/ModuleShell";
const money=n=>(Number(n||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const pct=bps=>(Number(bps||0)/100).toLocaleString("pt-BR",{maximumFractionDigits:2})+"%";
const dateValue=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const monthStart=()=>{const d=new Date();return dateValue(new Date(d.getFullYear(),d.getMonth(),1))};
const byId=rows=>Object.fromEntries((rows||[]).map(x=>[x.id,x]));
// Commission of an appointment: the snapshot saved at booking time when present;
// otherwise (public bookings saved 0) the current rate of each booked service.
function appointmentCommission(appt,amount,apptServices,services){
 if(Number(appt?.commission_bps)>0)return {bps:Number(appt.commission_bps),value:Math.round(amount*appt.commission_bps/10000),estimated:false};
 const lines=apptServices.length?apptServices:appt?.service_id?[{service_id:appt.service_id,price_cents:amount}]:[];
 const base=lines.reduce((s,l)=>s+Number(l.price_cents||0),0)||amount;
 const value=lines.reduce((s,l)=>s+Math.round(amount*(Number(l.price_cents||0)/base)*Number(services[l.service_id]?.commission_bps||0)/10000),0);
 return {bps:amount?Math.round(value*10000/amount):0,value,estimated:true};
}
function Commissions({workspace}){
 const t=workspace.tenant.id,m=workspace.membership,allowed=m.role==="owner"||(["manager","reception"].includes(m.role)&&m.permissions?.includes("finance"));
 const [from,setFrom]=useState(monthStart),[to,setTo]=useState(()=>dateValue(new Date())),[barber,setBarber]=useState(""),[rows,setRows]=useState([]),[barbers,setBarbers]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[open,setOpen]=useState(null);
 const seq=useRef(0);
 const load=useCallback(async()=>{const version=++seq.current;if(!allowed){setLoading(false);return}setLoading(true);setError("");
  try{
   if(!from||!to||from>to)throw new Error("Confira as datas do período.");
   const st=new Date(from+"T00:00:00"),en=new Date(to+"T00:00:00");en.setDate(en.getDate()+1);
   const range=q=>q.gte("created_at",st.toISOString()).lt("created_at",en.toISOString());
   const [b,s,pay,orders,quick]=await Promise.all([
    supabase.from("barbers").select("id,name,active").eq("tenant_id",t).order("name"),
    supabase.from("services").select("id,name,commission_bps").eq("tenant_id",t),
    range(supabase.from("appointment_payments").select("id,appointment_id,barber_id,service_id,amount_cents,status,created_at").eq("tenant_id",t).neq("status","cancelled")),
    supabase.from("order_tabs").select("id,barber_id,appointment_id,closed_at").eq("tenant_id",t).eq("status","closed").gte("closed_at",st.toISOString()).lt("closed_at",en.toISOString()),
    range(supabase.from("quick_sales").select("id,barber_id,status,created_at").eq("tenant_id",t).is("order_id",null).neq("status","cancelled").not("barber_id","is",null))
   ]);
   const fail=[b,s,pay,orders,quick].find(r=>r.error)?.error;if(fail)throw fail;
   const services=byId(s.data),payments=pay.data||[],tabs=orders.data||[],quickSales=quick.data||[];
   const apptIds=[...new Set([...payments.map(p=>p.appointment_id),...tabs.map(o=>o.appointment_id)].filter(Boolean))],tabIds=tabs.map(o=>o.id),quickIds=quickSales.map(q=>q.id);
   const [ap,as,items,moves]=await Promise.all([
    apptIds.length?supabase.from("appointments").select("id,service_id,commission_bps,starts_at,client_id").eq("tenant_id",t).in("id",apptIds):Promise.resolve({data:[]}),
    apptIds.length?supabase.from("appointment_services").select("appointment_id,service_id,price_cents").eq("tenant_id",t).in("appointment_id",apptIds):Promise.resolve({data:[]}),
    tabIds.length?supabase.from("order_items").select("order_id,kind,reference_id,name,quantity,unit_price_cents,commission_bps,removed_at").eq("tenant_id",t).in("order_id",tabIds).is("removed_at",null):Promise.resolve({data:[]}),
    quickIds.length?supabase.from("stock_movements").select("sale_id,product_id,quantity,unit_price,commission_pct").eq("barbershop_id",t).eq("movement_type","sale").in("sale_id",quickIds):Promise.resolve({data:[]})
   ]);
   if(version!==seq.current)return;
   const appts=byId(ap.data),apptLines=(as.data||[]).reduce((acc,l)=>{(acc[l.appointment_id]=acc[l.appointment_id]||[]).push(l);return acc},{});
   const out=[];
   for(const p of payments){const a=appts[p.appointment_id],c=appointmentCommission(a,Number(p.amount_cents||0),apptLines[p.appointment_id]||[],services);
    out.push({barber_id:p.barber_id,date:p.created_at,kind:"Atendimento",label:(apptLines[p.appointment_id]||[]).map(l=>services[l.service_id]?.name).filter(Boolean).join(" + ")||services[p.service_id]?.name||"Atendimento",base:Number(p.amount_cents||0),...c})}
   const tabById=byId(tabs);
   for(const it of items.data||[]){const o=tabById[it.order_id];if(!o)continue;const base=Number(it.quantity)*Number(it.unit_price_cents);
    if(it.kind==="appointment"){const a=appts[o.appointment_id],c=appointmentCommission(a,base,apptLines[o.appointment_id]||[],services);out.push({barber_id:o.barber_id,date:o.closed_at,kind:"Comanda",label:"Atendimento agendado",base,...c})}
    else out.push({barber_id:o.barber_id,date:o.closed_at,kind:it.kind==="product"?"Produto (comanda)":"Serviço (comanda)",label:`${it.quantity}× ${it.name}`,base,bps:Number(it.commission_bps||0),value:Math.round(base*Number(it.commission_bps||0)/10000),estimated:false})}
   const quickById=byId(quickSales);
   for(const mv of moves.data||[]){const q=quickById[mv.sale_id];if(!q)continue;const qty=Math.abs(Number(mv.quantity||0)),base=Math.round(qty*Number(mv.unit_price||0)*100),bps=Math.round(Number(mv.commission_pct||0)*100);
    out.push({barber_id:q.barber_id,date:q.created_at,kind:"Produto (venda rápida)",label:`${qty}× produto`,base,bps,value:Math.round(base*bps/10000),estimated:false})}
   setBarbers(b.data||[]);setRows(out.sort((x,y)=>new Date(y.date)-new Date(x.date)));
  }catch(e){if(version===seq.current){setError(e.message);setRows([])}}finally{if(version===seq.current)setLoading(false)}
 },[t,from,to,allowed]);
 useEffect(()=>{load()},[load]);
 const names=useMemo(()=>byId(barbers),[barbers]);
 const filtered=rows.filter(r=>!barber||r.barber_id===barber);
 const groups=useMemo(()=>Object.values(filtered.reduce((acc,r)=>{const g=acc[r.barber_id]||(acc[r.barber_id]={barber_id:r.barber_id,name:names[r.barber_id]?.name||"Profissional removido",base:0,value:0,count:0,rows:[]});g.base+=r.base;g.value+=r.value;g.count++;g.rows.push(r);return acc},{})).sort((a,b)=>b.value-a.value),[filtered,names]);
 const totalBase=groups.reduce((s,g)=>s+g.base,0),totalValue=groups.reduce((s,g)=>s+g.value,0),anyEstimated=filtered.some(r=>r.estimated);
 function exportCsv(){const head=["Profissional","Data","Tipo","Descrição","Valor base","Comissão %","Comissão R$","Origem da %"];
  const body=filtered.map(r=>[names[r.barber_id]?.name||"",new Date(r.date).toLocaleString("pt-BR"),r.kind,r.label,(r.base/100).toFixed(2).replace(".",","),(r.bps/100).toFixed(2).replace(".",","),(r.value/100).toFixed(2).replace(".",","),r.estimated?"Cadastro atual do serviço":"Registrada na venda"]);
  const csv="﻿"+[head,...body].map(row=>row.map(v=>'"'+String(v).replace(/^[=+@-]/,"'").replace(/"/g,'""')+'"').join(";")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download=`comissoes-${from}-a-${to}.csv`;a.click();URL.revokeObjectURL(url)}
 if(!allowed)return <section className="box"><h2>Acesso restrito</h2><p>O proprietário precisa conceder a permissão de financeiro para ver comissões.</p></section>;
 return <>
  <section className="box inventory-header"><div><h2>Comissões da equipe</h2><p>Quanto cada profissional gerou e tem a receber no período, somando atendimentos, comandas e produtos vendidos.</p></div><div className="report-actions"><button type="button" onClick={()=>window.print()}><Printer size={16}/>Imprimir / PDF</button><button type="button" onClick={exportCsv} disabled={!filtered.length}><FileDown size={16}/>Exportar CSV</button></div></section>
  <section className="box"><div className="inventory-filters"><label>De<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Até<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><label>Profissional<select value={barber} onChange={e=>setBarber(e.target.value)}><option value="">Todos</option>{barbers.map(b=><option key={b.id} value={b.id}>{b.name}{b.active?"":" (inativo)"}</option>)}</select></label></div></section>
  {error&&<p role="alert" className="form-alert error">{error}</p>}
  <div className="report-cards"><div className="metric-card"><small>Total vendido pela equipe</small><strong>{money(totalBase)}</strong></div><div className="metric-card"><small>Total de comissões</small><strong>{money(totalValue)}</strong></div><div className="metric-card"><small>Profissionais com vendas</small><strong>{groups.length}</strong></div><div className="metric-card"><small>Lançamentos</small><strong>{filtered.length}</strong></div></div>
  {anyEstimated&&<p className="form-alert commission-note"><Info size={15}/> Itens marcados com <b>*</b> não tinham a comissão registrada na venda (ex.: agendamentos feitos pelo site). Para eles, usamos a % cadastrada hoje no serviço.</p>}
  <section className="box">{loading?<p className="empty">Calculando comissões...</p>:!groups.length?<div className="empty-state"><Percent/><strong>Nenhuma venda com profissional neste período</strong></div>:<div className="commission-list">{groups.map(g=><article key={g.barber_id} className={"commission-card"+(open===g.barber_id?" open":"")}>
   <button type="button" className="commission-head" onClick={()=>setOpen(o=>o===g.barber_id?null:g.barber_id)} aria-expanded={open===g.barber_id}><span className="client-avatar"><UserRound size={16}/></span><span className="commission-who"><strong>{g.name}</strong><small>{g.count} {g.count===1?"lançamento":"lançamentos"} · vendeu {money(g.base)}</small></span><span className="commission-total"><small>A receber</small><strong>{money(g.value)}</strong></span><ChevronDown size={18} className="commission-chevron"/></button>
   {open===g.barber_id&&<div className="sales-report-table-wrap"><table className="sales-report-table"><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Base</th><th>%</th><th>Comissão</th></tr></thead><tbody>{g.rows.map((r,i)=><tr key={i}><td>{new Date(r.date).toLocaleDateString("pt-BR")}</td><td>{r.kind}</td><td>{r.label}</td><td>{money(r.base)}</td><td>{pct(r.bps)}{r.estimated?" *":""}</td><td>{money(r.value)}</td></tr>)}</tbody></table></div>}
  </article>)}</div>}</section>
  <p className="form-hint">Valores para conferência e pagamento da equipe. Vendas canceladas não entram. Vendas do Caixa Rápido só entram quando têm um profissional selecionado; serviços vendidos pelo Caixa Rápido ainda não registram comissão — use Comandas para isso.</p>
 </>;
}
export default function CommissionsPage(){return <ModuleShell title="Comissões" eyebrow="Equipe e pagamentos">{workspace=><Commissions workspace={workspace}/>}</ModuleShell>}
