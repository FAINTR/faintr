const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
// Exercise the actual workflow script without GitHub calls or public test issues.
const yaml=fs.readFileSync('.github/workflows/operations-alerts.yml','utf8').replace(/\r\n/g,'\n');
const script=yaml.split('          script: |\n')[1].split('\n').map(s=>s.replace(/^            /,'')).join('\n');
const execute=new (Object.getPrototypeOf(async function(){}).constructor)('github','context',script);
async function simulate({conclusion='failure',existing=false,realRun=true,newer=false}={}) {
  const calls=[];
  const api=new Proxy({}, {get:(_,key)=>key});
  const github={rest:{actions:{listJobsForWorkflowRun:'jobs',listWorkflowRuns:async()=>({data:{workflow_runs:newer?[{run_number:9,status:'completed',conclusion:'success'}]:[]}})},issues:api},
    paginate:async(method)=>method==='jobs' ? [{steps:[{name:'Publish to Cloudflare Pages',conclusion:realRun?'success':'skipped'}]}] : existing?[{number:7,body:'<!-- faintr-operations:123 -->'}]:[]};
  for(const name of ['create','update','createComment'])github.rest.issues={...github.rest.issues,[name]:async value=>{calls.push({name,...value});}};
  await execute(github,{repo:{owner:'FAINTR',repo:'faintr'},payload:{workflow_run:{id:1,workflow_id:123,run_number:2,name:'FAINTR site update',html_url:'https://github.com/FAINTR/faintr/actions/runs/1',conclusion}}});
  return calls;
}
test('failure creates an assigned issue with a run link',async()=>{
  const calls=await simulate(); assert.equal(calls[0].name,'create');
  assert.deepEqual(calls[0].assignees,['FAINTR']); assert.match(calls[0].body,/actions\/runs\/1/);
});
test('repeated failures update one existing issue',async()=>{
  const calls=await simulate({existing:true}); assert.equal(calls.length,1); assert.equal(calls[0].name,'update'); assert.equal(calls[0].issue_number,7);
});
test('successful real run closes the issue with a recovery link',async()=>{
  const calls=await simulate({conclusion:'success',existing:true}); assert.equal(calls[0].name,'createComment'); assert.equal(calls[1].state,'closed');
});
test('unused DST schedule does not falsely mark recovery',async()=>{
  assert.deepEqual(await simulate({conclusion:'success',existing:true,realRun:false}),[]);
});
test('old completion cannot replace a newer result',async()=>{
  assert.deepEqual(await simulate({existing:true,newer:true}),[]);
});
test('cancellation does not create an alert',async()=>{
  assert.deepEqual(await simulate({conclusion:'cancelled'}),[]);
});
