"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import QRCode from "qrcode";
import {ArrowLeft,ArrowRight,CheckCircle2,Clock,Copy,ExternalLink,Link2,MessageCircle,Plus,Scissors,Store,Trash2,UserRound} from "lucide-react";
import {supabase} from "../../../lib/supabase";
import {useWorkspace} from "../../../lib/use-workspace";
import {hasFeature,money,subscriptionInfo} from "../../../lib/plans";
import {notify} from "../../../lib/notify";

const STEPS=[
 ["Dados da barbearia",Store],
 ["Serviços",Scissors],
 ["Profissionais",UserRound],
 ["Horários",Clock],
 ["WhatsApp",MessageCircle],
 ["Link de agendamento",Link2]
];
const SUGGESTIONS=[["Corte",30,4000],["Barba",20,3000],["Corte + Barba",50,6500],["Sobrancelha",10,1500]];
const DAYS=[[1,"Seg"],[2,"Ter"],[3,"Qua"],[4,"Qui"],[5,"Sex"],[6,"Sáb"],[0,"Dom"]];
const toMin=v=>{const [h,m]=String(v||"0:0").split(":").map(Number);return h*60+(m||0)};
const token=async()=>(await supabase.auth.getSession()).data.session?.access_token||"";

export default function Onboarding(){
 const workspace=useWorkspace();
 const [step,setStep]=useState(0),[tenant,setTenant]=useState(null);
 useEffect(()=>{
  if(!workspace.tenant)return;
  setTenant(workspace.tenant);
  setStep(Math.min(5,Math.max(0,Number(workspace.tenant.onboarding_step||1)-1)));
 },[workspace.tenant]);

 if(workspace.loading||(!workspace.error&&!tenant))return <main className="gx-wizard"><p className="gx-muted">Carregando configuração...</p></main>;
 if(workspace.error)return <main className="gx-wizard"><div className="gx-card" style={{maxWidth:520,margin:"40px auto"}}><h2>Não foi possível abrir a configuração</h2><p>{workspace.error}</p><a className="gx-btn" href="/login">Voltar ao login</a></div></main>;
 if(workspace.membership?.role!=="owner")return <main className="gx-wizard"><div className="gx-card" style={{maxWidth:520,margin:"40px auto"}}><h2>Configuração inicial</h2><p>Somente o proprietário pode configurar a barbearia.</p><a className="gx-btn" href="/dashboard">Ir para o painel</a></div></main>;

 async function advance(next,completed=false){
  const {data}=await supabase.rpc("save_onboarding_progress",{t:tenant.id,p_step:next+1,p_completed:completed});
  if(data)setTenant(t=>({...t,onboarding_step:data.step,onboarding_completed_at:data.completed_at}));
  if(completed){notify("Configuração concluída! Sua barbearia está pronta.");window.location.href="/dashboard";return}
  setStep(next);window.scrollTo({top:0,behavior:"smooth"});
 }
 const info=subscriptionInfo(tenant),done=Number(tenant.onboarding_step||1)-1;
 const props={tenant,setTenant,next:()=>advance(step+1),back:()=>setStep(s=>Math.max(0,s-1))};

 return <main className="gx-wizard">
  <header className="gx-wizard-head">
   <div><span className="gx-eyebrow">Configuração inicial · {tenant.name}</span><h1 style={{margin:"6px 0 0",fontSize:"clamp(22px,3vw,30px)"}}>Vamos deixar sua barbearia pronta</h1>
    {info.inTrial&&<p className="gx-muted">Teste grátis ativo · {info.trialDaysLeft} {info.trialDaysLeft===1?"dia restante":"dias restantes"}</p>}</div>
   <div className="gx-row"><a className="gx-btn ghost small" href="/dashboard">Terminar depois</a></div>
  </header>
  <div className="gx-wizard-body">
   <aside className="gx-card"><div className="gx-progress" style={{marginBottom:14}}>{STEPS.map((_,i)=><span key={i} className={i<=Math.max(done,step)?"done":""}/>)}</div>
    <nav className="gx-steps">{STEPS.map(([label,Icon],i)=><button type="button" key={label} className={(i===step?"active ":"")+(i<done?"done":"")} onClick={()=>setStep(i)}><i>{i<done?<CheckCircle2 size={14}/>:i+1}</i><Icon size={15}/>{label}</button>)}</nav>
   </aside>
   <section className="gx-stack">
    {step===0&&<StepShop {...props}/>}
    {step===1&&<StepServices {...props}/>}
    {step===2&&<StepTeam {...props} user={workspace.user}/>}
    {step===3&&<StepHours {...props}/>}
    {step===4&&<StepWhatsapp {...props}/>}
    {step===5&&<StepLink {...props} finish={()=>advance(5,true)}/>}
   </section>
  </div>
 </main>;
}

