// Bounded, synthetic local-browser soak. Never signs in or contacts production.
const {chromium,expect}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path');
const {previewServer}=require('./preview-site.cjs');
const output=path.resolve(process.argv[2]||'../output/session-stability.json'),cycles=Number(process.argv[3]||30);
if(!Number.isInteger(cycles)||cycles<1||cycles>100)throw Error('Use 1 to 100 cycles.');
const manifest=JSON.parse(fs.readFileSync('site/manifest.json')),formats=manifest.formats.filter(f=>f.built),server=previewServer(4183);
const members=[{id:'azumarill',moveset:['BUBBLE','ICE_BEAM','PLAY_ROUGH'],ivs:{atk:0,def:15,hp:15},levelCap:50},{id:'clodsire',moveset:['POISON_STING','EARTHQUAKE','STONE_EDGE'],ivs:{atk:1,def:14,hp:15},levelCap:50},{id:'mandibuzz',moveset:['SNARL','DARK_PULSE','AERIAL_ACE'],ivs:{atk:0,def:13,hp:15},levelCap:51}];
(async()=>{
 const browser=await chromium.launch({headless:true}),results=[];
 try{
  for(const profile of ['desktop','phone-4x-cpu']){
   const context=await browser.newContext({viewport:profile==='desktop'?{width:1440,height:1000}:{width:375,height:812}});
   await context.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:4183'?r.continue():r.abort());
   await context.route('**/config.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.FAINTR_CONFIG={};'}));
   const page=await context.newPage(),cdp=await context.newCDPSession(page),errors=[],samples=[];let requests=0;
   page.on('pageerror',e=>errors.push(e.message));page.on('request',()=>requests++);await cdp.send('Performance.enable');
   if(profile!=='desktop')await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
   await page.goto('http://127.0.0.1:4183/');await page.locator('#teams .team').first().waitFor({timeout:120000});
   const start=Date.now();let grades=0,battles=0;
   for(let cycle=0;cycle<cycles;cycle++){
    for(const format of formats){
     const button=page.locator('#leagueSeg button[data-f="'+format.key+'"]');
     if(await button.count())await button.click();else await page.locator('#cupSel').selectOption(format.key);
     await expect(page.locator('#matched')).toContainText(format.title);
     await expect.poll(async()=>Number(await page.locator('#teams .team .score b').first().innerText()),{timeout:60000}).toBeGreaterThan(0);
    }
    if(cycle%5===0){
     // Real web-worker APIs with fixed public game inputs; no user storage writes.
     const result=await page.evaluate(async members=>{
      const bridge=window.FAINTR_BRIDGE;
      const report=await bridge.api('/api/report',{f:'all-1500',members});
      const battle=await bridge.api('/api/battle',{f:'all-1500',a:members[0],b:members[1],shieldsA:1,shieldsB:1});
      return {score:report.composite,hp:[battle.hpA,battle.hpB],winner:battle.winner};
     },members);
     expect(result.score).toBeGreaterThan(0);expect(result.hp.every(x=>x>=0)).toBe(true);expect([-1,0,1]).toContain(result.winner);grades++;battles++;
     await cdp.send('HeapProfiler.collectGarbage');const metrics=await cdp.send('Performance.getMetrics');
     samples.push({cycle:cycle+1,mainThreadHeapBytes:metrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value,observedWorkers:page.workers().length,requests});
     console.log(JSON.stringify({profile,cycle:cycle+1,...samples.at(-1)}));
    }
   }
   expect(errors).toEqual([]);results.push({profile,cycles,formatChanges:formats.length*cycles,grades,battles,durationMs:Date.now()-start,samples,errors});await context.close();
  }
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({measuredAt:new Date().toISOString(),method:'One continuous page per profile, no reloads. Local synthetic public battle/grade inputs. Chromium desktop and 375px phone with 4x CPU. Forced GC before main-thread heap samples. Worker/process memory, hours-long use, real phones, account JWTs and network drop recovery are not measured.',results},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>server.close());
