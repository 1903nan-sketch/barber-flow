"use client";
import {useEffect,useRef} from "react";

/* Efeitos da página institucional da Ruptix:
   - entrada animada ao rolar (data-reveal) e contadores (data-count);
   - barra de progresso da rolagem e menu que encolhe ao rolar.
   Nada reage ao mouse nem ao toque. */
export default function RuptixFx(){
 const progressRef=useRef(null);

 useEffect(()=>{
  const root=document.querySelector(".rx");
  if(!root)return;
  const cleanups=[];
  const on=(el,ev,fn,opt)=>{el.addEventListener(ev,fn,opt);cleanups.push(()=>el.removeEventListener(ev,fn,opt))};

  // Entrada ao rolar
  const revealEls=[...root.querySelectorAll("[data-reveal]")];
  if(!("IntersectionObserver" in window)){revealEls.forEach(el=>el.classList.add("is-in"))}
  else{
   const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add("is-in");io.unobserve(e.target)}}),{threshold:.14,rootMargin:"0px 0px -8% 0px"});
   revealEls.forEach(el=>io.observe(el));cleanups.push(()=>io.disconnect());
  }

  // Contadores
  const counters=[...root.querySelectorAll("[data-count]")];
  const runCounter=el=>{const target=Number(el.dataset.count)||0,suffix=el.dataset.suffix||"",start=performance.now(),dur=1400;
   const step=t=>{const p=Math.min(1,(t-start)/dur),eased=1-Math.pow(1-p,3);el.textContent=Math.round(target*eased)+suffix;if(p<1)requestAnimationFrame(step)};requestAnimationFrame(step)};
  if("IntersectionObserver" in window){
   const cio=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){runCounter(e.target);cio.unobserve(e.target)}}),{threshold:.6});
   counters.forEach(el=>cio.observe(el));cleanups.push(()=>cio.disconnect());
  }else counters.forEach(runCounter);

  // Progresso da rolagem e menu compacto
  const onScroll=()=>{const max=document.documentElement.scrollHeight-innerHeight,p=max>0?scrollY/max:0;
   if(progressRef.current)progressRef.current.style.transform=`scaleX(${p})`;
   root.classList.toggle("rx-scrolled",scrollY>24)};
  onScroll();on(window,"scroll",onScroll,{passive:true});

  return()=>cleanups.forEach(f=>f());
 },[]);

 return <>
  <div className="rx-progress" ref={progressRef} aria-hidden="true"/>
 </>;
}
