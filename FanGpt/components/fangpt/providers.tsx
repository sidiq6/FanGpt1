'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { Toaster, toast } from 'sonner';
import type { Account, PublicConfig } from '@/lib/types';

type AppContext={config:PublicConfig|null;client:SupabaseClient|null;session:Session|null;account:Account|null;loading:boolean;theme:string;toggleTheme:()=>void;api:(path:string,init?:RequestInit)=>Promise<any>;signOut:()=>Promise<void>};
const Context=createContext<AppContext|null>(null);
let singleton:SupabaseClient|null=null;
export function browserClient(config:PublicConfig){
  if(!config.authConfigured)return null;
  if(!singleton)singleton=createClient(config.supabaseUrl,config.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,flowType:'pkce',detectSessionInUrl:false,storageKey:'fangpt-auth-v1'}});
  return singleton;
}
export function Providers({children}:{children:React.ReactNode}){
  const [config,setConfig]=useState<PublicConfig|null>(null);const [client,setClient]=useState<SupabaseClient|null>(null);const [session,setSession]=useState<Session|null>(null);const [account,setAccount]=useState<Account|null>(null);const [loading,setLoading]=useState(true);const [theme,setTheme]=useState('light');
  useEffect(()=>{const t=localStorage.getItem('fangpt-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');setTheme(t);document.documentElement.dataset.theme=t;fetch('/api/config',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(c=>{setConfig(c as PublicConfig);setClient(browserClient(c as PublicConfig));}).catch(()=>{toast.error('Konfigurasi belum dapat dimuat. Muat ulang halaman.');setLoading(false);});},[]);
  useEffect(()=>{if(!config)return;if(!client){setLoading(false);return;}let active=true;client.auth.getSession().then(({data})=>{if(active){setSession(data.session);setLoading(false);}});const {data}=client.auth.onAuthStateChange((_event,s)=>setSession(s));return()=>{active=false;data.subscription.unsubscribe();};},[client,config]);
  const sessionRef=useRef<Session|null>(null);sessionRef.current=session;
  const api=useCallback(async(path:string,init:RequestInit={}):Promise<any>=>{
    const headers=new Headers(init.headers);if(sessionRef.current?.access_token)headers.set('Authorization',`Bearer ${sessionRef.current.access_token}`);
    const response=await fetch(path,{...init,headers,cache:'no-store'});const body:any=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Permintaan belum berhasil. Silakan coba lagi.');return body;
  },[]);
  useEffect(()=>{if(!config)return;let active=true;if(config.authConfigured&&!session){setAccount(null);return;}api('/api/me').then(d=>{if(active)setAccount(d.account);}).catch(()=>{if(active)setAccount(null);});return()=>{active=false;};},[config,session,api]);
  const toggleTheme=()=>setTheme(old=>{const next=old==='light'?'dark':'light';localStorage.setItem('fangpt-theme',next);document.documentElement.dataset.theme=next;return next;});
  const signOut=async()=>{if(client)await client.auth.signOut();setAccount(null);setSession(null);toast.success('Kamu sudah keluar.');};
  const value=useMemo(()=>({config,client,session,account,loading,theme,toggleTheme,api,signOut}),[config,client,session,account,loading,theme,api]);
  return <Context.Provider value={value}>{children}<Toaster position="top-center" richColors closeButton/></Context.Provider>;
}
export function useApp(){const c=useContext(Context);if(!c)throw new Error('FanGpt context unavailable');return c;}
