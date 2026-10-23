import { createClient } from '@supabase/supabase-js';
const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!secret){console.error('Isi SUPABASE_URL dan SUPABASE_SECRET_KEY pada environment server.');process.exit(1);}
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
let conversations=0,uploads=0;
try{
 const {error:staleError}=await db.from('messages').update({status:'error'}).eq('status','pending').lt('created_at',new Date(Date.now()-120000).toISOString());
 if(staleError)throw new Error('Pemulihan status belum berhasil.');
 const {data:deleted,error}=await db.from('conversations').select('id,user_id').not('deleted_at','is',null).limit(200);
 if(error)throw new Error('Daftar pembersihan belum dapat dimuat.');
 for(const c of deleted||[]){
  let failed=false;
  for(let offset=0;;offset+=100){
   const {data:files,error:fileError}=await db.from('attachments').select('path').eq('conversation_id',c.id).eq('user_id',c.user_id).order('id').range(offset,offset+99);
   if(fileError){failed=true;break;}
   if(files?.length){const {error}=await db.storage.from('chat-images').remove(files.map(f=>f.path));if(error){failed=true;break;}}
   if((files?.length||0)<100)break;
  }
  if(failed)continue;
  const {error}=await db.from('conversations').delete().eq('id',c.id).eq('user_id',c.user_id);if(!error)conversations++;
 }
 const {data:orphans,error:orphanError}=await db.from('attachments').select('id,path').is('message_id',null).lt('created_at',new Date(Date.now()-86400000).toISOString()).limit(200);
 if(orphanError)throw new Error('Daftar unggahan tertunda belum dapat dimuat.');
 for(const file of orphans||[]){const {error}=await db.storage.from('chat-images').remove([file.path]);if(error)continue;const result=await db.from('attachments').delete().eq('id',file.id).is('message_id',null);if(!result.error)uploads++;}
 console.log(JSON.stringify({ok:true,conversations_cleaned:conversations,orphan_uploads_cleaned:uploads}));
}catch(error){console.error(error instanceof Error?error.message:'Pemeliharaan belum berhasil.');process.exitCode=1;}
