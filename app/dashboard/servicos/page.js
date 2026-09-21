import { supabase } from "../../../lib/supabase";
import Sidebar from "../_components/Sidebar";

export const dynamic = "force-dynamic";

async function getServices() {
  if (!supabase) return [];

  const { data: barbershop } = await supabase
    .from("barbershops")
    .select("id")
    .eq("slug", "barbearia-modelo")
    .single();

  if (!barbershop) return [];

  const { data } = await supabase
    .from("services")
    .select("*")
    .eq("barbershop_id", barbershop.id)
    .order("created_at", { ascending: false });

  return data || [];
}

export default async function ServicesPage() {
  const services = await getServices();

  return (
    <main className="dash">
      <Sidebar />

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Catálogo</p>
            <h1>Serviços</h1>
          </div>

          <a className="primary" href="/dashboard/servicos/novo">
            Novo serviço
          </a>
        </header>

        <section className="box">
          <div className="box-head">
            <h2>Serviços cadastrados</h2>
            <span>{services.length} registros</span>
          </div>

          <div className="appointments">
            {services.map((service) => (
              <div className="appointment" key={service.id}>
                <strong>R$ {Number(service.price).toFixed(2)}</strong>
                <div>
                  <b>{service.name}</b>
                  <p>{service.duration_minutes} minutos</p>
                </div>
                <span className="pill">{service.is_active ? "ativo" : "inativo"}</span>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
