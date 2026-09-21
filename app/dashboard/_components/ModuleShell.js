"use client";
import Sidebar from "./Sidebar";
import { useWorkspace } from "../../../lib/use-workspace";
export default function ModuleShell({children,title,eyebrow="Gestão",action}){
 const workspace=useWorkspace();
 if(workspace.loading)return <main className="center-state">Carregando Barber Flow...</main>;
 if(workspace.error)return <main className="center-state"><div className="box"><h2>Acesso ainda não liberado</h2><p>{workspace.error}</p><a href="/login">Voltar ao login</a></div></main>;
 const overdue=workspace.tenant?.status==="overdue",due=workspace.tenant?.billing_due_date?new Date(workspace.tenant.billing_due_date+"T12:00:00").toLocaleDateString("pt-BR"):null;
 return <main className="dash"><Sidebar workspace={workspace}/><section className="content">{overdue&&<div className="form-alert error"><strong>Mensalidade em atraso.</strong> {due?`Vencimento: ${due}. `:""}Regularize o pagamento para evitar o bloqueio do sistema.</div>}<header className="topbar"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="topbar-copy">{workspace.tenant?.name} · {workspace.membership?.role}</p></div>{action}</header>{typeof children==="function"?children(workspace):children}</section></main>;
}
