// Local game data only. Wrapper parity does not independently prove game mechanics.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {makeCtx}=require('../build'),{teamError}=require('../team-rules');
const src=process.env.FAINTR_TEST_SRC||(fs.existsSync('.webcache/src/js/GameMaster.js')?'.webcache/src':'assets/pvpoke-src');
const ctx=makeCtx(src),F={cup:'all',cp:10000,meta:'master'};
function run(code,args={}){Object.assign(ctx,args);return vm.runInContext(code,ctx);}
const mon=(id,moveset)=>({id,moveset,ivs:{atk:15,def:15,hp:15},levelCap:50});
const metal=mon('melmetal',['THUNDER_SHOCK','SUPER_POWER','ROCK_SLIDE']);
const regi=mon('registeel',['LOCK_ON','FOCUS_BLAST','ZAP_CANNON']);
test('manual catalogs include every native eligible low-stat species while preserving cup bans and threat pools',()=>{
 for(const format of [{cup:'all',cp:1500,meta:'great'},{cup:'all',cp:2500,meta:'ultra'},{cup:'all',cp:10000,meta:'master'},{cup:'fantasy',cp:1500,meta:'fantasy'}]){
  const result=run(`var before=JSON.stringify(threatList(fmt)),b=newBattle(fmt),cup=gm.getCupById(fmt.cup);
   var expected=gm.generateFilteredPokemonList(b,cup.include,cup.exclude,undefined,undefined,false).filter(p=>p.speciesId.indexOf('_xs')===-1).map(p=>p.speciesId).sort();
   var catalog=pokemonCatalog(fmt);({expected,ids:catalog.map(p=>p.id).sort(),before,after:JSON.stringify(threatList(fmt)),catalog})`,{fmt:format});
  assert.deepEqual(result.ids,result.expected);assert.equal(result.before,result.after);assert.equal(new Set(result.ids).size,result.ids.length);
  for(const p of result.catalog){assert(p.fast.length>0,p.id);assert(p.charged.length>0,p.id);assert(p.rec.length>=2,p.id);assert(Number.isInteger(p.dex));}
  if(format.cup==='all'&&format.cp===1500){assert(result.ids.includes('ursaluna'));assert(result.ids.includes('ursaluna_shadow'));assert(result.ids.includes('abra'));assert(!JSON.parse(result.before).some(p=>p.id==='abra'));
   const ranked=run(`var eligible=new Set(threatList(fmt).map(t=>t.id));loadRankings(fmt.cup,'overall',fmt.cp).filter(r=>!r.speciesId.includes('_xs')&&eligible.has(r.speciesId)).slice(0,250).map(r=>r.speciesId)`,{fmt:format});assert(ranked.includes('ursaluna'));
  }
  if(format.cup==='fantasy'){assert(!result.ids.includes('ursaluna'));assert(result.ids.includes('azurill'));for(const p of result.catalog)assert(p.types.some(t=>['dragon','steel','fairy'].includes(t)));}
 }
});
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

// Scripted turns are test-only: the public simulator still uses automatic decisions.
run(`function scriptedBattle(a,b,options){
 var battle=newBattle(F),A=battleSide(a,battle,0),B=battleSide(b,battle,1),sides=[A,B];
 sides.forEach((p,i)=>{battle.setNewPokemon(p,i,false);p.setShields(options.shields||0);p.setStartEnergy(options.energy===undefined?100:options.energy);if(options.hp)p.setStartHp(options.hp);if(options.buffs)p.setStartBuffs(options.buffs[i]);});
 battle.setSandboxMode(true);battle.setActions(options.actions.map(x=>new TimelineAction(x.type||'charged',x.actor,x.turn||1,x.move||0,{shielded:!!x.shielded,buffs:!!x.buffs,charge:1})));
 battle.simulate();return {events:battle.getTimeline(),hp:sides.map(p=>p.hp),energy:sides.map(p=>p.energy),cost:sides[0].chargedMoves[0].energy,attack:sides.map(p=>p.stats.atk),effectiveAttack:sides.map(p=>p.getEffectiveStat(0)),buffs:sides.map(p=>p.statBuffs)};
}`);

