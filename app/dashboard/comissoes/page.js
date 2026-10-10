"use client";
import {notify} from "../../../lib/notify";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {Check,ChevronDown,FileDown,Info,Pencil,Percent,Printer,UserRound,X} from "lucide-react";
import {supabase} from "../../../lib/supabase";
import ModuleShell from "../_components/ModuleShell";
const money=n=>(Number(n||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const pct=bps=>(Number(bps||0)/100).toLocaleString("pt-BR",{maximumFractionDigits:2})+"%";
const dateValue=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const monthStart=()=>{const d=new Date();return dateValue(new Date(d.getFullYear(),d.getMonth(),1))};
const byId=rows=>Object.fromEntries((rows||[]).map(x=>[x.id,x]));
const toBps=v=>{const s=String(v??"").trim().replace(",",".");if(s==="")return null;const n=Number(s);return Number.isFinite(n)&&n>=0&&n<=100?Math.round(n*100):NaN};

// % própria do profissional (Comissões → Editar %): primeiro a regra do item
// exato (um serviço ou um produto), depois a geral de serviços/produtos.
// Sem regra, vale a % do cadastro do serviço/produto.
function makeRuleFor(rules){
 return (barberId,kind,refId)=>{
  const own=rules.filter(r=>r.barber_id===barberId&&r.kind===kind);
  const exact=refId&&own.find(r=>(kind==="service"?r.service_id:r.product_id)===refId);
  const hit=exact||own.find(r=>!r.service_id&&!r.product_id);
  return hit?Number(hit.rate_bps):null;
 };
}

// Comissão de um atendimento: % do profissional quando cadastrada; senão a %
// registrada no agendamento; senão (agendamentos do site gravavam 0) a % atual de cada serviço.
function appointmentCommission(appt,amount,apptServices,services,barberId,ruleFor){
 const lines=apptServices.length?apptServices:appt?.service_id?[{service_id:appt.service_id,price_cents:amount}]:[];
 const rules=lines.map(l=>ruleFor(barberId,"service",l.service_id));
 const snapshot=Number(appt?.commission_bps)>0?Number(appt.commission_bps):null;
 if(rules.every(r=>r==null)&&snapshot!=null)return {bps:snapshot,value:Math.round(amount*snapshot/10000),estimated:false,own:false};
 const base=lines.reduce((s,l)=>s+Number(l.price_cents||0),0)||amount;
 let estimated=false;
 const value=lines.reduce((s,l,i)=>{let bps=rules[i];if(bps==null){bps=snapshot??Number(services[l.service_id]?.commission_bps||0);if(snapshot==null)estimated=true}return s+Math.round(amount*(Number(l.price_cents||0)/base)*bps/10000)},0);
 return {bps:amount?Math.round(value*10000/amount):0,value,estimated,own:rules.some(r=>r!=null)};
}

const pctText=bps=>String(Number(bps)/100).replace(".",",");
const cleanPct=v=>v.replace(/[^0-9.,]/g,"");

// Uma linha por profissional: % geral de serviços e de produtos e, abaixo,
// regras para um serviço ou produto específico (ex.: gel 50%, pomada 20%).
function RatesEditor({tenantId,barbers,rules,services,products,productRules,onSaved,close}){
 const initial=b=>{
  const mine=rules.filter(r=>r.barber_id===b),general=k=>mine.find(r=>r.kind===k&&!r.service_id&&!r.product_id);
  return {service:general("service")?pctText(general("service").rate_bps):"",product:general("product")?pctText(general("product").rate_bps):"",
   items:mine.filter(r=>r.service_id||r.product_id).map(r=>({key:r.service_id?"s:"+r.service_id:"p:"+r.product_id,pct:pctText(r.rate_bps)}))};
 };
 const [values,setValues]=useState(()=>Object.fromEntries(barbers.map(b=>[b.id,initial(b.id)])));
 const [open,setOpen]=useState(barbers[0]?.id||""),[busy,setBusy]=useState(""),[error,setError]=useState("");
 const set=(id,patch)=>setValues(x=>({...x,[id]:{...x[id],...patch}}));
 const setItem=(id,i,patch)=>setValues(x=>({...x,[id]:{...x[id],items:x[id].items.map((it,j)=>j===i?{...it,...patch}:it)}}));
 const itemName=key=>{const [k,id]=key.split(":");return (k==="s"?services:products).find(x=>x.id===id)?.name||"Item removido"};
 async function save(b){
  const v=values[b.id],service=toBps(v.service),product=toBps(v.product),items=v.items.filter(it=>it.key);
  if([service,product,...items.map(it=>toBps(it.pct))].some(Number.isNaN))return setError("Use uma porcentagem entre 0 e 100.");
  if(items.some(it=>toBps(it.pct)==null))return setError("Informe a % de cada serviço ou produto escolhido (ou remova a linha).");
  if(new Set(items.map(it=>it.key)).size!==items.length)return setError("Cada serviço ou produto só pode aparecer uma vez.");
  setBusy(b.id);setError("");
  const p=[...(service!=null?[{kind:"service",rate_bps:service}]:[]),...(product!=null?[{kind:"product",rate_bps:product}]:[]),
   ...items.map(it=>{const [k,id]=it.key.split(":");return k==="s"?{kind:"service",service_id:id,rate_bps:toBps(it.pct)}:{kind:"product",product_id:id,rate_bps:toBps(it.pct)}})];
  const {error}=await supabase.rpc("save_commission_rules",{t:tenantId,b:b.id,p});
  setBusy("");if(error)return setError(error.message);
  notify(`Comissão de ${b.name.split(" ")[0]} atualizada.`);onSaved();
 }
 return <div className="checkout-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)close()}}><div className="checkout-modal rates-modal">
  <button type="button" className="checkout-close" onClick={close} aria-label="Fechar"><X/></button>
  <p className="eyebrow">COMISSÕES</p><h2>% de cada profissional</h2>
  <p className="rates-hint">Em branco, vale a % cadastrada em cada serviço e produto. A % de um item específico vale mais que a geral. Vale para os cálculos desta tela, inclusive de vendas já feitas.</p>
  <div className="rates-list">{barbers.map(b=>{const v=values[b.id],isOpen=open===b.id;return <div className={"rates-card"+(isOpen?" open":"")} key={b.id}>
   <button type="button" className="rates-card-head" onClick={()=>setOpen(isOpen?"":b.id)} aria-expanded={isOpen}><span className="client-avatar">{b.photo_url?<img src={b.photo_url} alt=""/>:<UserRound size={16}/>}</span><span className="rates-card-name"><strong>{b.name}</strong><small>{[v.service&&`Serviços ${v.service}%`,v.product&&`Produtos ${v.product}%`,v.items.length&&`${v.items.length} ${v.items.length===1?"item específico":"itens específicos"}`].filter(Boolean).join(" · ")||"% do cadastro de cada item"}</small></span><ChevronDown size={18}/></button>
   {isOpen&&<div className="rates-card-body">
    <div className="rates-general">
     <label>Todos os serviços<span className="rates-input"><input inputMode="decimal" value={v.service} placeholder="Padrão" onChange={e=>set(b.id,{service:cleanPct(e.target.value)})} aria-label={`% de serviços de ${b.name}`}/><i>%</i></span></label>
     <label>Todos os produtos<span className="rates-input"><input inputMode="decimal" value={v.product} placeholder="Padrão" onChange={e=>set(b.id,{product:cleanPct(e.target.value)})} aria-label={`% de produtos de ${b.name}`}/><i>%</i></span></label>
    </div>
    <div className="rates-items">
     <strong className="rates-items-title">Serviço ou produto específico</strong>
     {v.items.length===0&&<p className="rates-empty">Nenhum. Ex.: o gel paga 50% e a pomada 20%.</p>}
     {v.items.map((it,i)=><div className="rates-item" key={i}>
      <select value={it.key} onChange={e=>setItem(b.id,i,{key:e.target.value})} aria-label="Serviço ou produto">
       <option value="">Escolha...</option>
       {services.length>0&&<optgroup label="Serviços">{services.map(x=><option key={x.id} value={"s:"+x.id}>{x.name}</option>)}</optgroup>}
       {productRules&&products.length>0&&<optgroup label="Produtos">{products.map(x=><option key={x.id} value={"p:"+x.id}>{x.name}</option>)}</optgroup>}
       {it.key&&!(it.key.startsWith("s:")?services:products).some(x=>"sp"[+it.key.startsWith("p:")]+":"+x.id===it.key)&&<option value={it.key}>{itemName(it.key)}</option>}
      </select>
      <span className="rates-input"><input inputMode="decimal" value={it.pct} placeholder="%" onChange={e=>setItem(b.id,i,{pct:cleanPct(e.target.value)})} aria-label="Porcentagem"/><i>%</i></span>
      <button type="button" className="sch-icon" onClick={()=>set(b.id,{items:v.items.filter((_,j)=>j!==i)})} aria-label="Remover"><X size={15}/></button>
     </div>)}
     <button type="button" className="sch-link" onClick={()=>set(b.id,{items:[...v.items,{key:"",pct:""}]})}>+ Adicionar serviço ou produto</button>
     {!productRules&&<p className="rates-empty">A % por produto específico fica disponível depois da atualização do banco.</p>}
    </div>
    <div className="rates-save"><button type="button" className="primary" disabled={!!busy} onClick={()=>save(b)}><Check size={15}/>{busy===b.id?"Salvando...":`Salvar ${b.name.split(" ")[0]}`}</button></div>
   </div>}
  </div>})}</div>
  {error&&<div className="form-alert error">{error}</div>}
 </div></div>;
}

function Commissions({workspace}){
 const t=workspace.tenant.id,m=workspace.membership,allowed=m.role==="owner"||(["manager","reception"].includes(m.role)&&m.permissions?.includes("finance"));
 const [from,setFrom]=useState(monthStart),[to,setTo]=useState(()=>dateValue(new Date())),[barber,setBarber]=useState(""),[rows,setRows]=useState([]),[barbers,setBarbers]=useState([]),[rules,setRules]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[open,setOpen]=useState(null),[editRates,setEditRates]=useState(false),[catalog,setCatalog]=useState({services:[],products:[],productRules:true});
 const seq=useRef(0);
 const load=useCallback(async()=>{const version=++seq.current;if(!allowed){setLoading(false);return}setLoading(true);setError("");
  try{
   if(!from||!to||from>to)throw new Error("Confira as datas do período.");
   const st=new Date(from+"T00:00:00"),en=new Date(to+"T00:00:00");en.setDate(en.getDate()+1);
   const range=q=>q.gte("created_at",st.toISOString()).lt("created_at",en.toISOString());
   let [b,s,pay,orders,quick,cr,pr]=await Promise.all([
    supabase.from("barbers").select("id,name,active,photo_url").eq("tenant_id",t).order("name"),
    supabase.from("services").select("id,name,commission_bps").eq("tenant_id",t),
    range(supabase.from("appointment_payments").select("id,appointment_id,barber_id,service_id,amount_cents,status,created_at").eq("tenant_id",t).neq("status","cancelled")),
    supabase.from("order_tabs").select("id,barber_id,appointment_id,closed_at").eq("tenant_id",t).eq("status","closed").gte("closed_at",st.toISOString()).lt("closed_at",en.toISOString()),
    range(supabase.from("quick_sales").select("id,barber_id,status,created_at,description,amount_cents,commission_cents").eq("tenant_id",t).is("order_id",null).neq("status","cancelled").not("barber_id","is",null)),
    supabase.from("commission_rules").select("barber_id,kind,service_id,product_id,rate_bps").eq("tenant_id",t),
    supabase.from("products").select("id,name").eq("barbershop_id",t).eq("active",true).order("name")
   ]);
   const fail=[b,s,pay,orders,quick].find(r=>r.error)?.error;if(fail)throw fail;
   // Banco ainda sem a coluna product_id: lê as regras sem ela e esconde a % por produto.
   let perProduct=true;
   if(cr.error&&/product_id/.test(cr.error.message||"")){perProduct=false;cr=await supabase.from("commission_rules").select("barber_id,kind,service_id,rate_bps").eq("tenant_id",t)}
   const ruleList=cr.data||[],ruleFor=makeRuleFor(ruleList);
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
   const movesBySale=(moves.data||[]).reduce((acc,mv)=>{(acc[mv.sale_id]=acc[mv.sale_id]||[]).push(mv);return acc},{});
   const out=[];
   for(const p of payments){const a=appts[p.appointment_id],c=appointmentCommission(a,Number(p.amount_cents||0),apptLines[p.appointment_id]||[],services,p.barber_id,ruleFor);
    out.push({barber_id:p.barber_id,date:p.created_at,kind:"Atendimento",label:(apptLines[p.appointment_id]||[]).map(l=>services[l.service_id]?.name).filter(Boolean).join(" + ")||services[p.service_id]?.name||"Atendimento",base:Number(p.amount_cents||0),...c})}
   const tabById=byId(tabs);
   for(const it of items.data||[]){const o=tabById[it.order_id];if(!o)continue;const base=Number(it.quantity)*Number(it.unit_price_cents);
    if(it.kind==="appointment"){const a=appts[o.appointment_id],c=appointmentCommission(a,base,apptLines[o.appointment_id]||[],services,o.barber_id,ruleFor);out.push({barber_id:o.barber_id,date:o.closed_at,kind:"Comanda",label:"Atendimento agendado",base,...c})}
    else{const kind=it.kind==="product"?"product":"service",rule=ruleFor(o.barber_id,kind,it.reference_id),bps=rule??Number(it.commission_bps||0);out.push({barber_id:o.barber_id,date:o.closed_at,kind:kind==="product"?"Produto (comanda)":"Serviço (comanda)",label:`${it.quantity}× ${it.name}`,base,bps,value:Math.round(base*bps/10000),estimated:false,own:rule!=null})}}
   for(const q of quickSales){
    const mv=movesBySale[q.id]||[],amount=Number(q.amount_cents||0);
    const prod=mv.map(x=>{const qty=Math.abs(Number(x.quantity||0)),base=Math.round(qty*Number(x.unit_price||0)*100),snap=Math.round(Number(x.commission_pct||0)*100),rule=ruleFor(q.barber_id,"product",x.product_id);return {qty,base,snap,bps:rule??snap,own:rule!=null}});
    const prodBase=prod.reduce((s,x)=>s+x.base,0),prodValue=prod.reduce((s,x)=>s+Math.round(x.base*x.bps/10000),0),prodSnap=prod.reduce((s,x)=>s+Math.round(x.base*x.snap/10000),0);
    // Vendas antigas (antes de 02/10/2026) só têm a comissão dos produtos.
    if(q.commission_cents==null){prod.forEach(x=>out.push({barber_id:q.barber_id,date:q.created_at,kind:"Produto (venda rápida)",label:`${x.qty}× produto`,base:x.base,bps:x.bps,value:Math.round(x.base*x.bps/10000),estimated:false,own:x.own}));continue}
    const svcBase=Math.max(0,amount-prodBase),svcRule=ruleFor(q.barber_id,"service",null),svcValue=svcRule!=null?Math.round(svcBase*svcRule/10000):Math.max(0,Number(q.commission_cents)-prodSnap),value=svcValue+prodValue;
    out.push({barber_id:q.barber_id,date:q.created_at,kind:"Venda rápida",label:q.description||"Venda",base:amount,bps:amount?Math.round(value*10000/amount):0,value,estimated:false,own:svcRule!=null||prod.some(x=>x.own)});
   }
   setBarbers(b.data||[]);setRules(ruleList);setCatalog({services:(s.data||[]).map(x=>({id:x.id,name:x.name})).sort((x,y)=>x.name.localeCompare(y.name,"pt-BR")),products:pr.data||[],productRules:perProduct});setRows(out.sort((x,y)=>new Date(y.date)-new Date(x.date)));
  }catch(e){if(version===seq.current){setError(e.message);setRows([])}}finally{if(version===seq.current)setLoading(false)}
 },[t,from,to,allowed]);
 useEffect(()=>{load()},[load]);
 const names=useMemo(()=>byId(barbers),[barbers]);
 const ownRate=(id,kind)=>{const r=rules.find(x=>x.barber_id===id&&x.kind===kind&&!x.service_id&&!x.product_id);return r?pct(r.rate_bps):null};
 const filtered=rows.filter(r=>!barber||r.barber_id===barber);
 const groups=useMemo(()=>Object.values(filtered.reduce((acc,r)=>{const g=acc[r.barber_id]||(acc[r.barber_id]={barber_id:r.barber_id,name:names[r.barber_id]?.name||"Profissional removido",photo:names[r.barber_id]?.photo_url,base:0,value:0,count:0,rows:[]});g.base+=r.base;g.value+=r.value;g.count++;g.rows.push(r);return acc},{})).sort((a,b)=>b.value-a.value),[filtered,names]);
 const totalBase=groups.reduce((s,g)=>s+g.base,0),totalValue=groups.reduce((s,g)=>s+g.value,0),anyEstimated=filtered.some(r=>r.estimated);
 function exportCsv(){const head=["Profissional","Data","Tipo","Descrição","Valor base","Comissão %","Comissão R$","Origem da %"];
  const body=filtered.map(r=>[names[r.barber_id]?.name||"",new Date(r.date).toLocaleString("pt-BR"),r.kind,r.label,(r.base/100).toFixed(2).replace(".",","),(r.bps/100).toFixed(2).replace(".",","),(r.value/100).toFixed(2).replace(".",","),r.own?"% do profissional":r.estimated?"Cadastro atual do serviço":"Registrada na venda"]);
  const csv="﻿"+[head,...body].map(row=>row.map(v=>'"'+String(v).replace(/^[=+@-]/,"'").replace(/"/g,'""')+'"').join(";")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download=`comissoes-${from}-a-${to}.csv`;a.click();URL.revokeObjectURL(url)}
 if(!allowed)return <section className="box"><h2>Acesso restrito</h2><p>O proprietário precisa conceder a permissão de financeiro para ver comissões.</p></section>;
 const active=barbers.filter(b=>b.active);
 return <>
  <section className="box inventory-header"><div><h2>Comissões da equipe</h2><p>Quanto cada profissional gerou e tem a receber no período, somando atendimentos, comandas e produtos vendidos.</p></div><div className="report-actions"><button type="button" className="primary" onClick={()=>setEditRates(true)} disabled={!active.length}><Pencil size={16}/>Editar % dos profissionais</button><button type="button" onClick={()=>window.print()}><Printer size={16}/>Imprimir / PDF</button><button type="button" onClick={exportCsv} disabled={!filtered.length}><FileDown size={16}/>Exportar CSV</button></div></section>
  {active.length>0&&<section className="box rates-strip"><div className="rates-strip-head"><strong>% dos profissionais</strong><button type="button" className="sch-link" onClick={()=>setEditRates(true)}><Pencil size={13}/>Editar</button></div><div className="rates-chips">{active.map(b=>{const s=ownRate(b.id,"service"),p=ownRate(b.id,"product"),n=rules.filter(r=>r.barber_id===b.id&&(r.service_id||r.product_id)).length;return <button type="button" key={b.id} className="rates-chip" onClick={()=>setEditRates(true)}><span className="client-avatar">{b.photo_url?<img src={b.photo_url} alt=""/>:<UserRound size={14}/>}</span><span><b>{b.name.split(" ")[0]}</b><small>{s||p||n?[`Serviços ${s||"padrão"}`,`Produtos ${p||"padrão"}`,n?`${n} ${n===1?"item":"itens"} com % própria`:""].filter(Boolean).join(" · "):"% do cadastro de cada serviço"}</small></span></button>})}</div></section>}
  <section className="box"><div className="inventory-filters"><label>De<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Até<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><label>Profissional<select value={barber} onChange={e=>setBarber(e.target.value)}><option value="">Todos</option>{barbers.map(b=><option key={b.id} value={b.id}>{b.name}{b.active?"":" (inativo)"}</option>)}</select></label></div></section>
  {error&&<p role="alert" className="form-alert error">{error}</p>}
  <div className="report-cards"><div className="metric-card"><small>Total vendido pela equipe</small><strong>{money(totalBase)}</strong></div><div className="metric-card"><small>Total de comissões</small><strong>{money(totalValue)}</strong></div><div className="metric-card"><small>Profissionais com vendas</small><strong>{groups.length}</strong></div><div className="metric-card"><small>Lançamentos</small><strong>{filtered.length}</strong></div></div>
  {anyEstimated&&<p className="form-alert commission-note"><Info size={15}/> Itens marcados com <b>*</b> não tinham a comissão registrada na venda (ex.: agendamentos feitos pelo site). Para eles, usamos a % cadastrada hoje no serviço.</p>}
  <section className="box">{loading?<p className="empty">Calculando comissões...</p>:!groups.length?<div className="empty-state"><Percent/><strong>Nenhuma venda com profissional neste período</strong></div>:<div className="commission-list">{groups.map(g=><article key={g.barber_id} className={"commission-card"+(open===g.barber_id?" open":"")}>
   <button type="button" className="commission-head" onClick={()=>setOpen(o=>o===g.barber_id?null:g.barber_id)} aria-expanded={open===g.barber_id}><span className="client-avatar">{g.photo?<img src={g.photo} alt=""/>:<UserRound size={16}/>}</span><span className="commission-who"><strong>{g.name}</strong><small>{g.count} {g.count===1?"lançamento":"lançamentos"} · vendeu {money(g.base)}</small></span><span className="commission-total"><small>A receber</small><strong>{money(g.value)}</strong></span><ChevronDown size={18} className="commission-chevron"/></button>
   {open===g.barber_id&&<div className="sales-report-table-wrap"><table className="sales-report-table rt-cards"><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Base</th><th>%</th><th>Comissão</th></tr></thead><tbody>{g.rows.map((r,i)=><tr key={i}><td data-label="Data">{new Date(r.date).toLocaleDateString("pt-BR")}</td><td data-label="Tipo">{r.kind}</td><td data-label="Descrição" className="rt-wide">{r.label}</td><td data-label="Base">{money(r.base)}</td><td data-label="%">{pct(r.bps)}{r.estimated?" *":""}{r.own?" (prof.)":""}</td><td data-label="Comissão" className="rt-strong">{money(r.value)}</td></tr>)}</tbody></table></div>}
  </article>)}</div>}</section>
  <p className="form-hint">Valores para conferência e pagamento da equipe. Vendas canceladas não entram. Vendas do Caixa Rápido só entram quando têm um profissional selecionado. “(prof.)” indica a % própria do profissional.</p>
  {editRates&&<RatesEditor tenantId={t} barbers={active} rules={rules} services={catalog.services} products={catalog.products} productRules={catalog.productRules} close={()=>setEditRates(false)} onSaved={()=>{load()}}/>}
 </>;
}
export default function CommissionsPage(){return <ModuleShell title="Comissões" eyebrow="Equipe e pagamentos">{workspace=><Commissions workspace={workspace}/>}</ModuleShell>}
