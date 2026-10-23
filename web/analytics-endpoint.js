import analytics from '../ui/analytics.js';
const SOURCES=['direct','search','discord','social','supporter','referral'];
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function cleanEvent(input){
 if(!input||!UUID.test(input.id)||!UUID.test(input.visitor)||!UUID.test(input.session)||!analytics.EVENTS.includes(input.event)||!analytics.TOOLS.includes(input.tool)||!SOURCES.includes(input.source)||typeof input.returning!=='boolean'||input.consent!==analytics.VERSION)throw Error('Invalid event');
 return Object.fromEntries(['id','visitor','session','event','tool','source','returning','consent'].map(k=>[k,input[k]]));
}
export async function analyticsEndpoint(request,env,metadata){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(!metadata.analyticsEnabled||env.FAINTR_ANALYTICS_ENABLED!=='true'||!env.FAINTR_ANALYTICS_WRITE_KEY)return new Response(null,{status:404,headers});
 if(request.method!=='POST')return new Response(null,{status:405,headers:{...headers,Allow:'POST'}});
 const url=new URL(request.url);
 if(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-GPC')==='1')return new Response(null,{status:403,headers});
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return new Response(null,{status:415,headers});
 try{
  const reader=request.body?.getReader();if(!reader)throw Error();let size=0,chunks=[];
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1024){await reader.cancel();return new Response(null,{status:413,headers});}chunks.push(value);}
  const buffer=new Uint8Array(size);let offset=0;for(const c of chunks){buffer.set(c,offset);offset+=c.length;}
  const event=cleanEvent(JSON.parse(new TextDecoder().decode(buffer)));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.FAINTR_ANALYTICS_WRITE_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
  const rate=await hash('rate|'+new Date().toISOString().slice(0,10)+'|'+(request.headers.get('CF-Connecting-IP')||'unknown'));
  event.visitor=await hash('visitor|'+event.visitor);event.session=await hash('session|'+event.session);
  const response=await fetch(metadata.supabaseUrl+'/rest/v1/rpc/record_usage_event',{method:'POST',headers:{apikey:metadata.supabaseAnonKey,Authorization:'Bearer '+metadata.supabaseAnonKey,'Content-Type':'application/json'},body:JSON.stringify({p_event:event,p_write_key:env.FAINTR_ANALYTICS_WRITE_KEY,p_rate_key:rate}),signal:AbortSignal.timeout(5000)});
  return new Response(null,{status:response.ok?204:503,headers});
 }catch(_){return new Response(null,{status:400,headers});}
}
