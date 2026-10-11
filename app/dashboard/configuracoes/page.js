"use client";
import {notify} from "../../../lib/notify";
import {useRef,useState} from "react";
import {Camera,CheckCircle2,Copy,ExternalLink,Globe,ImagePlus,Instagram,MessageCircle,Move,QrCode,Save,Trash2} from "lucide-react";
import {supabase} from "../../../lib/supabase";
import {bookingUrl} from "../../../lib/site";
import {uploadMedia} from "../../../lib/image-file";
import {formatPhone,phoneDigits} from "../../../lib/phone";
import PhoneInput from "../../_components/PhoneInput";
import {IosSwitch} from "../../_components/ThemeSwitch";
import ImageCropper,{fileFromUrl} from "../../_components/ImageCropper";
import ScheduleManager from "../agenda/ScheduleManager";
import ModuleShell from "../_components/ModuleShell";

const initials=name=>{const w=String(name||"").trim().split(/\s+/).filter(x=>!/^(d[aeo]s?|e|&)$/i.test(x));return w.slice(0,2).map(x=>x[0]).join("").toUpperCase()||"?"};

function SettingsContent({workspace}){
 const t=workspace.tenant,formRef=useRef(null);
 const [media,setMedia]=useState({logo_url:t.logo_url||"",cover_url:t.cover_url||""}),[siteOn,setSiteOn]=useState(t.public_site_enabled!==false),[name,setName]=useState(t.name||"");
 const [busy,setBusy]=useState(""),[error,setError]=useState(""),[crop,setCrop]=useState(null);
 const link=typeof location!=="undefined"?bookingUrl(location.origin,t.slug):"";

 function payload(over={}){
  const f=Object.fromEntries(new FormData(formRef.current));
  return {...f,phone:formatPhone(f.phone),whatsapp:formatPhone(f.whatsapp),logo_url:media.logo_url,cover_url:media.cover_url,public_site_enabled:siteOn,...over};
 }
 async function persist(p){const {error}=await supabase.rpc("save_site_settings",{t:t.id,p});if(error)throw error}
 async function saveSite(e){
  e?.preventDefault();if(busy)return;setBusy("save");setError("");
  try{await persist(payload());notify("Site e informações públicas atualizados.")}catch(err){setError(err.message)}finally{setBusy("")}
 }
 // Logo e capa são salvos na hora (junto com o que já está no formulário).
 async function changeImage(field,file){
  if(!file||busy)return;setBusy(field);setError("");
  try{const url=await uploadMedia(supabase,t.id,field,file);await persist(payload({[field]:url}));setMedia(m=>({...m,[field]:url}));notify(field==="logo_url"?"Logo atualizada no site.":"Capa atualizada no site.")}
  catch(err){setError(err.message)}finally{setBusy("")}
 }
 async function removeImage(field){
  if(busy||!confirm(field==="logo_url"?"Remover a logo do site?":"Remover a capa do site?"))return;setBusy(field);setError("");
  try{await persist(payload({[field]:""}));setMedia(m=>({...m,[field]:""}));notify("Imagem removida.")}catch(err){setError(err.message)}finally{setBusy("")}
 }
 async function toggleSite(on){
  setSiteOn(on);setError("");
  try{await persist(payload({public_site_enabled:on}));notify(on?"Site de agendamento ativado.":"Site de agendamento desativado.")}catch(err){setSiteOn(!on);setError(err.message)}
 }
 async function connectInstagram(){setError("");setBusy("instagram");try{const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error("Entre novamente.");const res=await fetch("/api/instagram/connect",{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({tenant:t.id})});const out=await res.json();if(!res.ok)throw new Error(out.error);window.location.href=out.url}catch(e){setError(e.message)}finally{setBusy("")}}
 async function savePayment(e){e.preventDefault();setBusy("pix");setError("");const p=Object.fromEntries(new FormData(e.currentTarget));const {error}=await supabase.rpc("save_payment_settings",{t:t.id,p});setBusy("");if(error)setError(error.message);else notify("Dados do PIX atualizados.")}

 const insta=String(t.instagram||"").replace(/^@/,""),wa=phoneDigits(t.whatsapp);
 // Escolher a imagem abre o ajuste (posição e zoom); a imagem é enviada já recortada.
 const imageInput=field=><input type="file" accept="image/*" hidden disabled={!!busy} onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f){setError("");setCrop({field,file:f})}}}/>;
 async function adjust(field){setError("");try{setCrop({field,file:await fileFromUrl(media[field])})}catch(err){setError(err.message)}}

 return <div className="cfg">
  <form ref={formRef} onSubmit={saveSite} className="cfg-main">
   <div className="cfg-head"><div><h2>Site e redes sociais</h2><p>O que seus clientes veem no site de agendamento.</p></div><button className="primary" disabled={!!busy}><Save size={17}/>{busy==="save"?"Salvando...":"Salvar alterações"}</button></div>
   {error&&<div className="form-alert error">{error}</div>}

   <section className="cfg-card cfg-site">
    <div className="cfg-site-main"><span className={"cfg-site-dot"+(siteOn?" on":"")}><Globe size={18}/></span><div><strong>Site de agendamento {siteOn?"ativo":"desativado"}</strong><a href={link} target="_blank" rel="noreferrer">{link.replace(/^https?:\/\//,"")}</a></div><IosSwitch checked={siteOn} onChange={toggleSite} label="Site de agendamento ativo"/></div>
    <div className="cfg-site-actions"><button type="button" className="secondary-action" onClick={()=>navigator.clipboard?.writeText(link).then(()=>notify("Link copiado."))}><Copy size={15}/>Copiar link</button><a className="secondary-action" href={link} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Abrir site</a></div>
   </section>

   <section className="cfg-card">
    <div className="cfg-card-head"><h3>Logo e capa</h3><p>Aparecem no topo do site de agendamento. Use fotos da fachada, do ambiente ou do seu trabalho.</p></div>
    <div className="cfg-brand">
     <div className={"cfg-cover"+(media.cover_url?" has":"")}>
      {media.cover_url?<img src={media.cover_url} alt="Capa"/>:<div className="cfg-cover-empty"><ImagePlus size={26}/><span>Sem capa</span></div>}
      <div className="cfg-cover-actions">
       <label className="cfg-pill">{busy==="cover_url"?"Enviando...":<><Camera size={15}/>{media.cover_url?"Trocar capa":"Adicionar capa"}</>}{imageInput("cover_url")}</label>
       {media.cover_url&&<button type="button" className="cfg-pill" onClick={()=>adjust("cover_url")} disabled={!!busy} aria-label="Ajustar capa"><Move size={15}/></button>}{media.cover_url&&<button type="button" className="cfg-pill" onClick={()=>removeImage("cover_url")} disabled={!!busy} aria-label="Remover capa"><Trash2 size={15}/></button>}
      </div>
     </div>
     <div className="cfg-brand-row">
      <label className="cfg-logo" title="Trocar logo">{media.logo_url?<img src={media.logo_url} alt="Logo"/>:<span>{initials(name)}</span>}<i>{busy==="logo_url"?"…":<Camera size={15}/>}</i>{imageInput("logo_url")}</label>
      <div className="cfg-brand-copy"><strong>{name||"Sua empresa"}</strong><small>Logo quadrada fica melhor (ex.: 600 × 600).</small>
       <div className="cfg-brand-actions"><label className="secondary-action">{busy==="logo_url"?"Enviando...":<><Camera size={15}/>{media.logo_url?"Trocar logo":"Adicionar logo"}</>}{imageInput("logo_url")}</label>{media.logo_url&&<button type="button" className="secondary-action" onClick={()=>adjust("logo_url")} disabled={!!busy}><Move size={15}/>Ajustar</button>}{media.logo_url&&<button type="button" className="secondary-action" onClick={()=>removeImage("logo_url")} disabled={!!busy}><Trash2 size={15}/>Remover</button>}</div>
      </div>
     </div>
    </div>
   </section>

   <section className="cfg-card">
    <div className="cfg-card-head"><h3>Informações da empresa</h3><p>Exibidas no site de agendamento.</p></div>
    <div className="cfg-grid">
     <label>Nome da empresa<input name="name" value={name} onChange={e=>setName(e.target.value)} required/></label>
     <label>Telefone<PhoneInput name="phone" defaultValue={t.phone}/></label>
     <label className="wide">Endereço completo<input name="address" defaultValue={t.address} placeholder="Rua, número, bairro e cidade"/></label>
     <label className="wide">Descrição<textarea name="description" defaultValue={t.description} rows={3} placeholder="Ex.: Cortes clássicos e modernos no centro da cidade."/></label>
     <label className="wide">Informações importantes<textarea name="public_info" defaultValue={t.public_info} rows={2} placeholder="Ex.: Chegue 5 minutos antes. Aceitamos PIX e cartão."/></label>
    </div>
   </section>

   <section className="cfg-card">
    <div className="cfg-card-head"><h3>Redes sociais</h3><p>Viram botões de contato no site de agendamento.</p></div>
    <div className="cfg-nets">
     <div className="cfg-net">
      <div className="cfg-net-title"><span className="cfg-net-icon insta"><Instagram size={18}/></span><strong>Instagram</strong>{t.instagram&&<em><CheckCircle2 size={13}/>Configurado</em>}</div>
      <label>Seu @<input name="instagram" defaultValue={t.instagram} placeholder="@sua_empresa"/></label>
      <small>{t.instagram_username?`Feed conectado: @${t.instagram_username}. Suas últimas fotos aparecem no site.`:"Conecte o feed para mostrar suas últimas fotos no site."}</small>
      <div className="cfg-net-actions">{insta&&<a className="secondary-action" href={"https://www.instagram.com/"+insta} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Ver perfil</a>}<button type="button" className="secondary-action" onClick={connectInstagram} disabled={!!busy}><Instagram size={15}/>{t.instagram_username?"Reconectar feed":"Conectar feed"}</button></div>
     </div>
     <div className="cfg-net">
      <div className="cfg-net-title"><span className="cfg-net-icon wa"><MessageCircle size={18}/></span><strong>WhatsApp</strong>{wa&&<em><CheckCircle2 size={13}/>Configurado</em>}</div>
      <label>Número para contato<PhoneInput name="whatsapp" defaultValue={t.whatsapp}/></label>
      <small>Os clientes falam com você por esse número. A conexão do robô fica no menu WhatsApp.</small>
      <div className="cfg-net-actions">{wa&&<a className="secondary-action" href={"https://wa.me/55"+wa} target="_blank" rel="noreferrer"><MessageCircle size={15}/>Testar</a>}<a className="secondary-action" href="/dashboard/whatsapp"><QrCode size={15}/>Conectar robô</a></div>
     </div>
    </div>
   </section>
  </form>

  {crop&&<ImageCropper file={crop.file} shape={crop.field==="cover_url"?"wide":"rounded"} aspect={crop.field==="cover_url"?3:1} output={crop.field==="cover_url"?1800:800} title={crop.field==="cover_url"?"Ajustar capa":"Ajustar logo"} onCancel={()=>setCrop(null)} onDone={async f=>{const field=crop.field;setCrop(null);await changeImage(field,f)}}/>}
  <ScheduleManager workspace={workspace} mode="hours"/>

  <form className="cfg-card cfg-pix" onSubmit={savePayment}>
   <div className="cfg-card-head"><h3>Cobrança e PIX</h3><p>Usado para gerar o QR Code do PIX ao finalizar atendimentos e vendas.</p></div>
   <div className="cfg-grid three"><label>Chave PIX<input name="pix_key" defaultValue={t.pix_key||""} required/></label><label>Nome do recebedor<input name="pix_name" maxLength="25" defaultValue={t.pix_name||t.name||""} required/></label><label>Cidade<input name="pix_city" maxLength="15" defaultValue={t.pix_city||"SAO PAULO"} required/></label></div>
   <div className="sch-save"><button className="primary" disabled={!!busy}><Save size={16}/>{busy==="pix"?"Salvando...":"Salvar PIX"}</button></div>
  </form>
 </div>;
}
export default function SettingsPage(){return <ModuleShell title="Configurações" eyebrow="Site e horários">{workspace=><SettingsContent workspace={workspace}/>}</ModuleShell>}
