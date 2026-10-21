// Dev check for team-ranking quality. node tools/validate_3v3.js <dataDir> [games]
// 1) How often FAINTR's fast 3v3 model picks the same winner as 3v3 chains on PvPoke's engine.
// 2) Do higher-ranked teams actually win more? Teams from each slice of the ranking play a HELD-OUT field
//    (strong teams that are not in the Meta Wins field) on PvPoke's engine, scored with and without Meta Wins.
const vm = require('vm');
const path = require('path');
const { makeCtx, unpackMatrix } = require('../build');
const { loadTeams } = require('../teamdata');
const M = require('../metrics');
const T3 = require('../threevthree');
const dir = path.resolve(process.argv[2] || 'assets/data/all-1500');
const G = parseInt(process.argv[3] || '300', 10);
const D = loadTeams(dir);
const matrix = unpackMatrix(require(path.join(dir, 'matrix.json')));
const ctx = makeCtx(path.join(__dirname, '..', 'assets', 'pvpoke-src'));
const F = JSON.stringify({ cup: D.info.fmt.cup, cp: D.info.fmt.cp, meta: D.info.fmt.meta });
const T = T3.ratingTable(matrix);
let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const team = (i) => T3.ordered(D, D.info.perms, i);
const asM = (idx) => idx.map((c) => ({ id: matrix.statics[c].id, moveset: matrix.statics[c].moveset }));
const engine = (A, B) => vm.runInContext(`chainGame(${JSON.stringify(asM(A))}, ${JSON.stringify(asM(B))}, ${F})`, ctx).win;
const scoreAll = (w) => { const out = new Float32Array(D.n), m = {}; for (let i = 0; i < D.n; i++) { for (let k = 0; k < D.K; k++) m[D.info.fields[k]] = D.metrics[i * D.K + k]; out[i] = M.composite(m, w, D.C); } return out; };
const sNew = scoreAll(M.DEFAULT_WEIGHTS), sOld = scoreAll(M.BASE_WEIGHTS);
const rank = (sc) => Array.from(sc.keys()).sort((x, y) => sc[y] - sc[x]);
const byNew = rank(sNew), byOld = rank(sOld);
console.log(`${D.info.fmt.title}: ${D.n} teams`);

let agree = 0;
for (let g = 0; g < G; g++) {
  const A = team(byNew[Math.floor(rnd() * D.n * 0.2)]), B = team(byNew[Math.floor(rnd() * D.n * 0.2)]);
  if ((T3.playGame(T, A, B) > 0) === engine(A, B)) agree++;
}
console.log(`1) fast model and engine chains pick the same winner in ${(agree / G * 100).toFixed(1)}% of ${G} games`);

// Held-out field: 30 teams from the top 2% (by the old score) that aren't in the Meta Wins field
const fieldSet = D.anti ? D.anti.fieldSet : new Set();
const held = [];
while (held.length < 30) { const i = byOld[Math.floor(rnd() * D.n * 0.02)]; if (!fieldSet.has(i) && !held.includes(i)) held.push(i); }
const heldTeams = held.map(team);
const LEADS = [[0, 1, 2], [1, 0, 2], [2, 0, 1]];
function winRate(i) {
  const A = team(i); let w = 0, n = 0;
  for (const B of heldTeams) for (const o of LEADS) { if (engine(A, o.map((j) => B[j]))) w++; n++; }
  return w / n;
}
const slices = [['top 50', 0, 50], ['top 0.1%', 50, Math.floor(D.n * 0.001)], ['0.1-1%', Math.floor(D.n * 0.001), Math.floor(D.n * 0.01)], ['1-10%', Math.floor(D.n * 0.01), Math.floor(D.n * 0.1)], ['10-50%', Math.floor(D.n * 0.1), Math.floor(D.n * 0.5)], ['bottom 50%', Math.floor(D.n * 0.5), D.n]];
console.log('2) engine win rate against a held-out field of 30 strong teams (90 games per team, 15 teams per slice)');
console.log('   slice        new score (with Meta Wins)   old score (without)');
for (const [label, lo, hi] of slices) {
  const pick = (order) => { let s = 0; for (let k = 0; k < 15; k++) s += winRate(order[lo + Math.floor(rnd() * (hi - lo))]); return s / 15; };
  console.log(`   ${label.padEnd(12)} ${(pick(byNew) * 100).toFixed(0).padStart(5)}%                       ${(pick(byOld) * 100).toFixed(0).padStart(5)}%`);
}
if (D.anti) {
  const anti = [...D.anti.verified.values()].filter((v) => !fieldSet.has(v.i)).sort((a, b) => b.engine - a.engine).slice(0, 15);
  const s = anti.reduce((t, v) => t + winRate(v.i), 0) / anti.length;
  console.log(`3) top 15 Anti-Meta teams against the same held-out field: ${(s * 100).toFixed(0)}%`);
}
