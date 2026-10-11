"use client";
import {useCallback,useEffect,useState} from "react";
import {phoneDigits} from "./phone";

// Débitos em aberto ("Conta do cliente") de atendimentos e vendas rápidas,
// agrupados por cliente: total, quantidade e a pendência mais antiga.
export async function loadOpenDebts(supabase,tenantId){
 const [a,q]=await Promise.all([
  supabase.from("appointment_payments").select("id,client_id,amount_cents,created_at,services(name)").eq("tenant_id",tenantId).eq("status","open").order("created_at"),
  supabase.from("quick_sales").select("id,client_id,amount_cents,created_at,description").eq("tenant_id",tenantId).eq("status","open").order("created_at")
 ]);
 const items=[
  ...(a.data||[]).map(x=>({...x,sale_type:"appointment",label:x.services?.name||"Atendimento"})),
  ...(q.data||[]).map(x=>({...x,sale_type:"quick",label:x.description||"Venda em conta"}))
 ].filter(x=>x.client_id).sort((x,y)=>new Date(x.created_at)-new Date(y.created_at));
 const byClient=new Map();
 for(const x of items){
  const d=byClient.get(x.client_id)||{total:0,count:0,oldest:x.created_at,items:[]};
  d.total+=Number(x.amount_cents||0);d.count++;d.items.push(x);
  byClient.set(x.client_id,d);
 }
 return {items,byClient,error:a.error||q.error||null};
}

export function useClientDebts(supabase,tenantId){
 const [state,setState]=useState({byClient:new Map(),items:[],loading:true,error:null});
 const reload=useCallback(async()=>{
  if(!tenantId)return;
  const out=await loadOpenDebts(supabase,tenantId);
  setState({...out,loading:false});
 },[supabase,tenantId]);
 useEffect(()=>{reload()},[reload]);
 return {...state,reload};
}

// Cliente cadastrado com este celular (compara só os dígitos, com ou sem 55).
export function clientByPhone(clients,phone){
 const d=phoneDigits(phone);
 if(d.length<10)return null;
 return clients.find(c=>[c.phone,c.whatsapp].some(p=>p&&phoneDigits(p)===d))||null;
}

export const daysSince=iso=>Math.max(0,Math.floor((Date.now()-new Date(iso).getTime())/86400000));
