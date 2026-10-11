"use client";
import {useCallback,useEffect,useId,useLayoutEffect,useMemo,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {CalendarDays,ChevronDown,ChevronLeft,ChevronRight,Clock} from "lucide-react";

// Calendário e relógio próprios no lugar dos seletores nativos do navegador,
// com o mesmo visual (vidro fosco, claro/escuro) dos menus de seleção.
// Os valores seguem o formato dos inputs nativos: "AAAA-MM-DD" e "HH:MM".

const pad=n=>String(n).padStart(2,"0");
const isoOf=(y,m,d)=>`${y}-${pad(m+1)}-${pad(d)}`;
const parseIso=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||"")?{y:+v.slice(0,4),m:+v.slice(5,7)-1,d:+v.slice(8,10)}:null;
const todayIso=()=>{const n=new Date();return isoOf(n.getFullYear(),n.getMonth(),n.getDate())};
const MONTHS=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const WEEK=["D","S","T","Q","Q","S","S"];
export const formatDateBR=v=>{const p=parseIso(v);return p?`${pad(p.d)}/${pad(p.m+1)}/${p.y}`:""};

// Abre um painel flutuante preso ao campo: fica por cima de modais e de áreas
// com rolagem, abre para cima quando não cabe embaixo e fecha ao tocar fora.
function usePopover(){
 const [open,setOpen]=useState(false),[pos,setPos]=useState(null);
 const anchor=useRef(null),panel=useRef(null),id=useId();
 const place=useCallback(()=>{
  const a=anchor.current,p=panel.current;if(!a||!p)return;
  const r=a.getBoundingClientRect(),w=p.offsetWidth,h=p.offsetHeight,vw=document.documentElement.clientWidth,vh=window.innerHeight,gap=6;
  const left=Math.round(Math.min(Math.max(8,r.left),vw-w-8));
  let top=r.bottom+gap,up=false;
  if(top+h>vh-8){if(r.top-gap-h>=8){top=r.top-gap-h;up=true}else top=Math.max(8,vh-h-8)}
  top=Math.round(top);
  setPos(o=>o&&o.left===left&&o.top===top&&o.up===up?o:{left,top,up});
 },[]);
 useLayoutEffect(()=>{if(open)place()});
 useEffect(()=>{
  if(!open){setPos(null);return}
  const move=()=>place();
  const down=e=>{if(anchor.current?.contains(e.target)||panel.current?.contains(e.target))return;setOpen(false)};
  const key=e=>{if(e.key==="Escape"){e.stopPropagation();e.preventDefault();setOpen(false);anchor.current?.querySelector("input")?.focus()}};
  window.addEventListener("resize",move);window.addEventListener("scroll",move,true);
  document.addEventListener("pointerdown",down,true);document.addEventListener("keydown",key,true);
  return()=>{window.removeEventListener("resize",move);window.removeEventListener("scroll",move,true);document.removeEventListener("pointerdown",down,true);document.removeEventListener("keydown",key,true)};
 },[open,place]);
 return {open,setOpen,pos,anchor,panel,id};
}

function Panel({pop,className,label,children}){
 if(!pop.open||typeof document==="undefined")return null;
 return createPortal(<div ref={pop.panel} id={pop.id} role="dialog" aria-label={label} className={"pk-panel "+className+(pop.pos?.up?" up":"")} style={pop.pos?{left:pop.pos.left,top:pop.pos.top}:{left:0,top:0,visibility:"hidden"}}>{children}</div>,document.body);
}

// Campo que parece um input comum (herda o estilo de cada tela), mas abre o painel.
function Trigger({pop,icon,text,placeholder,ariaLabel,disabled,className,id}){
 const openKeys=e=>{if(["Enter"," ","ArrowDown"].includes(e.key)){e.preventDefault();pop.setOpen(true)}};
 return <>
  <input id={id} className="pk-input" role="combobox" readOnly value={text} placeholder={placeholder} aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={pop.open} aria-controls={pop.id} disabled={disabled} onClick={()=>!disabled&&pop.setOpen(o=>!o)} onKeyDown={openKeys}/>
  <span className={"pk-icon "+(className||"")} aria-hidden="true">{icon}</span>
 </>;
}

// Input "fantasma" que leva o valor no formulário e mantém o aviso nativo de campo obrigatório.
const Proxy=({name,value,required})=>name||required?<input className="pk-proxy" tabIndex={-1} aria-hidden="true" name={name} value={value||""} required={required} onChange={()=>{}}/>:null;

function useValue(value,defaultValue,onChange){
 const controlled=value!==undefined,[inner,setInner]=useState(defaultValue||"");
 const v=controlled?value||"":inner;
 const set=nv=>{if(!controlled)setInner(nv);onChange?.(nv)};
 return [v,set];
}