test('CMP uses unrounded Attack and ignores Shadow and buff damage multipliers on either side',()=>{
 const high=mon('dragonite',['DRAGON_BREATH','DRAGON_CLAW']);
 const low={...mon('dragonite_shadow',['DRAGON_BREATH','DRAGON_CLAW']),ivs:{atk:14,def:15,hp:15}};
 for(const reverse of [false,true]){
  const options={buffs:reverse?[[4,0],[-4,0]]:[[-4,0],[4,0]],actions:[{actor:0},{actor:1}]};
  const r=run('scriptedBattle(a,b,options)',{a:reverse?low:high,b:reverse?high:low,options,F});
  const higher=reverse?1:0;assert(r.attack[higher]>r.attack[1-higher]);
  assert(r.effectiveAttack[higher]<r.effectiveAttack[1-higher]);
  const charged=r.events.filter(e=>e.type.startsWith('charged'));
  assert.equal(charged[0].actor,higher);assert.equal(charged[0].turn,charged[1].turn);
 }
});

test('a CMP knockout cancels the lower-Attack charged move and preserves its energy',()=>{
 const a=mon('dragonite',['DRAGON_BREATH','DRAGON_CLAW']),b={...a,ivs:{atk:14,def:15,hp:15}};
 const r=run('scriptedBattle(a,b,{hp:10,actions:[{actor:0},{actor:1}]})',{a,b,F});
 assert.deepEqual(Array.from(r.hp),[10,0]);assert.equal(r.events.filter(e=>e.type.startsWith('charged')).length,1);
 assert.equal(r.energy[1],100);assert.equal(r.energy[0],100-r.cost);
});

test('equal-Attack charged knockout mirrors use the reference engine tie approximation',()=>{
 const a=mon('dragonite',['DRAGON_BREATH','DRAGON_CLAW']);
 const r=run('scriptedBattle(a,a,{hp:10,actions:[{actor:0},{actor:1}]})',{a,F});
 // Actual game CMP ties are random. Native simulation resolves both for a symmetric result.
 assert.deepEqual(Array.from(r.hp),[0,0]);assert.equal(r.events.filter(e=>e.type.startsWith('charged')).length,2);
});

test('a charged attack resolves before an incoming one-turn fast knockout',()=>{
 const a=mon('dragonite',['DRAGON_BREATH','DRAGON_CLAW']);
 const r=run('scriptedBattle(a,a,{hp:1,actions:[{actor:1}]})',{a,F});
 assert.equal(r.events.find(e=>e.type.startsWith('charged')).actor,1);
 assert.deepEqual(Array.from(r.hp),[0,1]);
 assert(!r.events.some(e=>e.type.startsWith('fast')));
});

test('guaranteed self debuffs and opponent debuffs survive shielding and clamp at four stages',()=>{
 const cases=[{a:metal,move:'SUPER_POWER',target:'A',stages:[-1,-1]},
  {a:mon('dewgong',['ICE_SHARD','ICY_WIND','DRILL_RUN']),move:'ICY_WIND',target:'B',stages:[-1,0]}];
 for(const row of cases){
  const r=run(`var battle=newBattle(F),A=battleSide(a,battle,0),B=battleSide(b,battle,1);
   battle.setNewPokemon(A,0,false);battle.setNewPokemon(B,1,false);B.setShields(2);battle.setSandboxMode(true);battle.start();
   var move=A.chargedMoves.find(m=>m.moveId===moveId),snapshots=[];
   for(var i=0;i<6;i++){A.energy=100;battle.useMove(A,B,move,true,false,1);snapshots.push({a:A.statBuffs.slice(),b:B.statBuffs.slice(),damage:battle.getTimeline().filter(e=>e.type.indexOf('charged')===0).slice(-1)[0].values[0],shields:B.shields,energy:A.energy});}
   ({snapshots,cost:move.energy})`,{a:row.a,b:regi,moveId:row.move,F});
  assert.equal(r.snapshots[0].damage,1);assert.equal(r.snapshots[0].shields,1);
  assert.deepEqual(Array.from(r.snapshots[0][row.target.toLowerCase()]),row.stages);
  assert.deepEqual(Array.from(r.snapshots[5][row.target.toLowerCase()]),row.stages.map(s=>s?-4:0));
  assert(r.snapshots.every(s=>s.energy===100-r.cost));
 }
});

