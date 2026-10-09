"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {ChevronLeft,ChevronRight,Plus} from "lucide-react";
import {supabase} from "../../../lib/supabase";

const HOUR_PX=56,DAY_MS=86400000;
const WEEK=["DOM","SEG","TER","QUA","QUI","SEX","SÁB"];
const STATUS={scheduled:["Agendado","wk-yellow"],confirmed:["Confirmado","wk-green"],present:["Presente","wk-blue"],in_service:["Em atendimento","wk-blue"],completed:["Finalizado","wk-gray"],no_show:["Falta","wk-red"]};
const weekStartOf=d=>{const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-x.getDay());return x};
const sameDay=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
const hhmm=d=>d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
const ddmm=d=>d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});

// Horários que se sobrepõem no mesmo dia dividem a largura da coluna.
function layoutDay(events){
 const sorted=[...events].sort((a,b)=>a.start-b.start||b.end-a.end),out=[];
 let group=[],groupEnd=0;
 const flush=()=>{const cols=[];for(const e of group){let c=cols.findIndex(end=>end<=e.start);if(c<0){c=cols.length;cols.push(0)}cols[c]=e.end;out.push({...e,col:c})}for(const e of out.slice(out.length-group.length))e.cols=cols.length;group=[]};
 for(const e of sorted){if(group.length&&e.start>=groupEnd)flush();group.push(e);groupEnd=Math.max(groupEnd,e.end)}
 if(group.length)flush();
 return out;
}

