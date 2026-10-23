/** Parses fragmented UTF-8 SSE without exposing provider frames to the client. */
export async function* readGeminiStream(body:ReadableStream<Uint8Array>) {
  const reader=body.getReader();const decoder=new TextDecoder();let buffer='';
  const parse=(frame:string)=>{
    const data=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');
    if(!data||data==='[DONE]')return null;
    return JSON.parse(data);
  };
  try{
    while(true){const {done,value}=await reader.read();if(done)break;buffer=(buffer+decoder.decode(value,{stream:true})).replace(/\r\n/g,'\n');let pos:number;
      while((pos=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,pos);buffer=buffer.slice(pos+2);const data=parse(frame);if(data)yield data;}
    }
    buffer=(buffer+decoder.decode()).replace(/\r\n/g,'\n');if(buffer.trim()){const data=parse(buffer);if(data)yield data;}
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
