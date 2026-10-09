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
  Percent,
  ShoppingBag,
  Users,
  UserRound,
  Wallet,
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
  { label: "Caixa", href: "/dashboard/caixa", icon: Wallet, cash: true },
  { label: "Relatórios", href: "/dashboard/relatorios", icon: BarChart3 },
  { label: "Comissões", href: "/dashboard/comissoes", icon: Percent, permission: "finance" },
  { label: "Mensalidade", href: "/dashboard/mensalidade", icon: CreditCard, ownerOnly: true },
  { label: "WhatsApp", href: "/dashboard/whatsapp", icon: MessageCircle, ownerOnly: true },
  { label: "Site, Instagram e WhatsApp", href: "/dashboard/configuracoes", icon: Settings, ownerOnly: true },
];

const roleLabel={owner:"Proprietário",manager:"Gerente",reception:"Recepção",attendant:"Atendente",barber:"Barbeiro"};
const initials=name=>String(name||"RC").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();

export default function Sidebar({ workspace, collapsed=false, onToggle }) {
  const pathname = usePathname();
  const [workspaceOpen,setWorkspaceOpen]=useState(false);
  const [staff,setStaff]=useState([]);
  const [staffLoading,setStaffLoading]=useState(false);
  const [selectedStaff,setSelectedStaff]=useState(null);
  const [switchPassword,setSwitchPassword]=useState("");
  const [switchError,setSwitchError]=useState("");
  const [switching,setSwitching]=useState(false);
  const [intro,setIntro]=useState(false);
  const switcherRef=useRef(null);
  const role=workspace?.membership?.role;
  const canManage=["owner","manager"].includes(role);
  // Staggered entrance plays once per browser session, not on every page load.
  useEffect(()=>{try{if(!sessionStorage.getItem("barbertix_sidebar_intro")){sessionStorage.setItem("barbertix_sidebar_intro","1");setIntro(true)}}catch{}},[]);
  useEffect(()=>{if(!workspaceOpen)return;const close=e=>{if(e.type==="keydown"?e.key==="Escape":!switcherRef.current?.contains(e.target))setWorkspaceOpen(false)};document.addEventListener("mousedown",close);document.addEventListener("keydown",close);return()=>{document.removeEventListener("mousedown",close);document.removeEventListener("keydown",close)}},[workspaceOpen]);
  const starter=String(workspace?.tenant?.plans?.name||"").toLowerCase()==="starter";
  const starterRoutes=new Set(["/dashboard","/dashboard/clientes","/dashboard/barbeiros","/dashboard/servicos","/dashboard/financeiro","/dashboard/estoque","/dashboard/comandas","/dashboard/vendas","/dashboard/caixa","/dashboard/relatorios","/dashboard/comissoes","/dashboard/mensalidade"]);
  async function openStaffSwitcher(){
    const opening=!workspaceOpen;setWorkspaceOpen(opening);setSelectedStaff(null);setSwitchPassword("");setSwitchError("");
    if(!opening||staffLoading||staff.length||!workspace?.tenant?.id)return;
    setStaffLoading(true);
    try{
      const {data:{session}}=await supabase.auth.getSession();
      const r=await fetch("/api/team?tenant_id="+encodeURIComponent(workspace.tenant.id),{headers:{Authorization:"Bearer "+(session?.access_token||"")},cache:"no-store"});
      const j=await r.json();if(!r.ok)throw new Error(j.error||"Não foi possível carregar os funcionários.");
      setStaff(j.items||[]);
    }catch(e){setSwitchError(e.message||"Não foi possível carregar os funcionários.")}finally{setStaffLoading(false)}
  }
  async function switchStaff(e){
    e.preventDefault();if(!selectedStaff||!switchPassword||switching)return;
    setSwitching(true);setSwitchError("");
    try{
      const {error}=await supabase.auth.signInWithPassword({email:selectedStaff.login_email,password:switchPassword});
      if(error)throw error;
      localStorage.setItem("barberflow_workspace",workspace.tenant.id);
      window.location.href="/dashboard";
    }catch(e){
      setSwitchError(e?.message==="Invalid login credentials"?"Senha incorreta para este funcionário.":e?.message||"Não foi possível trocar o funcionário.");
    }finally{setSwitching(false)}
  }
  async function signOut(){if(!window.confirm("Deseja sair do RupControl?"))return;await supabase?.auth.signOut();window.location.href="/login"}

  return (
    <aside className={"sidebar "+(collapsed?"collapsed ":"")+(intro?"sidebar-intro":"")}>
      <div className="sidebar-top">
        <div className="brand-client-lockup">
          <span className="bf-simple-mark" aria-hidden="true"/>
          <div className="brand-copy">
            <div className="brand">RupControl</div>
            <span className="brand-subtitle">Gestão inteligente</span>
          </div>
        </div>
        <button type="button" className="sidebar-toggle" onClick={onToggle} aria-label={collapsed?"Expandir menu":"Minimizar menu"} title={collapsed?"Expandir menu":"Minimizar menu"}>
          <ChevronLeft size={17}/>
        </button>
      </div>

      <div className="workspace-switcher" ref={switcherRef}>
        <button type="button" className={"workspace-card workspace-card-button "+(workspaceOpen?"open":"")} onClick={openStaffSwitcher} aria-expanded={workspaceOpen} aria-haspopup="menu">
          <span className="workspace-avatar">{initials(workspace?.membership?.name||workspace?.tenant?.name)}</span>
          <div><strong>{workspace?.membership?.name||workspace?.tenant?.name||"RupControl"}</strong><small>{roleLabel[role]||role||"Equipe"} · Trocar funcionário</small></div>
          <ChevronRight size={17} />
        </button>
        {workspaceOpen&&<div className="workspace-menu staff-switch-menu">
          <p>{selectedStaff?"Confirmar acesso":"Trocar funcionário"}</p>
          {selectedStaff?<form className="staff-switch-form" onSubmit={switchStaff}>
            <div className="staff-switch-selected"><span className="workspace-avatar mini">{initials(selectedStaff.name)}</span><span><strong>{selectedStaff.name}</strong><small>@{selectedStaff.username} · {roleLabel[selectedStaff.role]||selectedStaff.role}</small></span></div>
            <label>Senha do funcionário<input type="password" autoFocus value={switchPassword} onChange={e=>setSwitchPassword(e.target.value)} placeholder="Digite a senha" autoComplete="current-password" required/></label>
            {switchError&&<small className="staff-switch-error">{switchError}</small>}
            <div className="staff-switch-actions"><button type="button" onClick={()=>{setSelectedStaff(null);setSwitchPassword("");setSwitchError("")}}>Voltar</button><button type="submit" disabled={switching}>{switching?"Entrando...":"Entrar"}</button></div>
          </form>:<>
            {staffLoading&&<div className="staff-switch-empty">Carregando funcionários...</div>}
            {!staffLoading&&switchError&&<div className="staff-switch-empty error">{switchError}</div>}
            {!staffLoading&&!switchError&&staff.length===0&&<div className="staff-switch-empty">Nenhum funcionário com acesso cadastrado.</div>}
            {!staffLoading&&staff.map(m=><button type="button" key={m.user_id} className={m.user_id===workspace?.user?.id?"current":""} onClick={()=>{setSelectedStaff(m);setSwitchPassword("");setSwitchError("")}}>
              <span className="workspace-avatar mini">{initials(m.name)}</span>
              <span><strong>{m.name}</strong><small>@{m.username} · {roleLabel[m.role]||m.role}</small></span>
              {m.user_id===workspace?.user?.id&&<b>Atual</b>}
            </button>)}
          </>}
        </div>}
      </div>

      <p className="nav-title">MENU PRINCIPAL</p>
      <nav>
        {items.filter(item => (!starter||starterRoutes.has(item.href)) && (!item.ownerOnly || canManage) && (!item.cash || role==="owner" || workspace?.membership?.permissions?.includes("finance") || ["manager","reception","attendant"].includes(role)&&workspace?.membership?.permissions?.some(p=>["booking","agenda"].includes(p))) && (!item.permission || role==="owner" || ["manager","reception"].includes(role)&&workspace?.membership?.permissions?.includes(item.permission))).map(({ label, href, icon: Icon, soon }, index) => {
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
        <button className="profile-card" style={{ width: "100%", background: "transparent", color: "inherit", borderLeft: 0, borderRight: 0, borderBottom: 0, textAlign: "left", cursor: "pointer" }} type="button" onClick={signOut} title="Sair" aria-label="Sair do RupControl">
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
