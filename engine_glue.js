// Code that runs inside PvPoke's global scope (Node vm on the desktop, a Web Worker on the website).
// BOOT runs after PvPoke's scripts; HELPERS defines loadRankings, makePokemon and friends.
module.exports = {
  BOOT: `
    function getDefaultMultiBattleSettings(){ return {shields:1,ivs:"original",bait:1,levelCap:50,startHp:1,startEnergy:0,startCooldown:0,optimizeMoveTiming:true,startStatBuffs:[0,0]}; }
    var gm = GameMaster.getInstance(); $.__flush();
    globalThis.__gm = gm;
  `,
  HELPERS: `
    function loadRankings(cup, cat, cp){
      var key = cup + cat + cp;
      if(!gm.rankings[key]){
        var cd = gm.getCupById(cup);
        var fileCup = (cd && cd.rankingAlias) || cup; // some cups reuse another cup's rankings
        gm.rankings[key] = __readData('data/rankings/'+fileCup+'/'+cat+'/rankings-'+cp+'.json');
      }
      return gm.rankings[key];
    }
    function loadGroup(name){
      if(!gm.groups[name]){
        var arr = __readData('data/groups/'+name+'.json');
        gm.groups[name] = arr;
      }
      return gm.groups[name];
    }
    // speciesId may end in _shadow; moveset = [fast, c1, c2]
    // Set exact IVs and climb to the highest level that fits the CP cap (like PvPoke's auto level)
    function applyIVs(p, ivs, levelCap){
      // Best buddy: allow level 41/51 even though the game master's base cap is 50
      var cap = Math.min(levelCap || 50, Math.max(p.baseLevelCap || 50, 51));
      if(cap > (p.baseLevelCap || 50)) p.baseLevelCap = cap;
      p.levelCap = cap;
      p.ivs.atk = +ivs.atk; p.ivs.def = +ivs.def; p.ivs.hp = +ivs.hp;
      var cpCap = p.getBattle().getCP();
      var level = cap;
      p.setLevel(level, true);
      while(p.cp > cpCap && level > 1){ level -= 0.5; p.setLevel(level, true); }
      // PvPoke's Mega initialization can raise this again while setting the level.
      // Rank alternatives against the same explicit ceiling used for these stats.
      p.levelCap = cap;
      return p;
    }
    function makePokemon(id, battle, moveset, ivs, levelCap){
      var cup = battle.getCup() ? battle.getCup().name : 'all';
      loadRankings(cup === 'custom' ? 'all' : cup, 'overall', battle.getCP());
      var p = new Pokemon(id, 0, battle);
      p.initialize(battle.getCP());
      if(ivs) applyIVs(p, ivs, levelCap);
      else if(levelCap) applyIVs(p, {atk:p.ivs.atk,def:p.ivs.def,hp:p.ivs.hp}, levelCap);
      if(moveset){
        // Start from PvPoke's pick so a Mega keeps its extra "+" charged move, then apply the chosen moves
        p.selectRecommendedMoveset();
        p.selectMove('fast', moveset[0]);
        if(moveset[1]) p.selectMove('charged', moveset[1], 0);
        if(moveset[2]) p.selectMove('charged', moveset[2], 1);
        else if(p.chargedMoves.length > 1 && !moveset[3]) p.chargedMoves.splice(1, 1); // "None" for the second charged move
        if(moveset[3]) p.selectMove('charged', moveset[3], 2);
      } else p.selectRecommendedMoveset();
      return p;
    }
  `,
};
