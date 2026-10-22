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
 const routes=JSON.parse(fs.readFileSync(path.join(site,'_routes.json')));assert.deepEqual(routes.include,['/share/*']);
 console.log('PASS: team settings, privacy, validation, preview metadata, PNG, HEAD/POST, CSP and scoped routes.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
