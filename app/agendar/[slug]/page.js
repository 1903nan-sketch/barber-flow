"use client";
import "../../booking-v2.css";
import {useCallback,useEffect,useMemo,useState} from "react";
import {useParams} from "next/navigation";
import {CalendarDays,Check,CheckCircle2,ChevronLeft,Clock,Instagram,MapPin,MessageCircle,Scissors,ShieldCheck,Store,UserRound,Users} from "lucide-react";
import {supabase} from "../../../lib/supabase";
import RuptixLogo from "../../_components/RuptixLogo";

const money=v=>(Number(v||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const waNumber=v=>{const n=String(v||"").replace(/\D/g,"");return n.length===10||n.length===11?"55"+n:n};
const handle=v=>String(v||"").replace(/^@/,"").replace(/\\/g,"").trim();
const todayKey=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)};
const maskPhone=v=>{const d=String(v||"").replace(/\D/g,"").slice(0,11);if(d.length<=2)return d;if(d.length<=7)return "("+d.slice(0,2)+") "+d.slice(2);return "("+d.slice(0,2)+") "+d.slice(2,d.length-4)+"-"+d.slice(-4)};
const REMEMBER="bt_booking_client";

export default function PublicBooking(){
 const {slug}=useParams();
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [step,setStep]=useState(0),[form,setForm]=useState({unit:"",services:[],barber:"",date:"",slot:null,name:"",phone:"",email:""});
 const [days,setDays]=useState([]),[daysLoading,setDaysLoading]=useState(false),[slots,setSlots]=useState([]),[slotsLoading,setSlotsLoading]=useState(false);
 const [sending,setSending]=useState(false),[done,setDone]=useState(null),[instagram,setInstagram]=useState({items:[],username:""});

 useEffect(()=>{
  if(!supabase){setError("Agenda temporariamente indisponível.");setLoading(false);return}
  supabase.rpc("public_booking_data",{p_slug:slug}).then(({data,error})=>{
   setData(data);setError(error?.message||"");setLoading(false);
   if(data?.state==="open")setForm(f=>({...f,unit:data.units?.length===1?data.units[0].id:""}));
  });
  fetch("/api/instagram/feed?slug="+encodeURIComponent(slug)).then(r=>r.json()).then(setInstagram).catch(()=>{});
  try{const saved=JSON.parse(localStorage.getItem(REMEMBER)||"null");if(saved)setForm(f=>({...f,name:saved.name||"",phone:saved.phone||"",email:saved.email||""}))}catch{}
  const c=new URLSearchParams(window.location.search).get("c");
  if(c&&/^[0-9a-f]{8,40}$/i.test(c))supabase.rpc("public_campaign_click",{p_token:c}).then(()=>{},()=>{});
 },[slug]);

 const multiUnit=(data?.units||[]).length>1;
 const steps=useMemo(()=>[...(multiUnit?["unit"]:[]),"services","barber","date","time","details","summary"],[multiUnit]);
 const current=steps[step]||"services";
 const services=data?.services||[];
 const selected=services.filter(s=>form.services.includes(s.id));
 const total=selected.reduce((s,x)=>s+Number(x.price_cents||0),0),duration=selected.reduce((s,x)=>s+Number(x.duration||0),0);
 const unit=(data?.units||[]).find(u=>u.id===form.unit);
 const barbers=useMemo(()=>(data?.barbers||[]).filter(b=>
  (data.barber_units||[]).some(x=>x.barber_id===b.id&&x.unit_id===form.unit)&&
  form.services.every(sid=>(data.barber_services||[]).some(x=>x.barber_id===b.id&&x.service_id===sid))),[data,form.unit,form.services]);
 const servicesForUnit=useMemo(()=>services.filter(s=>(data?.barbers||[]).some(b=>(data.barber_units||[]).some(x=>x.barber_id===b.id&&x.unit_id===form.unit)&&(data.barber_services||[]).some(x=>x.barber_id===b.id&&x.service_id===s.id))),[services,data,form.unit]);
 const deposit=data?.deposit?Math.min(total,data.deposit.mode==="fixed"?Number(data.deposit.fixed_cents||0):Math.round(total*Number(data.deposit.percent||0)/100)):0;

 const loadDays=useCallback(async()=>{
  if(!form.unit||!form.services.length||!form.barber)return;
  setDaysLoading(true);setDays([]);
  const {data:rows,error}=await supabase.rpc("public_available_days",{p_slug:slug,p_unit:form.unit,p_barber:form.barber==="any"?null:form.barber,p_services:form.services,p_from:todayKey(),p_days:21});
  setDaysLoading(false);
  if(error)return setError(error.message);
  setDays(rows||[]);
 },[slug,form.unit,form.services,form.barber]);

 const loadSlots=useCallback(async()=>{
  if(!form.date)return;
  setSlotsLoading(true);setSlots([]);
  let rows=[];
  if(form.barber==="any"){
   const {data,error}=await supabase.rpc("public_available_slots_any",{p_slug:slug,p_unit:form.unit,p_services:form.services,p_date:form.date});
   if(error)setError(error.message);
   const seen=new Map();for(const r of data||[])if(!seen.has(r.starts_at))seen.set(r.starts_at,r);
   rows=[...seen.values()];
  }else{
   const {data,error}=await supabase.rpc("public_available_slots_multi",{p_slug:slug,p_unit:form.unit,p_barber:form.barber,p_services:form.services,p_date:form.date});
   if(error)setError(error.message);
   rows=(data||[]).map(r=>({starts_at:r.starts_at||r,barber_id:form.barber,barber_name:""}));
  }
  setSlotsLoading(false);setSlots(rows);
 },[slug,form.unit,form.services,form.barber,form.date]);

 useEffect(()=>{if(current==="date")loadDays()},[current,loadDays]);
 useEffect(()=>{if(current==="time")loadSlots()},[current,loadSlots]);

 const go=key=>{setError("");setStep(Math.max(0,steps.indexOf(key)));window.scrollTo({top:0,behavior:"smooth"})};
 const next=()=>{setError("");setStep(s=>Math.min(steps.length-1,s+1));window.scrollTo({top:0,behavior:"smooth"})};
 const back=()=>{setError("");setStep(s=>Math.max(0,s-1))};
 const toggleService=id=>setForm(f=>({...f,services:f.services.includes(id)?f.services.filter(x=>x!==id):[...f.services,id],barber:"",date:"",slot:null}));

 async function confirm(){
  setSending(true);setError("");
  try{localStorage.setItem(REMEMBER,JSON.stringify({name:form.name,phone:form.phone,email:form.email}))}catch{}
  const {data:res,error}=await supabase.rpc("public_book_multi",{p_slug:slug,p_unit:form.unit,p_barber:form.slot.barber_id,p_services:form.services,p_starts_at:form.slot.starts_at,p_name:form.name.trim(),p_phone:form.phone,p_email:form.email.trim()});
  setSending(false);
  if(error){setError(error.message);if(/indispon/i.test(error.message)){setForm(f=>({...f,slot:null}));go("time")}return}
  if(res?.deposit_required){window.location.href=`/agendar/${slug}/sinal/${res.id}`;return}
  setDone(res);window.scrollTo({top:0,behavior:"smooth"});
 }

 if(loading)return <main className="bk"><div className="bk-done"><p style={{color:"#8d97aa"}}>Carregando agenda...</p></div></main>;
 if(error&&!data)return <main className="bk"><div className="bk-done"><Scissors size={40}/><h1>Não foi possível abrir esta agenda</h1><p style={{color:"#8d97aa"}}>{error}</p></div></main>;
 if(data?.state!=="open")return <main className="bk"><div className="bk-done"><Scissors size={40}/><h1>{data?.name||"Barbearia indisponível"}</h1><p style={{color:"#8d97aa"}}>{data?.state==="plan_unavailable"?"Esta barbearia ainda não oferece agendamento on-line.":"O agendamento on-line está temporariamente indisponível."}</p></div></main>;

 const t=data.tenant,contact=waNumber(t.whatsapp||t.phone),insta=handle(t.instagram);
 const header=<header className="bk-hero">{t.cover_url&&<img className="bk-cover" src={t.cover_url} alt="" fetchPriority="high"/>}
  <div className="bk-hero-in">{t.logo_url?<img className="bk-logo" src={t.logo_url} alt={"Logo "+t.name}/>:<span className="bk-logo"><Scissors/></span>}
   <div style={{minWidth:0}}><h1>{t.name}</h1>{t.description&&<p>{t.description}</p>}
    <div className="bk-links">{t.address&&<a className="bk-chip" href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(t.address)} target="_blank" rel="noreferrer"><MapPin size={13}/><span>{t.address}</span></a>}
     {insta&&<a className="bk-chip" href={"https://www.instagram.com/"+insta} target="_blank" rel="noreferrer"><Instagram size={13}/><span>@{insta}</span></a>}
     {contact&&<a className="bk-chip" href={"https://wa.me/"+contact} target="_blank" rel="noreferrer"><MessageCircle size={13}/><span>WhatsApp</span></a>}</div></div></div></header>;

 if(done){
  const when=new Date(done.starts_at);
  return <main className="bk">{header}<section className="bk-done">
   <div className="bk-ok"><CheckCircle2 size={40}/></div>
   <h1>Horário confirmado!</h1>
   <p style={{color:"#b8c0cf",margin:0}}>Te esperamos, {form.name.split(" ")[0]}.</p>
   <div className="bk-card bk-summary" style={{textAlign:"left"}}>
    <div><span>Serviço</span><b>{done.service}</b></div>
    <div><span>Profissional</span><b>{done.barber}</b></div>
    <div><span>Data</span><b>{when.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})}</b></div>
    <div><span>Horário</span><b>{when.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</b></div>
    {multiUnit&&<div><span>Unidade</span><b>{done.unit}</b></div>}
    <div className="bk-total"><span>Total</span><b>{money(done.price_cents)}</b></div>
   </div>
   <p style={{color:"#8d97aa",fontSize:12.5,margin:0}}><ShieldCheck size={13}/> Você receberá a confirmação e um lembrete pelo WhatsApp. Para alterar ou cancelar, responda a mensagem ou fale com a barbearia.</p>
   {contact&&<a className="bk-cta green" href={"https://wa.me/"+contact} target="_blank" rel="noreferrer"><MessageCircle size={17}/>Falar com a barbearia</a>}
   <button type="button" className="bk-cta ghost" onClick={()=>{setDone(null);setForm(f=>({...f,services:[],barber:"",date:"",slot:null}));setStep(0)}}><CalendarDays size={17}/>Fazer outro agendamento</button>
  </section><p className="bk-foot">Agendamento por <b>BarberTix</b> · <RuptixLogo className="ruptix-logo-small"/></p></main>;
 }

 const titles={unit:["Escolha a unidade","Onde você quer ser atendido"],services:["Escolha o serviço","Você pode selecionar mais de um"],barber:["Escolha o profissional","Ou deixe que a gente escolha"],date:["Escolha a data","Dias com horários livres"],time:["Escolha o horário",form.date?new Date(form.date+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"}):""],details:["Seus dados","Sem cadastro e sem senha"],summary:["Confira e confirme","Revise antes de agendar"]};
 const canNext={unit:Boolean(form.unit),services:form.services.length>0,barber:Boolean(form.barber),date:Boolean(form.date),time:Boolean(form.slot),details:form.name.trim().length>=2&&form.phone.replace(/\D/g,"").length>=10,summary:true}[current];
 const chosenBarber=barbers.find(b=>b.id===form.barber);
 const barberName=form.barber==="any"?(form.slot?.barber_name||"Qualquer profissional"):chosenBarber?.name;

 return <main className="bk">{header}
  <div className="bk-main">
   <div className="bk-progress" aria-hidden="true">{steps.map((s,i)=><span key={s} className={i<=step?"on":""}/>)}</div>
   <div className="bk-head">{step>0&&<button type="button" className="bk-back" onClick={back} aria-label="Voltar"><ChevronLeft size={18}/></button>}<div><h2>{titles[current][0]}</h2><small>{titles[current][1]}</small></div></div>
   {error&&<div className="bk-error" role="alert">{error}</div>}

   {current==="unit"&&<div className="bk-list">{data.units.map(u=><button type="button" key={u.id} className={"bk-option "+(form.unit===u.id?"sel":"")} onClick={()=>{setForm(f=>({...f,unit:u.id,services:[],barber:"",date:"",slot:null}));next()}}><span className="bk-ico"><Store size={20}/></span><div><b>{u.name}</b></div><span className="bk-check"><Check size={14}/></span></button>)}</div>}

   {current==="services"&&(servicesForUnit.length===0?<div className="bk-empty">Nenhum serviço disponível para agendamento on-line nesta unidade.</div>:
    <div className="bk-list two">{servicesForUnit.map(s=><button type="button" key={s.id} className={"bk-option "+(form.services.includes(s.id)?"sel":"")} onClick={()=>toggleService(s.id)} aria-pressed={form.services.includes(s.id)}><span className="bk-ico"><Scissors size={19}/></span><div><b>{s.name}</b><small>{s.duration} min{s.description?" · "+s.description:""}</small></div><span className="bk-price">{money(s.price_cents)}</span><span className="bk-check"><Check size={14}/></span></button>)}</div>)}

   {current==="barber"&&<div className="bk-list two">
    {barbers.length>1&&<button type="button" className={"bk-option "+(form.barber==="any"?"sel":"")} onClick={()=>{setForm(f=>({...f,barber:"any",date:"",slot:null}));next()}}><span className="bk-ico"><Users size={20}/></span><div><b>Qualquer profissional</b><small>Mostra mais horários livres</small></div><span className="bk-check"><Check size={14}/></span></button>}
    {barbers.map(b=><button type="button" key={b.id} className={"bk-option "+(form.barber===b.id?"sel":"")} onClick={()=>{setForm(f=>({...f,barber:b.id,date:"",slot:null}));next()}}><span className="bk-ico">{b.photo_url?<img src={b.photo_url} alt=""/>:<UserRound size={20}/>}</span><div><b>{b.name}</b></div><span className="bk-check"><Check size={14}/></span></button>)}
    {barbers.length===0&&<div className="bk-empty">Nenhum profissional realiza todos os serviços escolhidos. Volte e ajuste a seleção.</div>}
   </div>}

   {current==="date"&&(daysLoading?<div className="bk-empty">Consultando a agenda...</div>:days.every(d=>!d.slots)?<div className="bk-empty">Sem horários livres nos próximos dias. {contact&&<a href={"https://wa.me/"+contact} style={{color:"#b8a5ff"}}>Fale com a barbearia</a>}</div>:
    <div className="bk-dates">{days.map(d=>{const x=new Date(d.day+"T12:00:00");return <button type="button" key={d.day} className={"bk-date "+(form.date===d.day?"sel":"")} disabled={!d.slots} onClick={()=>{setForm(f=>({...f,date:d.day,slot:null}));next()}}><small>{d.day===todayKey()?"Hoje":x.toLocaleDateString("pt-BR",{weekday:"short"}).replace(".","")}</small><b>{x.getDate()}</b><i>{d.slots?d.slots+" livres":"lotado"}</i></button>})}</div>)}

   {current==="time"&&(slotsLoading?<div className="bk-empty">Buscando horários...</div>:slots.length===0?<div className="bk-empty">Este dia acabou de lotar. Volte e escolha outra data.</div>:
    <div className="bk-times">{slots.map(s=><button type="button" key={s.starts_at+s.barber_id} className={"bk-time "+(form.slot?.starts_at===s.starts_at?"sel":"")} onClick={()=>setForm(f=>({...f,slot:{...s,barber_name:s.barber_name||chosenBarber?.name||""}}))}>{new Date(s.starts_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</button>)}</div>)}

   {current==="details"&&<form onSubmit={e=>{e.preventDefault();if(canNext)next()}}>
    <label className="bk-field">Nome<input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} autoComplete="name" placeholder="Seu nome" required minLength={2}/></label>
    <label className="bk-field">WhatsApp<input value={form.phone} onChange={e=>setForm(f=>({...f,phone:maskPhone(e.target.value)}))} inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" required/></label>
    <label className="bk-field">E-mail <span style={{color:"#8d97aa",fontWeight:500}}>(opcional)</span><input value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} type="email" autoComplete="email" placeholder="voce@email.com"/></label>
    <button type="submit" hidden/>
   </form>}

   {current==="summary"&&<div style={{display:"grid",gap:12}}>
    <div className="bk-card bk-summary">
     {multiUnit&&<div><span>Unidade</span><b>{unit?.name}</b></div>}
     <div><span>Serviço</span><b>{selected.map(s=>s.name).join(" + ")}</b></div>
     <div><span>Profissional</span><b>{barberName}</b></div>
     <div><span>Data</span><b>{form.slot&&new Date(form.slot.starts_at).toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})}</b></div>
     <div><span>Horário</span><b>{form.slot&&new Date(form.slot.starts_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})} · {duration} min</b></div>
     <div><span>Nome</span><b>{form.name}</b></div>
     <div><span>WhatsApp</span><b>{form.phone}</b></div>
     <div className="bk-total"><span>Total</span><b>{money(total)}</b></div>
    </div>
    {deposit>0&&<div className="bk-note"><b>Sinal de {money(deposit)} via PIX.</b> Ao confirmar, o horário fica reservado por {data.deposit.timeout_minutes} minutos aguardando o pagamento. O valor é descontado no dia do atendimento.</div>}
   </div>}

   {current==="services"&&instagram.items?.length>0&&<section style={{marginTop:26}}><div className="bk-head"><Instagram size={18}/><div><h2 style={{fontSize:15}}>Últimos trabalhos</h2><small>@{instagram.username||insta}</small></div></div><div className="bk-insta">{instagram.items.slice(0,6).map(x=><a href={x.permalink} target="_blank" rel="noreferrer" key={x.id}><img src={x.media_type==="VIDEO"?(x.thumbnail_url||x.media_url):x.media_url} alt={x.caption?.slice(0,80)||"Publicação"} loading="lazy"/></a>)}</div></section>}
   <p className="bk-foot">Agendamento por <b>BarberTix</b></p>
  </div>

  {(current==="services"||current==="time"||current==="details"||current==="summary")&&<div className="bk-bar"><div className="bk-bar-in">
   <div><small>{selected.length?selected.length+" serviço"+(selected.length>1?"s":"")+" · "+duration+" min":"Nenhum serviço"}</small><strong>{money(total)}</strong></div>
   {current==="summary"?<button type="button" className="bk-cta green" disabled={sending} onClick={confirm}><CheckCircle2 size={18}/>{sending?"Confirmando...":deposit>0?"Reservar e pagar sinal":"Confirmar agendamento"}</button>:
    <button type="button" className="bk-cta" disabled={!canNext} onClick={next}>{current==="time"&&form.slot?<><Clock size={16}/>Continuar</>:"Continuar"}</button>}
  </div></div>}
 </main>;
}
