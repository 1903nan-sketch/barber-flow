"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import QRCode from "qrcode";
import ModuleShell from "../_components/ModuleShell";
import {Check,CircleDollarSign,Copy,CreditCard,RefreshCw,ShieldCheck} from "lucide-react";
import {supabase} from "../../../lib/supabase";

const money=cents=>(Number(cents||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const ptDate=v=>v?new Date(v+"T12:00:00").toLocaleDateString("pt-BR"):"—";

async function accessToken(){return (await supabase.auth.getSession()).data.session?.access_token||""}

function PixBox({pix}){
 const [copied,setCopied]=useState(false),[qr,setQr]=useState("");
 const payload=pix?.payload||"";
 useEffect(()=>{
  if(pix?.encoded_image){setQr("data:image/png;base64,"+pix.encoded_image);return}
  if(payload)QRCode.toDataURL(payload,{width:240,margin:1}).then(setQr).catch(()=>setQr(""));
 },[payload,pix?.encoded_image]);
 if(!payload&&!qr)return <div className="form-alert">A cobrança PIX foi criada. Atualize esta tela em alguns segundos para carregar o QR Code.</div>;
 return <div className="monthly-pix">
  <div className="monthly-qr">{qr&&<img src={qr} alt="QR Code PIX" width="220" height="220"/>}</div>
  <p>Escaneie o QR Code ou use o PIX Copia e Cola.</p>
  {payload&&<button className="monthly-copy" type="button" onClick={async()=>{await navigator.clipboard.writeText(payload);setCopied(true);setTimeout(()=>setCopied(false),1800)}}>{copied?<><Check size={17}/> PIX copiado</>:<><Copy size={17}/> Copiar código PIX</>}</button>}
  <small><ShieldCheck size={14}/> Cobrança vinculada à mensalidade BarberTix</small>
 </div>
}

function BillingContent({workspace}){
 const [info,setInfo]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[error,setError]=useState(""),[message,setMessage]=useState("");
 const tenant=workspace.tenant;
 const fallbackAmount=useMemo(()=>{
  const base=tenant?.plans?.monthly_cents||0,surcharge=Number(tenant?.no_commitment_surcharge_pct||0),discount=Number(tenant?.discount_pct||0),months=Number(tenant?.discount_months||0),started=tenant?.discount_started_at?new Date(tenant.discount_started_at+"T12:00:00"):null,end=started?new Date(started.getFullYear(),started.getMonth()+months,started.getDate()):null,active=discount>0&&months>0&&end&&new Date()<end;
  return Math.max(0,Math.round(base*(1+surcharge/100)*(1-(active?discount:0)/100)));
 },[tenant]);
 const load=useCallback(async()=>{
  if(!tenant?.id)return;
  setLoading(true);setError("");
  try{
   const token=await accessToken(),r=await fetch("/api/billing/status?tenant_id="+encodeURIComponent(tenant.id),{headers:{authorization:"Bearer "+token},cache:"no-store"}),j=await r.json();
   if(!r.ok)throw new Error(j.error||"Não foi possível carregar a mensalidade.");
   setInfo(j);
  }catch(e){setError(e.message)}finally{setLoading(false)}
 },[tenant?.id]);
 useEffect(()=>{load()},[load]);
 useEffect(()=>{const p=new URLSearchParams(window.location.search).get("pagamento");if(p==="sucesso")setMessage("Dados enviados ao Asaas. A confirmação financeira aparecerá automaticamente após o webhook.");else if(p==="cancelado")setMessage("Checkout cancelado. Nenhuma baixa foi feita.");else if(p==="expirado")setMessage("O checkout expirou. Você pode gerar um novo.")},[]);
 async function pay(method){
  setBusy(method);setError("");setMessage("");
  try{
   const token=await accessToken(),r=await fetch("/api/billing/checkout",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},body:JSON.stringify({tenant_id:tenant.id,method})}),j=await r.json();
   if(!r.ok)throw new Error(j.error||"Não foi possível iniciar o pagamento.");
   if(j.kind==="redirect"&&j.url){window.location.href=j.url;return}
   if(j.kind==="active")setMessage(j.message||"Cobrança recorrente já configurada.");
   if(j.kind==="pix")setInfo(v=>({...v,pix:j.pix,billing_method:"PIX",has_subscription:true,amount_cents:j.amount_cents||v?.amount_cents}));
   await load();
  }catch(e){setError(e.message)}finally{setBusy("")}
 }
 const amount=info?.amount_cents??fallbackAmount,due=info?.due_date||tenant?.billing_due_date,online=Boolean(info?.configured),cardActive=info?.billing_method==="CREDIT_CARD"&&info?.has_subscription;
 return <div className="monthly-wrap">
  {error&&<div className="form-alert error">{error}</div>}
  {message&&<div className="form-alert success">{message}</div>}
  <section className="monthly-card">
   <div className="monthly-plan">
    <span>PLANO ATUAL</span>
    <h2>{tenant?.plans?.name||"Plano contratado"}</h2>
    <p>{tenant?.name}</p>
    <strong>{money(amount)}<small>/mês</small></strong>
    <div className="monthly-due"><span>Próximo vencimento</span><b>{ptDate(due)}</b></div>
    {info?.provider==="asaas"&&<div className="monthly-due"><span>Cobrança</span><b>{info.billing_method==="CREDIT_CARD"?"Cartão recorrente":info.billing_method==="PIX"?"PIX":"Asaas"}</b></div>}
    {info?.provider_status&&<small>Status Asaas: {info.provider_status}</small>}
   </div>
   <div className="monthly-payment">
    <span className="monthly-label">PAGAR MENSALIDADE</span>
    <h3>{online?"Pagamento online":"Pagamento indisponível"}</h3>
    {loading?<p>Carregando cobrança...</p>:online?<>
     <p>Escolha como deseja manter sua mensalidade. No cartão, as próximas cobranças são recorrentes. No PIX, cada cobrança mensal fica disponível nesta tela.</p>
     {cardActive?<div className="form-alert success"><CreditCard size={17}/><strong> Cartão configurado.</strong> As próximas cobranças serão processadas pelo Asaas.</div>:<div style={{display:"flex",gap:10,flexWrap:"wrap",margin:"16px 0"}}>
      <button className="primary" type="button" disabled={Boolean(busy)} onClick={()=>pay("CREDIT_CARD")}><CreditCard size={17}/>{busy==="CREDIT_CARD"?"Abrindo...":"Pagar com cartão"}</button>
      <button className="secondary-action" type="button" disabled={Boolean(busy)} onClick={()=>pay("PIX")}><CircleDollarSign size={17}/>{busy==="PIX"?"Gerando...":"Gerar PIX"}</button>
      <button className="secondary-action" type="button" disabled={loading} onClick={load}><RefreshCw size={15}/>Atualizar</button>
     </div>}
     {info?.billing_method==="PIX"&&info?.has_subscription&&<PixBox pix={info.pix}/>}
     {info?.pix_error&&<small>{info.pix_error}</small>}
    </>:<>
     <p>A cobrança online ainda não está configurada. Nenhum pagamento será confirmado manualmente ou direcionado para uma chave fixa.</p>
     <div className="form-alert">Fale com o suporte BarberTix para ativar o provedor de pagamentos.</div>
    </>}
   </div>
  </section>
 </div>
}

export default function Mensalidade(){
 return <ModuleShell title="Mensalidade" eyebrow="Conta">{workspace=><BillingContent workspace={workspace}/>}</ModuleShell>
}
