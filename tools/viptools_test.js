const { test } = require('node:test');
const assert = require('node:assert/strict');
const { battleEntry, battleStats, teamAlerts, upgradeCandidates } = require('../viptools');

test('battle log validates team ownership, cup, outcomes and dates', () => {
  const team = {id:'mine',name:'My lineup',f:'cup',members:[{id:'a'},{id:'b'},{id:'c'}]};
  const formats = [{key:'cup',title:'Test cup'},{key:'other'}], now = new Date('2026-10-21T00:00:00Z');
  const body = {teamId:'mine',format:'cup',result:'win',at:'2026-10-20T23:00:00Z',notes:'x'.repeat(600)};
  const entry = battleEntry(body,[team],formats,now);
  assert.equal(entry.teamName,'My lineup'); assert.equal(entry.notes.length,500); assert.deepEqual(entry.members,[{id:'a'},{id:'b'},{id:'c'}]);
  for (const patch of [{teamId:'someone-else'},{format:'other'},{result:'invalid'},{at:'invalid'},{at:'2027-01-01'}]) {
    assert.throws(()=>battleEntry({...body,...patch},[team],formats,now));
  }
});
test('battle stats exclude draws, separate cups and compute a rolling 20-battle trend', () => {
  const entries = Array.from({length:25},(_,i)=>({teamId:i<10?'a':'b',teamName:'Test',format:i<10?'great':'ultra',formatTitle:i<10?'Great':'Ultra',result:i<5?'win':i===5?'draw':'loss',at:new Date(1000000000+i*1000).toISOString()}));
  const stats=battleStats(entries);
  assert.equal(stats.count,25); assert.equal(stats.wins,5); assert.equal(stats.losses,19); assert.equal(stats.draws,1);
  assert.equal(stats.winRate,5/24*100); assert.equal(stats.byTeam.length,2); assert.equal(stats.byCup.length,2);
  assert.equal(stats.trend.at(-1).count,20); assert.equal(stats.trend.at(-1).winRate,0);
  assert.equal(battleStats([{...entries[0],result:'draw'}]).winRate,null);
});
test('team alerts show actual data changes and keep read status per team and version', () => {
  const team={id:'one',name:'Test',f:'great',history:[{version:'new',composite:82,letters:{bulk:'A',safety:'B'}},{version:'old',composite:80,letters:{bulk:'B',safety:'B'}}]};
  const alerts=teamAlerts([team]); assert.equal(alerts.length,1); assert.equal(alerts[0].delta,2); assert.deepEqual(alerts[0].changes,[{key:'bulk',from:'B',to:'A'}]);
  assert.equal(teamAlerts([team],['one:new'])[0].read,true);
  assert.equal(teamAlerts([{...team,history:[team.history[0]]}]).length,0);
  assert.equal(teamAlerts([{...team,history:[{...team.history[1],version:'new'},team.history[1]]}]).length,0);
});
test('upgrade planner uses only owned candidates, legal evolutions and the chosen cup', () => {
  const l=(status,rank=1)=>({cp:1500,status,rank,pctOfBest:100-rank/100,level:42,maxCp:1499});
  const roster=[{uid:'ready',id:'a',name:'A',moveset:['good'],eval:{leagues:[l('ready')]}},
    {uid:'power',id:'b',name:'B',eval:{leagues:[l('powerup',20)]}},
    {uid:'over',id:'c',name:'C',eval:{leagues:[l('over')]}},
    {uid:'evolve',id:'baby',name:'Baby',eval:{leagues:[],evolves:[{id:'d',name:'D',leagues:[l(undefined,10)]}]}},
    {uid:'dupe',id:'b',name:'B',eval:{leagues:[l('powerup',100)]}}];
  const pool=['a','b','c','d','not-owned'].map(id=>({id,moveset:['good'],moves:['Good move']}));
  const result=upgradeCandidates(roster,pool,pool,1500);
  assert.deepEqual(result.ready,['a']); assert.deepEqual(result.candidates.map(c=>c.id),['b','d']);
  assert.equal(result.candidates[0].uid,'power'); assert.equal(result.candidates[0].needsXL,true);
  assert.equal(result.candidates[1].action,'Evolve and build');
});
