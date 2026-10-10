"use client";
import {notify} from "../../../../lib/notify";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {CalendarPlus} from "lucide-react";
import {supabase} from "../../../../lib/supabase";
import {useClientDebts} from "../../../../lib/client-debts";
import {validPhone} from "../../../../lib/phone";
import ModuleShell from "../../_components/ModuleShell";
import ClientPicker from "../../_components/ClientPicker";

function NewAppointment({workspace}){
 const router=useRouter(),t=workspace.tenant.id;
 const minLocal=(()=>{const d=new Date(Date.now()-new Date().getTimezoneOffset()*60000);return d.toISOString().slice(0,16)})()
 const [clients,setClients]=useState([]),[barbers,setBarbers]=useState([]),[services,setServices]=useState([]),[units,setUnits]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[client,setClient]=useState(null);
 const debts=useClientDebts(supabase,t);
 useEffect(()=>{Promise.all([
  supabase.from("clients").select("id,name,phone,whatsapp").eq("tenant_id",t).order("name"),
  supabase.from("barbers").select("id,name").eq("tenant_id",t).eq("active",true).order("name"),
  supabase.from("services").select("id,name,price_cents").eq("tenant_id",t).eq("active",true).order("name"),
  supabase.from("units").select("id,name").eq("tenant_id",t).eq("active",true).order("name")
 ]).then(([c,b,s,u])=>{setClients(c.data||[]);setBarbers(b.data||[]);setServices(s.data||[]);setUnits(u.data||[])})},[t]);
 async function submit(e){
  e.preventDefault();if(busy)return;setError("");
  if(!client)return setError("Escolha o cliente ou cadastre um novo.");
  if(!client.id&&(String(client.name||"").trim().length<2||!validPhone(client.phone)))return setError("Informe o nome e o celular completo do cliente (ex.: 11 91234-5678).");
  const f=new FormData(e.currentTarget),st=new Date(f.get("scheduled_at")).toISOString();
  setBusy(true);
  let clientId=client.id;
  if(!clientId){const {data,error}=await supabase.rpc("quick_client",{t,p_name:client.name,p_phone:client.phone});if(error){setBusy(false);return setError(error.message)}clientId=data}
  const {error}=await supabase.rpc("book_appointment",{t,u:f.get("unit_id"),b:f.get("barber_id"),c:clientId,s:f.get("service_id"),st,existing_id:null});
  setBusy(false);if(error)return setError(error.message);notify("Agendamento criado com sucesso.");router.push("/dashboard/agenda");router.refresh()
 }
 return <form className="box form new-appointment" onSubmit={submit}>
  <div className="form-field wide"><span className="form-label">Cliente</span><ClientPicker clients={clients} debts={debts.byClient} value={client} onChange={setClient}/></div>
  <div className="form-grid">
   <label>Profissional<select name="barber_id" required defaultValue=""><option value="">Selecione</option>{barbers.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label>
   <label>Serviço<select name="service_id" required defaultValue=""><option value="">Selecione</option>{services.map(x=><option value={x.id} key={x.id}>{x.name} - {(x.price_cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</option>)}</select></label>
   <label>Unidade<select name="unit_id" required key={units.length} defaultValue={units.length===1?units[0].id:""}><option value="">Selecione</option>{units.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label>
   <label>Data e horário<input name="scheduled_at" type="datetime-local" min={minLocal} required/></label>
  </div>{error&&<div className="form-alert error">{error}</div>}<button className="primary form-submit" disabled={busy}><CalendarPlus size={17}/>{busy?"Salvando...":"Salvar agendamento"}</button></form>
}
export default function NewAppointmentPage(){return <ModuleShell title="Novo agendamento" eyebrow="Agenda">{workspace=><NewAppointment workspace={workspace}/>}</ModuleShell>}