function Footer({back,next,busy,label="Salvar e continuar",first}){
 return <div className="gx-between" style={{marginTop:6}}>
  {!first?<button type="button" className="gx-btn ghost" onClick={back}><ArrowLeft size={15}/>Voltar</button>:<span/>}
  <button className="gx-btn" disabled={busy} onClick={next} type={next?"button":"submit"}>{busy?"Salvando...":label}<ArrowRight size={15}/></button>
 </div>;
}

function StepShop({tenant,setTenant,next}){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 async function save(e){
  e.preventDefault();setBusy(true);setError("");
  const f=Object.fromEntries(new FormData(e.currentTarget));
  const p={...f,phone:f.whatsapp,logo_url:tenant.logo_url||"",cover_url:tenant.cover_url||"",public_info:tenant.public_info||"",public_site_enabled:hasFeature(tenant,"public_booking")};
  const {error}=await supabase.rpc("save_site_settings",{t:tenant.id,p});
  setBusy(false);
  if(error)return setError(error.message);
  setTenant(t=>({...t,...p}));next();
 }
 return <form className="gx-card gx-stack" onSubmit={save}>
  <div><span className="gx-eyebrow">Etapa 1 de 6</span><h2>Dados da barbearia</h2><p>Essas informações aparecem na sua página de agendamento.</p></div>
  <div className="gx-form-grid">
   <label className="gx-field">Nome da barbearia<input name="name" defaultValue={tenant.name} required/></label>
   <label className="gx-field">WhatsApp de atendimento<input name="whatsapp" defaultValue={tenant.whatsapp||tenant.phone} required inputMode="tel"/></label>
   <label className="gx-field">Instagram <small>opcional</small><input name="instagram" defaultValue={tenant.instagram} placeholder="@suabarbearia"/></label>
  </div>
  <label className="gx-field">Endereço<input name="address" defaultValue={tenant.address} placeholder="Rua, número, bairro, cidade"/></label>
  <label className="gx-field">Descrição curta <small>opcional</small><textarea name="description" defaultValue={tenant.description} placeholder="Ex.: Cortes clássicos e modernos, ambiente climatizado."/></label>
  {error&&<div className="gx-alert error">{error}</div>}
  <Footer first busy={busy}/>
 </form>;
}

function StepServices({tenant,next,back}){
 const [items,setItems]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[form,setForm]=useState({name:"",duration:30,price:""});
 const load=useCallback(async()=>{const {data}=await supabase.from("services").select("id,name,duration,price_cents,active").eq("tenant_id",tenant.id).eq("active",true).order("name");setItems(data||[])},[tenant.id]);
 useEffect(()=>{load()},[load]);
 async function add(name,duration,price_cents){
  setBusy(true);setError("");
  const {error}=await supabase.rpc("save_record",{t:tenant.id,k:"service",p:{name,duration,price_cents,commission_bps:0,active:true}});
  setBusy(false);
  if(error)return setError(error.message);
  setForm({name:"",duration:30,price:""});load();
 }
 async function remove(s){
  const {error}=await supabase.rpc("save_record",{t:tenant.id,k:"service",p:{id:s.id,name:s.name,duration:s.duration,price_cents:s.price_cents,active:false}});
  if(error)return setError(error.message);load();
 }
 return <div className="gx-card gx-stack">
  <div><span className="gx-eyebrow">Etapa 2 de 6</span><h2>Serviços</h2><p>Cadastre o que seus clientes podem agendar, com duração e preço.</p></div>
  <div className="gx-row">{SUGGESTIONS.filter(([n])=>!items.some(x=>x.name.toLowerCase()===n.toLowerCase())).map(([n,d,p])=><button key={n} type="button" className="gx-btn ghost small" disabled={busy} onClick={()=>add(n,d,p)}><Plus size={13}/>{n} · {d} min · {money(p)}</button>)}</div>
  <form className="gx-form-grid" onSubmit={e=>{e.preventDefault();const price=Math.round(Number(String(form.price).replace(",","."))*100);if(!form.name.trim()||!(price>0))return setError("Informe nome e preço do serviço.");add(form.name.trim(),Number(form.duration),price)}}>
   <label className="gx-field">Nome<input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Ex.: Corte degradê"/></label>
   <label className="gx-field">Duração<select value={form.duration} onChange={e=>setForm(f=>({...f,duration:e.target.value}))}>{[10,15,20,30,40,45,50,60,75,90,120].map(m=><option key={m} value={m}>{m} min</option>)}</select></label>
   <label className="gx-field">Preço (R$)<input value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} inputMode="decimal" placeholder="45,00"/></label>
   <div style={{display:"flex",alignItems:"flex-end"}}><button className="gx-btn block" disabled={busy}><Plus size={15}/>Adicionar</button></div>
  </form>
  {error&&<div className="gx-alert error">{error}</div>}
  <div className="gx-list">{items.length===0?<div className="gx-empty">Nenhum serviço ainda. Use as sugestões acima para começar rápido.</div>:items.map(s=><div className="gx-list-item" key={s.id}><div><b>{s.name}</b><small>{s.duration} min · {money(s.price_cents)}</small></div><button type="button" className="gx-btn danger small" onClick={()=>remove(s)} aria-label={"Remover "+s.name}><Trash2 size={13}/></button></div>)}</div>
  <Footer back={back} next={()=>items.length?next():setError("Cadastre pelo menos um serviço para continuar.")}/>
 </div>;
}

