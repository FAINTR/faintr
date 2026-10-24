const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {Pool}=require('../web/src/engine-pool'),patches=require('../ui/storage-patches'),{createCore}=require('../appcore');
const policy=require('./build-policy.cjs');
const {requestError}=require('../http-safety');
test('desktop server rejects cross-site writes, simple form bodies and hostile Host headers',()=>{
 const req={url:'/api/roster/delete',method:'POST',headers:{host:'127.0.0.1:3000','content-type':'application/json',origin:'http://127.0.0.1:3000'}};
 assert.equal(requestError(req),null);
 assert.equal(requestError({...req,headers:{...req.headers,origin:'https://attacker.invalid'}}).code,403);
 assert.equal(requestError({...req,headers:{...req.headers,'content-type':'text/plain'}}).code,415);
 assert.equal(requestError({...req,headers:{...req.headers,host:'attacker.invalid:3000'}}).code,403);
 assert.equal(requestError({...req,method:'GET',headers:{...req.headers,origin:undefined,'sec-fetch-site':'cross-site'}}).code,403);
});
test('published leagues rebuild on changed inputs and unverified seeds cannot bypass invalidation',()=>{
 assert(policy.wantedFormat('all-1500',['fantasy-1500'],[],true));assert(!policy.wantedFormat('future-1500',['fantasy-1500'],[],true));
 assert(!policy.verifiedSeed(undefined,'new'));assert(!policy.verifiedSeed({hash:'old'},'new'));
 assert(!policy.publishable({hasData:true,record:{hash:'old'},hash:'new',state:'reused'}));
 assert(policy.publishable({hasData:true,hash:'new',state:'built'}));assert(policy.publishable({hasData:true,hash:'new',preview:true}));
});
test('upstream simulation-only updates invalidate cached rankings, without invalidating for unrelated UI files',()=>{
 const path=require('node:path'),inputs=require('./build-inputs.cjs'),{ENGINE_FILES}=require('../engine');
 const F={key:'all-1500',cup:'all',cp:1500,meta:'great'},root='synthetic-source';
 const files=new Map(inputs.inputFiles(F).map(file=>[path.join(root,file),Buffer.from('fixture:'+file)]));
 const read=file=>{if(!files.has(file))throw Error('Missing synthetic input');return files.get(file);};
 const baseline=inputs.inputHash(root,F,'code-v1',read);
 for(const file of ENGINE_FILES){
  const key=path.join(root,file),previous=files.get(key);files.set(key,Buffer.from('changed:'+file));
  assert.notEqual(inputs.inputHash(root,F,'code-v1',read),baseline,file+' must invalidate the cache');files.set(key,previous);
 }
 files.set(path.join(root,'ui/app.css'),Buffer.from('cosmetic change'));assert.equal(inputs.inputHash(root,F,'code-v1',read),baseline);
 assert.notEqual(inputs.inputHash(root,F,'code-v2',read),baseline);
 const gm=path.join(root,'data/gamemaster.json'),saved=files.get(gm);files.delete(gm);assert.notEqual(inputs.inputHash(root,F,'code-v1',read),baseline);files.set(gm,saved);
 assert.equal(inputs.inputHash(root,F,'code-v1',read),baseline);
});
class WorkerStub {
  static made=[];
  constructor(){WorkerStub.made.push(this);this.sent=[];}
  postMessage(m){this.sent.push(m);}
  terminate(){this.terminated=true;}
  emit(data){this.onmessage({data});}
}
function pool(n=1){WorkerStub.made=[];return new Pool(n,{WorkerClass:WorkerStub,url:'/engine',manifest:{},runInline:(fn,n)=>n*2});}
test('lazy engine pool loads no workers for rankings and grows only to queued calculation demand',async()=>{
 WorkerStub.made=[];const p=new Pool(4,{lazy:true,WorkerClass:WorkerStub,url:'/engine',manifest:{},runInline:(fn,n)=>n*2});
 assert.equal(WorkerStub.made.length,0);const a=p.run('ivInfo',1);assert.equal(WorkerStub.made.length,1);
 const b=p.run('ivInfo',2);assert.equal(WorkerStub.made.length,2);
 for(const w of WorkerStub.made)w.emit({type:'ready'});
 for(const w of WorkerStub.made){const job=w.sent.at(-1);w.emit({id:job.id,result:job.args[0]});}
 assert.equal(await a,1);assert.equal(await b,2);assert.equal(WorkerStub.made.length,2);
});
test('engine boot failure drains queued work through the inline fallback',async()=>{
  const p=pool(),job=p.run('ivInfo',9);WorkerStub.made[0].emit({type:'fatal',error:'missing script'});assert.equal(await job,18);
});
test('a worker that cannot accept its initialization is terminated and falls back',async()=>{
 let worker;class FailedWorker{constructor(){worker=this;}postMessage(){throw Error('Unsupported');}terminate(){this.terminated=true;}}
 const p=new Pool(4,{lazy:true,WorkerClass:FailedWorker,url:'/engine',manifest:{},runInline:()=>42});
 assert.equal(await p.run('ivInfo'),42);assert(worker.terminated);assert.equal(p.workers.size,0);
});
test('engine crash rejects active work, releases queued work and allows retry',async()=>{
  const p=pool(),w=WorkerStub.made[0];w.emit({type:'ready'});
  const active=assert.rejects(p.run('memberRow',2),/engine stopped/),queued=p.run('ivInfo',4);
  w.onerror();await active;assert.equal(await queued,8);assert.equal(await p.run('ivInfo',7),14);assert.equal(p.jobs.size,0);
});
test('one failed engine leaves another engine usable',async()=>{
  const p=pool(2),[a,b]=WorkerStub.made;a.emit({type:'ready'});b.emit({type:'ready'});
  const failed=assert.rejects(p.run('memberRow',1),/engine stopped/),success=p.run('ivInfo',2);a.onerror();
  const m=b.sent.at(-1);b.emit({id:m.id,result:22});await failed;assert.equal(await success,22);
});
const entry={uid:'r1',id:'azumarill',nickname:'Original',ivs:{atk:0,def:15,hp:15},cp:1498,levelCap:50,moveset:[],leagues:[1500]};
test('refresh keeps newer names, notes and league choices and never revives deleted entries',()=>{
  const update={uid:entry.uid,basis:patches.basis(entry,'roster'),eval:{v:2}};
  const latest={...entry,nickname:'New name',notes:'Keep me',leagues:[1500,2500]};
  assert.deepEqual(patches.refresh([latest],[update],'roster'),[{...latest,eval:{v:2}}]);
  assert.deepEqual(patches.refresh([],[update],'roster'),[]);
  const powered={...latest,cp:1600};assert.deepEqual(patches.refresh([powered],[update],'roster'),[powered]);
});
test('saved-team refresh never overwrites a rename, changed team or deletion',()=>{
  const team={id:'t1',f:'all-1500',members:[{id:'azumarill'}],name:'Old',history:[{version:'v1'}]};
  const update={id:'t1',basis:patches.basis(team,'saved'),history:[{version:'v2'}]};
  assert.equal(patches.refresh([{...team,name:'Renamed'}],[update],'saved')[0].name,'Renamed');
  assert.deepEqual(patches.refresh([],[update],'saved'),[]);
  const changed={...team,members:[{id:'clodsire'}]};assert.deepEqual(patches.refresh([changed],[update],'saved'),[changed]);
});
test('conflicting edits are rejected while evaluation-only changes do not create false conflicts',()=>{
  const expected=patches.contentBasis(entry);
  assert.doesNotThrow(()=>patches.assertCurrent({...entry,eval:{v:2}},expected));
  assert.doesNotThrow(()=>patches.assertCurrent({...entry,ivs:{hp:15,def:15,atk:0}},expected));
  assert.throws(()=>patches.assertCurrent({...entry,notes:'New edit'},expected),/changed or removed/);
  assert.throws(()=>patches.assertCurrent(undefined,expected),/changed or removed/);
});
function fakeCore(){let reads=0,loads=0,saved=[];const catalog=[{id:'stunfisk',name:'Stunfisk',shadow:false,fast:[],charged:[]},{id:'stunfisk_galarian',name:'Stunfisk (Galarian)',shadow:false,fast:[],charged:[]}];
  const core=createCore({ev:()=>{reads++;return catalog;},info:{web:true,installed:'version'},formats:[],live:()=>null,isBuilt:()=>false,buildStatus:()=>null,
    pool:{run:async()=>({v:2})},loadFormatData:async()=>{loads++;},storage:{rosterAll:async()=>[],rosterUpsertMany:async list=>{saved.push(...list);}}});
  return {core,counts:()=>({reads,loads,saved:saved.length})};
}
test('website information and an empty roster do not load any league matrices',async()=>{
  const {core,counts}=fakeCore();await core.handle('GET','/api/info',{});assert.deepEqual(await core.handle('GET','/api/roster',{}),[]);assert.deepEqual(counts(),{reads:0,loads:0,saved:0});
});
test('large imports explicitly return every pending index instead of silently dropping rows',async()=>{
  const {core,counts}=fakeCore(),roster=Array.from({length:1001},()=>({id:'stunfisk',ivs:{atk:0,def:15,hp:15},cp:1400}));
  const result=await core.handle('POST','/api/roster/import',{}, {roster});assert.equal(result.added,1000);assert.deepEqual(result.rejected,[1000]);assert.equal(counts().saved,1000);assert(result.errors.length);
  await assert.rejects(core.handle('POST','/api/roster/import',{}, {roster:{}}),/Roster array/);
});
test('unknown CSV forms are reported rather than imported as the wrong form',async()=>{
  const {core}=fakeCore();const result=await core.handle('POST','/api/roster/csv',{}, {text:'Name,Form,Atk IV,Def IV,HP IV,CP\nStunfisk,Galarian,0,15,15,1400\nStunfisk,Imaginary,0,15,15,1400'});
  assert.equal(result.entries[0].id,'stunfisk_galarian');assert.equal(result.entries.length,1);assert.equal(result.badCount,1);
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function bridge(user={id:'account-a',email:'a@example.invalid'},options={}) {
  let callback;const workers=[],values=new Map();
  class FakeWorker extends WorkerStub {constructor(){super();workers.push(this);}postMessage(m){super.postMessage(m);if(m.type==='init')queueMicrotask(()=>this.emit({type:'ready'}));}}
  const sb={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{display_name:'Test',is_admin:false}})})})}),auth:{getSession:async()=>({data:{session:user?{user}:null}}),onAuthStateChange:fn=>callback=fn}};
  if(options.from)sb.from=options.from;
  sb.auth.signOut=async()=>({error:options.signOutError||null});
  sb.auth.resend=async body=>{if(options.resend)return options.resend(body);return {error:null};};
  const window={FAINTR_CONFIG:user?{supabaseUrl:'https://example.invalid',supabaseAnonKey:'synthetic'}:{},supabase:{createClient:()=>sb},FAINTR_STORAGE_PATCHES:patches};
  const context={window,Worker:FakeWorker,URL,location:{origin:'https://faintr.test',hash:options.hash||''},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},setTimeout,fetch:async()=>({ok:true,json:async()=>({files:{'core.js':'core.js'}})})};
  vm.runInNewContext(fs.readFileSync('web/bridge.js','utf8'),context);await window.FAINTR_BRIDGE.ready;
  return {api:window.FAINTR_BRIDGE,workers,values,switchUser:async next=>{callback('SIGNED_IN',next?{user:next}:null);await new Promise(r=>setTimeout(r,10));}};
}

