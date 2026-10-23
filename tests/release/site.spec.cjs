const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync('site/manifest.json','utf8'));
const codec = require('../../web/share-codec');
const setup={v:1,f:'all-1500',m:[
  {id:'azumarill',moveset:['BUBBLE','ICE_BEAM','PLAY_ROUGH'],ivs:{atk:0,def:15,hp:15},levelCap:50},
  {id:'clodsire',moveset:['POISON_STING','EARTHQUAKE','STONE_EDGE'],ivs:{atk:1,def:14,hp:15},levelCap:50},
  {id:'mandibuzz',moveset:['SNARL','DARK_PULSE','AERIAL_ACE'],ivs:{atk:0,def:13,hp:15},levelCap:51}],w:{coverage:3}};
async function fits(page) {
  const sizes = await page.evaluate(() => ({width:document.documentElement.clientWidth, content:document.documentElement.scrollWidth}));
  if(sizes.content>sizes.width+1)console.log(await page.evaluate(()=>[...document.querySelectorAll('main *,dialog[open] *')].filter(e=>e.getBoundingClientRect().right>document.documentElement.clientWidth+1&&e.getBoundingClientRect().width>0).map(e=>({tag:e.tagName,id:e.id,class:e.className,right:e.getBoundingClientRect().right})).slice(0,15)));
  expect(sizes.content).toBeLessThanOrEqual(sizes.width + 1);
}
async function loaded(page) {
  await page.goto('/');
  await expect(page.locator('#teams .team').first()).toBeVisible();
  await expect(page.locator('#loader')).toBeHidden();
}
test.beforeEach(async ({page},info) => {
  // Tests are isolated: prohibit account writes, OAuth, analytics and all other external requests.
  // Locally created blob workers share this origin (Safari's gzip fallback).
  const origin=new URL(info.project.use.baseURL).origin;
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  // Build-time production configuration is replaced only in this isolated browser, never on disk.
  await page.route('**/config.js*', route => route.fulfill({contentType:'text/javascript', body:'window.FAINTR_CONFIG={};'}));
});
test('rankings, readable names/moves, visible badges and expanded detail', async ({page}) => {
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await loaded(page);
  const team=page.locator('#teams .team').first();
  const score=Number(await team.locator('.score b').innerText());
  expect(score).toBeGreaterThan(0); expect(score).toBeLessThanOrEqual(100);
  await expect(team.locator('.tile')).toHaveCount(10);
  const clipped = await team.locator('.name, .moves').evaluateAll(els => els.filter(el => el.scrollWidth > el.clientWidth + 1).map(el=>el.textContent));
  expect(clipped).toEqual([]);
  await team.locator('.head').click();
  await expect(team.getByText('Top threats and who answers them')).toBeVisible();
  await team.getByRole('button',{name:'What do these grades mean?'}).click();
  await expect(page.locator('#gradeHelpDlg')).toBeVisible();
  await fits(page);
  await page.locator('#closeGradeHelp').click();
  await expect(page.locator('#gradeHelpDlg')).toBeHidden();
  await fits(page);
  await team.locator('.head').click();
  await expect(team.locator('.quick')).toBeHidden();
  expect(errors).toEqual([]);
});
test('each built league loads nonzero scores; Anti-Meta remains free', async ({page}) => {
  page.on('pageerror',e=>console.log('League error:',e.message));
  await loaded(page);
  for(const format of manifest.formats.filter(f=>f.built)) {
    const button=page.locator(`#leagueSeg button[data-f="${format.key}"]`);
    if(await button.count()) await button.click(); else await page.locator('#cupSel').selectOption(format.key);
    await expect(page.locator('#matched')).toContainText(format.title);
    await expect.poll(async()=>Number(await page.locator('#teams .team .score b').first().innerText())).toBeGreaterThan(0);
    await fits(page);
  }
  await page.locator('#antiBtn').click();
  await expect(page.locator('#matched')).toContainText('anti-meta teams');
  await expect(page.locator('#teams .team .score b').first()).toContainText('%');
});
test('all sections, filters, data dialog and help close on phones', async ({page}) => {
  await loaded(page);
  if(await page.locator('#filterToggle').isVisible()) {
    await page.locator('#filterToggle').click(); await fits(page);
    await page.locator('#applyFilters').click();
  }
  await page.locator('#dataBtn').click(); await expect(page.locator('#dataDlg')).toBeVisible(); await fits(page);
  await page.locator('#dlgClose').click(); await expect(page.locator('#dataDlg')).toBeHidden();
  await page.locator('#dataBtn').click(); await page.keyboard.press('Escape'); await expect(page.locator('#dataDlg')).toBeHidden();
  for(const name of ['Team Grader','Matchups','Roster','PvP IVs','Meta','My Teams',"What's New",'Report a Bug']) {
    await page.getByRole('tab',{name,exact:true}).click(); await fits(page);
  }
  await expect(page.getByRole('link',{name:'Terms',exact:true})).toBeVisible();
});
test('populated IV family and ranking tables stay inside the screen', async ({page}) => {
  await loaded(page);
  await page.getByRole('tab',{name:'PvP IVs',exact:true}).click();
  await page.locator('#pk-iv input').fill('Azumarill');
  await page.locator('#pk-iv .suggest button').first().click();
  await expect(page.locator('#ivFam table')).toBeVisible();
  await expect(page.locator('#ivTable tbody tr').first()).toBeVisible();
  await fits(page);
  await expect(page.getByRole('region',{name:'Evolution family IVs; scroll horizontally if needed'})).toBeVisible();
});
test('short sharing is usable, can close, and preserves the exact team', async ({page}) => {
  let shared;
  await page.route('**/share/create',async route=>{
    shared=route.request().postDataJSON();
    await route.fulfill({json:{path:'/s/aBcDeF012345'}});
  });
  await loaded(page);
  await page.locator('#teams .shareListBtn').first().click();
  await expect(page.locator('#teamShareDialog')).toBeVisible();
  await expect(page.locator('#teamShareLink')).toHaveValue('https://faintr.com/s/aBcDeF012345');
  expect(shared.m).toHaveLength(3); await fits(page);
  await page.locator('#closeShareBtn').click(); await expect(page.locator('#teamShareDialog')).toBeHidden();
  // The real worker/codec round trip and old links are tested in tools/test-sharing.cjs.
});
test('failed startup shows a recoverable error', async ({page}) => {
  const fail=route=>route.abort();
  await page.route('**/manifest.json',fail);
  await page.goto('/');
  await expect(page.locator('#loaderTitle')).toHaveText("Couldn't load teams");
  await expect(page.locator('#loaderProg')).toBeHidden();
  await expect(page.locator('#loaderNote')).toContainText('reloading');
  await expect(page.locator('#loaderRetry')).toBeVisible();await fits(page);
  await page.unroute('**/manifest.json',fail);await page.locator('#loaderRetry').click();
  await expect(page.locator('#teams .team').first()).toBeVisible();
  await expect(page.locator('#loader')).toBeHidden();
});

