// Public GET-only verification; isolated browsers never access real accounts.
const {chromium,webkit,expect}=require('@playwright/test');
const fs=require('node:fs'),assert=require('node:assert/strict');
const rotation=require('./rotation-schedule.cjs'),{periodAt}=require('../formats');
const base='https://faintr.com',normal=s=>s.replace(/\r\n/g,'\n');
(async()=>{
 const manifest=await(await fetch(base+'/manifest.json')).json();
 assert.equal(manifest.schedule.sync?.status,'verified');
 assert.match(manifest.schedule.source,/^https:\/\/pokemongo\.com\/.*go-battle-league-/);
 const next=rotation.nextPeriod(manifest.schedule);assert(next,'No upcoming official rotation');
 for(const [key] of next.formats){
  const ready=manifest.formats.find(f=>f.key===key);
  if(ready)assert(ready.built,'Upcoming format has not been prepared: '+key);
  else assert(manifest.pendingFormats.some(f=>f.key===key&&f.unavailable),'Missing pending menu entry: '+key);
 }
 // Verify before/after semantics at each current season boundary using real
 // published format definitions. Missing upstream cups remain explicitly pending.
 for(const p of manifest.schedule.periods){
  const after=periodAt(manifest.schedule,manifest.formats,Date.parse(p.start)+1).now;
  const known=p.formats.filter(([key])=>manifest.formats.some(f=>f.key===key));
  if(known.length)assert.equal(after.start,Date.parse(p.start));
 }
 const html=await(await fetch(base)).text();
 const asset=[...html.matchAll(/src="([^"]+)"/g)].map(m=>m[1]).find(p=>p.split('?')[0]==='/static/app.js');assert(asset);
 assert.equal(normal(await(await fetch(base+asset)).text()),normal(fs.readFileSync('ui/app.js','utf8')),'Live app source differs from reviewed source');
 const results=[];
 for(const [browserName,type,width] of [['chromium',chromium,1440],['chromium',chromium,320],['chromium',chromium,375],['chromium',chromium,430],['webkit',webkit,375]]){
  const browser=await type.launch({headless:true});
  try{
   const context=await browser.newContext({viewport:{width,height:900}});
   await context.route('**/*',r=>new URL(r.request().url()).origin===base&&['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
   await context.route('**/config.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.FAINTR_CONFIG={};'}));
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
   await expect(page.locator('#teams .team').first()).toBeVisible({timeout:120000});
   for(const pending of manifest.pendingFormats){const option=page.locator(`#cupSel option[value="${pending.key}"]`);await expect(option).toBeDisabled();await expect(option).toContainText('awaiting PvPoke data');}
   if(manifest.pendingFormats.length)await expect(page.locator('#rotationStatus')).toBeVisible();
   await expect(page.locator('#teams .team').first().locator('.tile')).toHaveCount(10);
   const size=await page.evaluate(()=>({width:document.documentElement.clientWidth,content:document.documentElement.scrollWidth}));assert(size.content<=size.width+1);assert.deepEqual(errors,[]);
   results.push({browser:browserName,width,pendingMenuVerified:true,tenBadges:true,noOverflow:true,pageErrors:errors});
  }finally{await browser.close();}
 }
 const result={checkedAt:new Date().toISOString(),build:manifest.built,scheduleSync:manifest.schedule.sync,source:manifest.schedule.source,next,pending:manifest.pendingFormats,results,limits:'Public source/manifest and isolated browser checks only. Scheduled GitHub jobs may be delayed; unknown upstream cup rules are not invented.'};
 fs.writeFileSync('../output/live-rotations.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
