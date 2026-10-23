import { requireAdmin, assertOrigin, jsonError, AppError } from '@/lib/server';
import { serverConfig } from '@/lib/config';
export async function POST(request:Request){try{
  assertOrigin(request);await requireAdmin(request);const c=serverConfig();
  if(!c.key)throw new AppError(503,'Kunci Gemini belum dikonfigurasi.');
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(c.model),{headers:{'x-goog-api-key':c.key},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new AppError(502,`Gemini belum terhubung (HTTP ${response.status}).`);
  return Response.json({ok:true,message:'Kredensial dikenali dan model tersedia.'});
}catch(e){return jsonError(e);}}
