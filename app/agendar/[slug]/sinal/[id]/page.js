"use client";
import "../../../../booking-v2.css";
import {useCallback,useEffect,useState} from "react";
import {useParams} from "next/navigation";
import QRCode from "qrcode";
import {CheckCircle2,Clock,Copy,MessageCircle,ShieldCheck,XCircle} from "lucide-react";

const money=v=>(Number(v||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const waNumber=v=>{const n=String(v||"").replace(/\D/g,"");return n.length===10||n.length===11?"55"+n:n};
const maskDoc=v=>{const d=String(v||"").replace(/\D/g,"").slice(0,14);if(d.length<=11)return d.replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d{1,2})$/,"$1-$2");return d.replace(/^(\d{2})(\d)/,"$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/,"$1.$2.$3").replace(/\.(\d{3})(\d)/,".$1/$2").replace(/(\d{4})(\d)/,"$1-$2")};

export default function DepositPage(){
 const {slug,id}=useParams();
 const [info,setInfo]=useState(null),[error,setError]=useState(""),[qr,setQr]=useState(""),[left,setLeft]=useState(null),[doc,setDoc]=useState(""),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false);

 const create=useCallback(async(document)=>{
  setBusy(true);setError("");
  try{
   const r=await fetch("/api/deposits",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({slug,appointment:id,document})});
   const j=await r.json();if(!r.ok)throw new Error(j.error||"Não foi possível gerar o PIX.");
   setInfo(j);
  }catch(e){setError(e.message)}finally{setBusy(false)}
 },[slug,id]);

 const refresh=useCallback(async()=>{
  try{const r=await fetch(`/api/deposits?slug=${encodeURIComponent(slug)}&appointment=${encodeURIComponent(id)}`,{cache:"no-store"});const j=await r.json();if(r.ok)setInfo(i=>({...i,...j}));else setError(j.error)}catch{}
 },[slug,id]);

 useEffect(()=>{create()},[create]);
 useEffect(()=>{if(info?.status!=="pending")return;const t=setInterval(refresh,6000);return()=>clearInterval(t)},[info?.status,refresh]);
 useEffect(()=>{
  if(!info?.expires_at)return;
  const tick=()=>setLeft(Math.max(0,Math.floor((new Date(info.expires_at).getTime()-Date.now())/1000)));
  tick();const t=setInterval(tick,1000);return()=>clearInterval(t);
 },[info?.expires_at]);
 useEffect(()=>{
  if(info?.pix_qr_image){setQr(info.pix_qr_image);return}
  if(info?.pix_payload)QRCode.toDataURL(info.pix_payload,{width:420,margin:1}).then(setQr).catch(()=>setQr(""));else setQr("");
 },[info?.pix_payload,info?.pix_qr_image]);

 const contact=waNumber(info?.whatsapp);
 const when=info?.starts_at?new Date(info.starts_at):null;
 const tz=info?.timezone||undefined;
 const summary=info&&<div className="bk-card bk-summary" style={{textAlign:"left"}}>
  <div><span>Barbearia</span><b>{info.barbershop}</b></div>
  <div><span>Serviço</span><b>{info.service}</b></div>
  {info.barber&&<div><span>Profissional</span><b>{info.barber}</b></div>}
  {when&&<div><span>Quando</span><b>{when.toLocaleDateString("pt-BR",{timeZone:tz,weekday:"short",day:"2-digit",month:"2-digit"})} às {when.toLocaleTimeString("pt-BR",{timeZone:tz,hour:"2-digit",minute:"2-digit"})}</b></div>}
  <div><span>Total do serviço</span><b>{money(info.price_cents)}</b></div>
  <div className="bk-total"><span>Sinal agora</span><b>{money(info.amount_cents)}</b></div>
 </div>;

 if(!info&&!error)return <main className="bk"><div className="bk-done"><p style={{color:"#8d97aa"}}>Gerando seu PIX...</p></div></main>;
 if(!info)return <main className="bk"><div className="bk-done"><XCircle size={42}/><h1>Não foi possível abrir o pagamento</h1><p style={{color:"#8d97aa"}}>{error}</p><a className="bk-cta ghost" href={"/agendar/"+slug}>Voltar à agenda</a></div></main>;

 if(info.status==="paid")return <main className="bk"><section className="bk-done"><div className="bk-ok"><CheckCircle2 size={40}/></div><h1>Sinal pago. Horário confirmado!</h1><p style={{color:"#b8c0cf",margin:0}}>Você receberá a confirmação e um lembrete pelo WhatsApp.</p>{summary}{contact&&<a className="bk-cta green" href={"https://wa.me/"+contact} target="_blank" rel="noreferrer"><MessageCircle size={17}/>Falar com a barbearia</a>}</section></main>;

 if(info.status!=="pending"||left===0)return <main className="bk"><section className="bk-done"><XCircle size={42} color="#ff8a99" style={{margin:"0 auto"}}/><h1>Reserva expirada</h1><p style={{color:"#b8c0cf",margin:0}}>O prazo para pagar o sinal terminou e o horário foi liberado. Se você já pagou, fale com a barbearia.</p>{summary}<a className="bk-cta" href={"/agendar/"+slug}>Escolher novo horário</a>{contact&&<a className="bk-cta ghost" href={"https://wa.me/"+contact} target="_blank" rel="noreferrer"><MessageCircle size={17}/>Falar com a barbearia</a>}</section></main>;

 const secs=left??0,mm=String(Math.floor(secs/60)).padStart(2,"0"),ss=String(secs%60).padStart(2,"0");
 return <main className="bk"><section className="bk-done">
  <span style={{color:"#a593ff",fontSize:11,letterSpacing:".14em",fontWeight:800}}>PAGAMENTO DO SINAL</span>
  <h1>Pague {money(info.amount_cents)} para garantir</h1>
  <div><div className="bk-timer"><Clock size={20}/> {mm}:{ss}</div><small style={{color:"#8d97aa"}}>Seu horário fica reservado até o fim do prazo.</small></div>
  {info.needs_document?<form className="bk-card" style={{textAlign:"left"}} onSubmit={e=>{e.preventDefault();create(doc)}}>
   <label className="bk-field">CPF do pagador <span style={{color:"#8d97aa",fontWeight:500}}>(exigido para gerar o PIX)</span><input value={doc} onChange={e=>setDoc(maskDoc(e.target.value))} inputMode="numeric" placeholder="000.000.000-00" required/></label>
   <button className="bk-cta" style={{width:"100%"}} disabled={busy}>{busy?"Gerando PIX...":"Gerar PIX"}</button>
  </form>:info.pix_payload?<>
   {qr&&<img className="bk-qr" src={qr} alt="QR Code PIX do sinal"/>}
   <div className="bk-code">{info.pix_payload}</div>
   <button type="button" className="bk-cta" onClick={()=>navigator.clipboard.writeText(info.pix_payload).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000)})}><Copy size={16}/>{copied?"Código copiado!":"Copiar PIX Copia e Cola"}</button>
   <p style={{color:"#8d97aa",fontSize:12.5,margin:0}}>{info.gateway==="asaas"?<><ShieldCheck size={13}/> A confirmação é automática: esta tela atualiza sozinha assim que o pagamento cair.</>:"Após pagar, envie o comprovante pelo WhatsApp. A barbearia confirma o seu horário."}</p>
   {info.gateway!=="asaas"&&contact&&<a className="bk-cta green" href={"https://wa.me/"+contact+"?text="+encodeURIComponent("Olá! Paguei o sinal do meu agendamento. Segue o comprovante.")} target="_blank" rel="noreferrer"><MessageCircle size={17}/>Enviar comprovante</a>}
  </>:<div className="bk-error">A barbearia ainda não configurou o recebimento por PIX. Fale com ela pelo WhatsApp para garantir o horário.{contact&&<><br/><a href={"https://wa.me/"+contact} style={{color:"#fff"}}>Abrir WhatsApp</a></>}</div>}
  {error&&<div className="bk-error">{error}</div>}
  {summary}
 </section></main>;
}