function StepTeam({tenant,next,back,user}){
 const [members,setMembers]=useState([]),[providers,setProviders]=useState(new Set()),[busy,setBusy]=useState(""),[error,setError]=useState("");
 const bookable=hasFeature(tenant,"public_booking");
 const load=useCallback(async()=>{
  const [m,b]=await Promise.all([supabase.from("memberships").select("user_id,name,role,active").eq("tenant_id",tenant.id).eq("active",true).order("name"),supabase.from("barbers").select("user_id,active").eq("tenant_id",tenant.id)]);
  setMembers(m.data||[]);setProviders(new Set((b.data||[]).filter(x=>x.active).map(x=>x.user_id)));
 },[tenant.id]);
 useEffect(()=>{load()},[load]);
 async function toggle(member){
  setBusy(member.user_id);setError("");
  try{
   const r=await fetch("/api/team",{method:"PATCH",headers:{"content-type":"application/json",authorization:"Bearer "+await token()},body:JSON.stringify({tenant_id:tenant.id,user_id:member.user_id,is_provider:!providers.has(member.user_id)})});
   const j=await r.json();if(!r.ok)throw new Error(j.error||"Não foi possível atualizar.");
   await load();
  }catch(e){setError(e.message)}finally{setBusy("")}
 }
 const roles={owner:"Proprietário",manager:"Gerente",reception:"Recepção",attendant:"Atendente",barber:"Barbeiro"};
 return <div className="gx-card gx-stack">
  <div><span className="gx-eyebrow">Etapa 3 de 6</span><h2>Profissionais</h2><p>Marque quem trabalha em atendimentos. Somente essas pessoas aparecem na página de agendamento e na escolha de profissional.</p></div>
  {!bookable&&<div className="gx-alert warn">O plano Starter não inclui agenda online. Você ainda pode cadastrar a equipe para vendas e comissões.</div>}
  <div className="gx-list">{members.map(m=>{const on=providers.has(m.user_id);return <div className="gx-list-item" key={m.user_id}>
   <div><b>{m.name}{m.user_id===user?.id?" (você)":""}</b><small>{roles[m.role]||m.role} · {on?"Atende clientes":"Não atende clientes"}</small></div>
   {bookable&&<label className="gx-check" style={{padding:"8px 10px"}}><input type="checkbox" checked={on} disabled={busy===m.user_id} onChange={()=>toggle(m)}/><span><b>Trabalha em atendimentos?</b></span></label>}
  </div>})}</div>
  {error&&<div className="gx-alert error">{error}</div>}
  <div className="gx-row"><a className="gx-btn ghost" href="/dashboard/barbeiros/novo"><Plus size={15}/>Adicionar funcionário</a><span className="gx-muted">Você volta para esta etapa quando quiser pelo menu.</span></div>
  <Footer back={back} next={()=>bookable&&providers.size===0?setError("Marque pelo menos um profissional que atende clientes."):next()}/>
 </div>;
}

