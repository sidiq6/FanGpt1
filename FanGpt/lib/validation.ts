import { z } from 'zod';

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGES = 2;
export const MAX_CONTEXT_CHARS = 28000;
export const titleSchema = z.object({ title: z.string().trim().min(1).max(100) });
const imageSchema=z.object({ mime:z.enum(['image/jpeg','image/png','image/webp']),data:z.string().max(5600000) });
export const chatSchema = z.object({
  conversationId: z.string().uuid().optional(),
  messageId: z.string().uuid(),
  text: z.string().trim().max(12000),
  attachmentIds: z.array(z.string().uuid()).max(MAX_IMAGES).default([]),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(12000),images:z.array(imageSchema).max(MAX_IMAGES).optional() })).max(24).optional(),
  images: z.array(imageSchema).max(MAX_IMAGES).optional(),
}).refine(v => Boolean(v.text || v.attachmentIds.length || v.images?.length), 'Tuliskan pesan atau lampirkan gambar.').refine(v=>(v.images?.length||0)+(v.history||[]).reduce((n,m)=>n+(m.images?.length||0),0)<=MAX_IMAGES,'Terlalu banyak gambar dalam konteks.');

export function detectImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return 'image/png';
  if (bytes.length >= 3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'image/jpeg';
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0,4))==='RIFF' && new TextDecoder().decode(bytes.slice(8,12))==='WEBP') return 'image/webp';
  return null;
}
export function validateImage(bytes: Uint8Array, declared: string) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('Ukuran gambar maksimal 4 MB.');
  const mime=detectImageMime(bytes);
  if (!mime || mime!==declared) throw new Error('Isi file harus berupa gambar JPG, PNG, atau WebP yang sesuai.');
  return mime;
}
export function trimHistory<T extends { content: string; role: string }>(messages: T[]): T[] {
  let length=0; const selected:T[]=[];
  for (let i=messages.length-1;i>=0;i--) {
    if (length+messages[i].content.length>MAX_CONTEXT_CHARS) break;
    selected.unshift(messages[i]); length+=messages[i].content.length;
  }
  while (selected[0]?.role==='assistant') selected.shift();
  return selected;
}
export function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  const url=new URL(value,'https://fangpt.local');
  return url.origin==='https://fangpt.local' ? url.pathname+url.search : '/';
}
