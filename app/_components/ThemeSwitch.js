"use client";
import {useEffect,useState} from "react";
import {THEMES} from "../../lib/theme";

function applyTheme(scope,dark){
 const t=THEMES[scope],root=document.documentElement;
 if(dark)root.setAttribute(t.attr,"dark");else root.removeAttribute(t.attr);
 const meta=document.querySelector('meta[name="theme-color"]');
 if(meta)meta.setAttribute("content",t.color[dark?"dark":"light"]);
}

export function useTheme(scope){
 const [dark,setDark]=useState(false);
 useEffect(()=>{
  let on=false;try{on=localStorage.getItem(THEMES[scope].key)==="dark"}catch{}
  setDark(on);applyTheme(scope,on);
 },[scope]);
 function toggle(next=!dark){
  setDark(next);applyTheme(scope,next);
  try{localStorage.setItem(THEMES[scope].key,next?"dark":"light")}catch{}
 }
 return [dark,toggle];
}

// Chave liga/desliga no estilo do iPhone (verde quando ligada).
export function IosSwitch({checked,onChange,label,className=""}){
 return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={"ios-switch"+(checked?" on":"")+(className?" "+className:"")} onClick={()=>onChange(!checked)}><span/></button>;
}

export default function ThemeSwitch({scope="dashboard",label="Modo escuro",ariaLabel="Modo escuro",className=""}){
 const [dark,toggle]=useTheme(scope);
 return <label className={"theme-switch "+className} onClick={e=>{if(e.target.closest(".ios-switch"))return;e.preventDefault();toggle()}}>
  <span>{label}</span><IosSwitch checked={dark} onChange={toggle} label={ariaLabel}/>
 </label>;
}
