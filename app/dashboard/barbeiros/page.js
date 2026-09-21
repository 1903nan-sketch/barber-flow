"use client";
import { useEffect,useState } from "react";
import { Plus,UserRound } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import ModuleShell from "../_components/ModuleShell";
const roles={owner:"Proprietário",manager:"Gerente",reception:"Recepção",barber:"Barbeiro"};
function TeamContent({workspace}){const [items,setItems]=useState([]),[loading,setLoading]=useState(true);useEffect(()=>{supabase.from("memberships").select("*").eq("tenant_id",workspace.tenant.id).order("name").then(({data})=>{setItems(data||[]);setLoading(false)})},[workspace.tenant.id]);return <section className="box"><div className="module-toolbar"><div><h2>Equipe e acessos</h2><p>{items.length} funcionários vinculados</p></div></div>{loading?<p className="empty">Carregando...</p>:<div className="data-list">{items.map(x=><article key={x.user_id}><span className="client-avatar"><UserRound size={16}/></span><div><strong>{x.name}</strong><small>{roles[x.role]||x.role} · {x.permissions?.length||0} permissões</small></div><span className={`pill ${x.active?"confirmed":""}`}>{x.active?"ativo":"inativo"}</span></article>)}</div>}</section>}
export default function TeamPage(){return <ModuleShell title="Funcionários" eyebrow="Equipe" action={<a className="primary" href="/dashboard/barbeiros/novo"><Plus size={18}/> Novo funcionário</a>}>{workspace=><TeamContent workspace={workspace}/>}</ModuleShell>}
