"use client";
import {useEffect,useMemo,useState} from "react";
import {CalendarClock,CircleDollarSign,Clock,Package,Receipt,RefreshCw,TrendingUp,UserCheck,UserPlus,Users,XCircle} from "lucide-react";
import {supabase} from "../../../lib/supabase";
import {money} from "../../../lib/plans";

function RevenueChart({series,hide}){
 const data=series||[],max=Math.max(1,...data.map(x=>Number(x.revenue_cents||0)));
 const w=600,h=180,pad=22,bw=(w-pad*2)/Math.max(1,data.length);
 return <svg className="gx-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Faturamento dos últimos 30 dias">
  <defs><linearGradient id="gxBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a48bff"/><stop offset="1" stopColor="#5b39d6"/></linearGradient></defs>
  <line className="axis" x1={pad} x2={w-pad} y1={h-pad} y2={h-pad}/>
  {data.map((x,i)=>{const v=Number(x.revenue_cents||0),bh=Math.max(v>0?3:0,(v/max)*(h-pad*2));return <rect key={x.day} className="bar" x={pad+i*bw+bw*.15} y={h-pad-bh} width={bw*.7} height={bh} rx="3"><title>{new Date(x.day+"T12:00:00").toLocaleDateString("pt-BR")} · {hide?"••••":money(v)} · {x.appointments} agend.</title></rect>})}
  {data.filter((_,i)=>i%5===0||i===data.length-1).map(x=>{const i=data.indexOf(x);return <text key={"t"+x.day} x={pad+i*bw+bw/2} y={h-6} textAnchor="middle">{x.day.slice(8,10)}/{x.day.slice(5,7)}</text>})}
 </svg>;
}

function Bars({rows,hide,empty}){
 const max=Math.max(1,...(rows||[]).map(r=>Number(r.revenue_cents||0)));
 if(!rows?.length)return <div className="gx-empty">{empty}</div>;
 return <div className="gx-hbars">{rows.map(r=><div className="gx-hbar" key={r.barber_id||r.unit_id||r.name}><div><span>{r.name}</span><b>{hide?"••••":money(r.revenue_cents)}</b></div><i><em style={{width:Math.max(2,Number(r.revenue_cents||0)/max*100)+"%"}}/></i></div>)}</div>;
}

