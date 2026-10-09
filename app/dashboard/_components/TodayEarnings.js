"use client";
import {useEffect,useState} from "react";
import {Banknote,CalendarCheck,CreditCard,QrCode,Receipt,Wallet} from "lucide-react";
import {supabase} from "../../../lib/supabase";

const METHODS=[["pix","PIX",QrCode],["cash","Dinheiro",Banknote],["credit","Crédito",CreditCard],["debit","Débito",CreditCard]];
const dayStart=()=>{const d=new Date();d.setHours(0,0,0,0);return d};

// Ganhos do dia: o que já foi recebido hoje (atendimentos + caixa rápido), por
// forma de pagamento, e o que ainda está previsto na agenda de hoje.
export default function TodayEarnings({tenantId,money,showAgenda}){
 const [state,setState]=useState({loading:true,received:0,count:0,byMethod:{},open:0,scheduled:0,scheduledValue:0});
 useEffect(()=>{
  let alive=true;
  const start=dayStart(),end=new Date(start.getTime()+86400000),from=start.toISOString();
  const isToday=x=>{const d=new Date(x.paid_at||x.created_at);return d>=start&&d<end};
  // Pagos hoje ou criados hoje; o filtro fino (paid_at ou created_at em hoje) fica no navegador.
  const sales=table=>supabase.from(table).select("amount_cents,method,status,paid_at,created_at").eq("tenant_id",tenantId).in("status",["paid","open"]).or(`paid_at.gte.${from},created_at.gte.${from}`).limit(1000);
  Promise.all([
   sales("appointment_payments"),
   sales("quick_sales"),
   showAgenda?supabase.from("appointments").select("price_cents,status").eq("tenant_id",tenantId).gte("starts_at",from).lt("starts_at",end.toISOString()).not("status","in","(cancelled,no_show)"):Promise.resolve({data:[]})
  ]).then(([a,q,ap])=>{
   if(!alive)return;
   const rows=[...(a.data||[]),...(q.data||[])].filter(isToday),paid=rows.filter(x=>x.status==="paid"),byMethod={};
   for(const x of paid)byMethod[x.method]=(byMethod[x.method]||0)+Number(x.amount_cents||0);
   const agenda=ap.data||[];
   setState({loading:false,received:paid.reduce((s,x)=>s+Number(x.amount_cents||0),0),count:paid.length,byMethod,open:rows.filter(x=>x.status==="open").reduce((s,x)=>s+Number(x.amount_cents||0),0),scheduled:agenda.length,scheduledValue:agenda.reduce((s,x)=>s+Number(x.price_cents||0),0)});
  }).catch(()=>{if(alive)setState(s=>({...s,loading:false}))});
  return()=>{alive=false};
 },[tenantId,showAgenda]);

 const {loading,received,count,byMethod,open,scheduled,scheduledValue}=state;
 return <section className="today-earnings">
  <div className="te-main">
   <span className="te-label"><Wallet size={16}/>GANHOS DE HOJE</span>
   <strong>{loading?"...":money(received)}</strong>
   <small>{count===1?"1 pagamento recebido":`${count} pagamentos recebidos`}{count>0&&` · ticket médio ${money(Math.round(received/count))}`}</small>
  </div>
  <div className="te-methods">
   {METHODS.map(([key,label,Icon])=><div key={key}><Icon size={15}/><span>{label}</span><b>{money(byMethod[key]||0)}</b></div>)}
  </div>
  <div className="te-side">
   {showAgenda&&<div><CalendarCheck size={15}/><span>Agenda de hoje</span><b>{scheduled} {scheduled===1?"horário":"horários"} · {money(scheduledValue)}</b></div>}
   <div><Receipt size={15}/><span>Em aberto (conta do cliente)</span><b>{money(open)}</b></div>
  </div>
 </section>;
}
