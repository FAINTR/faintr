// In-context code (runs inside the PvPoke vm). Exact replica of Team Builder grading
// (TeamInterface.js updateTeamResults, default settings) for any league or cup.
// F = { cup, cp, meta }  e.g. { cup: 'all', cp: 1500, meta: 'great' }
module.exports = `
var GL_DEFAULT = { cup: 'all', cp: 1500, meta: 'great' };
function fmtOf(F){ return F && F.cup ? F : GL_DEFAULT; }
function newBattle(F){ F = fmtOf(F); var b = new Battle(); b.setCP(F.cp); b.setCup(F.cup); return b; }

// PvPoke's bulk goals (TeamInterface leagueAverageBulk)
function bulkGoal(F){
  F = fmtOf(F);
  if(F.cp == 2500) return F.cup == 'premier' ? 33000 : 35000;
  if(F.cp == 10000) return 35000;
  if(F.cp == 500) return 10000;
  return 22000;
}

function letterGrade(value, goal){
  var pct = value / goal;
  var letter = 'F';
  if(pct >= .6) letter = 'D';
  if(pct >= .7) letter = 'C';
  if(pct >= .8) letter = 'B';
  if(pct >= .9) letter = 'A';
  return {letter: letter, value: value, goal: goal, pct: pct};
}

function configureRanker(shieldMode, shieldCount, F){
  F = fmtOf(F);
  loadRankings(F.cup, 'overall', F.cp);
  var ranker = RankerMaster.getInstance();
  var s0 = getDefaultMultiBattleSettings(), s1 = getDefaultMultiBattleSettings();
  s0.shields = s1.shields = shieldCount;
  s0.bait = s1.bait = 1;
  ranker.setShieldMode(shieldMode);
  ranker.applySettings(s0, 0);
  ranker.applySettings(s1, 1);
  ranker.setMetaGroup(loadGroup(F.meta));
  ranker.setPrioritizeMeta(true);
  ranker.setRecommendMoveUsage(true);
  ranker.setTargets([]);
  return ranker;
}

// Walk sorted counter rankings exactly like TeamInterface: top 6 non-similar counters.
function pickThreats(counterRankings, allowShadows){
  var counterTeam = [], picked = [], avg = 0, i = 0, count = 0, total = 20;
  while((count < total || counterTeam.length < 6) && i < counterRankings.length){
    var r = counterRankings[i];
    if(r.speciesId.indexOf('_shadow') > -1 && !allowShadows){ i++; continue; }
    if(r.speciesId.indexOf('_xs') > -1){ i++; continue; }
    if(r.pokemon.hasTag('teambuilderexclude')){ i++; continue; }
    var pokemon = r.pokemon;
    if(counterTeam.length < 6){
      var similar = counterTeam.some(function(c){
        var s = c.calculateSimilarity(pokemon, pokemon && pokemon.traits, false);
        return s == -1 || s >= 1000;
      });
      if(!similar){ counterTeam.push(pokemon); picked.push(r); avg += r.rating; }
    }
    i++; count++;
  }
  return {threatScore: Math.round(avg / 6), threats: picked};
}

function teamStaticGrades(team, F){
  F = fmtOf(F);
  var overall = loadRankings(F.cup, 'overall', F.cp);
  var bulk = 0, safety = 0, consistency = 0;
  for(var i = 0; i < team.length; i++){
    team[i].fullReset();
    bulk += team[i].getEffectiveStat(1) * team[i].stats.hp;
    var s = 60;
    for(var n = 0; n < overall.length; n++){
      if(team[i].speciesId == overall[n].speciesId){ s = overall[n].scores[2]; break; }
    }
    safety += s;
    consistency += team[i].calculateConsistency();
  }
  return {bulk: bulk / team.length, safety: safety / team.length, consistency: consistency / team.length};
}

// Full exact grade for one team (slow path, used to validate the fast matrix path).
function gradeTeamExact(ids, F){
  F = fmtOf(F);
  var battle = newBattle(F);
  var team = ids.map(function(id){ return (typeof id === 'string') ? makePokemon(id, battle) : makePokemon(id.id, battle, id.moveset); });
  var ranker = configureRanker('average', 1, F);
  var data = ranker.rank(team, F.cp, gm.getCupById(F.cup), [], 'team-counters');
  var t = pickThreats(data.rankings, true);
  var st = teamStaticGrades(team, F);
  return {
    team: team.map(function(p){ return p.speciesId + ' ' + p.generateMovesetStr(); }),
    threatScore: t.threatScore,
    threats: t.threats.map(function(r){ return r.speciesId + ':' + r.rating; }),
    coverage: letterGrade(1200 - t.threatScore, 680),
    bulk: letterGrade(st.bulk, bulkGoal(F)),
    safety: letterGrade(st.safety, 98),
    consistency: letterGrade(st.consistency, 98)
  };
}
`;
