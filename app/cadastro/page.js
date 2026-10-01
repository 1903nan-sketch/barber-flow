"use client";
import {useEffect,useState} from "react";
import {ArrowRight,CalendarCheck,CheckCircle2,Eye,EyeOff,MessageCircle,Scissors,ShieldCheck,TrendingUp} from "lucide-react";
import {supabase} from "../../lib/supabase";
import {captureAcquisition,getAcquisition} from "../../lib/acquisition";

const PLANS=[
 ["Starter","R$ 70/mês","Gestão interna"],
 ["Pro","R$ 100/mês","Agenda online + WhatsApp"],
 ["Pro + Filiais","R$ 150/mês","Várias unidades"]
];
const maskPhone=v=>{
 const d=String(v||"").replace(/\D/g,"").slice(0,11);
 if(d.length<=2)return d;
 if(d.length<=7)return "("+d.slice(0,2)+") "+d.slice(2);
 return "("+d.slice(0,2)+") "+d.slice(2,d.length-4)+"-"+d.slice(-4);
};

export default function SignupPage(){
 const [form,setForm]=useState({owner_name:"",whatsapp:"",email:"",barbershop:"",password:"",plan:"Pro",website:""});
 const [show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[done,setDone]=useState(false);

 useEffect(()=>{
  captureAcquisition();
  const plan=new URLSearchParams(window.location.search).get("plano");
  const match=PLANS.find(([name])=>name.toLowerCase().replace(/\W/g,"")===String(plan||"").toLowerCase().replace(/\W/g,""));
  if(match)setForm(f=>({...f,plan:match[0]}));
 },[]);

 const set=(k,v)=>setForm(f=>({...f,[k]:k==="whatsapp"?maskPhone(v):v}));

 async function submit(e){
  e.preventDefault();
  if(busy)return;
  setBusy(true);setError("");
  try{
   const res=await fetch("/api/signup",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...form,acquisition:getAcquisition()})});
   const out=await res.json().catch(()=>({}));
   if(!res.ok)throw new Error(out.error||"Não foi possível criar sua conta.");
   setDone(true);
   if(!supabase)throw new Error("Conta criada. Entre pela tela de login.");
   const {error:loginError}=await supabase.auth.signInWithPassword({email:form.email.trim().toLowerCase(),password:form.password});
   if(loginError)throw new Error("Conta criada! Entre com seu e-mail e senha na tela de login.");
   try{if(out.tenant_id)localStorage.setItem("barberflow_workspace",out.tenant_id)}catch{}
   window.location.href="/dashboard/onboarding";
  }catch(err){setError(err.message||"Não foi possível criar sua conta.")}
  finally{setBusy(false)}
 }

 return <main className="gx-auth">
  <section className="gx-auth-brand">
   <div className="gx-logo"><i><Scissors size={18}/></i>BarberTix</div>
   <div>
    <span className="gx-eyebrow">Teste grátis por 14 dias · sem cartão</span>
    <h1>Sua barbearia <em>cheia</em>,<br/>sem faltas e sem planilha.</h1>
    <p className="gx-muted" style={{fontSize:15,maxWidth:520}}>Agenda online, robô de WhatsApp que agenda e confirma sozinho, lembretes automáticos, comissão e recuperação de clientes.</p>
    <ul>
     <li><CalendarCheck size={18}/>Link de agendamento pronto em minutos</li>
     <li><MessageCircle size={18}/>Confirmação e lembrete automáticos no WhatsApp</li>
     <li><TrendingUp size={18}/>Recupere clientes que pararam de voltar</li>
     <li><ShieldCheck size={18}/>Seus dados isolados e protegidos</li>
    </ul>
   </div>
   <small className="gx-muted gx-auth-foot">BarberTix · by Ruptix</small>
  </section>
  <section className="gx-auth-panel">
   <div className="gx-auth-card">
    <span className="gx-eyebrow">Criar conta</span>
    <h2>Comece seu teste grátis</h2>
    <p className="gx-muted">Leva menos de 1 minuto. Depois, configuramos juntos serviços, equipe e horários.</p>
    <form onSubmit={submit} aria-busy={busy}>
     <label className="gx-field">Seu nome<input value={form.owner_name} onChange={e=>set("owner_name",e.target.value)} required minLength={2} autoComplete="name" placeholder="Nome do responsável"/></label>
     <label className="gx-field">Nome da barbearia<input value={form.barbershop} onChange={e=>set("barbershop",e.target.value)} required minLength={2} placeholder="Ex.: Barbearia do Zé"/></label>
     <div className="gx-form-grid">
      <label className="gx-field">WhatsApp<input value={form.whatsapp} onChange={e=>set("whatsapp",e.target.value)} required inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999"/></label>
      <label className="gx-field">E-mail<input value={form.email} onChange={e=>set("email",e.target.value)} required type="email" autoComplete="email" autoCapitalize="none" placeholder="voce@email.com"/></label>
     </div>
     <label className="gx-field">Senha
      <div style={{position:"relative"}}>
       <input value={form.password} onChange={e=>set("password",e.target.value)} required minLength={8} type={show?"text":"password"} autoComplete="new-password" placeholder="Mínimo 8 caracteres" style={{paddingRight:44}}/>
       <button type="button" onClick={()=>setShow(v=>!v)} aria-label={show?"Ocultar senha":"Mostrar senha"} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:0,color:"#8d97aa",cursor:"pointer"}}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button>
      </div>
     </label>
     <div className="gx-field">Plano após o teste <small>Você pode trocar quando quiser. Durante o teste, tudo do plano escolhido fica liberado.</small>
      <div className="gx-plan-pick">{PLANS.map(([name,price,desc])=><label key={name}><input type="radio" name="plan" value={name} checked={form.plan===name} onChange={()=>set("plan",name)}/><b>{name}</b><span>{price}</span><span>{desc}</span></label>)}</div>
     </div>
     <input className="gx-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={e=>set("website",e.target.value)} name="website"/>
     {error&&<div className="gx-alert error" role="alert">{error}</div>}
     {done&&!error&&<div className="gx-alert success" role="status"><CheckCircle2 size={14}/> Conta criada! Abrindo a configuração...</div>}
     <button className="gx-btn block" disabled={busy}>{busy?"Criando sua barbearia...":"Criar conta e começar"}<ArrowRight size={16}/></button>
     <p className="gx-muted" style={{textAlign:"center"}}>Já tem conta? <a href="/login" style={{color:"#b8a5ff"}}>Entrar</a></p>
    </form>
   </div>
  </section>
 </main>;
}
