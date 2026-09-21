import { supabase } from "../../../../lib/supabase";
import { redirect } from "next/navigation";
import Sidebar from "../../_components/Sidebar";

export const dynamic = "force-dynamic";

async function createService(formData) {
  "use server";

  const name = formData.get("name");
  const price = Number(formData.get("price") || 0);
  const duration_minutes = Number(formData.get("duration_minutes") || 30);

  const { data: barbershop } = await supabase
    .from("barbershops")
    .select("id")
    .eq("slug", "barbearia-modelo")
    .single();

  if (!barbershop) throw new Error("Barbearia não encontrada");

  await supabase.from("services").insert({
    barbershop_id: barbershop.id,
    name,
    price,
    duration_minutes,
    is_active: true,
  });

  redirect("/dashboard/servicos");
}

export default function NewServicePage() {
  return (
    <main className="dash">
      <Sidebar />

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Catálogo</p>
            <h1>Novo serviço</h1>
          </div>
        </header>

        <form action={createService} className="box form">
          <label>Nome do serviço<input name="name" required placeholder="Corte degradê" /></label>
          <label>Preço<input name="price" type="number" step="0.01" required placeholder="45" /></label>
          <label>Duração em minutos<input name="duration_minutes" type="number" required placeholder="40" /></label>
          <button className="primary" type="submit">Salvar serviço</button>
        </form>
      </section>
    </main>
  );
}
