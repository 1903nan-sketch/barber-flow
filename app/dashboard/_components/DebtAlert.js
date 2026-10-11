"use client";
import {AlertTriangle} from "lucide-react";
import {daysSince} from "../../../lib/client-debts";

const money=v=>(Number(v||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

// Aviso para o profissional quando o cliente tem conta em aberto.
export default function DebtAlert({client,debt,compact=false}){
 if(!client||!debt?.total)return null;
 const days=daysSince(debt.oldest),first=String(client.name||"Cliente").split(" ")[0];
 if(compact)return <span className="debt-badge" title={`${debt.count} pendência(s) em aberto`}><AlertTriangle size={12}/>Deve {money(debt.total)}</span>;
 return <div className="debt-alert" role="alert">
  <AlertTriangle size={20}/>
  <div><strong>{first} tem {money(debt.total)} em aberto</strong><small>{debt.count===1?"1 pendência":`${debt.count} pendências`} · a mais antiga {days===0?"é de hoje":days===1?"é de ontem":`tem ${days} dias`}. Combine o pagamento antes do atendimento.</small></div>
  <a href={"/dashboard/devedores?c="+client.id} target="_blank" rel="noreferrer">Ver conta</a>
 </div>;
}
