// Only /share/* runs here. No database, uploads, account access or arbitrary fetching.
import codec from './share-codec.js';
import { renderCard } from './share-image.js';
import metadata from './share-metadata.json';
const escape = s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY'};
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
    if (!url.pathname.startsWith('/share/')) return env.ASSETS.fetch(request);
    if (!['GET','HEAD'].includes(request.method)) return new Response('Use GET.',{status:405,headers:{...headers,Allow:'GET, HEAD'}});
    const match=/^\/share\/([A-Za-z0-9_-]{1,2200})(\/image\.png)?$/.exec(url.pathname);
    let team,card;
    try { if (!match) throw Error(); team=codec.decode(match[1]); card=describe(team); }
    catch (_) {return new Response('This team link is invalid. Open FAINTR.com to choose another team.',{status:400,headers:{...headers,'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});}
    // A fixed canonical host prevents hostile Host headers from appearing in previews.
    const canonical='https://faintr.com/share/'+match[1], image=canonical+'/image.png';
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
    html=html.replace('</head>',tags+'</head>');
    const h=new Headers(base.headers);
    h.delete('Content-Length');h.delete('Content-Encoding');h.delete('ETag');
    for(const [k,v] of Object.entries(headers)) h.set(k,v);
    h.set('Content-Type','text/html; charset=utf-8');h.set('Cache-Control','public, max-age=300');
    // Function responses do not receive Pages _headers rules automatically.
    h.set('Content-Security-Policy',metadata.csp);
    return new Response(request.method==='HEAD'?null:html,{headers:h});
  }
};