export default function WeekCalendar({tenantId,barbers,money}){
 const [weekStart,setWeekStart]=useState(()=>weekStartOf(new Date())),[barber,setBarber]=useState("all"),[rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[now,setNow]=useState(()=>new Date()),scrollRef=useRef(null);
 useEffect(()=>{const t=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(t)},[]);
 useEffect(()=>{
  let alive=true;setLoading(true);setError("");
  const end=new Date(weekStart.getTime()+7*DAY_MS);
  (async()=>{
   const {data,error}=await supabase.from("appointments").select("id,starts_at,ends_at,status,price_cents,client_id,barber_id,service_id").eq("tenant_id",tenantId).gte("starts_at",weekStart.toISOString()).lt("starts_at",end.toISOString()).neq("status","cancelled").order("starts_at").limit(500);
   if(!alive)return;
   if(error){setError(error.message);setRows([]);setLoading(false);return}
   const list=data||[],ids=k=>[...new Set(list.map(x=>x[k]).filter(Boolean))];
   const [c,s]=await Promise.all([
    ids("client_id").length?supabase.from("clients").select("id,name").in("id",ids("client_id")):{data:[]},
    ids("service_id").length?supabase.from("services").select("id,name").in("id",ids("service_id")):{data:[]}
   ]);
   if(!alive)return;
   const name=(arr,id)=>(arr||[]).find(x=>x.id===id)?.name;
   setRows(list.map(x=>({...x,client:name(c.data,x.client_id)||"Cliente",service:name(s.data,x.service_id)||"Atendimento"})));
   setLoading(false);
  })();
  return()=>{alive=false};
 },[tenantId,weekStart]);

 // No celular a grade rola para o lado: abre já mostrando o dia de hoje.
 useEffect(()=>{const box=scrollRef.current,col=box?.querySelector(".wk-day-head.today");if(box&&col&&box.scrollWidth>box.clientWidth)box.scrollLeft=Math.max(0,col.offsetLeft-60)},[weekStart,loading]);
 const days=Array.from({length:7},(_,i)=>new Date(weekStart.getTime()+i*DAY_MS));
 const events=useMemo(()=>rows.filter(x=>barber==="all"||x.barber_id===barber).map(x=>{const start=new Date(x.starts_at),end=x.ends_at?new Date(x.ends_at):new Date(start.getTime()+30*60000);return {...x,start,end:end>start?end:new Date(start.getTime()+30*60000)}}),[rows,barber]);
 // Faixa de horas: 8h às 20h, ampliada se houver horário fora disso.
 const firstHour=Math.min(8,...events.map(e=>e.start.getHours())),lastHour=Math.max(20,...events.map(e=>e.end.getHours()+(e.end.getMinutes()?1:0)));
 const hours=Array.from({length:lastHour-firstHour},(_,i)=>firstHour+i),top=d=>((d.getHours()-firstHour)*60+d.getMinutes())*HOUR_PX/60;
 const total=events.reduce((s,x)=>s+Number(x.price_cents||0),0);
 const nowVisible=days.some(d=>sameDay(d,now))&&now.getHours()>=firstHour&&now.getHours()<lastHour;

 return <section className="box week-calendar">
  <div className="wk-head">
   <div><h2>Agenda da semana</h2><p>{ddmm(days[0])} a {ddmm(days[6])}/{days[6].getFullYear()} · {events.length} {events.length===1?"horário":"horários"} · {money(total)} previstos</p></div>
   <div className="wk-actions">
    <div className="wk-nav"><button type="button" className="wk-btn" aria-label="Semana anterior" onClick={()=>setWeekStart(w=>new Date(w.getTime()-7*DAY_MS))}><ChevronLeft size={16}/></button><button type="button" className="wk-btn wk-today" onClick={()=>setWeekStart(weekStartOf(new Date()))}>Hoje</button><button type="button" className="wk-btn" aria-label="Próxima semana" onClick={()=>setWeekStart(w=>new Date(w.getTime()+7*DAY_MS))}><ChevronRight size={16}/></button></div>
    {barbers.length>1&&<select value={barber} onChange={e=>setBarber(e.target.value)} aria-label="Profissional"><option value="all">Todos</option>{barbers.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>}
    <a className="wk-new" href="/dashboard/agenda/novo"><Plus size={15}/>Novo</a>
   </div>
  </div>
  {error&&<div className="form-alert error">{error}</div>}
  <div className="wk-scroll" ref={scrollRef}>
   <div className="wk-grid" style={{"--wk-hours":hours.length,"--wk-hour":HOUR_PX+"px"}}>
    <div className="wk-corner"/>
    {days.map((d,i)=><div key={i} className={"wk-day-head"+(sameDay(d,now)?" today":"")}><span>{WEEK[i]}</span><b>{d.getDate()}</b></div>)}
    <div className="wk-hours">{hours.map(h=><span key={h}>{String(h).padStart(2,"0")}:00</span>)}</div>
    {days.map((d,i)=><div key={i} className={"wk-col"+(sameDay(d,now)?" today":"")}>
     {layoutDay(events.filter(e=>sameDay(e.start,d))).map(e=>{const [label,tone]=STATUS[e.status]||[e.status,"wk-yellow"],short=e.end-e.start<45*60000;return <a key={e.id} href="/dashboard/agenda" className={"wk-event "+tone+(short?" short":"")} title={`${e.client} · ${e.service} · ${hhmm(e.start)}–${hhmm(e.end)} · ${label}`} style={{top:top(e.start),height:Math.max(26,(e.end-e.start)/60000*HOUR_PX/60-2),left:`calc(${e.col*100/e.cols}% + 2px)`,width:`calc(${100/e.cols}% - 4px)`}}>
      {short?<><b>{e.client}</b><small>{hhmm(e.start)} · {e.service}</small></>:<><b>{e.client}</b><small>{e.service}</small><small>{hhmm(e.start)} - {hhmm(e.end)}</small></>}
     </a>})}
     {nowVisible&&sameDay(d,now)&&<i className="wk-now" style={{top:top(now)}}/>}
    </div>)}
   </div>
   {loading&&<p className="wk-loading">Carregando agenda...</p>}
  </div>
  <div className="wk-legend">{[["Agendado","wk-yellow"],["Confirmado","wk-green"],["Em atendimento","wk-blue"],["Finalizado","wk-gray"],["Falta","wk-red"]].map(([l,c])=><span key={c}><i className={c}/>{l}</span>)}</div>
 </section>;
}
