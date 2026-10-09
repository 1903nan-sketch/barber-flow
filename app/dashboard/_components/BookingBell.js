"use client";
import {useEffect,useRef,useState} from "react";
import {Bell,BellOff,CalendarCheck,X} from "lucide-react";
import {supabase} from "../../../lib/supabase";

const SOUND_KEY="rupcontrol_booking_sound",POLL_MS=30000;
let audio=null;

// Campainha de duas notas gerada no navegador (sem arquivo de áudio).
function chime(){
 try{
  audio=audio||new (window.AudioContext||window.webkitAudioContext)();
  if(audio.state==="suspended")audio.resume();
  const t=audio.currentTime;
  [[880,0],[1318.5,.16]].forEach(([freq,delay])=>{
   const osc=audio.createOscillator(),gain=audio.createGain();
   osc.type="sine";osc.frequency.value=freq;
   gain.gain.setValueAtTime(0,t+delay);
   gain.gain.linearRampToValueAtTime(.28,t+delay+.02);
   gain.gain.exponentialRampToValueAtTime(.001,t+delay+.9);
   osc.connect(gain).connect(audio.destination);osc.start(t+delay);osc.stop(t+delay+.95);
  });
 }catch{}
}

// O navegador só libera som depois de um toque/clique na página.
function unlockAudio(){try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();if(audio.state==="suspended")audio.resume()}catch{}}

const when=iso=>new Date(iso).toLocaleString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});

// Confere novos agendamentos a cada 30 s. Quando chega um (feito pelo site,
// WhatsApp ou outro usuário), toca a campainha, mostra o aviso e avisa a tela
// inicial para atualizar a agenda.
export default function BookingBell({workspace}){
 const tenantId=workspace.tenant?.id,userId=workspace.user?.id,[sound,setSound]=useState(true),[toasts,setToasts]=useState([]),cursor=useRef(null);
 useEffect(()=>{try{setSound(localStorage.getItem(SOUND_KEY)!=="0")}catch{}},[]);
 useEffect(()=>{
  const once=()=>unlockAudio();
  window.addEventListener("pointerdown",once,{once:true});window.addEventListener("keydown",once,{once:true});
  return()=>{window.removeEventListener("pointerdown",once);window.removeEventListener("keydown",once)};
 },[]);
 useEffect(()=>{
  if(!tenantId)return;
  let alive=true,timer=null;
  async function start(){
   // Começa do agendamento mais recente que já existe: só avisa o que chegar depois.
   const {data}=await supabase.from("appointments").select("created_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(1);
   if(!alive)return;
   cursor.current=data?.[0]?.created_at||new Date().toISOString();
   timer=setInterval(check,POLL_MS);
  }
  async function check(){
   const {data,error}=await supabase.from("appointments").select("id,starts_at,created_at,created_by,client_id,service_id,status").eq("tenant_id",tenantId).gt("created_at",cursor.current).order("created_at").limit(20);
   if(!alive||error||!data?.length)return;
   cursor.current=data[data.length-1].created_at;
   const fresh=data.filter(x=>x.status!=="cancelled"&&x.created_by!==userId);
   if(!fresh.length)return;
   const ids=k=>[...new Set(fresh.map(x=>x[k]).filter(Boolean))];
   const [c,s]=await Promise.all([
    ids("client_id").length?supabase.from("clients").select("id,name").in("id",ids("client_id")):{data:[]},
    ids("service_id").length?supabase.from("services").select("id,name").in("id",ids("service_id")):{data:[]}
   ]);
   if(!alive)return;
   const items=fresh.map(x=>({id:x.id,client:c.data?.find(y=>y.id===x.client_id)?.name||"Cliente",service:s.data?.find(y=>y.id===x.service_id)?.name||"Atendimento",when:when(x.starts_at)}));
   setToasts(t=>[...items,...t].slice(0,3));
   window.dispatchEvent(new CustomEvent("rupcontrol:new-booking"));
   let on=true;try{on=localStorage.getItem(SOUND_KEY)!=="0"}catch{}
   if(on){
    chime();
    if(document.hidden&&"Notification" in window&&Notification.permission==="granted"){
     for(const x of items)new Notification("Novo agendamento",{body:`${x.client} · ${x.service} · ${x.when}`,tag:"booking-"+x.id});
    }
   }
  }
  start();
  return()=>{alive=false;clearInterval(timer)};
 },[tenantId,userId]);
 useEffect(()=>{if(!toasts.length)return;const t=setTimeout(()=>setToasts(v=>v.slice(0,-1)),15000);return()=>clearTimeout(t)},[toasts]);

 function toggle(){
  const next=!sound;setSound(next);
  try{localStorage.setItem(SOUND_KEY,next?"1":"0")}catch{}
  if(next){unlockAudio();chime();if("Notification" in window&&Notification.permission==="default")Notification.requestPermission().catch(()=>{})}
 }

 return <>
  <button type="button" className={"booking-bell"+(sound?" on":"")} onClick={toggle} title={sound?"Som de novos agendamentos ligado":"Som de novos agendamentos desligado"} aria-pressed={sound}>
   {sound?<Bell size={17}/>:<BellOff size={17}/>}<span>{sound?"Som ligado":"Som desligado"}</span>
  </button>
  {toasts.length>0&&<div className="booking-toasts" role="status" aria-live="polite">
   {toasts.map(x=><div key={x.id} className="booking-toast">
    <span className="booking-toast-icon"><CalendarCheck size={18}/></span>
    <div><strong>Novo agendamento</strong><small>{x.client} · {x.service}</small><small>{x.when}</small><a href="/dashboard/agenda">Ver na agenda</a></div>
    <button type="button" aria-label="Fechar" onClick={()=>setToasts(v=>v.filter(y=>y.id!==x.id))}><X size={15}/></button>
   </div>)}
  </div>}
 </>;
}
