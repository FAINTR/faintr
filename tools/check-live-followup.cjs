// Read-only production smoke checks. Isolated browsers, synthetic local roster,
// account configuration replaced only in each test context, all non-GET traffic blocked.
const {chromium,webkit,expect}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base='https://faintr.com',output=path.resolve(process.argv[2]||'../output/live-followup.json');
const normal=s=>s.replace(/\r\n/g,'\n');
async function get(p){const r=await fetch(base+p,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Public resource unavailable: '+p+' ('+r.status+')');return r;}
(async()=>{
 const manifest=await (await get('/manifest.json')).json();assert.equal(manifest.premium,false);
 const html=await (await get('/')).text();
 const asset=file=>{const found=[...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(m=>m[1].replaceAll('&amp;','&')).find(p=>p.split('?')[0]==='/static/'+file);assert(found,'Published page is missing '+file);return found;};
 const config=await (await get(asset('config.js'))).text();assert(/"analyticsEnabled"\s*:\s*false/.test(config),'Optional analytics must remain disabled');
 for(const file of ['app.js','app.css'])assert(normal(await (await get(asset(file))).text())===normal(fs.readFileSync('ui/'+file,'utf8')),'Live '+file+' differs from reviewed local source');
 const provenance=await (await get('/source-provenance.json')).json();
 assert(provenance.faintrEngine.compatibilityRules.some(rule=>rule.includes('Morpeko')));
 const results=[];
 for(const profile of [{browser:'chromium',width:1440},{browser:'chromium',width:320},{browser:'chromium',width:375},{browser:'chromium',width:430},{browser:'webkit',width:375}]){
  const browser=await (profile.browser==='webkit'?webkit:chromium).launch({headless:true});
  try{
   const context=await browser.newContext({viewport:{width:profile.width,height:932},colorScheme:'dark'});
   await context.route('**/*',route=>{const request=route.request();return new URL(request.url()).origin===base&&['GET','HEAD'].includes(request.method())?route.continue():route.abort();});
   await context.route('**/config.js*',route=>route.fulfill({contentType:'text/javascript',body:'window.FAINTR_CONFIG={};'}));
   await context.addInitScript(()=>{
    localStorage.setItem('faintr.theme','dark');
    localStorage.setItem('faintr.web.roster',JSON.stringify(Array.from({length:51},(_,i)=>({uid:'live-smoke-'+i,id:'azumarill',name:'Azumarill',nickname:'Synthetic '+String(i).padStart(4,'0')+' long roster name',types:['water','fairy'],dex:184,cp:1498,ivs:{atk:0,def:15,hp:15},levelCap:50,leagues:[1500],moveset:['BUBBLE','ICE_BEAM','PLAY_ROUGH'],eval:{v:2,leagues:[{cp:1500,level:45,maxCp:1498,rank:20,count:4096,pctOfBest:99,status:'ready'}]}}))));
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   const fits=async()=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
   const unclipped=locator=>locator.evaluateAll(elements=>elements.every(e=>e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1));
   await page.goto(base+'/');await expect(page.locator('#teams .team').first()).toBeVisible({timeout:120000});
   const team=page.locator('#teams .team').first();expect(await team.locator('.tile').count()).toBe(10);
   expect(Number(await team.locator('.score b').innerText())).toBeGreaterThan(0);await fits();
   await page.getByRole('tab',{name:'Roster',exact:true}).click();await expect(page.locator('#rGrid [data-uid]')).toHaveCount(50);
   expect(await unclipped(page.locator('#rGrid .rname h4'))).toBe(true);expect(await unclipped(page.locator('#rGrid .rmoves'))).toBe(true);await fits();
   if([320,1440].includes(profile.width)){
    if(profile.width===320)await page.locator('#rPager').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.resolve('../output/live-roster-'+profile.width+'.png')});
   }
   await page.locator('#rPager').getByRole('button',{name:'Next',exact:true}).click();await expect(page.locator('#rGrid [data-uid]')).toHaveCount(1);
   await page.locator('#rSearch').fill('Synthetic 0050');await expect(page.locator('#rGrid')).toContainText('Synthetic 0050 long roster name');
   await expect(page.locator('#rPager')).toBeHidden();
   await page.goto(base+'/s/zC9jVirGciHF');await expect(page.locator('#sharedTeamNote')).toBeVisible({timeout:120000});await fits();
   await page.locator('#gradeBtn').click();await expect(page.locator('#gradeResult article')).toBeVisible({timeout:120000});await fits();
   const types=await page.evaluate(async()=>{
    const r=await window.FAINTR_BRIDGE.api('/api/battle',{f:'all-1500',a:{id:'morpeko_full_belly',moveset:['THUNDER_SHOCK','AURA_WHEEL_ELECTRIC'],ivs:{atk:0,def:15,hp:15},levelCap:50},b:{id:'registeel',moveset:['LOCK_ON','FOCUS_BLAST','ZAP_CANNON']},shieldsA:2,shieldsB:2,energyA:100});
    return r.timeline.filter(e=>e.actor===0&&e.type.startsWith('charged')).map(e=>e.type.split(' ')[1]);
   });
   expect(types.slice(0,3)).toEqual(['electric','dark','electric']);
   const invalid=await page.goto(base+'/share/not-a-team');expect(invalid.status()).toBe(400);
   await expect(page.getByRole('heading',{name:"This team link couldn't open"})).toBeVisible();await fits();
   await page.getByRole('link',{name:'Browse current teams'}).click();await expect(page.locator('#teams .team').first()).toBeVisible({timeout:120000});
   expect(errors).toEqual([]);const result={...profile,tenVisibleGrades:true,rosterPagingAndNames:true,sharedTeamRestoredAndGraded:true,morpekoChargedTypes:types,errorPageAndHomeRecovery:true,pageErrors:errors};results.push(result);console.log(JSON.stringify(result));
  }finally{await browser.close();}
 }
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({checkedAt:new Date().toISOString(),built:manifest.built,pvpoke:manifest.pvpoke,reviewedSourceMatches:true,freeAccess:true,optionalAnalytics:false,method:'Production GET/HEAD only. Isolated test browsers with account services disabled and synthetic browser-local roster. No customer data or real-device/account JWT verification.',results},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
