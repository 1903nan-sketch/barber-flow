// Regras de plano usadas pela interface. O backend (RLS/RPC) é quem bloqueia de fato;
// aqui só decidimos o que mostrar.
export const PLAN_ORDER=["Starter","Pro","Pro + Filiais"];

const FALLBACK={
 Starter:{public_booking:false,whatsapp_bot:false,automations:false,marketing:false,deposits:false,multi_unit:false},
 Pro:{public_booking:true,whatsapp_bot:true,automations:true,marketing:true,deposits:true,multi_unit:false},
 "Pro + Filiais":{public_booking:true,whatsapp_bot:true,automations:true,marketing:true,deposits:true,multi_unit:true}
};

export const planName=tenant=>String(tenant?.plans?.name||"");
export const isStarter=tenant=>planName(tenant).toLowerCase()==="starter";

export function hasFeature(tenant,feature){
 const features=tenant?.plans?.features;
 if(features&&typeof features==="object"&&feature in features)return Boolean(features[feature]);
 return Boolean(FALLBACK[planName(tenant)]?.[feature]);
}

export const money=cents=>(Number(cents||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

const DAY=86400000;
export function subscriptionInfo(tenant){
 const status=tenant?.status||"";
 const trialEnds=tenant?.trial_ends_at?new Date(tenant.trial_ends_at):null;
 const now=Date.now();
 const trialDaysLeft=trialEnds?Math.max(0,Math.ceil((trialEnds.getTime()-now)/DAY)):null;
 const trialExpired=Boolean(trialEnds&&trialEnds.getTime()<now&&!tenant?.last_paid_at);
 const due=tenant?.billing_due_date?new Date(tenant.billing_due_date+"T12:00:00"):null;
 const grace=Number(tenant?.grace_days||0);
 const blockDate=due?new Date(due.getTime()+grace*DAY):null;
 return {
  status,
  inTrial:status==="trial",
  trialEnds,
  trialDaysLeft,
  trialExpired,
  due,
  daysToDue:due?Math.ceil((due.getTime()-now)/DAY):null,
  blockDate,
  restricted:["blocked","suspended","cancelled"].includes(status)
 };
}

export const statusLabel={trial:"Teste grátis",active:"Ativa",pending:"Ativa",overdue:"Inadimplente",blocked:"Bloqueada",suspended:"Bloqueada",cancelled:"Cancelada"};
