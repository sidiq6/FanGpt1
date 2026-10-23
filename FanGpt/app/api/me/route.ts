import { publicConfig, serverConfig } from '@/lib/config';
import { requireAccount, requireAdmin, jsonError } from '@/lib/server';
import { getChatGPTUser } from '@/app/chatgpt-auth';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{
    if(!publicConfig().authConfigured){const u=serverConfig().privatePreview?await getChatGPTUser():null;return Response.json({account:u?{id:u.userId,name:u.displayName,email:u.email,admin:false,preview:true}:null},{headers:{'Cache-Control':'no-store'}});}
    const a=await requireAccount(request);let admin=false;
    try{await requireAdmin(request);admin=true;}catch{}
    return Response.json({account:{id:a.user.id,name:a.profile.full_name||a.user.email?.split('@')[0]||'Teman FanGpt',email:a.user.email,avatar:a.user.user_metadata?.avatar_url,admin,preview:false}},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return jsonError(e);}
}