export function DatePicker({value,defaultValue,onChange,name,min,max,required,placeholder="dd/mm/aaaa",ariaLabel,disabled,className,id}){
 const [v,set]=useValue(value,defaultValue,onChange);
 const pop=usePopover();
 const today=todayIso(),sel=parseIso(v);
 const start=parseIso(v)||parseIso(min&&today<min?min:max&&today>max?max:today);
 const [view,setView]=useState({mode:"days",y:start.y,m:start.m}),[cursor,setCursor]=useState(v||today);
 const grid=useRef(null);
 const inRange=iso=>(!min||iso>=min)&&(!max||iso<=max);
 // Ao abrir, volta para o mês do valor escolhido (ou de hoje).
 useEffect(()=>{if(pop.open){const s=parseIso(v)||start;setView({mode:"days",y:s.y,m:s.m});setCursor(v||isoOf(s.y,s.m,s.d))}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[pop.open]);
 const shown=pop.open&&!!pop.pos;
 useEffect(()=>{if(shown&&view.mode==="days")grid.current?.querySelector(`[data-iso="${cursor}"]`)?.focus({preventScroll:true})},[shown,view,cursor]);

 const cells=useMemo(()=>{const first=new Date(view.y,view.m,1).getDay(),out=[];for(let i=0;i<42;i++){const d=new Date(view.y,view.m,1-first+i);out.push({iso:isoOf(d.getFullYear(),d.getMonth(),d.getDate()),day:d.getDate(),out:d.getMonth()!==view.m})}return out},[view.y,view.m]);
 const shift=n=>setView(x=>{if(x.mode==="days"){const d=new Date(x.y,x.m+n,1);return {...x,y:d.getFullYear(),m:d.getMonth()}}return {...x,y:x.y+n*(x.mode==="years"?12:1)}});
 function pick(iso){if(!inRange(iso))return;set(iso);pop.setOpen(false);pop.anchor.current?.querySelector("input")?.focus()}
 function keys(e){
  const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];
  if(step){e.preventDefault();const p=parseIso(cursor),d=new Date(p.y,p.m,p.d+step),iso=isoOf(d.getFullYear(),d.getMonth(),d.getDate());setCursor(iso);if(d.getMonth()!==view.m||d.getFullYear()!==view.y)setView({mode:"days",y:d.getFullYear(),m:d.getMonth()})}
  else if(e.key==="Enter"||e.key===" "){e.preventDefault();pick(cursor)}
 }
 const yearsFrom=view.y-(((view.y%12)+12)%12);
 const title=view.mode==="days"?`${MONTHS[view.m]} ${view.y}`:view.mode==="months"?String(view.y):`${yearsFrom} – ${yearsFrom+11}`;
 const monthOk=(y,m)=>(!min||isoOf(y,m,31)>=min)&&(!max||isoOf(y,m,1)<=max);
 const yearOk=y=>(!min||`${y}-12-31`>=min)&&(!max||`${y}-01-01`<=max);
 const canPrev=view.mode==="days"?monthOk(...(m=>[m.getFullYear(),m.getMonth()])(new Date(view.y,view.m-1,1))):view.mode==="months"?yearOk(view.y-1):yearOk(yearsFrom-1);
 const canNext=view.mode==="days"?monthOk(...(m=>[m.getFullYear(),m.getMonth()])(new Date(view.y,view.m+1,1))):view.mode==="months"?yearOk(view.y+1):yearOk(yearsFrom+12);

 return <span className={"pk dp"+(className?" "+className:"")} ref={pop.anchor}>
  <Trigger pop={pop} id={id} icon={<CalendarDays size={16}/>} text={formatDateBR(v)} placeholder={placeholder} ariaLabel={ariaLabel} disabled={disabled}/>
  <Proxy name={name} value={v} required={required}/>
  <Panel pop={pop} className="dp-panel" label="Escolher data">
   <div className="dp-head">
    <button type="button" className="dp-title" onClick={()=>setView(x=>({...x,mode:x.mode==="days"?"months":x.mode==="months"?"years":"days"}))} aria-label="Trocar mês ou ano">{title}<ChevronDown size={14} className={view.mode!=="days"?"up":""}/></button>
    <span className="dp-nav"><button type="button" onClick={()=>shift(-1)} disabled={!canPrev} aria-label="Anterior"><ChevronLeft size={16}/></button><button type="button" onClick={()=>shift(1)} disabled={!canNext} aria-label="Próximo"><ChevronRight size={16}/></button></span>
   </div>
   {view.mode==="days"&&<>
    <div className="dp-week">{WEEK.map((w,i)=><span key={i}>{w}</span>)}</div>
    <div className="dp-grid" ref={grid} role="grid" onKeyDown={keys}>{cells.map(c=><button type="button" key={c.iso} data-iso={c.iso} tabIndex={c.iso===cursor?0:-1} disabled={!inRange(c.iso)} aria-pressed={c.iso===v} aria-label={formatDateBR(c.iso)} className={"dp-day"+(c.out?" out":"")+(c.iso===today?" today":"")+(c.iso===v?" on":"")} onClick={()=>pick(c.iso)}>{c.day}</button>)}</div>
   </>}
   {view.mode==="months"&&<div className="dp-months">{MONTHS.map((n,i)=><button type="button" key={n} disabled={!monthOk(view.y,i)} className={sel&&sel.y===view.y&&sel.m===i?"on":""} onClick={()=>setView({mode:"days",y:view.y,m:i})}>{n.slice(0,3)}</button>)}</div>}
   {view.mode==="years"&&<div className="dp-months">{Array.from({length:12},(_,i)=>yearsFrom+i).map(y=><button type="button" key={y} disabled={!yearOk(y)} className={sel?.y===y?"on":""} onClick={()=>setView({mode:"months",y,m:view.m})}>{y}</button>)}</div>}
   <div className="dp-foot">
    {!required&&v?<button type="button" onClick={()=>{set("");pop.setOpen(false)}}>Limpar</button>:<span/>}
    <button type="button" disabled={!inRange(today)} onClick={()=>pick(today)}>Hoje</button>
   </div>
  </Panel>
 </span>;
}

