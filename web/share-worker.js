// Public game setups only. Short links use a separate lookup; no account/storage access.
import codec from './share-codec.js';
import { renderCard } from './share-image.js';
import metadata from './share-metadata.json';
const escape = s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY'};
const problem=(status,message)=>Object.assign(new Error(message),{status});
async function lookup(env,method,body) {
  const base=metadata.supabaseUrl || env.SHARE_SUPABASE_URL, key=metadata.supabaseAnonKey || env.SHARE_SUPABASE_ANON_KEY;
  if(!base || !key) throw problem(503,'Short links are temporarily unavailable. Please try again.');
  let response;
  try { response=await fetch(base+'/rest/v1/rpc/'+method,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)}); }
  catch(_){throw problem(503,'Short links are temporarily unavailable. Please try again.');}
  if(!response.ok){
    const error=await response.json().catch(()=>({}));
    if(error.message==='Sharing rate limit')throw problem(429,'You have shared several teams. Please try again in a minute.');
    throw problem(503,'Short links are temporarily unavailable. Please try again.');
  }
  return response.json();
}
async function readSetup(request) {
  if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))throw problem(415,'Send a team setup as JSON.');
  const reader=request.body?.getReader(); if(!reader)throw problem(400,'Choose a team to share.');
  const parts=[];let bytes=0;
  for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4096){await reader.cancel();throw problem(413,'This team setup is too large.');}parts.push(value);}
  const merged=new Uint8Array(bytes);let offset=0;for(const part of parts){merged.set(part,offset);offset+=part.length;}
  try{return codec.clean(JSON.parse(new TextDecoder().decode(merged)));}catch(_){throw problem(400,'This team setup is invalid.');}
}
function describe(team) {
  const format=metadata.formats[team.f];
  if (typeof format !== 'string' || !Object.hasOwn(metadata.formats,team.f)) throw new Error('Unknown league.');
  return {format, members:team.m.map(m=>{
    const p=metadata.pokemon[m.id];
    if (!p || m.moveset.some((mv,i)=>!(i===0?p.fast:p.charged).includes(mv))) throw new Error('Unknown Pokemon or move.');
    return {...m,name:p.name,types:p.types,moves:m.moveset.map(k=>metadata.moves[k]||k.replaceAll('_',' '))};
  })};
}
export default {
  async fetch(request,env,ctx) {
    const url=new URL(request.url);
    if (!url.pathname.startsWith('/share/') && !url.pathname.startsWith('/s/')) return env.ASSETS.fetch(request);
    if(request.method==='POST' && url.pathname==='/share/create'){
      try {
        const origin=request.headers.get('Origin');if(origin && origin!==url.origin)throw problem(403,'Open FAINTR to share a team.');
        if(!env.FAINTR_SHARE_WRITE_KEY)throw problem(503,'Short links are temporarily unavailable. Please try again.');
        const team=await readSetup(request);try{describe(team);}catch(_){throw problem(400,'This team contains an unknown Pokémon or move.');}
        const address=request.headers.get('CF-Connecting-IP')||'unknown';
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.FAINTR_SHARE_WRITE_KEY+'|'+new Date().toISOString().slice(0,10)+'|'+address));
        const rateKey=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
        const id=await lookup(env,'create_shared_team',{p_team:team,p_write_key:env.FAINTR_SHARE_WRITE_KEY,p_rate_key:rateKey});
        if(typeof id!=='string'||!/^[A-Za-z0-9_-]{12}$/.test(id))throw problem(503,'Could not create a short team link. Please try again.');
        return Response.json({path:'/s/'+id},{status:201,headers:{...headers,'Cache-Control':'no-store'}});
      }catch(e){return Response.json({error:e.status?e.message:'Could not create this team link. Please try again.'},{status:e.status||500,headers:{...headers,'Cache-Control':'no-store'}});}
    }
    if (!['GET','HEAD'].includes(request.method)) return new Response('Use GET.',{status:405,headers:{...headers,Allow:'GET, HEAD'}});
    const short=/^\/s\/([A-Za-z0-9_-]{12})(\/image\.png)?$/.exec(url.pathname);
    const match=short || /^\/share\/([A-Za-z0-9_-]{1,2200})(\/image\.png)?$/.exec(url.pathname);
    let team,card;
    try {
      if (!match) throw Error();
      if(short){const saved=await lookup(env,'get_shared_team',{p_id:short[1]});if(!saved)throw problem(404,'This team link was not found.');team=codec.clean(saved);}
      else team=codec.decode(match[1]);
      card=describe(team);
    }
    catch (e) {return new Response(e.status?e.message:'This team link is invalid. Open FAINTR.com to choose another team.',{status:e.status||400,headers:{...headers,'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});}
    // A fixed canonical host prevents hostile Host headers from appearing in previews.
    const canonical='https://faintr.com'+(short?'/s/':'/share/')+match[1], image=canonical+'/image.png';
    if (match[2]) {
      const cache=typeof caches!=='undefined'?caches.default:null;
      const key=new Request(image);
      const cached=cache?await cache.match(key):null;
      if(cached) return request.method==='HEAD'?new Response(null,cached):cached;
      const response=new Response(request.method==='HEAD'?null:await renderCard(card),{headers:{...headers,'Content-Type':'image/png','Cache-Control':'public, max-age=86400','Content-Disposition':'inline; filename="faintr-team.png"'}});
      if(cache && request.method==='GET') ctx.waitUntil(cache.put(key,response.clone()));
      return response;
    }
    // Serve the actual application at the shared URL: no redirect or tutorial for players.
    const base=await env.ASSETS.fetch(new Request(new URL('/',url.origin),{method:'GET'}));
    if(!base.ok) return new Response('Team preview temporarily unavailable.',{status:503,headers:{'Cache-Control':'no-store'}});
    const names=card.members.map(m=>m.name).join(' / '), title=names+' | '+card.format+' | FAINTR';
    let html=await base.text();
    html=html.replace(/<title>[\s\S]*?<\/title>/i,'<title>'+escape(title)+'</title>')
      .replace(/<meta\s+[^>]*(?:property|name)=["'](?:og:[^"']+|twitter:[^"']+)["'][^>]*>/gi,'')
      .replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>/gi,'');
    const tags=`<link rel="canonical" href="${escape(canonical)}"><meta property="og:type" content="website"><meta property="og:site_name" content="FAINTR"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="Open this team with its moves and IVs. Check matchups or try a replacement. No sign-in needed."><meta property="og:url" content="${escape(canonical)}"><meta property="og:image" content="${escape(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:type" content="image/png"><meta property="og:image:alt" content="${escape(names+' — '+card.format)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${escape(image)}">`;
    // Inert JSON restores the exact setup without exposing a long token or making another request.
    const data=JSON.stringify(team).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
    html=html.replace('</head>',tags+`<script type="application/json" id="sharedTeamData">${data}</script></head>`);
    const h=new Headers(base.headers);
    h.delete('Content-Length');h.delete('Content-Encoding');h.delete('ETag');
    for(const [k,v] of Object.entries(headers)) h.set(k,v);
    h.set('Content-Type','text/html; charset=utf-8');h.set('Cache-Control','public, max-age=300');
    // Function responses do not receive Pages _headers rules automatically.
    h.set('Content-Security-Policy',metadata.csp);
    return new Response(request.method==='HEAD'?null:html,{headers:h});
  }
};
