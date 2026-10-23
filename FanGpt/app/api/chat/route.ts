import { publicConfig, serverConfig } from '@/lib/config';
import { AppError, assertOrigin, consumeQuota, jsonError, ownedConversation, readJson, requirePreviewAccount, serviceClient } from '@/lib/server';
import { chatSchema, trimHistory, validateImage } from '@/lib/validation';
import { openGemini, readGeminiStream, type GeminiContent, type GeminiPart } from '@/lib/gemini';
export const dynamic='force-dynamic';

export async function POST(request:Request){
  let logUser:string|undefined;
  try{
    assertOrigin(request);
    if(!publicConfig().aiConfigured)throw new AppError(503,'Koneksi AI belum diaktifkan.');
    const parsed=chatSchema.safeParse(await readJson(request));
    if(!parsed.success)throw new AppError(400,'Pesan atau lampiran tidak valid. Maksimal 12.000 karakter dan dua gambar.');
    const input=parsed.data;const cloud=publicConfig().authConfigured;
    let userId:string|undefined;let service:ReturnType<typeof serviceClient>|undefined;
    let contents:GeminiContent[]=[];const assistantId=crypto.randomUUID();const start=Date.now();
    if(cloud){
      if(!input.conversationId)throw new AppError(400,'Pilih percakapan terlebih dahulu.');
      const a=await ownedConversation(request,input.conversationId);userId=a.user.id;logUser=userId;service=serviceClient();
      // Authoritative history is always loaded from the authenticated owner's database.
      const {data:history,error:historyError}=await a.client.from('messages').select('id,role,content').eq('conversation_id',input.conversationId).eq('user_id',userId).neq('status','pending').order('created_at',{ascending:false}).limit(24);
      if(historyError)throw new AppError(503,'Konteks percakapan belum dapat dimuat.');
      const {data:pending,error:pendingError}=await a.client.from('messages').select('id').eq('conversation_id',input.conversationId).eq('status','pending').gte('created_at',new Date(Date.now()-120000).toISOString()).limit(1);
      if(pendingError)throw new AppError(503,'Status percakapan belum dapat diperiksa.');
      if(pending?.length)throw new AppError(409,'Jawaban sebelumnya masih diproses. Tunggu sebentar.');
      const selectedHistory=trimHistory((history||[]).reverse());
      const {data:historyFiles,error:historyFilesError}=await a.client.from('attachments').select('message_id,path,mime').eq('conversation_id',input.conversationId).eq('user_id',userId).not('message_id','is',null).order('created_at',{ascending:false}).limit(2);
      if(historyFilesError)throw new AppError(503,'Konteks gambar belum dapat dimuat.');
      for(const message of selectedHistory){
        const parts:GeminiPart[]=[{text:message.content||(message.role==='user'?'[Gambar terlampir]':'[Jawaban terhenti]')}];
        for(const f of historyFiles||[]){if(f.message_id!==message.id)continue;const {data:blob,error}=await service.storage.from('chat-images').download(f.path);if(error||!blob)throw new AppError(503,'Gambar sebelumnya belum dapat dibaca.');const bytes=new Uint8Array(await blob.arrayBuffer());validateImage(bytes,f.mime);parts.push({inlineData:{mimeType:f.mime,data:Buffer.from(bytes).toString('base64')}});}
        if(message.role==='assistant'&&!message.content)continue;
        contents.push({role:message.role==='assistant'?'model':'user',parts});
      }
      const parts:GeminiPart[]=[{text:input.text||'Jelaskan gambar yang saya lampirkan.'}];
      const files=[];
      for(const id of input.attachmentIds){
        const {data:file,error}=await a.client.from('attachments').select('*').eq('id',id).eq('user_id',userId).eq('conversation_id',input.conversationId).is('message_id',null).single();
        if(error||!file)throw new AppError(400,'Lampiran tidak tersedia atau bukan milikmu.');
        const {data:blob,error:downloadError}=await service.storage.from('chat-images').download(file.path);
        if(downloadError||!blob)throw new AppError(503,'Lampiran belum dapat dibaca.');
        const bytes=new Uint8Array(await blob.arrayBuffer());validateImage(bytes,file.mime);
        parts.push({inlineData:{mimeType:file.mime,data:Buffer.from(bytes).toString('base64')}});files.push(id);
      }
      await consumeQuota(userId);
      const {error:insertError}=await service.from('messages').insert({id:input.messageId,conversation_id:input.conversationId,user_id:userId,role:'user',content:input.text,status:'complete'});
      if(insertError)throw new AppError(insertError.code==='23505'?409:503,insertError.code==='23505'?'Pesan ini sudah diterima. Muat ulang percakapan.':'Pesan belum dapat disimpan.');
      if(files.length){const {error}=await service.from('attachments').update({message_id:input.messageId}).in('id',files).eq('user_id',userId).is('message_id',null);if(error)throw new AppError(503,'Lampiran belum dapat dikaitkan.');}
      const {error:assistantError}=await service.from('messages').insert({id:assistantId,conversation_id:input.conversationId,user_id:userId,role:'assistant',content:'',status:'pending',model:serverConfig().model});
      if(assistantError)throw new AppError(409,'Percakapan sedang dijawab. Tunggu sebentar.');
      await service.from('conversations').update({updated_at:new Date().toISOString()}).eq('id',input.conversationId).eq('user_id',userId);
      contents.push({role:'user',parts});
    }else{
      await requirePreviewAccount();
      contents=trimHistory(input.history||[]).map(m=>{const parts:GeminiPart[]=[{text:m.content||'[Gambar terlampir]'}];for(const image of m.images||[]){const bytes=new Uint8Array(Buffer.from(image.data,'base64'));try{validateImage(bytes,image.mime);}catch(e){throw new AppError(400,(e as Error).message);}parts.push({inlineData:{mimeType:image.mime,data:image.data}});}return{role:m.role==='assistant'?'model':'user',parts};});
      const parts:GeminiPart[]=[{text:input.text||'Jelaskan gambar yang saya lampirkan.'}];
      for(const image of input.images||[]){const bytes=new Uint8Array(Buffer.from(image.data,'base64'));try{validateImage(bytes,image.mime);}catch(e){throw new AppError(400,(e as Error).message);}parts.push({inlineData:{mimeType:image.mime,data:image.data}});}
      contents.push({role:'user',parts});
    }
    const abort=new AbortController();let cancelled=false;let answer='';let status='complete';let tokens=0;
    const abortListener=()=>{cancelled=true;abort.abort();};request.signal.addEventListener('abort',abortListener,{once:true});
    const timeout=setTimeout(()=>abort.abort(),90000);
    let upstream:Response;
    try{upstream=await openGemini(contents,abort.signal);}catch(e){
      clearTimeout(timeout);request.signal.removeEventListener('abort',abortListener);
      if(service&&userId){await service.from('messages').update({status:'error'}).eq('id',assistantId).eq('user_id',userId);await service.from('usage_events').insert({user_id:userId,status:'error',error_code:e instanceof AppError?String(e.status):'provider_error',model:serverConfig().model,latency_ms:Date.now()-start});}
      throw e;
    }
    const encoder=new TextEncoder();
    const stream=new ReadableStream<Uint8Array>({
      async start(controller){
        const send=(value:unknown)=>{if(!cancelled)try{controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));}catch{cancelled=true;abort.abort();}};
        send({type:'start',id:assistantId});
        try{
          for await(const event of readGeminiStream(upstream.body!)){
            if(event.error)throw new AppError(502,'Gemini menghentikan jawaban. Coba kembali.');
            const candidate=event.candidates?.[0];
            if(event.promptFeedback?.blockReason||candidate?.finishReason==='SAFETY')throw new AppError(422,'Permintaan ini tidak dapat dijawab. Coba jelaskan dengan cara lain.');
            const text=(candidate?.content?.parts||[]).filter((p:{text?:string,thought?:boolean})=>p.text&&!p.thought).map((p:{text:string})=>p.text).join('');
            if(text){answer+=text;send({type:'delta',text});}
            if(event.usageMetadata)tokens=event.usageMetadata.totalTokenCount||0;
          }
          if(!answer)throw new AppError(502,'Gemini tidak mengirim jawaban. Silakan coba lagi.');
        }catch(e){status=cancelled?'stopped':'error';if(!cancelled)send({type:'error',message:e instanceof AppError?e.message:abort.signal.aborted?'Waktu menjawab habis. Coba permintaan yang lebih singkat.':'Koneksi terputus. Coba lagi.'});}
        finally{
          clearTimeout(timeout);request.signal.removeEventListener('abort',abortListener);
          if(cancelled)status='stopped';
          if(service&&userId){
            const saved=await service.from('messages').update({content:answer,status}).eq('id',assistantId).eq('user_id',userId);
            await service.from('usage_events').insert({user_id:userId,status,error_code:status==='error'?'stream_error':null,model:serverConfig().model,total_tokens:tokens,latency_ms:Date.now()-start});
            if(saved.error)send({type:'warning',message:'Jawaban diterima, tetapi penyimpanan belum berhasil. Salin jawaban sebelum menutup halaman.'});
          }
          send({type:'done',id:assistantId,status});try{controller.close();}catch{}
        }
      },
      cancel(){cancelled=true;abort.abort();},
    });
    return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-store','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff'}});
  }catch(e){
    // Only codes are logged; never conversation content or credentials.
    void logUser;
    return jsonError(e);
  }
}
