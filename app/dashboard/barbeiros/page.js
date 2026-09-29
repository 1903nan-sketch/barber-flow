"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {CalendarCheck2,Plus,UserRound} from "lucide-react";
import {supabase} from "../../../lib/supabase";
import ModuleShell from "../_components/ModuleShell";

const roles={owner:"Proprietário",manager:"Gerente",reception:"Recepção",attendant:"Atendente",barber:"Barbeiro"};

function TeamContent({workspace}){
 const [items,setItems]=useState([]),[providers,setProviders]=useState(new Set()),[loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[error,setError]=useState("");
 const owner=workspace.membership?.role==="owner",starter=String(workspace.tenant?.plans?.name||"").toLowerCase()==="starter";
 const limit=Number(workspace.tenant?.plans?.max_profiles||0);
 const used=useMemo(()=>items.filter(x=>x.active&&x.role!=="owner").length,[items]);

 const load=useCallback(async()=>{
  setLoading(true);
  const [m,b]=await Promise.all([
   supabase.from("memberships").select("*").eq("tenant_id",workspace.tenant.id).order("name"),
   supabase.from("barbers").select("user_id,active").eq("tenant_id",workspace.tenant.id)
  ]);
  setItems(m.data||[]);
  setProviders(new Set((b.data||[]).filter(x=>x.active).map(x=>x.user_id)));
  setLoading(false);
 },[workspace.tenant.id]);

 useEffect(()=>{load()},[load]);

 async function toggleProvider(member){
  const next=!providers.has(member.user_id);setBusy(member.user_id);setError("");
  try{
   const {data:{session}}=await supabase.auth.getSession();
   const r=await fetch("/api/team",{method:"PATCH",headers:{"content-type":"application/json",Authorization:`Bearer ${session?.access_token||""}`},body:JSON.stringify({tenant_id:workspace.tenant.id,user_id:member.user_id,is_provider:next})});
   const j=await r.json();if(!r.ok)throw new Error(j.error||"Não foi possível atualizar a agenda.");
   await load();
  }catch(e){setError(e.message||"Não foi possível atualizar o perfil.")}finally{setBusy("")}
 }

 return <section className="box">
  <div className="module-toolbar"><div><h2>Equipe e acessos</h2><p>{used} de {limit} perfis adicionais usados · o proprietário não entra nesse limite</p></div></div>
  {error&&<div className="form-alert error">{error}</div>}
  {loading?<p className="empty">Carregando...</p>:<div className="data-list">{items.map(x=>{const bookable=providers.has(x.user_id);return <article key={x.user_id}>
   <span className="client-avatar"><UserRound size={16}/></span>
   <div><strong>{x.name}</strong><small>{roles[x.role]||x.role} · {x.permissions?.length||0} permissões</small><small>{starter?"Plano Starter · sem agenda":bookable?"Aparece como profissional na agenda":"Somente acesso ao sistema"}</small></div>
   <span className={`pill ${x.active?"confirmed":""}`}>{x.active?"ativo":"inativo"}</span>
   {!starter&&<span className={`pill ${bookable?"confirmed":""}`}>{bookable?"na agenda":"fora da agenda"}</span>}
   {owner&&!starter&&x.active&&<button className="secondary-action" type="button" disabled={busy===x.user_id} onClick={()=>toggleProvider(x)}><CalendarCheck2 size={14}/>{busy===x.user_id?"Salvando...":bookable?"Não atender":"Atende clientes"}</button>}
  </article>})}</div>}
 </section>
}

export default function TeamPage(){
 return <ModuleShell title="Equipe" eyebrow="Acessos" action={({tenant})=>{
  const limit=Number(tenant?.plans?.max_profiles||0);
  return <a className="primary" href="/dashboard/barbeiros/novo"><Plus size={18}/> Novo perfil ({limit} máx.)</a>
 }}>{workspace=><TeamContent workspace={workspace}/>}</ModuleShell>
}
