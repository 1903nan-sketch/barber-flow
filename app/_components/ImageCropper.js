"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {Check,Minus,Move,Plus,X} from "lucide-react";
import {decodeImage} from "../../lib/image-file";

// Ajustar a foto antes de enviar: arrastar para posicionar e zoom (botões,
// barra, rodinha do mouse ou pinça no celular). O que aparece na moldura é
// exatamente o que vai para o site.
// shape: "circle" (foto do profissional), "rounded" (logo e serviço) ou "wide" (capa).
export default function ImageCropper({file,aspect=1,shape="rounded",output=1000,title="Ajustar foto",onCancel,onDone}){
 const wrapRef=useRef(null),canvasRef=useRef(null),pointers=useRef(new Map()),gesture=useRef(null);
 const [img,setImg]=useState(null),[box,setBox]=useState({w:0,h:0}),[zoom,setZoom]=useState(1),[pos,setPos]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const iw=img?(img.width||img.naturalWidth):1,ih=img?(img.height||img.naturalHeight):1;
 const base=box.w&&img?Math.max(box.w/iw,box.h/ih):1,scale=base*zoom;

 useEffect(()=>{let alive=true;setError("");decodeImage(file).then(im=>{if(alive)setImg(im)}).catch(()=>{if(alive)setError("Não foi possível abrir esta imagem. Envie em JPG, PNG ou WebP.")});return()=>{alive=false}},[file]);
 // Tamanho da moldura conforme a tela.
 useEffect(()=>{
  function fit(){const max=Math.min((wrapRef.current?.clientWidth||320),aspect>1.5?620:340),w=Math.round(max),h=Math.round(w/aspect);setBox({w,h})}
  fit();window.addEventListener("resize",fit);return()=>window.removeEventListener("resize",fit);
 },[aspect]);

 const clamp=useCallback((p,s)=>({x:Math.min(0,Math.max(box.w-iw*s,p.x)),y:Math.min(0,Math.max(box.h-ih*s,p.y))}),[box,iw,ih]);
 // Começa centralizada; foto de pessoa (círculo) um pouco mais para cima, onde fica o rosto.
 useEffect(()=>{if(!img||!box.w)return;const s=Math.max(box.w/iw,box.h/ih);setZoom(1);setPos(clamp({x:(box.w-iw*s)/2,y:(box.h-ih*s)*(shape==="circle"?0.3:0.5)},s))},[img,box.w,box.h]);// eslint-disable-line react-hooks/exhaustive-deps

 // Desenha a prévia.
 useEffect(()=>{
  const c=canvasRef.current;if(!c||!img||!pos||!box.w)return;
  const dpr=Math.min(2,window.devicePixelRatio||1);c.width=box.w*dpr;c.height=box.h*dpr;
  const ctx=c.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,box.w,box.h);ctx.imageSmoothingQuality="high";
  ctx.drawImage(img,pos.x,pos.y,iw*scale,ih*scale);
 },[img,pos,scale,box,iw,ih]);

 function setZoomAround(next,cx=box.w/2,cy=box.h/2){
  const z=Math.min(4,Math.max(1,next));if(!pos)return setZoom(z);
  const s0=scale,s1=base*z,ix=(cx-pos.x)/s0,iy=(cy-pos.y)/s0;
  setZoom(z);setPos(clamp({x:cx-ix*s1,y:cy-iy*s1},s1));
 }
 function down(e){e.currentTarget.setPointerCapture(e.pointerId);pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});gesture.current=null}
 function move(e){
  if(!pointers.current.has(e.pointerId)||!pos)return;
  const prev=pointers.current.get(e.pointerId);pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const pts=[...pointers.current.values()];
  if(pts.length>=2){
   const d=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),r=canvasRef.current.getBoundingClientRect();
   if(gesture.current){setZoomAround(zoom*d/gesture.current,(pts[0].x+pts[1].x)/2-r.left,(pts[0].y+pts[1].y)/2-r.top)}
   gesture.current=d;return;
  }
  setPos(p=>clamp({x:p.x+e.clientX-prev.x,y:p.y+e.clientY-prev.y},scale));
 }
 function up(e){pointers.current.delete(e.pointerId);if(pointers.current.size<2)gesture.current=null}
 function wheel(e){e.preventDefault();const r=canvasRef.current.getBoundingClientRect();setZoomAround(zoom*Math.exp(-e.deltaY*0.0015),e.clientX-r.left,e.clientY-r.top)}
 useEffect(()=>{const c=canvasRef.current;if(!c)return;c.addEventListener("wheel",wheel,{passive:false});return()=>c.removeEventListener("wheel",wheel)});

 async function done(){
  if(!img||!pos||busy)return;setBusy(true);
  try{
   const outW=output,outH=Math.round(output/aspect),c=document.createElement("canvas");c.width=outW;c.height=outH;
   const ctx=c.getContext("2d");ctx.imageSmoothingQuality="high";
   ctx.drawImage(img,-pos.x/scale,-pos.y/scale,box.w/scale,box.h/scale,0,0,outW,outH);
   let blob=await new Promise(r=>c.toBlob(r,"image/webp",.88));
   if(!blob||blob.type!=="image/webp")blob=await new Promise(r=>c.toBlob(r,"image/jpeg",.88));
   if(!blob)throw new Error("Não foi possível preparar a foto.");
   const ext=blob.type==="image/webp"?"webp":"jpg";
   await onDone(new File([blob],String(file.name||"foto").replace(/\.[^.]+$/,"")+"."+ext,{type:blob.type}));
  }catch(err){setError(err.message||"Não foi possível preparar a foto.");setBusy(false)}
 }

 if(typeof document==="undefined")return null;
 return createPortal(<div className="checkout-backdrop crop-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onCancel()}}>
  <div className="checkout-modal crop-modal" role="dialog" aria-modal="true" aria-label={title}>
   <button type="button" className="checkout-close" onClick={onCancel} aria-label="Fechar" disabled={busy}><X/></button>
   <p className="eyebrow">FOTO</p><h2>{title}</h2>
   <p className="crop-hint"><Move size={15}/>Arraste para posicionar e use o zoom para aproximar.</p>
   <div className="crop-stage" ref={wrapRef}>
    <div className={"crop-frame "+shape} style={{width:box.w||undefined,height:box.h||undefined}}>
     {!img&&!error&&<span className="crop-loading">Abrindo foto...</span>}
     <canvas ref={canvasRef} style={{width:box.w,height:box.h}} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Arraste para posicionar a foto"/>
    </div>
   </div>
   <div className="crop-zoom">
    <button type="button" onClick={()=>setZoomAround(zoom-0.2)} disabled={!img||zoom<=1} aria-label="Afastar"><Minus size={16}/></button>
    <input type="range" min="1" max="4" step="0.01" value={zoom} onChange={e=>setZoomAround(Number(e.target.value))} disabled={!img} aria-label="Zoom"/>
    <button type="button" onClick={()=>setZoomAround(zoom+0.2)} disabled={!img||zoom>=4} aria-label="Aproximar"><Plus size={16}/></button>
   </div>
   {error&&<div className="form-alert error">{error}</div>}
   <div className="crop-actions"><button type="button" className="secondary-action" onClick={onCancel} disabled={busy}>Cancelar</button><button type="button" className="primary" onClick={done} disabled={!img||busy}><Check size={16}/>{busy?"Salvando...":"Usar esta foto"}</button></div>
  </div>
 </div>,document.body);
}

// Baixa uma foto já publicada para ajustar de novo (precisa de CORS no storage).
export async function fileFromUrl(url){
 const res=await fetch(url,{cache:"no-store"});
 if(!res.ok)throw new Error("Não foi possível abrir a foto atual. Envie a foto de novo.");
 const blob=await res.blob();
 return new File([blob],"foto-atual",{type:blob.type||"image/jpeg"});
}
