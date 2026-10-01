"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { tenantFields } from "./tenant-fields";
import { supabase } from "./supabase";
export function useWorkspace(){
 const router=useRouter(); const [state,setState]=useState({loading:true,user:null,membership:null,memberships:[],tenant:null,error:""});
 useEffect(()=>{let alive=true; async function load(){
  if(!supabase){setState(s=>({...s,loading:false,error:"Supabase não configurado."}));return}
  const {data:{user}}=await supabase.auth.getUser(); if(!user){router.replace("/login");return}
  const {data:memberships,error}=await supabase.from("memberships").select(`tenant_id,name,role,permissions,active,tenants(${tenantFields},plans(name,monthly_cents,max_barbers,max_units,extra_unit_cents,max_profiles,included_units,features))`).eq("user_id",user.id).eq("active",true).order("name");
  const list=memberships||[],preferred=localStorage.getItem("barberflow_workspace"),membership=list.find(m=>m.tenant_id===preferred)||list[0]||null;
  if(membership)localStorage.setItem("barberflow_workspace",membership.tenant_id);
  const tenant=membership?.tenants||null,blocked=tenant&&!["trial","active","pending","overdue"].includes(tenant.status);
  // Proprietário de barbearia bloqueada continua entrando, mas só acessa a mensalidade.
  const restricted=Boolean(blocked&&membership?.role==="owner");
  if(alive)setState({loading:false,user,membership,memberships:list,tenant,restricted,error:error?.message||(!membership?"Sua conta ainda não foi vinculada a uma barbearia. Se você ainda não tem conta, crie sua barbearia em /cadastro.":blocked&&!restricted?"O acesso desta barbearia está temporariamente indisponível. Fale com o responsável pela barbearia.":"")});
 } load(); const {data:listener}=supabase?.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT")router.replace("/login")})||{data:{}}; return()=>{alive=false;listener?.subscription?.unsubscribe()};},[router]); return state;
}
