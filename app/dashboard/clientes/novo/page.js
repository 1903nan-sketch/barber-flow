"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { supabase } from "../../../../lib/supabase";
import ModuleShell from "../../_components/ModuleShell";
export default function NewClient(){const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState("");
 return <ModuleShell title="Novo cliente" eyebrow="Relacionamento">{({tenant})=><form className="box form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");const f=new FormData(e.currentTarget),payload=Object.fromEntries(f.entries());const {error}=await supabase.rpc("save_record",{t:tenant.id,k:"client",p:payload});setBusy(false);if(error)return setError(error.message);router.push("/dashboard/clientes")}}><div className="form-grid"><label>Nome completo<input name="name" required placeholder="Nome do cliente"/></label><label>Telefone<input name="phone" placeholder="(11) 99999-9999"/></label><label>WhatsApp<input name="whatsapp" placeholder="(11) 99999-9999"/></label><label>E-mail<input name="email" type="email" placeholder="cliente@email.com"/></label><label>Data de nascimento<input name="birthday" type="date"/></label></div><label>Observações<textarea name="notes" placeholder="Preferências, alergias ou observações"/></label>{error&&<div className="form-alert error">{error}</div>}<button className="primary form-submit" disabled={busy}><Save size={17}/>{busy?"Salvando...":"Salvar cliente"}</button></form>}</ModuleShell>}
