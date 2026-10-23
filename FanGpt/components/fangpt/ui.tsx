'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export function Logo({small=false}:{small?:boolean}){return <span className={`brand-mark ${small?'small':''}`} aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M16 5v22M5 16h22M8.22 8.22l15.56 15.56M8.22 23.78 23.78 8.22" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/><circle cx="16" cy="16" r="5.5" fill="currentColor"/></svg></span>;}
export function GoogleMark(){return <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59C7.19 7.72 9.4 5.96 12 5.96Z"/></svg>;}
export function Modal({title,children,onClose,className=''}:{title:string;children:React.ReactNode;onClose:()=>void;className?:string}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const d=ref.current;d?.showModal();return()=>d?.close();},[]);
  return <dialog ref={ref} className={`modal ${className}`} onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose();}} aria-label={title}><div className="modal-inner"><button className="icon-btn modal-close" onClick={onClose} aria-label="Tutup"><X size={20}/></button>{children}</div></dialog>;
}
