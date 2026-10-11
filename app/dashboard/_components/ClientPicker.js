"use client";
import {useMemo,useState} from "react";
import {Check,Search,UserPlus,X} from "lucide-react";
import {formatPhone,phoneDigits} from "../../../lib/phone";
import {clientByPhone} from "../../../lib/client-debts";
import PhoneInput from "../../_components/PhoneInput";
import DebtAlert from "./DebtAlert";

const plain=v=>String(v||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();

// Busca o cliente pelo nome ou celular. Se não existir, cadastra com nome e
// celular. Quando o cliente tem conta em aberto, mostra o aviso na hora.
// value: {id,name,phone} (existente) ou {id:null,name,phone} (novo).
export default function ClientPicker({clients,debts,value,onChange}){
 const [query,setQuery]=useState(""),[open,setOpen]=useState(false),[creating,setCreating]=useState(false),[draft,setDraft]=useState({name:"",phone:""});
 // Ao tocar no campo já aparece a lista (rola para ver todos); digitando, filtra.
 const matches=useMemo(()=>{const term=plain(query.trim()),digits=query.replace(/\D/g,"");return [...clients].sort((a,b)=>String(a.name).localeCompare(String(b.name),"pt-BR",{sensitivity:"base"})).filter(c=>(!term&&!digits)||plain(c.name).includes(term)||(digits.length>=3&&[c.phone,c.whatsapp].some(p=>phoneDigits(p).includes(digits)))).slice(0,60)},[clients,query]);
 const selected=value?.id?clients.find(c=>c.id===value.id)||value:null;
 const phoneOwner=creating?clientByPhone(clients,draft.phone):null;
 const debtFor=c=>c&&debts?.get(c.id);
 function pick(c){setCreating(false);setOpen(false);setQuery("");onChange({id:c.id,name:c.name,phone:c.phone})}
 function startNew(){const digits=query.replace(/\D/g,"");const d={name:digits.length>=8?"":query.trim(),phone:digits.length>=8?formatPhone(digits):""};setDraft(d);setCreating(true);onChange({id:null,...d})}
 function updateDraft(k,v){const d={...draft,[k]:v};setDraft(d);onChange({id:null,...d})}

 if(selected)return <div className="client-picker">
  <div className="client-picked"><span className="client-avatar">{String(selected.name||"?")[0].toUpperCase()}</span><span><b>{selected.name}</b><small>{formatPhone(selected.phone||selected.whatsapp)||"Sem celular"}</small></span><button type="button" className="secondary-action" onClick={()=>onChange(null)}><X size={14}/>Trocar</button></div>
  <DebtAlert client={selected} debt={debtFor(selected)}/>
 </div>;

 if(creating)return <div className="client-picker">
  <div className="client-new">
   <label>Nome do cliente<input value={draft.name} onChange={e=>updateDraft("name",e.target.value)} required minLength={2} placeholder="Nome completo" autoFocus/></label>
   <label>Celular<PhoneInput value={draft.phone} onChange={v=>updateDraft("phone",v)} required/></label>
  </div>
  {phoneOwner&&<div className="client-owner"><span>Este celular já é de <b>{phoneOwner.name}</b>.</span><button type="button" className="sch-link" onClick={()=>pick(phoneOwner)}><Check size={14}/>Usar este cadastro</button></div>}
  {phoneOwner&&<DebtAlert client={phoneOwner} debt={debtFor(phoneOwner)}/>}
  <button type="button" className="sch-link" onClick={()=>{setCreating(false);onChange(null)}}><Search size={14}/>Buscar cliente cadastrado</button>
 </div>;

 return <div className="client-picker">
  <div className="client-search-wrap"><label className="search-field client-search"><Search size={16}/><input value={query} onChange={e=>{setQuery(e.target.value);setOpen(true)}} onFocus={()=>setOpen(true)} onClick={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),120)} onKeyDown={e=>{if(e.key==="Escape")setOpen(false)}} placeholder="Toque para ver os clientes ou digite nome/celular" autoComplete="off"/></label>
   {(open||query.trim())&&<div className="client-results combo-list" onMouseDown={e=>e.preventDefault()}>{matches.map(c=><button type="button" key={c.id} onClick={()=>pick(c)}><span><b>{c.name}</b><small>{formatPhone(c.phone||c.whatsapp)||"Sem celular"}</small></span>{debtFor(c)&&<DebtAlert compact client={c} debt={debtFor(c)}/>}<strong>Selecionar</strong></button>)}
    <button type="button" className="client-add" onClick={startNew}><span><b><UserPlus size={15}/> Cadastrar novo cliente</b><small>{matches.length?"Não é nenhum desses?":"Nenhum cliente encontrado com essa busca."}</small></span></button>
   </div>}
  </div>
 </div>;
}
