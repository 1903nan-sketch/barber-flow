// Painel e site de agendamento guardam o tema separadamente: o dono pode usar
// o painel escuro sem mudar o site que os clientes veem.
export const THEMES={
 dashboard:{key:"rupcontrol_theme",attr:"data-theme",color:{light:"#dadadd",dark:"#0e0f11"}},
 booking:{key:"rupcontrol_booking_theme",attr:"data-bk-theme",color:{light:"#e9eaee",dark:"#0e0f12"}}
};

// Lido no <head> antes de pintar a página, para não piscar o tema claro.
export const themeBootScript=`try{var d=document.documentElement;${Object.values(THEMES).map(t=>`if(localStorage.getItem("${t.key}")==="dark")d.setAttribute("${t.attr}","dark");`).join("")}}catch(e){}`;

