import { supabase } from "../../../../lib/supabase";
import { redirect } from "next/navigation";
import Sidebar from "../../_components/Sidebar";

export const dynamic = "force-dynamic";

async function getFormData() {
  if (!supabase) return { clients: [], barbers: [], services: [] };

  const { data: barbershop } = await supabase
    .from("barbershops")
    .select("id")
    .eq("slug", "barbearia-modelo")
    .single();

  if (!barbershop) return { clients: [], barbers: [], services: [] };

  const [clientsResult, barbersResult, servicesResult] = await Promise.all([
    supabase.from("clients").select("*").eq("barbershop_id", barbershop.id).order("name"),
    supabase.from("barbers").select("*").eq("barbershop_id", barbershop.id).order("name"),
    supabase.from("services").select("*").eq("barbershop_id", barbershop.id).order("name"),
  ]);

  return {
    clients: clientsResult.data || [],
    barbers: barbersResult.data || [],
    services: servicesResult.data || [],
  };
}

async function createAppointment(formData) {
  "use server";

  const client_id = formData.get("client_id");
  const barber_id = formData.get("barber_id");
  const service_id = formData.get("service_id");
  const scheduled_at = formData.get("scheduled_at");
  const notes = formData.get("notes");

  const { data: barbershop } = await supabase
    .from("barbershops")
    .select("id")
    .eq("slug", "barbearia-modelo")
    .single();

  if (!barbershop) throw new Error("Barbearia não encontrada");

  await supabase.from("appointments").insert({
    barbershop_id: barbershop.id,
    client_id,
    barber_id,
    service_id,
    scheduled_at,
    status: "scheduled",
    notes,
  });

  redirect("/dashboard/agenda");
}

export default async function NewAppointmentPage() {
  const { clients, barbers, services } = await getFormData();

  return (
    <main className="dash">
      <Sidebar />

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Agenda</p>
            <h1>Novo agendamento</h1>
          </div>
        </header>

        <form action={createAppointment} className="box form">
          <label>
            Cliente
            <select name="client_id" required>
              <option value="">Selecione</option>
              {clients.map((client) => (
                <option value={client.id} key={client.id}>{client.name}</option>
              ))}
            </select>
          </label>

          <label>
            Barbeiro
            <select name="barber_id" required>
              <option value="">Selecione</option>
              {barbers.map((barber) => (
                <option value={barber.id} key={barber.id}>{barber.name}</option>
              ))}
            </select>
          </label>

          <label>
            Serviço
            <select name="service_id" required>
              <option value="">Selecione</option>
              {services.map((service) => (
                <option value={service.id} key={service.id}>
                  {service.name} - R$ {Number(service.price).toFixed(2)}
                </option>
              ))}
            </select>
          </label>

          <label>Data e horário<input name="scheduled_at" type="datetime-local" required /></label>
          <label>Observações<textarea name="notes" placeholder="Observações do agendamento" /></label>

          <button className="primary" type="submit">Salvar agendamento</button>
        </form>
      </section>
    </main>
  );
}
