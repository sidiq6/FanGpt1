import { createClient } from '@supabase/supabase-js';
import { serverConfig, publicConfig } from './config';
import { getChatGPTUser } from '@/app/chatgpt-auth';

export class AppError extends Error { constructor(public status: number, message: string) { super(message); } }
export function jsonError(error: unknown): Response {
  if (error instanceof AppError) return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});
  return Response.json({error:'Layanan belum dapat memproses permintaan. Coba lagi sebentar.'},{status:500,headers:{'Cache-Control':'no-store'}});
}
export function assertOrigin(request: Request) {
  const origin=request.headers.get('origin');
  if (origin && origin!==new URL(request.url).origin) throw new AppError(403,'Permintaan berasal dari situs yang tidak diizinkan.');
}
export function serviceClient() {
  const c=serverConfig();
  if (!publicConfig().cloudConfigured) throw new AppError(503,'Penyimpanan akun belum terhubung. Hubungkan proyek Supabase terlebih dahulu.');
  return createClient(c.supabaseUrl,c.serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function requireAccount(request: Request) {
  const c=serverConfig();
  const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if (!token || !c.supabaseUrl || !c.supabaseKey) throw new AppError(401,'Masuk ke akun untuk melanjutkan.');
  const client=createClient(c.supabaseUrl,c.supabaseKey,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.getUser(token);
  if (error||!data.user) throw new AppError(401,'Sesi berakhir. Silakan masuk kembali.');
  const user=data.user;
  if (!user.email_confirmed_at) throw new AppError(403,'Verifikasi emailmu terlebih dahulu.');
  const {data:profile,error:profileError}=await client.from('profiles').select('*').eq('id',user.id).single();
  if (profileError||!profile) throw new AppError(503,'Profil belum tersedia. Pastikan migrasi database sudah dijalankan.');
  if (!profile.is_active) throw new AppError(403,'Akun ini sedang dinonaktifkan. Hubungi pengelola.');
  return {user,client,profile};
}
export async function requireAdmin(request: Request) {
  const account=await requireAccount(request);
  const c=serverConfig();
  let allowed=Boolean(account.user.email && c.adminEmails.includes(account.user.email.toLowerCase()));
  if (!allowed) {
    const {data}=await serviceClient().from('admin_users').select('user_id').eq('user_id',account.user.id).maybeSingle();
    allowed=!!data;
  }
  if (!allowed) throw new AppError(403,'Halaman ini hanya dapat diakses admin.');
  return account;
}
export async function ownedConversation(request: Request,id: string) {
  const a=await requireAccount(request);
  const {data,error}=await a.client.from('conversations').select('*').eq('id',id).eq('user_id',a.user.id).is('deleted_at',null).single();
  if (error||!data) throw new AppError(404,'Percakapan tidak ditemukan.');
  return {...a,conversation:data};
}
const previewRates=new Map<string,{count:number,reset:number}>();
export async function requirePreviewAccount() {
  if (publicConfig().authConfigured) throw new AppError(401,'Masuk untuk mengirim pesan.');
  if (!serverConfig().privatePreview) throw new AppError(503,'Aktifkan layanan akun sebelum menggunakan Gemini pada hosting ini.');
  const user=await getChatGPTUser();
  if (!user) throw new AppError(401,'Buka FanGpt dari tautan pribadi dan masuk terlebih dahulu.');
  const now=Date.now();const rate=previewRates.get(user.userId);
  if (rate&&rate.reset>now&&rate.count>=12) throw new AppError(429,'Batas percobaan tercapai. Coba kembali dalam satu jam.');
  if(previewRates.size>1000) for(const [k,v] of previewRates) if(v.reset<now)previewRates.delete(k);
  previewRates.set(user.userId,{count:rate&&rate.reset>now?rate.count+1:1,reset:rate&&rate.reset>now?rate.reset:now+3600000});
  return user;
}
export async function consumeQuota(userId: string) {
  const {data,error}=await serviceClient().rpc('consume_ai_request',{p_user_id:userId});
  if(error) throw new AppError(503,'Pembatasan penggunaan belum tersedia. Pastikan migrasi sudah dijalankan.');
  if(!data) throw new AppError(429,'Batas permintaan tercapai. Tunggu sebentar atau coba lagi besok.');
}
export async function readJson(request: Request,maxBytes=12000000) {
  const length=Number(request.headers.get('content-length')||0);
  if(length>maxBytes)throw new AppError(413,'Ukuran permintaan terlalu besar.');
  const reader=request.body?.getReader();
  if(!reader)throw new AppError(400,'Permintaan kosong.');
  let total=0;let text='';const decoder=new TextDecoder();
  while(true){const r=await reader.read();if(r.done)break;total+=r.value.byteLength;if(total>maxBytes){await reader.cancel();throw new AppError(413,'Ukuran permintaan terlalu besar.');}text+=decoder.decode(r.value,{stream:true});}
  try{return JSON.parse(text+decoder.decode());}catch{throw new AppError(400,'Format permintaan tidak valid.');}
}
export async function boundedBytes(request:Request,maxBytes:number):Promise<Uint8Array>{
  const reader=request.body?.getReader();if(!reader)throw new AppError(400,'Permintaan kosong.');
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>maxBytes){await reader.cancel();throw new AppError(413,'Ukuran gambar maksimal 4 MB.');}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