export default function FinanceOverview({workspace,hide}){
 const [data,setData]=useState(null),[unit,setUnit]=useState(""),[units,setUnits]=useState([]),[error,setError]=useState(""),[loading,setLoading]=useState(true),[tick,setTick]=useState(0);
 const t=workspace.tenant.id;
 useEffect(()=>{supabase.from("units").select("id,name").eq("tenant_id",t).eq("active",true).order("name").then(({data})=>setUnits(data||[]))},[t]);
 useEffect(()=>{let alive=true;setLoading(true);
  supabase.rpc("dashboard_overview",{t,p_unit:unit||null}).then(({data,error})=>{if(!alive)return;setData(data);setError(error?.message||"");setLoading(false)});
  return()=>{alive=false}},[t,unit,tick]);
 const v=x=>hide?"••••••":money(x);
 const occupancy=useMemo(()=>{const s=data?.slots_today;return s?.total?Math.round(s.busy/s.total*100):0},[data]);
 if(error)return <div className="gx-alert error">{error}</div>;
 if(!data)return <div className="gx-card"><p>{loading?"Carregando indicadores...":"Sem dados."}</p></div>;
 const rec=data.recovered_month||{};
 return <section className="gx-stack" style={{marginBottom:20}}>
  <div className="gx-between">
   <div><span className="gx-eyebrow">Resultado em tempo real</span><h2 style={{margin:"4px 0 0",fontSize:20}}>Como está o negócio</h2></div>
   <div className="gx-row">{units.length>1&&<select className="gx-input" style={{width:"auto"}} value={unit} onChange={e=>setUnit(e.target.value)} aria-label="Unidade"><option value="">Todas as unidades</option>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select>}<button type="button" className="gx-btn ghost small" onClick={()=>setTick(x=>x+1)} disabled={loading}><RefreshCw size={13}/>Atualizar</button></div>
  </div>
  <div className="gx-kpis">
   <a className="gx-kpi green" href="/dashboard/relatorios"><span><CircleDollarSign size={14}/>Faturamento hoje</span><strong>{v(data.revenue_today)}</strong><small>{data.appointments_today} agendamentos hoje</small></a>
   <a className="gx-kpi green" href="/dashboard/relatorios"><span><TrendingUp size={14}/>Faturamento no mês</span><strong>{v(data.revenue_month)}</strong><small>{data.sales_count_month} vendas/atendimentos</small></a>
   <div className="gx-kpi"><span><Receipt size={14}/>Ticket médio</span><strong>{v(data.ticket_average)}</strong><small>no mês</small></div>
   <a className="gx-kpi blue" href="/dashboard/agenda"><span><UserCheck size={14}/>Atendimentos no mês</span><strong>{data.attendances_month}</strong><small>{data.no_shows_month} faltas</small></a>
   <a className="gx-kpi" href="/dashboard/agenda"><span><Clock size={14}/>Horários hoje</span><strong>{data.slots_today?.free??0} livres</strong><small>{data.slots_today?.busy??0} ocupados · {occupancy}% ocupação</small></a>
   <a className="gx-kpi red" href="/dashboard/agenda"><span><XCircle size={14}/>Cancelamentos</span><strong>{data.cancellations_month}</strong><small>no mês</small></a>
   <a className="gx-kpi blue" href="/dashboard/clientes"><span><UserPlus size={14}/>Clientes novos</span><strong>{data.new_clients_month}</strong><small>cadastrados no mês</small></a>
   <a className="gx-kpi" href="/dashboard/clientes"><span><Users size={14}/>Clientes recorrentes</span><strong>{data.recurring_clients_month}</strong><small>de {data.clients_served_month} atendidos</small></a>
   <a className="gx-kpi amber" href="/dashboard/estoque"><span><Package size={14}/>Vendas de produtos</span><strong>{v(data.products_month?.revenue_cents)}</strong><small>{data.products_month?.quantity||0} unidades no mês</small></a>
   <a className="gx-kpi green" href="/dashboard/marketing"><span><TrendingUp size={14}/>Faturamento recuperado</span><strong>{v(rec.revenue_cents)}</strong><small>{rec.clients||0} clientes recuperados no mês</small></a>
   {data.deposits_pending>0&&<a className="gx-kpi amber" href="/dashboard/agenda"><span><CalendarClock size={14}/>Sinais pendentes</span><strong>{data.deposits_pending}</strong><small>reservas aguardando PIX</small></a>}
  </div>
  <div className="gx-grid-2">
   <div className="gx-card"><div className="gx-between"><div><h3>Faturamento · últimos 30 dias</h3><p>Recebimentos confirmados por dia</p></div></div><div style={{marginTop:12}}><RevenueChart series={data.series} hide={hide}/></div>
    <div className="gx-meter" style={{marginTop:12}} title={"Ocupação de hoje: "+occupancy+"%"}><span style={{width:occupancy+"%"}}/></div><p>Ocupação da agenda hoje: <b style={{color:"#fff"}}>{occupancy}%</b></p></div>
   <div className="gx-card"><h3>Faturamento por profissional</h3><p>Mês atual</p><div style={{marginTop:14}}><Bars rows={data.by_professional} hide={hide} empty="Sem recebimentos no mês."/></div></div>
  </div>
  {(data.by_unit||[]).length>1&&<div className="gx-card"><h3>Faturamento por unidade</h3><p>Mês atual</p><div style={{marginTop:14}}><Bars rows={data.by_unit} hide={hide} empty="Sem recebimentos no mês."/></div></div>}
 </section>;
}