test('confirmation recovery resends a signup email to the current site without changing user data',async()=>{
 let sent;const b=await bridge(undefined,{resend:async body=>{sent=body;return {error:null};}});
 await b.api.auth.resendConfirmation('synthetic@example.invalid');
 assert.deepEqual(JSON.parse(JSON.stringify(sent)),{type:'signup',email:'synthetic@example.invalid',options:{emailRedirectTo:'https://faintr.test'}});
 assert.equal(b.api.state.user.id,'account-a');
 const limited=await bridge(undefined,{resend:async()=>({error:{code:'over_email_send_rate_limit',status:429}})});
 await assert.rejects(limited.api.auth.resendConfirmation('synthetic@example.invalid'),e=>e.status===429);
});
test('verification callback failure remains recoverable and never echoes arbitrary URL content',async()=>{
 const b=await bridge(undefined,{hash:'#error=access_denied&error_code=otp_expired&error_description=%3Cscript%3Eprivate-token%3C/script%3E'});
 assert.match(b.api.state.authNotice,/expired/);assert.doesNotMatch(b.api.state.authNotice,/private-token|script/);
 const normal=await bridge();assert.equal(normal.api.state.authNotice,null);
});
test('switching accounts terminates the old core and rejects old operations',async()=>{
  const b=await bridge(),old=b.workers[0];const pending=assert.rejects(b.api.api('/api/roster',{}),/account changed/);await tick();
  await b.switchUser({id:'account-b',email:'b@example.invalid'});await pending;
  assert(old.terminated);assert.equal(b.workers.length,2);
  const replies=old.sent.length;old.emit({type:'storage',id:77,op:'rosterUpsert',args:[entry]});await tick();assert.equal(old.sent.length,replies);
});
test('account-boundary notification clears profile before asynchronous refresh',async()=>{
 const b=await bridge(),changes=[];b.api.onChange((state,reason)=>changes.push({reason,profile:state.profile}));
 await b.switchUser({id:'account-b',email:'b@example.invalid'});
 assert.equal(changes[0].reason,'auth-changing');assert.equal(changes[0].profile,null);
});
test('a late direct account API response cannot escape the account boundary',async()=>{
 let release;
 const from=table=>{
  if(table==='profiles')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{display_name:'Test',is_admin:true}})})})};
  return {select:()=>({order:()=>({limit:()=>new Promise(resolve=>{release=resolve;})})})};
 };
 const b=await bridge(undefined,{from});
 const pending=assert.rejects(b.api.api('/api/bugs'),/account changed/);await tick();
 await b.switchUser({id:'account-b',email:'b@example.invalid'});release({data:[{title:'Synthetic private fixture'}]});await pending;
});
test('a crashed core rejects pending and future requests instead of leaving spinners forever',async()=>{
  const b=await bridge(null),w=b.workers[0];const pending=assert.rejects(b.api.api('/api/example'),/engine stopped/);await tick();w.onerror();await pending;
  await assert.rejects(b.api.api('/api/example'),/engine stopped/);
});

