import { requireAccount, jsonError, assertOrigin, readJson, AppError } from '@/lib/server';
import { titleSchema } from '@/lib/validation';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
  const a=await requireAccount(request);
  const {data,error}=await a.client.from('conversations').select('id,title,created_at,updated_at').eq('user_id',a.user.id).is('deleted_at',null).order('updated_at',{ascending:false}).limit(200);
  if(error)throw new AppError(503,'Riwayat belum dapat dimuat.');return Response.json({conversations:data},{headers:{'Cache-Control':'no-store'}});
}catch(e){return jsonError(e);}}
export async function POST(request:Request){try{
  assertOrigin(request);const a=await requireAccount(request);const parsed=titleSchema.safeParse(await readJson(request,5000));
  if(!parsed.success)throw new AppError(400,'Judul percakapan tidak valid.');
  const {data,error}=await a.client.from('conversations').insert({user_id:a.user.id,title:parsed.data.title}).select('id,title,created_at,updated_at').single();
  if(error)throw new AppError(503,'Percakapan belum dapat dibuat.');return Response.json({conversation:data},{status:201});
}catch(e){return jsonError(e);}}
