// Textos padrão das automações. Variáveis aceitas: {nome} {barbearia} {servico}
// {profissional} {data} {hora} {unidade} {endereco} {link} {dias}
export const DEFAULT_CONFIRMATION=
 "Olá, {nome}! 👋\n\nPassando para confirmar seu horário na *{barbearia}*:\n\n✂️ {servico}\n👤 {profissional}\n📅 {data} às {hora}\n📍 {unidade}\n\nResponda com uma opção:\n*1* — Confirmar\n*2* — Reagendar\n*3* — Cancelar";

export const DEFAULT_REMINDER=
 "⏰ Lembrete, {nome}: seu horário na *{barbearia}* é *{quando}*.\n\n✂️ {servico} com {profissional}\n📍 {unidade}{endereco}\n\nTe esperamos!";

export const DEFAULT_RECOVERY=
 "Olá, {nome}! Faz {dias} dias desde seu último atendimento na *{barbearia}*. ✂️\n\nQue tal deixar o visual em dia? Agende em poucos cliques:\n{link}";

export function fillTemplate(template,values){
 return String(template||"").replace(/\{(\w+)\}/g,(match,key)=>{
  const value=values?.[key];
  return value===undefined||value===null?"":String(value);
 }).replace(/\n{3,}/g,"\n\n").trim().slice(0,3500);
}

export function formatWhen(startsAt,timezone="America/Sao_Paulo"){
 const date=new Date(startsAt);
 return {
  date:date.toLocaleDateString("pt-BR",{timeZone:timezone,weekday:"long",day:"2-digit",month:"2-digit"}),
  time:date.toLocaleTimeString("pt-BR",{timeZone:timezone,hour:"2-digit",minute:"2-digit"})
 };
}

// "hoje às 15:00", "amanhã às 15:00" ou "sex., 03/10 às 15:00" no fuso da unidade.
export function relativeWhen(startsAt,timezone="America/Sao_Paulo"){
 const key=d=>new Date(d).toLocaleDateString("en-CA",{timeZone:timezone});
 const target=key(startsAt),today=key(Date.now()),tomorrow=key(Date.now()+86400000);
 const time=new Date(startsAt).toLocaleTimeString("pt-BR",{timeZone:timezone,hour:"2-digit",minute:"2-digit"});
 if(target===today)return "hoje às "+time;
 if(target===tomorrow)return "amanhã às "+time;
 return new Date(startsAt).toLocaleDateString("pt-BR",{timeZone:timezone,weekday:"short",day:"2-digit",month:"2-digit"})+" às "+time;
}

export const firstName=name=>String(name||"").trim().split(/\s+/)[0]||"cliente";
