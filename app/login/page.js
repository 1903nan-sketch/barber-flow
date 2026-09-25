"use client";
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowRight,Eye,EyeOff,Scissors,Mail,LockKeyhole} from 'lucide-react';
import {supabase} from '../../lib/supabase';
import styles from './login.module.css';
const titles={login:'Acesse sua conta',signup:'Crie sua conta',reset:'Recupere sua senha','new-password':'Crie uma nova senha'};
export default function LoginPage(){
 const router=useRouter(),pending=useRef(false);
 const [mode,setMode]=useState('login'),[show,setShow]=useState(false),[loading,setLoading]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[caps,setCaps]=useState(false);
 useEffect(()=>{if(!supabase)return;const recovery=location.hash.includes('type=recovery')||new URLSearchParams(location.search).has('code');if(recovery)setMode('new-password');const {data}=supabase.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')setMode('new-password')});return()=>data.subscription.unsubscribe()},[]);
 function changeMode(next){setMode(next);setShow(false);setCaps(false);setError('');setMessage('')}
 async function goToPanel(){const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token){router.replace('/login');return}try{const res=await fetch('/api/admin/me',{headers:{authorization:'Bearer '+session.access_token},cache:'no-store'});const data=await res.json();router.replace(res.ok&&data?.role?'/admin':'/dashboard')}catch{router.replace('/dashboard')}router.refresh()}
 async function submit(event){
  event.preventDefault();if(pending.current)return;pending.current=true;setLoading(true);setError('');setMessage('');
  const form=new FormData(event.currentTarget);let email=String(form.get('email')||'').trim();const password=String(form.get('password')||'');
  try{
   if(!supabase)throw new Error('Conexão indisponível. Tente novamente em instantes.');
   if(mode==='login'&&email.startsWith('@')){const username=email.slice(1).toLowerCase();const {data:matches,error:lookupError}=await supabase.from('staff_logins').select('login_email,tenant_id').eq('username',username).limit(20);if(lookupError)throw new Error('E-mail, usuário ou senha incorretos.');const ids=[...new Set((matches||[]).map(x=>x.tenant_id).filter(Boolean))];const {data:beautyTenants}=ids.length?await supabase.from('tenants').select('id').in('id',ids).eq('product_slug','beautytix'):{data:[]};const allowed=new Set((beautyTenants||[]).map(x=>x.id));const beautyMatches=(matches||[]).filter(x=>allowed.has(x.tenant_id));if(beautyMatches.length!==1)throw new Error('E-mail, usuário ou senha incorretos.');email=beautyMatches[0].login_email}
   if(mode==='reset'){const {error:resetError}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/login'});if(resetError)throw resetError;setMessage('Se este e-mail estiver cadastrado, você receberá um link para recuperar a senha. Confira também o spam.');return}
   if(mode==='new-password'){const {error:updateError}=await supabase.auth.updateUser({password});if(updateError)throw updateError;setMessage('Senha alterada. Abrindo seu painel...');const {data:{user}}=await supabase.auth.getUser();await goToPanel();return}
   const result=mode==='signup'?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password});
   if(result.error)throw result.error;
   if(mode==='signup'&&!result.data.session){setMessage('Conta criada. Confirme seu e-mail para entrar.');return}
   await goToPanel();
  }catch(e){const text=e?.message||'';setError(text==='Invalid login credentials'?'E-mail, usuário ou senha incorretos.':text==='Email not confirmed'?'Confirme seu e-mail antes de entrar.':/fetch|network/i.test(text)?'Não foi possível conectar. Confira sua internet e tente novamente.':text||'Não foi possível concluir. Tente novamente.')}finally{pending.current=false;setLoading(false)}
 }
 return <main className={styles.page}>
  <section className={styles.brand}><div className={styles.logo}><Scissors aria-hidden="true"/>BeautyTix</div><div><span className={styles.kicker}>GESTÃO QUE TRANSFORMA</span><h1>Mais controle.<br/>Mais clientes.<br/><em>Mais crescimento.</em></h1><p>Administre seu salão, estúdio ou espaço de beleza de qualquer lugar, com tudo o que você precisa em um só sistema.</p></div><small>BeautyTix · by Ruptix</small></section>
  <section className={styles.panel} aria-label="Acesso ao BeautyTix"><form className={styles.card} onSubmit={submit} aria-busy={loading}>
   <div className={styles.mobileLogo+' '+styles.logo}><Scissors aria-hidden="true"/>BeautyTix</div><span className={styles.welcome}>{mode==='login'?'BEM-VINDO DE VOLTA':'SUA CONTA'}</span><h2>{titles[mode]}</h2><p className={styles.intro}>{mode==='reset'?'Informe seu e-mail para receber o link de recuperação.':mode==='new-password'?'Escolha uma nova senha com pelo menos 6 caracteres.':mode==='signup'?'Use seu e-mail para criar o acesso.':'Seu negócio organizado começa aqui.'}</p>
   {mode!=='new-password'&&<div className={styles.field}><label className={styles.label} htmlFor="login-email">{mode==='login'?'E-mail ou usuário':'E-mail'}</label><div className={styles.inputWrap}><Mail className={styles.inputIcon} aria-hidden="true"/><input id="login-email" className={styles.input} name="email" type={mode==='login'?'text':'email'} autoComplete={mode==='login'?'username':'email'} autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode={mode==='login'?'text':'email'} placeholder={mode==='login'?'Seu e-mail ou @usuário':'voce@email.com'} required disabled={loading}/></div></div>}
   {mode!=='reset'&&<div className={styles.field}><label className={styles.label} htmlFor="login-password">{mode==='new-password'?'Nova senha':'Senha'}</label><div className={styles.inputWrap}><LockKeyhole className={styles.inputIcon} aria-hidden="true"/><input id="login-password" className={styles.input+' '+styles.password} name="password" type={show?'text':'password'} minLength={mode==='login'?undefined:6} autoComplete={mode==='login'?'current-password':'new-password'} placeholder={mode==='login'?'Digite sua senha':'No mínimo 6 caracteres'} onKeyUp={e=>setCaps(e.getModifierState('CapsLock'))} onBlur={()=>setCaps(false)} aria-describedby={caps?'caps-warning':undefined} required disabled={loading}/><button className={styles.toggle} type="button" disabled={loading} aria-label={show?'Ocultar senha':'Mostrar senha'} aria-pressed={show} aria-controls="login-password" onClick={()=>setShow(v=>!v)}>{show?<EyeOff size={20}/>:<Eye size={20}/>}</button></div>{caps&&<p id="caps-warning" className={styles.caps}>Caps Lock ativado</p>}</div>}
   {error&&<div className={styles.alert} role="alert">{error}</div>}{message&&<div className={styles.alert+' '+styles.success} role="status">{message}</div>}
   <button className={styles.submit} type="submit" disabled={loading}>{loading?'Aguarde...':mode==='login'?'Entrar':mode==='signup'?'Criar conta':mode==='new-password'?'Salvar nova senha':'Enviar link'}<ArrowRight size={18} aria-hidden="true"/></button>
   {mode!=='new-password'&&<div className={styles.links}>{mode==='login'?<><button className={styles.link} disabled={loading} type="button" onClick={()=>changeMode('reset')}>Esqueci minha senha</button><button className={styles.link} disabled={loading} type="button" onClick={()=>changeMode('signup')}>Criar uma conta</button></>:<button className={styles.link} disabled={loading} type="button" onClick={()=>changeMode('login')}>Voltar para entrar</button>}</div>}
   <p className={styles.footer}>BEAUTYTIX · BY RUPTIX</p>
  </form></section>
 </main>
}