export function TimePicker({value,defaultValue,onChange,name,required,step=5,placeholder="--:--",ariaLabel,disabled,className,id}){
 const [v,set]=useValue(value,defaultValue,onChange);
 const pop=usePopover();
 const [h,m]=/^\d{2}:\d{2}$/.test(v)?v.split(":"):["",""];
 const hours=Array.from({length:24},(_,i)=>pad(i));
 const mins=[...new Set([...Array.from({length:Math.ceil(60/step)},(_,i)=>pad(i*step)),...(m?[m]:[])])].sort();
 const cols=useRef(null);
 // Centraliza a hora e o minuto escolhidos ao abrir.
 const shown=pop.open&&!!pop.pos;
 useLayoutEffect(()=>{if(!shown)return;cols.current?.querySelectorAll(".tp-col").forEach(col=>{const on=col.querySelector(".on");if(on)col.scrollTop=on.offsetTop-col.clientHeight/2+on.offsetHeight/2})},[shown]);
 const done=()=>{pop.setOpen(false);pop.anchor.current?.querySelector("input")?.focus()};
 return <span className={"pk tp"+(className?" "+className:"")} ref={pop.anchor}>
  <Trigger pop={pop} id={id} icon={<Clock size={15}/>} text={v} placeholder={placeholder} ariaLabel={ariaLabel} disabled={disabled}/>
  <Proxy name={name} value={v} required={required}/>
  <Panel pop={pop} className="tp-panel" label="Escolher horário">
   <div className="tp-heads"><small>Hora</small><small>Min</small></div>
   <div className="tp-cols" ref={cols}>
    <div className="tp-col" role="listbox" aria-label="Hora">{hours.map(x=><button type="button" role="option" aria-selected={x===h} key={x} className={x===h?"on":""} onClick={()=>set(`${x}:${m||"00"}`)}>{x}</button>)}</div>
    <div className="tp-col" role="listbox" aria-label="Minuto">{mins.map(x=><button type="button" role="option" aria-selected={x===m} key={x} className={x===m?"on":""} onClick={()=>{set(`${h||"09"}:${x}`);done()}}>{x}</button>)}</div>
   </div>
   <div className="dp-foot"><span/><button type="button" onClick={done}>OK</button></div>
  </Panel>
 </span>;
}

// Data + hora lado a lado; envia "AAAA-MM-DDTHH:MM" no formulário (como o datetime-local).
export function DateTimePicker({name,required,defaultValue="",min,ariaLabel}){
 const [date,setDate]=useState(defaultValue.slice(0,10)),[time,setTime]=useState(defaultValue.slice(11,16));
 return <span className="pk-datetime">
  <DatePicker value={date} onChange={setDate} min={min} ariaLabel={ariaLabel?ariaLabel+" (data)":undefined} required={required}/>
  <TimePicker value={time} onChange={setTime} ariaLabel={ariaLabel?ariaLabel+" (hora)":undefined} required={required}/>
  <Proxy name={name} value={date&&time?`${date}T${time}`:""}/>
 </span>;
}
