// Read-only production check; no accounts, rosters or email requests.
const {chromium,webkit,expect}=require('@playwright/test'),fs=require('node:fs'),assert=require('node:assert/strict');
const {periodAt}=require('../formats'),base='https://faintr.com';
(async()=>{
 const manifest=await(await fetch(base+'/manifest.json')).json();
 const metadata=await(await fetch(base+'/'+manifest.files['formats/all-1500/teams.json'])).json();
 assert.equal(metadata.cands.length,250);assert(metadata.cands.some(p=>p.id==='ursaluna'));
 const sizes=Object.fromEntries(Object.entries(manifest.sizes).filter(([key])=>key.startsWith('formats/all-1500/')));
 for(const bytes of Object.values(sizes))assert(bytes<=25*1048576);
 const html=await(await fetch(base)).text(),asset=[...html.matchAll(/src="([^"]+)"/g)].map(m=>m[1]).find(p=>p.split('?')[0]==='/static/app.js');
 assert(asset);assert.equal((await(await fetch(base+asset)).text()).replace(/\r\n/g,'\n'),fs.readFileSync('ui/app.js','utf8').replace(/\r\n/g,'\n'));
 const period=periodAt(manifest.schedule,manifest.formats).now,results=[];
 for(const [name,type,width] of [['chromium',chromium,1440],['chromium',chromium,320],['webkit',webkit,375]]){
  const browser=await type.launch({headless:true});
  try{
   const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<500,isMobile:width<500});
   await context.route('**/*',r=>new URL(r.request().url()).origin===base&&['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
   await context.route('**/config.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.FAINTR_CONFIG={};'}));
   await context.addInitScript(period=>{localStorage.setItem('faintr.format','all-1500');localStorage.setItem('faintr.period',period);},period?String(period.start):'none');
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
   await expect(page.locator('#teams .team').first()).toBeVisible({timeout:120000});await expect(page.locator('#findLede')).toContainText('top 250');
   if(await page.locator('#filterToggle').isVisible())await page.locator('#filterToggle').click();
   const input=page.locator('#pk-include input');await input.fill('Ursaluna');const option=page.locator('#pk-include').getByRole('option',{name:/^Ursaluna/}).first();await expect(option).toBeVisible();
   if(width<500)await option.tap();else await option.click();
   await expect(page.locator('#chips-include')).toContainText('Ursaluna');await expect(page.locator('#teams .team').first()).toContainText('Ursaluna');
   await page.getByRole('tab',{name:'Team Grader',exact:true}).click();const first=page.locator('#slots .slot').first();
   await first.locator('input[role="combobox"]').fill('63');await expect(first.getByRole('option',{name:/^Abra/}).first()).toBeVisible();
   await page.locator('nav.tabs [data-view="battle"]').click();await page.locator('#battleMode [data-m="counters"]').click();
   await page.locator('#pk-opp input').fill('Abra');const low=page.locator('#pk-opp').getByRole('option',{name:/^Abra/}).first();
   if(width<500)await low.tap();else await low.click();await page.locator('#cfBtn').click();
   await expect(page.locator('#cfResult table')).toBeVisible({timeout:60000});await expect(page.locator('#cfResult')).toContainText('Abra');
   await page.getByRole('tab',{name:'Team Grader',exact:true}).click();
   const fantasy=page.locator('#leagueSeg [data-f="fantasy-1500"]');if(await fantasy.isVisible())await fantasy.click();else await page.locator('#cupSel').selectOption('fantasy-1500');
   await expect(first.locator('input[role="combobox"]')).toHaveAttribute('placeholder','Search Fantasy Cup Pokémon');
   await first.locator('input[role="combobox"]').fill('Ursaluna');await expect(first.locator('.nomatch')).toContainText('only Dragon, Steel or Fairy');
   const dims=await page.evaluate(()=>({w:document.documentElement.clientWidth,s:document.documentElement.scrollWidth}));assert(dims.s<=dims.w+1);assert.deepEqual(errors,[]);
   results.push({browser:name,width,ursalunaInRankedTeams:true,lowStatNumericSearch:true,lowStatCounters:true,fantasyRulesPreserved:true,noOverflow:true,pageErrors:errors});
  }finally{await browser.close();}
 }
 const result={checkedAt:new Date().toISOString(),candidates:metadata.cands.length,teams:metadata.nTeams,downloadBytes:sizes,results};
 fs.writeFileSync('../output/live-pokemon-selection.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
