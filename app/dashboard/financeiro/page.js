"use client";
import {notify} from "../../../lib/notify";
import {useCallback,useEffect,useMemo,useState,useRef} from 'react';
import {Banknote,ClipboardList,Download,LayoutGrid,Package,Plus,Briefcase,Search,Wallet,X} from 'lucide-react';
import {supabase} from '../../../lib/supabase';
import ModuleShell from '../_components/ModuleShell';
const money=n=>(Number(n||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today=()=>iso(new Date());
const when=v=>v?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
const day=v=>v?new Date(v).toLocaleDateString('pt-BR'):'—';
const qty=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
const methods={cash:'Dinheiro',pix:'Pix',credit:'Cartão de crédito',debit:'Cartão de débito',transfer:'Transferência',account:'Conta do cliente',order:'Comanda'};
const statusName={open:'Em aberto',paid:'Liquidado',cancelled:'Cancelado'};
const presets=[['today','Hoje'],['7d','7 dias'],['month','Este mês'],['lastmonth','Mês passado'],['custom','Personalizado']];
const tabs=[['overview','Visão geral',LayoutGrid],['cash','Caixa',Wallet],['services','Serviços',Briefcase],['products','Produtos',Package],['accounts','Contas',ClipboardList]];
function range(preset){
 const now=new Date(),y=now.getFullYear(),m=now.getMonth();
 if(preset==='today')return [today(),today()];
 if(preset==='7d'){const s=new Date(now);s.setDate(s.getDate()-6);return [iso(s),today()]}
 if(preset==='lastmonth')return [iso(new Date(y,m-1,1)),iso(new Date(y,m,0))];
 return [iso(new Date(y,m,1)),today()];
}
function downloadCsv(name,rows){const csv='﻿'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/^[=+@-]/,"'").replace(/"/g,'""')+'"').join(';')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}
const cents=v=>(Number(v||0)/100).toFixed(2).replace('.',',');

function Kpis({items}){return <div className="fin-kpis">{items.map(([label,value,note,tone])=><div className={'fin-kpi'+(tone?' '+tone:'')} key={label}><small>{label}</small><strong>{value}</strong>{note&&<span>{note}</span>}</div>)}</div>}
function Bars({rows,total}){return <div className="fin-bars">{rows.map(([label,value,extra])=><div className="fin-bar" key={label}><div className="fin-bar-head"><span>{label}</span><b>{money(value)}</b></div><div className="fin-bar-track"><i style={{width:(total>0?Math.max(2,Math.round(value/total*100)):0)+'%'}}/></div>{extra&&<small>{extra}</small>}</div>)}{!rows.length&&<p className="empty">Sem movimento no período.</p>}</div>}

function ReceiptTable({rows,value,limit}){
 const list=limit?rows.slice(0,limit):rows;
 if(!list.length)return <p className="empty">Nenhum recebimento neste período.</p>;
 return <div className="fin-table-wrap"><table className="fin-table rt-cards"><thead><tr><th>Data</th><th>Descrição</th><th>Cliente</th><th>Profissional</th><th>Forma</th><th>Valor</th></tr></thead><tbody>{list.map(r=><tr key={r.source+r.id}><td data-label="Data">{when(r.at)}</td><td data-label="Descrição" className="rt-wide">{r.description}{Number(r.product_cents)>0&&Number(r.service_cents)>0&&<small> · inclui produtos</small>}</td><td data-label="Cliente">{r.client||'—'}</td><td data-label="Profissional">{r.professional||'—'}</td><td data-label="Forma">{methods[r.method]||r.method}</td><td data-label="Valor" className="rt-strong">{money(value(r))}</td></tr>)}</tbody></table></div>;
}

function CashTab({sessions}){
 const closed=sessions.filter(s=>s.status==='closed');
 const diff=s=>Number(s.counted_cash_cents||0)-Number(s.expected_cash_cents||0);
 const totalDiff=closed.reduce((a,s)=>a+diff(s),0),counted=closed.reduce((a,s)=>a+Number(s.counted_cash_cents||0),0);
 const withdrawals=sessions.reduce((a,s)=>a+Number(s.summary?.withdrawals_cents||0),0),deposits=sessions.reduce((a,s)=>a+Number(s.summary?.deposits_cents||0),0);
 function exportCash(){downloadCsv('fechamentos-caixa.csv',[['Abertura','Fechamento','Unidade','Aberto por','Fechado por','Troco inicial','Dinheiro','Pix','Crédito','Débito','Sangrias','Suprimentos','Esperado','Contado','Diferença','Observações'],...sessions.map(s=>{const m=s.summary?.methods||{};return [when(s.opened_at),when(s.closed_at),s.unit_name,s.opened_by,s.closed_by,cents(s.opening_cents),cents(m.cash?.total),cents(m.pix?.total),cents(m.credit?.total),cents(m.debit?.total),cents(s.summary?.withdrawals_cents),cents(s.summary?.deposits_cents),cents(s.status==='closed'?s.expected_cash_cents:s.summary?.expected_cash_cents),s.status==='closed'?cents(s.counted_cash_cents):'',s.status==='closed'?cents(diff(s)):'',s.notes||'']})])}
 return <>
  <Kpis items={[['Fechamentos no período',closed.length,sessions.length>closed.length?`${sessions.length-closed.length} caixa aberto agora`:null],['Dinheiro contado',money(counted)],['Diferença total',money(totalDiff),totalDiff===0?'Tudo conferido':totalDiff>0?'Sobra de caixa':'Falta de caixa',totalDiff===0?'ok':totalDiff>0?'up':'down'],['Sangrias',money(withdrawals)],['Suprimentos',money(deposits)]]}/>
  <section className="box"><div className="fin-section-head"><div><h2>Fechamentos de caixa</h2><p>Cada abertura e fechamento com o que entrou por forma de pagamento e a conferência da gaveta.</p></div><button className="secondary-action" onClick={exportCash} disabled={!sessions.length}><Download size={15}/>Exportar</button></div>
   {!sessions.length?<p className="empty">Nenhum caixa aberto ou fechado neste período.</p>:<div className="fin-sessions">{sessions.map(s=>{const m=s.summary?.methods||{},isOpen=s.status==='open',d=diff(s),expected=isOpen?s.summary?.expected_cash_cents:s.expected_cash_cents;return <article className="fin-session" key={s.id}>
    <header><div><b>{day(s.opened_at)}</b><span>{when(s.opened_at)} → {isOpen?'em aberto':when(s.closed_at)}{s.unit_name?' · '+s.unit_name:''}</span></div><span className={'fin-pill '+(isOpen?'open':d===0?'ok':d>0?'up':'down')}>{isOpen?'Caixa aberto':d===0?'Conferido':d>0?'Sobra '+money(d):'Falta '+money(-d)}</span></header>
    <div className="fin-session-grid">
     <div><small>Troco inicial</small><b>{money(s.opening_cents)}</b></div>
     <div><small>Dinheiro</small><b>{money(m.cash?.total)}</b></div>
     <div><small>Pix</small><b>{money(m.pix?.total)}</b></div>
     <div><small>Cartões</small><b>{money(Number(m.credit?.total||0)+Number(m.debit?.total||0))}</b></div>
     <div><small>Sangrias</small><b>{money(s.summary?.withdrawals_cents)}</b></div>
     <div><small>Suprimentos</small><b>{money(s.summary?.deposits_cents)}</b></div>
     <div className="hl"><small>Esperado na gaveta</small><b>{money(expected)}</b></div>
     <div className="hl"><small>Contado</small><b>{isOpen?'—':money(s.counted_cash_cents)}</b></div>
    </div>
    <footer><span>Aberto por {s.opened_by||'—'}{!isOpen&&<> · Fechado por {s.closed_by||'—'}</>}</span>{s.notes&&<span>Obs.: {s.notes}</span>}</footer>
    {s.movements?.length>0&&<details><summary>{s.movements.length} {s.movements.length===1?'movimentação':'movimentações'} de gaveta</summary><ul>{s.movements.map((mv,i)=><li key={i}><span>{when(mv.created_at)} · {mv.kind==='withdrawal'?'Sangria':'Suprimento'}{mv.reason?' · '+mv.reason:''}</span><b>{mv.kind==='withdrawal'?'-':'+'}{money(mv.amount_cents)}</b></li>)}</ul></details>}
   </article>})}</div>}
  </section>
 </>;
}

function ServicesTab({report}){
 const [q,setQ]=useState('');
 const rows=(report.receipts||[]).filter(r=>Number(r.service_cents)>0);
 const total=rows.reduce((a,r)=>a+Number(r.service_cents),0),avg=rows.length?Math.round(total/rows.length):0;
 const top=report.top_services||[],topTotal=top.reduce((a,x)=>a+Number(x.total),0);
 const byPro=Object.entries(rows.reduce((acc,r)=>{const k=r.professional||'Sem profissional';acc[k]=(acc[k]||0)+Number(r.service_cents);return acc},{})).sort((a,b)=>b[1]-a[1]);
 const term=q.trim().toLowerCase(),shown=term?rows.filter(r=>[r.client,r.professional,r.description].some(v=>String(v||'').toLowerCase().includes(term))):rows;
 return <>
  <Kpis items={[['Faturamento em serviços',money(total)],['Atendimentos e vendas',rows.length],['Ticket médio',money(avg)]]}/>
  <div className="fin-two">
   <section className="box"><div className="fin-section-head"><div><h2>Mais vendidos</h2><p>Serviços com maior faturamento no período.</p></div></div><Bars rows={top.map(x=>[x.name,Number(x.total),`${x.qty} ${Number(x.qty)===1?'venda':'vendas'}`])} total={topTotal}/></section>
   <section className="box"><div className="fin-section-head"><div><h2>Por profissional</h2><p>Quanto cada profissional gerou em serviços.</p></div></div><Bars rows={byPro.map(([k,v])=>[k,v])} total={total}/></section>
  </div>
  <section className="box"><div className="fin-section-head"><div><h2>Recebimentos de serviços</h2><p>Atendimentos, comandas e vendas avulsas recebidas no período.</p></div><div className="fin-head-actions"><label className="search-field"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar cliente, serviço ou profissional"/></label><button className="secondary-action" disabled={!rows.length} onClick={()=>downloadCsv('servicos.csv',[['Data','Cliente','Profissional','Descrição','Forma','Valor'],...rows.map(r=>[when(r.at),r.client,r.professional,r.description,methods[r.method]||r.method,cents(r.service_cents)])])}><Download size={15}/>Exportar</button></div></div>
   <ReceiptTable rows={shown} value={r=>r.service_cents}/>
  </section>
 </>;
}

function ProductsTab({report}){
 const s=report.summary||{},sold=Number(s.products_sold_cents||0),cost=Number(s.products_cost_cents||0),profit=sold-cost;
 const products=report.products||[],lines=report.product_lines||[];
 return <>
  <Kpis items={[['Vendido em produtos',money(sold)],['Custo dos produtos',money(cost)],['Lucro bruto',money(profit),sold>0?`Margem de ${Math.round(profit/sold*100)}%`:null,profit>0?'up':profit<0?'down':''],['Itens vendidos',qty(s.products_qty)]]}/>
  <section className="box"><div className="fin-section-head"><div><h2>Ranking de produtos</h2><p>Quantidade, faturamento, custo e lucro de cada produto no período.</p></div><button className="secondary-action" disabled={!products.length} onClick={()=>downloadCsv('produtos.csv',[['Produto','Quantidade','Faturamento','Custo','Lucro'],...products.map(p=>[p.name,qty(p.qty),cents(p.revenue_cents),cents(p.cost_cents),cents(p.revenue_cents-p.cost_cents)])])}><Download size={15}/>Exportar</button></div>
   {!products.length?<p className="empty">Nenhum produto vendido neste período.</p>:<div className="fin-table-wrap"><table className="fin-table rt-cards"><thead><tr><th>Produto</th><th>Qtd.</th><th>Faturamento</th><th>Custo</th><th>Lucro</th></tr></thead><tbody>{products.map(p=><tr key={p.name}><td data-label="Produto" className="rt-wide">{p.name}</td><td data-label="Qtd.">{qty(p.qty)}</td><td data-label="Faturamento">{money(p.revenue_cents)}</td><td data-label="Custo">{money(p.cost_cents)}</td><td data-label="Lucro" className={'rt-strong '+(p.revenue_cents-p.cost_cents>=0?'pos':'neg')}>{money(p.revenue_cents-p.cost_cents)}</td></tr>)}</tbody></table></div>}
  </section>
  <section className="box"><div className="fin-section-head"><div><h2>Vendas de produtos</h2><p>Cada item vendido no Caixa rápido, em vendas de estoque e em comandas.</p></div></div>
   {!lines.length?<p className="empty">Nenhuma venda de produto neste período.</p>:<div className="fin-table-wrap"><table className="fin-table rt-cards"><thead><tr><th>Data</th><th>Produto</th><th>Qtd.</th><th>Preço</th><th>Total</th><th>Cliente</th><th>Forma</th></tr></thead><tbody>{lines.map(l=><tr key={l.id}><td data-label="Data">{when(l.at)}</td><td data-label="Produto" className="rt-wide">{l.product}</td><td data-label="Qtd.">{qty(l.qty)}</td><td data-label="Preço">{money(l.unit_price_cents)}</td><td data-label="Total" className="rt-strong">{money(Number(l.qty)*Number(l.unit_price_cents))}</td><td data-label="Cliente">{l.client||'—'}</td><td data-label="Forma">{methods[l.method]||l.method}</td></tr>)}</tbody></table></div>}
  </section>
 </>;
}

function Finance({workspace}){
 const t=workspace.tenant.id,m=workspace.membership,allowed=m.role==='owner'||(['manager','reception'].includes(m.role)&&m.permissions?.includes('finance'));
 const [preset,setPreset]=useState('month'),[from,setFrom]=useState(()=>range('month')[0]),[to,setTo]=useState(()=>range('month')[1]);
 const [tab,setTab]=useState('overview'),[units,setUnits]=useState([]),[unit,setUnit]=useState(''),[report,setReport]=useState(null),[items,setItems]=useState([]),[status,setStatus]=useState('all'),[kind,setKind]=useState('all');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[modal,setModal]=useState(null);
 const sequence=useRef(0);
 function choosePreset(p){setPreset(p);if(p!=='custom'){const [a,b]=range(p);setFrom(a);setTo(b)}}
 const load=useCallback(async()=>{const version=++sequence.current;if(!allowed){setLoading(false);return}setLoading(true);setError('');
  try{
   if(!from||!to||from>to)throw new Error('Confira as datas do período.');
   const end=new Date(to+'T00:00:00');end.setDate(end.getDate()+1);
   let query=supabase.from('financial_entries').select('*').eq('tenant_id',t).gte('due_date',from).lte('due_date',to).order('due_date').limit(200);if(unit)query=query.eq('unit_id',unit);
   const results=await Promise.all([supabase.from('units').select('id,name,active').eq('tenant_id',t),query,supabase.rpc('finance_report',{t,u:unit||null,st:new Date(from+'T00:00:00').toISOString(),en:end.toISOString()})]);
   if(version!==sequence.current)return;
   const fail=results.find(r=>r.error)?.error;if(fail)throw fail;
   setUnits(results[0].data||[]);setItems(results[1].data||[]);setReport(results[2].data);
  }catch(e){if(version===sequence.current){setError(e.message);setReport(null)}}finally{if(version===sequence.current)setLoading(false)}
 },[t,unit,from,to,allowed]);
 useEffect(()=>{load()},[load]);
 function open(type,item=null){setError('');setMessage('');setModal({type,item,key:crypto.randomUUID()})}
 async function submit(e){e.preventDefault();setBusy(true);setError('');const f=new FormData(e.currentTarget);try{let r;if(modal.type==='new')r=await supabase.rpc('finance_create',{t,r:modal.key,p:{unit_id:f.get('unit_id'),kind:f.get('kind'),description:f.get('description'),category:f.get('category'),counterparty:f.get('counterparty'),amount_cents:Math.round(Number(f.get('amount'))*100),due_date:f.get('due_date')}});else if(modal.type==='settle')r=await supabase.rpc('finance_settle',{t,i:modal.item.id,m:f.get('method')});else r=await supabase.rpc('finance_cancel',{t,i:modal.item.id,reason:f.get('reason')});if(r.error)throw r.error;setModal(null);setMessage('Operação registrada no histórico financeiro.');notify(modal.type==='new'?'Lançamento financeiro criado com sucesso.':modal.type==='settle'?'Pagamento atualizado com sucesso.':'Lançamento cancelado e histórico atualizado.');await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const accounts=useMemo(()=>items.filter(x=>(status==='all'||x.status===status)&&(kind==='all'||x.kind===kind)),[items,status,kind]);
 function exportAccounts(){downloadCsv('contas.csv',[['Vencimento','Tipo','Descrição','Categoria','Unidade','Valor','Status','Pagamento'],...accounts.map(x=>[x.due_date,x.kind==='income'?'Receita':'Despesa',x.description,x.category||'',units.find(u=>u.id===x.unit_id)?.name||'',cents(x.amount_cents),statusName[x.status],methods[x.method]||''])])}
 if(!allowed)return <section className="box"><h2>Acesso restrito</h2><p>O proprietário precisa conceder a permissão de financeiro.</p></section>;
 const s=report?.summary||{},byMethod=report?.by_method||{},methodTotal=Object.values(byMethod).reduce((a,x)=>a+Number(x.total||0),0);
 const periodLabel=from===to?day(from+'T12:00:00'):`${day(from+'T12:00:00')} a ${day(to+'T12:00:00')}`;
 return <>
  <section className="box fin-toolbar">
   <div className="fin-presets" role="group" aria-label="Período">{presets.map(([k,v])=><button key={k} type="button" className={preset===k?'active':''} onClick={()=>choosePreset(k)}>{v}</button>)}</div>
   <div className="fin-toolbar-right">
    {preset==='custom'&&<div className="fin-dates"><label>De<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Até<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>}
    {units.length>1&&<select className="fin-unit" value={unit} onChange={e=>setUnit(e.target.value)} aria-label="Unidade"><option value="">Todas as unidades</option>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select>}
    <button className="primary" disabled={!units.some(u=>u.active)} onClick={()=>open('new')}><Plus size={17}/>Novo lançamento</button>
   </div>
  </section>
  <nav className="fin-tabs" aria-label="Seções do financeiro">{tabs.map(([k,v,Icon])=><button key={k} type="button" className={tab===k?'active':''} onClick={()=>setTab(k)} aria-current={tab===k?'page':undefined}><Icon size={16}/>{v}</button>)}<span className="fin-period">{periodLabel}</span></nav>
  {error&&!modal&&<p role="alert" className="form-alert error">{error}</p>}{message&&<p role="status" className="form-alert success">{message}</p>}
  {loading&&!report?<section className="box"><p className="empty">Carregando financeiro...</p></section>:report&&<div className={'fin-body'+(loading?' is-loading':'')}>
   {tab==='overview'&&<>
    <Kpis items={[['Recebido no período',money(s.received),`${s.receipts_count||0} recebimentos`],['Serviços',money(s.services)],['Produtos',money(s.products)],['Outras receitas',money(s.other_income)],['Despesas pagas',money(s.expenses_paid),null,'down'],['Saldo do período',money(s.net),null,Number(s.net)>=0?'up':'down'],['A receber',money(s.receivable),'Inclui contas de clientes'],['A pagar',money(s.payable)]]}/>
    <div className="fin-two">
     <section className="box"><div className="fin-section-head"><div><h2>Por forma de pagamento</h2><p>Como o dinheiro entrou no período.</p></div></div><Bars rows={Object.entries(byMethod).sort((a,b)=>b[1].total-a[1].total).map(([k,v])=>[methods[k]||k,Number(v.total),`${v.count} ${Number(v.count)===1?'recebimento':'recebimentos'} · ${methodTotal?Math.round(v.total/methodTotal*100):0}%`])} total={methodTotal}/></section>
     <section className="box"><div className="fin-section-head"><div><h2>Serviços × produtos</h2><p>Composição do que foi recebido.</p></div></div><Bars rows={[['Serviços e avulsos',Number(s.services)],['Produtos',Number(s.products)],['Outras receitas',Number(s.other_income)]].filter(x=>x[1]>0)} total={Number(s.received)+Number(s.other_income)}/>
      <div className="fin-mini"><span><Banknote size={15}/> Caixas fechados no período: <b>{(report.cash_sessions||[]).filter(x=>x.status==='closed').length}</b></span><button type="button" className="link" onClick={()=>setTab('cash')}>Ver fechamentos</button></div></section>
    </div>
    <section className="box"><div className="fin-section-head"><div><h2>Últimos recebimentos</h2><p>Os 15 mais recentes do período. Veja tudo nas abas Serviços e Produtos.</p></div></div><ReceiptTable rows={report.receipts||[]} value={r=>r.amount_cents} limit={15}/></section>
   </>}
   {tab==='cash'&&<CashTab sessions={report.cash_sessions||[]}/>}
   {tab==='services'&&<ServicesTab report={report}/>}
   {tab==='products'&&<ProductsTab report={report}/>}
   {tab==='accounts'&&<section className="box"><div className="fin-section-head"><div><h2>Contas e lançamentos manuais</h2><p>Despesas e receitas lançadas à mão, pelo vencimento. Vendas entram sozinhas nas outras abas.</p></div><button className="secondary-action" onClick={exportAccounts} disabled={!accounts.length}><Download size={15}/>Exportar</button></div>
    <div className="fin-chips"><div role="group" aria-label="Tipo">{[['all','Todas'],['expense','Despesas'],['income','Receitas']].map(([k,v])=><button key={k} type="button" className={kind===k?'active':''} onClick={()=>setKind(k)}>{v}</button>)}</div><div role="group" aria-label="Status">{[['all','Todos os status'],...Object.entries(statusName)].map(([k,v])=><button key={k} type="button" className={status===k?'active':''} onClick={()=>setStatus(k)}>{v}</button>)}</div></div>
    <div className="inventory-grid">{accounts.map(x=><article className="inventory-card" key={x.id}><div className="inventory-card-title"><h3>{x.description}</h3><span className="pill">{statusName[x.status]}</span></div><p>{x.kind==='income'?'Receita':'Despesa'} · {x.category||'Sem categoria'} · {units.find(u=>u.id===x.unit_id)?.name}</p><strong>{money(x.amount_cents)}</strong><p>Vence em {new Date(x.due_date+'T12:00:00').toLocaleDateString('pt-BR')}{x.counterparty?' · '+x.counterparty:''}</p>{x.paid_at&&<p>Baixa: {new Date(x.paid_at).toLocaleString('pt-BR')} · {methods[x.method]}</p>}{x.cancellation_reason&&<p>Motivo: {x.cancellation_reason}</p>}<div className="inventory-actions">{x.status==='open'&&<button className="primary" onClick={()=>open('settle',x)}>{x.kind==='income'?'Registrar recebimento':'Registrar pagamento'}</button>}{x.status!=='cancelled'&&<button onClick={()=>open('cancel',x)}>Cancelar lançamento</button>}</div></article>)}</div>{!accounts.length&&<p className="empty">Nenhum lançamento com esses filtros neste período.</p>}
   </section>}
  </div>}
  {modal&&<div className="checkout-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="finance-title" className="checkout-modal inventory-modal"><button className="checkout-close" aria-label="Fechar" disabled={busy} onClick={()=>setModal(null)}><X/></button><h2 id="finance-title">{modal.type==='new'?'Novo lançamento':modal.type==='settle'?'Confirmar baixa':'Cancelar lançamento'}</h2>{modal.item&&<p>{modal.item.description} · {money(modal.item.amount_cents)}</p>}{error&&<p role="alert" className="form-alert error">{error}</p>}<form onSubmit={submit}><fieldset className="inventory-fieldset" disabled={busy}><div className="form-grid">{modal.type==='new'?<><label>Tipo<select name="kind"><option value="expense">Despesa / conta a pagar</option><option value="income">Receita / conta a receber</option></select></label><label>Unidade<select name="unit_id" defaultValue={unit||units.find(u=>u.active)?.id} required>{units.filter(u=>u.active).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>Descrição<input name="description" minLength={2} maxLength={200} required/></label><label>Categoria<input name="category" maxLength={100} placeholder="Ex.: aluguel, energia"/></label><label>Fornecedor / pagador<input name="counterparty" maxLength={150}/></label><label>Valor (R$)<input name="amount" type="number" min="0.01" max="21474836" step="0.01" required/></label><label>Vencimento<input name="due_date" type="date" defaultValue={today()} required/></label><p>O lançamento inicia em aberto. Registre a baixa após conferir o pagamento. Não repita aqui uma venda já cadastrada.</p></>:modal.type==='settle'?<><label>Forma de pagamento<select name="method">{Object.entries(methods).filter(([k])=>!['account','order'].includes(k)).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label className="inventory-check"><input type="checkbox" required/>Conferi o pagamento/recebimento. Esta ação apenas registra a baixa e não transfere dinheiro.</label></>:<><label>Motivo<input name="reason" minLength={3} maxLength={500} required/></label><p>O registro será preservado e deixará de compor os totais. Esta ação não faz estorno bancário.</p></>}</div><button className="primary form-submit" disabled={busy}>{busy?'Salvando...':'Confirmar'}</button></fieldset></form></section></div>}
 </>;
}
export default function FinancePage(){return <ModuleShell title="Financeiro" eyebrow="Controle financeiro">{workspace=><Finance workspace={workspace}/>}</ModuleShell>}
