"use client";
import {notify} from "../../../lib/notify";
import {useCallback,useEffect,useMemo,useState} from "react";
import {CalendarCheck2,Camera,Check,Pencil,Plus,Trash2,UserRound,X} from "lucide-react";
import {supabase} from "../../../lib/supabase";
import {uploadMedia} from "../../../lib/image-file";
import {formatPhone} from "../../../lib/phone";
import PhoneInput from "../../_components/PhoneInput";
import ModuleShell from "../_components/ModuleShell";

const roles={owner:"Proprietário",manager:"Gerente",reception:"Recepção",attendant:"Atendente",barber:"Profissional"};
const initials=name=>String(name||"?").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();

async function teamPatch(body){
 const {data:{session}}=await supabase.auth.getSession();
 const r=await fetch("/api/team",{method:"PATCH",headers:{"content-type":"application/json",Authorization:`Bearer ${session?.access_token||""}`},body:JSON.stringify(body)});
 const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"Não foi possível atualizar o perfil.");return j;
}

// Editar nome, WhatsApp e foto. A foto aparece no site de agendamento.
function EditMember({workspace,member,barber,close,saved}){
 const [photo,setPhoto]=useState(barber?.photo_url||""),[name,setName]=useState(member.name||""),[whatsapp,setWhatsapp]=useState(formatPhone(member.whatsapp)),[busy,setBusy]=useState(""),[error,setError]=useState("");
 async function pick(e){const file=e.target.files?.[0];e.target.value="";if(!file)return;setBusy("photo");setError("");try{setPhoto(await uploadMedia(supabase,workspace.tenant.id,"professional_photo",file))}catch(err){setError(err.message)}finally{setBusy("")}}
 async function save(e){e.preventDefault();if(busy)return;setBusy("save");setError("");try{await teamPatch({tenant_id:workspace.tenant.id,user_id:member.user_id,profile:true,name,whatsapp,photo_url:photo});notify("Perfil atualizado.");saved()}catch(err){setError(err.message);setBusy("")}}
 return <div className="checkout-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)close()}}><form className="checkout-modal team-edit" onSubmit={save}>
  <button type="button" className="checkout-close" onClick={close} aria-label="Fechar"><X/></button>
  <p className="eyebrow">EQUIPE</p><h2>Editar perfil</h2>
  <div className="team-photo">
   <label className="team-photo-pic">{photo?<img src={photo} alt=""/>:<span>{initials(name)}</span>}<i><Camera size={15}/></i><input type="file" accept="image/*" hidden disabled={!!busy} onChange={pick}/></label>
   <div><strong>Foto de perfil</strong><small>{barber?"Aparece no site de agendamento. Use uma foto do rosto, de frente.":"Identifica o perfil no sistema."}</small>
    <div className="team-photo-actions"><label className="secondary-action"><Camera size={14}/>{busy==="photo"?"Enviando...":photo?"Trocar foto":"Escolher foto"}<input type="file" accept="image/*" hidden disabled={!!busy} onChange={pick}/></label>{photo&&<button type="button" className="secondary-action" disabled={!!busy} onClick={()=>setPhoto("")}><Trash2 size={14}/>Remover</button>}</div>
   </div>
  </div>
  <div className="quick-sale-form"><label className="wide">Nome<input value={name} onChange={e=>setName(e.target.value)} required minLength={2} maxLength={80}/></label><label className="wide">WhatsApp<PhoneInput value={whatsapp} onChange={setWhatsapp}/></label></div>
  {error&&<div className="form-alert error">{error}</div>}
  <button className="primary checkout-confirm" disabled={!!busy}><Check size={16}/>{busy==="save"?"Salvando...":"Salvar perfil"}</button>
 </form></div>;
}

function TeamContent({workspace}){
 const [items,setItems]=useState([]),[barbers,setBarbers]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[error,setError]=useState(""),[editing,setEditing]=useState(null);
 const owner=workspace.membership?.role==="owner",starter=String(workspace.tenant?.plans?.name||"").toLowerCase()==="starter";
 const limit=Number(workspace.tenant?.plans?.max_profiles||0);
 const used=useMemo(()=>items.filter(x=>x.active&&x.role!=="owner").length,[items]);
 const barberOf=id=>barbers.find(b=>b.user_id===id);

 const load=useCallback(async()=>{
  setLoading(true);
  const [m,b]=await Promise.all([
   supabase.from("memberships").select("*").eq("tenant_id",workspace.tenant.id).order("name"),
   supabase.from("barbers").select("id,user_id,active,photo_url").eq("tenant_id",workspace.tenant.id)
  ]);
  setItems(m.data||[]);setBarbers(b.data||[]);setError(m.error?.message||b.error?.message||"");
  setLoading(false);
 },[workspace.tenant.id]);

 useEffect(()=>{load()},[load]);

 async function toggleProvider(member){
  const next=!barberOf(member.user_id)?.active;setBusy(member.user_id);setError("");
  try{await teamPatch({tenant_id:workspace.tenant.id,user_id:member.user_id,is_provider:next});await load()}
  catch(e){setError(e.message)}finally{setBusy("")}
 }

 return <><section className="box">
  <div className="module-toolbar"><div><h2>Equipe e acessos</h2><p>{used} de {limit} perfis adicionais usados · o proprietário não entra nesse limite</p></div></div>
  {error&&<div className="form-alert error">{error}</div>}
  {loading?<p className="empty">Carregando...</p>:<div className="data-list team-list">{items.map(x=>{const b=barberOf(x.user_id),bookable=!!b?.active;return <article key={x.user_id}>
   <span className="team-avatar">{b?.photo_url?<img src={b.photo_url} alt=""/>:x.name?initials(x.name):<UserRound size={16}/>}</span>
   <div><strong>{x.name}</strong><small>{roles[x.role]||x.role}{x.whatsapp?" · "+formatPhone(x.whatsapp):""}</small><small>{starter?"Plano Starter · sem agenda":bookable?"Aparece como profissional na agenda e no site":"Somente acesso ao sistema"}</small></div>
   <div className="team-tags"><span className={`pill ${x.active?"confirmed":""}`}>{x.active?"ativo":"inativo"}</span>{!starter&&<span className={`pill ${bookable?"confirmed":""}`}>{bookable?"na agenda":"fora da agenda"}</span>}</div>
   {owner&&<div className="team-actions"><button className="secondary-action" type="button" onClick={()=>setEditing(x)}><Pencil size={14}/>Editar</button>{!starter&&x.active&&<button className="secondary-action" type="button" disabled={busy===x.user_id} onClick={()=>toggleProvider(x)}><CalendarCheck2 size={14}/>{busy===x.user_id?"Salvando...":bookable?"Não atender":"Atende clientes"}</button>}</div>}
  </article>})}</div>}
 </section>
 {editing&&<EditMember workspace={workspace} member={editing} barber={barberOf(editing.user_id)} close={()=>setEditing(null)} saved={()=>{setEditing(null);load()}}/>}
 </>;
}

export default function TeamPage(){
 return <ModuleShell title="Equipe" eyebrow="Acessos" action={workspace=>{
  if(workspace?.membership?.role!=="owner")return null;
  const limit=Number(workspace?.tenant?.plans?.max_profiles||0);
  return <a className="primary" href="/dashboard/barbeiros/novo"><Plus size={18}/> Novo perfil ({limit} máx.)</a>
 }}>{workspace=><TeamContent workspace={workspace}/>}</ModuleShell>
}
