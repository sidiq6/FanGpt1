import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { validateImage, MAX_IMAGE_BYTES, chatSchema, trimHistory, safeNext } from '../lib/validation.ts';
import { readGeminiStream } from '../lib/gemini-stream.ts';
import { safePublishableKey } from '../lib/public-key.ts';

test('upload rejects spoofed MIME, oversized files, and unsupported formats',()=>{
  const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  assert.equal(validateImage(png,'image/png'),'image/png');
  assert.throws(()=>validateImage(png,'image/jpeg'));
  assert.throws(()=>validateImage(new Uint8Array(MAX_IMAGE_BYTES+1),'image/png'));
  assert.throws(()=>validateImage(new TextEncoder().encode('<svg onload="alert(1)"></svg>'),'image/png'));
});
test('chat validates identifiers, empty requests, and context limits',()=>{
  assert.equal(chatSchema.safeParse({messageId:crypto.randomUUID(),text:''}).success,false);
  assert.equal(chatSchema.safeParse({messageId:'bad',text:'hello'}).success,false);
  assert.equal(chatSchema.safeParse({messageId:crypto.randomUUID(),text:'a'.repeat(12001)}).success,false);
  const selected=trimHistory([{role:'user',content:'a'.repeat(20000)},{role:'assistant',content:'b'.repeat(10000)},{role:'user',content:'hello'}]);
  assert.deepEqual(selected,[{role:'user',content:'hello'}]);
});
test('OAuth return paths cannot redirect to another origin',()=>{
  for(const path of ['https://evil.example','//evil.example','/\\evil.example','/\n//evil.example'])assert.equal(safeNext(path),'/');
  assert.equal(safeNext('/account/reset'),'/account/reset');
});
test('public configuration never exposes a Supabase secret or service-role key',()=>{
 assert.equal(safePublishableKey('sb_secret_example'),'');
 const jwt=(role:string)=>'header.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature';
 assert.equal(safePublishableKey(jwt('service_role')),'');
 assert.equal(safePublishableKey(jwt('anon')),jwt('anon'));
 assert.equal(safePublishableKey('sb_publishable_example'),'sb_publishable_example');
});
test('SSE handles UTF-8 and CRLF split at every byte boundary',async()=>{
  const text=': keepalive\r\ndata: {"text":"Halo, dunia 🌿"}\r\n\r\ndata: {"usageMetadata":{"totalTokenCount":12}}\r\n\r\ndata: [DONE]\r\n\r\n';
  const bytes=new TextEncoder().encode(text);const stream=new ReadableStream<Uint8Array>({start(c){for(const b of bytes)c.enqueue(Uint8Array.of(b));c.close();}});
  const frames=[];for await(const event of readGeminiStream(stream))frames.push(event);
  assert.deepEqual(frames,[{text:'Halo, dunia 🌿'},{usageMetadata:{totalTokenCount:12}}]);
});
test('PostgreSQL enforces ownership, admin isolation, private images, account blocks and quota',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}'::jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      create function storage.foldername(text) returns text[] language sql as $$select string_to_array(regexp_replace($1,'/[^/]*$',''),'/')$$;
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;
      grant select on storage.objects to authenticated;
      grant all on storage.objects to service_role;
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/001_fangpt.sql',import.meta.url),'utf8'));
    const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
    const ca='33333333-3333-4333-8333-333333333333',cb='44444444-4444-4444-8444-444444444444';
    await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values('${a}','a@test.invalid','{"role":"admin","daily_limit":9999}'),('${b}','b@test.invalid','{}');
      insert into public.conversations(id,user_id,title) values('${ca}','${a}','A private'),('${cb}','${b}','B private');
      insert into public.messages(id,conversation_id,user_id,role,content) values('55555555-5555-4555-8555-555555555555','${ca}','${a}','user','A secret');
      insert into public.attachments(conversation_id,user_id,path,name,mime,size) values('${ca}','${a}','${a}/${ca}/picture.png','picture.png','image/png',123);
      insert into storage.objects(bucket_id,name) values('chat-images','${a}/${ca}/picture.png');`);
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${a}',false);`);
    assert.equal((await db.query('select * from public.conversations')).rows.length,1);
    assert.equal((await db.query('select * from public.messages')).rows.length,1);
    assert.equal((await db.query('select * from storage.objects')).rows.length,1);
    await assert.rejects(()=>db.exec(`insert into public.conversations(user_id,title) values('${b}','forged')`),{code:'42501'});
    await assert.rejects(()=>db.exec(`update public.profiles set daily_limit=500 where id='${a}'`),{code:'42501'});
    await assert.rejects(()=>db.exec(`insert into public.admin_users(user_id) values('${a}')`),{code:'42501'});
    await assert.rejects(()=>db.exec('select * from public.usage_events'),{code:'42501'});
    await assert.rejects(()=>db.exec(`select public.consume_ai_request('${a}')`),{code:'42501'});
    await db.exec(`select set_config('request.jwt.claim.sub','${b}',false);`);
    assert.deepEqual((await db.query('select title from public.conversations')).rows,[{title:'B private'}]);
    assert.equal((await db.query('select * from public.messages')).rows.length,0);
    assert.equal((await db.query('select * from storage.objects')).rows.length,0);
    await db.exec('reset role;set role anon;');
    await assert.rejects(()=>db.exec('select * from public.conversations'),{code:'42501'});
    await db.exec('reset role;set role service_role;');
    assert.equal((await db.query('select * from public.admin_users')).rows.length,0);
    const profile=(await db.query<{daily_limit:number}>(`select daily_limit from public.profiles where id='${a}'`)).rows[0];assert.equal(profile.daily_limit,60);
    for(let i=0;i<6;i++)assert.equal((await db.query<{ok:boolean}>(`select public.consume_ai_request('${a}') as ok`)).rows[0].ok,true);
    assert.equal((await db.query<{ok:boolean}>(`select public.consume_ai_request('${a}') as ok`)).rows[0].ok,false);
    await db.exec(`update public.profiles set daily_limit=1 where id='${b}';`);
    assert.equal((await db.query<{ok:boolean}>(`select public.consume_ai_request('${b}') as ok`)).rows[0].ok,true);
    assert.equal((await db.query<{ok:boolean}>(`select public.consume_ai_request('${b}') as ok`)).rows[0].ok,false);
    await db.exec(`update public.profiles set is_active=false where id='${a}';reset role;set role authenticated;select set_config('request.jwt.claim.sub','${a}',false);`);
    assert.equal((await db.query('select * from public.conversations')).rows.length,0);
    assert.equal((await db.query('select * from storage.objects')).rows.length,0);
  }finally{await db.close();}
});
