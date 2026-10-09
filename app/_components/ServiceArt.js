"use client";
import {useState} from "react";
import {Brush,Dumbbell,Eye,Flower2,Hand,PawPrint,PenTool,Scissors,Smile,Sparkles,Stethoscope} from "lucide-react";

const plain=v=>String(v||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();

// Ícone pelo nome do serviço, para qualquer tipo de negócio. A primeira regra que bater vence.
const ICONS=[
 [/cilio|lash|sobrancel|brow|olhar/,Eye],
 [/unha|manicure|pedicure|esmalt|alongamento|fibra|\bgel\b/,Hand],
 [/maquiag|\bmake/,Brush],
 [/tatu|tattoo|piercing/,PenTool],
 [/\bpet\b|tosa|\bcao\b|gato|veterin/,PawPrint],
 [/\bdent|sorriso|clareamento|ortodon/,Smile],
 [/massag|\bspa\b|drenag|limpeza de pele|facial|estetic|depila|relax/,Flower2],
 [/consulta|avaliac|terapia|psico|nutri|fisio|retorno|exame/,Stethoscope],
 [/treino|personal|pilates|yoga|funcional|\baula/,Dumbbell],
 [/corte|cabel|barba|degrad|social|navalha|luzes|mecha|platin|escova|progressiva|hidrat|tranc|penteado|pigment|tintura|colora/,Scissors]
];
const COLORS=[["#1c1f26","#4a5160"],["#7a1515","#e0262f"],["#7a3b0c","#d9822b"],["#0f4a45","#14a395"],["#2b2a6b","#5b61e0"],["#6d1645","#d6337e"],["#3a3f2a","#8c9a4f"]];

export function serviceIcon(name){
 const n=plain(name);
 return (ICONS.find(([re])=>re.test(n))||[null,Sparkles])[1];
}

// Foto do serviço; sem foto (ou se a imagem falhar), mostra um quadro com ícone e cor pelo nome.
export default function ServiceArt({name,src,className=""}){
 const [broken,setBroken]=useState("");
 if(src&&broken!==src)return <img className={"service-art "+className} src={src} alt="" loading="lazy" onError={()=>setBroken(src)}/>;
 const n=plain(name),hash=[...n].reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,7),[a,b]=COLORS[hash%COLORS.length],Icon=serviceIcon(name);
 return <span className={"service-art service-art-fallback "+className} style={{background:`linear-gradient(135deg,${a},${b})`}} aria-hidden="true"><Icon/></span>;
}
