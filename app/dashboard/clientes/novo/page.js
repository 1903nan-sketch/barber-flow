import { supabase } from "../../../../lib/supabase";
import { redirect } from "next/navigation";

async function createClient(formData) {
  "use server";

  const name = formData.get("name");
  const phone = formData.get("phone");
  const email = formData.get("email");

  const { data: barbershop } = await supabase
    .from("barbershops")
    .select("id")
    .eq("slug", "barbearia-modelo")
    .single();

  if (!barbershop) {
    throw new Error("Barbearia não encontrada");
  }

  await supabase.from("clients").insert({
    barbershop_id: barbershop.id,
    name,
    phone,
    email,
  });

  redirect("/dashboard/clientes");
}

export default function NewClientPage() {
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
            <h1>Novo cliente</h1>
          </div>
        </header>

        <form action={createClient} className="box form">
          <label>
            Nome
            <input name="name" required placeholder="Nome do cliente" />
          </label>

          <label>
            Telefone
            <input name="phone" placeholder="(11) 99999-9999" />
          </label>

          <label>
            E-mail
            <input name="email" type="email" placeholder="cliente@email.com" />
          </label>

          <button className="primary" type="submit">Salvar cliente</button>
        </form>
      </section>
    </main>
  );
}
