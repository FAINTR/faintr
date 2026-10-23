const {test}=require('node:test'),assert=require('node:assert/strict'),{create,VERSION}=require('../ui/analytics');
function fixture(enabled=true){const values=new Map(),sent=[];let now=1000000000000,id=0,gpc=false,reads=0;
 const tracker=create({enabled,storage:{getItem:k=>{reads++;return values.get(k)||null;},setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},now:()=>now,uuid:()=>`00000000-0000-4000-8000-${String(++id).padStart(12,'0')}`,gpc:()=>gpc,dnt:()=>false,send:body=>{sent.push(body);}});
 return {tracker,values,sent,get reads(){return reads;},advance:ms=>now+=ms,block:()=>gpc=true};
}
test('disabled analytics performs no storage reads, writes or transmissions',()=>{
 const f=fixture(false);f.tracker.page('grade');f.tracker.track('grade_completed','grade');assert.equal(f.reads,0);assert.equal(f.values.size,0);assert.equal(f.sent.length,0);
});
test('no optional identifier exists before affirmative consent, and withdrawal removes it',()=>{
 const f=fixture();f.tracker.page('find');assert.equal(f.values.size,0);assert.equal(f.sent.length,0);
 f.tracker.consent(true);assert.equal(f.sent.length,1);assert(f.values.has('faintr.analytics.visitor'));
 f.tracker.consent(false);f.tracker.track('grade_completed','grade');assert.equal(f.sent.length,1);assert.equal(f.values.size,1);assert(!f.values.has('faintr.analytics.visitor'));
});
test('session/source remain stable until inactivity; return flag and browser ID expire as documented',()=>{
 const f=fixture();f.tracker.acquisition('https://discord.com/channels/private?secret=x','');f.tracker.consent(true);
 const first=f.sent[0];assert.equal(first.source,'discord');assert.equal(first.returning,false);
 f.tracker.acquisition('https://faintr.com/?private=x','');f.tracker.page('grade');assert.equal(f.sent[1].source,'discord');assert.equal(f.sent[1].session,first.session);
 f.advance(31*60000);f.tracker.track('grade_completed','grade');assert.equal(f.sent[2].returning,true);assert.equal(f.sent[2].visitor,first.visitor);assert.notEqual(f.sent[2].session,first.session);
 f.advance(31*86400000);f.tracker.track('iv_completed','ivs');assert.notEqual(f.sent[3].visitor,first.visitor);assert.equal(f.sent[3].returning,false);
});
test('privacy signals and expired consent suppress optional events',()=>{
 const f=fixture();f.tracker.consent(true);f.block();f.tracker.track('grade_completed','grade');assert.equal(f.sent.length,1);
 const e=fixture();e.tracker.consent(true);e.advance(181*86400000);e.tracker.page('grade');assert.equal(e.sent.length,1);
});
test('event and tool allowlists reject arbitrary text and payloads contain no URLs or game/account fields',()=>{
 const f=fixture();f.tracker.acquisition('https://example.invalid/private-email-and-roster','?utm_source=private-email');f.tracker.consent(true);
 f.tracker.track('trainer@example.invalid','grade');f.tracker.track('grade_completed','pikachu');assert.equal(f.sent.length,1);
 const event=f.sent[0];assert.equal(event.source,'referral');assert.equal(event.consent,VERSION);
 assert.deepEqual(Object.keys(event).sort(),['id','event','tool','source','visitor','session','returning','consent'].sort());
 assert(!JSON.stringify(event).includes('example.invalid'));
});
test('unavailable browser storage safely disables counting',()=>{
 const sent=[];const t=create({enabled:true,storage:{getItem(){throw Error();},setItem(){throw Error();},removeItem(){}},now:()=>1,uuid:()=>'',gpc:()=>false,dnt:()=>false,send:e=>sent.push(e)});
 assert.doesNotThrow(()=>t.consent(true));assert.equal(sent.length,0);
});

const fs=require('node:fs'),{createRequire}=require('node:module'),path=require('node:path');
const compiled=require('esbuild').transformSync(fs.readFileSync('web/analytics-endpoint.js','utf8'),{format:'cjs',target:'node22'}).code;
const endpointModule={exports:{}};new Function('require','module','exports',compiled)(createRequire(path.resolve('web/analytics-endpoint.js')),endpointModule,endpointModule.exports);
const {cleanEvent,analyticsEndpoint}=endpointModule.exports;
const event={id:'00000000-0000-4000-8000-000000000001',visitor:'00000000-0000-4000-8000-000000000002',session:'00000000-0000-4000-8000-000000000003',event:'grade_completed',tool:'grade',source:'direct',returning:false,consent:VERSION};
test('collector reconstructs only allowed fields and rejects arbitrary event data',()=>{
 assert.deepEqual(cleanEvent({...event,email:'sensitive',roster:['sensitive']}),event);
 assert.throws(()=>cleanEvent({...event,tool:'private roster contents'}));assert.throws(()=>cleanEvent({...event,visitor:'account-id'}));
});
test('collector stays disabled, requires same-origin JSON and bounds body size',async()=>{
 const metadata={analyticsEnabled:true,supabaseUrl:'https://example.invalid',supabaseAnonKey:'public-test-placeholder'},env={FAINTR_ANALYTICS_ENABLED:'true',FAINTR_ANALYTICS_WRITE_KEY:'synthetic-local-test-value'};
 const request=(body,origin='https://faintr.test')=>new Request('https://faintr.test/a/event',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body});
 assert.equal((await analyticsEndpoint(request('{}'),{},metadata)).status,404);
 assert.equal((await analyticsEndpoint(request('{}','https://other.invalid'),env,metadata)).status,403);
 assert.equal((await analyticsEndpoint(request(' '.repeat(1025)),env,metadata)).status,413);
 assert.equal((await analyticsEndpoint(request('{}'),env,metadata)).status,400);
});
test('collector hashes browser and session identifiers before storage and omits request metadata',async()=>{
 const previous=global.fetch;let stored;
 global.fetch=async(url,init)=>{stored=JSON.parse(init.body);return new Response(null,{status:204});};
 try{
  const req=new Request('https://faintr.test/a/event',{method:'POST',headers:{Origin:'https://faintr.test','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(event)});
  const response=await analyticsEndpoint(req,{FAINTR_ANALYTICS_ENABLED:'true',FAINTR_ANALYTICS_WRITE_KEY:'synthetic-local-test-value'},{analyticsEnabled:true,supabaseUrl:'https://example.invalid',supabaseAnonKey:'public-test-placeholder'});
  assert.equal(response.status,204);assert.match(stored.p_event.visitor,/^[a-f0-9]{64}$/);assert.match(stored.p_event.session,/^[a-f0-9]{64}$/);assert.match(stored.p_rate_key,/^[a-f0-9]{64}$/);
  assert(!JSON.stringify(stored).includes('192.0.2.1'));assert(!JSON.stringify(stored).includes(event.visitor));
 }finally{global.fetch=previous;}
});
