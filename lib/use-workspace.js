"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { tenantFields } from "./tenant-fields";
import { supabase } from "./supabase";
import { LEGAL_VERSION, REQUIRED_CONSENTS, trialEnded } from "./legal";
// consentRequired: the user has not accepted the current Terms/Privacy version yet.
// billingLock: "trial_ended" | "blocked" — the owner may only choose a plan and pay.
export function useWorkspace(){
 const router=useRouter(); const [reloadKey,setReloadKey]=useState(0); const [state,setState]=useState({loading:true,user:null,membership:null,memberships:[],tenant:null,onboardingRequired:false,consentRequired:false,billingLock:null,error:""});
 const reload=useCallback(()=>setReloadKey(k=>k+1),[]);
 useEffect(()=>{let alive=true;
 async function clearBrokenSession(){
  try{await supabase.auth.signOut({scope:"local"})}catch{}
  try{
   Object.keys(localStorage).filter(k=>k.startsWith("sb-")&&k.endsWith("-auth-token")).forEach(k=>localStorage.removeItem(k));
  }catch{}
 }
 async function load(){
  try{
  if(!supabase){setState(s=>({...s,loading:false,error:"Supabase não configurado."}));return}
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError){
   const msg=String(authError.message||"");
   if(/invalid refresh token|refresh token not found|jwt expired/i.test(msg)){
    await clearBrokenSession();
    if(alive)setState(s=>({...s,loading:false,user:null,error:""}));
    router.replace("/login");
    return;
   }
   if(alive)setState(s=>({...s,loading:false,error:msg||"Não foi possível validar sua sessão."}));
   return;
  }
  if(!user){router.replace("/login");return}
  const [{data:memberships,error},{data:consents,error:consentError}]=await Promise.all([
   supabase.from("memberships").select(`tenant_id,name,role,permissions,active,tenants(${tenantFields},plans(name,monthly_cents,max_barbers,max_units,extra_unit_cents,max_profiles,included_units))`).eq("user_id",user.id).eq("active",true).order("name"),
   supabase.from("user_consents").select("document").eq("user_id",user.id).eq("version",LEGAL_VERSION).eq("accepted",true)
  ]);
  // Fail open if the consent table is unreachable so a missing migration never locks everyone out.
  if(consentError)console.warn("user_consents",consentError.message);
  const accepted=new Set((consents||[]).map(x=>x.document)),consentRequired=!consentError&&!REQUIRED_CONSENTS.every(d=>accepted.has(d));
  const list=(memberships||[]).filter(m=>m.tenants?.product_slug==="barberflow"),preferred=localStorage.getItem("barberflow_workspace"),membership=list.find(m=>m.tenant_id===preferred)||list[0]||null;
  if(!error&&!membership){if(alive)setState({loading:false,user,membership:null,memberships:[],tenant:null,onboardingRequired:true,consentRequired,billingLock:null,error:""});router.replace("/onboarding");return}
  if(membership)localStorage.setItem("barberflow_workspace",membership.tenant_id);
  const tenant=membership?.tenants||null,owner=membership?.role==="owner";
  const billingLock=tenant?.status==="blocked"?"blocked":trialEnded(tenant)?"trial_ended":null;
  const unavailable=tenant&&!["trial","active","pending","overdue","blocked"].includes(tenant.status);
  let message=error?.message||"";
  if(!message&&unavailable)message="O acesso desta barbearia está temporariamente indisponível. Fale com o suporte BarberTix.";
  if(!message&&billingLock&&!owner)message=billingLock==="trial_ended"?"O período de teste grátis desta barbearia terminou. Peça ao proprietário para escolher um plano e liberar o acesso.":"O acesso desta barbearia está suspenso por pendência na mensalidade. Peça ao proprietário para regularizar o pagamento.";
  if(alive)setState({loading:false,user,membership,memberships:list,tenant,onboardingRequired:false,consentRequired,billingLock:owner?billingLock:null,error:message});
  }catch(err){
   const msg=String(err?.message||err||"");
   if(/invalid refresh token|refresh token not found|jwt expired/i.test(msg)){
    await clearBrokenSession();
    if(alive)setState(s=>({...s,loading:false,user:null,error:""}));
    router.replace("/login");
    return;
   }
   console.error("workspace-load",err);
   if(alive)setState(s=>({...s,loading:false,error:msg||"Não foi possível carregar o BarberTix."}));
  }
 } load(); const {data:listener}=supabase?.auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_OUT")router.replace("/login");if(event==="TOKEN_REFRESHED"&&!session)router.replace("/login")})||{data:{}}; return()=>{alive=false;listener?.subscription?.unsubscribe()};},[router,reloadKey]); return {...state,reload};
}
