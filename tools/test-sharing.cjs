// Run after building: node tools/test-sharing.cjs [site-directory]
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const codec=require('../web/share-codec');
const site=path.resolve(process.argv[2]||path.join(__dirname,'../site'));
const members=[
 {id:'azumarill',moveset:['BUBBLE','ICE_BEAM','PLAY_ROUGH'],ivs:{atk:0,def:15,hp:15},levelCap:50},
 {id:'clodsire',moveset:['POISON_STING','EARTHQUAKE','STONE_EDGE'],ivs:{atk:1,def:14,hp:15},levelCap:50},
 {id:'mandibuzz',moveset:['SNARL','DARK_PULSE','AERIAL_ACE'],ivs:{atk:0,def:13,hp:15},levelCap:51}
];
const setup={v:1,f:'all-1500',m:members.map(m=>({...m,label:'PRIVATE NICKNAME',notes:'PRIVATE NOTE'})),w:{coverage:3},user_id:'PRIVATE ACCOUNT'};
const token=codec.encode(setup),decoded=codec.decode(token);
assert.deepEqual(decoded.m,members);assert(!JSON.stringify(decoded).includes('PRIVATE'));
for(const invalid of ['', '!'.repeat(8),'a'.repeat(2201),btoa('{"v":2}')])assert.throws(()=>codec.decode(invalid));
for(const invalid of [{...setup,f:'<script>'},{...setup,m:[members[0],members[0],members[2]]},{...setup,w:{coverage:99}},{...setup,m:members.map((m,i)=>i?m:{...m,ivs:{atk:-1,def:0,hp:0}})}])assert.throws(()=>codec.encode(invalid));
(async()=>{
 const worker=(await import('data:text/javascript;base64,'+fs.readFileSync(path.join(site,'_worker.js')).toString('base64'))).default;
 const env={ASSETS:{fetch:async()=>new Response(fs.readFileSync(path.join(site,'index.html')),{headers:{'Content-Type':'text/html'}})}};
 const ctx={waitUntil:p=>p.catch(()=>{})},url='https://faintr.com/share/'+token;
 let r=await worker.fetch(new Request(url),env,ctx);assert.equal(r.status,200);
 const html=await r.text();assert(html.includes(url+'/image.png'));assert(html.includes('Azumarill'));assert(html.includes('teamShareDialog'));assert(!html.includes('PRIVATE'));
 assert(r.headers.get('Content-Security-Policy').includes('https://static.cloudflareinsights.com'));
 r=await worker.fetch(new Request(url+'/image.png'),env,ctx);assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'image/png');
 const png=Buffer.from(await r.arrayBuffer());assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
 r=await worker.fetch(new Request(url+'/image.png',{method:'HEAD'}),env,ctx);assert.equal(r.status,200);assert.equal((await r.arrayBuffer()).byteLength,0);
 r=await worker.fetch(new Request(url,{method:'POST'}),env,ctx);assert.equal(r.status,405);
 for(const bad of ['not-a-team',codec.encode({...setup,f:'constructor'}),codec.encode({...setup,m:members.map((m,i)=>i?m:{...m,id:'unknown_pokemon'})})]){r=await worker.fetch(new Request('https://faintr.com/share/'+bad),env,ctx);assert.equal(r.status,400);}
 const routes=JSON.parse(fs.readFileSync(path.join(site,'_routes.json')));assert.deepEqual(routes.include,['/share/*','/s/*']);
 const mega={v:1,f:'mega-10000',m:[
   {id:'mewtwo_mega_y',moveset:['PSYCHO_CUT','PSYSTRIKE','THUNDERBOLT','FUTURE_SIGHT_PLUS']},
   {id:'melmetal',moveset:['THUNDER_SHOCK','DOUBLE_IRON_BASH','DYNAMIC_PUNCH']},
   {id:'palkia_origin',moveset:['DRAGON_BREATH','AQUA_TAIL','SPACIAL_REND']}]};
 const megaToken=codec.encode(mega);
 r=await worker.fetch(new Request('https://faintr.com/share/'+megaToken),env,ctx);assert.equal(r.status,200);
 const megaHtml=await r.text();assert(megaHtml.includes('FUTURE_SIGHT_PLUS'));
 const originalFetch=globalThis.fetch,records=new Map(),shortId='aBcDeF012345';let limited=false;
 env.FAINTR_SHARE_WRITE_KEY='TEST SERVER KEY';env.SHARE_SUPABASE_URL='https://test.supabase.co';env.SHARE_SUPABASE_ANON_KEY='TEST PUBLIC KEY';
 globalThis.fetch=async(input,options)=>{
   const endpoint=new URL(input);assert(endpoint.pathname.startsWith('/rest/v1/rpc/'));
   const body=JSON.parse(options.body);
   if(endpoint.pathname.endsWith('/create_shared_team')){
     assert.equal(body.p_write_key,env.FAINTR_SHARE_WRITE_KEY);assert.match(body.p_rate_key,/^[a-f0-9]{64}$/);
     assert(!JSON.stringify(body.p_team).includes('PRIVATE'));assert.deepEqual(body.p_team,decoded);
     if(limited)return Response.json({message:'Sharing rate limit'},{status:400});
     records.set(shortId,body.p_team);return Response.json(shortId);
   }
   assert(endpoint.pathname.endsWith('/get_shared_team'));return Response.json(records.get(body.p_id)||null);
 };
 const create=body=>new Request('https://faintr.com/share/create',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://faintr.com','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(body)});
 try{
   r=await worker.fetch(create(setup),env,ctx);assert.equal(r.status,201);
   const result=await r.json();assert.equal(result.path,'/s/'+shortId);assert.equal(('https://faintr.com'+result.path).length,33);
   assert(!JSON.stringify(result).includes('TEST SERVER KEY'));
   const shortUrl='https://faintr.com'+result.path;
   r=await worker.fetch(new Request(shortUrl),env,ctx);assert.equal(r.status,200);
   const shortHtml=await r.text();assert(shortHtml.includes(shortUrl+'/image.png'));assert(shortHtml.includes('id="sharedTeamData"'));
   const embedded=JSON.parse(shortHtml.match(/id="sharedTeamData">([^<]+)<\/script>/)[1]);assert.deepEqual(embedded,decoded);
   r=await worker.fetch(new Request(shortUrl+'/image.png'),env,ctx);assert.equal(r.status,200);
   assert.equal(r.headers.get('Content-Type'),'image/png');assert.equal(Buffer.from(await r.arrayBuffer()).readUInt32BE(16),1200);
   r=await worker.fetch(new Request('https://faintr.com/s/000000000000'),env,ctx);assert.equal(r.status,404);
   assert((await r.text()).includes('Browse current teams'));
   const lookupFetch=globalThis.fetch;
   try{
     globalThis.fetch=async()=>{throw Error('Synthetic offline failure');};
     r=await worker.fetch(new Request(shortUrl+'?private=never-echo-this'),env,ctx);assert.equal(r.status,503);
     const unavailable=await r.text();assert(unavailable.includes('Try this link again'));assert(!unavailable.includes('never-echo-this'));assert.equal(r.headers.get('Cache-Control'),'no-store');
     r=await worker.fetch(new Request(shortUrl,{method:'HEAD'}),env,ctx);assert.equal(r.status,503);assert.equal((await r.text()).length,0);
     globalThis.fetch=async()=>new Response('invalid json');
     r=await worker.fetch(new Request(shortUrl),env,ctx);assert.equal(r.status,503);assert((await r.text()).includes('Try this link again'));
   }finally{globalThis.fetch=lookupFetch;}
   r=await worker.fetch(new Request(shortUrl),{...env,ASSETS:{fetch:async()=>{throw Error('Synthetic asset failure');}}},ctx);assert.equal(r.status,503);assert((await r.text()).includes('Browse current teams'));
   const interrupted=new ReadableStream({start(controller){controller.error(Error('Synthetic interrupted HTML'));}});
   r=await worker.fetch(new Request(shortUrl),{...env,ASSETS:{fetch:async()=>new Response(interrupted)}},ctx);assert.equal(r.status,503);assert((await r.text()).includes('Try this link again'));
   r=await worker.fetch(create({...setup,m:[]}),env,ctx);assert.equal(r.status,400);
   r=await worker.fetch(new Request('https://faintr.com/share/create',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.invalid'},body:JSON.stringify(setup)}),env,ctx);assert.equal(r.status,403);
   r=await worker.fetch(new Request('https://faintr.com/share/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({padding:'x'.repeat(5000)})}),env,ctx);assert.equal(r.status,413);
   limited=true;r=await worker.fetch(create(setup),env,ctx);assert.equal(r.status,429);limited=false;
   r=await worker.fetch(create(setup),{...env,FAINTR_SHARE_WRITE_KEY:undefined},ctx);assert.equal(r.status,503);
 } finally {globalThis.fetch=originalFetch;}
 console.log('PASS: short link creation, exact setup roundtrip, legacy links, privacy, validation, preview metadata, PNG, rate/error handling and scoped routes.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