test('an invalid shared team has persistent recovery controls',async({page})=>{
  const invalid={...setup,m:setup.m.map((m,i)=>i?m:{...m,id:'unknown_pokemon'})};
  await page.goto('/share/'+codec.encode(invalid));
  await expect(page.locator('#sharedTeamError')).toBeVisible();
  await expect(page.locator('#sharedTeamNote')).toBeHidden();
  await expect(page.locator('#sharedRetryBtn')).toBeVisible();await fits(page);
  await page.locator('#sharedRetryBtn').click();await expect(page.locator('#sharedTeamError')).toBeVisible();
  await page.locator('#sharedTeamError').getByRole('link',{name:'Browse current teams'}).click();
  await expect(page.locator('#teams .team').first()).toBeVisible();await expect(page.locator('#sharedTeamError')).toBeHidden();
});

test('a temporary shared-preview failure retries the same team successfully',async({page})=>{
  const worker=(await import('data:text/javascript;base64,'+fs.readFileSync('site/_worker.js').toString('base64'))).default;
  let attempts=0;const pathname='/share/'+codec.encode(setup);
  const env={ASSETS:{fetch:async()=>{if(++attempts===1)throw Error('Synthetic unavailable asset');return new Response(fs.readFileSync('site/index.html'),{headers:{'Content-Type':'text/html'}});}}};
  await page.route('**'+pathname,async route=>{
    const response=await worker.fetch(new Request(route.request().url()),env,{waitUntil:()=>{}});
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  });
  await page.goto(pathname);await expect(page.getByRole('heading',{name:'This team is temporarily unavailable'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Browse current teams'})).toBeVisible();await fits(page);
  await page.getByRole('link',{name:'Try this link again'}).click();
  await expect(page.locator('#sharedTeamNote')).toBeVisible();await expect(page.locator('#slots')).toContainText('Azumarill');await fits(page);
  expect(attempts).toBe(2);
});
test('legacy shared team restores all moves and IVs in the grader',async({page})=>{
  await page.goto('/share/'+codec.encode(setup));
  await expect(page.locator('#sharedTeamNote')).toBeVisible();
  await expect(page.locator('#slots .slot')).toHaveCount(3);
  await expect(page.locator('#slots')).toContainText('Azumarill');
  await expect(page.locator('#slots')).toContainText('Mandibuzz');
  await fits(page);
});

test('populated grading breakdowns fit at every report tab',async({page},info)=>{
  await page.goto('/share/'+codec.encode(setup));
  await expect(page.locator('#sharedTeamNote')).toBeVisible();
  await page.locator('#gradeBtn').click();
  await expect(page.locator('#gradeResult article')).toBeVisible();
  if(['desktop','small-phone'].includes(info.project.name))await page.screenshot({path:require('node:path').resolve(`../output/audit-report-${info.project.name}.png`),fullPage:true});
  for(const name of ['Overview','Game plan','Vs meta teams','Matchups','Threats','Members','IV effects','Improve']) {
    await page.locator('#gradeResult').getByRole('tab',{name,exact:true}).click();await fits(page);
  }
});

test('populated battle, timeline and detailed tables fit on phones',async({page})=>{
  await loaded(page);
  await page.locator('#cupSel').selectOption('all-1500');
  await expect(page.locator('#matched')).toContainText('Great League');
  await page.getByRole('tablist',{name:'Sections'}).getByRole('tab',{name:'Matchups',exact:true}).click();
  for(const [i,name] of ['Azumarill','Clodsire'].entries()) {
    const editor=page.locator('#bsides .ed').nth(i);
    await editor.locator('.picker input').fill(name);
    await editor.locator('.suggest button').first().click();
  }
  await page.locator('#battleBtn').click();
  await expect(page.locator('#battleResult article')).toBeVisible();await fits(page);
  await page.locator('#battleResult summary').click();await fits(page);
  await expect(page.locator('#battleResult svg')).toBeVisible();
});

test('battle results and IV comparisons use the exact winner when ratings round to 500',async({page})=>{
  await loaded(page);await page.locator('#cupSel').selectOption('all-1500');await expect(page.locator('#matched')).toContainText('Great League');
  await page.getByRole('tablist',{name:'Sections'}).getByRole('tab',{name:'Matchups',exact:true}).click();
  for(const [i,name] of ['Azumarill','Clodsire'].entries()){
    const editor=page.locator('#bsides .ed').nth(i);await editor.locator('.picker input').fill(name);await editor.locator('.suggest button').first().click();
  }
  await page.evaluate(()=>{
    const original=window.FAINTR_BRIDGE.api;window.__syntheticWinner=0;
    window.FAINTR_BRIDGE.api=async(url,body)=>{
      if(url.split('?')[0]!=='/api/battle')return original(url,body);
      const side=(name,hp)=>({name,stats:{atk:100,def:150,hp},ivs:{atk:0,def:15,hp:15}}),bp={move:'Test fast move',damage:1,attack:100,next:null};
      return {a:side('Azumarill',334),b:side('Clodsire',397),ratingA:500,ratingB:500,winner:window.__syntheticWinner,hpA:167,hpB:198,energyA:10,energyB:20,turns:1,timeline:[],shields:[1,1],grid:[[500,500,500],[500,500,500],[500,500,500]],breakpoints:{a:bp,b:bp},chargedDamage:{a:[],b:[]}};
    };
  });
  for(const [winner,label] of [[0,'Win'],[1,'Loss'],[-1,'Tie']]){
    await page.evaluate(w=>window.__syntheticWinner=w,winner);await page.locator('#battleBtn').click();
    await expect(page.locator('#battleResult .vs')).toHaveText(label);
    await expect(page.locator('#battleResult')).toContainText(label+', 167 HP left');await fits(page);
  }
  await expect(page.locator('#battleResult')).toContainText('the game chooses priority at random');
  await expect(page.locator('#battleResult .rating.l')).toHaveCount(0);
});

test('supporters, policies, licenses and sources fit and have working home links',async({page})=>{
  for(const path of ['supporters','privacy','terms','licenses','sources']) {
    const response=await page.goto('/'+path+'/');expect(response.status()).toBe(200);
    await expect(page.locator('h1')).toBeVisible();await fits(page);
    await expect(page.locator('a[href="/"],a[href="https://faintr.com/"]').first()).toBeVisible();
  }
});
test('roster editing persists locally and the dialog fits',async({page},info)=>{
  await loaded(page);
  await page.getByRole('tab',{name:'Roster',exact:true}).click();
  await page.locator('#rAdd').click();
  await page.locator('#pk-roster input').fill('Azumarill');
  if(info.project.use.hasTouch)await page.locator('#pk-roster .suggest button').first().tap();else await page.locator('#pk-roster .suggest button').first().click();
  await page.locator('#rfNick').fill('Release test Azumarill');
  await fits(page);
  await page.locator('#rfSave').click();
  await expect(page.locator('#rDlg')).toBeHidden();
  await expect(page.locator('#rGrid')).toContainText('Release test Azumarill');
  await fits(page);
  await page.reload();
  await expect(page.locator('#teams .team').first()).toBeVisible();
  await page.getByRole('tab',{name:'Roster',exact:true}).click();
  await expect(page.locator('#rGrid')).toContainText('Release test Azumarill');
});

test('a 2,000-entry roster pages, searches, edits and exports every entry',async({page})=>{
  await page.addInitScript(()=>{
    if(localStorage.getItem('faintr.web.roster'))return;
    const roster=Array.from({length:2000},(_,i)=>({uid:'stress-'+i,id:'azumarill',name:'Azumarill',nickname:i===0?'Synthetic 0000 with a very long nickname':'Synthetic '+String(i).padStart(4,'0'),types:['water','fairy'],dex:184,ivs:{atk:0,def:15,hp:15},cp:1498,levelCap:50,leagues:[1500],moveset:['BUBBLE','ICE_BEAM','PLAY_ROUGH'],added:'2026-10-23',eval:{v:2,leagues:[{cp:1500,level:45,maxCp:1498,rank:20,count:4096,pctOfBest:99,status:'ready'}],evolves:[]}}));
    localStorage.setItem('faintr.web.roster',JSON.stringify(roster));
  });
  await loaded(page);await page.getByRole('tab',{name:'Roster',exact:true}).click();
  await expect(page.locator('#rNote')).toContainText('2000 Pokémon saved');
  await expect(page.locator('#rGrid [data-uid]')).toHaveCount(50);
  await expect(page.locator('#rPager')).toContainText('Page 1 of 40');await fits(page);
  expect(await page.locator('#rGrid .rname h4').first().evaluate(e=>e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1)).toBe(true);
  await page.locator('#rPager').getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.locator('#rPager')).toContainText('Page 2 of 40');await expect(page.locator('#rGrid [data-uid="stress-50"]')).toBeVisible();
  await page.locator('#rView button[data-v="list"]').click();
  await expect(page.locator('#rGrid tbody tr')).toHaveCount(50);await expect(page.locator('#rPager')).toContainText('Page 1 of 40');await fits(page);
  await page.locator('#rPagerBottom').getByRole('button',{name:'Next',exact:true}).click();await expect(page.locator('#rPager')).toContainText('Page 2 of 40');
  await page.locator('#rSearch').fill('Synthetic 1999');await expect(page.locator('#rGrid [data-uid]')).toHaveCount(1);await expect(page.locator('#rPager')).toBeHidden();
  await page.locator('#rGrid [data-act="edit"]').click();await page.locator('#rfNick').fill('Synthetic 1999 edited');await page.locator('#rfSave').click();
  await expect(page.locator('#rDlg')).toBeHidden();await expect(page.locator('#rGrid')).toContainText('Synthetic 1999 edited');
  await page.reload();await expect(page.locator('#teams .team').first()).toBeVisible();await page.getByRole('tab',{name:'Roster',exact:true}).click();
  await page.locator('#rSearch').fill('Synthetic 1999');await expect(page.locator('#rGrid')).toContainText('Synthetic 1999 edited');
  const pending=page.waitForEvent('download');await page.locator('#rExport').click();const file=await pending;
  const exported=JSON.parse(fs.readFileSync(await file.path(),'utf8'));expect(exported.roster).toHaveLength(2000);
  expect(exported.roster.find(e=>e.uid==='stress-1999').nickname).toBe('Synthetic 1999 edited');
  await page.locator('#rSearch').fill('');await expect(page.locator('#rGrid [data-uid]')).toHaveCount(50);await expect(page.locator('#rPager')).toContainText('Page 1 of 40');
});
test('tool tabs and Pokémon suggestions support keyboard selection',async({page})=>{
 await loaded(page);const species=(await page.locator('#teams .name').first().innerText()).trim();const teams=page.getByRole('tab',{name:'Teams',exact:true});await teams.focus();await teams.press('ArrowRight');
 const grade=page.getByRole('tab',{name:'Team Grader',exact:true});await expect(grade).toBeFocused();await expect(grade).toHaveAttribute('aria-selected','true');
 const input=page.locator('#slots .picker input').first();await input.fill(species);await expect(input).toHaveAttribute('aria-expanded','true');
 await input.press('ArrowDown');await expect(input).toHaveAttribute('aria-activedescendant',/picker-\d+-list-0/);await input.press('Enter');
 await expect(page.locator('#slots .picked').first()).toContainText(species);await expect(input).toHaveAttribute('aria-expanded','false');await fits(page);
 await grade.focus();await grade.press('Home');await expect(teams).toBeFocused();
});
test('saved teams with grades and long names fit on phones',async({page})=>{
  const format=manifest.formats.find(f=>f.key===setup.f);
  await page.addInitScript(({members,version})=>localStorage.setItem('faintr.web.saved',JSON.stringify([{
    id:'release-fixture',name:'A deliberately long team name for a small phone screen',f:'all-1500',title:'Great League',members,
    history:[{version,composite:90,letters:{coverage:'A',bulk:'B',safety:'B',consistency:'A',blindSpots:'B',twoAnswers:'A',resilience:'A',sharedWeak:'A',pilot:'B',metaWins:'A'}}]
  } ])),{members:setup.m,version:format.pvpoke});
  await loaded(page);
  await page.getByRole('tab',{name:'My Teams',exact:true}).click();
  await expect(page.locator('#savedList .panel')).toBeVisible();
  await fits(page);
  await expect(page.locator('#savedList .tile')).toHaveCount(10);
});

test('roster partial imports retain failures and export, deletion and undo preserve entries',async({page})=>{
 await loaded(page);await page.getByRole('tab',{name:'Roster',exact:true}).click();
 const roster=[{id:'azumarill',nickname:'Import fixture',ivs:{atk:0,def:15,hp:15},cp:1498,leagues:[1500]},
  {id:'not_a_species',ivs:{atk:0,def:15,hp:15},cp:1400}];
 await page.locator('#rImportFile').setInputFiles({name:'roster-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({roster}))});
 await expect(page.locator('#qPreview')).toContainText('does not replace');await page.locator('#qAdd').click();
 await expect(page.locator('#qPreview')).toContainText('1 entries remain pending');
 await expect(page.locator('#rGrid [data-uid]')).toHaveCount(1);await fits(page);
 await page.locator('#qAdd').click();await expect(page.locator('#qPreview')).toContainText('1 entries remain pending');
 await expect(page.locator('#rGrid [data-uid]')).toHaveCount(1);
 const pendingDownload=page.waitForEvent('download');await page.locator('#qDownloadPending').click();const pending=await pendingDownload;
 const pendingText=require('node:fs').readFileSync(await pending.path(),'utf8');expect(JSON.parse(pendingText).roster[0].id).toBe('not_a_species');
 await page.locator('#qClose').click();
 const download=page.waitForEvent('download');await page.locator('#rExport').click();const file=await download;
 const exported=JSON.parse(require('node:fs').readFileSync(await file.path(),'utf8'));expect(exported.roster).toHaveLength(1);expect(exported.roster[0].leagues).toEqual([1500]);
 await page.locator('#rGrid [data-act="del"]').click();await page.locator('#rGrid [data-act="yesdel"]').click();
 await expect(page.locator('#rGrid [data-uid]')).toHaveCount(0);await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(page.locator('#rGrid [data-uid]')).toHaveCount(1);await page.reload();await expect(page.locator('#teams .team').first()).toBeVisible();
 await page.getByRole('tab',{name:'Roster',exact:true}).click();await expect(page.locator('#rGrid')).toContainText('Import fixture');
});

test('optional analytics waits for consent, records one tool action and stops after withdrawal',async({page})=>{
 const events=[];
 await page.route('**/config.js*',route=>route.fulfill({contentType:'text/javascript',body:'window.FAINTR_CONFIG={analyticsEnabled:true};'}));
 await page.route('**/a/event',async route=>{events.push(route.request().postDataJSON());await route.fulfill({status:204});});
 await loaded(page);expect(events).toHaveLength(0);
 await page.getByRole('button',{name:'Analytics choices',exact:true}).click();await fits(page);
 await page.getByRole('button',{name:'Allow usage analytics',exact:true}).click();await expect.poll(()=>events.length).toBe(1);
 await page.getByRole('tab',{name:'Team Grader',exact:true}).click();await expect.poll(()=>events.filter(e=>e.event==='page_view'&&e.tool==='grade').length).toBe(1);
 await page.goto('/share/'+codec.encode(setup));await expect(page.locator('#sharedTeamNote')).toBeVisible();await page.locator('#gradeBtn').click();
 await expect(page.locator('#gradeResult article')).toBeVisible();await expect.poll(()=>events.filter(e=>e.event==='grade_completed').length).toBe(1);
 expect(events.filter(e=>e.event==='grade_started')).toHaveLength(1);
 await page.getByRole('button',{name:'Analytics choices',exact:true}).click();await page.getByRole('button',{name:'Keep analytics off',exact:true}).click();
 const count=events.length;await page.getByRole('tab',{name:'PvP IVs',exact:true}).click();expect(events).toHaveLength(count);
 const keys=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('faintr.analytics.')));expect(keys).toEqual(['faintr.analytics.consent']);
 for(const event of events)expect(Object.keys(event).sort()).toEqual(['id','event','tool','source','visitor','session','returning','consent'].sort());
});
test('guest account and battle tools dialogs fit without accessing a real account',async({page})=>{
  await page.route('**/config.js*',route=>route.fulfill({contentType:'text/javascript',body:'window.FAINTR_CONFIG={supabaseUrl:"https://release.invalid",supabaseAnonKey:"synthetic-test-key",loginProviders:"discord,google"};'}));
  await loaded(page);
  await page.getByRole('tab',{name:'Battle tools',exact:true}).click(); await fits(page);
  await page.locator('#accountBtn').click(); await expect(page.locator('#authDlg')).toBeVisible(); await fits(page);
  await expect(page.locator('#authDiscord')).toBeVisible(); await expect(page.locator('#authGoogle')).toBeVisible();
  await page.locator('#authClose').click(); await expect(page.locator('#authDlg')).toBeHidden();
});
test('account switch clears private views even when the next account cannot load',async({page})=>{
 await page.route('**/config.js*',route=>route.fulfill({contentType:'text/javascript',body:'window.FAINTR_CONFIG={supabaseUrl:"https://release.invalid",supabaseAnonKey:"synthetic-test-key"};'}));
 await page.route('**/vendor/supabase.js*',route=>route.fulfill({contentType:'text/javascript',body:`
 window.__testUser={id:'synthetic-a',email:'a@example.invalid'};
 window.__testDoc={version:1,roster:[{uid:'private-fixture',id:'azumarill',name:'Azumarill',nickname:'Private account A fixture',types:['water','fairy'],dex:184,ivs:{atk:0,def:15,hp:15},cp:1498,levelCap:50,moveset:[],leagues:[1500],eval:{v:2,leagues:[]}}],teams:[],battles:[],vip_settings:{}};
 window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:window.__testUser}}}),onAuthStateChange:fn=>{window.__testAuth=fn;}},from:table=>{
 let fields;const q={select:f=>{fields=f;return q;},eq:()=>q,maybeSingle:async()=>table==='profiles'?{data:{display_name:'Synthetic trainer',is_admin:false}}:window.__testUser.id==='synthetic-b'?{error:{message:'Synthetic offline failure'}}:{data:{version:1}},single:async()=>({data:window.__testDoc})};return q;}})};
 `}));
 await loaded(page);await page.getByRole('tab',{name:'Roster',exact:true}).click();await expect(page.locator('#rGrid')).toContainText('Private account A fixture');
 await page.evaluate(()=>{window.__testUser={id:'synthetic-b',email:'b@example.invalid'};window.__testAuth('SIGNED_IN',{user:window.__testUser});});
 await expect(page.locator('#rGrid')).not.toContainText('Private account A fixture');
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('faintr.cloud.synthetic-a'))).toBeNull();
 expect(await page.evaluate(()=>window.__testDoc.roster.length)).toBe(1);await fits(page);
});
test('unavailable in-site admin updates offer working GitHub controls',async({page})=>{
 await page.route('**/config.js*',route=>route.fulfill({contentType:'text/javascript',body:'window.FAINTR_CONFIG={supabaseUrl:"https://release.invalid",supabaseAnonKey:"synthetic-test-key"};'}));
 await page.route('**/vendor/supabase.js*',route=>route.fulfill({contentType:'text/javascript',body:`
 window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'synthetic-admin',email:'admin@example.invalid'}}}}),onAuthStateChange:()=>{}},functions:{invoke:async()=>({error:{message:'Synthetic missing endpoint',context:new Response('{}',{status:404})}})},from:table=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='profiles'?{display_name:'Synthetic admin',is_admin:true}:{version:1}}),single:async()=>({data:{version:1,roster:[],teams:[],battles:[],vip_settings:{}}})};return q;}})};
 `}));
 await loaded(page);await page.locator('#dataBtn').click();
 const link=page.getByRole('link',{name:'Open update controls on GitHub',exact:true});await expect(link).toBeVisible();
 await expect(link).toHaveAttribute('href','https://github.com/FAINTR/faintr/actions/workflows/daily-data.yml');
 await expect(page.locator('#devRun')).toBeHidden();await expect(page.locator('#devForce')).toBeHidden();await fits(page);
 await page.locator('#dlgClose').click();await expect(page.locator('#dataDlg')).toBeHidden();
});

