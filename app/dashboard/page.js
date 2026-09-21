import {
  ArrowUpRight,
  CalendarCheck,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Plus,
  Scissors,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import Sidebar from "./_components/Sidebar";

export const dynamic = "force-dynamic";

async function getData() {
  const empty = { barbershop: null, barbers: [], clients: [], services: [], appointments: [] };
  if (!supabase) return empty;

  const { data: barbershop } = await supabase.from("barbershops").select("*").eq("slug", "barbearia-modelo").single();
  if (!barbershop) return empty;

  const [barbersResult, clientsResult, servicesResult, appointmentsResult] = await Promise.all([
    supabase.from("barbers").select("*").eq("barbershop_id", barbershop.id),
    supabase.from("clients").select("*").eq("barbershop_id", barbershop.id),
    supabase.from("services").select("*").eq("barbershop_id", barbershop.id),
    supabase.from("appointments").select("*, clients(name), barbers(name), services(name, price)").eq("barbershop_id", barbershop.id).order("scheduled_at", { ascending: true }).limit(6),
  ]);

  return { barbershop, barbers: barbersResult.data || [], clients: clientsResult.data || [], services: servicesResult.data || [], appointments: appointmentsResult.data || [] };
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default async function DashboardPage() {
  const { barbershop, barbers, clients, services, appointments } = await getData();
  const today = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());
  const revenue = appointments.reduce((sum, item) => sum + Number(item.services?.price || 0), 0);
  const metrics = [
    { label: "Agendamentos", value: appointments.length, note: "Próximos horários", icon: CalendarCheck, tone: "purple" },
    { label: "Faturamento previsto", value: `R$ ${revenue.toFixed(2).replace(".", ",")}`, note: "Agenda carregada", icon: CircleDollarSign, tone: "green" },
    { label: "Clientes", value: clients.length, note: "Cadastrados", icon: Users, tone: "blue" },
    { label: "Profissionais", value: barbers.length, note: "Na equipe", icon: UserRound, tone: "orange" },
  ];

  return (
    <main className="dash">
      <Sidebar />
      <section className="content">
        <header className="topbar">
          <div><p className="eyebrow">{today}</p><h1>Olá, seja bem-vindo 👋</h1><p className="topbar-copy">Aqui está o resumo da {barbershop?.name || "Barbearia Modelo"} hoje.</p></div>
          <a className="primary" href="/dashboard/agenda/novo"><Plus size={19} /> Novo agendamento</a>
        </header>

        <section className="stats">
          {metrics.map(({ label, value, note, icon: Icon, tone }) => (
            <article className="stat" key={label}>
              <div className={`stat-icon ${tone}`}><Icon size={21} /></div>
              <span>{label}</span><strong>{value}</strong>
              <small><TrendingUp size={14} /> {note}</small>
            </article>
          ))}
        </section>

        <section className="dash-grid">
          <article className="box large">
            <div className="box-head"><div><h2>Próximos agendamentos</h2><p>Acompanhe os horários da equipe</p></div><a href="/dashboard/agenda">Ver agenda <ChevronRight size={16} /></a></div>
            <div className="appointments">
              {appointments.length === 0 && <div className="empty-state"><CalendarCheck size={32} /><strong>Agenda livre por enquanto</strong><p>Crie o primeiro agendamento para começar.</p><a href="/dashboard/agenda/novo">Agendar cliente</a></div>}
              {appointments.map((item) => (
                <div className="appointment" key={item.id}>
                  <div className="time"><Clock3 size={15} /><strong>{formatTime(item.scheduled_at)}</strong></div>
                  <span className="client-avatar">{(item.clients?.name || "C").slice(0, 1).toUpperCase()}</span>
                  <div className="appointment-main"><b>{item.clients?.name || "Cliente"}</b><p>{item.services?.name || "Serviço"} · {item.barbers?.name || "Profissional"}</p></div>
                  <span className={`pill ${item.status || "pending"}`}>{item.status || "agendado"}</span>
                </div>
              ))}
            </div>
          </article>

          <aside className="side-column">
            <article className="box quick-box">
              <div className="box-head"><div><h2>Ações rápidas</h2><p>Atalhos do dia a dia</p></div></div>
              <div className="quick-actions">
                <a href="/dashboard/clientes/novo"><span className="quick-icon blue"><Users size={19} /></span><div><strong>Novo cliente</strong><small>Adicionar ao cadastro</small></div><ArrowUpRight size={17} /></a>
                <a href="/dashboard/servicos/novo"><span className="quick-icon purple"><Scissors size={19} /></span><div><strong>Novo serviço</strong><small>Atualizar catálogo</small></div><ArrowUpRight size={17} /></a>
                <a href="/dashboard/barbeiros/novo"><span className="quick-icon orange"><UserRound size={19} /></span><div><strong>Novo barbeiro</strong><small>Adicionar profissional</small></div><ArrowUpRight size={17} /></a>
              </div>
            </article>

            <article className="box services-box">
              <div className="box-head"><div><h2>Serviços</h2><p>Valores cadastrados</p></div><a href="/dashboard/servicos">Editar</a></div>
              <div className="status-list">
                {services.slice(0, 5).map((service) => <div key={service.id}><span>{service.name}</span><strong>R$ {Number(service.price).toFixed(2).replace(".", ",")}</strong></div>)}
                {services.length === 0 && <p className="empty">Nenhum serviço cadastrado.</p>}
              </div>
            </article>
          </aside>
        </section>
      </section>
    </main>
  );
}
