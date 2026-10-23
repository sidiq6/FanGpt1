import { z } from 'zod';
import { requireAdmin, serviceClient, jsonError, assertOrigin, readJson, AppError } from '@/lib/server';
const schema=z.object({is_active:z.boolean().optional(),daily_limit:z.number().int().min(0).max(500).optional()}).refine(v=>Object.keys(v).length>0);
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{
  assertOrigin(request);const admin=await requireAdmin(request);const {id}=await params;
  if(!z.string().uuid().safeParse(id).success)throw new AppError(400,'ID akun tidak valid.');
  const body=schema.safeParse(await readJson(request,3000));if(!body.success)throw new AppError(400,'Status atau batas penggunaan tidak valid.');
  if(id===admin.user.id&&body.data.is_active===false)throw new AppError(400,'Kamu tidak dapat menonaktifkan akun sendiri.');
  const {data,error}=await serviceClient().from('profiles').update(body.data).eq('id',id).select('id').single();
  if(error||!data)throw new AppError(404,'Akun belum dapat diperbarui.');return Response.json({ok:true});
}catch(e){return jsonError(e);}}
