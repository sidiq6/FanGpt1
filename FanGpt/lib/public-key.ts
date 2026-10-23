/** Returns only a publishable/legacy anon key, never a server key. */
export function safePublishableKey(key:string):string{
  if(key.startsWith('sb_publishable_'))return key;
  try{const parts=key.split('.');if(parts.length===3&&JSON.parse(Buffer.from(parts[1],'base64url').toString()).role==='anon')return key;}catch{}
  return '';
}
