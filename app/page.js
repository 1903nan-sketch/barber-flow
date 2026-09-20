import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{
      minHeight: "100vh",
      padding: "40px",
      background: "#050505",
      color: "white",
      fontFamily: "Arial, sans-serif"
    }}>
      <h1 style={{ fontSize: "56px", marginBottom: "16px" }}>
        Barber Flow
      </h1>

      <p style={{ fontSize: "20px", maxWidth: "650px", lineHeight: 1.5 }}>
        Sistema SaaS para gestão de barbearias, com agenda, clientes,
        vendas, pagamentos, barbeiros e painel administrativo.
      </p>

      <div style={{ marginTop: "30px" }}>
        <Link
          href="/dashboard"
          style={{
            background: "white",
            color: "black",
            padding: "14px 20px",
            borderRadius: "12px",
            fontWeight: "bold",
            textDecoration: "none"
          }}
        >
          Acessar painel
        </Link>
      </div>
    </main>
  );
}
