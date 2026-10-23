'use client';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
export function MarkdownMessage({text}:{text:string}){
  return <div className="markdown"><Markdown remarkPlugins={[remarkGfm]} components={{
    a:({children,...p})=><a {...p} target="_blank" rel="noopener noreferrer">{children}</a>,
    img:()=>null,
    pre:({children})=>{const child=children as React.ReactElement<{children?:string;className?:string}>;const value=String(child?.props?.children||'');return <div className="code-wrap"><div className="code-bar"><span>{child?.props?.className?.replace('language-','')||'kode'}</span><button onClick={()=>navigator.clipboard.writeText(value).then(()=>toast.success('Kode disalin.')).catch(()=>toast.error('Browser tidak mengizinkan penyalinan.'))}><Copy size={13}/>Salin</button></div><pre>{children}</pre></div>;},
    table:({children})=><div className="table-scroll"><table>{children}</table></div>,
  }}>{text}</Markdown></div>;
}
