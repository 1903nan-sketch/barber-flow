import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page">
      <div className="container">
        <header className="header">
          <div className="logo">Barber Flow</div>
          <div className="badge">SaaS multi-barbearias</div>
        </header>

        <section className="hero">
          <div className="card">
            <h1>Gestão completa para barbearias modernas.</h1>
            <p className="subtitle">
              Plataforma para agenda, clientes, serviços, vendas, pagamentos,
              barbeiros, relatórios e controle de múltiplas barbearias em um só lugar.
            </p>

            <div className="actions">
              <Link href="/dashboard" className="btn btn-primary">
                Acessar painel
              </Link>
              <Link href="/login" className="btn btn-secondary">
                Entrar
              </Link>
            </div>
          </div>

          <div className="card">
            <div className="panel-title">Resumo da plataforma</div>

            <div className="metric">
              <span>Barbearias</span>
              <strong>Multi</strong>
            </div>

            <div className="metric">
              <span>Agendamentos</span>
              <strong>Online</strong>
            </div>

            <div className="metric">
              <span>Pagamentos</span>
              <strong>Pix</strong>
            </div>

            <div className="metric">
              <span>Status</span>
              <strong>v1</strong>
            </div>
          </div>
        </section>

        <section className="grid">
          <div className="feature">
            <h3>Agenda inteligente</h3>
            <p>
              Controle horários por barbeiro, dias de trabalho, bloqueios e
              disponibilidade.
            </p>
          </div>

          <div className="feature">
            <h3>Clientes e comandas</h3>
            <p>
              Cadastro de clientes, histórico, vendas, serviços e controle de
              pagamentos.
            </p>
          </div>

          <div className="feature">
            <h3>Painel mestre</h3>
            <p>
              Estrutura preparada para gerenciar várias barbearias pela mesma
              plataforma.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
EOF~



eof
