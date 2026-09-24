"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  LayoutDashboard,
  LogOut,
  Scissors,
  Settings,
  Sparkles,
  CreditCard,
  Users,
  UserRound,
  MessageCircle,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";
import RuptixLogo from "../../_components/RuptixLogo";

const items = [
  { label: "Visão geral", href: "/dashboard", icon: LayoutDashboard },
  { label: "Agenda", href: "/dashboard/agenda", icon: CalendarDays },
  { label: "Clientes", href: "/dashboard/clientes", icon: Users },
  { label: "Barbeiros", href: "/dashboard/barbeiros", icon: UserRound },
  { label: "Serviços", href: "/dashboard/servicos", icon: Scissors },
  { label: "Financeiro", href: "/dashboard/financeiro", icon: CircleDollarSign, permission: "finance" },
  { label: "Estoque", href: "/dashboard/estoque", icon: Sparkles, permission: "inventory" },
  { label: "Comandas", href: "/dashboard/comandas", icon: CircleDollarSign },
  { label: "Vendas", href: "/dashboard/vendas", icon: CircleDollarSign },
  { label: "Relatórios", href: "/dashboard/relatorios", icon: BarChart3 },
  { label: "Mensalidade", href: "/dashboard/mensalidade", icon: CreditCard, ownerOnly: true },
  { label: "WhatsApp", href: "/dashboard/whatsapp", icon: MessageCircle, ownerOnly: true },
  { label: "Site, Instagram e WhatsApp", href: "/dashboard/configuracoes", icon: Settings, ownerOnly: true },
];

const roleLabel={owner:"Proprietário",manager:"Gerente",reception:"Recepção",barber:"Barbeiro"};
const initials=name=>String(name||"BF").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();

export default function Sidebar({ workspace }) {
  const pathname = usePathname();
  const [workspaceOpen,setWorkspaceOpen]=useState(false);
  const starter=String(workspace?.tenant?.plans?.name||"").toLowerCase()==="starter";
  const starterRoutes=new Set(["/dashboard","/dashboard/vendas","/dashboard/mensalidade"]);
  async function changeWorkspace(tenantId){localStorage.setItem("barberflow_workspace",tenantId);setWorkspaceOpen(false);window.location.href="/dashboard"}
  async function changeAccount(){localStorage.removeItem("barberflow_workspace");await supabase?.auth.signOut();window.location.href="/login"}

  return (
    <aside className="sidebar">
      <div className="brand-wrap">
        <div className="brand-client-lockup"><RuptixLogo/><div><div className="brand">Barber Flow</div><span className="brand-subtitle">Gestão inteligente</span></div></div>
      </div>

      <div className="workspace-switcher">
        <button type="button" className={"workspace-card workspace-card-button "+(workspaceOpen?"open":"")} onClick={()=>setWorkspaceOpen(v=>!v)}>
          <span className="workspace-avatar">{initials(workspace?.tenant?.name)}</span>
          <div><strong>{workspace?.tenant?.name||"Barber Flow"}</strong><small>{roleLabel[workspace?.membership?.role]||workspace?.membership?.role||"Equipe"}</small></div>
          <ChevronRight size={17} />
        </button>
        {workspaceOpen&&<div className="workspace-menu">
          <p>Trocar perfil</p>
          {(workspace?.memberships||[]).map(m=><button type="button" key={m.tenant_id} className={m.tenant_id===workspace?.tenant?.id?"current":""} onClick={()=>changeWorkspace(m.tenant_id)}>
            <span className="workspace-avatar mini">{initials(m.tenants?.name)}</span>
            <span><strong>{m.tenants?.name||"Barbearia"}</strong><small>{roleLabel[m.role]||m.role}</small></span>
            {m.tenant_id===workspace?.tenant?.id&&<b>Atual</b>}
          </button>)}
          <button type="button" className="workspace-other-account" onClick={changeAccount}>Entrar em outra conta</button>
        </div>}
      </div>

      <p className="nav-title">MENU PRINCIPAL</p>
      <nav>
        {items.filter(item => (!starter||starterRoutes.has(item.href)) && (!item.ownerOnly || ["owner","manager"].includes(workspace?.membership?.role)) && (!item.permission || workspace?.membership?.role==="owner" || ["manager","reception"].includes(workspace?.membership?.role)&&workspace?.membership?.permissions?.includes(item.permission))).map(({ label, href, icon: Icon, soon }) => {
          const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
          return (
            <a key={href} href={soon ? "#" : href} className={active ? "active" : ""}>
              <Icon size={19} />
              <span>{label}</span>
              {soon && <small className="soon">Em breve</small>}
            </a>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        {!starter&&<a href="/dashboard/configuracoes"><Settings size={19} /><span>Configurações do site</span></a>}
        <button className="profile-card" style={{ width: "100%", background: "transparent", color: "inherit", borderLeft: 0, borderRight: 0, borderBottom: 0, textAlign: "left", cursor: "pointer" }} type="button" onClick={async () => {await supabase?.auth.signOut();window.location.href="/login"}}>
          <span className="profile-avatar">AD</span>
          <div><strong>{workspace?.membership?.name||"Administrador"}</strong><small>Plano {workspace?.tenant?.plans?.name||"contratado"}</small></div>
          <LogOut size={18} />
        </button>
        <div className="upgrade-card">
          <Sparkles size={20} />
          <div><strong>{starter?"Recursos Pro e Premium":"Libere todo o potencial"}</strong><small>{starter?"Site, agenda e WhatsApp":"Conheça os planos"}</small></div>
        </div>
      </div>
    </aside>
  );
}
