// Synthetic local-only roster benchmark. No account, analytics or outside requests.
const {chromium,expect}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const {makeCtx}=require('../build');
const root=path.resolve('site'),output=path.resolve(process.argv[2]||'../output/roster-measurement.json');
const source=fs.existsSync('.webcache/src/js/GameMaster.js')?'.webcache/src':'assets/pvpoke-src';
const ctx=makeCtx(source),evaluation=vm.runInContext('rosterEval("azumarill",{atk:0,def:15,hp:15},1498,50)',ctx);
const fixture=i=>({uid:'stress-'+i,id:'azumarill',name:'Azumarill',nickname:'Synthetic '+String(i).padStart(4,'0'),notes:'Local benchmark only',types:['water','fairy'],dex:184,ivs:{atk:0,def:15,hp:15},cp:1498,levelCap:50,leagues:[1500],moveset:['BUBBLE','ICE_BEAM','PLAY_ROUGH'],moveNames:['Bubble','Ice Beam','Play Rough'],ball:'poke',added:'2026-10-23',eval:evaluation});
const types={'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 let file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep)&&file!==root)return res.writeHead(403).end();
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(resolve=>server.listen(4182,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true}),results=[];
 try{
  for(const profile of ['desktop','phone-4x-cpu'])for(const size of [500,2000]){
   const context=await browser.newContext({viewport:profile==='desktop'?{width:1440,height:1000}:{width:375,height:812}});
   await context.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:4182'?r.continue():r.abort());
   await context.route('**/config.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.FAINTR_CONFIG={};'}));
   await context.addInitScript(roster=>localStorage.setItem('faintr.web.roster',JSON.stringify(roster)),Array.from({length:size},(_,i)=>fixture(i)));
   const page=await context.newPage(),cdp=await context.newCDPSession(page),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await cdp.send('Performance.enable');
   if(profile!=='desktop')await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
   await page.goto('http://127.0.0.1:4182/');await page.locator('#teams .team').first().waitFor({timeout:120000});
   const paint=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now())))));
   const start=await page.evaluate(()=>performance.now());await page.getByRole('tab',{name:'Roster',exact:true}).click();
   await page.locator('#rGrid [data-uid]').first().waitFor({timeout:120000});
   const rosterReadyMs=Math.round(await paint()-start),cards=await page.locator('#rGrid [data-uid]').count();
   const domNodes=await page.locator('*').count();
   const searchStart=await page.evaluate(()=>performance.now());await page.locator('#rSearch').fill('Synthetic '+String(size-1).padStart(4,'0'));
   await expect(page.locator('#rGrid [data-uid]')).toHaveCount(1,{timeout:120000});
   const searchMs=Math.round(await paint()-searchStart);
   const clearStart=await page.evaluate(()=>performance.now());await page.locator('#rSearch').fill('');
   await expect(page.locator('#rGrid [data-uid]')).toHaveCount(cards,{timeout:120000});
   const clearSearchMs=Math.round(await paint()-clearStart);
   const metrics=await cdp.send('Performance.getMetrics');
   const heap=metrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value||null;
   const row={profile,entries:size,rosterReadyMs,searchMs,clearSearchMs,renderedCards:cards,documentNodes:domNodes,mainThreadHeapBytes:heap,errors};
   results.push(row);console.log(JSON.stringify(row));await context.close();
  }
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({measuredAt:new Date().toISOString(),method:'One local sample per condition. Synthetic duplicate species, actual cached IV evaluation, no outside traffic. Phone viewport 375x812, 4x CPU; desktop 1440x1000. Action-to-two-animation-frames timings include automation and local storage refresh, not field INP or whole-process/worker memory.',results},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>server.close());
