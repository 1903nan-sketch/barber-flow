export default function DashboardPage() {
  return (
    <main style={{ minHeight: "100vh", padding: 40, background: "#050505", color: "white", fontFamily: "Arial" }}>
      <h1>Painel Barber Flow</h1>
      <p>Área administrativa da barbearia.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 30 }}>
        <div style={{ background: "#151515", padding: 24, borderRadius: 16 }}>Agenda</div>
        <div style={{ background: "#151515", padding: 24, borderRadius: 16 }}>Clientes</div>
        <div style={{ background: "#151515", padding: 24, borderRadius: 16 }}>Vendas</div>
      </div>
    </main>
  );
}
