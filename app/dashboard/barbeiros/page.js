import { supabase } from "../../../lib/supabase";
import Sidebar from "../_components/Sidebar";

export const dynamic = "force-dynamic";

async function getBarbers() {
  if (!supabase) return [];

  const { data: barbershop } = await supabase
    .from("barbershops")
    .select("id")
    .eq("slug", "barbearia-modelo")
    .single();

  if (!barbershop) return [];

  const { data } = await supabase
    .from("barbers")
    .select("*")
    .eq("barbershop_id", barbershop.id)
    .order("created_at", { ascending: false });

  return data || [];
}

export default async function BarbersPage() {
  const barbers = await getBarbers();

  return (
    <main className="dash">
      <Sidebar />

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Equipe</p>
            <h1>Barbeiros</h1>
          </div>

          <a className="primary" href="/dashboard/barbeiros/novo">
            Novo barbeiro
          </a>
        </header>

        <section className="box">
          <div className="box-head">
            <h2>Barbeiros cadastrados</h2>
            <span>{barbers.length} registros</span>
          </div>

          <div className="appointments">
            {barbers.map((barber) => (
              <div className="appointment" key={barber.id}>
                <strong>{barber.commission_percent || 0}%</strong>
                <div>
                  <b>{barber.name}</b>
                  <p>{barber.phone || "Sem telefone"} · {barber.email || "Sem e-mail"}</p>
                </div>
                <span className="pill">{barber.is_active ? "ativo" : "inativo"}</span>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