test('typed account details stay readable in system, light and dark themes',async({page,browserName})=>{
  await page.route('**/config.js*',route=>route.fulfill({contentType:'text/javascript',body:'window.FAINTR_CONFIG={supabaseUrl:"https://release.invalid",supabaseAnonKey:"synthetic-test-key"};'}));
  await page.emulateMedia({colorScheme:'dark'});
  await loaded(page);
  const autofill=browserName==='chromium'?await page.context().newCDPSession(page):null;
  if(autofill){await autofill.send('DOM.enable');await autofill.send('CSS.enable');}
  for(const theme of ['system-dark','light','dark']) {
    if(theme!=='system-dark')await page.locator('#themeBtn').click();
    await page.locator('#accountBtn').click();
    for(const mode of ['in','up']) {
      await page.locator(`#authMode [data-m="${mode}"]`).click();
      await page.locator('#authEmail').fill('visibility-test@example.invalid');
      await page.locator('#authPass').fill('SyntheticTestOnly123!');
      if(mode==='up')await page.locator('#authName').fill('Visibility test');
      const colors=await page.locator('#authForm input:visible').evaluateAll(fields=>fields.map(field=>{
        const style=getComputedStyle(field);
        const rgb=value=>(value.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
        const luminance=color=>rgb(color).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);
        const foreground=luminance(style.webkitTextFillColor||style.color),background=luminance(style.backgroundColor);
        return {id:field.id,contrast:(Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05),background:style.backgroundColor};
      }));
      for(const field of colors) {
        expect(field.contrast,`${theme}: ${field.id} text must be readable on its input background`).toBeGreaterThanOrEqual(4.5);
        expect(field.background,`${theme}: ${field.id} must have its own background`).not.toBe('rgba(0, 0, 0, 0)');
      }
      // Exercise the browser's real autofill pseudo-state, including while focused.
      if(autofill) {
        const {root}=await autofill.send('DOM.getDocument');
        for(const id of ['authEmail','authPass']) {
          const {nodeId}=await autofill.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#'+id});
          await autofill.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['autofill','focus']});
          const fill=await page.locator('#'+id).evaluate(field=>{
            const style=getComputedStyle(field);
            return {active:field.matches(':-webkit-autofill'),ink:style.webkitTextFillColor,
              expectedInk:getComputedStyle(document.querySelector('#authDlg')).color,
              shadow:style.boxShadow,expectedBackground:getComputedStyle(document.querySelector('#authName')).backgroundColor};
          });
          expect(fill.active).toBe(true);
          expect(fill.ink).toBe(fill.expectedInk);
          expect(fill.shadow).toContain(fill.expectedBackground);
          await autofill.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});
        }
      }
      await fits(page);
    }
    await page.locator('#authClose').click();
  }
  if(autofill)await autofill.detach();
});
test('roster CP and league choices govern every team picker',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('faintr.web.roster',JSON.stringify([
    {uid:'master-only',id:'metagross',name:'Metagross',cp:3737,leagues:[10000],ivs:{atk:15,def:14,hp:10},moveset:[]},
    {uid:'great-only',id:'mimikyu',name:'Mimikyu',cp:1495,leagues:[1500],ivs:{atk:4,def:14,hp:15},moveset:[]},
    {uid:'both',id:'azumarill',name:'Azumarill',cp:1498,leagues:[1500,2500],ivs:{atk:0,def:15,hp:15},moveset:[]}
  ])));
  await loaded(page);
  await page.locator('#cupSel').selectOption('all-1500');
  await expect(page.locator('#matched')).toContainText('Great League');
  await page.getByRole('tab',{name:'Team Grader',exact:true}).click();
  const roster=page.locator('#slots .fromRoster').first();
  await expect(roster.locator('option[value="master-only"]')).toHaveCount(0);
  await expect(roster.locator('option[value="great-only"]')).toHaveCount(1);
  await page.locator('#leagueSeg button[data-f="all-2500"]').click();
  await expect(page.locator('#gradeLede')).toContainText('Ultra League');
  await expect(roster.locator('option[value="great-only"]')).toHaveCount(0);
  await expect(roster.locator('option[value="both"]')).toHaveCount(1);
  await page.getByRole('tab',{name:'Roster',exact:true}).click();
  await page.locator('#rGrid [data-uid="great-only"] [data-roster-league="2500"]').check();
  await expect(page.locator('#toast')).toContainText('League choices saved');
  await page.getByRole('tab',{name:'Team Grader',exact:true}).click();
  await expect(roster.locator('option[value="great-only"]')).toHaveCount(1);
  await fits(page);
});
test('Mega Master shared teams retain the additional charged move when reshared',async({page})=>{
  const mega={v:1,f:'mega-10000',m:[
    {id:'mewtwo_mega_y',moveset:['PSYCHO_CUT','PSYSTRIKE','THUNDERBOLT','FUTURE_SIGHT_PLUS']},
    {id:'melmetal',moveset:['THUNDER_SHOCK','DOUBLE_IRON_BASH','DYNAMIC_PUNCH']},
    {id:'palkia_origin',moveset:['DRAGON_BREATH','AQUA_TAIL','SPACIAL_REND']}]};
  let captured;
  await page.route('**/share/create',async route=>{captured=route.request().postDataJSON();await route.fulfill({json:{path:'/s/aBcDeF012345'}});});
  await page.goto('/share/'+codec.encode(mega));
  await expect(page.locator('#loader')).toBeHidden();
  await expect(page.locator('#sharedTeamNote')).toBeVisible();
  await expect(page.locator('#slots .slot').first().locator('select[data-m="3"]')).toHaveValue('FUTURE_SIGHT_PLUS');
  await page.locator('#shareGradeBtn').click();
  await expect(page.locator('#teamShareDialog')).toBeVisible();
  expect(captured.m[0].moveset).toEqual(mega.m[0].moveset);
  await fits(page);
});
