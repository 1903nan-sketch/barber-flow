"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Scissors,
  Settings,
  Sparkles,
  CreditCard,
  Package,
  ShoppingBag,
  Users,
  UserRound,
  MessageCircle,
  ChevronLeft,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";

const items = [
  { label: "Visão geral", href: "/dashboard", icon: LayoutDashboard },
  { label: "Agenda", href: "/dashboard/agenda", icon: CalendarDays },
  { label: "Clientes", href: "/dashboard/clientes", icon: Users },
  { label: "Equipe", href: "/dashboard/barbeiros", icon: UserRound },
  { label: "Serviços", href: "/dashboard/servicos", icon: Scissors },
  { label: "Financeiro", href: "/dashboard/financeiro", icon: CircleDollarSign, permission: "finance" },
  { label: "Estoque", href: "/dashboard/estoque", icon: Package, permission: "inventory" },
  { label: "Comandas", href: "/dashboard/comandas", icon: ClipboardList },
  { label: "Vendas", href: "/dashboard/vendas", icon: ShoppingBag },
  { label: "Relatórios", href: "/dashboard/relatorios", icon: BarChart3 },
  { label: "Mensalidade", href: "/dashboard/mensalidade", icon: CreditCard, ownerOnly: true },
  { label: "WhatsApp", href: "/dashboard/whatsapp", icon: MessageCircle, ownerOnly: true },
  { label: "Site, Instagram e WhatsApp", href: "/dashboard/configuracoes", icon: Settings, ownerOnly: true },
];

const roleLabel={owner:"Proprietário",manager:"Gerente",reception:"Recepção",attendant:"Atendente",barber:"Barbeiro"};
const initials=name=>String(name||"BT").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();

export default function Sidebar({ workspace, collapsed=false, onToggle }) {
  const pathname = usePathname();
  const [workspaceOpen,setWorkspaceOpen]=useState(false);
  const [intro,setIntro]=useState(false);
  const switcherRef=useRef(null);
  const role=workspace?.membership?.role;
  const canManage=["owner","manager"].includes(role);
  // Staggered entrance plays once per browser session, not on every page load.
  useEffect(()=>{try{if(!sessionStorage.getItem("barbertix_sidebar_intro")){sessionStorage.setItem("barbertix_sidebar_intro","1");setIntro(true)}}catch{}},[]);
  useEffect(()=>{if(!workspaceOpen)return;const close=e=>{if(e.type==="keydown"?e.key==="Escape":!switcherRef.current?.contains(e.target))setWorkspaceOpen(false)};document.addEventListener("mousedown",close);document.addEventListener("keydown",close);return()=>{document.removeEventListener("mousedown",close);document.removeEventListener("keydown",close)}},[workspaceOpen]);
  const starter=String(workspace?.tenant?.plans?.name||"").toLowerCase()==="starter";
  const starterRoutes=new Set(["/dashboard","/dashboard/clientes","/dashboard/barbeiros","/dashboard/servicos","/dashboard/financeiro","/dashboard/estoque","/dashboard/comandas","/dashboard/vendas","/dashboard/relatorios","/dashboard/mensalidade"]);
  async function changeWorkspace(tenantId){localStorage.setItem("barberflow_workspace",tenantId);setWorkspaceOpen(false);window.location.href="/dashboard"}
  async function changeAccount(){localStorage.removeItem("barberflow_workspace");await supabase?.auth.signOut();window.location.href="/login"}
  async function signOut(){if(!window.confirm("Deseja sair do BarberTix?"))return;await supabase?.auth.signOut();window.location.href="/login"}

  return (
    <aside className={"sidebar "+(collapsed?"collapsed ":"")+(intro?"sidebar-intro":"")}>
      <div className="sidebar-top">
        <div className="brand-client-lockup">
          <span className="bf-simple-mark" aria-hidden="true"/>
          <div className="brand-copy">
            <div className="brand">BarberTix</div>
            <span className="brand-subtitle">Gestão inteligente</span>
          </div>
        </div>
      </div>
      <button type="button" className="sidebar-toggle sidebar-edge-tab" onClick={onToggle} aria-label={collapsed?"Expandir menu":"Minimizar menu"} title={collapsed?"Expandir menu":"Minimizar menu"}>
        <ChevronLeft size={17}/>
      </button>

      <div className="workspace-switcher" ref={switcherRef}>
        <button type="button" className={"workspace-card workspace-card-button "+(workspaceOpen?"open":"")} onClick={()=>setWorkspaceOpen(v=>!v)} aria-expanded={workspaceOpen} aria-haspopup="menu">
          <span className="workspace-avatar">{initials(workspace?.tenant?.name)}</span>
          <div><strong>{workspace?.tenant?.name||"BarberTix"}</strong><small>{roleLabel[role]||role||"Equipe"}</small></div>
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
        {items.filter(item => (!starter||starterRoutes.has(item.href)) && (!item.ownerOnly || canManage) && (!item.permission || role==="owner" || ["manager","reception"].includes(role)&&workspace?.membership?.permissions?.includes(item.permission))).map(({ label, href, icon: Icon, soon }, index) => {
          const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
          return (
            <a key={href} href={soon ? "#" : href} className={active ? "active" : ""} title={collapsed?label:undefined} aria-current={active?"page":undefined} style={{"--i":index}}>
              <Icon size={19} />
              <span>{label}</span>
              {soon && <small className="soon">Em breve</small>}
            </a>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button className="profile-card" style={{ width: "100%", background: "transparent", color: "inherit", borderLeft: 0, borderRight: 0, borderBottom: 0, textAlign: "left", cursor: "pointer" }} type="button" onClick={signOut} title="Sair" aria-label="Sair do BarberTix">
          <span className="profile-avatar">{initials(workspace?.membership?.name||"Administrador")}</span>
          <div><strong>{workspace?.membership?.name||"Administrador"}</strong><small>Plano {workspace?.tenant?.plans?.name||"contratado"}</small></div>
          <LogOut size={18} />
        </button>
        {canManage?<a className="upgrade-card" href="/dashboard/mensalidade">
          <Sparkles size={20} />
          <div><strong>{starter?"Recursos do Pro":"Libere todo o potencial"}</strong><small>{starter?"Site, agenda e WhatsApp":"Conheça os planos"}</small></div>
        </a>:<div className="upgrade-card">
          <Sparkles size={20} />
          <div><strong>{starter?"Recursos do Pro":"Libere todo o potencial"}</strong><small>{starter?"Site, agenda e WhatsApp":"Conheça os planos"}</small></div>
        </div>}
      </div>
    </aside>
  );
}
