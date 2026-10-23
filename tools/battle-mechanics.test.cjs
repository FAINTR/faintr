// Local game data only. Wrapper parity does not independently prove game mechanics.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {makeCtx}=require('../build'),{teamError}=require('../team-rules');
const src=process.env.FAINTR_TEST_SRC||(fs.existsSync('.webcache/src/js/GameMaster.js')?'.webcache/src':'assets/pvpoke-src');
const ctx=makeCtx(src),F={cup:'all',cp:10000,meta:'master'};
function run(code,args={}){Object.assign(ctx,args);return vm.runInContext(code,ctx);}
const mon=(id,moveset)=>({id,moveset,ivs:{atk:15,def:15,hp:15},levelCap:50});
const metal=mon('melmetal',['THUNDER_SHOCK','SUPER_POWER','ROCK_SLIDE']);
const regi=mon('registeel',['LOCK_ON','FOCUS_BLAST','ZAP_CANNON']);
const fixtures=[
 [mon('garchomp',['DRAGON_TAIL','EARTH_POWER','TWISTER']),mon('metagross',['BULLET_PUNCH','METEOR_MASH','EARTHQUAKE'])],
 [metal,regi],
 [mon('dragonite_shadow',['DRAGON_BREATH','DRAGON_CLAW','SUPER_POWER']),mon('gyarados',['DRAGON_BREATH','AQUA_TAIL','CRUNCH'])],
 [mon('palkia_origin',['DRAGON_BREATH','AQUA_TAIL','SPACIAL_REND']),mon('dialga_origin',['DRAGON_BREATH','IRON_HEAD','ROAR_OF_TIME'])]
];
// Direct native setup bypasses FAINTR's constructors, state handling and result mapping.
run(`function nativeBattle(a,b,sa,sb,ea,eb,F){
 loadRankings(F.cup,'overall',F.cp);var battle=new Battle();battle.setCP(F.cp);battle.setCup(F.cup);
 function side(s,i,sh,en){var p=new Pokemon(s.id,i,battle);p.initialize(F.cp);p.ivs={atk:s.ivs.atk,def:s.ivs.def,hp:s.ivs.hp};p.levelCap=50;p.setLevel(50,true);
 p.selectRecommendedMoveset();p.selectMove('fast',s.moveset[0]);p.selectMove('charged',s.moveset[1],0);p.selectMove('charged',s.moveset[2],1);
 battle.setNewPokemon(p,i,false);p.setShields(sh);p.baitShields=1;p.startEnergy=en;return p;}
 var A=side(a,0,sa,ea),B=side(b,1,sb,eb);battle.simulate();
 return {hp:[A.hp,B.hp],energy:[A.energy,B.energy],shields:[A.shields,B.shields],turns:battle.getTurns(),timeline:battle.getTimeline().map(e=>[e.type,e.actor,e.turn,e.values]),rating:Math.floor(500*(A.hp/A.stats.hp+1-B.hp/B.stats.hp))};
}`);
for(const [a,b] of fixtures)test(`native PvPoke parity: ${a.id} vs ${b.id}, all shield combinations and energy leads`,()=>{
 for(const [ea,eb] of [[0,0],[100,30]])for(let sa=0;sa<=2;sa++)for(let sb=0;sb<=2;sb++){
  const result=run(`var n=nativeBattle(a,b,sa,sb,ea,eb,F),r=runBattle(a,b,sa,sb,true,true,ea,eb,F);
   ({n,w:{hp:[r.A.hp,r.B.hp],energy:[r.A.energy,r.B.energy],shields:[r.A.shields,r.B.shields],turns:r.battle.getTurns(),timeline:r.battle.getTimeline().map(e=>[e.type,e.actor,e.turn,e.values]),rating:r.ra}})`,{a,b,sa,sb,ea,eb,F});
  assert.deepEqual(result.w,result.n);
  for(const energy of result.w.energy)assert(energy>=0&&energy<=100);
  for(const hp of result.w.hp)assert(hp>=0);
 }
});
test('CP, stats and fast/charged damage agree with independent arithmetic for neutral, STAB, weakness and Shadow cases',()=>{
 for(const [a,b] of fixtures){
  const rows=run(`var battle=newBattle(F),A=battleSide(a,battle,0),B=battleSide(b,battle,1);
   [A,B].map((p,i)=>{var d=i?A:B;return {base:p.baseStats,ivs:p.ivs,cpm:p.cpm,cp:p.cp,stats:p.stats,attack:p.getEffectiveStat(0),defense:p.getEffectiveStat(1),shadow:p.shadowType,
    moves:[p.fastMove].concat(p.chargedMoves).map(m=>({power:m.power,stab:m.stab,effect:d.typeEffectiveness[m.type],defense:d.getEffectiveStat(1),damage:DamageCalculator.damage(p,d,m),cost:m.energy,gain:m.energyGain,turns:m.cooldown/500}))};})`,{a,b,F});
  for(const p of rows){
   assert.equal(p.cp,Math.max(10,Math.floor((p.base.atk+p.ivs.atk)*Math.sqrt(p.base.def+p.ivs.def)*Math.sqrt(p.base.hp+p.ivs.hp)*p.cpm**2/10)));
   assert.equal(p.stats.hp,Math.max(10,Math.floor((p.base.hp+p.ivs.hp)*p.cpm)));
   assert(Math.abs(p.stats.atk-(p.base.atk+p.ivs.atk)*p.cpm)<1e-9);
   assert(Math.abs(p.stats.def-(p.base.def+p.ivs.def)*p.cpm)<1e-9);
   assert(Math.abs(p.attack/p.stats.atk-(p.shadow==='shadow'?1.2:1))<1e-7);
   assert(Math.abs(p.defense/p.stats.def-(p.shadow==='shadow'?.83333331:1))<1e-7);
   for(const m of p.moves)assert.equal(m.damage,Math.floor(.5*m.power*m.stab*(p.attack/m.defense)*m.effect*1.2999999523162842)+1);
   assert(Number.isInteger(p.moves[0].turns)&&p.moves[0].gain>0);
   for(const m of p.moves.slice(1))assert(m.cost>0);
  }
 }
});
test('timeline spends charged energy, caps accumulation, shields at most twice and includes fainting',()=>{
 const r=run(`var r=runBattle(a,b,2,2,true,true,100,0,F);({events:r.battle.getTimeline(),shields:[r.A.shields,r.B.shields],energy:[r.A.energy,r.B.energy]})`,{a:metal,b:regi,F});
 assert(r.events.some(e=>e.type==='faint'));
 for(let actor=0;actor<2;actor++){
  let energy=actor===0?100:0,shields=0;
  for(const e of r.events){
   if(e.actor!==actor)continue;
   if(e.type==='shield')shields++;
   if(e.type.startsWith('fast')||e.type.startsWith('charged')){
    energy=Math.min(100,energy+e.values[1]);assert(energy>=0);assert(e.values[0]>=1);
   }
  }
  assert(shields<=2);assert.equal(energy,r.energy[actor]);
 }
});
test('reference damage remains at starting stats after guaranteed self debuffs',()=>{
 const r=run(`var detail=battleDetail(a,b,{shieldsA:0,shieldsB:0},F),n=battleSide(a,newBattle(F),0);({detail,attack:n.getEffectiveStat(0)})`,{a:metal,b:regi,F});
 assert(r.detail.timeline.some(e=>e.name==='Superpower'));
 assert.equal(r.detail.breakpoints.a.attack,+r.attack.toFixed(2));
 assert.equal(r.detail.breakpoints.a.damage,3);
});
test('an identical fast-only mirror can faint simultaneously and is a draw',()=>{
 const r=run(`var r=runBattle(a,a,0,0,true,true,0,0,F);({ra:r.ra,rb:r.rb,hp:[r.A.hp,r.B.hp]})`,{a:mon('dragonite',['DRAGON_BREATH']),F});
 assert.deepEqual(Array.from(r.hp),[0,0]);assert.equal(r.ra,500);assert.equal(r.rb,500);
});
test('native timeout ends a low-damage battle with both sides alive',()=>{
 const r=run(`var battle=newBattle(F),A=battleSide(a,battle,0),B=battleSide(a,battle,1);
 [A,B].forEach((p,i)=>{battle.setNewPokemon(p,i,false);p.fastMove={...p.fastMove,power:0,energyGain:0,cooldown:2000};p.chargedMoves=[];p.setShields(0);});battle.simulate();
 ({duration:battle.getDuration(),hp:[A.hp,B.hp],turns:battle.getTurns()})`,{a:mon('blissey',['POUND']),F});
 assert(r.hp.every(hp=>hp>0));assert(r.duration>=240000);assert(r.turns>0);
});
test('a narrow timeout lead is not turned into a draw by rating rounding',()=>{
 const result=run('var A={hp:167,stats:{hp:334}},B={hp:198,stats:{hp:397}};({rating:Math.floor(500*(A.hp/A.stats.hp+1-B.hp/B.stats.hp)),winner:battleWinner(A,B),reverse:battleWinner(B,A),tie:battleWinner(A,A)})');
 assert.equal(result.rating,500);assert.equal(result.winner,0);assert.equal(result.reverse,1);assert.equal(result.tie,-1);
});
test('explicit level ceilings apply to default IVs and Mega rank comparisons',()=>{
 for(const [id,cap] of [['metagross',40],['mewtwo_mega_y',50],['mewtwo_mega_y',51]]){
  const info=run('ivInfo(id,null,cap,F)',{id,cap,F});assert(info.level<=cap);assert(info.rank1.level<=cap);assert.equal(info.levelCap,cap);
 }
});
test('IV products use minimum HP and Shedinja fixed HP consistently',()=>{
 const info=run('ivInfo("shedinja",{atk:15,def:15,hp:15},50,{cup:"all",cp:1500,meta:"great"})');
 assert.equal(info.stats.hp,10);assert.equal(info.rank,1);assert.equal(info.pctOfBest,100);
 const table=run('ivTable("shedinja",1500,50,0)');assert(table.rows.every(row=>row[9]===10));assert.equal(table.rows[0][6],100);
});
test('team rules reject duplicate species/forms and multiple Megas but allow distinct legal species',()=>{
 assert.match(teamError([{dex:6},{dex:6}]),/Pokédex/);
 assert.match(teamError([{dex:6,mega:true},{dex:150,mega:true}]),/Mega/);
 assert.equal(teamError([{dex:6},{dex:150},{dex:376}]),null);
});
