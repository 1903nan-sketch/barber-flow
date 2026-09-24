"use client";
import {useEffect,useState} from "react";
import {CheckCircle2,TriangleAlert,X} from "lucide-react";

export default function GlobalNotice(){
 const [notice,setNotice]=useState(null);
 useEffect(()=>{
  let timer;
  const show=detail=>{
   if(!detail?.message)return;
   setNotice(detail);
   clearTimeout(timer);
   timer=setTimeout(()=>setNotice(null),3600);
   try{sessionStorage.removeItem("barberflow_notice")}catch{}
  };
  const handler=e=>show(e.detail);
  window.addEventListener("barberflow:notice",handler);
  try{
   const saved=sessionStorage.getItem("barberflow_notice");
   if(saved)show(JSON.parse(saved));
  }catch{}
  return()=>{window.removeEventListener("barberflow:notice",handler);clearTimeout(timer)};
 },[]);
 if(!notice)return null;
 const error=notice.type==="error";
 return <div className={"global-notice "+(error?"error":"success")} role="status" aria-live="polite">
  <span className="global-notice-icon">{error?<TriangleAlert size={18}/>:<CheckCircle2 size={18}/>}</span>
  <div><strong>{error?"Atenção":"Tudo certo"}</strong><small>{notice.message}</small></div>
  <button aria-label="Fechar aviso" onClick={()=>setNotice(null)}><X size={16}/></button>
 </div>;
}
