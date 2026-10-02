"use client";
import {notify} from "../../../lib/notify";
import {useCallback,useEffect,useState} from "react";
import {ArrowDownCircle,ArrowUpCircle,Banknote,Lock,LockOpen,RefreshCw,Wallet,X} from "lucide-react";
import {supabase} from "../../../lib/supabase";
import ModuleShell from "../_components/ModuleShell";
const money=n=>(Number(n||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
// "1.234,56" (comma decimal) or "50.50" (dot decimal) both become cents.
const toCents=v=>{const s=String(v||"0").trim();return Math.round(Number(s.includes(",")?s.replace(/\./g,"").replace(",","."):s)*100)};
const labels={cash:"Dinheiro",pix:"Pix",credit:"Crédito",debit:"Débito"};
const when=v=>v?new Date(v).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):"—";
function CashRegister({workspace}){
 const t=workspace.tenant.id,m=workspace.membership,allowed=m.role==="owner"||m.permissions?.includes("finance")||(["manager","reception","attendant"].includes(m.role)&&m.permissions?.some(p=>["booking","agenda"].includes(p)));
 const [units,setUnits]=useState([]),[unit,setUnit]=useState(""),[session,setSession]=useState(null),[summary,setSummary]=useState(null),[moves,setMoves]=useState([]),[history,setHistory]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[modal,setModal]=useState(null);
 const load=useCallback(async(silent)=>{if(!allowed){setLoading(false);return}if(!silent)setLoading(true);setError("");
  try{
   const u=await supabase.from("units").select("id,name").eq("tenant_id",t).eq("active",true).order("name");if(u.error)throw u.error;
   const list=u.data||[];setUnits(list);const current=unit||list[0]?.id||"";if(!unit&&current)setUnit(current);
   if(!current){setSession(null);setSummary(null);return}
   const [open,hist]=await Promise.all([
    supabase.from("cash_sessions").select("*").eq("tenant_id",t).eq("unit_id",current).eq("status","open").maybeSingle(),
    supabase.from("cash_sessions").select("id,opened_at,closed_at,opening_cents,counted_cash_cents,expected_cash_cents,notes").eq("tenant_id",t).eq("unit_id",current).eq("status","closed").order("opened_at",{ascending:false}).limit(15)
   ]);
   if(open.error)throw open.error;if(hist.error)throw hist.error;
   setSession(open.data||null);setHistory(hist.data||[]);
   if(open.data){const [s,mv]=await Promise.all([supabase.rpc("cash_summary",{t,s:open.data.id}),supabase.from("cash_movements").select("id,kind,amount_cents,reason,created_at").eq("session_id",open.data.id).order("created_at",{ascending:false})]);if(s.error)throw s.error;setSummary(s.data);setMoves(mv.data||[])}else{setSummary(null);setMoves([])}
  }catch(e){setError(e.message)}finally{setLoading(false)}
 },[t,unit,allowed]);
 useEffect(()=>{load()},[load]);
 useEffect(()=>{if(!session)return;const id=setInterval(()=>load(true),30000);return()=>clearInterval(id)},[session,load]);
 async function submit(e){e.preventDefault();if(busy)return;const f=new FormData(e.currentTarget);setBusy(true);setError("");
  try{let r;
   if(modal==="open")r=await supabase.rpc("cash_open",{t,u:unit,opening:toCents(f.get("amount"))});
   else if(modal==="withdrawal"||modal==="deposit")r=await supabase.rpc("cash_move",{t,s:session.id,k:modal,amount:toCents(f.get("amount")),reason:f.get("reason")});
   else r=await supabase.rpc("cash_close",{t,s:session.id,counted:toCents(f.get("amount")),p_notes:f.get("notes")||""});
   if(r.error)throw r.error;
   notify(modal==="open"?"Caixa aberto.":modal==="close"?"Caixa fechado e conferido.":modal==="withdrawal"?"Sangria registrada.":"Suprimento registrado.");
   setModal(null);await load(true);
  }catch(err){setError(err.message)}finally{setBusy(false)}}
 if(!allowed)return <section className="box"><h2>Acesso restrito</h2><p>O caixa fica disponível para o proprietário, financeiro e recepção com permissão de agenda.</p></section>;
 const methods=summary?.methods||{},received=Object.values(methods).reduce((s,x)=>s+Number(x.total||0),0);
 return <>
  <section className="box inventory-header"><div><h2>Caixa do dia</h2><p>Abra com o troco, registre sangrias e suprimentos e feche conferindo o dinheiro da gaveta.</p></div>
   <div className="inventory-header-actions">{units.length>1&&<select value={unit} onChange={e=>{setUnit(e.target.value);setSession(null)}} aria-label="Unidade">{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select>}
    {session?<><button className="secondary-action" onClick={()=>{setError("");setModal("withdrawal")}}><ArrowUpCircle size={17}/>Sangria</button><button className="secondary-action" onClick={()=>{setError("");setModal("deposit")}}><ArrowDownCircle size={17}/>Suprimento</button><button className="primary" onClick={()=>{setError("");setModal("close")}}><Lock size={17}/>Fechar caixa</button></>
    :<button className="primary" disabled={!unit||loading} onClick={()=>{setError("");setModal("open")}}><LockOpen size={17}/>Abrir caixa</button>}</div></section>
  {error&&!modal&&<p role="alert" className="form-alert error">{error}</p>}
  {loading?<section className="box"><p className="empty">Carregando caixa...</p></section>:!session?<section className="box cash-closed"><div className="empty-state"><Wallet/><strong>Caixa fechado</strong><p>Abra o caixa no início do expediente informando o troco que está na gaveta.</p></div></section>:<>
   <div className="report-cards"><div className="metric-card cash-highlight"><small>Dinheiro esperado na gaveta</small><strong>{money(summary?.expected_cash_cents)}</strong></div><div className="metric-card"><small>Recebido desde a abertura</small><strong>{money(received)}</strong></div><div className="metric-card"><small>Troco inicial</small><strong>{money(summary?.opening_cents)}</strong></div><div className="metric-card"><small>Aberto em</small><strong className="cash-date">{when(summary?.opened_at)}</strong></div></div>
   <div className="report-grid">
    <section className="box"><div className="box-head"><div><h2>Recebimentos por forma</h2><p>Atendimentos, vendas e comandas pagos neste caixa.</p></div><button type="button" className="secondary-action" onClick={()=>load(true)}><RefreshCw size={15}/>Atualizar</button></div>
     <div className="ranking-list">{Object.keys(labels).map(k=><div key={k}><span>{labels[k]} <small>({methods[k]?.count||0})</small></span><strong>{money(methods[k]?.total)}</strong></div>)}</div></section>
    <section className="box"><div className="box-head"><div><h2>Conta do dinheiro</h2><p>Como chegamos ao valor esperado.</p></div></div>
     <div className="ranking-list cash-math"><div><span>Troco inicial</span><strong>{money(summary?.opening_cents)}</strong></div><div><span>+ Vendas em dinheiro</span><strong>{money(methods.cash?.total)}</strong></div><div><span>+ Receitas em dinheiro (financeiro)</span><strong>{money(summary?.cash_income_cents)}</strong></div><div><span>+ Suprimentos</span><strong>{money(summary?.deposits_cents)}</strong></div><div><span>− Despesas pagas em dinheiro</span><strong>{money(summary?.cash_expense_cents)}</strong></div><div><span>− Sangrias</span><strong>{money(summary?.withdrawals_cents)}</strong></div><div className="cash-total"><span>= Esperado na gaveta</span><strong>{money(summary?.expected_cash_cents)}</strong></div></div></section>
   </div>
   <section className="box"><h2>Sangrias e suprimentos</h2>{moves.length?<div className="data-list">{moves.map(x=><article key={x.id}><span className={"service-icon "+(x.kind==="withdrawal"?"cash-out":"cash-in")}>{x.kind==="withdrawal"?<ArrowUpCircle size={16}/>:<ArrowDownCircle size={16}/>}</span><div><strong>{x.kind==="withdrawal"?"Sangria":"Suprimento"} · {x.reason}</strong><small>{when(x.created_at)}</small></div><strong>{x.kind==="withdrawal"?"−":"+"} {money(x.amount_cents)}</strong></article>)}</div>:<p className="empty">Nenhuma movimentação neste caixa.</p>}</section>
  </>}
  <section className="box"><h2>Caixas anteriores</h2>{history.length?<div className="sales-report-table-wrap"><table className="sales-report-table"><thead><tr><th>Abertura</th><th>Fechamento</th><th>Esperado</th><th>Contado</th><th>Diferença</th><th>Observação</th></tr></thead><tbody>{history.map(h=>{const diff=Number(h.counted_cash_cents||0)-Number(h.expected_cash_cents||0);return <tr key={h.id}><td>{when(h.opened_at)}</td><td>{when(h.closed_at)}</td><td>{money(h.expected_cash_cents)}</td><td>{money(h.counted_cash_cents)}</td><td className={diff===0?"":diff>0?"cash-over":"cash-short"}>{diff===0?"Bateu":(diff>0?"Sobrou ":"Faltou ")+money(Math.abs(diff))}</td><td>{h.notes||"—"}</td></tr>})}</tbody></table></div>:<p className="empty">Nenhum caixa fechado ainda.</p>}</section>
  {modal&&<div className="checkout-backdrop"><form className="checkout-modal" onSubmit={submit}><button type="button" className="checkout-close" aria-label="Fechar" disabled={busy} onClick={()=>setModal(null)}><X/></button>
   <p className="eyebrow">CAIXA</p><h2>{({open:"Abrir caixa",withdrawal:"Registrar sangria",deposit:"Registrar suprimento",close:"Fechar caixa"})[modal]}</h2>
   {modal==="close"&&<div className="cash-expected"><Banknote size={18}/><span>Esperado na gaveta: <b>{money(summary?.expected_cash_cents)}</b></span></div>}
   <div className="quick-sale-form"><label className="wide">{modal==="open"?"Troco inicial na gaveta (R$)":modal==="close"?"Dinheiro contado na gaveta (R$)":"Valor (R$)"}<input name="amount" inputMode="decimal" required autoFocus placeholder="0,00" pattern="[0-9.,]+"/></label>
    {(modal==="withdrawal"||modal==="deposit")&&<label className="wide">Motivo<input name="reason" required minLength={3} maxLength={300} placeholder={modal==="withdrawal"?"Ex.: depósito no banco, pagamento de fornecedor":"Ex.: troco extra"}/></label>}
    {modal==="close"&&<label className="wide">Observação (opcional)<input name="notes" maxLength={500} placeholder="Ex.: faltou troco de R$ 5"/></label>}</div>
   {modal==="close"&&<p className="form-hint">Pix e cartão aparecem no resumo, mas a conferência é só do dinheiro físico. Depois de fechado, o caixa não pode ser reaberto.</p>}
   {error&&<div className="form-alert error">{error}</div>}
   <button className="primary checkout-confirm" disabled={busy}>{busy?"Salvando...":modal==="close"?"Confirmar fechamento":"Confirmar"}</button></form></div>}
 </>;
}
export default function CashPage(){return <ModuleShell title="Caixa" eyebrow="Abertura e fechamento">{workspace=><CashRegister workspace={workspace}/>}</ModuleShell>}
