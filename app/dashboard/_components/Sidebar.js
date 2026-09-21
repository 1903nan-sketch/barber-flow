export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">Barber Flow</div>

      <nav>
        <a href="/dashboard">Dashboard</a>
        <a href="/dashboard/agenda">Agenda</a>
        <a href="/dashboard/clientes">Clientes</a>
        <a href="/dashboard/barbeiros">Barbeiros</a>
        <a href="/dashboard/servicos">Serviços</a>
        <a>Vendas</a>
        <a>Relatórios</a>
        <a>Configurações</a>
      </nav>
    </aside>
  );
}
