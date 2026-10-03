import LegalDoc from "../_components/LegalDoc";
import {SUPPORT_EMAIL} from "../../lib/legal";

export const metadata={title:"Política de Privacidade | BarberTix",description:"Como o BarberTix coleta, usa e protege dados pessoais, conforme a LGPD."};

const sections=[
 ["1. Quem somos",[
  "O BarberTix é operado pela Ruptix. Para os dados da sua conta, a Ruptix é a controladora. Para os dados de clientes e colaboradores que a barbearia cadastra no sistema, a barbearia é a controladora e a Ruptix é a operadora, tratando esses dados somente para prestar o serviço contratado.",
  "Encarregado de dados (DPO) e contato para assuntos de privacidade: "+SUPPORT_EMAIL+"."
 ]],
 ["2. Dados que coletamos",[
  ["Dados de cadastro: nome, e-mail, telefone/WhatsApp, CPF ou CNPJ do responsável e endereço (este último somente quando exigido para pagamento com cartão);","Dados da barbearia: nome, endereço, logo, fotos, horários, serviços, preços e equipe;","Dados operacionais inseridos por você: clientes, agendamentos, vendas, comandas, estoque, caixa, comissões e lançamentos financeiros;","Dados de pagamento da assinatura: processados pelo Asaas. Não armazenamos o número do seu cartão;","Dados técnicos e de segurança: endereço IP, navegador, data e hora de acesso e registros de ações realizadas no sistema (auditoria);","Registros de aceite: versão destes documentos, data, IP e navegador no momento do aceite."]
 ]],
 ["3. Para que usamos os dados",[
  ["Prestar o serviço: login, agenda, página pública de agendamento, envio de confirmações e lembretes pelo WhatsApp e demais funcionalidades;","Cobrar a assinatura, emitir cobranças e confirmar pagamentos;","Garantir a segurança, prevenir fraudes e cumprir obrigações legais e fiscais;","Prestar suporte e comunicar avisos importantes sobre a conta;","Enviar novidades e conteúdos do BarberTix, somente se você autorizar (pode ser revogado a qualquer momento)."]
 ]],
 ["4. Bases legais (LGPD)",[
  "Tratamos dados com base na execução do contrato, no cumprimento de obrigação legal ou regulatória, no legítimo interesse (segurança e melhoria do serviço) e no seu consentimento, quando aplicável, como no envio de comunicações de marketing."
 ]],
 ["5. Com quem compartilhamos",[
  "Não vendemos dados pessoais. Compartilhamos apenas o necessário com fornecedores que nos ajudam a operar o serviço:",
  ["Supabase: banco de dados e autenticação;","Vercel: hospedagem da aplicação;","Asaas: processamento de pagamentos da assinatura;","Provedores de WhatsApp (Meta/Evolution API) e Instagram (Meta): somente quando a barbearia ativa essas integrações;","Autoridades públicas, quando exigido por lei ou ordem judicial."],
  "Alguns desses fornecedores podem armazenar dados fora do Brasil, sempre com salvaguardas adequadas de segurança e proteção de dados."
 ]],
 ["6. Por quanto tempo guardamos",[
  "Mantemos os dados enquanto a conta estiver ativa e pelo tempo necessário para cumprir obrigações legais, fiscais e de segurança (por exemplo, registros de acesso por no mínimo 6 meses, conforme o Marco Civil da Internet). Após o cancelamento, os dados podem ser exportados ou excluídos mediante solicitação, respeitados esses prazos."
 ]],
 ["7. Segurança",[
  "Usamos conexão criptografada (HTTPS), isolamento de dados entre barbearias, controle de permissões por perfil e registros de auditoria. Nenhum sistema é totalmente imune a incidentes; se ocorrer um incidente relevante, os afetados e a ANPD serão comunicados conforme a lei."
 ]],
 ["8. Seus direitos",[
  "Você pode, a qualquer momento, solicitar: confirmação e acesso aos dados, correção, anonimização, portabilidade, exclusão, informações sobre compartilhamento e revogação do consentimento. Basta escrever para "+SUPPORT_EMAIL+". Clientes de uma barbearia devem procurar primeiro a própria barbearia, que é a controladora dos seus dados."
 ]],
 ["9. Cookies e armazenamento local",[
  "Usamos apenas o armazenamento necessário para manter você conectado e lembrar preferências do sistema (como a barbearia selecionada e o menu recolhido). Não usamos cookies de publicidade."
 ]],
 ["10. Alterações",[
  "Esta Política pode ser atualizada. Mudanças relevantes serão avisadas no sistema e um novo aceite será solicitado."
 ]]
];

export default function Privacidade(){
 return <LegalDoc title="Política de Privacidade" intro="Explicamos aqui, de forma direta, quais dados pessoais o BarberTix coleta, por que coleta, com quem compartilha e como você pode exercer seus direitos previstos na Lei Geral de Proteção de Dados (LGPD)." sections={sections}/>;
}
