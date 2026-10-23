// Read-only checks; never prints keys, response bodies, account rows or credentials.
const fs=require('node:fs');
async function get(url,init={}){return fetch(url,{...init,signal:AbortSignal.timeout(20000)});}
(async()=>{
 const results=[];
 for(const path of ['/','/privacy/','/s/zC9jVirGciHF']){
  const r=await get('https://faintr.com'+path),html=await r.text();
  results.push({path,status:r.status,headers:Object.fromEntries([...r.headers].filter(([k])=>['content-security-policy','x-frame-options','x-content-type-options','referrer-policy','strict-transport-security','permissions-policy','cache-control'].includes(k))),analyticsScripts:[...html.matchAll(/<script[^>]*src=["']([^"']+)/g)].map(m=>m[1]).filter(x=>/insights|analytics|tagmanager|plausible/i.test(x))});
 }
 const config=await (await get('https://faintr.com/static/config.js')).text();
 let cfg;
 try{cfg=JSON.parse(config.match(/\{[^{}]*"supabaseUrl"[^{}]*\}/)?.[0]||'{}');}catch(_){throw Error('Could not parse public configuration');}
 results.push({configuredAccounts:!!(cfg.supabaseUrl&&cfg.supabaseAnonKey)});
 if(cfg.supabaseUrl&&cfg.supabaseAnonKey){
  const headers={apikey:cfg.supabaseAnonKey,Authorization:'Bearer '+cfg.supabaseAnonKey};
  // limit=0 proves route permission checks without requesting customer data.
  for(const table of ['user_storage','profiles','billing_customers','billing_purchases','bug_reports']){
   const r=await get(cfg.supabaseUrl+'/rest/v1/'+table+'?select=*&limit=0',{headers});await r.arrayBuffer();
   results.push({anonymousZeroRowRead:table,status:r.status});
  }
  // Auth probe cannot dispatch work without a valid authenticated administrator.
  const r=await get(cfg.supabaseUrl+'/functions/v1/trigger-update',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action:'status'})});await r.arrayBuffer();
  results.push({anonymousAdminStatus:r.status});
 }
 const result={checkedAt:new Date().toISOString(),limits:'No authenticated account isolation test; zero-row requests do not establish row-level isolation. No writes or account data accessed.',results};
 if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error('Live read-only check unavailable: '+e.message);process.exitCode=1;});
