"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import QRCode from "qrcode";
import {CalendarPlus,Check,CircleDollarSign,Copy,CreditCard,ShieldCheck} from "lucide-react";
import {supabase} from "../../../lib/supabase";

const money=cents=>(Number(cents||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const ptDate=v=>v?new Date(String(v).slice(0,10)+"T12:00:00").toLocaleDateString("pt-BR"):"—";
const nextMonth=v=>{const d=new Date(String(v).slice(0,10)+"T12:00:00Z");d.setUTCMonth(d.getUTCMonth()+1);return d.toISOString().slice(0,10)};

async function accessToken(){return (await supabase.auth.getSession()).data.session?.access_token||""}

function PixBox({pix}){
 const [copied,setCopied]=useState(false),[qr,setQr]=useState("");
 const payload=pix?.payload||"";
 useEffect(()=>{
  if(pix?.encoded_image){setQr("data:image/png;base64,"+pix.encoded_image);return}
  if(payload)QRCode.toDataURL(payload,{width:240,margin:1}).then(setQr).catch(()=>setQr(""));
 },[payload,pix?.encoded_image]);
 const invoice=pix?.invoice_url?<a className="secondary-action monthly-invoice" href={pix.invoice_url} target="_blank" rel="noreferrer">Abrir fatura no Asaas</a>:null;
 if(pix?.no_pending){const br=v=>v?new Date(v+"T12:00:00").toLocaleDateString("pt-BR"):"";return <div className="form-alert"><p><strong>Nenhuma cobrança em aberto.</strong> {pix.next_due_date?`O próximo vencimento é ${br(pix.next_due_date)}. O Asaas gera a cobrança PIX 40 dias antes do vencimento, então o QR Code aparece aqui a partir de ${br(pix.available_from)}.`:"O Asaas ainda não gerou a próxima cobrança desta assinatura."}</p></div>}
 if(!payload&&!qr)return pix?.qr_error||pix?.invoice_url?<div className="form-alert"><p>{pix.qr_error||"O QR Code ainda não está disponível."}</p>{invoice}</div>:<div className="form-alert billing-waiting"><span className="billing-pulse" aria-hidden="true"/>Gerando o QR Code do PIX...</div>;
 return <div className="monthly-pix">
  <div className="monthly-qr">{qr&&<img src={qr} alt="QR Code PIX" width="220" height="220"/>}</div>
  <p>Escaneie o QR Code ou use o PIX Copia e Cola.</p>
  {payload&&<button className="monthly-copy" type="button" onClick={async()=>{await navigator.clipboard.writeText(payload);setCopied(true);setTimeout(()=>setCopied(false),1800)}}>{copied?<><Check size={17}/> PIX copiado</>:<><Copy size={17}/> Copiar código PIX</>}</button>}
  {invoice}
  <small><ShieldCheck size={14}/> Cobrança vinculada à mensalidade BarberTix</small>
 </div>
}

export default function BillingPanel({workspace,locked=null}){
 const [info,setInfo]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[error,setError]=useState(""),[message,setMessage]=useState(""),[taxId,setTaxId]=useState(""),[addr,setAddr]=useState(null),[plans,setPlans]=useState([]);
 const tenant=workspace.tenant;
 const fallbackAmount=useMemo(()=>{
  const base=tenant?.plans?.monthly_cents||0,surcharge=Number(tenant?.no_commitment_surcharge_pct||0),discount=Number(tenant?.discount_pct||0),months=Number(tenant?.discount_months||0),started=tenant?.discount_started_at?new Date(tenant.discount_started_at+"T12:00:00"):null,end=started?new Date(started.getFullYear(),started.getMonth()+months,started.getDate()):null,active=discount>0&&months>0&&end&&new Date()<end;
  return Math.max(0,Math.round(base*(1+surcharge/100)*(1-(active?discount:0)/100)));
 },[tenant]);
 // silent: background refresh without swapping the panel for the loading state.
 const load=useCallback(async({silent=false}={})=>{
  if(!tenant?.id)return;
  if(!silent){setLoading(true);setError("")}
  try{
   const token=await accessToken(),r=await fetch("/api/billing/status?tenant_id="+encodeURIComponent(tenant.id),{headers:{authorization:"Bearer "+token},cache:"no-store"}),j=await r.json();
   if(!r.ok)throw new Error(j.error||"Não foi possível carregar a mensalidade.");
   setInfo(j);
  }catch(e){if(!silent)setError(e.message)}finally{if(!silent)setLoading(false)}
 },[tenant?.id]);
 useEffect(()=>{load()},[load]);
 useEffect(()=>{supabase.from("plans").select("id,name,monthly_cents,description,sort_order").in("name",["Starter","Pro","Pro + Filiais"]).order("sort_order").then(({data})=>setPlans(data||[]))},[]);
 async function refresh(){await load();workspace.reload?.()}

 // No "refresh" button: while something is waiting to be paid, watch the shop's billing
 // fields (cheap, no Asaas call) and reload everything as soon as the webhook lands.
 const [returnedFromCheckout]=useState(()=>typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("pagamento")==="sucesso");
 const hasQr=pix=>Boolean(pix&&!pix.no_pending&&(pix.payload||pix.encoded_image||pix.invoice_url));
 const qrPending=Boolean(info?.pix&&!info.pix.no_pending&&!info.pix.payload&&!info.pix.encoded_image&&!info.pix.qr_error&&!info.pix.invoice_url);
 const waiting=Boolean(info&&(hasQr(info.pix)||hasQr(info.advance)||returnedFromCheckout||locked));
 const reloadWorkspace=workspace.reload;
 const seen=useRef(null);
 useEffect(()=>{seen.current=info?[info.status,info.due_date,info.last_paid_at].join("|"):null},[info]);
 useEffect(()=>{
  if(!waiting||!tenant?.id)return;
  let stopped=false;const started=Date.now();
  const tick=async()=>{
   if(document.hidden||stopped)return;
   if(Date.now()-started>30*60000){clearInterval(timer);return}
   const {data}=await supabase.from("tenants").select("status,billing_due_date,last_paid_at").eq("id",tenant.id).maybeSingle();
   if(stopped||!data||seen.current===null)return;
   const now=[data.status,data.billing_due_date,data.last_paid_at].join("|");
   if(now!==seen.current){
    const paid=String(data.last_paid_at||"")!==String(seen.current.split("|")[2]||"");
    seen.current=now;
    if(paid)setMessage(`Pagamento confirmado! Próximo vencimento: ${ptDate(data.billing_due_date)}.`);
    await load({silent:true});reloadWorkspace?.();
   }
  };
  const timer=setInterval(tick,5000);
  const onVisible=()=>{if(!document.hidden)tick()};
  document.addEventListener("visibilitychange",onVisible);
  return()=>{stopped=true;clearInterval(timer);document.removeEventListener("visibilitychange",onVisible)};
 },[waiting,tenant?.id,load,reloadWorkspace]);
 // The Asaas QR Code can take a few seconds after the charge is created: retry quietly.
 useEffect(()=>{
  if(!qrPending)return;
  let tries=0;const timer=setInterval(()=>{if(++tries>8)clearInterval(timer);else load({silent:true})},4000);
  return()=>clearInterval(timer);
 },[qrPending,load]);
 async function choosePlan(plan){
  if(busy||plan.id===info?.plan_id)return;
  if(!window.confirm(`Mudar para o plano ${plan.name} (${money(plan.monthly_cents)}/mês)?`))return;
  setBusy("plan");setError("");setMessage("");
  try{
   const token=await accessToken(),r=await fetch("/api/billing/plan",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},body:JSON.stringify({tenant_id:tenant.id,plan_id:plan.id})}),j=await r.json();
   if(!r.ok)throw new Error(j.error||"Não foi possível trocar o plano.");
   setMessage(`Plano ${j.plan||plan.name} selecionado. Agora escolha como pagar.`);
   await refresh();
  }catch(e){setError(e.message)}finally{setBusy("")}
 }
 async function payAdvance(){
  setBusy("advance");setError("");setMessage("");
  try{
   const token=await accessToken(),r=await fetch("/api/billing/advance",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},body:JSON.stringify({tenant_id:tenant.id,tax_id:info?.needs_tax_id?taxId:undefined})}),j=await r.json();
   if(!r.ok){if(j.code==="tax_id_required")setInfo(v=>({...v,needs_tax_id:true}));throw new Error(j.error||"Não foi possível gerar o pagamento adiantado.")}
   setInfo(v=>j.source==="subscription"?{...v,pix:j.pix}:{...v,advance:j.pix});
  }catch(e){setError(e.message)}finally{setBusy("")}
 }
 useEffect(()=>{const p=new URLSearchParams(window.location.search).get("pagamento");if(p==="sucesso")setMessage("Dados enviados ao Asaas. A confirmação financeira aparecerá automaticamente após o webhook.");else if(p==="cancelado")setMessage("Checkout cancelado. Nenhuma baixa foi feita.");else if(p==="expirado")setMessage("O checkout expirou. Você pode gerar um novo.")},[]);
 async function pay(method){
  const switching=info?.has_subscription&&info?.billing_method&&info.billing_method!==method;
  if(switching&&!window.confirm(method==="PIX"?"Trocar a mensalidade do cartão para Pix? A cobrança recorrente no cartão será cancelada e as próximas virão por Pix.":"Trocar a mensalidade do Pix para cartão? A cobrança Pix em aberto será cancelada e você cadastrará o cartão no Asaas."))return;
  setBusy(method);setError("");setMessage("");
  try{
   const token=await accessToken(),r=await fetch("/api/billing/checkout",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},body:JSON.stringify({tenant_id:tenant.id,method,tax_id:info?.needs_tax_id?taxId:undefined,address:method==="CREDIT_CARD"&&addr?.open?addr:undefined})}),j=await r.json();
   if(!r.ok){if(j.code==="tax_id_required")setInfo(v=>({...v,needs_tax_id:true}));if(j.code==="address_required"&&!addr?.open){setAddr({open:true,postalCode:"",address:"",addressNumber:"",complement:"",province:"",city:""});setMessage("Informe o endereço do responsável e clique em Pagar com cartão de novo.");return}throw new Error(j.error||"Não foi possível iniciar o pagamento.")}
   if(j.kind==="redirect"&&j.url){window.location.href=j.url;return}
   if(j.kind==="active")setMessage(j.message||"Cobrança recorrente já configurada.");
   if(j.kind==="pix")setInfo(v=>({...v,pix:j.pix,billing_method:"PIX",has_subscription:true,amount_cents:j.amount_cents||v?.amount_cents}));
   await load();
  }catch(e){setError(e.message)}finally{setBusy("")}
 }
 const amount=info?.amount_cents??fallbackAmount,due=info?.due_date||tenant?.billing_due_date,online=Boolean(info?.configured),cardActive=info?.billing_method==="CREDIT_CARD"&&info?.has_subscription;
 return <div className="monthly-wrap">
  {locked==="trial_ended"&&<div className="billing-lock"><h2>Seu teste grátis de 14 dias terminou</h2><p>Escolha um plano e faça o pagamento para liberar o sistema. Seus dados continuam salvos e tudo volta a funcionar assim que o pagamento for confirmado.</p></div>}
  {locked==="blocked"&&<div className="billing-lock"><h2>Acesso suspenso por mensalidade em aberto</h2><p>Pague a mensalidade abaixo para liberar o sistema. Seus dados continuam salvos e o acesso volta assim que o pagamento for confirmado.</p></div>}
  {!locked&&info?.status==="trial"&&info?.trial_ends_at&&<div className="billing-lock"><h2>Teste grátis até {ptDate(info.trial_ends_at)}</h2><p>Escolha seu plano e a forma de pagamento quando quiser. A primeira cobrança vence no fim do teste; pagando antes, o sistema já fica ativo.</p></div>}
  {error&&<div className="form-alert error">{error}</div>}
  {message&&<div className="form-alert success">{message}</div>}
  {info?.can_change_plan&&plans.length>1&&<section className="box"><div className="plan-picker-head"><h3>{locked?"Escolha seu plano":"Seu plano"}</h3><small>Você pode trocar até o primeiro pagamento</small></div><div className="plan-picker">{plans.map(p=><button type="button" key={p.id} className={"plan-option"+(p.id===info.plan_id?" selected":"")} disabled={Boolean(busy)} onClick={()=>choosePlan(p)}>{p.id===info.plan_id&&<em>PLANO SELECIONADO</em>}<b>{p.name}</b><strong>{money(p.monthly_cents)}<small>/mês</small></strong><span>{p.description}</span></button>)}</div></section>}
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
     <p>Escolha como deseja manter sua mensalidade. No cartão, as próximas cobranças são recorrentes. No PIX, o Asaas gera a cobrança mensal com QR Code Pix nesta tela.</p>
     {addr?.open&&!cardActive&&<div className="monthly-address"><b>Endereço do responsável (exigido pelo Asaas para cartão)</b>
      <label>CEP<input value={addr.postalCode} inputMode="numeric" placeholder="00000-000" onChange={e=>{const v=e.target.value;setAddr(a=>({...a,postalCode:v}));const d=v.replace(/\D/g,"");if(d.length===8)fetch("https://viacep.com.br/ws/"+d+"/json/").then(r=>r.json()).then(x=>{if(!x.erro)setAddr(a=>({...a,address:x.logradouro||a.address,province:x.bairro||a.province,city:x.localidade?x.localidade+"/"+x.uf:a.city}))}).catch(()=>{})}}/></label>
      <label className="wide">Rua<input value={addr.address} onChange={e=>setAddr(a=>({...a,address:e.target.value}))}/></label>
      <label>Número<input value={addr.addressNumber} onChange={e=>setAddr(a=>({...a,addressNumber:e.target.value}))}/></label>
      <label>Complemento<input value={addr.complement} onChange={e=>setAddr(a=>({...a,complement:e.target.value}))}/></label>
      <label>Bairro<input value={addr.province} onChange={e=>setAddr(a=>({...a,province:e.target.value}))}/></label>
      <label>Cidade<input value={addr.city} readOnly placeholder="Preenchida pelo CEP"/></label></div>}
     {info?.needs_tax_id&&!cardActive&&<label className="monthly-taxid">CPF ou CNPJ do responsável<input value={taxId} onChange={e=>setTaxId(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00"/><small>Exigido pelo Asaas para emitir a cobrança. Informado uma única vez.</small></label>}
     {info?.has_subscription&&<p className="monthly-current">Forma atual: <b>{info.billing_method==="CREDIT_CARD"?"Cartão de crédito (recorrente)":"Pix (cobrança mensal)"}</b></p>}
     {cardActive?<><div className="form-alert success"><CreditCard size={17}/><strong> Cartão configurado.</strong> As próximas cobranças serão processadas pelo Asaas.</div><div style={{display:"flex",gap:10,flexWrap:"wrap",margin:"12px 0"}}><button className="secondary-action" type="button" disabled={Boolean(busy)} onClick={()=>pay("PIX")}><CircleDollarSign size={17}/>{busy==="PIX"?"Trocando...":"Trocar para Pix"}</button></div></>:<div style={{display:"flex",gap:10,flexWrap:"wrap",margin:"16px 0"}}>
      <button className="primary" type="button" disabled={Boolean(busy)} onClick={()=>pay("CREDIT_CARD")}><CreditCard size={17}/>{busy==="CREDIT_CARD"?"Abrindo...":info?.billing_method==="PIX"&&info?.has_subscription?"Trocar para cartão":"Pagar com cartão"}</button>
      <button className="secondary-action" type="button" disabled={Boolean(busy)} onClick={()=>pay("PIX")}><CircleDollarSign size={17}/>{busy==="PIX"?"Gerando...":info?.billing_method==="PIX"&&info?.has_subscription?"Ver PIX do mês":"Pagar com PIX"}</button>
     </div>}
     {info?.billing_method==="PIX"&&info?.has_subscription&&<PixBox pix={info.pix}/>}
     {info?.billing_method==="PIX"&&info?.has_subscription&&info?.pix?.no_pending&&<div className="advance-box">
      <p><CalendarPlus size={15}/> <b>Quer pagar adiantado?</b> Cada mensalidade paga adia o seu vencimento em 1 mês{info?.due_date?<> (de {ptDate(info.due_date)} para {ptDate(nextMonth(info.due_date))})</>:null}.</p>
      {info?.advance?<PixBox pix={info.advance}/>:<button className="primary" type="button" disabled={Boolean(busy)} onClick={payAdvance}><CalendarPlus size={17}/>{busy==="advance"?"Gerando PIX...":"Pagar próximo mês adiantado"}</button>}
     </div>}
     {info?.pix_error&&<small>{info.pix_error}</small>}
     {waiting&&!qrPending&&<p className="billing-waiting"><span className="billing-pulse" aria-hidden="true"/>Aguardando a confirmação do pagamento. Esta tela atualiza sozinha.</p>}
    </>:<>
     <p>A cobrança online ainda não está configurada. Nenhum pagamento será confirmado manualmente ou direcionado para uma chave fixa.</p>
     <div className="form-alert">Fale com o suporte BarberTix para ativar o provedor de pagamentos.</div>
    </>}
   </div>
  </section>
 </div>
}
