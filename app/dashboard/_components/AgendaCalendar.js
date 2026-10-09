"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {ChevronLeft,ChevronRight,Plus} from "lucide-react";
import {supabase} from "../../../lib/supabase";

const HOUR_PX=56;
const WEEK=["DOM","SEG","TER","QUA","QUI","SEX","SÁB"];
const VIEWS=[["day","Dia"],["week","Semana"],["month","Mês"]];
const VIEW_KEY="rupcontrol_agenda_view";
const STATUS={scheduled:["Agendado","wk-yellow"],confirmed:["Confirmado","wk-green"],present:["Presente","wk-blue"],in_service:["Em atendimento","wk-blue"],completed:["Finalizado","wk-gray"],no_show:["Falta","wk-red"]};
const dayStart=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const weekStartOf=d=>addDays(dayStart(d),-new Date(d).getDay());
const sameDay=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
const hhmm=d=>d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
const ddmm=d=>d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});
const cap=s=>s.replace(/^./,c=>c.toUpperCase());

// Período mostrado em cada visão. O mês usa 6 semanas completas, como um calendário de parede.
function rangeOf(view,anchor){
 if(view==="day"){const s=dayStart(anchor);return [s,addDays(s,1)]}
 if(view==="week"){const s=weekStartOf(anchor);return [s,addDays(s,7)]}
 const s=weekStartOf(new Date(anchor.getFullYear(),anchor.getMonth(),1));return [s,addDays(s,42)];
}
function titleOf(view,anchor,[start,end]){
 if(view==="day")return cap(anchor.toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"}));
 if(view==="week"){const last=addDays(end,-1);return `${ddmm(start)} a ${ddmm(last)}/${last.getFullYear()}`}
 return cap(anchor.toLocaleDateString("pt-BR",{month:"long",year:"numeric"}));
}

// Horários que se sobrepõem no mesmo dia dividem a largura da coluna.
function layoutDay(events){
 const sorted=[...events].sort((a,b)=>a.start-b.start||b.end-a.end),out=[];
 let group=[],groupEnd=0;
 const flush=()=>{const cols=[];for(const e of group){let c=cols.findIndex(end=>end<=e.start);if(c<0){c=cols.length;cols.push(0)}cols[c]=e.end;out.push({...e,col:c})}for(const e of out.slice(out.length-group.length))e.cols=cols.length;group=[]};
 for(const e of sorted){if(group.length&&e.start>=groupEnd)flush();group.push(e);groupEnd=Math.max(groupEnd,e.end)}
 if(group.length)flush();
 return out;
}

// Grade de horas para as visões Dia (uma coluna) e Semana (sete colunas).
function TimeGrid({days,events,now,detailed,barberName,scrollRef}){
 const firstHour=Math.min(8,...events.map(e=>e.start.getHours())),lastHour=Math.max(20,...events.map(e=>e.end.getHours()+(e.end.getMinutes()?1:0)));
 const hours=Array.from({length:lastHour-firstHour},(_,i)=>firstHour+i),top=d=>((d.getHours()-firstHour)*60+d.getMinutes())*HOUR_PX/60;
 const showNow=now.getHours()>=firstHour&&now.getHours()<lastHour;
 return <div className="wk-scroll" ref={scrollRef}>
  <div className={"wk-grid"+(days.length>1?" multi":"")} style={{"--wk-days":days.length,"--wk-hours":hours.length,"--wk-hour":HOUR_PX+"px"}}>
   <div className="wk-corner"/>
   {days.map(d=><div key={+d} className={"wk-day-head"+(sameDay(d,now)?" today":"")}><span>{WEEK[d.getDay()]}</span><b>{d.getDate()}</b></div>)}
   <div className="wk-hours">{hours.map(h=><span key={h}>{String(h).padStart(2,"0")}:00</span>)}</div>
   {days.map(d=><div key={+d} className={"wk-col"+(sameDay(d,now)?" today":"")}>
    {layoutDay(events.filter(e=>sameDay(e.start,d))).map(e=>{const [label,tone]=STATUS[e.status]||[e.status,"wk-yellow"],short=e.end-e.start<45*60000;return <a key={e.id} href="/dashboard/agenda" className={"wk-event "+tone+(short?" short":"")} title={`${e.client} · ${e.service} · ${hhmm(e.start)}–${hhmm(e.end)} · ${label}`} style={{top:top(e.start),height:Math.max(26,(e.end-e.start)/60000*HOUR_PX/60-2),left:`calc(${e.col*100/e.cols}% + 2px)`,width:`calc(${100/e.cols}% - 4px)`}}>
     {short?<><b>{e.client}</b><small>{hhmm(e.start)} · {e.service}</small></>
      :<><b>{e.client}</b><small>{e.service}{detailed&&barberName(e.barber_id)?` · ${barberName(e.barber_id)}`:""}</small><small>{hhmm(e.start)} - {hhmm(e.end)}{detailed?` · ${label}`:""}</small></>}
    </a>})}
    {showNow&&sameDay(d,now)&&<i className="wk-now" style={{top:top(now)}}/>}
   </div>)}
  </div>
 </div>;
}

function MonthGrid({start,anchor,events,now,onPick}){
 const cells=Array.from({length:42},(_,i)=>addDays(start,i));
 return <div className="mo-grid">
  {WEEK.map(w=><span key={w} className="mo-week">{w}</span>)}
  {cells.map(d=>{const list=events.filter(e=>sameDay(e.start,d)).sort((a,b)=>a.start-b.start),out=d.getMonth()!==anchor.getMonth();
   return <button type="button" key={+d} className={"mo-day"+(out?" out":"")+(sameDay(d,now)?" today":"")} onClick={()=>onPick(d)} aria-label={`${d.toLocaleDateString("pt-BR")}: ${list.length} horários`}>
    <b>{d.getDate()}</b>
    {list.slice(0,3).map(e=><span key={e.id} className={"mo-chip "+(STATUS[e.status]?.[1]||"wk-yellow")}>{hhmm(e.start)} {e.client}</span>)}
    {list.length>3&&<small>+{list.length-3} mais</small>}
   </button>})}
 </div>;
}

export default function AgendaCalendar({tenantId,barbers,money}){
 const [view,setView]=useState(()=>{try{const saved=localStorage.getItem(VIEW_KEY);if(VIEWS.some(([v])=>v===saved))return saved}catch{}return typeof window!=="undefined"&&window.innerWidth<600?"day":"week"});
 const [anchor,setAnchor]=useState(()=>dayStart(new Date())),[barber,setBarber]=useState("all"),[rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[now,setNow]=useState(()=>new Date()),[reload,setReload]=useState(0),scrollRef=useRef(null);
 const [start,end]=rangeOf(view,anchor);
 useEffect(()=>{const t=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(t)},[]);
 // Novo agendamento avisado pelo sino: recarrega o calendário.
 useEffect(()=>{const on=()=>setReload(x=>x+1);window.addEventListener("rupcontrol:new-booking",on);return()=>window.removeEventListener("rupcontrol:new-booking",on)},[]);
 useEffect(()=>{
  let alive=true;setLoading(true);setError("");
  (async()=>{
   const {data,error}=await supabase.from("appointments").select("id,starts_at,ends_at,status,price_cents,client_id,barber_id,service_id").eq("tenant_id",tenantId).gte("starts_at",start.toISOString()).lt("starts_at",end.toISOString()).neq("status","cancelled").order("starts_at").limit(1000);
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
 },[tenantId,+start,+end,reload]); // eslint-disable-line react-hooks/exhaustive-deps

 // Na semana, o celular rola a grade para mostrar o dia de hoje.
 useEffect(()=>{const box=scrollRef.current,col=box?.querySelector(".wk-day-head.today");if(view==="week"&&box&&col&&box.scrollWidth>box.clientWidth)box.scrollLeft=Math.max(0,col.offsetLeft-60)},[view,+start,loading]); // eslint-disable-line react-hooks/exhaustive-deps

 const events=useMemo(()=>rows.filter(x=>barber==="all"||x.barber_id===barber).map(x=>{const s=new Date(x.starts_at),e=x.ends_at?new Date(x.ends_at):null;return {...x,start:s,end:e&&e>s?e:new Date(s.getTime()+30*60000)}}),[rows,barber]);
 // Total do topo: só o que está no período mostrado (no mês, só os dias do próprio mês).
 const inMonth=events.filter(e=>e.start>=start&&e.start<end&&(view!=="month"||e.start.getMonth()===anchor.getMonth()));
 const total=inMonth.reduce((s,x)=>s+Number(x.price_cents||0),0);
 const barberName=id=>barbers.find(b=>b.id===id)?.name;
 function chooseView(v){setView(v);try{localStorage.setItem(VIEW_KEY,v)}catch{}}
 function move(n){setAnchor(a=>view==="day"?addDays(a,n):view==="week"?addDays(a,7*n):new Date(a.getFullYear(),a.getMonth()+n,1))}
 const viewIndex=VIEWS.findIndex(([v])=>v===view);

 return <section className="box week-calendar">
  <div className="wk-head">
   <div><h2>{titleOf(view,anchor,[start,end])}</h2><p>{inMonth.length} {inMonth.length===1?"horário":"horários"} · {money(total)} previstos</p></div>
   <div className="seg" role="tablist" aria-label="Visão da agenda" style={{"--i":viewIndex}}>
    {VIEWS.map(([v,label])=><button type="button" role="tab" key={v} aria-selected={view===v} className={view===v?"on":""} onClick={()=>chooseView(v)}>{label}</button>)}
   </div>
   <div className="wk-actions">
    <div className="wk-nav"><button type="button" className="wk-btn" aria-label="Anterior" onClick={()=>move(-1)}><ChevronLeft size={16}/></button><button type="button" className="wk-btn wk-today" onClick={()=>setAnchor(dayStart(new Date()))}>Hoje</button><button type="button" className="wk-btn" aria-label="Próximo" onClick={()=>move(1)}><ChevronRight size={16}/></button></div>
    {barbers.length>1&&<select value={barber} onChange={e=>setBarber(e.target.value)} aria-label="Profissional"><option value="all">Todos</option>{barbers.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>}
    <a className="wk-new" href="/dashboard/agenda/novo"><Plus size={15}/>Novo</a>
   </div>
  </div>
  {error&&<div className="form-alert error">{error}</div>}
  <div className="wk-body">
   {view==="month"
    ?<MonthGrid start={start} anchor={anchor} events={events} now={now} onPick={d=>{setAnchor(dayStart(d));chooseView("day")}}/>
    :<TimeGrid days={view==="day"?[start]:Array.from({length:7},(_,i)=>addDays(start,i))} events={events} now={now} detailed={view==="day"} barberName={barberName} scrollRef={scrollRef}/>}
   {loading&&<p className="wk-loading">Carregando agenda...</p>}
  </div>
  <div className="wk-legend">{[["Agendado","wk-yellow"],["Confirmado","wk-green"],["Em atendimento","wk-blue"],["Finalizado","wk-gray"],["Falta","wk-red"]].map(([l,c])=><span key={c}><i className={c}/>{l}</span>)}</div>
 </section>;
}
