"use client";

export function notify(message,type="success"){
 if(typeof window==="undefined")return;
 const detail={message:String(message||""),type,id:Date.now()};
 try{sessionStorage.setItem("barberflow_notice",JSON.stringify(detail))}catch{}
 window.dispatchEvent(new CustomEvent("barberflow:notice",{detail}));
}
