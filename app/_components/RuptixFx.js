"use client";
import {useEffect,useRef} from "react";

/* Efeitos da página institucional da Ruptix:
   - rede de partículas no fundo que reage ao ponteiro;
   - brilho que segue o mouse e rastro de faíscas;
   - toque no celular: onda + brilho onde o dedo encosta e rastro ao arrastar;
   - cartões com inclinação 3D e luz interna (data-tilt);
   - botões magnéticos (data-magnetic);
   - entrada animada ao rolar (data-reveal) e contadores (data-count);
   - barra de progresso da rolagem e menu que encolhe ao rolar.
   Tudo é desligado quando o sistema pede menos movimento. */
export default function RuptixFx(){
 const canvasRef=useRef(null),glowRef=useRef(null),progressRef=useRef(null);

 useEffect(()=>{
  const root=document.querySelector(".rx");
  if(!root)return;
  const reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine=window.matchMedia("(pointer: fine)").matches;
  const cleanups=[];
  const on=(el,ev,fn,opt)=>{el.addEventListener(ev,fn,opt);cleanups.push(()=>el.removeEventListener(ev,fn,opt))};

  // Entrada ao rolar
  const revealEls=[...root.querySelectorAll("[data-reveal]")];
  if(reduce||!("IntersectionObserver" in window)){revealEls.forEach(el=>el.classList.add("is-in"))}
  else{
   const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add("is-in");io.unobserve(e.target)}}),{threshold:.14,rootMargin:"0px 0px -8% 0px"});
   revealEls.forEach(el=>io.observe(el));cleanups.push(()=>io.disconnect());
  }

  // Contadores
  const counters=[...root.querySelectorAll("[data-count]")];
  const runCounter=el=>{const target=Number(el.dataset.count)||0,suffix=el.dataset.suffix||"",start=performance.now(),dur=1400;
   if(reduce){el.textContent=target+suffix;return}
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

  if(reduce)return()=>cleanups.forEach(f=>f());

  // Cartões com inclinação e luz interna
  root.querySelectorAll("[data-tilt]").forEach(card=>{
   const move=e=>{const r=card.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
    card.style.setProperty("--mx",`${x*100}%`);card.style.setProperty("--my",`${y*100}%`);
    if(e.pointerType==="mouse"){card.style.setProperty("--ry",`${(x-.5)*9}deg`);card.style.setProperty("--rx",`${(.5-y)*7}deg`)}};
   const leave=()=>{card.style.setProperty("--ry","0deg");card.style.setProperty("--rx","0deg")};
   on(card,"pointermove",move);on(card,"pointerleave",leave);
  });

  // Botões magnéticos
  if(fine)root.querySelectorAll("[data-magnetic]").forEach(btn=>{
   const move=e=>{const r=btn.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;btn.style.transform=`translate(${x*.18}px,${y*.28}px)`};
   const leave=()=>{btn.style.transform=""};
   on(btn,"pointermove",move);on(btn,"pointerleave",leave);
  });

  // Brilho do cursor, faíscas e toques
  const glow=glowRef.current;let gx=innerWidth/2,gy=innerHeight/3,tx=gx,ty=gy,lastSpark=0,raf=0;
  const spark=(x,y,big)=>{const s=document.createElement("i");s.className="rx-spark"+(big?" rx-spark-big":"");
   const a=Math.random()*Math.PI*2,d=(big?26:12)+Math.random()*(big?30:18);
   s.style.left=x+"px";s.style.top=y+"px";s.style.setProperty("--dx",`${Math.cos(a)*d}px`);s.style.setProperty("--dy",`${Math.sin(a)*d}px`);
   s.style.setProperty("--hue",String(250+Math.random()*70));
   document.body.appendChild(s);s.addEventListener("animationend",()=>s.remove(),{once:true})};
  const ripple=(x,y)=>{const r=document.createElement("span");r.className="rx-ripple";r.style.left=x+"px";r.style.top=y+"px";
   document.body.appendChild(r);r.addEventListener("animationend",()=>r.remove(),{once:true});
   for(let i=0;i<9;i++)spark(x,y,true)};
  const trail=(x,y,gap)=>{const now=performance.now();if(now-lastSpark>gap){lastSpark=now;spark(x,y,false)}};
  on(window,"pointermove",e=>{if(e.pointerType==="touch")return;tx=e.clientX;ty=e.clientY;glow?.classList.add("on");trail(e.clientX,e.clientY,46)},{passive:true});
  // No celular o navegador interrompe os eventos de ponteiro quando a rolagem
  // começa; touchmove continua chegando e mantém o brilho seguindo o dedo.
  on(window,"touchmove",e=>{const t=e.touches[0];if(!t)return;tx=t.clientX;ty=t.clientY;glow?.classList.add("on");trail(t.clientX,t.clientY,26)},{passive:true});
  on(window,"touchend",()=>glow?.classList.remove("on"),{passive:true});
  on(window,"pointerdown",e=>ripple(e.clientX,e.clientY),{passive:true});
  on(document,"pointerleave",()=>glow?.classList.remove("on"));
  const follow=()=>{gx+=(tx-gx)*.14;gy+=(ty-gy)*.14;if(glow)glow.style.transform=`translate3d(${gx}px,${gy}px,0)`;raf=requestAnimationFrame(follow)};
  raf=requestAnimationFrame(follow);cleanups.push(()=>cancelAnimationFrame(raf));

  // Rede de partículas
  const canvas=canvasRef.current,ctx=canvas?.getContext("2d");
  if(canvas&&ctx){
   let w=0,h=0,dpr=1,pts=[],praf=0,visible=true;const mouse={x:-9999,y:-9999};
   const resize=()=>{dpr=Math.min(2,devicePixelRatio||1);w=canvas.clientWidth;h=canvas.clientHeight;canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    const n=Math.round(Math.min(90,Math.max(34,w*h/16000)));
    pts=Array.from({length:n},()=>({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.35,vy:(Math.random()-.5)*.35,r:1+Math.random()*1.6}))};
   resize();on(window,"resize",resize);
   on(window,"pointermove",e=>{const r=canvas.getBoundingClientRect();mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top},{passive:true});
   const io=new IntersectionObserver(([e])=>{visible=e.isIntersecting});io.observe(canvas);cleanups.push(()=>io.disconnect());
   const draw=()=>{praf=requestAnimationFrame(draw);if(!visible||document.hidden)return;ctx.clearRect(0,0,w,h);
    for(const p of pts){const dx=mouse.x-p.x,dy=mouse.y-p.y,dist=Math.hypot(dx,dy);
     if(dist<180){p.vx+=dx/dist*.02;p.vy+=dy/dist*.02}
     p.vx*=.985;p.vy*=.985;p.vx+=(Math.random()-.5)*.02;p.vy+=(Math.random()-.5)*.02;p.x+=p.vx;p.y+=p.vy;
     if(p.x<0||p.x>w)p.vx*=-1;if(p.y<0||p.y>h)p.vy*=-1;p.x=Math.max(0,Math.min(w,p.x));p.y=Math.max(0,Math.min(h,p.y))}
    for(let i=0;i<pts.length;i++){const a=pts[i];
     for(let j=i+1;j<pts.length;j++){const b=pts[j],d=Math.hypot(a.x-b.x,a.y-b.y);
      if(d<130){ctx.strokeStyle=`rgba(107,76,255,${(1-d/130)*.22})`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}}
     const md=Math.hypot(a.x-mouse.x,a.y-mouse.y);
     if(md<190){ctx.strokeStyle=`rgba(34,180,238,${(1-md/190)*.45})`;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(mouse.x,mouse.y);ctx.stroke()}
     ctx.fillStyle=md<190?"rgba(34,180,238,.9)":"rgba(107,76,255,.55)";ctx.beginPath();ctx.arc(a.x,a.y,a.r,0,Math.PI*2);ctx.fill()}};
   praf=requestAnimationFrame(draw);cleanups.push(()=>cancelAnimationFrame(praf));
  }

  return()=>cleanups.forEach(f=>f());
 },[]);

 return <>
  <div className="rx-progress" ref={progressRef} aria-hidden="true"/>
  <canvas className="rx-net" ref={canvasRef} aria-hidden="true"/>
  <div className="rx-cursor-glow" ref={glowRef} aria-hidden="true"/>
 </>;
}
