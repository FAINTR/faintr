// Synthetic devices/accounts only. Exercises the real browser bridge; the API
// transport here is emulated and does not prove Supabase JWT processing.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const patches=require('../ui/storage-patches');
const tick=()=>new Promise(r=>setImmediate(r)),clone=x=>structuredClone(x);
const entry=i=>({uid:'synthetic-'+i,id:'azumarill',nickname:'Copy '+i,ivs:{atk:i%16,def:15,hp:15},cp:1498,levelCap:50,leagues:[1500],moveset:[],notes:'Synthetic fixture'});
function database(){return {docs:new Map(),failNext:null,loseAck:false,conflict:false,reads:0,writes:0};}
async function device(db,id,cache=new Map()){
 let auth={id,email:id+'@example.invalid'},expired=false,callback,seq=0;const workers=[];
 const current=()=>{if(expired||!auth)throw Error('Synthetic expired session');};
 const from=table=>{let fields,filters={},patch,insert;
  const q={select:v=>{fields=v;return q;},eq:(k,v)=>{filters[k]=v;return q;},update:v=>{patch=clone(v);return q;},insert:v=>{insert=clone(v);return q;},
   async maybeSingle(){try{current();db.reads++;if(table==='profiles')return {data:{display_name:'Synthetic trainer',is_admin:false}};if(filters.user_id!==auth.id)return {data:null};const doc=db.docs.get(auth.id);return {data:doc?(fields==='version'?{version:doc.version}:clone(doc)):null};}catch(e){return{error:{message:e.message}};}},
   async single(){return q.maybeSingle();},
   then(resolve,reject){return Promise.resolve().then(()=>{current();if(db.failNext){const message=db.failNext;db.failNext=null;return {error:{message}};}if(insert){if(insert.user_id!==auth.id)return{error:{message:'Denied'}};if(db.docs.has(auth.id))return {error:{code:'23505'}};db.docs.set(auth.id,{...insert,battles:[],vip_settings:{}});return{data:null};}
    if(filters.user_id!==auth.id)return {data:[]};const doc=db.docs.get(auth.id);if(db.conflict){doc.version++;return{data:[]};}if(doc.version!==filters.version)return{data:[]};
    if(patch.roster.length>2000||patch.teams.length>300||Buffer.byteLength(JSON.stringify(patch))>=3000000)return {error:{message:'Synthetic storage constraint'}};
    db.docs.set(auth.id,{...doc,...patch});db.writes++;if(db.loseAck){db.loseAck=false;return{error:{message:'Synthetic lost acknowledgement'}};}return {data:[{version:patch.version}]};
   }).then(resolve,reject);}};return q;};
 class Worker {constructor(){workers.push(this);this.sent=[];}terminate(){this.closed=true;}postMessage(m){this.sent.push(m);if(m.type==='init')queueMicrotask(()=>this.onmessage({data:{type:'ready'}}));if(m.type==='api')queueMicrotask(()=>this.onmessage({data:{id:m.id,result:clone(window.FAINTR_BRIDGE.state.doc?.[m.path==='/api/saved'?'teams':'roster']||[])}}));}}
 const sb={from,auth:{getSession:async()=>({data:{session:{user:auth}}}),onAuthStateChange:fn=>callback=fn,signOut:async()=>{auth=null;callback('SIGNED_OUT',null);return{error:null};}}};
 const window={FAINTR_CONFIG:{supabaseUrl:'https://synthetic.invalid',supabaseAnonKey:'synthetic'},FAINTR_STORAGE_PATCHES:patches,supabase:{createClient:()=>sb}};
 vm.runInNewContext(fs.readFileSync('web/bridge.js','utf8'),{window,Worker,URL,location:{origin:'https://synthetic.invalid'},localStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)},setTimeout,fetch:async()=>({ok:true,json:async()=>({files:{'core.js':'core.js'}})})});await window.FAINTR_BRIDGE.ready;
 async function storage(op,...args){const w=workers.at(-1),id=++seq;w.onmessage({data:{type:'storage',id,op,args}});for(let i=0;i<100;i++){await tick();const reply=w.sent.find(x=>x.type==='storage-reply'&&x.id===id);if(reply){if(reply.error)throw Error(reply.error);return clone(reply.result);}}throw Error('Synthetic operation did not complete');}
 return{api:window.FAINTR_BRIDGE,cache,storage,expire:()=>expired=true,renew:()=>expired=false};
}
test('two synthetic devices sync 2,000 roster entries and stay isolated from another account',async()=>{
 const db=database(),a=await device(db,'a'),b=await device(db,'a'),other=await device(db,'b');
 await a.storage('rosterInsertMany',Array.from({length:2000},(_,i)=>entry(i)));
 const list=await b.api.api('/api/roster');assert.equal(list.length,2000);assert.equal(list[1999].uid,'synthetic-1999');
 assert.equal((await other.api.api('/api/roster')).length,0);assert.equal(db.docs.get('a').roster.length,2000);
 await assert.rejects(a.storage('rosterInsertMany',[entry(2000)]),/room/);assert.equal(db.docs.get('a').roster.length,2000);
 const reopened=await device(db,'a',a.cache);assert.equal((await reopened.api.api('/api/roster')).length,2000);
 await a.api.auth.signOut();assert(!a.cache.has('faintr.cloud.a'));assert.equal(db.docs.get('a').roster.length,2000);
});
test('simultaneous distinct imports from two devices preserve both batches',async()=>{
 const db=database(),a=await device(db,'a'),b=await device(db,'a');
 await a.storage('rosterAll');await b.storage('rosterAll');
 await Promise.all([a.storage('rosterInsertMany',Array.from({length:75},(_,i)=>entry(i))),b.storage('rosterInsertMany',Array.from({length:75},(_,i)=>entry(i+75)))]);
 assert.equal(db.docs.get('a').roster.length,150);assert.equal(new Set(db.docs.get('a').roster.map(e=>e.uid)).size,150);
});
test('expired sessions and interrupted saves preserve data and allow an explicit retry',async()=>{
 const db=database(),a=await device(db,'a');await a.storage('rosterInsertMany',[entry(1)]);a.expire();
 await assert.rejects(a.storage('rosterInsertMany',[entry(2)]),/expired/);assert.equal(db.docs.get('a').roster.length,1);
 a.renew();await a.storage('rosterInsertMany',[entry(2)]);db.failNext='Synthetic connection lost';
 await assert.rejects(a.storage('rosterInsertMany',[entry(3)]),/connection lost/);assert.equal(db.docs.get('a').roster.length,2);
 await a.storage('rosterInsertMany',[entry(3)]);assert.equal(db.docs.get('a').roster.length,3);
});
test('lost acknowledgement after a committed import retries once without duplicating or overwriting',async()=>{
 const db=database(),a=await device(db,'a');await a.storage('rosterAll');db.loseAck=true;
 await assert.rejects(a.storage('rosterInsertMany',[entry(1)]),/lost acknowledgement/);
 db.docs.get('a').roster[0].notes='Later edit';db.docs.get('a').version++;
 await a.storage('rosterInsertMany',[entry(1)]);assert.equal(db.docs.get('a').roster.length,1);assert.equal(db.docs.get('a').roster[0].notes,'Later edit');
});
test('repeated conflicts stop with a recoverable error and never overwrite the other device',async()=>{
 const db=database(),a=await device(db,'a');await a.storage('rosterInsertMany',[entry(1)]);db.conflict=true;
 await assert.rejects(a.storage('rosterInsertMany',[entry(2)]),/changed|busy|devices|again/i);assert.equal(db.docs.get('a').roster.length,1);
 db.conflict=false;await a.storage('rosterInsertMany',[entry(2)]);assert.equal(db.docs.get('a').roster.length,2);
});
