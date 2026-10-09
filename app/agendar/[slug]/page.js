"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {useParams} from "next/navigation";
import {ArrowLeft,ArrowRight,CalendarDays,Check,ChevronLeft,ChevronRight,Clock,Instagram,MapPin,MessageCircle,ShieldCheck,Store} from "lucide-react";
import {supabase} from "../../../lib/supabase";
import ServiceArt from "../../_components/ServiceArt";

const contactNumber=v=>{const n=String(v||"").replace(/\D/g,"");return n.length===10||n.length===11?"55"+n:n};
const money=v=>(Number(v||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const pad=n=>String(n).padStart(2,"0");
const isoDate=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const today=()=>isoDate(new Date());
const monthTitle=d=>d.toLocaleDateString("pt-BR",{month:"long",year:"numeric"}).replace(/^./,x=>x.toUpperCase());
const longDate=iso=>new Date(iso+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});
const shortDate=iso=>new Date(iso+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit"});
// "Barbearia do Nico" vira "BN": ignora "do", "da", "de", "e"...
const initials=name=>{const words=String(name||"").trim().split(/\s+/).filter(Boolean),main=words.filter(w=>!/^(d[aeo]s?|e|&)$/i.test(w));return (main.length?main:words).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"?"};
const firstName=name=>String(name||"").trim().split(/\s+/)[0]||"Profissional";
const instagramHandle=v=>String(v||"").replace(/^@/,"").replace(/[^\w.]/g,"");
// Horários no fuso da unidade, que é onde o atendimento acontece.
function formatIn(tz,iso,options){try{return new Date(iso).toLocaleString("pt-BR",{...options,timeZone:tz})}catch{return new Date(iso).toLocaleString("pt-BR",options)}}
const STEPS=["Serviço","Profissional","Horário","Confirmação"];
// O profissional precisa fazer todos os serviços escolhidos.
const doesAll=(links,barberId,ids)=>ids.every(sid=>(links||[]).some(x=>x.barber_id===barberId&&x.service_id===sid));

function Avatar({barber,selected}){
 return <span className="bk-avatar">{barber.photo_url?<img src={barber.photo_url} alt=""/>:initials(barber.name)}{selected&&<i><Check/></i>}</span>;
}

function Calendar({month,setMonth,selected,onSelect,availability}){
 const y=month.getFullYear(),m=month.getMonth(),first=new Date(y,m,1),days=new Date(y,m+1,0).getDate(),now=new Date(),min=today();
 const cells=[...Array(first.getDay()).fill(null),...Array.from({length:days},(_,i)=>new Date(y,m,i+1))];
 return <div className="bk-cal">
  <div className="bk-cal-head">
   <button type="button" aria-label="Mês anterior" disabled={y===now.getFullYear()&&m<=now.getMonth()} onClick={()=>setMonth(new Date(y,m-1,1))}><ChevronLeft/></button>
   <strong>{monthTitle(month)}</strong>
   <button type="button" aria-label="Próximo mês" onClick={()=>setMonth(new Date(y,m+1,1))}><ChevronRight/></button>
  </div>
  <div className="bk-cal-week">{["D","S","T","Q","Q","S","S"].map((x,i)=><span key={i}>{x}</span>)}</div>
  <div className="bk-cal-days">{cells.map((d,i)=>{if(!d)return <span key={"e"+i}/>;const iso=isoDate(d);return <button type="button" key={iso} disabled={iso<min} className={(selected===iso?"selected ":"")+(availability[iso]?"available":"")} onClick={()=>onSelect(iso)}>{d.getDate()}</button>})}</div>
 </div>;
}

export default function PublicBooking(){
 const {slug}=useParams();
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [form,setForm]=useState({unit:"",services:[],barber:"",date:today(),slot:"",name:"",phone:"",email:""});
 const [view,setView]=useState("pick");
 const [slots,setSlots]=useState([]),[looking,setLooking]=useState(false);
 const [month,setMonth]=useState(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1)});
 const [availability,setAvailability]=useState({}),[calendarOpen,setCalendarOpen]=useState(false);
 const [allServices,setAllServices]=useState(false),[allPros,setAllPros]=useState(false);
 const [sending,setSending]=useState(false),[done,setDone]=useState(null);
 const [instagram,setInstagram]=useState({items:[],username:""});
 const cardRef=useRef(null),timeRef=useRef(null);

 useEffect(()=>{fetch("/api/instagram/feed?slug="+encodeURIComponent(slug)).then(r=>r.json()).then(x=>setInstagram(x)).catch(()=>{})},[slug]);
 useEffect(()=>{
  if(!supabase){setError("Agenda temporariamente indisponível.");setLoading(false);return}
  supabase.rpc("public_booking_data",{p_slug:slug}).then(({data,error})=>{setData(data);setError(error?.message||"");setLoading(false);if(data?.state==="open")setForm(f=>({...f,unit:data.units?.[0]?.id||""}))});
 },[slug]);

 const services=data?.services||[],selectedServices=services.filter(x=>form.services.includes(x.id));
 const totalPrice=selectedServices.reduce((s,x)=>s+Number(x.price_cents||0),0),totalDuration=selectedServices.reduce((s,x)=>s+Number(x.duration||0),0);
 const unit=data?.units?.find(x=>x.id===form.unit),tz=unit?.timezone||"America/Sao_Paulo",barber=data?.barbers?.find(x=>x.id===form.barber);
 // Profissionais da unidade que fazem todos os serviços escolhidos; o proprietário aparece primeiro.
 const pros=useMemo(()=>(data?.barbers||[])
  .filter(b=>(data.barber_units||[]).some(x=>x.barber_id===b.id&&x.unit_id===form.unit)&&doesAll(data.barber_services,b.id,form.services))
  .sort((a,b)=>(b.is_owner?1:0)-(a.is_owner?1:0)),[data,form.unit,form.services]);

 useEffect(()=>{
  let alive=true;setSlots([]);setLooking(false);
  if(!form.unit||!form.services.length||!form.barber||!form.date)return;
  setLooking(true);
  supabase.rpc("public_available_slots_multi",{p_slug:slug,p_unit:form.unit,p_barber:form.barber,p_services:form.services,p_date:form.date})
   .then(({data,error})=>{if(alive){setSlots(data||[]);setError(error?.message||"");setLooking(false)}})
   .catch(()=>{if(alive){setError("Não foi possível consultar os horários. Tente novamente.");setLooking(false)}});
  return()=>{alive=false};
 },[slug,form.unit,form.services,form.barber,form.date,done]);

 // Dias com horário livre no mês exibido (uma consulta só).
 useEffect(()=>{
  let alive=true;setAvailability({});
  if(!form.unit||!form.services.length||!form.barber)return;
  const days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  supabase.rpc("public_available_days",{p_slug:slug,p_unit:form.unit,p_barber:form.barber,p_services:form.services,p_from:isoDate(month),p_days:days})
   .then(({data})=>{if(alive)setAvailability(Object.fromEntries((data||[]).map(x=>[x.day,x.slots>0])))})
   .catch(()=>{});
  return()=>{alive=false};
 },[slug,form.unit,form.services,form.barber,month,done]);

 function toggleService(id){
  setError("");
  setForm(f=>{const ids=f.services.includes(id)?f.services.filter(x=>x!==id):[...f.services,id];return {...f,services:ids,barber:f.barber&&doesAll(data.barber_services,f.barber,ids)?f.barber:"",slot:""}});
 }
 function chooseBarber(id){
  setError("");setForm(f=>({...f,barber:id,slot:""}));
  if(form.services.length)setTimeout(()=>timeRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),60);
 }
 const chooseDate=iso=>{setForm(f=>({...f,date:iso,slot:""}));setCalendarOpen(false)};
 const chooseUnit=id=>setForm(f=>({...f,unit:id,barber:"",slot:""}));
 const show=next=>{setView(next);setError("");setTimeout(()=>cardRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),30)};

 async function book(e){
  e.preventDefault();if(sending)return;
  setSending(true);setError("");
  const {data:confirmation,error}=await supabase.rpc("public_book_multi",{p_slug:slug,p_unit:form.unit,p_barber:form.barber,p_services:form.services,p_starts_at:form.slot,p_name:form.name,p_phone:form.phone,p_email:form.email});
  setSending(false);
  if(error)return setError(error.message);
  setDone(confirmation);window.scrollTo({top:0,behavior:"smooth"});
 }

 if(loading)return <main className="bk-state"><div><Clock/><p>Carregando agenda...</p></div></main>;
 if(error&&!data)return <main className="bk-state"><div><Store/><h1>Não foi possível abrir esta agenda</h1><p>{error}</p></div></main>;
 if(data?.state!=="open")return <main className="bk-state"><div><Store/><h1>{data?.name||"Agenda indisponível"}</h1><p>{data?.state==="plan_unavailable"?"Este estabelecimento usa o plano Starter, que não inclui site de agendamento on-line.":"O agendamento on-line está temporariamente indisponível."}</p></div></main>;

 const t=data.tenant,contact=contactNumber(t.whatsapp||t.phone),insta=instagramHandle(instagram.username||t.instagram);
 const header=<header className="bk-top"><div className="bk-brand">{t.logo_url?<img src={t.logo_url} alt=""/>:<span>{initials(t.name)}</span>}<div><strong>{t.name}</strong><small>AGENDAMENTO ONLINE</small></div></div>{contact&&<a className="bk-top-wa" href={`https://wa.me/${contact}`} target="_blank" rel="noreferrer"><MessageCircle/>WhatsApp</a>}</header>;
 // Fundo: a capa da empresa (Configurações) ou a paisagem padrão.
 const background=<div className={"bk-bg"+(t.cover_url?" custom":"")} aria-hidden="true"><img src={t.cover_url||"/booking-landscape.webp"} alt="" fetchPriority="high"/></div>;
 const footer=<footer className="bk-foot">Agendamento por <b>RupControl</b></footer>;

 if(done){
  const doneContact=contactNumber(done.whatsapp||done.phone)||contact;
  return <main className="bk">{background}{header}<div className="bk-wrap"><section className="bk-card bk-done">
   <div className="bk-done-check"><Check/></div>
   <h1>Agendamento confirmado!</h1>
   <p>Seu horário está reservado. Confira os detalhes:</p>
   <div className="bk-review">
    <div className="bk-review-row"><Store/><div><small>Local</small><strong>{done.barbershop||t.name}</strong></div></div>
    <div className="bk-review-row"><ServiceArt name={selectedServices[0]?.name||done.service} src={selectedServices.length===1?selectedServices[0].image_url:null}/><div><small>Serviço</small><strong>{done.service}</strong></div></div>
    <div className="bk-review-row">{barber?<Avatar barber={barber}/>:<Store/>}<div><small>Profissional</small><strong>{done.barber}</strong></div></div>
    <div className="bk-review-row"><CalendarDays/><div><small>Data e horário</small><strong>{formatIn(tz,done.starts_at,{weekday:"long",day:"2-digit",month:"long",hour:"2-digit",minute:"2-digit"})}</strong></div></div>
   </div>
   <div className="bk-done-actions">
    {doneContact&&<a href={`https://wa.me/${doneContact}`} target="_blank" rel="noreferrer"><MessageCircle/>Falar pelo WhatsApp</a>}
    <button type="button" onClick={()=>{setDone(null);setView("pick");setForm(f=>({...f,slot:"",name:"",phone:"",email:""}))}}><CalendarDays/>Fazer outro agendamento</button>
   </div>
   <small className="bk-done-note"><ShieldCheck size={13}/> Precisa cancelar ou mudar o horário? Fale direto com o estabelecimento.</small>
  </section></div>{footer}</main>;
 }

 const current=view==="confirm"?3:!form.services.length?0:!form.barber?1:!form.slot?2:3;
 const ready=form.services.length&&form.barber&&form.slot;
 const nextFree=Object.keys(availability).filter(d=>availability[d]&&d>form.date).sort()[0];
 const visibleServices=allServices?services:services.slice(0,3);
 // Serviço escolhido que estaria escondido em "Ver todos" continua visível.
 const shownServices=allServices?services:[...visibleServices,...selectedServices.filter(x=>!visibleServices.includes(x))];
 const when=form.slot?formatIn(tz,form.slot,{weekday:"long",day:"2-digit",month:"long"})+" às "+formatIn(tz,form.slot,{hour:"2-digit",minute:"2-digit"}):"";

 return <main className="bk">
  {background}
  {header}
  <div className="bk-wrap">
   <section className="bk-card" ref={cardRef}>
    <div className="bk-head">{view==="confirm"&&<button type="button" className="bk-back" aria-label="Voltar" onClick={()=>show("pick")}><ArrowLeft/></button>}<h1>{view==="confirm"?"Confirmar agendamento":"Novo agendamento"}</h1></div>
    <ol className="bk-steps">{STEPS.map((label,i)=><li key={label} className={i===current?"current":i<current?"done":""}><span>{i<current?<Check/>:i+1}</span>{label}</li>)}</ol>

    {view==="pick"?<>
     {data.units.length>1&&<section className="bk-sec"><div className="bk-sec-head"><h2>Local</h2></div><div className="bk-chips">{data.units.map(u=><button type="button" key={u.id} className={"bk-chip"+(form.unit===u.id?" selected":"")} aria-pressed={form.unit===u.id} onClick={()=>chooseUnit(u.id)}>{u.name}</button>)}</div></section>}

     <section className="bk-sec">
      <div className="bk-sec-head"><h2>Escolha o serviço</h2>{services.length>3&&<button type="button" className="bk-link" onClick={()=>setAllServices(x=>!x)}>{allServices?"Ver menos":"Ver todos"}</button>}</div>
      {services.length===0?<p className="bk-empty">Nenhum serviço disponível no momento.</p>:<div className="bk-services">{shownServices.map(s=>{const on=form.services.includes(s.id);return <button type="button" key={s.id} className={"bk-service"+(on?" selected":"")} aria-pressed={on} onClick={()=>toggleService(s.id)}>
       <ServiceArt name={s.name} src={s.image_url}/>
       <span><strong>{s.name}</strong><small>{money(s.price_cents)} <i>· {s.duration} min</i></small></span>
       {on?<Check/>:<ChevronRight/>}
      </button>})}</div>}
      {services.length>1&&<p className="bk-hint">Pode escolher mais de um serviço.</p>}
     </section>

     <section className="bk-sec">
      <div className="bk-sec-head"><h2>Selecione o profissional</h2>{pros.length>4&&<button type="button" className="bk-link" onClick={()=>setAllPros(x=>!x)}>{allPros?"Ver menos":"Ver todos"}</button>}</div>
      {pros.length===0?<p className="bk-empty">{form.services.length>1?"Nenhum profissional faz todos esses serviços juntos. Tente tirar um deles.":"Nenhum profissional disponível para este serviço."}</p>:<div className={"bk-pros"+(allPros?" all":"")}>{pros.map(b=>{const on=form.barber===b.id;return <button type="button" key={b.id} className={"bk-pro"+(on?" selected":"")} aria-pressed={on} onClick={()=>chooseBarber(b.id)}>
       <Avatar barber={b} selected={on}/><strong>{firstName(b.name)}</strong><small>{b.is_owner?"Proprietário":"Profissional"}</small>
      </button>})}</div>}
     </section>

     <section className="bk-sec" ref={timeRef}>
      <div className="bk-sec-head"><h2>Escolha o horário</h2></div>
      <button type="button" className="bk-date" aria-expanded={calendarOpen} onClick={()=>setCalendarOpen(x=>!x)}><CalendarDays/><span>{longDate(form.date)}</span><ChevronRight className={calendarOpen?"open":""}/></button>
      {calendarOpen&&<Calendar month={month} setMonth={setMonth} selected={form.date} onSelect={chooseDate} availability={availability}/>}
      {!form.services.length||!form.barber?<p className="bk-empty bk-slots-note">Escolha o serviço e o profissional para ver os horários livres.</p>
       :looking?<p className="bk-empty bk-slots-note">Consultando horários...</p>
       :slots.length===0?<p className="bk-empty bk-slots-note">Nenhum horário livre neste dia.{nextFree&&<button type="button" onClick={()=>chooseDate(nextFree)}>Ver {shortDate(nextFree)}</button>}</p>
       :<div className="bk-slots">{slots.map(x=><button type="button" key={x.starts_at} className={form.slot===x.starts_at?"selected":""} aria-pressed={form.slot===x.starts_at} onClick={()=>setForm(f=>({...f,slot:x.starts_at}))}>{formatIn(tz,x.starts_at,{hour:"2-digit",minute:"2-digit"})}</button>)}</div>}
     </section>

     {error&&<p className="bk-alert">{error}</p>}
     <button type="button" className="bk-continue" disabled={!ready} onClick={()=>show("confirm")}>{ready?<>Continuar <ArrowRight/></>:!form.services.length?"Escolha o serviço":!form.barber?"Escolha o profissional":"Escolha o horário"}</button>
    </>:<form onSubmit={book}>
     <div className="bk-review">
      {selectedServices.map(s=><div className="bk-review-row" key={s.id}><ServiceArt name={s.name} src={s.image_url}/><div><small>Serviço</small><strong>{s.name}</strong></div></div>)}
      {barber&&<div className="bk-review-row"><Avatar barber={barber}/><div><small>Profissional</small><strong>{barber.name}</strong></div></div>}
      <div className="bk-review-row"><CalendarDays/><div><small>Data e horário</small><strong>{when}</strong></div></div>
     </div>
     <div className="bk-total"><span>Total · {totalDuration} min</span><strong>{money(totalPrice)}</strong></div>
     <section className="bk-sec">
      <div className="bk-sec-head"><h2>Seus dados</h2></div>
      <div className="bk-fields">
       <label>Nome<input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} required minLength="2" autoComplete="name" placeholder="Seu nome"/></label>
       <label>WhatsApp<input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} required type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999"/></label>
       <label>E-mail (opcional)<input value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} type="email" autoComplete="email" placeholder="voce@email.com"/></label>
      </div>
     </section>
     {error&&<p className="bk-alert">{error}</p>}
     <button className="bk-continue bk-submit" disabled={sending}>{sending?"Confirmando...":<>Confirmar agendamento <Check/></>}</button>
    </form>}
   </section>

   <aside className="bk-aside">
    {selectedServices.length>0&&<section className="bk-card bk-info bk-summary"><h3>Seu agendamento</h3>
     <small>Serviço</small><strong>{selectedServices.map(x=>x.name).join(" + ")}</strong>
     {barber&&<><small>Profissional</small><strong>{barber.name}</strong></>}
     {when&&<><small>Data e horário</small><strong>{when}</strong></>}
     <small>Total</small><strong>{money(totalPrice)} · {totalDuration} min</strong>
    </section>}
    <section className="bk-card bk-info">
     <h3>{t.name}</h3>
     {t.description&&<p>{t.description}</p>}
     {t.public_info&&<p>{t.public_info}</p>}
     {t.address&&<a href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(t.address)} target="_blank" rel="noreferrer"><MapPin/>{t.address}</a>}
     {contact&&<a href={`https://wa.me/${contact}`} target="_blank" rel="noreferrer"><MessageCircle/>Falar pelo WhatsApp</a>}
     {insta&&<a href={`https://www.instagram.com/${insta}`} target="_blank" rel="noreferrer"><Instagram/>@{insta}</a>}
     <span><ShieldCheck/>Horário confirmado na hora</span>
    </section>
    {instagram.items?.length>0&&<section className="bk-card bk-info"><h3>No Instagram</h3><div className="bk-insta-grid">{instagram.items.slice(0,6).map(x=><a href={x.permalink} target="_blank" rel="noreferrer" key={x.id}><img src={x.media_type==="VIDEO"?(x.thumbnail_url||x.media_url):x.media_url} alt={x.caption?.slice(0,80)||"Publicação no Instagram"} loading="lazy"/></a>)}</div></section>}
   </aside>
  </div>
  {footer}
 </main>;
}
