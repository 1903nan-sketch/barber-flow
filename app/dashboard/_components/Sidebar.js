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
} from "lucide-react";
import { supabase } from "../../../lib/supabase";

const items = [
  { label: "Visão geral", href: "/dashboard", icon: LayoutDashboard },
  { label: "Agenda", href: "/dashboard/agenda", icon: CalendarDays },
  { label: "Clientes", href: "/dashboard/clientes", icon: Users },
  { label: "Barbeiros", href: "/dashboard/barbeiros", icon: UserRound },
  { label: "Serviços", href: "/dashboard/servicos", icon: Scissors },
  { label: "Vendas", href: "/dashboard/vendas", icon: CircleDollarSign },
  { label: "Relatórios", href: "/dashboard/relatorios", icon: BarChart3 },
  { label: "Mensalidade", href: "/dashboard/mensalidade", icon: CreditCard, ownerOnly: true },
];

export default function Sidebar({ workspace }) {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="brand-wrap">
        <div className="brand-mark"><Scissors size={21} /></div>
        <div>
          <div className="brand">Barber Flow</div>
          <span className="brand-subtitle">Gestão inteligente</span>
        </div>
      </div>

      <div className="workspace-card">
        <span className="workspace-avatar">BM</span>
        <div><strong>Barbearia Modelo</strong><small>Unidade principal</small></div>
        <ChevronRight size={17} />
      </div>

      <p className="nav-title">MENU PRINCIPAL</p>
      <nav>
        {items.filter(item=>!item.ownerOnly||workspace?.membership?.role==="owner").map(({ label, href, icon: Icon, soon }) => {
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
        <a href="/dashboard/configuracoes"><Settings size={19} /><span>Configurações</span></a>
        <button className="profile-card" style={{ width: "100%", background: "transparent", color: "inherit", borderLeft: 0, borderRight: 0, borderBottom: 0, textAlign: "left", cursor: "pointer" }} type="button" onClick={() => supabase?.auth.signOut()}>
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
