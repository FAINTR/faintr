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
  expect(sizes.content).toBeLessThanOrEqual(sizes.width + 1);
}
async function loaded(page) {
  await page.goto('/');
  await expect(page.locator('#teams .team').first()).toBeVisible();
  await expect(page.locator('#loader')).toBeHidden();
}
test.beforeEach(async ({page}) => {
  // Tests are isolated: prohibit account writes, OAuth, analytics and all other external requests.
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
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
  await page.route('**/manifest.json',route=>route.abort());
  await page.goto('/');
  await expect(page.locator('#loaderTitle')).toHaveText("Couldn't load teams");
  await expect(page.locator('#loaderProg')).toBeHidden();
  await expect(page.locator('#loaderNote')).toContainText('reloading');
});
test('legacy shared team restores all moves and IVs in the grader',async({page})=>{
  await page.goto('/share/'+codec.encode(setup));
  await expect(page.locator('#sharedTeamNote')).toBeVisible();
  await expect(page.locator('#slots .slot')).toHaveCount(3);
  await expect(page.locator('#slots')).toContainText('Azumarill');
  await expect(page.locator('#slots')).toContainText('Mandibuzz');
  await fits(page);
});
test('roster editing persists locally and the dialog fits',async({page})=>{
  await loaded(page);
  await page.getByRole('tab',{name:'Roster',exact:true}).click();
  await page.locator('#rAdd').click();
  await page.locator('#pk-roster input').fill('Azumarill');
  await page.locator('#pk-roster .suggest button').first().click();
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
test('guest account and battle tools dialogs fit without accessing a real account',async({page})=>{
  await page.route('**/config.js*',route=>route.fulfill({contentType:'text/javascript',body:'window.FAINTR_CONFIG={supabaseUrl:"https://release.invalid",supabaseAnonKey:"synthetic-test-key",loginProviders:"discord,google"};'}));
  await loaded(page);
  await page.getByRole('tab',{name:'Battle tools',exact:true}).click(); await fits(page);
  await page.locator('#accountBtn').click(); await expect(page.locator('#authDlg')).toBeVisible(); await fits(page);
  await expect(page.locator('#authDiscord')).toBeVisible(); await expect(page.locator('#authGoogle')).toBeVisible();
  await page.locator('#authClose').click(); await expect(page.locator('#authDlg')).toBeHidden();
});
