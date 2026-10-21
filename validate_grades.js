// Compare matrix-derived grades with the exact PvPoke Team Builder path on random teams.
const vm = require('vm');
const { load } = require('./engine');
const { loadTeams, teamMetrics } = require('./teamdata');
const M = require('./metrics');
const D = loadTeams(process.argv[2] || 'build');
const ctx = load();
vm.runInContext(require('./pvpoke_grades'), ctx);
let seed = parseInt(process.env.SEED||"7",10); const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const N = parseInt(process.argv[3] || '15', 10);
const F = D.info.fmt ? JSON.stringify({ cup: D.info.fmt.cup, cp: D.info.fmt.cp, meta: D.info.fmt.meta }) : 'undefined';
let letterMatch = 0, letters = 0, maxThreatDiff = 0;
for (let k = 0; k < N; k++) {
  const i = Math.floor(rnd() * D.n);
  const ids = D.info.perms[D.orders[i]].map((j) => D.info.cands[D.members[i * 3 + j]]);
  const m = teamMetrics(D, i);
  const ex = vm.runInContext(`gradeTeamExact(${JSON.stringify(ids.map((c) => ({ id: c.id, moveset: null })))}, ${F})`, ctx);
  const mine = { coverage: M.GRADES.coverage.letter(m, D.C), bulk: M.GRADES.bulk.letter(m, D.C), safety: M.GRADES.safety.letter(m, D.C), consistency: M.GRADES.consistency.letter(m, D.C) };
  const theirs = { coverage: ex.coverage.letter, bulk: ex.bulk.letter, safety: ex.safety.letter, consistency: ex.consistency.letter };
  for (const g in mine) { letters++; if (mine[g] === theirs[g]) letterMatch++; }
  const d = Math.abs(m.threatScore - ex.threatScore); maxThreatDiff = Math.max(maxThreatDiff, d);
  console.log(ids.map((c) => c.id).join(','), `threat ${m.threatScore} vs ${ex.threatScore}`, JSON.stringify(mine) === JSON.stringify(theirs) ? 'OK' : `MISMATCH ${JSON.stringify(mine)} ${JSON.stringify(theirs)}`);
}
console.log(`letters ${letterMatch}/${letters}, max threat diff ${maxThreatDiff}`);
