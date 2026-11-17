const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('ui/app.js','utf8');
function harness(){
 const elements=new Map();
 const element=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',hidden:false,classList:{contains:()=>false}});return elements.get(key)};
 const pending=[];
 const context={S:{f:'laic',fmt:{title:'LAIC'},include:[],exclude:[],limit:50},store:{set(){}},qSeq:0,qTimer:null,
 clearTimeout(){},$:element,CF:{opp:[]},slots:[],bs:[],lastReport:null,META:null,
 title:()=>context.S.fmt.title,renderFormatBar(){},renderChips(){},ownedNote(){},renderRoster(){},catalogById:()=>new Map(),loadMeta(){},
 api:(url)=>new Promise((resolve,reject)=>pending.push({url,resolve,reject})),runQuery(){context.queries=(context.queries||0)+1}};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('let formatSeq ='),source.indexOf('// First-time setup for a cup')),context);
 return {context,pending,element};
}
test('rapid cup changes commit only the newest format, including switching back',async()=>{
 const {context:c,pending:p,element}=harness();
 const little=c.setFormat('little');
 const laic=c.setFormat('laic');
 assert.equal(c.S.visibleTeams.length,0);
 assert.equal(element('#moreBtn').hidden,true);
 assert(p[0].url.includes('f=little'));
 p[1].resolve({title:'LAIC',catalog:[]});await laic;
 p[0].resolve({title:'Little Cup',catalog:[]});await little;
 assert.equal(c.S.f,'laic');assert.equal(c.S.fmt.title,'LAIC');assert.equal(c.queries,1);assert.equal(c.qSeq,2);
});
test('a rejected older format cannot replace the current league with an error',async()=>{
 const {context:c,pending:p,element}=harness();
 const first=c.setFormat('little'),second=c.setFormat('laic');
 p[1].resolve({title:'LAIC',catalog:[]});await second;
 p[0].reject(Error('older request failed'));await first;
 assert.equal(c.S.fmt.title,'LAIC');assert.equal(element('#matched').textContent,'');
});
test('an older team-query failure cannot change the newly selected format',async()=>{
 const {context:c,pending:p,element}=harness();
 c.syncFilterCount=()=>{};c.ownedList=()=>null;c.S.fmt={built:true,pool:[]};c.S.weights={};c.S.maxShadow='';c.renderTeams=()=>{};
 vm.runInContext(source.slice(source.indexOf('async function runQuery()'),source.indexOf('function renderTeams(')),c);
 const query=c.runQuery();c.qSeq++;
 p[0].reject(Object.assign(Error('old cup failure'),{needsBuild:true}));await query;
 assert.equal(c.S.fmt.built,true);assert.equal(element('#matched').textContent,'Searching…');
});
