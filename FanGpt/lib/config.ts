import type { PublicConfig } from './types';
import { MAX_IMAGE_BYTES } from './validation';
import { safePublishableKey } from './public-key';

export function serverConfig() {
  return {
    key: process.env.AI_API_KEY || process.env.GEMINI_API_KEY || '',
    base: process.env.AI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
    model: process.env.AI_MODEL || 'gemini-3.5-flash-lite',
    supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    supabaseKey: safePublishableKey(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''),
    serviceKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean),
    privatePreview: process.env.FANGPT_PRIVATE_PREVIEW === '1',
  };
}
export function publicConfig(): PublicConfig {
  const c=serverConfig();
  return {supabaseUrl:c.supabaseUrl,supabaseKey:c.supabaseKey,authConfigured:!!(c.supabaseUrl&&c.supabaseKey),cloudConfigured:!!(c.supabaseUrl&&c.supabaseKey&&c.serviceKey),aiConfigured:!!c.key,model:c.model,maxImageBytes:MAX_IMAGE_BYTES};
}
