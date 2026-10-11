"use client";
import {useEffect,useMemo,useState} from "react";
import {FileDown,Filter,Printer,RotateCcw} from "lucide-react";
import {supabase} from "../../../lib/supabase";
import ModuleShell from "../_components/ModuleShell";
const money=v=>(Number(v||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const qtyFmt=v=>Number(v||0).toLocaleString("pt-BR",{maximumFractionDigits:2});
const labels={pix:"PIX",cash:"Dinheiro",credit:"Crédito",debit:"Débito",account:"Conta do cliente",transfer:"Transferência"};
const statusLabels={paid:"Pago",open:"Em aberto",cancelled:"Cancelado"};
const kindLabels={service:"Serviço",product:"Produto",other:"Avulso"};
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const plain=v=>String(v||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();
const PRESETS=[["7","7 dias"],["30","30 dias"],["90","90 dias"],["month","Este mês"],["custom","Período"]];
const plural=n=>`${n} ${n===1?"venda":"vendas"}`;
const byId=rows=>Object.fromEntries((rows||[]).map(x=>[x.id,x]));
const group=(rows,fn)=>rows.reduce((a,x)=>{const k=fn(x);(a[k]=a[k]||[]).push(x);return a},{});

function rangeOf(preset,from,to){
 const now=new Date();
 if(preset==="custom")return [from?new Date(from+"T00:00:00"):new Date(now.getFullYear(),now.getMonth(),1),to?new Date(to+"T23:59:59.999"):now];
 if(preset==="month")return [new Date(now.getFullYear(),now.getMonth(),1),now];
 const s=new Date(now);s.setHours(0,0,0,0);s.setDate(s.getDate()-Number(preset)+1);return [s,now];
}

// Divide cada venda em itens (serviços e produtos) para poder filtrar por item.
function buildLines({payments,apptLines,quick,moves,orderItems,services,products}){
 const out=[],svcByName=Object.fromEntries(services.map(s=>[plain(s.name),s])),prodName=Object.fromEntries(products.map(p=>[p.id,p.name]));
 const share=(parts,total)=>{const base=parts.reduce((s,p)=>s+p.weight,0);let left=total;return parts.map((p,i)=>{const v=i===parts.length-1?left:Math.round(total*(base?p.weight/base:1/parts.length));left-=v;return {...p,amount:v}})};
 for(const p of payments){
  const sale={key:"a"+p.id,at:p.paid_at||p.created_at,client_id:p.client_id,barber_id:p.barber_id,method:p.method,status:p.status,source:"Atendimento"};
  const lines=(apptLines[p.appointment_id]||[]).map(l=>({kind:"service",ref:l.service_id,name:services.find(s=>s.id===l.service_id)?.name||"Serviço",qty:1,weight:Number(l.price_cents||0)}));
  const parts=lines.length?lines:[{kind:"service",ref:p.service_id,name:services.find(s=>s.id===p.service_id)?.name||"Atendimento",qty:1,weight:1}];
  share(parts,Number(p.amount_cents||0)).forEach(x=>out.push({...sale,...x}));
 }
 for(const q of quick){
  const sale={key:"q"+q.id,at:q.paid_at||q.created_at,client_id:q.client_id,barber_id:q.barber_id,method:q.method,status:q.status,source:q.order_id?"Comanda":"Caixa rápido"},amount=Number(q.amount_cents||0);
  if(q.order_id){
   const items=(orderItems[q.order_id]||[]).map(i=>({kind:i.kind==="product"?"product":"service",ref:i.reference_id,name:i.name,qty:Number(i.quantity||1),weight:Number(i.quantity||1)*Number(i.unit_price_cents||0)}));
   share(items.length?items:[{kind:"other",ref:null,name:q.description||"Comanda",qty:1,weight:1}],amount).forEach(x=>out.push({...sale,...x}));continue;
  }
  const prods=(moves[q.id]||[]).map(m=>{const qty=Math.abs(Number(m.quantity||0));return {kind:"product",ref:m.product_id,name:prodName[m.product_id]||"Produto",qty,amount:Math.round(qty*Number(m.unit_price||0)*100)}});
  const prodTotal=prods.reduce((s,x)=>s+x.amount,0),prodNames=new Set(prods.map(x=>plain(x.name)));
  prods.forEach(x=>out.push({...sale,...x}));
  const rest=Math.max(0,amount-prodTotal);if(!rest)continue;
  const parts=String(q.description||"").split(" + ").map(t=>{const m=t.match(/^(\d+)x\s+(.+)$/);return m?{qty:Number(m[1]),name:m[2].trim()}:{qty:1,name:t.trim()}}).filter(x=>x.name&&!prodNames.has(plain(x.name)));
  const svc=parts.map(x=>{const s=svcByName[plain(x.name)];return {kind:s?"service":"other",ref:s?.id||null,name:s?.name||x.name,qty:x.qty,weight:(s?Number(s.price_cents||0):0)*x.qty||x.qty}});
  share(svc.length?svc:[{kind:"other",ref:null,name:q.description||"Venda avulsa",qty:1,weight:1}],rest).forEach(x=>out.push({...sale,...x}));
 }
 return out.sort((a,b)=>new Date(b.at)-new Date(a.at));
}

function Ranking({title,rows,empty}){
 const max=Math.max(1,...rows.map(r=>r.total));
 return <section className="box rep-rank"><h2>{title}</h2>{rows.length?<div className="rep-bars">{rows.map(r=><div key={r.name}><div className="rep-bar-head"><span>{r.name}</span><b>{money(r.total)}</b></div><div className="rep-bar"><i style={{width:Math.max(3,Math.round(r.total/max*100))+"%"}}/></div>{r.note&&<small>{r.note}</small>}</div>)}</div>:<p className="empty">{empty}</p>}</section>;
}

function Reports({workspace}){
 const t=workspace.tenant.id;
 const [preset,setPreset]=useState("30"),[from,setFrom]=useState(()=>iso(new Date(new Date().getFullYear(),new Date().getMonth(),1))),[to,setTo]=useState(()=>iso(new Date()));
 const [f,setF]=useState({barber:"",service:"",product:"",method:"",status:"",kind:""}),[showFilters,setShowFilters]=useState(false);
 const [data,setData]=useState({lines:[],services:[],products:[],barbers:[],clients:{}}),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [since,until]=useMemo(()=>rangeOf(preset,from,to),[preset,from,to]);
 useEffect(()=>{let alive=true;(async()=>{
  setLoading(true);setError("");
  try{
   const range=`created_at.gte.${since.toISOString()},paid_at.gte.${since.toISOString()}`;
   const [pay,qs,sv,pr,br]=await Promise.all([
    supabase.from("appointment_payments").select("id,appointment_id,client_id,barber_id,service_id,amount_cents,method,status,paid_at,created_at").eq("tenant_id",t).or(range).order("created_at",{ascending:false}).limit(3000),
    supabase.from("quick_sales").select("id,client_id,barber_id,description,amount_cents,method,status,paid_at,created_at,order_id").eq("tenant_id",t).or(range).order("created_at",{ascending:false}).limit(3000),
    supabase.from("services").select("id,name,price_cents,active").eq("tenant_id",t).order("name"),
    supabase.from("products").select("id,name").eq("barbershop_id",t).order("name"),
    supabase.from("barbers").select("id,name,active").eq("tenant_id",t).order("name")
   ]);
   const fail=[pay,qs,sv,br].find(r=>r.error)?.error;if(fail)throw fail;
   const inRange=x=>{const d=new Date(x.paid_at||x.created_at);return d>=since&&d<=until};
   const payments=(pay.data||[]).filter(inRange),quick=(qs.data||[]).filter(inRange);
   const apptIds=[...new Set(payments.map(p=>p.appointment_id).filter(Boolean))],saleIds=quick.filter(q=>!q.order_id).map(q=>q.id),orderIds=[...new Set(quick.map(q=>q.order_id).filter(Boolean))],clientIds=[...new Set([...payments,...quick].map(x=>x.client_id).filter(Boolean))];
   const chunk=(ids,fn)=>Promise.all(Array.from({length:Math.ceil(ids.length/150)},(_,i)=>fn(ids.slice(i*150,i*150+150)))).then(rs=>({data:rs.flatMap(r=>r.data||[])}));
   const [as,mv,oi,cl]=await Promise.all([
    apptIds.length?chunk(apptIds,ids=>supabase.from("appointment_services").select("appointment_id,service_id,price_cents").eq("tenant_id",t).in("appointment_id",ids)):{data:[]},
    saleIds.length?chunk(saleIds,ids=>supabase.from("stock_movements").select("sale_id,product_id,quantity,unit_price").eq("barbershop_id",t).eq("movement_type","sale").in("sale_id",ids)):{data:[]},
    orderIds.length?chunk(orderIds,ids=>supabase.from("order_items").select("order_id,kind,reference_id,name,quantity,unit_price_cents,removed_at").eq("tenant_id",t).in("order_id",ids).is("removed_at",null)):{data:[]},
    clientIds.length?chunk(clientIds,ids=>supabase.from("clients").select("id,name").eq("tenant_id",t).in("id",ids)):{data:[]}
   ]);
   if(!alive)return;
   const services=sv.data||[],products=pr.data||[];
   const lines=buildLines({payments,apptLines:group(as.data,x=>x.appointment_id),quick,moves:group(mv.data,x=>x.sale_id),orderItems:group(oi.data,x=>x.order_id),services,products});
   setData({lines,services,products,barbers:br.data||[],clients:byId(cl.data)});
  }catch(e){if(alive){setError(e.message);setData(d=>({...d,lines:[]}))}}finally{if(alive)setLoading(false)}
 })();return()=>{alive=false}},[t,since,until]);

 const set=(k,v)=>setF(x=>({...x,[k]:v}));
 const active=Object.values(f).filter(Boolean).length;
 const rows=useMemo(()=>data.lines.filter(l=>{
  if(f.barber&&l.barber_id!==f.barber)return false;
  if(f.method&&l.method!==f.method)return false;
  if(f.status?l.status!==f.status:l.status==="cancelled")return false;
  if(f.kind&&l.kind!==f.kind)return false;
  if(f.service||f.product){const okS=f.service&&l.kind==="service"&&l.ref===f.service,okP=f.product&&l.kind==="product"&&l.ref===f.product;if(!okS&&!okP)return false}
  return true;
 }),[data.lines,f]);
 const paid=rows.filter(r=>r.status==="paid"),revenue=paid.reduce((s,r)=>s+r.amount,0),sales=new Set(paid.map(r=>r.key)).size,open=rows.filter(r=>r.status==="open").reduce((s,r)=>s+r.amount,0),itemsQty=paid.reduce((s,r)=>s+Number(r.qty||0),0);
 const barberName=id=>data.barbers.find(b=>b.id===id)?.name||"Sem profissional",clientName=id=>data.clients[id]?.name||"Cliente";
 const rank=(fn,note)=>Object.entries(group(paid,fn)).map(([name,list])=>({name,total:list.reduce((s,r)=>s+r.amount,0),note:note?note(list):null})).sort((a,b)=>b.total-a.total).slice(0,10);
 const periodText=`${since.toLocaleDateString("pt-BR")} a ${until.toLocaleDateString("pt-BR")}`;
 const chosen=[f.barber&&barberName(f.barber),f.service&&data.services.find(s=>s.id===f.service)?.name,f.product&&data.products.find(p=>p.id===f.product)?.name,f.method&&labels[f.method],f.status&&statusLabels[f.status],f.kind&&(f.kind==="service"?"Só serviços":f.kind==="product"?"Só produtos":"Avulsos")].filter(Boolean);

 function exportCsv(){const head=["Data","Origem","Cliente","Item","Tipo","Qtd.","Profissional","Pagamento","Status","Valor"];const body=rows.map(r=>[new Date(r.at).toLocaleString("pt-BR"),r.source,clientName(r.client_id),r.name,kindLabels[r.kind],qtyFmt(r.qty),barberName(r.barber_id),labels[r.method]||r.method,statusLabels[r.status]||r.status,(r.amount/100).toFixed(2).replace(".",",")]);const csv=[head,...body].map(r=>r.map(v=>`"${String(v).replace(/^[=+@-]/,"'").replace(/"/g,'""')}"`).join(";")).join("\r\n");const url=URL.createObjectURL(new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download=`relatorio-${iso(since)}-a-${iso(until)}.csv`;a.click();URL.revokeObjectURL(url)}

 const shown=rows.slice(0,300);
 return <>
  <section className="box rep-head">
   <div className="rep-title"><div><h2>Relatório de vendas</h2><p>{periodText}{chosen.length?" · "+chosen.join(" · "):""}</p></div><div className="report-actions"><button type="button" onClick={()=>window.print()}><Printer size={16}/>Imprimir / PDF</button><button type="button" onClick={exportCsv} disabled={!rows.length}><FileDown size={16}/>Exportar CSV</button></div></div>
   <div className="rep-period"><div className="fin-presets" role="group" aria-label="Período">{PRESETS.map(([k,l])=><button type="button" key={k} className={preset===k?"active":""} onClick={()=>setPreset(k)}>{l}</button>)}</div>
    {preset==="custom"&&<div className="rep-dates"><label>De<input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label><label>Até<input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)}/></label></div>}
    <button type="button" className={"secondary-action rep-toggle"+(showFilters?" on":"")} onClick={()=>setShowFilters(x=>!x)} aria-expanded={showFilters}><Filter size={15}/>Filtros{active?` (${active})`:""}</button></div>
   <div className={"rep-filters"+(showFilters?" open":"")}>
    <label>Profissional<select value={f.barber} onChange={e=>set("barber",e.target.value)}><option value="">Todos</option>{data.barbers.map(b=><option key={b.id} value={b.id}>{b.name}{b.active?"":" (inativo)"}</option>)}</select></label>
    <label>Serviço<select value={f.service} onChange={e=>set("service",e.target.value)}><option value="">Todos</option>{data.services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label>Produto<select value={f.product} onChange={e=>set("product",e.target.value)} disabled={!data.products.length}><option value="">{data.products.length?"Todos":"Nenhum produto"}</option>{data.products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label>Forma de pagamento<select value={f.method} onChange={e=>set("method",e.target.value)}><option value="">Todas</option>{Object.entries(labels).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label>
    <label>Tipo<select value={f.kind} onChange={e=>set("kind",e.target.value)}><option value="">Serviços e produtos</option><option value="service">Só serviços</option><option value="product">Só produtos</option><option value="other">Avulsos</option></select></label>
    <label>Status<select value={f.status} onChange={e=>set("status",e.target.value)}><option value="">Pagos e em aberto</option><option value="paid">Pago</option><option value="open">Em aberto</option><option value="cancelled">Cancelado</option></select></label>
    {active>0&&<button type="button" className="sch-link rep-clear" onClick={()=>setF({barber:"",service:"",product:"",method:"",status:"",kind:""})}><RotateCcw size={14}/>Limpar filtros</button>}
   </div>
  </section>
  {error&&<p className="form-alert error">{error}</p>}
  <div className="report-cards"><div className="metric-card"><small>Faturamento</small><strong>{money(revenue)}</strong></div><div className="metric-card"><small>Vendas</small><strong>{sales}</strong></div><div className="metric-card"><small>Ticket médio</small><strong>{money(sales?Math.round(revenue/sales):0)}</strong></div><div className="metric-card"><small>Itens vendidos</small><strong>{qtyFmt(itemsQty)}</strong></div><div className="metric-card"><small>Em aberto</small><strong>{money(open)}</strong></div></div>
  {loading?<section className="box"><p className="empty">Carregando relatório...</p></section>:<>
   <div className="report-grid rep-grid">
    <Ranking title="Serviços e produtos" rows={rank(r=>r.name,l=>{const n=l.reduce((s,r)=>s+Number(r.qty||0),0);return `${qtyFmt(n)} ${l[0]?.kind==="product"?"un.":n===1?"venda":"vendas"} · ${kindLabels[l[0]?.kind]}`})} empty="Nada vendido com esses filtros."/>
    <Ranking title="Profissionais" rows={rank(r=>barberName(r.barber_id),l=>plural(new Set(l.map(r=>r.key)).size))} empty="Sem vendas."/>
    <Ranking title="Formas de pagamento" rows={rank(r=>labels[r.method]||r.method||"—",l=>plural(new Set(l.map(r=>r.key)).size))} empty="Sem recebimentos."/>
   </div>
   <section className="box sales-report-print">
    <div className="sales-report-head"><div><span>RUPCONTROL · RELATÓRIO DE VENDAS</span><h2>{workspace.tenant?.name}</h2>{chosen.length>0&&<small>Filtros: {chosen.join(" · ")}</small>}</div><div><small>Período</small><strong>{periodText}</strong></div></div>
    <div className="sales-report-summary"><div><small>Faturamento</small><strong>{money(revenue)}</strong></div><div><small>Vendas</small><strong>{sales}</strong></div><div><small>Em aberto</small><strong>{money(open)}</strong></div><div><small>Registros</small><strong>{rows.length}</strong></div></div>
    <div className="sales-report-table-wrap"><table className="sales-report-table rt-cards"><thead><tr><th>Data</th><th>Cliente</th><th>Item</th><th>Profissional</th><th>Pagamento</th><th>Status</th><th>Valor</th></tr></thead><tbody>{rows.length===0?<tr><td colSpan="7">Nenhuma venda com esses filtros no período.</td></tr>:shown.map((r,i)=><tr key={r.key+i}><td data-label="Data">{new Date(r.at).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}</td><td data-label="Cliente">{clientName(r.client_id)}</td><td data-label="Item" className="rt-wide">{r.qty>1?`${qtyFmt(r.qty)}× `:""}{r.name} <small className="rep-kind">{kindLabels[r.kind]} · {r.source}</small></td><td data-label="Profissional">{barberName(r.barber_id)}</td><td data-label="Pagamento">{labels[r.method]||r.method||"—"}</td><td data-label="Status">{statusLabels[r.status]||r.status}</td><td data-label="Valor" className="rt-strong">{money(r.amount)}</td></tr>)}</tbody></table></div>
    {rows.length>shown.length&&<p className="form-hint">Mostrando os {shown.length} itens mais recentes de {rows.length}. Exporte o CSV para ver todos.</p>}
    <footer className="sales-report-footer">Gerado pelo RupControl · Ruptix</footer>
   </section>
  </>}
 </>;
}
export default function ReportsPage(){return <ModuleShell title="Relatórios" eyebrow="Indicadores">{workspace=><Reports workspace={workspace}/>}</ModuleShell>}
