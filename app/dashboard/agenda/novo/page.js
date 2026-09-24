"use client";
import {notify} from "../../../../lib/notify";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {CalendarPlus} from "lucide-react";
import {supabase} from "../../../../lib/supabase";
import ModuleShell from "../../_components/ModuleShell";

function NewAppointment({workspace}){
 const router=useRouter(),t=workspace.tenant.id;
 const [clients,setClients]=useState([]),[barbers,setBarbers]=useState([]),[services,setServices]=useState([]),[units,setUnits]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{Promise.all([
  supabase.from("clients").select("id,name").eq("tenant_id",t).order("name"),
  supabase.from("barbers").select("id,name").eq("tenant_id",t).eq("active",true).order("name"),
  supabase.from("services").select("id,name,price_cents").eq("tenant_id",t).eq("active",true).order("name"),
  supabase.from("units").select("id,name").eq("tenant_id",t).eq("active",true).order("name")
 ]).then(([c,b,s,u])=>{setClients(c.data||[]);setBarbers(b.data||[]);setServices(s.data||[]);setUnits(u.data||[])})},[t]);
 async function submit(e){e.preventDefault();setBusy(true);setError("");const f=new FormData(e.currentTarget),local=f.get("scheduled_at");const st=new Date(local).toISOString();const {error}=await supabase.rpc("book_appointment",{t,u:f.get("unit_id"),b:f.get("barber_id"),c:f.get("client_id"),s:f.get("service_id"),st,existing_id:null});setBusy(false);if(error)return setError(error.message);notify("Agendamento criado com sucesso.");router.push("/dashboard/agenda");router.refresh()}
 return <form className="box form" onSubmit={submit}><div className="form-grid">
  <label>Cliente<select name="client_id" required defaultValue=""><option value="">Selecione</option>{clients.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label>
  <label>Barbeiro<select name="barber_id" required defaultValue=""><option value="">Selecione</option>{barbers.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label>
  <label>Serviço<select name="service_id" required defaultValue=""><option value="">Selecione</option>{services.map(x=><option value={x.id} key={x.id}>{x.name} - {(x.price_cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</option>)}</select></label>
  <label>Unidade<select name="unit_id" required defaultValue=""><option value="">Selecione</option>{units.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label>
  <label>Data e horário<input name="scheduled_at" type="datetime-local" required/></label>
 </div>{error&&<div className="form-alert error">{error}</div>}<button className="primary form-submit" disabled={busy}><CalendarPlus size={17}/>{busy?"Salvando...":"Salvar agendamento"}</button></form>
}
export default function NewAppointmentPage(){return <ModuleShell title="Novo agendamento" eyebrow="Agenda">{workspace=><NewAppointment workspace={workspace}/>}</ModuleShell>}
