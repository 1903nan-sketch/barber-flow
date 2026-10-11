"use client";
import {notify} from "../../../lib/notify";
import {useEffect,useMemo,useState} from "react";
import {Copy,Plus,Trash2} from "lucide-react";
import {supabase} from "../../../lib/supabase";
import {IosSwitch} from "../../_components/ThemeSwitch";
const days=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const ORDER=[1,2,3,4,5,6,0];
const time=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const minutes=s=>{const [h,m]=String(s||"0:0").split(':').map(Number);return (h||0)*60+(m||0)};
const STEPS=[5,10,15,20,30,40,45,60];

// Horários da semana por profissional: um dia por linha, com chave para abrir/
// fechar e os intervalos de atendimento (ex.: 09:00–12:00 e 13:00–19:00).
function WeekEditor({windows,setWindows,units}){
 const byDay=useMemo(()=>{const map={};windows.forEach((w,i)=>{(map[w.weekday]=map[w.weekday]||[]).push({...w,i})});for(const d in map)map[d].sort((a,b)=>a.start_min-b.start_min);return map},[windows]);
 const lastOpen=()=>ORDER.map(d=>byDay[d]).find(Boolean);
 function toggleDay(d,on){
  if(!on)return setWindows(v=>v.filter(w=>w.weekday!==d));
  const model=lastOpen()||[{start_min:540,end_min:720,step_min:15,unit_id:units[0]?.id||""},{start_min:780,end_min:1140,step_min:15,unit_id:units[0]?.id||""}];
  setWindows(v=>[...v,...model.map(m=>({unit_id:m.unit_id||units[0]?.id||"",weekday:d,start_min:m.start_min,end_min:m.end_min,step_min:m.step_min||15}))]);
 }
 const change=(i,k,val)=>setWindows(v=>v.map((w,j)=>j===i?{...w,[k]:val}:w));
 function addPeriod(d){
  const list=byDay[d]||[],last=list[list.length-1],start=last?Math.min(last.end_min+60,22*60):540;
  setWindows(v=>[...v,{unit_id:last?.unit_id||units[0]?.id||"",weekday:d,start_min:start,end_min:Math.min(start+180,23*60+45),step_min:last?.step_min||15}]);
 }
 function setStep(d,step){setWindows(v=>v.map(w=>w.weekday===d?{...w,step_min:step}:w))}
 function copyToOpen(d){
  const src=byDay[d]||[],open=ORDER.filter(x=>x!==d&&byDay[x]);
  if(!open.length)return;
  setWindows(v=>[...v.filter(w=>!open.includes(w.weekday)),...open.flatMap(x=>src.map(s=>({unit_id:s.unit_id,weekday:x,start_min:s.start_min,end_min:s.end_min,step_min:s.step_min})))]);
  notify(`Horários de ${days[d].toLowerCase()} copiados para os outros dias abertos.`);
 }
 return <div className="sch-week">{ORDER.map(d=>{const list=byDay[d],open=!!list;return <div className={"sch-day"+(open?" open":"")} key={d}>
  <div className="sch-day-name"><IosSwitch checked={open} onChange={on=>toggleDay(d,on)} label={(open?"Fechar ":"Abrir ")+days[d]}/><strong>{days[d]}</strong></div>
  {open?<div className="sch-periods">
   {list.map(w=>{const bad=w.end_min<=w.start_min;return <div className={"sch-period"+(bad?" bad":"")} key={w.i}>
    <input type="time" step="300" value={time(w.start_min)} onChange={e=>change(w.i,'start_min',minutes(e.target.value))} aria-label={`Início em ${days[d]}`}/>
    <span>às</span>
    <input type="time" step="300" value={time(w.end_min)} onChange={e=>change(w.i,'end_min',minutes(e.target.value))} aria-label={`Fim em ${days[d]}`}/>
    {units.length>1&&<select value={w.unit_id} onChange={e=>change(w.i,'unit_id',e.target.value)} aria-label="Unidade">{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select>}
    <button type="button" className="sch-icon" onClick={()=>setWindows(v=>v.filter((_,j)=>j!==w.i))} aria-label="Remover intervalo" title="Remover intervalo"><Trash2 size={15}/></button>
   </div>})}
   <div className="sch-day-actions">
    <button type="button" className="sch-link" onClick={()=>addPeriod(d)}><Plus size={14}/>Intervalo</button>
    <label className="sch-step">A cada<select value={list[0].step_min} onChange={e=>setStep(d,Number(e.target.value))}>{[...new Set([...STEPS,list[0].step_min])].sort((a,b)=>a-b).map(n=><option key={n} value={n}>{n} min</option>)}</select></label>
    <button type="button" className="sch-link" onClick={()=>copyToOpen(d)} title="Copiar estes horários para os outros dias abertos"><Copy size={14}/>Copiar p/ outros dias</button>
   </div>
  </div>:<span className="sch-closed">Fechado</span>}
 </div>})}</div>;
}

export default function ScheduleManager({workspace,mode}) {
 const t=workspace.tenant.id;
 const [barbers,setBarbers]=useState([]),[units,setUnits]=useState([]),[barber,setBarber]=useState(''),[windows,setWindows]=useState([]),[blocks,setBlocks]=useState([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[preview,setPreview]=useState(null);
 const canManage=workspace.membership.role==='owner'||(['manager','reception'].includes(workspace.membership.role)&&workspace.membership.permissions?.includes('agenda'));
 useEffect(()=>{let alive=true; Promise.all([supabase.from('barbers').select('id,name,user_id').eq('tenant_id',t).eq('active',true).order('name'),supabase.from('units').select('id,name,timezone').eq('tenant_id',t).eq('active',true)]).then(([b,u])=>{if(!alive)return;const list=(b.data||[]).filter(x=>canManage||x.user_id===workspace.user.id);setBarbers(list);setUnits(u.data||[]);setBarber(list[0]?.id||'');setError(b.error?.message||u.error?.message||'');setLoading(false)});return()=>{alive=false}},[t,canManage,workspace.user.id]);
 useEffect(()=>{setPreview(null);setMessage('');if(!barber)return;let alive=true;setLoading(true);Promise.all([supabase.from('weekly_windows').select('unit_id,weekday,start_min,end_min,step_min').eq('tenant_id',t).eq('barber_id',barber).order('weekday').order('start_min'),supabase.from('schedule_exceptions').select('id,starts_at,ends_at,kind,reason').eq('tenant_id',t).eq('barber_id',barber).gte('ends_at',new Date().toISOString()).order('starts_at')]).then(([w,b])=>{if(alive){setWindows(w.data||[]);setBlocks(b.data||[]);setError(w.error?.message||b.error?.message||'');setLoading(false)}});return()=>{alive=false}},[barber,t]);
 async function save(){setBusy(true);setError('');setMessage('');try{
  if(windows.some(w=>!w.unit_id))throw new Error('Escolha a unidade de cada intervalo.');
  const bad=windows.find(w=>w.end_min<=w.start_min);if(bad)throw new Error(`Em ${days[bad.weekday].toLowerCase()}, o fim do intervalo precisa ser depois do início.`);
  for(const d of ORDER){const list=windows.filter(w=>w.weekday===d).sort((a,b)=>a.start_min-b.start_min);for(let k=1;k<list.length;k++)if(list[k].start_min<list[k-1].end_min)throw new Error(`Os intervalos de ${days[d].toLowerCase()} estão sobrepostos. Ajuste os horários.`)}
  for(const unit of new Set(windows.map(w=>w.unit_id))){const r=await supabase.rpc('save_record',{t,k:'assignment',p:{barber_id:barber,unit_id:unit}});if(r.error)throw r.error}
  const r=await supabase.rpc('save_week',{t,b:barber,p:windows});if(r.error)throw r.error;setMessage('Horários salvos. O site de agendamento já usa esta disponibilidade.');notify("Horários da agenda atualizados com sucesso.");}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function block(e){e.preventDefault();const f=new FormData(e.currentTarget);const st=new Date(f.get('start')),en=new Date(f.get('end'))
 if(!(en>st)){setMessage('');return setError('O fim do bloqueio precisa ser depois do início.')}
 const args={t,u:f.get('unit'),b:barber,st:st.toISOString(),en:en.toISOString(),kind:f.get('kind'),reason:f.get('reason')||'',confirmed_ids:null};await requestBlock(args)}
 async function requestBlock(args){setBusy(true);setError('');setMessage('');try{const {data,error}=await supabase.rpc('block_period',args);if(error)throw error;if(data.needs_confirmation){setPreview({args,affected:data.affected});return}setPreview(null);setMessage('Bloqueio registrado. Cancelamentos e clientes afetados foram mantidos no histórico.');notify("Bloqueio de agenda criado com sucesso.");const r=await supabase.from('schedule_exceptions').select('id,starts_at,ends_at,kind,reason').eq('tenant_id',t).eq('barber_id',barber).gte('ends_at',new Date().toISOString()).order('starts_at');setBlocks(r.data||[])}catch(e){setError(e.message)}finally{setBusy(false)}}
 const hours=mode==='hours';
 return <section className="box schedule-manager sch">
  <div className="sch-head"><div><h2>{hours?'Horários de atendimento':'Bloqueios e ausências'}</h2><p>{hours?'Ligue os dias em que atende e informe os intervalos. Para o almoço, use dois intervalos (ex.: 09:00 às 12:00 e 13:00 às 19:00).':'Bloqueios valem só para o período informado e não mudam os horários da semana.'}</p></div>
   {barbers.length>1&&<label className="sch-barber">Profissional<select value={barber} onChange={e=>setBarber(e.target.value)} disabled={busy}>{barbers.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
  </div>
  {error&&<div role="alert" className="form-alert error">{error}</div>}{message&&<div role="status" className="form-alert success">{message}</div>}
  {loading?<p className="empty">Carregando disponibilidade...</p>:!barber?<p className="empty">Nenhum profissional disponível para este acesso.</p>:hours?<>
   <WeekEditor windows={windows} setWindows={setWindows} units={units}/>
   <div className="sch-save"><button className="primary" type="button" disabled={busy} onClick={save}>{busy?'Salvando...':'Salvar horários'}</button></div>
  </>:<>
   <form onSubmit={block} className="sch-block-form"><div className="form-grid"><label>Unidade<select name="unit" required>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>Tipo<select name="kind"><option value="block">Bloqueio</option><option value="day_off">Folga</option><option value="vacation">Férias</option></select></label><label>Início<input name="start" type="datetime-local" required/></label><label>Fim<input name="end" type="datetime-local" required/></label><label className="wide">Motivo (opcional)<input name="reason" maxLength={500}/></label></div><p className="form-hint">Para bloquear um dia inteiro, informe 00:00 do dia até 00:00 do dia seguinte.</p><button className="primary" disabled={busy}>Verificar clientes afetados</button></form>
   {preview&&<div className="block-confirm"><h3>{preview.affected.length?'Existem clientes agendados neste período.':'Nenhum cliente agendado neste período.'}</h3>{preview.affected.map(a=><p key={a.id}><strong>{a.client}</strong> · {a.service} · {new Date(a.starts_at).toLocaleString('pt-BR')} · {a.unit}</p>)}<p>Ao confirmar, os atendimentos acima serão cancelados pela empresa, mantendo o histórico.</p><div className="sch-save"><button className="primary" disabled={busy} onClick={()=>requestBlock({...preview.args,confirmed_ids:preview.affected.map(a=>a.id)})}>Confirmar bloqueio</button><button className="secondary-action" disabled={busy} onClick={()=>setPreview(null)}>Voltar</button></div></div>}
   <h3 className="sch-sub">Bloqueios registrados</h3>{blocks.length?<div className="sch-blocks">{blocks.map(b=><div key={b.id}><strong>{b.reason||({block:'Bloqueio',day_off:'Folga',vacation:'Férias'})[b.kind]}</strong><small>{new Date(b.starts_at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})} até {new Date(b.ends_at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</small></div>)}</div>:<p className="empty">Nenhum bloqueio futuro.</p>}
  </>}
 </section>
}
