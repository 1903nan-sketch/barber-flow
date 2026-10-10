"use client";
import {supabase} from "./supabase";
import {prepareImage} from "./image-file";

// action: "upload" (com file), "generate" (foto criada por IA a partir do nome) ou "remove".
// Devolve a nova URL da foto (null ao remover).
export async function saveServiceImage(tenantId,serviceId,action,file){
 const {data:{session}}=await supabase.auth.getSession();
 if(!session?.access_token)throw new Error("Sessão expirada. Entre novamente.");
 const body=new FormData();
 body.append("tenant_id",tenantId);body.append("service_id",serviceId);body.append("action",action);
 if(file)body.append("file",await prepareImage(file,{max:1200}));
 const res=await fetch("/api/services/image",{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`},body});
 const out=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(out.error||(res.status===413?"A imagem é grande demais. Tente outra foto.":res.status===504?"A criação da foto demorou demais. Tente de novo.":"Não foi possível salvar a foto."));
 return out.url||null;
}
