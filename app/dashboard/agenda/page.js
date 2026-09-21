import { supabase } from "../../../lib/supabase";
import Sidebar from "../_components/Sidebar";

export const dynamic = "force-dynamic";

async function getAppointments() {
  if (!supabase) return [];

  const { data: barbershop } = await supabase
    .from("barbershops")
    .select("id")
    .eq("slug", "barbearia-modelo")
    .single();

  if (!barbershop) return [];

  const { data } = await supabase
    .from("appointments")
    .select("*, clients(name), barbers(name), services(name, price)")
    .eq("barbershop_id", barbershop.id)
    .order("scheduled_at", { ascending: true });

  return data || [];
}

export default async function AgendaPage() {
  const appointments = await getAppointments();

  return (
    <main className="dash">
      <Sidebar />

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Agenda</p>
            <h1>Agendamentos</h1>
          </div>

          <a className="primary" href="/dashboard/agenda/novo">
            Novo agendamento
          </a>
        </header>

        <section className="box">
          <div className="box-head">
            <h2>Agenda da barbearia</h2>
            <span>{appointments.length} registros</span>
          </div>

          <div className="appointments">
            {appointments.length === 0 && <p className="empty">Nenhum agendamento criado.</p>}

            {appointments.map((item) => (
              <div className="appointment" key={item.id}>
                <strong>
                  {new Date(item.scheduled_at).toLocaleString("pt-BR")}
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
        </section>
      </section>
    </main>
  );
}
