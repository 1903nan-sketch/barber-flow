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
      <div style={{position:"fixed",bottom:"24px",left:"40px",display:"flex",alignItems:"center",gap:"10px",color:"#8d8d98",fontSize:"12px",letterSpacing:".08em"}}>
        <span style={{width:"28px",height:"1px",background:"#6f55ff",display:"inline-block"}} />
        DESENVOLVIDO POR <strong style={{color:"white",letterSpacing:".18em"}}>RUPTIX</strong>
      </div>
    </main>
  );
}
