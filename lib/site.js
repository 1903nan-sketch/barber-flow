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
