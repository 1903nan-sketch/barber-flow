"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { tenantFields } from "./tenant-fields";
import { supabase } from "./supabase";
export function useWorkspace(){
 const router=useRouter(); const [state,setState]=useState({loading:true,user:null,membership:null,memberships:[],tenant:null,onboardingRequired:false,error:""});
 useEffect(()=>{let alive=true; async function load(){
  if(!supabase){setState(s=>({...s,loading:false,error:"Supabase não configurado."}));return}
  const {data:{user}}=await supabase.auth.getUser(); if(!user){router.replace("/login");return}
  const {data:memberships,error}=await supabase.from("memberships").select(`tenant_id,name,role,permissions,active,tenants(${tenantFields},plans(name,monthly_cents,max_barbers,max_units,extra_unit_cents,max_profiles,included_units))`).eq("user_id",user.id).eq("active",true).order("name");
  const list=memberships||[],preferred=localStorage.getItem("barberflow_workspace"),membership=list.find(m=>m.tenant_id===preferred)||list[0]||null;
  if(!error&&!membership){if(alive)setState({loading:false,user,membership:null,memberships:[],tenant:null,onboardingRequired:true,error:""});router.replace("/onboarding");return}
  if(membership)localStorage.setItem("barberflow_workspace",membership.tenant_id);
  const tenant=membership?.tenants||null,blocked=tenant&&!["trial","active","pending","overdue"].includes(tenant.status);
  if(alive)setState({loading:false,user,membership,memberships:list,tenant,onboardingRequired:false,error:error?.message||(blocked?"O acesso desta barbearia está temporariamente indisponível. Fale com o suporte BarberTix.":"")});
 } load(); const {data:listener}=supabase?.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT")router.replace("/login")})||{data:{}}; return()=>{alive=false;listener?.subscription?.unsubscribe()};},[router]); return state;
}
