// Domínio em que o sistema RupControl atende.
// Para passar para o domínio novo, quando rupcontrol.3ruptix.com estiver ligado
// na Vercel e no Supabase: APP_HOST="rupcontrol.3ruptix.com" e
// LEGACY_APP_HOSTS=["barbertix.3ruptix.com","barberflow.3ruptix.com"].
export const APP_HOST="barbertix.3ruptix.com";
export const APP_URL="https://"+APP_HOST;
export const SIGNUP_URL=APP_URL+"/login?criar=1";
// Domínios antigos: o middleware manda as páginas abertas por eles para APP_HOST.
// As rotas /api continuam respondendo neles (webhooks do WhatsApp e do Asaas).
export const LEGACY_APP_HOSTS=[];
// Todos os domínios que servem o sistema; neles a home da Ruptix abre o login.
export const APP_HOSTS=["barbertix.3ruptix.com","barberflow.3ruptix.com","rupcontrol.3ruptix.com"];

// Link curto da agenda: APP_HOST/<endereço da empresa>. O middleware leva esse
// caminho para /agendar/<endereço>. Endereços iguais a uma rota do sistema
// ficam só no link longo; inclua aqui toda pasta nova de primeiro nível em app/.
export const RESERVED_SLUGS=["admin","agendar","api","dashboard","login","onboarding","privacidade","produtos","termos"];
export function bookingUrl(origin,slug){
 const host=new URL(origin).hostname,short=APP_HOSTS.includes(host)&&!RESERVED_SLUGS.includes(slug);
 return origin+(short?"/":"/agendar/")+slug;
}
