"use client";
import Sidebar from "./Sidebar";
import { useWorkspace } from "../../../lib/use-workspace";
export default function ModuleShell({children,title,eyebrow="Gestão",action}){
 const workspace=useWorkspace();
 if(workspace.loading)return <main className="center-state">Carregando Barber Flow...</main>;
 if(workspace.error)return <main className="center-state"><div className="box"><h2>Acesso ainda não liberado</h2><p>{workspace.error}</p><a href="/login">Voltar ao login</a></div></main>;
 const overdue=workspace.tenant?.status==="overdue",dueDate=workspace.tenant?.billing_due_date?new Date(workspace.tenant.billing_due_date+"T12:00:00"):null,due=dueDate?.toLocaleDateString("pt-BR"),blockDate=dueDate?new Date(dueDate.getTime()+7*86400000):null,block=blockDate?.toLocaleDateString("pt-BR"),daysToDue=dueDate?Math.ceil((dueDate-new Date())/86400000):null,upcoming=workspace.tenant?.status==="active"&&daysToDue!==null&&daysToDue>=0&&daysToDue<=3;
 return <main className="dash"><Sidebar workspace={workspace}/><section className="content">{upcoming&&<div className="form-alert"><strong>Mensalidade próxima do vencimento.</strong> {due?`Vence em ${due}. `:""}Regularize o pagamento para manter o Barber Flow em dia. <button type="button" onClick={e=>e.currentTarget.parentElement.style.display="none"}>Fechar</button></div>}{overdue&&<div className="form-alert error"><strong>Mensalidade em atraso.</strong> {due?`Vencimento: ${due}. `:""}{block?`O sistema será bloqueado após o período de 7 dias, em ${block}. `:""}Entre em contato com o Barber Flow para regularizar o pagamento.</div>}<header className="topbar"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="topbar-copy">{workspace.tenant?.name} · {workspace.membership?.role}</p></div>{action}</header>{typeof children==="function"?children(workspace):children}</section></main>;
}
