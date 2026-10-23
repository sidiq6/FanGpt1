import { ownedConversation, serviceClient, assertOrigin, AppError, jsonError, boundedBytes, requireAccount } from '@/lib/server';
import { validateImage, MAX_IMAGE_BYTES } from '@/lib/validation';
export async function POST(request:Request){try{
  assertOrigin(request);await requireAccount(request);if(Number(request.headers.get('content-length')||0)>MAX_IMAGE_BYTES+10000)throw new AppError(413,'Ukuran gambar maksimal 4 MB.');
  // Body is bounded before multipart parsing, including requests without Content-Length.
  const raw=await boundedBytes(request,MAX_IMAGE_BYTES+10000);
  const bounded=new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('content-type')||''},body:raw as BodyInit});
  const form=await bounded.formData();const id=String(form.get('conversationId')||'');const file=form.get('file');
  const a=await ownedConversation(request,id);
  if(!(file instanceof File))throw new AppError(400,'Pilih gambar terlebih dahulu.');
  const {count,error:countError}=await a.client.from('attachments').select('id',{count:'exact',head:true}).eq('conversation_id',id).is('message_id',null);
  if(countError||Number(count)>=4)throw new AppError(429,'Selesaikan pengiriman lampiran sebelumnya terlebih dahulu.');
  const bytes=new Uint8Array(await file.arrayBuffer());let mime:string;
  try{mime=validateImage(bytes,file.type);}catch(e){throw new AppError(400,(e as Error).message);}
  const fileId=crypto.randomUUID();const extension=mime==='image/jpeg'?'jpg':mime==='image/png'?'png':'webp';const path=`${a.user.id}/${id}/${fileId}.${extension}`;
  const service=serviceClient();const {error:uploadError}=await service.storage.from('chat-images').upload(path,bytes,{contentType:mime,upsert:false});
  if(uploadError)throw new AppError(503,'Gambar belum dapat diunggah.');
  const {error}=await service.from('attachments').insert({id:fileId,conversation_id:id,user_id:a.user.id,path,name:file.name.slice(0,160),mime,size:bytes.length});
  if(error){await service.storage.from('chat-images').remove([path]);throw new AppError(503,'Lampiran belum dapat disimpan.');}
  const {data}=await a.client.storage.from('chat-images').createSignedUrl(path,900);
  return Response.json({attachment:{id:fileId,name:file.name.slice(0,160),mime,size:bytes.length,url:data?.signedUrl}},{status:201});
}catch(e){return jsonError(e);}}