test('a failed sign-out reports failure instead of claiming the device is signed out',async()=>{
 const b=await bridge(undefined,{signOutError:{message:'offline'}});
 await assert.rejects(b.api.auth.signOut(),/Could not sign out/);
});

test('replayed imports insert once and never overwrite an existing Pokémon',async()=>{
 const original={...entry,uid:'import-1234567890abcdef',notes:'edited after import'};
 const replay={...original,notes:'old import content'};
 assert.deepEqual(patches.insertRoster([original],[replay,replay]),[original]);
 assert.throws(()=>patches.insertRoster([original],[entry],1),/no longer has enough room/);
 let saved=[];
 const core=createCore({ev:()=>[{id:'stunfisk',name:'Stunfisk',fast:[],charged:[]}],formats:[],pool:{run:async()=>({v:2})},storage:{rosterAll:async()=>saved,rosterInsertMany:async entries=>{saved=patches.insertRoster(saved,entries);}}});
 const body={roster:[{id:'stunfisk',cp:1400,_importKey:'1234567890abcdef'}]};
 await core.handle('POST','/api/roster/import',{},body);saved[0].notes='new note';
 const retry=await core.handle('POST','/api/roster/import',{},body);
 assert.equal(retry.added,1);assert.equal(saved.length,1);assert.equal(saved[0].notes,'new note');
});

