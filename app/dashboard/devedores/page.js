"use client";
import {notify} from "../../../lib/notify";
import {useEffect,useMemo,useState} from "react";
import {Check,Clock3,HandCoins,MessageCircle,Search,Wallet,X} from "lucide-react";
import {supabase} from "../../../lib/supabase";
import {loadOpenDebts,daysSince} from "../../../lib/client-debts";
import {formatPhone,phoneDigits} from "../../../lib/phone";
import ModuleShell from "../_components/ModuleShell";

const money=v=>(Number(v||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const plain=v=>String(v||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
const METHODS=[["pix","PIX"],["cash","Dinheiro"],["credit","Crédito"],["debit","Débito"]];
const ago=iso=>{const d=daysSince(iso);return d===0?"hoje":d===1?"ontem":`há ${d} dias`};

function chargeLink(tenantName,client,debt){
 const phone=phoneDigits(client.whatsapp||client.phone);if(phone.length<10)return "";
 const list=debt.items.slice(0,5).map(x=>`• ${x.label} (${new Date(x.created_at).toLocaleDateString("pt-BR")}): ${money(x.amount_cents)}`).join("\n");
 const text=`Olá, ${String(client.name||"").split(" ")[0]}! Tudo bem? Aqui é da ${tenantName}.\nConsta um valor em aberto de ${money(debt.total)}:\n${list}\nPodemos acertar no PIX ou na sua próxima visita? Obrigado!`;
 return `https://wa.me/55${phone}?text=${encodeURIComponent(text)}`;
}

function Account({workspace,client,debt,close,changed}){
 const [busy,setBusy]=useState(""),[error,setError]=useState(""),[method,setMethod]=useState("pix");
 async function settle(items){
  if(busy)return;setBusy(items.length>1?"all":items[0].id);setError("");
  try{for(const d of items){const {error}=await supabase.rpc("settle_sale",{t:workspace.tenant.id,p_payment:d.id,p_type:d.sale_type,m:method});if(error)throw error}
   notify(items.length>1?"Conta quitada.":"Pagamento registrado.");await changed();}
  catch(e){setError(e.message)}finally{setBusy("")}
 }
 const link=debt?chargeLink(workspace.tenant.name,client,debt):"";
 return <div className="checkout-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)close()}}><div className="checkout-modal debtor-modal">
  <button type="button" className="checkout-close" onClick={close} aria-label="Fechar"><X/></button>
  <p className="eyebrow">CONTA DO CLIENTE</p><h2>{client.name}</h2>
  <p className="debtor-sub">{formatPhone(client.phone||client.whatsapp)||"Sem celular"}</p>
  {!debt?<div className="form-alert success"><Check size={14}/> Cliente sem valores em aberto.</div>:<>
   <div className="debtor-total"><span>Em aberto</span><strong>{money(debt.total)}</strong><small>{debt.count===1?"1 pendência":`${debt.count} pendências`} · desde {new Date(debt.oldest).toLocaleDateString("pt-BR")}</small></div>
   <b className="payment-title">Recebido em</b>
   <div className="payment-methods">{METHODS.map(([v,l])=><button type="button" key={v} className={method===v?"active":""} onClick={()=>setMethod(v)}>{l}</button>)}</div>
   <div className="debtor-items">{debt.items.map(d=><div key={d.sale_type+d.id}><span><strong>{d.label}</strong><small><Clock3 size={12}/>{new Date(d.created_at).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})} · {ago(d.created_at)}</small></span><b>{money(d.amount_cents)}</b><button type="button" className="secondary-action" disabled={!!busy} onClick={()=>settle([d])}>{busy===d.id?"...":"Receber"}</button></div>)}</div>
   {error&&<div className="form-alert error">{error}</div>}
   <div className="debtor-actions">{link&&<a className="secondary-action" href={link} target="_blank" rel="noreferrer"><MessageCircle size={16}/>Cobrar no WhatsApp</a>}<button type="button" className="primary" disabled={!!busy} onClick={()=>settle(debt.items)}><Check size={16}/>{busy==="all"?"Registrando...":`Receber tudo (${money(debt.total)})`}</button></div>
  </>}
 </div></div>;
}

function Debtors({workspace}){
 const t=workspace.tenant.id;
 const [debts,setDebts]=useState({byClient:new Map(),items:[]}),[clients,setClients]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[q,setQ]=useState(""),[sort,setSort]=useState("value"),[open,setOpen]=useState(null);
 async function load(){
  const out=await loadOpenDebts(supabase,t);
  const ids=[...out.byClient.keys()];
  const c=ids.length?await supabase.from("clients").select("id,name,phone,whatsapp").eq("tenant_id",t).in("id",ids):{data:[]};
  setDebts(out);setClients(c.data||[]);setError(out.error?.message||c.error?.message||"");setLoading(false);
 }
 useEffect(()=>{load().then(()=>{const id=new URLSearchParams(location.search).get("c");if(id)setOpen(id)})},[t]);// eslint-disable-line react-hooks/exhaustive-deps
 const rows=useMemo(()=>{const term=plain(q.trim()),digits=q.replace(/\D/g,"");return clients.map(c=>({client:c,debt:debts.byClient.get(c.id)})).filter(x=>x.debt&&(!term||plain(x.client.name).includes(term)||(digits.length>=3&&phoneDigits(x.client.phone||x.client.whatsapp).includes(digits)))).sort((a,b)=>sort==="value"?b.debt.total-a.debt.total:new Date(a.debt.oldest)-new Date(b.debt.oldest))},[clients,debts,q,sort]);
 const total=debts.items.reduce((s,x)=>s+Number(x.amount_cents||0),0),oldest=debts.items[0]?.created_at;
 const current=open?{client:clients.find(c=>c.id===open)||{id:open,name:"Cliente"},debt:debts.byClient.get(open)}:null;
 return <>
  <div className="report-cards"><div className="metric-card debt-total-card"><small>Total em aberto</small><strong>{money(total)}</strong></div><div className="metric-card"><small>Clientes devendo</small><strong>{debts.byClient.size}</strong></div><div className="metric-card"><small>Pendências</small><strong>{debts.items.length}</strong></div><div className="metric-card"><small>Mais antiga</small><strong>{oldest?ago(oldest):"—"}</strong></div></div>
  <section className="box">
   <div className="module-toolbar"><div><h2>Clientes com conta em aberto</h2><p>Vendas e atendimentos registrados em “Conta do cliente”.</p></div><div className="sales-toolbar-actions"><div className="fin-presets" role="group" aria-label="Ordenar">{[["value","Maior valor"],["oldest","Mais antigas"]].map(([k,l])=><button type="button" key={k} className={sort===k?"active":""} onClick={()=>setSort(k)}>{l}</button>)}</div><label className="search-field"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar nome ou celular"/></label></div></div>
   {error&&<div className="form-alert error">{error}</div>}
   {loading?<p className="empty">Carregando...</p>:rows.length===0?<div className="empty-state"><HandCoins/><strong>{debts.byClient.size?"Nenhum cliente encontrado":"Nenhum cliente devendo"}</strong><p>{debts.byClient.size?"Tente outro nome ou número.":"Quando uma venda for para a conta do cliente, ela aparece aqui."}</p></div>:<div className="data-list debtor-list">{rows.map(({client,debt})=>{const days=daysSince(debt.oldest),link=chargeLink(workspace.tenant.name,client,debt);return <article key={client.id}>
    <span className="client-avatar">{String(client.name||"?")[0].toUpperCase()}</span>
    <div><strong>{client.name}</strong><small>{formatPhone(client.phone||client.whatsapp)||"Sem celular"} · {debt.count===1?"1 pendência":`${debt.count} pendências`} · desde {new Date(debt.oldest).toLocaleDateString("pt-BR")}</small></div>
    <span className={"debt-age"+(days>30?" late":days>7?" warn":"")}>{ago(debt.oldest)}</span>
    <strong className="debtor-value">{money(debt.total)}</strong>
    <div className="debtor-row-actions">{link&&<a className="secondary-action" href={link} target="_blank" rel="noreferrer" title="Cobrar no WhatsApp"><MessageCircle size={15}/><span>Cobrar</span></a>}<button type="button" className="primary" onClick={()=>setOpen(client.id)}><Wallet size={15}/><span>Receber</span></button></div>
   </article>})}</div>}
  </section>
  {current&&<Account workspace={workspace} client={current.client} debt={current.debt} close={()=>setOpen(null)} changed={load}/>}
 </>;
}
export default function DebtorsPage(){return <ModuleShell title="Devedores" eyebrow="Contas em aberto">{workspace=><Debtors workspace={workspace}/>}</ModuleShell>}
