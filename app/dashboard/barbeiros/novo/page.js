import { supabase } from "../../../../lib/supabase";
import { redirect } from "next/navigation";
import Sidebar from "../../_components/Sidebar";

export const dynamic = "force-dynamic";

async function createBarber(formData) {
  "use server";

  const name = formData.get("name");
  const phone = formData.get("phone");
  const email = formData.get("email");
  const commission_percent = Number(formData.get("commission_percent") || 0);

  const { data: barbershop } = await supabase
    .from("barbershops")
    .select("id")
    .eq("slug", "barbearia-modelo")
    .single();

  if (!barbershop) throw new Error("Barbearia não encontrada");

  await supabase.from("barbers").insert({
    barbershop_id: barbershop.id,
    name,
    phone,
    email,
    commission_percent,
    is_active: true,
  });

  redirect("/dashboard/barbeiros");
}

export default function NewBarberPage() {
  return (
    <main className="dash">
      <Sidebar />

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Equipe</p>
            <h1>Novo barbeiro</h1>
          </div>
        </header>

        <form action={createBarber} className="box form">
          <label>Nome<input name="name" required placeholder="Nome do barbeiro" /></label>
          <label>Telefone<input name="phone" placeholder="(11) 99999-9999" /></label>
          <label>E-mail<input name="email" type="email" placeholder="barbeiro@email.com" /></label>
          <label>Comissão %<input name="commission_percent" type="number" placeholder="40" /></label>
          <button className="primary" type="submit">Salvar barbeiro</button>
        </form>
      </section>
    </main>
  );
}
