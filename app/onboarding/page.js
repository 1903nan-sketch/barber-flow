"use client";

import {useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {ArrowRight,CalendarDays,Check,Clock3,Scissors,ShieldCheck,Store,UserRound} from "lucide-react";
import {supabase} from "../../lib/supabase";
import {LEGAL_VERSION} from "../../lib/legal";
import styles from "./onboarding.module.css";

const DAYS=[[1,"Seg"],[2,"Ter"],[3,"Qua"],[4,"Qui"],[5,"Sex"],[6,"Sáb"],[0,"Dom"]];
const money=value=>(Number(value||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const slugify=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,61);
const minutes=value=>{const [hour,minute]=String(value||"").split(":").map(Number);return hour*60+minute};

export default function OnboardingPage(){
 const router=useRouter();
 const [plans,setPlans]=useState([]),[plan,setPlan]=useState(""),[days,setDays]=useState([1,2,3,4,5,6]);
 const [name,setName]=useState(""),[slug,setSlug]=useState(""),[slugTouched,setSlugTouched]=useState(false);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const selected=useMemo(()=>plans.find(item=>item.id===plan),[plans,plan]);

 useEffect(()=>{let alive=true;(async()=>{
  if(!supabase){if(alive){setError("Supabase não configurado.");setLoading(false)}return}
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){router.replace("/login");return}
  const {data:memberships}=await supabase.from("memberships").select("tenant_id").eq("user_id",user.id).eq("active",true).limit(1);
  if(memberships?.length){router.replace("/dashboard");return}
  const {data,error}=await supabase.rpc("onboarding_options");
  if(!alive)return;
  const options=Array.isArray(data)?data:[];
  setPlans(options);setPlan(options.find(item=>item.name==="Pro")?.id||options[0]?.id||"");
  setError(error?.message||(!options.length?"Os planos ainda não foram configurados. Fale com o suporte.":""));setLoading(false);
 })();return()=>{alive=false}},[router]);

 function updateName(value){setName(value);if(!slugTouched)setSlug(slugify(value))}
 function toggleDay(day){setDays(value=>value.includes(day)?value.filter(item=>item!==day):[...value,day])}
 async function submit(event){
  event.preventDefault();if(busy)return;setBusy(true);setError("");
  const form=new FormData(event.currentTarget),price=Number(String(form.get("service_price")||"").replace(",","."));
  const payload={
   owner_name:String(form.get("owner_name")||"").trim(),name:name.trim(),slug:slugify(slug),phone:String(form.get("phone")||"").trim(),plan_id:plan,
   service_name:String(form.get("service_name")||"").trim(),service_duration:Number(form.get("service_duration")),service_price_cents:Math.round(price*100),
   weekdays:days,start_min:minutes(form.get("start")),end_min:minutes(form.get("end"))
  };
  if(days.length===0){setError("Escolha pelo menos um dia de funcionamento.");setBusy(false);return}
  if(!Number.isFinite(price)||price<0){setError("Informe um preço válido para o serviço.");setBusy(false);return}
  if(form.get("accept_legal")!=="on"){setError("Para continuar, aceite os Termos de Uso e a Política de Privacidade.");setBusy(false);return}
  const token=(await supabase.auth.getSession()).data.session?.access_token||"";
  const consent=await fetch("/api/consent",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},body:JSON.stringify({version:LEGAL_VERSION,accepted:{terms:true,privacy:true,marketing:form.get("accept_marketing")==="on"}})}).then(async r=>r.ok?null:((await r.json().catch(()=>({}))).error||"Não foi possível registrar o aceite.")).catch(()=>"Não foi possível registrar o aceite.");
  if(consent){setError(consent);setBusy(false);return}
  const {error}=await supabase.rpc("self_service_onboard",{p:payload});
  if(error){setError(error.message);setBusy(false);return}
  localStorage.removeItem("barberflow_workspace");router.replace("/dashboard");router.refresh();
 }

 if(loading)return <main className={styles.state} aria-busy="true"><span/><p>Preparando seu BarberTix...</p></main>;
 return <main className={styles.page}>
  <header className={styles.header}><div className={styles.brand}><Scissors/>BarberTix</div><span>Configuração inicial segura</span></header>
  <form className={styles.shell} onSubmit={submit}>
   <section className={styles.intro}><span>COMECE SEU TESTE</span><h1>Sua barbearia pronta para agendar.</h1><p>Configure o essencial agora. Você poderá ajustar equipe, serviços, horários e identidade visual no painel.</p><div className={styles.assurance}><ShieldCheck/><span><b>Criação automática e isolada</b><small>Seus dados ficam vinculados somente à sua empresa.</small></span></div></section>
   <div className={styles.form}>
    <div className={styles.progress}><span className={styles.active}>1</span><i/><span className={styles.active}>2</span><i/><span className={styles.active}>3</span></div>
    <section><div className={styles.title}><Store/><div><h2>Barbearia e proprietário</h2><p>Dados usados para criar sua conta de gestão.</p></div></div><div className={styles.grid}><label>Seu nome<input name="owner_name" autoComplete="name" minLength="2" required placeholder="Nome do proprietário"/></label><label>WhatsApp<input name="phone" inputMode="tel" autoComplete="tel" required placeholder="(11) 99999-9999"/></label><label>Nome da barbearia<input value={name} onChange={event=>updateName(event.target.value)} minLength="2" required placeholder="Ex.: Barbearia Central"/></label><label>Endereço da agenda<div className={styles.slug}><span>barbertix.com/agendar/</span><input value={slug} onChange={event=>{setSlugTouched(true);setSlug(slugify(event.target.value))}} minLength="3" required aria-label="Endereço público da agenda"/></div></label></div></section>
    <section><div className={styles.title}><Scissors/><div><h2>Primeiro serviço</h2><p>O proprietário já será cadastrado como o primeiro profissional.</p></div></div><div className={styles.grid}><label>Serviço<input name="service_name" minLength="2" required defaultValue="Corte"/></label><label>Preço (R$)<input name="service_price" type="number" min="0" step="0.01" required defaultValue="50.00"/></label><label>Duração<select name="service_duration" defaultValue="30"><option value="30">30 minutos</option><option value="45">45 minutos</option><option value="60">60 minutos</option><option value="90">90 minutos</option></select></label></div></section>
    <section><div className={styles.title}><CalendarDays/><div><h2>Horário de funcionamento</h2><p>Uma agenda inicial que pode ser refinada depois.</p></div></div><div className={styles.days}>{DAYS.map(([value,label])=><button type="button" key={value} className={days.includes(value)?styles.selected:""} onClick={()=>toggleDay(value)} aria-pressed={days.includes(value)}>{days.includes(value)&&<Check/>}{label}</button>)}</div><div className={styles.hours}><label><Clock3/>Abre<input name="start" type="time" defaultValue="09:00" required/></label><label><Clock3/>Fecha<input name="end" type="time" defaultValue="18:00" required/></label></div></section>
    <section><div className={styles.title}><UserRound/><div><h2>Plano após o teste</h2><p>Você começa com 14 dias grátis; nenhuma cobrança é feita nesta etapa.</p></div></div><div className={styles.plans}>{plans.map(item=><button type="button" key={item.id} className={plan===item.id?styles.planSelected:""} onClick={()=>setPlan(item.id)} aria-pressed={plan===item.id}><span>{item.name}</span><strong>{money(item.monthly_cents)}<small>/mês</small></strong><small>{item.max_units} {item.max_units===1?"unidade":"unidades"} · até {item.max_profiles} perfis</small></button>)}</div>{selected?.name==="Starter"&&<p className={styles.warning}>O Starter não inclui agenda pública nem automação por WhatsApp.</p>}</section>
    <section className={styles.consent}><label><input type="checkbox" name="accept_legal" required/><span>Li e aceito os <a href="/termos" target="_blank" rel="noreferrer">Termos de Uso</a> e a <a href="/privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a>, e autorizo o tratamento dos meus dados e dos dados da barbearia para a prestação do serviço (LGPD). Entendo que o teste grátis dura 14 dias e que, depois dele, preciso escolher um plano e pagar para continuar.</span></label><label><input type="checkbox" name="accept_marketing"/><span>Quero receber novidades do BarberTix por e-mail e WhatsApp (opcional).</span></label></section>
    {error&&<div className={styles.error} role="alert">{error}</div>}
    <button className={styles.submit} disabled={busy||!plan}>{busy?"Criando sua barbearia...":"Criar barbearia e abrir painel"}<ArrowRight/></button>
    <p className={styles.note}>Ao continuar, sua barbearia, unidade, serviço, profissional e agenda inicial serão criados juntos.</p>
   </div>
  </form>
 </main>
}