function StepHours({tenant,next,back}){
 const [barbers,setBarbers]=useState([]),[units,setUnits]=useState([]),[form,setForm]=useState({days:[1,2,3,4,5,6],start:"09:00",end:"19:00",lunch_start:"12:00",lunch_end:"13:00",barbers:[]}),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(false);
 useEffect(()=>{Promise.all([supabase.from("barbers").select("id,name").eq("tenant_id",tenant.id).eq("active",true).order("name"),supabase.from("units").select("id,name").eq("tenant_id",tenant.id).eq("active",true).order("name")]).then(([b,u])=>{setBarbers(b.data||[]);setUnits(u.data||[]);setForm(f=>({...f,barbers:(b.data||[]).map(x=>x.id),unit:u.data?.[0]?.id||""}))})},[tenant.id]);
 const toggleDay=d=>setForm(f=>({...f,days:f.days.includes(d)?f.days.filter(x=>x!==d):[...f.days,d]}));
 const toggleBarber=id=>setForm(f=>({...f,barbers:f.barbers.includes(id)?f.barbers.filter(x=>x!==id):[...f.barbers,id]}));
 async function save(){
  setError("");
  const start=toMin(form.start),end=toMin(form.end),ls=form.lunch_start?toMin(form.lunch_start):null,le=form.lunch_end?toMin(form.lunch_end):null;
  if(!form.days.length||!form.barbers.length)return setError("Selecione dias e profissionais.");
  if(end<=start)return setError("O horário de término deve ser depois do início.");
  const windows=[];
  for(const d of form.days){
   if(ls!==null&&le!==null&&ls>start&&le<end&&le>ls)windows.push({unit_id:form.unit,weekday:d,start_min:start,end_min:ls,step_min:15},{unit_id:form.unit,weekday:d,start_min:le,end_min:end,step_min:15});
   else windows.push({unit_id:form.unit,weekday:d,start_min:start,end_min:end,step_min:15});
  }
  setBusy(true);
  for(const b of form.barbers){
   let r=await supabase.rpc("save_record",{t:tenant.id,k:"assignment",p:{barber_id:b,unit_id:form.unit}});
   if(!r.error)r=await supabase.rpc("save_week",{t:tenant.id,b,p:windows});
   if(r.error){setBusy(false);return setError(r.error.message)}
  }
  setBusy(false);setSaved(true);notify("Horários publicados.");next();
 }
 if(!hasFeature(tenant,"public_booking"))return <div className="gx-card gx-stack"><div><span className="gx-eyebrow">Etapa 4 de 6</span><h2>Horários de funcionamento</h2></div><div className="gx-alert warn">A agenda com horários fica disponível a partir do plano Pro.</div><Footer back={back} next={next} label="Continuar"/></div>;
 return <div className="gx-card gx-stack">
  <div><span className="gx-eyebrow">Etapa 4 de 6</span><h2>Horários de funcionamento</h2><p>Defina quando cada profissional atende. Você pode ajustar dia a dia depois em Configurações.</p></div>
  {barbers.length===0?<div className="gx-alert warn">Nenhum profissional atende clientes ainda. Volte à etapa anterior.</div>:<>
   <div className="gx-field">Dias de atendimento<div className="gx-days">{DAYS.map(([d,l])=><label key={d}><input type="checkbox" checked={form.days.includes(d)} onChange={()=>toggleDay(d)}/>{l}</label>)}</div></div>
   <div className="gx-form-grid">
    <label className="gx-field">Abre às<input type="time" value={form.start} onChange={e=>setForm(f=>({...f,start:e.target.value}))}/></label>
    <label className="gx-field">Fecha às<input type="time" value={form.end} onChange={e=>setForm(f=>({...f,end:e.target.value}))}/></label>
    <label className="gx-field">Pausa (início) <small>opcional</small><input type="time" value={form.lunch_start} onChange={e=>setForm(f=>({...f,lunch_start:e.target.value}))}/></label>
    <label className="gx-field">Pausa (fim)<input type="time" value={form.lunch_end} onChange={e=>setForm(f=>({...f,lunch_end:e.target.value}))}/></label>
    {units.length>1&&<label className="gx-field">Unidade<select value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))}>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
   </div>
   <div className="gx-field">Aplicar para<div className="gx-days">{barbers.map(b=><label key={b.id}><input type="checkbox" checked={form.barbers.includes(b.id)} onChange={()=>toggleBarber(b.id)}/>{b.name}</label>)}</div></div>
  </>}
  {error&&<div className="gx-alert error">{error}</div>}
  {saved&&<div className="gx-alert success">Horários salvos.</div>}
  <Footer back={back} busy={busy} next={barbers.length?save:next}/>
 </div>;
}

