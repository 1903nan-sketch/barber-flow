// Celular no padrão "11 91234-5678": DDD + número, sem +55 e sem dígito a mais.
export function phoneDigits(value){
 let d=String(value||"").replace(/\D/g,"");
 if(d.length>11&&d.startsWith("55"))d=d.slice(2);
 return d.slice(0,11);
}

export function formatPhone(value){
 const d=phoneDigits(value);
 if(d.length<=2)return d;
 const ddd=d.slice(0,2),n=d.slice(2),split=n.length>8?5:4;
 return n.length<=split?`${ddd} ${n}`:`${ddd} ${n.slice(0,split)}-${n.slice(split)}`;
}

// Completo: DDD + 8 (fixo) ou 9 dígitos (celular).
export const validPhone=value=>{const d=phoneDigits(value);return d.length===10||d.length===11};

export const PHONE_PLACEHOLDER="11 91234-5678";
