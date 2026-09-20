export default function LoginPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#050505", color: "white", fontFamily: "Arial" }}>
      <div style={{ width: "100%", maxWidth: 400, background: "#151515", padding: 30, borderRadius: 20 }}>
        <h1>Entrar</h1>
        <p>Acesso administrativo do Barber Flow.</p>
        <input placeholder="E-mail" style={{ width: "100%", padding: 14, marginBottom: 12, borderRadius: 10 }} />
        <input placeholder="Senha" type="password" style={{ width: "100%", padding: 14, marginBottom: 12, borderRadius: 10 }} />
        <button style={{ width: "100%", padding: 14, borderRadius: 10, fontWeight: "bold" }}>Entrar</button>
      </div>
    </main>
  );
}
