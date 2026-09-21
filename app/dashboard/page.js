import { supabase } from "../../lib/supabase";
import Sidebar from "./_components/Sidebar";

export const dynamic = "force-dynamic";

async function getData() {
  if (!supabase) {
    return { barbershop: null, barbers: [], clients: [], services: [], appointments: [] };
  }

  const { data: barbershop } = await supabase
    .from("barbershops")
    .select("*")
    .eq("slug", "barbearia-modelo")
    .single();

  if (!barbershop) {
    return { barbershop: null, barbers: [], clients: [], services: [], appointments: [] };
  }

  const [barbersResult, clientsResult, servicesResult, appointmentsResult] = await Promise.all([
    supabase.from("barbers").select("*").eq("barbershop_id", barbershop.id),
    supabase.from("clients").select("*").eq("barbershop_id", barbershop.id),
    supabase.from("services").select("*").eq("barbershop_id", barbershop.id),
    supabase
      .from("appointments")
      .select("*, clients(name), barbers(name), services(name)")
      .eq("barbershop_id", barbershop.id)
      .order("scheduled_at", { ascending: true })
      .limit(5),
  ]);

  return {
    barbershop,
    barbers: barbersResult.data || [],
    clients: clientsResult.data || [],
    services: servicesResult.data || [],
    appointments: appointmentsResult.data || [],
  };
}

export default async function DashboardPage() {
  const { barbershop, barbers, clients, services, appointments } = await getData();

  return (
    <main className="dash">
      <Sidebar />

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Painel administrativo</p>
            <h1>{barbershop?.name || "Barbearia Modelo"}</h1>
          </div>

          <a className="primary" href="/dashboard/agenda/novo">
            Novo agendamento
          </a>
        </header>

        <section className="stats">
          <a className="stat" href="/dashboard/clientes">
            <span>Clientes cadastrados</span>
            <strong>{clients.length}</strong>
            <small>Banco real</small>
          </a>

          <a className="stat" href="/dashboard/barbeiros">
            <span>Barbeiros ativos</span>
            <strong>{barbers.length}</strong>
            <small>Equipe cadastrada</small>
          </a>

          <a className="stat" href="/dashboard/servicos">
            <span>Serviços</span>
            <strong>{services.length}</strong>
            <small>Catálogo da barbearia</small>
          </a>

          <div className="stat">
            <span>Plano</span>
            <strong>{barbershop?.plan || "starter"}</strong>
            <small>Status: {barbershop?.is_active ? "ativo" : "bloqueado"}</small>
          </div>
        </section>

        <section className="dash-grid">
          <div className="box large">
            <div className="box-head">
              <h2>Próximos agendamentos</h2>
              <a href="/dashboard/agenda">Ver agenda</a>
            </div>

            <div className="appointments">
              {appointments.length === 0 && (
                <p className="empty">Nenhum agendamento cadastrado ainda.</p>
              )}

              {appointments.map((item) => (
                <div className="appointment" key={item.id}>
                  <strong>
                    {new Date(item.scheduled_at).toLocaleDateString("pt-BR")}
                  </strong>
                  <div>
                    <b>{item.clients?.name || "Cliente"}</b>
                    <p>
                      {item.services?.name || "Serviço"} · {item.barbers?.name || "Barbeiro"}
                    </p>
                  </div>
                  <span className="pill">{item.status}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="box">
            <div className="box-head">
              <h2>Serviços</h2>
              <a href="/dashboard/servicos">Editar</a>
            </div>

            <div className="status-list">
              {services.map((service) => (
                <div key={service.id}>
                  <span>{service.name}</span>
                  <strong>R$ {Number(service.price).toFixed(2)}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
