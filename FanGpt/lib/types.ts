export type PublicConfig = {
  supabaseUrl: string;
  supabaseKey: string;
  authConfigured: boolean;
  cloudConfigured: boolean;
  aiConfigured: boolean;
  model: string;
  maxImageBytes: number;
};
export type Attachment = { id: string; name: string; mime: string; size: number; url?: string; data?: string };
export type Message = { id: string; role: 'user' | 'assistant'; content: string; created_at: string; status?: string; attachments?: Attachment[] };
export type Conversation = { id: string; title: string; created_at: string; updated_at: string; messages?: Message[]; hasMore?:boolean; before?:string };
export type Account = { id: string; name: string; email: string; avatar?: string; admin: boolean; preview?: boolean };
