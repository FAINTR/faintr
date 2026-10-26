// In-context helpers (run inside the PvPoke vm, after pvpoke_grades.js).
// Every function takes a format F = { cup, cp, meta } (defaults to Great League).
module.exports = `
var __threatCache = {};
function fkey(F){ F = fmtOf(F); return F.cup + '-' + F.cp; }
function threatList(F){
  F = fmtOf(F);
  var k = fkey(F);
  if(!__threatCache[k]){
    var battle = newBattle(F);
    var cup = gm.getCupById(F.cup);
    __threatCache[k] = gm.generateFilteredPokemonList(battle, cup.include, cup.exclude).map(function(p){
      return { id: p.speciesId, name: p.speciesName, skip: p.speciesId.indexOf('_xs') > -1 || p.hasTag('teambuilderexclude') };
    });
  }
  return __threatCache[k];
}

function traitKey(tr){
  return tr.pros.map(function(x){return x.trait;}).join(',') + '|' + tr.cons.map(function(x){return x.trait;}).join(',');
}

// One team member vs every threat: ratings at 0/1/2 shields (PvPoke TeamRanker, team of 1)
// plus each counter's post-battle traits (used by PvPoke's threat de-duplication).
function memberRow(id, moveset, F, ivs, levelCap){
  F = fmtOf(F);
  var threats = threatList(F);
  var idx = {}; threats.forEach(function(t, i){ idx[t.id] = i; });
  var n = threats.length;
  var row = { r0: new Array(n).fill(1000), r1: new Array(n).fill(1000), r2: new Array(n).fill(1000), ra: new Array(n).fill(1000), traits: new Array(n).fill('|') };
  var battle = newBattle(F);
  var used = null;
  for (var s = 0; s <= 2; s++){
    var member = makePokemon(id, battle, moveset, ivs, levelCap);
    if(!used) used = [member.fastMove.moveId].concat(member.chargedMoves.filter(Boolean).map(function(m){ return m.moveId; }));
    var ranker = configureRanker('single', s, F);
    var data = ranker.rank([member], F.cp, gm.getCupById(F.cup), [], 'team-counters');
    var key = ['r0','r1','r2'][s];
    data.rankings.forEach(function(r){
      var i = idx[r.speciesId]; if(i === undefined) return;
      row[key][i] = r.matchups[0].rating;
    });
  }
  // Team Builder's own "Average (0 & 1 shields)" pass. Its 1-shield battle doesn't always match a standalone
  // 1-shield battle, so Coverage and the threat traits come from this pass to match pvpoke.com exactly.
  var memberA = makePokemon(id, battle, moveset, ivs, levelCap);
  var rankerA = configureRanker('average', 1, F);
  var dataA = rankerA.rank([memberA], F.cp, gm.getCupById(F.cup), [], 'team-counters');
  dataA.rankings.forEach(function(r){
    var i = idx[r.speciesId]; if(i === undefined) return;
    row.ra[i] = r.matchups[0].rating;
    row.traits[i] = traitKey(r.pokemon.generateTraits());
  });
  row.id = id; row.moveset = used;
  return row;
}

// Same ratings as memberRow, but only against a few opponents (counter finder)
function memberVs(id, moveset, F, ivs, levelCap, oppIds){
  F = fmtOf(F);
  var out = { r0: [], r1: [], r2: [] };
  var battle = newBattle(F);
  for (var s = 0; s <= 2; s++){
    var member = makePokemon(id, battle, moveset, ivs, levelCap);
    var ranker = configureRanker('single', s, F);
    ranker.setTargets(oppIds.map(function(o){ return makePokemon(o, battle); }));
    var data = ranker.rank([member], F.cp, gm.getCupById(F.cup), [], 'team-counters');
    var by = {}; data.rankings.forEach(function(r){ by[r.speciesId] = r.matchups[0].rating; });
    ranker.setTargets([]);
    out[['r0','r1','r2'][s]] = oppIds.map(function(o){ return by[o] === undefined ? 1000 : by[o]; });
  }
  return out;
}

var __TYPES = ['bug','dark','dragon','electric','fairy','fighting','fire','flying','ghost','grass','ground','ice','normal','poison','psychic','rock','steel','water'];
function memberStatic(id, moveset, F, ivs, levelCap){
  F = fmtOf(F);
  var battle = newBattle(F);
  var p = makePokemon(id, battle, moveset, ivs, levelCap);
  var st = teamStaticGrades([p], F);
  function score(cat){ var arr = loadRankings(F.cup, cat, F.cp); for(var i=0;i<arr.length;i++) if(arr[i].speciesId == id) return arr[i].score; return 0; }
  return {
    id: id, name: p.speciesName, dex: p.dex,
    types: p.types.filter(function(t){ return t !== 'none'; }),
    moveset: [p.fastMove.moveId].concat(p.chargedMoves.filter(Boolean).map(function(m){ return m.moveId; })),
    moves: [p.fastMove.name].concat(p.chargedMoves.filter(Boolean).map(function(m){ return m.name; })),
    moveStr: p.generateMovesetStr(),
    bulk: st.bulk, safety: st.safety, consistency: st.consistency,
    weak: __TYPES.filter(function(t){ return DamageCalculator.getEffectiveness(t, p.types) > 1.01; }),
    lead: score('leads'), closer: score('closers'), sw: score('switches'), overall: score('overall'),
    base: 'dex' + p.dex, // GO and PvPoke allow one Pokemon per Pokedex number (no Stunfisk + Galarian Stunfisk)
    mega: p.hasTag('mega'), dex: p.dex,
    ivs: {atk: p.ivs.atk, def: p.ivs.def, hp: p.ivs.hp}, level: p.level, cp: p.cp,
    stats: {atk: +p.stats.atk.toFixed(2), def: +p.stats.def.toFixed(2), hp: p.stats.hp}
  };
}

// Meta context for the added grades: top-100 overall (no XS) and move types of the top 50.
function metaContext(F){
  F = fmtOf(F);
  var overall = loadRankings(F.cup,'overall',F.cp);
  var metaSet = {}; loadGroup(F.meta).forEach(function(p){ metaSet[p.speciesId] = 1; });
  var top = overall.filter(function(r){ return r.speciesId.indexOf('_xs') === -1; }).slice(0, 100);
  var types = {};
  top.slice(0, 50).forEach(function(r){ r.moveset.forEach(function(mid){ var m = gm.getMoveById(mid); if(m) types[m.type] = 1; }); });
  return { metaGroup: Object.keys(metaSet), metaOpp: top.map(function(r){ return {id: r.speciesId, w: r.score}; }), metaTypes: Object.keys(types) };
}

// Similarity with injected (post-battle) traits, reusing PvPoke's own calculateSimilarity.
var __simP = {}, __simB = {}, __traitObjs = {};
function __tr(key){ if(!__traitObjs[key]){ var parts = key.split('|'); function L(x){ return x ? x.split(',').map(function(t){ return {trait: t}; }) : []; } __traitObjs[key] = {pros: L(parts[0]), cons: L(parts[1])}; } return __traitObjs[key]; }
function __poke(id, F){
  var k = fkey(F);
  if(!__simB[k]){ __simB[k] = newBattle(F); __simP[k] = {}; }
  if(!__simP[k][id]) __simP[k][id] = makePokemon(id, __simB[k]);
  return __simP[k][id];
}
function similarWithTraits(a, b, first, keyA, keyB, F){
  var A = __poke(a, F), B = __poke(b, F);
  A.generateTraits = function(){ return __tr(keyA); };
  B.generateTraits = function(){ return __tr(keyB); };
  B.traits = first ? undefined : __tr(keyB);
  var s = A.calculateSimilarity(B, B.traits, false);
  return s == -1 || s >= 1000;
}

// All eligible Pokemon with their move pools (for pickers)
function pokemonCatalog(F){
  F = fmtOf(F);
  var overall = loadRankings(F.cup,'overall',F.cp);
  var rank = {}; overall.forEach(function(r, i){ rank[r.speciesId] = i + 1; });
  var battle = newBattle(F);
  // The ranked opponent pool deliberately drops low-stat builds. Manual choices
  // must keep every released, cup-legal species regardless of competitiveness.
  // false disables only that stat-product cutoff, preserving native cup bans.
  var cup = gm.getCupById(F.cup);
  return gm.generateFilteredPokemonList(battle, cup.include, cup.exclude, undefined, undefined, false)
    .filter(function(p){ return p.speciesId.indexOf('_xs') === -1; }).map(function(eligible){
    var p = makePokemon(eligible.speciesId, battle);
    return { id: p.speciesId, name: p.speciesName, rank: rank[p.speciesId] || 9999, dex: p.dex, mega:p.hasTag('mega'),
      types: p.types.filter(function(x){ return x !== 'none'; }),
      fast: p.fastMovePool.map(function(m){ return [m.moveId, m.name]; }),
      charged: p.chargedMovePool.map(function(m){ return [m.moveId, m.name]; }),
      rec: [p.fastMove.moveId].concat(p.chargedMoves.filter(Boolean).map(function(m){ return m.moveId; })) };
  }).sort(function(a, b){ return a.rank - b.rank; });
}

// Every species in the game master (for the Roster, which isn't tied to one league)
function fullCatalog(){
  var battle = newBattle({ cup: 'all', cp: 10000, meta: 'master' });
  return gm.data.pokemon.filter(function(d){ return d.speciesId.indexOf('_xs') === -1 && d.released !== false; }).map(function(d){
    var p = new Pokemon(d.speciesId, 0, battle); p.initialize(10000);
    return { id: d.speciesId, name: d.speciesName, dex: d.dex, types: d.types.filter(function(x){ return x !== 'none'; }),
      fast: p.fastMovePool.map(function(m){ return [m.moveId, m.name]; }),
      charged: p.chargedMovePool.map(function(m){ return [m.moveId, m.name]; }),
      extra: (p.extraChargedMovePool||[]).map(function(m){return [m.moveId,m.name];}),
      shadow: d.speciesId.indexOf('_shadow') > -1 };
  }).sort(function(a, b){ return a.dex - b.dex || (a.name > b.name ? 1 : -1); });
}

// pvpoke.com Team Builder link, built with PvPoke's own URL code
function pvpokeTeamLink(members, F){
  F = fmtOf(F);
  var battle = newBattle(F);
  var strs = members.map(function(m){ return makePokemon(m.id, battle, m.moveset, m.ivs || null, m.levelCap).generateURLPokeStr('team-builder'); });
  return 'https://pvpoke.com/team-builder/' + F.cup + '/' + F.cp + '/' + encodeURIComponent(strs.join(','));
}

// ---------- IVs
function rankedIVCombinations(p, floor){
  var combos=p.generateIVCombinations('overall',1,4096,null,floor>0?floor:undefined);
  // Match initialize(): all Pokémon have at least 10 HP; Shedinja is fixed at 10.
  // PvPoke's enumeration currently floors HP without these two special cases.
  combos.forEach(function(c){c.hp=p.dex===292?10:Math.max(10,c.hp);c.overall=c.atk*c.def*c.hp;});
  combos.sort(function(a,b){return b.overall-a.overall;});
  return combos;
}
function ivInfo(id, ivs, levelCap, F){
  F = fmtOf(F);
  var battle = newBattle(F);
  var p = makePokemon(id, battle, null, ivs || null, levelCap);
  var combos = rankedIVCombinations(p);
  var key = function(c){ return c.ivs.atk + '/' + c.ivs.def + '/' + c.ivs.hp; };
  var mine = p.ivs.atk + '/' + p.ivs.def + '/' + p.ivs.hp;
  var rank = combos.findIndex(function(c){ return key(c) === mine; }) + 1;
  // IVs below this species' catch floor (e.g. a 0-Attack legendary) aren't in PvPoke's list: rank them among it
  var mySP = p.stats.atk * p.stats.def * p.stats.hp;
  if(!rank) rank = combos.filter(function(c){ return c.overall > mySP + 1e-6; }).length + 1;
  var best = combos[0];
  function statRank(stat){ var v = p.stats[stat]; return combos.filter(function(c){ return c[stat] > v + 1e-9; }).length + 1; }
  var d = gm.getPokemonById(id);
  var def = d && d.defaultIVs && d.defaultIVs['cp' + F.cp];
  return {
    id: id, ivs: {atk: p.ivs.atk, def: p.ivs.def, hp: p.ivs.hp}, level: p.level, cp: p.cp, levelCap: p.levelCap, cpCap: F.cp,
    stats: {atk: +p.stats.atk.toFixed(2), def: +p.stats.def.toFixed(2), hp: p.stats.hp},
    statProduct: Math.round(p.stats.atk * p.stats.def * p.stats.hp),
    rank: rank, count: combos.length,
    pctOfBest: best ? (p.stats.atk * p.stats.def * p.stats.hp) / best.overall * 100 : 100,
    statRanks: {atk: statRank('atk'), def: statRank('def'), hp: statRank('hp')},
    rank1: best ? {atk: best.ivs.atk, def: best.ivs.def, hp: best.ivs.hp, level: best.level} : null,
    defaultIVs: def ? {atk: def[1], def: def[2], hp: def[3], level: def[0]} : null
  };
}

// ---------- PvP IVs tab: every IV combination for one species under a CP cap
// floor: minimum IV (0 wild, 1/2/3/5 trades by friendship, 4 weather boost, 10 raid/research/egg, 12 lucky)
function ivTable(id, cpCap, levelCap, floor){
  var F = cpCap >= 10000 ? { cup: 'all', cp: 10000, meta: 'master' } : cpCap === 2500 ? { cup: 'all', cp: 2500, meta: 'ultra' } : cpCap === 500 ? { cup: 'little', cp: 500, meta: 'little' } : { cup: 'all', cp: cpCap, meta: 'great' };
  var battle = newBattle(F);
  battle.setCP && battle.setCP(cpCap);
  var p = makePokemon(id, battle, null, { atk: 15, def: 15, hp: 15 }, levelCap || 50);
  var cap = Math.min(levelCap || 50, 51);
  if(cap > p.baseLevelCap) p.baseLevelCap = cap;
  p.levelCap = cap;
  var combos = rankedIVCombinations(p,floor);
  var best = combos.length ? combos[0].overall : 1;
  var bestAtk = 0, bestDef = 0, bestHp = 0;
  combos.forEach(function(c){ if(c.atk > bestAtk) bestAtk = c.atk; if(c.def > bestDef) bestDef = c.def; if(c.hp > bestHp) bestHp = c.hp; });
  return {
    id: id, name: p.speciesName, cpCap: cpCap, levelCap: cap, floor: combos.length ? Math.min.apply(null, combos.map(function(c){ return Math.min(c.ivs.atk, c.ivs.def, c.ivs.hp); })) : floor,
    best: { atk: bestAtk, def: bestDef, hp: bestHp },
    rows: combos.map(function(c, i){ return [i + 1, c.ivs.atk, c.ivs.def, c.ivs.hp, c.level, c.cp, +(c.overall / best * 100).toFixed(2), +c.atk.toFixed(2), +c.def.toFixed(2), c.hp]; })
  };
}

// The evolution family of a species (same shadow status), from the earliest stage
function familyOf(id){
  var shadow = id.indexOf('_shadow') > -1, baseId = id.replace('_shadow', '');
  var d = gm.getPokemonById(baseId);
  if(!d || !d.family) return [id];
  var root = d, guard = 0;
  while(root.family && root.family.parent && guard++ < 5){ var up = gm.getPokemonById(root.family.parent); if(!up) break; root = up; }
  var out = [], seen = {};
  (function walk(x, depth){
    if(!x || seen[x.speciesId] || depth > 4) return; seen[x.speciesId] = 1;
    var sid = shadow ? x.speciesId + '_shadow' : x.speciesId;
    if(gm.getPokemonById(sid)) out.push(sid);
    ((x.family && x.family.evolutions) || []).forEach(function(e){ walk(gm.getPokemonById(e), depth + 1); });
  })(root, 0);
  return out.length ? out : [id];
}

function isDescendant(anc, id){
  var d = gm.getPokemonById(id.replace('_shadow','')), guard = 0, target = anc.replace('_shadow','');
  while(d && d.family && d.family.parent && guard++ < 5){ if(d.family.parent === target) return true; d = gm.getPokemonById(d.family.parent); }
  return false;
}

// These IVs across the family in one league: rank, best level/CP, and the CP each earlier stage must stay under
function familyRanks(id, ivs, cpCap, levelCap){
  var fam = familyOf(id);
  var F = cpCap >= 10000 ? { cup: 'all', cp: 10000, meta: 'master' } : cpCap === 2500 ? { cup: 'all', cp: 2500, meta: 'ultra' } : cpCap === 500 ? { cup: 'little', cp: 500, meta: 'little' } : { cup: 'all', cp: cpCap, meta: 'great' };
  var battle = newBattle(F);
  return fam.map(function(fid){
    var info = ivInfo(fid, ivs, levelCap, F);
    // CP of each family member at this member's best level (to evolve without passing the cap)
    var pre = fam.map(function(o){ if(o === fid) return null; var q = makePokemon(o, battle, null, ivs, 51); q.setLevel(info.level, true); return { id: o, name: q.speciesName, cp: q.cp }; }).filter(Boolean);
    var d = gm.getPokemonById(fid);
    return { id: fid, name: d ? d.speciesName : fid, rank: info.rank, count: info.count, pctOfBest: info.pctOfBest, level: info.level, cp: info.cp, rank1: info.rank1, statProduct: info.statProduct, atLevel: pre };
  });
}

// ---------- Roster: what a caught Pokemon can do in each league
// Finds its current level from IVs + CP, then the best level, CP and IV rank under each league cap.
function rosterEval(id, ivs, cp, levelCap){
  var cap = levelCap || 50;
  var ml = newBattle({ cup: 'all', cp: 10000, meta: 'master' });
  var p = makePokemon(id, ml, null, ivs, cap);
  // Current level from the CP you entered: exact match, else the highest level at or under it (CP is rounded in game)
  var current = null, exact = false;
  if(cp){
    for(var l = 1; l <= 51; l += 0.5){
      p.setLevel(l, true);
      if(p.cp === +cp){ current = l; exact = true; break; }
      if(p.cp < +cp) current = l;
    }
    if(!exact && current !== null){ p.setLevel(current, true); if(+cp - p.cp > Math.max(15, p.cp * 0.02)) current = null; }
  }
  var third = (gm.getPokemonById(id) || {}).thirdMoveCost;
  var leagues = [500, 1500, 2500, 10000].map(function(lim){
    var F = lim === 10000 ? { cup: 'all', cp: 10000, meta: 'master' } : lim === 2500 ? { cup: 'all', cp: 2500, meta: 'ultra' } : lim === 500 ? { cup: 'little', cp: 500, meta: 'little' } : GL_DEFAULT;
    var info = ivInfo(id, ivs, cap, F);
    var status = 'unknown';
    if(current !== null){
      if(+cp > lim) status = 'over';
      else if(current < info.level - 1e-9) status = 'powerup';
      else status = 'ready';
    }
    return { cp: lim, level: info.level, maxCp: info.cp, rank: info.rank, count: info.count, pctOfBest: info.pctOfBest, status: status };
  });
  // Later evolutions: how these IVs rank if you evolve it (Great, Ultra, Master)
  var fam = familyOf(id), me = fam.indexOf(id);
  var later = fam.filter(function(f, k){ return k > me && isDescendant(id, f); });
  var evolves = later.slice(0, 8).map(function(fid){
    var d = gm.getPokemonById(fid);
    return { id: fid, name: d ? d.speciesName : fid, leagues: [1500, 2500, 10000].map(function(lim){
      var F2 = lim === 10000 ? { cup: 'all', cp: 10000, meta: 'master' } : lim === 2500 ? { cup: 'all', cp: 2500, meta: 'ultra' } : GL_DEFAULT;
      var i2 = ivInfo(fid, ivs, cap, F2); return { cp: lim, rank: i2.rank, count: i2.count, pctOfBest: +i2.pctOfBest.toFixed(1), level: i2.level, maxCp: i2.cp };
    }) };
  });
  return { v: 2, id: id, currentLevel: current, exactLevel: exact, thirdMoveCost: third || null, leagues: leagues, evolves: evolves };
}

// ---------- 1v1 battle with timeline
function battleSide(s, battle, index){
  var p = makePokemon(s.id, battle, s.moveset && s.moveset.length ? s.moveset : null, s.ivs || null, s.levelCap);
  p.index = index;
  return p;
}
function runBattle(a, b, shieldsA, shieldsB, baitA, baitB, energyA, energyB, F){
  var battle = newBattle(F);
  var A = battleSide(a, battle, 0), B = battleSide(b, battle, 1);
  battle.setNewPokemon(A, 0, false); battle.setNewPokemon(B, 1, false);
  A.setShields(shieldsA); B.setShields(shieldsB);
  A.baitShields = baitA ? 1 : 0; B.baitShields = baitB ? 1 : 0;
  if(!baitA) A.isCustom = true; if(!baitB) B.isCustom = true;
  if(energyA) A.startEnergy = Math.min(100, energyA); if(energyB) B.startEnergy = Math.min(100, energyB);
  battle.simulate();
  var ra = Math.floor(((A.hp / A.stats.hp) + ((B.stats.hp - B.hp) / B.stats.hp)) * 500);
  var rb = Math.floor(((B.hp / B.stats.hp) + ((A.stats.hp - A.hp) / A.stats.hp)) * 500);
  return {battle: battle, A: A, B: B, ra: ra, rb: rb};
}
// 3v3 played on PvPoke's engine: HP, energy and shields carry over between fights.
// Switching uses simple rules (switch out of a losing lead once; replace a faint with the best answer).
// A and B are [{id, moveset}] in play order. Returns {win: bool, margin, fights}.
function chainGame(A, B, F){
  F = fmtOf(F);
  var battle = newBattle(F);
  function mk(m){ var p = makePokemon(m.id, battle, m.moveset || null); return { p: p, hp: p.stats.hp, energy: 0, max: p.stats.hp }; }
  var a = A.map(mk), b = B.map(mk), sh = [2, 2];
  function duel(x, y, sx, sy){
    // x vs y from current state; returns {xhp, yhp, xe, ye, sxLeft, syLeft}
    var px = x.p, py = y.p;
    px.reset(); py.reset();
    px.startHp = x.hp; px.startEnergy = x.energy; py.startHp = y.hp; py.startEnergy = y.energy;
    battle.setNewPokemon(px, 0, false); battle.setNewPokemon(py, 1, false);
    px.setShields(sx); py.setShields(sy);
    px.baitShields = 1; py.baitShields = 1;
    px.reset(); py.reset();
    px.hp = x.hp; py.hp = y.hp; px.energy = x.energy; py.energy = y.energy;
    px.startHp = x.hp; py.startHp = y.hp; px.startEnergy = x.energy; py.startEnergy = y.energy;
    battle.simulate();
    return { xhp: Math.max(0, px.hp), yhp: Math.max(0, py.hp), xe: px.energy, ye: py.energy, sx: px.shields, sy: py.shields };
  }
  function score(x, y, sx, sy){ var r = duel(x, y, sx, sy); return r.xhp / x.max - r.yhp / y.max; }
  var ia = 0, ib = 0;
  // Lead switch: the side losing the lead brings in its best answer once
  var lead = score(a[0], b[0], 1, 1);
  if(lead < -0.1){ var best = 0, bv = lead; for(var k = 1; k < 3; k++){ var v = score(a[k], b[0], 1, 1); if(v > bv){ bv = v; best = k; } } if(bv > 0.05) ia = best; }
  else if(lead > 0.1){ var best2 = 0, bv2 = -lead; for(var k2 = 1; k2 < 3; k2++){ var v2 = score(b[k2], a[0], 1, 1); if(v2 > bv2){ bv2 = v2; best2 = k2; } } if(bv2 > 0.05) ib = best2; }
  var fights = 0;
  while(fights < 8){
    var r = duel(a[ia], b[ib], sh[0], sh[1]); fights++;
    a[ia].hp = r.xhp; b[ib].hp = r.yhp; a[ia].energy = r.xe; b[ib].energy = r.ye; sh[0] = r.sx; sh[1] = r.sy;
    var pick = function(side, other, oi, sMine, sTheirs){
      var best = -1, bv = -Infinity;
      for(var k = 0; k < 3; k++){ if(side[k].hp <= 0) continue; var v = score(side[k], other[oi], sMine, sTheirs); if(v > bv){ bv = v; best = k; } }
      return best;
    };
    var aDown = a[ia].hp <= 0, bDown = b[ib].hp <= 0;
    if(aDown){ ia = pick(a, b, ib, sh[0], sh[1]); }
    if(bDown){ ib = pick(b, a, ia < 0 ? 0 : ia, sh[1], sh[0]); }
    if(ia < 0 || ib < 0) break;
    if(!aDown && !bDown) break; // timeout: both alive (shouldn't happen)
  }
  var la = a.reduce(function(t, x){ return t + x.hp / x.max; }, 0), lb = b.reduce(function(t, x){ return t + x.hp / x.max; }, 0);
  var aliveA = a.filter(function(x){ return x.hp > 0; }).length, aliveB = b.filter(function(x){ return x.hp > 0; }).length;
  return { win: aliveB === 0 && aliveA > 0 ? true : aliveA === 0 && aliveB > 0 ? false : la > lb, margin: la - lb, fights: fights };
}

function sideInfo(p){
  return { id: p.speciesId, name: p.speciesName, types: p.types.filter(function(t){ return t !== 'none'; }),
    level: p.level, cp: p.cp, ivs: {atk: p.ivs.atk, def: p.ivs.def, hp: p.ivs.hp},
    stats: {atk: +p.stats.atk.toFixed(2), def: +p.stats.def.toFixed(2), hp: p.stats.hp},
    fast: {id: p.fastMove.moveId, name: p.fastMove.name, type: p.fastMove.type, power: p.fastMove.power, energyGain: p.fastMove.energyGain, turns: p.fastMove.cooldown / 500},
    charged: p.chargedMoves.filter(Boolean).map(function(m){ return {id: m.moveId, name: m.name, type: m.type, power: m.power, energy: m.energy}; }) };
}
function battleWinner(A,B){
  // Ratings are rounded for display; a narrow timeout lead can round to 500.
  // Compare the exact remaining HP fractions before rounding the rating.
  var difference=A.hp*B.stats.hp-B.hp*A.stats.hp;
  return difference>0?0:difference<0?1:-1;
}
function battleDetail(a, b, opts, F){
  opts = opts || {};
  var sA = opts.shieldsA === undefined ? 1 : opts.shieldsA, sB = opts.shieldsB === undefined ? 1 : opts.shieldsB;
  var baitA = opts.baitA !== false, baitB = opts.baitB !== false;
  var r = runBattle(a, b, sA, sB, baitA, baitB, opts.energyA, opts.energyB, F);
  var tl = r.battle.getTimeline().map(function(e){
    return {type: e.type, name: e.name, actor: e.actor, turn: e.turn, time: e.time, values: e.values};
  });
  var out = {
    a: sideInfo(r.A), b: sideInfo(r.B),
    ratingA: r.ra, ratingB: r.rb, winner: battleWinner(r.A,r.B),
    hpA: r.A.hp, hpB: r.B.hp, energyA: r.A.energy, energyB: r.B.energy,
    turns: r.battle.getTurns(), duration: r.battle.getDuration(), timeline: tl, shields: [sA, sB]
  };
  var grid = [];
  for(var i = 0; i <= 2; i++){ var row = []; for(var j = 0; j <= 2; j++){ row.push(runBattle(a, b, i, j, baitA, baitB, opts.energyA, opts.energyB, F).ra); } grid.push(row); }
  out.grid = grid;
  // Damage reference cards describe neutral starting stats, not the buffs/debuffs
  // left over after a second, hidden battle (e.g. Superpower lowering Attack).
  var neutralBattle = newBattle(F);
  var A = battleSide(a, neutralBattle, 0), B = battleSide(b, neutralBattle, 1);
  function bp(att, def){
    var move = att.fastMove;
    var eff = def.typeEffectiveness[move.type];
    var dmg = DamageCalculator.damageByStats(att, def, att.getEffectiveStat(0), def.getEffectiveStat(1), eff, move);
    var next = null;
    try {
      var list = att.calculateBreakpoints(def, move);
      for(var k = 0; k < list.length; k++){ if(list[k].damage > dmg){ next = {damage: list[k].damage, attack: +list[k].attack.toFixed(2)}; break; } }
    } catch(e){}
    return {move: move.name, damage: dmg, attack: +att.getEffectiveStat(0).toFixed(2), next: next};
  }
  out.breakpoints = {a: bp(A, B), b: bp(B, A)};
  out.chargedDamage = {
    a: A.chargedMoves.filter(Boolean).map(function(m){ return {name: m.name, damage: DamageCalculator.damageByStats(A, B, A.getEffectiveStat(0), B.getEffectiveStat(1), B.typeEffectiveness[m.type], m), energy: m.energy}; }),
    b: B.chargedMoves.filter(Boolean).map(function(m){ return {name: m.name, damage: DamageCalculator.damageByStats(B, A, B.getEffectiveStat(0), A.getEffectiveStat(1), A.typeEffectiveness[m.type], m), energy: m.energy}; })
  };
  return out;
}
`;
