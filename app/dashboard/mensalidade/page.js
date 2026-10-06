"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import QRCode from "qrcode";
import ModuleShell from "../_components/ModuleShell";
import {Check,CircleDollarSign,Copy,CreditCard,ShieldCheck} from "lucide-react";
import {supabase} from "../../../lib/supabase";

const money=cents=>(Number(cents||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const ptDate=v=>v?new Date(String(v).slice(0,10)+"T12:00:00").toLocaleDateString("pt-BR"):"—";
async function accessToken(){return (await supabase.auth.getSession()).data.session?.access_token||""}

function PixBox({pix}){
 const [copied,setCopied]=useState(false),[qr,setQr]=useState("");
 const payload=pix?.payload||"";
 useEffect(()=>{
  if(pix?.encoded_image){setQr("data:image/png;base64,"+pix.encoded_image);return}
  if(payload)QRCode.toDataURL(payload,{width:240,margin:1}).then(setQr).catch(()=>setQr(""));
 },[payload,pix?.encoded_image]);
 const invoice=pix?.invoice_url?<a className="secondary-action monthly-invoice" href={pix.invoice_url} target="_blank" rel="noreferrer">Abrir fatura no Asaas</a>:null;
 if(pix?.no_pending){const br=v=>v?new Date(v+"T12:00:00").toLocaleDateString("pt-BR"):"";return <div className="form-alert"><p><strong>Nenhuma cobrança em aberto.</strong> {pix.next_due_date?<span>Próximo vencimento: {br(pix.next_due_date)}. O QR Code aparecerá quando o Asaas gerar a cobrança.</span>:<span>O Asaas ainda não gerou a próxima cobrança.</span>}</p></div>}
 if(!payload&&!qr)return pix?.qr_error||pix?.invoice_url?<div className="form-alert"><p>{pix.qr_error||"O QR Code ainda não está disponível."}</p>{invoice}</div>:<div className="form-alert">A cobrança PIX foi criada. Aguarde alguns segundos e abra esta tela novamente.</div>;
 return <div className="monthly-pix">
  <div className="monthly-qr">{qr&&<img src={qr} alt="QR Code PIX" width="220" height="220"/>}</div>
  <p>Escaneie o QR Code ou use o PIX Copia e Cola.</p>
  {payload&&<button className="monthly-copy" type="button" onClick={async()=>{await navigator.clipboard.writeText(payload);setCopied(true);setTimeout(()=>setCopied(false),1800)}}>{copied?<><Check size={17}/> PIX copiado</>:<><Copy size={17}/> Copiar código PIX</>}</button>}
  {invoice}
  <small><ShieldCheck size={14}/> Cobrança vinculada à mensalidade BeautyTix</small>
 </div>
}

function BillingContent({workspace}){
 const [info,setInfo]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[error,setError]=useState(""),[message,setMessage]=useState(""),[taxId,setTaxId]=useState(""),[addr,setAddr]=useState(null);
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
 useEffect(()=>{const p=new URLSearchParams(window.location.search).get("pagamento");if(p==="sucesso")setMessage("Dados enviados ao Asaas. A confirmação financeira aparecerá automaticamente.");else if(p==="cancelado")setMessage("Checkout cancelado. Nenhuma baixa foi feita.");else if(p==="expirado")setMessage("O checkout expirou. Você pode gerar um novo.")},[]);
 async function pay(method){
  const switching=info?.has_subscription&&info?.billing_method&&info.billing_method!==method;
  if(switching&&!window.confirm(method==="PIX"?"Trocar a mensalidade do cartão para Pix? A cobrança recorrente no cartão será cancelada.":"Trocar a mensalidade do Pix para cartão? A cobrança Pix em aberto será cancelada."))return;
  setBusy(method);setError("");setMessage("");
  try{
   const token=await accessToken(),r=await fetch("/api/billing/checkout",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},body:JSON.stringify({tenant_id:tenant.id,method,tax_id:info?.needs_tax_id?taxId:undefined,address:method==="CREDIT_CARD"&&addr?.open?addr:undefined})}),j=await r.json();
   if(!r.ok){
    if(j.code==="tax_id_required")setInfo(v=>({...v,needs_tax_id:true}));
    if(j.code==="address_required"&&!addr?.open){setAddr({open:true,postalCode:"",address:"",addressNumber:"",complement:"",province:"",city:""});setMessage("Informe o endereço do responsável e clique em Pagar com cartão novamente.");return}
    throw new Error(j.error||"Não foi possível iniciar o pagamento.");
   }
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
     <p>Escolha a forma de pagamento. No cartão, as próximas mensalidades são recorrentes. No PIX, o Asaas disponibiliza a cobrança mensal nesta tela.</p>
     {addr?.open&&!cardActive&&<div className="monthly-address"><b>Endereço do responsável</b>
      <label>CEP<input value={addr.postalCode} inputMode="numeric" placeholder="00000-000" onChange={e=>{const v=e.target.value;setAddr(a=>({...a,postalCode:v}));const d=v.replace(/\D/g,"");if(d.length===8)fetch("https://viacep.com.br/ws/"+d+"/json/").then(r=>r.json()).then(x=>{if(!x.erro)setAddr(a=>({...a,address:x.logradouro||a.address,province:x.bairro||a.province,city:x.localidade?x.localidade+"/"+x.uf:a.city}))}).catch(()=>{})}}/></label>
      <label className="wide">Rua<input value={addr.address} onChange={e=>setAddr(a=>({...a,address:e.target.value}))}/></label>
      <label>Número<input value={addr.addressNumber} onChange={e=>setAddr(a=>({...a,addressNumber:e.target.value}))}/></label>
      <label>Complemento<input value={addr.complement} onChange={e=>setAddr(a=>({...a,complement:e.target.value}))}/></label>
      <label>Bairro<input value={addr.province} onChange={e=>setAddr(a=>({...a,province:e.target.value}))}/></label>
      <label>Cidade<input value={addr.city} readOnly placeholder="Preenchida pelo CEP"/></label>
     </div>}
     {info?.needs_tax_id&&!cardActive&&<label className="monthly-taxid">CPF ou CNPJ do responsável<input value={taxId} onChange={e=>setTaxId(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00"/><small>Informado uma única vez para o Asaas emitir a cobrança.</small></label>}
     {info?.has_subscription&&<p className="monthly-current">Forma atual: <b>{info.billing_method==="CREDIT_CARD"?"Cartão de crédito (recorrente)":"Pix (cobrança mensal)"}</b></p>}
     {cardActive?<><div className="form-alert success"><CreditCard size={17}/><strong> Cartão configurado.</strong> As próximas cobranças serão processadas pelo Asaas.</div><button className="secondary-action" type="button" disabled={Boolean(busy)} onClick={()=>pay("PIX")}><CircleDollarSign size={17}/>{busy==="PIX"?"Trocando...":"Trocar para Pix"}</button></>:<div className="monthly-actions">
      <button className="primary" type="button" disabled={Boolean(busy)} onClick={()=>pay("CREDIT_CARD")}><CreditCard size={17}/>{busy==="CREDIT_CARD"?"Abrindo...":info?.billing_method==="PIX"&&info?.has_subscription?"Trocar para cartão":"Pagar com cartão"}</button>
      <button className="secondary-action" type="button" disabled={Boolean(busy)} onClick={()=>pay("PIX")}><CircleDollarSign size={17}/>{busy==="PIX"?"Gerando...":info?.billing_method==="PIX"&&info?.has_subscription?"Ver PIX do mês":"Pagar com PIX"}</button>
     </div>}
     {info?.billing_method==="PIX"&&info?.has_subscription&&<PixBox pix={info.pix}/>}
     {info?.pix_error&&<small>{info.pix_error}</small>}
    </>:<>
     <p>A cobrança online ainda não está configurada neste BeautyTix.</p>
     <div className="form-alert">Ative o Asaas no projeto BeautyTix para liberar PIX e cartão.</div>
    </>}
   </div>
  </section>
 </div>
}

export default function Mensalidade(){
 return <ModuleShell title="Mensalidade" eyebrow="Conta">{workspace=><BillingContent workspace={workspace}/>}</ModuleShell>
}
