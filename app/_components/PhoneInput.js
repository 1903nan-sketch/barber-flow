"use client";
import {useState} from "react";
import {formatPhone,PHONE_PLACEHOLDER} from "../../lib/phone";

// Campo de telefone que já formata enquanto digita ("11 91234-5678") e não
// aceita dígito a mais. Funciona controlado (value/onChange recebe o texto
// formatado) ou solto em formulários (name/defaultValue, lido via FormData).
export default function PhoneInput({value,defaultValue,onChange,placeholder=PHONE_PLACEHOLDER,...props}){
 const [own,setOwn]=useState(()=>formatPhone(defaultValue));
 const controlled=value!==undefined,shown=controlled?formatPhone(value):own;
 function change(e){
  const next=formatPhone(e.target.value);
  if(!controlled)setOwn(next);
  onChange?.(next,e);
 }
 return <input {...props} type="tel" inputMode="numeric" autoComplete={props.autoComplete||"tel-national"} placeholder={placeholder} value={shown} onChange={change}/>;
}
