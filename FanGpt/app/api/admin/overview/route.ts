import { requireAdmin, serviceClient, jsonError, AppError } from '@/lib/server';
import { publicConfig } from '@/lib/config';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
  await requireAdmin(request);const service=serviceClient();const since=new Date(Date.now()-7*86400000).toISOString();
  const [users,chats,messages,events,profiles]=await Promise.all([
    service.from('profiles').select('id',{count:'exact',head:true}),
    service.from('conversations').select('id',{count:'exact',head:true}).is('deleted_at',null),
    service.from('messages').select('id',{count:'exact',head:true}),
    service.from('usage_events').select('id,user_id,status,error_code,model,total_tokens,latency_ms,created_at').gte('created_at',since).order('created_at',{ascending:false}).limit(1000),
    service.from('profiles').select('id,email,full_name,is_active,daily_limit,created_at').order('created_at',{ascending:false}).limit(100),
  ]);
  if([users,chats,messages,events,profiles].some(r=>r.error))throw new AppError(503,'Dashboard belum dapat dimuat.');
  return Response.json({counts:{users:users.count,chats:chats.count,messages:messages.count},events:events.data,profiles:profiles.data,config:publicConfig(),eventLimit:1000},{headers:{'Cache-Control':'no-store'}});
}catch(e){return jsonError(e);}}
