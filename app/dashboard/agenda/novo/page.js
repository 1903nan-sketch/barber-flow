"use client";
import {notify} from "../../../../lib/notify";
import {useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {CalendarPlus,Check,ChevronLeft,ChevronRight,Clock,Scissors,Users} from "lucide-react";
import {supabase} from "../../../../lib/supabase";
import {useClientDebts} from "../../../../lib/client-debts";
import {validPhone} from "../../../../lib/phone";
import ModuleShell from "../../_components/ModuleShell";
import ClientPicker from "../../_components/ClientPicker";

const DAYS=14;
const money=c=>(Number(c||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const firstName=n=>String(n||"").trim().split(/\s+/)[0];
const tzToday=tz=>{try{return new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}catch{return new Date().toISOString().slice(0,10)}};
const addDays=(iso,n)=>{const d=new Date(iso+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const dayLabel=(iso,opts)=>new Date(iso+"T12:00:00Z").toLocaleDateString("pt-BR",{timeZone:"UTC",...opts}).replace(".","");
const timeIn=(tz,iso)=>new Date(iso).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:tz});
const hourIn=(tz,iso)=>Number(new Intl.DateTimeFormat("en-US",{hour:"2-digit",hourCycle:"h23",timeZone:tz}).format(new Date(iso)));
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const PERIODS=[["Manhã",0,12],["Tarde",12,18],["Noite",18,24]];

function Avatar({barber}){return <span className="na-avatar">{barber.photo_url?<img src={barber.photo_url} alt="" /* eslint-disable-line @next/next/no-img-element */ />:String(barber.name||"?")[0].toUpperCase()}</span>}

// Novo agendamento no painel: escolhe serviço e profissional e já vê os dias e
// horários livres (mesma regra do site de agendamento), sem precisar adivinhar.
function NewAppointment({workspace}){
 const router=useRouter(),t=workspace.tenant.id;
 const canAll=workspace.membership?.role==="owner"||Boolean(workspace.membership?.permissions?.includes?.("agenda"));
 const [data,setData]=useState({clients:[],barbers:[],services:[],units:[],links:null,unitLinks:null,loaded:false});
 const [client,setClient]=useState(null),[unit,setUnit]=useState(""),[service,setService]=useState(""),[barber,setBarber]=useState("");
 const [date,setDate]=useState(""),[dateTouched,setDateTouched]=useState(false),[stripStart,setStripStart]=useState("");
 const [slot,setSlot]=useState(null),[cache,setCache]=useState({}),[allServices,setAllServices]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[reload,setReload]=useState(0);
 const debts=useClientDebts(supabase,t);

 useEffect(()=>{Promise.all([
  supabase.from("clients").select("id,name,phone,whatsapp").eq("tenant_id",t).order("name"),
  supabase.from("barbers").select("id,name,photo_url,user_id").eq("tenant_id",t).eq("active",true).order("name"),
  supabase.from("services").select("id,name,price_cents,duration").eq("tenant_id",t).eq("active",true).order("name"),
  supabase.from("units").select("id,name,timezone").eq("tenant_id",t).eq("active",true).order("name"),
  supabase.from("barber_services").select("barber_id,service_id").eq("tenant_id",t),
  supabase.from("barber_units").select("barber_id,unit_id").eq("tenant_id",t)
 ]).then(([c,b,s,u,bs,bu])=>{
  const units=u.data||[];
  setData({clients:c.data||[],barbers:b.data||[],services:s.data||[],units,links:bs.error?null:bs.data||[],unitLinks:bu.error?null:bu.data||[],loaded:true});
  setUnit(x=>x||units[0]?.id||"");
 })},[t]);

 const tz=data.units.find(x=>x.id===unit)?.timezone||"America/Sao_Paulo";
 const today=tzToday(tz);
 useEffect(()=>{setDate(d=>d||today);setStripStart(d=>d||today)},[today]);

 // Profissionais que fazem o serviço escolhido nesta unidade.
 const pros=useMemo(()=>data.barbers.filter(b=>(canAll||b.user_id===workspace.user?.id)
  &&(!service||!data.links||data.links.some(x=>x.barber_id===b.id&&x.service_id===service))
  &&(!unit||!data.unitLinks||data.unitLinks.some(x=>x.barber_id===b.id&&x.unit_id===unit))),[data,service,unit,canAll,workspace.user?.id]);
 const onlyOne=!canAll&&pros.length===1;
 useEffect(()=>{if(onlyOne&&barber!==pros[0].id)setBarber(pros[0].id);else if(barber&&!pros.some(b=>b.id===barber))setBarber("")},[pros,barber,onlyOne]);

 const key=unit&&service?`${unit}|${service}|${barber||"any"}`:"";
 const strip=useMemo(()=>stripStart?Array.from({length:DAYS},(_,i)=>addDays(stripStart,i)):[],[stripStart]);
 const wanted=useMemo(()=>[...new Set([...strip,date].filter(Boolean))],[strip,date]);

 // Consulta os horários livres dos dias visíveis (um pedido por dia, em paralelo).
 useEffect(()=>{
  if(!key||!wanted.length)return;
  const missing=wanted.filter(d=>!(cache[key]&&d in cache[key]));
  if(!missing.length)return;
  setCache(c=>({...c,[key]:{...c[key],...Object.fromEntries(missing.map(d=>[d,undefined]))}}));
  Promise.all(missing.map(d=>supabase.rpc("available_slots",{t,u:unit,b:barber||null,s:service,d}).then(({data,error})=>[d,error?{error:error.message}:data||[]])))
   .then(rows=>setCache(c=>({...c,[key]:{...c[key],...Object.fromEntries(rows)}})));
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key,wanted.join(","),reload]);

 const dayRows=d=>cache[key]?.[d];
 const slotsOf=d=>{const rows=dayRows(d);if(!Array.isArray(rows))return rows;const by=new Map();for(const r of rows){if(!by.has(r.starts_at))by.set(r.starts_at,[]);by.get(r.starts_at).push(r.barber_id)}
  return [...by.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([starts_at,ids])=>{const pick=barber||pros.find(p=>ids.includes(p.id))?.id||ids[0];return {starts_at,barber_id:pick,others:ids.length}})};
 const daySlots=slotsOf(date),loading=key&&daySlots===undefined;
 const countOf=d=>{const s=slotsOf(d);return Array.isArray(s)?s.length:s===undefined?null:0};
 const firstFree=strip.find(d=>countOf(d)>0);

 // Sem data escolhida pela pessoa: pula direto para o primeiro dia com horário livre.
 useEffect(()=>{if(!dateTouched&&key&&Array.isArray(daySlots)&&daySlots.length===0&&firstFree&&firstFree!==date)setDate(firstFree)},[dateTouched,key,daySlots,firstFree,date]);
 useEffect(()=>{setSlot(null)},[key,date]);

 function chooseDate(d){setDate(d);setDateTouched(true);setError("")}
 function jump(d){if(!d)return;const v=d<today?today:d;setStripStart(v);chooseDate(v)}
 function moveStrip(n){const next=addDays(stripStart,n);setStripStart(next<today?today:next)}

 async function submit(e){
  e.preventDefault();if(busy)return;setError("");
  if(!client)return setError("Escolha o cliente ou cadastre um novo.");
  if(!client.id&&(String(client.name||"").trim().length<2||!validPhone(client.phone)))return setError("Informe o nome e o celular completo do cliente (ex.: 11 91234-5678).");
  if(!service)return setError("Escolha o serviço.");
  if(!slot)return setError("Escolha um horário livre.");
  setBusy(true);
  let clientId=client.id;
  if(!clientId){const {data,error}=await supabase.rpc("quick_client",{t,p_name:client.name,p_phone:client.phone});if(error){setBusy(false);return setError(error.message)}clientId=data;setClient({id:data,name:client.name,phone:client.phone})}
  const {error}=await supabase.rpc("book_appointment",{t,u:unit,b:slot.barber_id,c:clientId,s:service,st:slot.starts_at,existing_id:null});
  setBusy(false);
  if(error){setError(error.message);setCache(c=>({...c,[key]:{}}));setReload(x=>x+1);return}
  notify("Agendamento criado com sucesso.");router.push("/dashboard/agenda");router.refresh()
 }

 const svc=data.services.find(x=>x.id===service),slotBarber=slot&&data.barbers.find(b=>b.id===slot.barber_id);
 const shownServices=allServices||data.services.length<=6?data.services:[...data.services.slice(0,6),...(svc&&!data.services.slice(0,6).includes(svc)?[svc]:[])];
 const step=!client?0:!service?1:!slot?2:3;

 return <form className="box form new-appointment na" onSubmit={submit}>
  <ol className="na-steps">{["Cliente","Serviço","Horário","Confirmar"].map((l,i)=><li key={l} className={i===step?"current":i<step?"done":""}><span>{i<step?<Check size={12}/>:i+1}</span>{l}</li>)}</ol>

  <section className="na-sec"><h3>Cliente</h3><ClientPicker clients={data.clients} debts={debts.byClient} value={client} onChange={setClient}/></section>

  {data.units.length>1&&<section className="na-sec"><h3>Unidade</h3><div className="na-chips">{data.units.map(u=><button type="button" key={u.id} className={"na-chip"+(unit===u.id?" on":"")} aria-pressed={unit===u.id} onClick={()=>setUnit(u.id)}>{u.name}</button>)}</div></section>}

  <section className="na-sec">
   <div className="na-sec-head"><h3>Serviço</h3>{data.services.length>6&&<button type="button" className="sch-link" onClick={()=>setAllServices(x=>!x)}>{allServices?"Ver menos":`Ver todos (${data.services.length})`}</button>}</div>
   {data.loaded&&!data.services.length?<p className="na-empty">Nenhum serviço ativo. Cadastre em Serviços.</p>
    :<div className="na-services">{shownServices.map(s=><button type="button" key={s.id} className={"na-service"+(service===s.id?" on":"")} aria-pressed={service===s.id} onClick={()=>{setService(s.id);setError("")}}>
     <span className="na-service-icon"><Scissors size={16}/></span><span><b>{s.name}</b><small>{money(s.price_cents)} · {s.duration} min</small></span>{service===s.id&&<Check size={16}/>}
    </button>)}</div>}
  </section>

  <section className="na-sec">
   <h3>Profissional</h3>
   {!service?<p className="na-empty">Escolha o serviço para ver quem atende.</p>
    :!pros.length?<p className="na-empty">Nenhum profissional faz este serviço nesta unidade. Ajuste em Equipe.</p>
    :<div className="na-pros">
     {!onlyOne&&pros.length>1&&<button type="button" className={"na-pro"+(!barber?" on":"")} aria-pressed={!barber} onClick={()=>setBarber("")}><span className="na-avatar any"><Users size={18}/></span><b>Qualquer um</b><small>Primeiro livre</small></button>}
     {pros.map(b=><button type="button" key={b.id} className={"na-pro"+(barber===b.id?" on":"")} aria-pressed={barber===b.id} onClick={()=>setBarber(b.id)}><Avatar barber={b}/><b>{firstName(b.name)}</b><small>Profissional</small></button>)}
    </div>}
  </section>

  <section className="na-sec">
   <div className="na-sec-head"><h3>Dia e horário</h3><label className="na-jump"><span>Outra data</span><input type="date" min={today} max={addDays(today,180)} value={date} onChange={e=>jump(e.target.value)}/></label></div>
   {!service||!pros.length?<p className="na-empty">Os dias e horários livres aparecem aqui assim que escolher o serviço.</p>:<>
    <div className="na-days-wrap">
     <button type="button" className="na-nav" aria-label="Dias anteriores" disabled={stripStart<=today} onClick={()=>moveStrip(-7)}><ChevronLeft size={16}/></button>
     <div className="na-days">{strip.map(d=>{const n=countOf(d);return <button type="button" key={d} className={"na-day"+(date===d?" on":"")+(n===0?" full":"")} aria-pressed={date===d} onClick={()=>chooseDate(d)}>
      <small>{d===today?"Hoje":d===addDays(today,1)?"Amanhã":dayLabel(d,{weekday:"short"})}</small><b>{dayLabel(d,{day:"2-digit"})}</b><i>{n===null?"…":n===0?"Sem vaga":`${n} livre${n>1?"s":""}`}</i>
     </button>})}</div>
     <button type="button" className="na-nav" aria-label="Próximos dias" onClick={()=>moveStrip(7)}><ChevronRight size={16}/></button>
    </div>
    <p className="na-date-title"><Clock size={14}/>{cap(dayLabel(date,{weekday:"long",day:"2-digit",month:"long"}))}</p>
    {loading?<p className="na-empty">Consultando horários livres...</p>
     :daySlots?.error?<p className="na-empty">{daySlots.error}</p>
     :!daySlots?.length?<p className="na-empty">Nenhum horário livre neste dia.{firstFree&&firstFree!==date&&<button type="button" className="sch-link" onClick={()=>chooseDate(firstFree)}>Ver {dayLabel(firstFree,{weekday:"short",day:"2-digit",month:"2-digit"})}</button>}</p>
     :<div className="na-periods">{PERIODS.map(([label,from,to])=>{const list=daySlots.filter(x=>{const h=hourIn(tz,x.starts_at);return h>=from&&h<to});return list.length?<div key={label} className="na-period"><small>{label}</small><div className="na-slots">{list.map(x=>{const on=slot?.starts_at===x.starts_at;const who=!barber&&data.barbers.find(b=>b.id===x.barber_id);return <button type="button" key={x.starts_at} className={"na-slot"+(on?" on":"")} aria-pressed={on} onClick={()=>{setSlot(x);setError("")}}><b>{timeIn(tz,x.starts_at)}</b>{who&&<small>{firstName(who.name)}</small>}</button>})}</div></div>:null})}</div>}
   </>}
  </section>

  {error&&<div className="form-alert error">{error}</div>}
  <div className="na-confirm">
   <div>{slot&&svc?<><b>{svc.name} · {money(svc.price_cents)}</b><small>{dayLabel(date,{weekday:"long",day:"2-digit",month:"2-digit"})} às {timeIn(tz,slot.starts_at)}{slotBarber?` com ${firstName(slotBarber.name)}`:""}{client?.name?` · ${client.name}`:""}</small></>:<><b>Escolha o horário</b><small>{!client?"Comece pelo cliente.":!service?"Escolha o serviço.":"Toque em um horário livre."}</small></>}</div>
   <button className="primary form-submit" disabled={busy||!slot||!client}><CalendarPlus size={17}/>{busy?"Salvando...":"Salvar agendamento"}</button>
  </div>
 </form>;
}
export default function NewAppointmentPage(){return <ModuleShell title="Novo agendamento" eyebrow="Agenda">{workspace=><NewAppointment workspace={workspace}/>}</ModuleShell>}
