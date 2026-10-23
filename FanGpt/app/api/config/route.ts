import { publicConfig } from '@/lib/config';
export const dynamic='force-dynamic';
export function GET(){return Response.json(publicConfig(),{headers:{'Cache-Control':'no-store'}});}