test('stat-stage multipliers apply before damage flooring and remain separate from Shadow modifiers',()=>{
 const r=run(`var battle=newBattle(F),A=battleSide(a,battle,0),B=battleSide(b,battle,1),rows=[];
  for(var stage=-4;stage<=4;stage++){A.statBuffs=[stage,0];B.statBuffs=[0,-stage];var m=A.fastMove;
   rows.push({stage,baseA:A.stats.atk,baseD:B.stats.def,attack:A.getEffectiveStat(0),defense:B.getEffectiveStat(1),power:m.power,stab:m.stab,effect:B.typeEffectiveness[m.type],damage:DamageCalculator.damage(A,B,m)});}rows`,{a:mon('dragonite_shadow',['DRAGON_BREATH']),b:regi,F});
 const mult=s=>s>0?(4+s)/4:4/(4-s);
 for(const row of r){
  assert(Math.abs(row.attack-row.baseA*mult(row.stage)*1.2)<1e-7);
  assert(Math.abs(row.defense-row.baseD*mult(-row.stage))<1e-7);
  assert.equal(row.damage,Math.floor(.5*row.power*row.stab*row.attack/row.defense*row.effect*1.2999999523162842)+1);
 }
});

test('Morpeko alternates Aura Wheel types, pays energy once and resets form between battles',()=>{
 const F={cup:'all',cp:1500,meta:'great'},a=mon('morpeko_full_belly',['THUNDER_SHOCK','AURA_WHEEL_ELECTRIC','PSYCHIC_FANGS']);
 const r=run(`var battle=newBattle(F),A=battleSide(a,battle,0),B=battleSide(b,battle,1);
  battle.setNewPokemon(A,0,false);battle.setNewPokemon(B,1,false);B.setShields(2);battle.setSandboxMode(true);battle.start();var rows=[];
  for(var i=0;i<2;i++){A.energy=100;var move=A.chargedMoves.find(m=>m.moveId.indexOf('AURA_WHEEL')===0),used=move.moveId;battle.useMove(A,B,move,true,false,1);rows.push({used,form:A.activeFormId,energy:A.energy,buffs:A.statBuffs.slice()});}
  battle.start();({rows,resetForm:A.activeFormId,resetBuffs:A.statBuffs})`,{a,b:mon('registeel',['LOCK_ON','FOCUS_BLAST','ZAP_CANNON']),F});
 assert.equal(r.rows[0].used,'AURA_WHEEL_ELECTRIC');assert.equal(r.rows[0].form,'morpeko_hangry');
 assert.equal(r.rows[1].used,'AURA_WHEEL_DARK');assert.equal(r.rows[1].form,'morpeko_full_belly');
 assert(r.rows.every(row=>row.energy===55));assert.deepEqual(Array.from(r.rows[1].buffs),[2,0]);
 assert.equal(r.resetForm,'morpeko_full_belly');assert.deepEqual(Array.from(r.resetBuffs),[0,0]);
});

test('Morpeko also alternates after non-Aura-Wheel charged attacks',()=>{
 const F={cup:'all',cp:1500,meta:'great'},a=mon('morpeko_full_belly',['THUNDER_SHOCK','PSYCHIC_FANGS','AURA_WHEEL_ELECTRIC']);
 const forms=run(`var battle=newBattle(F),A=battleSide(a,battle,0),B=battleSide(b,battle,1);battle.setNewPokemon(A,0,false);battle.setNewPokemon(B,1,false);battle.start();
  [0,1,2].map(function(){A.energy=100;B.hp=B.stats.hp;battle.useMove(A,B,A.chargedMoves.find(m=>m.moveId==='PSYCHIC_FANGS'));return A.activeFormId;})`,{a,b:regi,F});
 assert.deepEqual(Array.from(forms),['morpeko_hangry','morpeko_full_belly','morpeko_hangry']);
});

test('Morpeko compatibility rule never overwrites a future explicit upstream rule',()=>{
 const boot=require('../engine_glue').BOOT;
 for(const explicit of [null,{type:'future-rule',alternativeFormId:'upstream-form'}]){
  const full={formChange:{type:'toggle',trigger:'charged_move',alternativeFormId:'morpeko_hangry',moveId:'ANY',resetOnSwitch:true}},hangry={};
  if(explicit)hangry.formChange=explicit;
  const gm={getPokemonById:id=>id==='morpeko_full_belly'?full:hangry};
  vm.runInNewContext(boot,{GameMaster:{getInstance:()=>gm},$:{__flush(){}}});
  if(explicit)assert.equal(hangry.formChange,explicit);
  else{assert.equal(hangry.formChange.alternativeFormId,'morpeko_full_belly');assert.equal(full.formChange.alternativeFormId,'morpeko_hangry');}
 }
});
