import { ownedConversation, serviceClient, jsonError, AppError, assertOrigin, readJson } from '@/lib/server';
import { titleSchema } from '@/lib/validation';
export const dynamic='force-dynamic';
type Params={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Params){try{
  const {id}=await params;const a=await ownedConversation(request,id);
  const cursor=new URL(request.url).searchParams.get('before');
  if(cursor&&!Number.isFinite(Date.parse(cursor)))throw new AppError(400,'Posisi riwayat tidak valid.');
  let query=a.client.from('messages').select('*').eq('conversation_id',id).eq('user_id',a.user.id).order('created_at',{ascending:false}).limit(101);
  if(cursor)query=query.lt('created_at',cursor);
  const {data:page,error}=await query;
  if(error)throw new AppError(503,'Pesan belum dapat dimuat.');
  const messages=(page||[]).slice(0,100).reverse();
  const {data:attachments,error:attachmentError}=messages.length?await a.client.from('attachments').select('*').eq('conversation_id',id).eq('user_id',a.user.id).in('message_id',messages.map(m=>m.id)):{data:[],error:null};
  if(attachmentError)throw new AppError(503,'Lampiran belum dapat dimuat.');
  const files=await Promise.all((attachments||[]).map(async f=>{const {data}=await a.client.storage.from('chat-images').createSignedUrl(f.path,900);return {id:f.id,name:f.name,mime:f.mime,size:f.size,url:data?.signedUrl,message_id:f.message_id};}));
  return Response.json({conversation:{...a.conversation,hasMore:(page?.length||0)>100,before:messages[0]?.created_at,messages:messages.map(m=>({...m,attachments:files.filter(f=>f.message_id===m.id)}))}},{headers:{'Cache-Control':'no-store'}});
}catch(e){return jsonError(e);}}
export async function PATCH(request:Request,{params}:Params){try{
  assertOrigin(request);const {id}=await params;const a=await ownedConversation(request,id);const parsed=titleSchema.safeParse(await readJson(request,5000));
  if(!parsed.success)throw new AppError(400,'Judul harus berisi 1–100 karakter.');
  const {error}=await a.client.from('conversations').update({title:parsed.data.title,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',a.user.id);
  if(error)throw new AppError(503,'Judul belum dapat diubah.');return Response.json({ok:true});
}catch(e){return jsonError(e);}}
export async function DELETE(request:Request,{params}:Params){try{
  assertOrigin(request);const {id}=await params;const a=await ownedConversation(request,id);const service=serviceClient();
  // A tombstone hides the record immediately and preserves paths for a retry if storage is unavailable.
  const {error:tombstone}=await service.from('conversations').update({deleted_at:new Date().toISOString()}).eq('id',id).eq('user_id',a.user.id);
  if(tombstone)throw new AppError(503,'Percakapan belum dapat dihapus.');
  for(let offset=0;;offset+=100){
    const {data:files,error:filesError}=await service.from('attachments').select('path').eq('conversation_id',id).eq('user_id',a.user.id).order('id').range(offset,offset+99);
    if(filesError)throw new AppError(503,'Pembersihan lampiran tertunda. Pengelola dapat menjalankan pembersihan ulang.');
    if(files?.length){const {error}=await service.storage.from('chat-images').remove(files.map(f=>f.path));if(error)throw new AppError(503,'Percakapan disembunyikan; pembersihan lampiran tertunda.');}
    if((files?.length||0)<100)break;
  }
  const {error}=await service.from('conversations').delete().eq('id',id).eq('user_id',a.user.id);
  if(error)throw new AppError(503,'Pembersihan percakapan tertunda.');return Response.json({ok:true});
}catch(e){return jsonError(e);}}