function StepWhatsapp({tenant,next,back}){
 const [state,setState]=useState({status:"loading"}),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const allowed=hasFeature(tenant,"whatsapp_bot");
 const check=useCallback(async()=>{
  if(!allowed)return;
  try{const r=await fetch("/api/whatsapp/evolution/status?tenant="+tenant.id,{headers:{authorization:"Bearer "+await token()},cache:"no-store"});const j=await r.json();setState(r.ok?j:{status:"error",message:j.error})}catch{setState({status:"error"})}
 },[tenant.id,allowed]);
 useEffect(()=>{check()},[check]);
 useEffect(()=>{if(state.status!=="connecting")return;const id=setInterval(check,5000);return()=>clearInterval(id)},[state.status,check]);
 async function connect(){
  setBusy(true);setError("");
  try{const r=await fetch("/api/whatsapp/evolution/connect",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+await token()},body:JSON.stringify({tenant:tenant.id})});const j=await r.json();if(!r.ok)throw new Error(j.error||"Não foi possível conectar.");setState(s=>({...s,...j,status:j.connected?"connected":"connecting"}))}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const qr=state.qrcode?(String(state.qrcode).startsWith("data:")?state.qrcode:"data:image/png;base64,"+state.qrcode):"";
 return <div className="gx-card gx-stack">
  <div><span className="gx-eyebrow">Etapa 5 de 6</span><h2>WhatsApp automático</h2><p>Conecte o WhatsApp da barbearia para o robô agendar, confirmar e lembrar clientes sozinho.</p></div>
  {!allowed?<div className="gx-alert warn">O robô de WhatsApp está disponível nos planos Pro e Pro + Filiais.</div>:
   state.status==="not_configured"?<div className="gx-alert warn">A integração de WhatsApp ainda não foi ativada no servidor. Você pode seguir e conectar depois.</div>:
   state.connected||state.status==="connected"?<div className="gx-alert success"><CheckCircle2 size={14}/> WhatsApp conectado{state.phone?" · "+state.phone:""}. O robô já está atendendo.</div>:
   <div className="gx-stack">
    {qr?<div className="gx-row" style={{alignItems:"flex-start"}}><img className="gx-qr" src={qr} alt="QR Code do WhatsApp"/><ol className="gx-muted" style={{margin:0,paddingLeft:18,lineHeight:1.8}}><li>Abra o WhatsApp da barbearia no celular</li><li>Toque em <b>Aparelhos conectados</b></li><li>Toque em <b>Conectar um aparelho</b> e leia o QR Code</li></ol></div>:
     <button type="button" className="gx-btn green" style={{width:"max-content"}} disabled={busy} onClick={connect}><MessageCircle size={15}/>{busy?"Gerando QR Code...":"Conectar WhatsApp"}</button>}
   </div>}
  {error&&<div className="gx-alert error">{error}</div>}
  <Footer back={back} next={next} label={state.connected?"Continuar":"Continuar (conectar depois)"}/>
 </div>;
}

function StepLink({tenant,back,finish}){
 const [qr,setQr]=useState(""),[busy,setBusy]=useState(false);
 const url=useMemo(()=>typeof window==="undefined"?"":window.location.origin+"/agendar/"+tenant.slug,[tenant.slug]);
 const allowed=hasFeature(tenant,"public_booking");
 useEffect(()=>{if(url&&allowed)QRCode.toDataURL(url,{width:360,margin:1}).then(setQr).catch(()=>{})},[url,allowed]);
 return <div className="gx-card gx-stack">
  <div><span className="gx-eyebrow">Etapa 6 de 6</span><h2>Seu link de agendamento</h2><p>Coloque na bio do Instagram, no status do WhatsApp e no Google. Seus clientes agendam sem precisar de login.</p></div>
  {allowed?<>
   <div className="gx-link-box"><Link2 size={16}/><code>{url}</code><button type="button" className="gx-btn small" onClick={()=>navigator.clipboard.writeText(url).then(()=>notify("Link copiado."))}><Copy size={13}/>Copiar</button></div>
   <div className="gx-row" style={{alignItems:"flex-start"}}>{qr&&<img className="gx-qr" src={qr} alt="QR Code do link de agendamento"/>}<div className="gx-stack" style={{maxWidth:340}}><p className="gx-muted">Imprima o QR Code e deixe no balcão: o cliente já sai com o próximo horário marcado.</p><a className="gx-btn ghost" href={url} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Abrir página</a>{qr&&<a className="gx-btn ghost" href={qr} download={"agendamento-"+tenant.slug+".png"}>Baixar QR Code</a>}</div></div>
  </>:<div className="gx-alert warn">O agendamento público está disponível a partir do plano Pro. Faça upgrade em Mensalidade quando quiser.</div>}
  <div className="gx-between"><button type="button" className="gx-btn ghost" onClick={back}><ArrowLeft size={15}/>Voltar</button><button type="button" className="gx-btn green" disabled={busy} onClick={async()=>{setBusy(true);await finish();setBusy(false)}}><CheckCircle2 size={15}/>Concluir configuração</button></div>
 </div>;
}
