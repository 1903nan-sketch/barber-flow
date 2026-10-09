import LegalDoc from "../_components/LegalDoc";
import {SUPPORT_EMAIL,TRIAL_DAYS} from "../../lib/legal";

export const metadata={title:"Termos de Uso | RupControl",description:"Termos de Uso do RupControl, sistema de gestão para empresas da Ruptix."};

const sections=[
 ["1. Sobre o serviço",[
  "O RupControl é um sistema on-line de gestão para empresas de qualquer ramo, oferecido pela Ruptix, que reúne agenda, clientes, equipe, serviços, vendas, caixa, estoque, financeiro, relatórios, página pública de agendamento e integrações com WhatsApp e Instagram, conforme o plano contratado.",
  "Ao criar uma conta, aceitar um convite ou usar o sistema, você declara que leu e concorda com estes Termos e com a Política de Privacidade."
 ]],
 ["2. Conta e acesso",[
  "Você é responsável pelas informações cadastradas, pela guarda da sua senha e por todas as ações realizadas com o seu acesso. O proprietário da empresa é responsável por cadastrar, liberar e remover os acessos da sua equipe e pelas permissões concedidas a cada perfil.",
  "Avise-nos imediatamente em caso de uso não autorizado da sua conta."
 ]],
 ["3. Teste grátis",[
  `Novas empresas têm ${TRIAL_DAYS} dias de teste grátis, sem cobrança automática. Ao final do teste, para continuar usando o sistema, o proprietário precisa escolher um plano e realizar o pagamento. Até lá, o acesso fica restrito à tela de assinatura.`,
  "Os dados cadastrados durante o teste são mantidos para que você continue de onde parou ao contratar um plano."
 ]],
 ["4. Planos, pagamento e vencimento",[
  "Os valores, limites e recursos de cada plano são os informados na tela de assinatura no momento da contratação. A cobrança é mensal e processada pelo Asaas, por PIX ou cartão de crédito recorrente.",
  "Cada mensalidade paga garante um mês de uso a partir do vencimento vigente. É possível pagar mensalidades adiantadas: cada pagamento confirmado adia o próximo vencimento em um mês.",
  "Em caso de atraso, o sistema exibe avisos e, após o período de tolerância do plano, o acesso pode ser bloqueado até a regularização. O bloqueio não apaga os seus dados."
 ]],
 ["5. Uso permitido",[
  "Você se compromete a usar o RupControl de forma lícita e a não:",
  ["enviar mensagens não solicitadas (spam) ou conteúdo ilegal pelas integrações de WhatsApp e Instagram;","cadastrar dados de terceiros sem base legal para isso;","tentar acessar dados de outras empresas, burlar limites do plano ou comprometer a segurança do sistema;","revender ou copiar o sistema sem autorização."]
 ]],
 ["6. Dados dos seus clientes",[
  "A empresa é a controladora dos dados dos seus clientes e colaboradores cadastrados no sistema e deve informar a eles como esses dados são usados. A Ruptix atua como operadora, tratando esses dados apenas para prestar o serviço, conforme a Política de Privacidade e a Lei Geral de Proteção de Dados (Lei 13.709/2018)."
 ]],
 ["7. Disponibilidade e suporte",[
  "Trabalhamos para manter o sistema disponível e seguro, mas podem ocorrer interrupções para manutenção ou por falhas de terceiros (hospedagem, provedores de pagamento e de mensagens). O suporte é prestado pelo e-mail "+SUPPORT_EMAIL+"."
 ]],
 ["8. Cancelamento",[
  "Você pode cancelar a assinatura a qualquer momento pelo suporte. O acesso continua até o fim do período já pago. Planos com fidelidade seguem as condições combinadas na contratação. Após o cancelamento, você pode solicitar a exportação ou a exclusão dos seus dados."
 ]],
 ["9. Responsabilidade",[
  "O RupControl é uma ferramenta de gestão: as decisões comerciais, fiscais e trabalhistas da empresa continuam sendo de responsabilidade do proprietário. A Ruptix não se responsabiliza por prejuízos causados por uso indevido do sistema, por informações incorretas cadastradas ou por falhas de serviços de terceiros."
 ]],
 ["10. Alterações e contato",[
  "Estes Termos podem ser atualizados. Mudanças relevantes serão informadas no sistema e um novo aceite será solicitado. Dúvidas: "+SUPPORT_EMAIL+". Fica eleito o foro do domicílio do contratante para resolver eventuais conflitos."
 ]]
];

export default function Termos(){
 return <LegalDoc title="Termos de Uso" intro="Estas são as regras para usar o RupControl. Elas explicam o que oferecemos, o que esperamos de quem usa o sistema e como funcionam o teste grátis, os planos e os pagamentos." sections={sections}/>;
}
