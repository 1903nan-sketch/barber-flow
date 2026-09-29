"use client";
import {notify} from "../../../../lib/notify";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {Save,Camera,UserRound,CalendarCheck2} from "lucide-react";
import {supabase} from "../../../../lib/supabase";
import ModuleShell from "../../_components/ModuleShell";

const permissions=[
 ["agenda","Agenda"],["booking","Agendamentos"],["clients","Clientes"],["services","Serviços"],
 ["team","Equipe"],["finance","Financeiro"],["inventory","Estoque"],["sales","Vendas"],
 ["reports","Relatórios"],["settings","Configurações"],["audit","Auditoria"]
];

function NewMemberForm({tenant}){
 const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState(""),[photo,setPhoto]=useState(""),[role,setRole]=useState("barber"),[provider,setProvider]=useState(true);
 const starter=String(tenant?.plans?.name||"").toLowerCase()==="starter";
 const limit=Number(tenant?.plans?.max_profiles||0);

 async function uploadPhoto(e){
  const file=e.target.files?.[0];if(!file)return;setBusy(true);setError("");
  try{
   const {data:{session}}=await supabase.auth.getSession();
   if(!session?.access_token)throw new Error("Sessão expirada. Entre novamente.");
   const body=new FormData();body.append("file",file);body.append("tenant_id",tenant.id);body.append("field","professional_photo");
   const res=await fetch("/api/media/upload",{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`},body});
   const out=await res.json();if(!res.ok)throw new Error(out.error||"Não foi possível enviar a foto.");setPhoto(out.url);
  }catch(err){setError(err.message||"Não foi possível enviar a foto.")}finally{setBusy(false)}
 }

 function changeRole(value){
  setRole(value);
  if(starter)setProvider(false);
  else setProvider(value==="barber");
 }

 async function submit(e){
  e.preventDefault();setBusy(true);setError("");
  try{
   const f=new FormData(e.currentTarget),{data:{session}}=await supabase.auth.getSession();
   const res=await fetch("/api/team",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session?.access_token||""}`},body:JSON.stringify({
    tenant_id:tenant.id,name:f.get("name"),username:f.get("username"),password:f.get("password"),role,
    whatsapp:f.get("whatsapp"),photo_url:photo,permissions:f.getAll("permissions"),is_provider:starter?false:provider
   })});
   const out=await res.json();
   if(!res.ok)throw new Error(out.error||"Não foi possível criar o funcionário.");
   notify("Funcionário criado e vinculado com sucesso.");router.push("/dashboard/barbeiros");
  }catch(err){setError(err.message||"Não foi possível criar o funcionário.")}finally{setBusy(false)}
 }

 return <form className="box form staff-form" onSubmit={submit}>
  <div className="staff-photo-upload"><div className="staff-photo-preview">{photo?<img src={photo} alt="Foto do profissional"/>:<UserRound/>}</div><div><strong>Foto de perfil</strong><p>{provider&&!starter?"Pode aparecer na equipe e na página de agendamento.":"Usada apenas para identificar o perfil no sistema."}</p><label className="secondary-action"><Camera size={16}/>Escolher foto<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadPhoto} hidden/></label></div></div>

  <div className="form-grid">
   <label>Nome<input name="name" required placeholder="Nome do funcionário"/></label>
   <label>Usuário de acesso<div className="username-field"><span>@</span><input name="username" required minLength="3" placeholder="anthony01"/></div></label>
   <label>Senha de acesso<input name="password" type="password" required minLength="6" placeholder="Mínimo 6 caracteres"/></label>
   <label>WhatsApp do funcionário<input name="whatsapp" type="tel" inputMode="tel" placeholder="(11) 99999-9999"/></label>
   <label>Função<select name="role" required value={role} onChange={e=>changeRole(e.target.value)}><option value="barber">Barbeiro</option><option value="reception">Recepção</option><option value="attendant">Atendente</option><option value="manager">Gerente</option></select></label>
  </div>

  <label className="check-line" style={{marginTop:12}}>
   <input type="checkbox" checked={!starter&&provider} disabled={starter} onChange={e=>setProvider(e.target.checked)}/>
   <span><strong>Atende clientes e aparece na agenda</strong><small style={{display:"block"}}>{starter?"O Starter não inclui agendamento.":provider?"Este perfil será um profissional agendável.":"Este perfil terá acesso ao sistema, mas não aparecerá para agendamento."}</small></span>
  </label>

  <fieldset className="permissions"><legend>Permissões no sistema</legend>{permissions.map(([value,label])=><label key={value}><input type="checkbox" name="permissions" value={value} defaultChecked={starter?["clients","sales","reports"].includes(value):["agenda","booking","clients"].includes(value)}/>{label}</label>)}</fieldset>

  <p className="form-hint"><strong>Limite do plano:</strong> proprietário + {limit} {limit===1?"perfil adicional":"perfis adicionais"}. Cargo e agenda são independentes: recepção/atendente não aparecem na agenda a menos que você marque a opção acima.</p>
  {error&&<div className="form-alert error">{error}</div>}
  <button className="primary form-submit" disabled={busy}><Save size={17}/>{busy?"Salvando...":"Adicionar funcionário"}</button>
 </form>
}

export default function NewMember(){
 return <ModuleShell title="Novo funcionário" eyebrow="Equipe">{({tenant})=><NewMemberForm tenant={tenant}/>}</ModuleShell>
}