function fakeDatabase(initial,onFirstUpdate) {
 let doc=structuredClone(initial),first=true;
 return {get doc(){return doc;},from(table){
  let fields,patch,filters={};
  const query={select(value){fields=value;return query;},eq(k,v){filters[k]=v;return query;},update(value){patch=value;return query;},
   async maybeSingle(){return {data:table==='profiles'?{display_name:'Test',is_admin:false}:fields==='version'?{version:doc.version}:structuredClone(doc)};},
   async single(){return {data:structuredClone(doc)};},
   then(resolve,reject){return Promise.resolve().then(()=>{
    assert.equal(filters.user_id,'account-a');
    if(first){first=false;onFirstUpdate?.(doc);}
    if(doc.version!==filters.version)return {data:[]};
    doc={...doc,...structuredClone(patch)};return {data:[{version:doc.version}]};
   }).then(resolve,reject);}};
  return query;
 }};
}
async function storageReply(b,op,args){const w=b.workers[0],id=990;w.emit({type:'storage',id,op,args});
 for(let n=0;n<30;n++){await tick();const reply=w.sent.find(m=>m.type==='storage-reply'&&m.id===id);if(reply)return reply;}
 throw Error('No storage reply');
}
test('cloud conflict retry preserves a concurrent edit and unrelated Pokémon',async()=>{
 const db=fakeDatabase({version:1,roster:[entry],teams:[],battles:[],vip_settings:{}},doc=>{
  doc.version++;doc.roster[0].nickname='Other device';doc.roster.push({...entry,uid:'r2'});
 });
 const b=await bridge(undefined,{from:db.from});
 const reply=await storageReply(b,'rosterRefreshMany',[[{uid:entry.uid,basis:patches.basis(entry,'roster'),eval:{v:3}}]]);
 assert(!reply.error);assert.equal(db.doc.version,3);assert.equal(db.doc.roster.length,2);
 assert.equal(db.doc.roster[0].nickname,'Other device');assert.equal(db.doc.roster[0].eval.v,3);
});
test('cloud conflict retry refuses a stale explicit edit without overwriting the newer version',async()=>{
 const db=fakeDatabase({version:1,roster:[entry],teams:[],battles:[],vip_settings:{}},doc=>{doc.version++;doc.roster[0].notes='Newer note';});
 const b=await bridge(undefined,{from:db.from});
 const reply=await storageReply(b,'rosterUpsert',[{...entry,nickname:'Stale edit'},patches.contentBasis(entry)]);
 assert.match(reply.error,/changed or removed/);assert.equal(db.doc.version,2);assert.equal(db.doc.roster[0].notes,'Newer note');assert.equal(db.doc.roster[0].nickname,entry.nickname);
});
