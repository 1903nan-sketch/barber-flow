"use client";

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
  { label: "Vendas", href: "/dashboard/vendas", icon: CircleDollarSign },
  { label: "Relatórios", href: "/dashboard/relatorios", icon: BarChart3 },
  { label: "Mensalidade", href: "/dashboard/mensalidade", icon: CreditCard, ownerOnly: true },
  { label: "WhatsApp", href: "/dashboard/whatsapp", icon: MessageCircle, ownerOnly: true },
  { label: "Site, Instagram e WhatsApp", href: "/dashboard/configuracoes", icon: Settings, ownerOnly: true },
];

export default function Sidebar({ workspace }) {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="brand-wrap">
        <div className="brand-client-lockup"><RuptixLogo/><div><div className="brand">Barber Flow</div><span className="brand-subtitle">Gestão inteligente</span></div></div>
      </div>

      <div className="workspace-card">
        <span className="workspace-avatar">BM</span>
        <div><strong>Barbearia Modelo</strong><small>Unidade principal</small></div>
        <ChevronRight size={17} />
      </div>

      <p className="nav-title">MENU PRINCIPAL</p>
      <nav>
        {items.filter(item => !item.ownerOnly || ["owner","manager"].includes(workspace?.membership?.role)).map(({ label, href, icon: Icon, soon }) => {
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
        <a href="/dashboard/configuracoes"><Settings size={19} /><span>Configurações do site</span></a>
        <button className="profile-card" style={{ width: "100%", background: "transparent", color: "inherit", borderLeft: 0, borderRight: 0, borderBottom: 0, textAlign: "left", cursor: "pointer" }} type="button" onClick={async () => {await supabase?.auth.signOut();window.location.href="/login"}}>
          <span className="profile-avatar">AD</span>
          <div><strong>{workspace?.membership?.name||"Administrador"}</strong><small>Plano {workspace?.tenant?.plans?.name||"contratado"}</small></div>
          <LogOut size={18} />
        </button>
        <div className="upgrade-card">
          <Sparkles size={20} />
          <div><strong>Libere todo o potencial</strong><small>Conheça os planos</small></div>
        </div>
      </div>
    </aside>
  );
}
