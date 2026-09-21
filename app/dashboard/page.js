export const dynamic = "force-dynamic";

import { supabase } from "../../lib/supabase";

async function getData() {
  if (!supabase) {
    return {
      barbershop: null,
      barbers: [],
      clients: [],
      services: [],
    };
  }

  const { data: barbershop } = await supabase
    .from("barbershops")
    .select("*")
    .eq("slug", "barbearia-modelo")
    .single();

  if (!barbershop) {
    return {
      barbershop: null,
      barbers: [],
      clients: [],
      services: [],
    };
  }

  const [barbersResult, clientsResult, servicesResult] = await Promise.all([
    supabase.from("barbers").select("*").eq("barbershop_id", barbershop.id),
    supabase.from("clients").select("*").eq("barbershop_id", barbershop.id),
    supabase.from("services").select("*").eq("barbershop_id", barbershop.id),
  ]);

  return {
    barbershop,
    barbers: barbersResult.data || [],
    clients: clientsResult.data || [],
    services: servicesResult.data || [],
  };
}

export default async function DashboardPage() {
  const { barbershop, barbers, clients, services } = await getData();

  return (
    <main className="dash">
      <aside className="sidebar">
        <div className="brand">Barber Flow</div>
        <nav>
          <a className="active">Dashboard</a>
          <a>Agenda</a>
          <a>Clientes</a>
          <a>Barbeiros</a>
          <a>Serviços</a>
          <a>Vendas</a>
          <a>Relatórios</a>
          <a>Configurações</a>
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Painel administrativo</p>
            <h1>{barbershop?.name || "Barbearia Modelo"}</h1>
          </div>
          <button className="primary">Novo agendamento</button>
        </header>

        <section className="stats">
          <div className="stat">
            <span>Clientes cadastrados</span>
            <strong>{clients.length}</strong>
            <small>Dados vindos do Supabase</small>
          </div>

          <div className="stat">
            <span>Barbeiros ativos</span>
            <strong>{barbers.length}</strong>
            <small>Equipe cadastrada</small>
          </div>

          <div className="stat">
            <span>Serviços</span>
            <strong>{services.length}</strong>
            <small>Catálogo da barbearia</small>
          </div>

          <div className="stat">
            <span>Plano</span>
            <strong>{barbershop?.plan || "starter"}</strong>
            <small>Status: {barbershop?.is_active ? "ativo" : "bloqueado"}</small>
          </div>
        </section>

        <section className="dash-grid">
          <div className="box large">
            <div className="box-head">
              <h2>Clientes</h2>
              <span>Banco de dados real</span>
            </div>

            <div className="appointments">
              {clients.map((client) => (
                <div className="appointment" key={client.id}>
                  <strong>Cliente</strong>
                  <div>
                    <b>{client.name}</b>
                    <p>{client.phone || "Sem telefone"} · {client.email || "Sem e-mail"}</p>
                  </div>
                  <button>Ver</button>
                </div>
              ))}
            </div>
          </div>

          <div className="box">
            <div className="box-head">
              <h2>Serviços</h2>
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
