"use client";
import {useEffect,useRef} from "react";

/* Efeitos da página institucional da Ruptix:
   - rede de partículas no fundo que reage ao ponteiro;
   - brilho que segue o mouse e rastro de faíscas;
   - gestos no celular: toque (onda), toque duplo (fogos), segurar (esfera de
     energia que explode ao soltar), arrastar (rastro), deslizar rápido
     (cometa), dois dedos (feixe de luz) e inclinar o aparelho (paralaxe);
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
    const k=e.pointerType==="mouse"?1:1.6;card.style.setProperty("--ry",`${(x-.5)*9*k}deg`);card.style.setProperty("--rx",`${(.5-y)*7*k}deg`)};
   const leave=()=>{card.style.setProperty("--ry","0deg");card.style.setProperty("--rx","0deg");card.classList.remove("rx-pressed")};
   const down=e=>{if(e.pointerType!=="mouse"){card.classList.add("rx-pressed");move(e)}};
   on(card,"pointermove",move);on(card,"pointerleave",leave);on(card,"pointerdown",down);on(card,"pointerup",leave);on(card,"pointercancel",leave);
  });

  // Botões magnéticos
  if(fine)root.querySelectorAll("[data-magnetic]").forEach(btn=>{
   const move=e=>{const r=btn.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;btn.style.transform=`translate(${x*.18}px,${y*.28}px)`};
   const leave=()=>{btn.style.transform=""};
   on(btn,"pointermove",move);on(btn,"pointerleave",leave);
  });

  // Peças visuais reutilizadas pelos gestos (inseridas no body).
  const glow=glowRef.current;let gx=innerWidth/2,gy=innerHeight/3,tx=gx,ty=gy,lastSpark=0,raf=0;
  const add=(cls,x,y,vars={})=>{const el=document.createElement(cls==="rx-spark"?"i":"span");el.className=cls;el.style.left=x+"px";el.style.top=y+"px";
   for(const k in vars)el.style.setProperty(k,vars[k]);document.body.appendChild(el);el.addEventListener("animationend",()=>el.remove(),{once:true});return el};
  const spark=(x,y,big,angle,dist,hue)=>{const a=angle??Math.random()*Math.PI*2,d=dist??((big?26:12)+Math.random()*(big?30:18));
   const el=add("rx-spark",x,y,{"--dx":`${Math.cos(a)*d}px`,"--dy":`${Math.sin(a)*d}px`,"--hue":String(hue??250+Math.random()*70)});if(big)el.classList.add("rx-spark-big")};
  const ripple=(x,y,n=9)=>{add("rx-ripple",x,y);for(let i=0;i<n;i++)spark(x,y,true)};
  const trail=(x,y,gap)=>{const now=performance.now();if(now-lastSpark>gap){lastSpark=now;spark(x,y,false)}};
  const buzz=pattern=>{try{navigator.vibrate?.(pattern)}catch{}};

  // Rede de partículas (também recebe os impulsos dos gestos)
  const net={targets:[],burst(){},push(){}};
  const canvas=canvasRef.current,ctx=canvas?.getContext("2d");
  if(canvas&&ctx){
   let w=0,h=0,dpr=1,pts=[],praf=0,visible=true;
   const resize=()=>{dpr=Math.min(2,devicePixelRatio||1);w=canvas.clientWidth;h=canvas.clientHeight;canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    const n=Math.round(Math.min(90,Math.max(34,w*h/16000)));
    pts=Array.from({length:n},()=>({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.35,vy:(Math.random()-.5)*.35,r:1+Math.random()*1.6}))};
   resize();on(window,"resize",resize);
   // Empurra as partículas para longe de (x,y): ondas de choque e explosões.
   net.burst=(x,y,force,radius)=>{for(const p of pts){const dx=p.x-x,dy=p.y-y,d=Math.hypot(dx,dy)||1;if(d<radius){const k=force*(1-d/radius);p.vx+=dx/d*k;p.vy+=dy/d*k}}};
   // Arrasta as partículas próximas na direção do deslize.
   net.push=(x,y,vx,vy,radius)=>{for(const p of pts){const d=Math.hypot(p.x-x,p.y-y);if(d<radius){const k=1-d/radius;p.vx+=vx*k;p.vy+=vy*k}}};
   const io=new IntersectionObserver(([e])=>{visible=e.isIntersecting});io.observe(canvas);cleanups.push(()=>io.disconnect());
   const draw=()=>{praf=requestAnimationFrame(draw);if(!visible||document.hidden)return;ctx.clearRect(0,0,w,h);const T=net.targets;
    for(const p of pts){for(const m of T){const dx=m.x-p.x,dy=m.y-p.y,dist=Math.hypot(dx,dy)||1;if(dist<180){p.vx+=dx/dist*.02;p.vy+=dy/dist*.02}}
     p.vx*=.975;p.vy*=.975;p.vx+=(Math.random()-.5)*.02;p.vy+=(Math.random()-.5)*.02;p.x+=p.vx;p.y+=p.vy;
     if(p.x<0||p.x>w)p.vx*=-1;if(p.y<0||p.y>h)p.vy*=-1;p.x=Math.max(0,Math.min(w,p.x));p.y=Math.max(0,Math.min(h,p.y))}
    for(let i=0;i<pts.length;i++){const a=pts[i];
     for(let j=i+1;j<pts.length;j++){const b=pts[j],d=Math.hypot(a.x-b.x,a.y-b.y);
      if(d<130){ctx.strokeStyle=`rgba(107,76,255,${(1-d/130)*.22})`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}}
     let near=false;
     for(const m of T){const md=Math.hypot(a.x-m.x,a.y-m.y);
      if(md<190){near=true;ctx.strokeStyle=`rgba(34,180,238,${(1-md/190)*.45})`;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(m.x,m.y);ctx.stroke()}}
     ctx.fillStyle=near?"rgba(34,180,238,.9)":"rgba(107,76,255,.55)";ctx.beginPath();ctx.arc(a.x,a.y,a.r,0,Math.PI*2);ctx.fill()}};
   praf=requestAnimationFrame(draw);cleanups.push(()=>cancelAnimationFrame(praf));
  }

  // Mouse: brilho que segue o cursor, rastro e onda no clique.
  on(window,"pointermove",e=>{if(e.pointerType==="touch")return;tx=e.clientX;ty=e.clientY;glow?.classList.add("on");net.targets=[{x:e.clientX,y:e.clientY}];trail(e.clientX,e.clientY,46)},{passive:true});
  on(window,"pointerdown",e=>{if(e.pointerType==="touch")return;ripple(e.clientX,e.clientY);net.burst(e.clientX,e.clientY,2.2,160)},{passive:true});
  on(document,"pointerleave",()=>{glow?.classList.remove("on");net.targets=[]});
  const follow=()=>{gx+=(tx-gx)*.14;gy+=(ty-gy)*.14;if(glow)glow.style.transform=`translate3d(${gx}px,${gy}px,0)`;raf=requestAnimationFrame(follow)};
  raf=requestAnimationFrame(follow);cleanups.push(()=>cancelAnimationFrame(raf));

  // ----- Gestos de toque -----
  // Usa touch* (e não pointer*) porque o navegador cancela os eventos de
  // ponteiro assim que a rolagem começa; touch* continua chegando.
  const g={holdStart:0,startX:0,startY:0,lastX:0,lastY:0,lastT:0,vx:0,vy:0,moved:false,holdTimer:0,holding:false,orb:null,beam:null,lastTap:0,lastTapX:0,lastTapY:0};
  const fireworks=(x,y)=>{
   add("rx-ripple rx-ripple-xl",x,y);setTimeout(()=>add("rx-ripple rx-ripple-xl",x,y),130);setTimeout(()=>add("rx-ripple",x,y),260);
   for(let i=0;i<28;i++){const a=i/28*Math.PI*2;spark(x,y,true,a,60+Math.random()*70,200+(i*13)%140)}
   net.burst(x,y,5,260);buzz([10,40,14]);
  };
  const shockwave=(x,y,power)=>{
   add("rx-shock",x,y,{"--p":String(power)});
   for(let i=0;i<18+Math.round(power*14);i++){const a=Math.random()*Math.PI*2;spark(x,y,true,a,50+Math.random()*90*power)}
   net.burst(x,y,3+power*5,220+power*160);buzz(power>.8?[18,30,28]:22);
  };
  const comet=(x,y,vx,vy)=>{
   const speed=Math.hypot(vx,vy),ang=Math.atan2(vy,vx);
   add("rx-comet",x,y,{"--a":`${ang}rad`,"--len":`${Math.min(320,90+speed*130)}px`});
   for(let i=0;i<14;i++){const t=i/14;spark(x-vx*t*120,y-vy*t*120,i<5,ang+(Math.random()-.5)*.9,30+Math.random()*50)}
   net.push(x,y,vx*3,vy*3,260);buzz(8);
  };
  const updateBeam=(a,b)=>{
   if(!g.beam){g.beam=document.createElement("span");g.beam.className="rx-beam";document.body.appendChild(g.beam)}
   const dx=b.clientX-a.clientX,dy=b.clientY-a.clientY,len=Math.hypot(dx,dy);
   g.beam.style.left=a.clientX+"px";g.beam.style.top=a.clientY+"px";g.beam.style.width=len+"px";
   g.beam.style.transform=`rotate(${Math.atan2(dy,dx)}rad)`;g.beam.style.setProperty("--hue",String(180+Math.min(140,len/3)));
  };
  const endBeam=()=>{if(g.beam){const el=g.beam;g.beam=null;el.classList.add("rx-beam-out");setTimeout(()=>el.remove(),350)}};
  const cancelHold=()=>{clearTimeout(g.holdTimer);if(g.orb&&!g.holding){g.orb.remove();g.orb=null}};

  on(window,"touchstart",e=>{
   const t=e.touches[0];if(!t)return;askMotion();
   if(e.touches.length>=2){cancelHold();g.holding=false;g.orb?.remove();g.orb=null;updateBeam(e.touches[0],e.touches[1]);
    for(const f of e.touches)add("rx-ripple",f.clientX,f.clientY);net.targets=[...e.touches].map(f=>({x:f.clientX,y:f.clientY}));buzz(6);return}
   Object.assign(g,{startX:t.clientX,startY:t.clientY,lastX:t.clientX,lastY:t.clientY,lastT:performance.now(),vx:0,vy:0,moved:false,holding:false});
   tx=t.clientX;ty=t.clientY;glow?.classList.add("on");net.targets=[{x:t.clientX,y:t.clientY}];
   const now=performance.now();
   if(now-g.lastTap<320&&Math.hypot(t.clientX-g.lastTapX,t.clientY-g.lastTapY)<48){fireworks(t.clientX,t.clientY);g.lastTap=0}
   else{ripple(t.clientX,t.clientY,7);net.burst(t.clientX,t.clientY,1.6,140)}
   // Segurar: a esfera começa a carregar depois de um instante parado.
   clearTimeout(g.holdTimer);
   g.holdTimer=setTimeout(()=>{if(g.moved)return;g.holding=true;g.holdStart=performance.now();
    const orb=document.createElement("span");orb.className="rx-orb";orb.style.left=g.lastX+"px";orb.style.top=g.lastY+"px";document.body.appendChild(orb);g.orb=orb;buzz(12)},380);
  },{passive:true});

  on(window,"touchmove",e=>{
   if(e.touches.length>=2){updateBeam(e.touches[0],e.touches[1]);net.targets=[...e.touches].map(f=>({x:f.clientX,y:f.clientY}));
    for(const f of e.touches)trail(f.clientX,f.clientY,30);return}
   const t=e.touches[0];if(!t)return;const now=performance.now(),dt=Math.max(1,now-g.lastT);
   g.vx=g.vx*.4+(t.clientX-g.lastX)/dt*.6;g.vy=g.vy*.4+(t.clientY-g.lastY)/dt*.6;
   g.lastX=t.clientX;g.lastY=t.clientY;g.lastT=now;
   if(Math.hypot(t.clientX-g.startX,t.clientY-g.startY)>12){g.moved=true;if(!g.holding)cancelHold()}
   if(g.orb){g.orb.style.left=t.clientX+"px";g.orb.style.top=t.clientY+"px"}
   tx=t.clientX;ty=t.clientY;glow?.classList.add("on");net.targets=[{x:t.clientX,y:t.clientY}];trail(t.clientX,t.clientY,24);
  },{passive:true});

  const touchEnd=e=>{
   if(e.touches.length>=2)return;
   if(e.touches.length===1&&g.beam){endBeam();return}
   endBeam();clearTimeout(g.holdTimer);
   if(g.holding&&g.orb){const held=Math.min(1,(performance.now()-g.holdStart)/1400);const el=g.orb;g.orb=null;g.holding=false;
    const r=el.getBoundingClientRect();el.remove();shockwave(r.left+r.width/2,r.top+r.height/2,.45+held*.55)}
   else if(g.moved&&Math.hypot(g.vx,g.vy)>.55&&performance.now()-g.lastT<90)comet(g.lastX,g.lastY,g.vx,g.vy);
   else if(!g.moved){g.lastTap=performance.now();g.lastTapX=g.startX;g.lastTapY=g.startY}
   glow?.classList.remove("on");setTimeout(()=>{if(!g.holding)net.targets=[]},250);
  };
  on(window,"touchend",touchEnd,{passive:true});on(window,"touchcancel",touchEnd,{passive:true});
  cleanups.push(()=>{clearTimeout(g.holdTimer);g.orb?.remove();g.beam?.remove()});

  // Inclinar o aparelho move o fundo e os cartões (paralaxe).
  let motionAsked=false;
  const onTilt=e=>{if(e.gamma==null)return;const x=Math.max(-1,Math.min(1,e.gamma/30)),y=Math.max(-1,Math.min(1,((e.beta??45)-45)/30));
   root.style.setProperty("--tilt-x",x.toFixed(3));root.style.setProperty("--tilt-y",y.toFixed(3));root.classList.add("rx-tilting")};
  function askMotion(){
   if(motionAsked||fine)return;motionAsked=true;
   const DOE=window.DeviceOrientationEvent;if(!DOE)return;
   // iOS exige permissão pedida dentro de um gesto; Android libera direto.
   if(typeof DOE.requestPermission==="function")DOE.requestPermission().then(r=>{if(r==="granted")on(window,"deviceorientation",onTilt)}).catch(()=>{});
   else on(window,"deviceorientation",onTilt);
  }

  // Dica rápida dos gestos, exibida uma vez por sessão em telas de toque.
  if(!fine){let seen=false;try{seen=sessionStorage.getItem("rx_hint")==="1"}catch{}
   if(!seen){const hint=document.createElement("div");hint.className="rx-hint";hint.setAttribute("role","status");
    hint.innerHTML="<b>✦</b> Toque, toque duas vezes, segure, deslize rápido ou use dois dedos";
    const show=setTimeout(()=>{document.body.appendChild(hint);try{sessionStorage.setItem("rx_hint","1")}catch{}},2200);
    const hide=setTimeout(()=>hint.classList.add("out"),8200),kill=setTimeout(()=>hint.remove(),8800);
    const dismiss=()=>{hint.classList.add("out");setTimeout(()=>hint.remove(),500)};on(window,"touchstart",dismiss,{passive:true,once:true});
    cleanups.push(()=>{clearTimeout(show);clearTimeout(hide);clearTimeout(kill);hint.remove()})}}

  return()=>cleanups.forEach(f=>f());
 },[]);

 return <>
  <div className="rx-progress" ref={progressRef} aria-hidden="true"/>
  <canvas className="rx-net" ref={canvasRef} aria-hidden="true"/>
  <div className="rx-cursor-glow" ref={glowRef} aria-hidden="true"/>
 </>;
}
