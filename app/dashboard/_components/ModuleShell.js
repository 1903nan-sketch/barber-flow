"use client";
import Sidebar from "./Sidebar";
import { useWorkspace } from "../../../lib/use-workspace";
export default function ModuleShell({children,title,eyebrow="Gestão",action}){
 const workspace=useWorkspace();
 if(workspace.loading)return <main className="center-state">Carregando Barber Flow...</main>;
 if(workspace.error)return <main className="center-state"><div className="box"><h2>Acesso ainda não liberado</h2><p>{workspace.error}</p><a href="/login">Voltar ao login</a></div></main>;
 return <main className="dash"><Sidebar/><section className="content"><header className="topbar"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="topbar-copy">{workspace.tenant?.name} · {workspace.membership?.role}</p></div>{action}</header>{typeof children==="function"?children(workspace):children}</section></main>;
}
