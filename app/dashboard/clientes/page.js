import { supabase } from "../../../lib/supabase";

async function getClients() {
  if (!supabase) return [];

  const { data: barbershop } = await supabase
    .from("barbershops")
    .select("id")
    .eq("slug", "barbearia-modelo")
    .single();

  if (!barbershop) return [];

  const { data } = await supabase
    .from("clients")
    .select("*")
    .eq("barbershop_id", barbershop.id)
    .order("created_at", { ascending: false });

  return data || [];
}

export default async function ClientsPage() {
  const clients = await getClients();

  return (
    <main className="dash">
      <aside className="sidebar">
        <div className="brand">Barber Flow</div>
        <nav>
          <a href="/dashboard">Dashboard</a>
          <a>Agenda</a>
          <a className="active" href="/dashboard/clientes">Clientes</a>
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
            <p className="eyebrow">Cadastro</p>
            <h1>Clientes</h1>
          </div>
          <button className="primary">Novo cliente</button>
        </header>

        <section className="box">
          <div className="box-head">
            <h2>Clientes cadastrados</h2>
            <span>{clients.length} registros</span>
          </div>

          <div className="appointments">
            {clients.map((client) => (
              <div className="appointment" key={client.id}>
                <strong>Cliente</strong>
                <div>
                  <b>{client.name}</b>
                  <p>{client.phone || "Sem telefone"} · {client.email || "Sem e-mail"}</p>
                </div>
                <button>Editar</button>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
