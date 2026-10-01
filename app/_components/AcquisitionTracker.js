"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";
import {captureAcquisition} from "../../lib/acquisition";

// Captura UTMs/IDs de clique somente nas páginas públicas (site, produtos, cadastro).
export default function AcquisitionTracker(){
 const pathname=usePathname();
 useEffect(()=>{
  if(pathname?.startsWith("/dashboard")||pathname?.startsWith("/admin")||pathname?.startsWith("/agendar"))return;
  captureAcquisition();
 },[pathname]);
 return null;
}
