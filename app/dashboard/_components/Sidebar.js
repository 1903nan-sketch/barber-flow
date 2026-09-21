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
  Users,
  UserRound,
} from "lucide-react";

const items = [
  { label: "Visão geral", href: "/dashboard", icon: LayoutDashboard },
  { label: "Agenda", href: "/dashboard/agenda", icon: CalendarDays },
  { label: "Clientes", href: "/dashboard/clientes", icon: Users },
  { label: "Barbeiros", href: "/dashboard/barbeiros", icon: UserRound },
  { label: "Serviços", href: "/dashboard/servicos", icon: Scissors },
  { label: "Vendas", href: "/dashboard/vendas", icon: CircleDollarSign, soon: true },
  { label: "Relatórios", href: "/dashboard/relatorios", icon: BarChart3, soon: true },
];

export default function Sidebar() {
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
        {items.map(({ label, href, icon: Icon, soon }) => {
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
        <a href="#"><Settings size={19} /><span>Configurações</span></a>
        <div className="profile-card">
          <span className="profile-avatar">AD</span>
          <div><strong>Administrador</strong><small>Plano Starter</small></div>
          <LogOut size={18} />
        </div>
        <div className="upgrade-card">
          <Sparkles size={20} />
          <div><strong>Libere todo o potencial</strong><small>Conheça os planos</small></div>
        </div>
      </div>
    </aside>
  );
}
