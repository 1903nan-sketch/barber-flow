const stats = [
  { label: "Faturamento hoje", value: "R$ 1.240", detail: "+18% vs ontem" },
  { label: "Agendamentos", value: "32", detail: "8 pendentes" },
  { label: "Clientes", value: "486", detail: "12 novos no mês" },
  { label: "Barbeiros ativos", value: "6", detail: "2 com agenda cheia" },
];

const appointments = [
  { time: "09:00", client: "Lucas Martins", service: "Corte degradê", barber: "Rafael" },
  { time: "10:30", client: "Pedro Silva", service: "Cabelo + barba", barber: "André" },
  { time: "13:00", client: "João Victor", service: "Barba completa", barber: "Diego" },
  { time: "15:30", client: "Matheus Lima", service: "Corte social", barber: "Rafael" },
];

export default function DashboardPage() {
  return (
    <main className="dash">
      <aside className="sidebar">
        <div className="brand">Barber Flow</div>
        <nav>
          <a className="active">Dashboard</a>
          <a>Agenda</a>
          <a>Clientes</a>
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
            <p className="eyebrow">Painel administrativo</p>
            <h1>Visão geral da barbearia</h1>
          </div>
          <button className="primary">Novo agendamento</button>
        </header>

        <section className="stats">
          {stats.map((item) => (
            <div className="stat" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.detail}</small>
            </div>
          ))}
        </section>

        <section className="dash-grid">
          <div className="box large">
            <div className="box-head">
              <h2>Agenda de hoje</h2>
              <span>Atualizado agora</span>
            </div>

            <div className="appointments">
              {appointments.map((item) => (
                <div className="appointment" key={item.time}>
                  <strong>{item.time}</strong>
                  <div>
                    <b>{item.client}</b>
                    <p>{item.service} · {item.barber}</p>
                  </div>
                  <button>Ver</button>
                </div>
              ))}
            </div>
          </div>

          <div className="box">
            <div className="box-head">
              <h2>Status</h2>
            </div>

            <div className="status-list">
              <div><span>Fila de espera</span><strong>4</strong></div>
              <div><span>Comandas abertas</span><strong>9</strong></div>
              <div><span>Pagamentos Pix</span><strong>18</strong></div>
              <div><span>Cancelamentos</span><strong>2</strong></div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
