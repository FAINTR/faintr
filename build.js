// Full data build for one format: matchup matrix (candidates x every eligible threat), then score every team.
// CLI: node build.js <srcDir> <outDir> [poolSize] [formatKey e.g. all-1500]
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { Worker } = require('worker_threads');
const { load } = require('./engine');
const { Scorer, PERMS } = require('./scoring');
const M = require('./metrics');
const T3 = require('./threevthree');
const SCHEMA = 4; // teams.bin layout + Meta Wins + anti-meta data

function makeCtx(srcDir) {
  const ctx = load(srcDir);
  vm.runInContext(require('./pvpoke_grades'), ctx);
  vm.runInContext(require('./memberlib'), ctx);
  return ctx;
}
const fjson = (F) => JSON.stringify({ cup: F.cup, cp: F.cp, meta: F.meta });

function runWorkers(srcDir, F, cands, nWorkers, onProgress) {
  const chunks = Array.from({ length: nWorkers }, (_, w) => cands.filter((_, i) => i % nWorkers === w));
  const rows = {};
  let done = 0;
  return Promise.all(chunks.filter((c) => c.length).map((chunk) => new Promise((resolve, reject) => {
    const w = new Worker(path.join(__dirname, 'build_worker.js'), { workerData: { srcDir, F, cands: chunk } });
    w.on('message', (m) => {
      if (m.row) { rows[m.row.id] = m.row; done++; onProgress && onProgress('matrix', done, cands.length); }
      if (m.done) resolve();
    });
    w.on('error', reject);
    w.on('exit', (code) => { if (code !== 0) reject(new Error('worker exit ' + code)); });
  }))).then(() => rows);
}

// Encode rows compactly (trait strings become dictionary ids) and decode them back
function packRows(rows) {
  const dict = [], idx = new Map();
  const packed = rows.map((r) => ({ id: r.id, moveset: r.moveset, r0: r.r0, r1: r.r1, r2: r.r2, ra: r.ra,
    t: r.traits.map((k) => { let i = idx.get(k); if (i === undefined) { i = dict.length; idx.set(k, i); dict.push(k); } return i; }) }));
  return { traitDict: dict, rows: packed };
}

// Anti-Meta check on PvPoke's engine: each team plays 3v3 chains against the meta field (three leads each)
function runChainWorkers(srcDir, F, jobs, field, nWorkers, onProgress) {
  const chunks = Array.from({ length: nWorkers }, (_, w) => jobs.filter((_, i) => i % nWorkers === w));
  const out = {};
  let done = 0;
  return Promise.all(chunks.filter((c) => c.length).map((chunk) => new Promise((resolve, reject) => {
    const w = new Worker(path.join(__dirname, 'antimeta_worker.js'), { workerData: { srcDir, F, jobs: chunk, field } });
    w.on('message', (m) => {
      if (m.res) { out[m.res.i] = m.res; done++; onProgress && onProgress('verify', done, jobs.length); }
      if (m.done) resolve();
    });
    w.on('error', reject);
    w.on('exit', (code) => { if (code !== 0) reject(new Error('worker exit ' + code)); });
  }))).then(() => out);
}
function unpackMatrix(mx) {
  if (mx.metaField && mx.meta) mx.meta.metaField = mx.metaField;
  if (mx.traitDict) mx.rows = mx.rows.map((r) => ({ id: r.id, moveset: r.moveset, r0: r.r0, r1: r.r1, r2: r.r2, ra: r.ra, traits: r.t.map((i) => mx.traitDict[i]) }));
  return mx;
}

function quantiles(col, n = 1000) {
  const s = Float64Array.from(col).sort();
  const out = [];
  for (let i = 0; i <= n; i++) out.push(+s[Math.min(s.length - 1, Math.round((i / n) * (s.length - 1)))].toFixed(4));
  return out;
}

async function buildAll(srcDir, outDir, opts = {}) {
  const F = opts.fmt || { key: 'all-1500', cup: 'all', cp: 1500, meta: 'great', title: 'Great League' };
  const poolSize = opts.poolSize || 150;
  const nWorkers = opts.workers || Math.max(1, Math.min(8, os.cpus().length - (opts.leaveOneCore ? 1 : 0)));
  const log = opts.onProgress || (() => {});
  fs.mkdirSync(outDir, { recursive: true });
  const ctx = makeCtx(srcDir);
  const base = vm.runInContext(`(function(){
    var F = ${fjson(F)};
    var overall = loadRankings(F.cup,'overall',F.cp);
    var elig = {}; threatList(F).forEach(function(t){ elig[t.id] = 1; });
    var cands = overall.filter(function(r){ return r.speciesId.indexOf('_xs') === -1 && elig[r.speciesId]; }).slice(0, ${poolSize})
      .map(function(r){ return {id: r.speciesId, moveset: r.moveset}; });
    return { cands: cands, threats: threatList(F), meta: metaContext(F), bulkGoal: bulkGoal(F),
      statics: cands.map(function(c){ return memberStatic(c.id, c.moveset, F); }) };
  })()`, ctx);
  log('start', 0, base.cands.length, `${F.title || F.key}: ${base.cands.length} candidates x ${base.threats.length} threats on ${nWorkers} workers`);
  const t0 = Date.now();
  const rowsById = await runWorkers(srcDir, F, base.cands, nWorkers, log);
  const rows = base.cands.map((c) => rowsById[c.id]);
  const statics = base.statics;

  const scorer = new Scorer(ctx, base.threats, base.meta, rows, statics, F);
  const teams = [];
  // Team rules from GO and PvPoke's Team Builder: one Pokemon per Pokedex number, at most one Mega
  for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) {
    if (statics[a].base === statics[b].base || (statics[a].mega && statics[b].mega)) continue;
    for (let c = b + 1; c < rows.length; c++) {
      if (statics[c].base === statics[a].base || statics[c].base === statics[b].base) continue;
      if (statics[c].mega && (statics[a].mega || statics[b].mega)) continue;
      teams.push(a, b, c);
    }
  }
  const nTeams = teams.length / 3, K = M.FIELDS.length;
  const metrics = new Float32Array(nTeams * K), threatIds = new Uint16Array(nTeams * 6), orders = new Uint8Array(nTeams);
  for (let i = 0; i < nTeams; i++) {
    const r = scorer.scoreTeam([teams[i * 3], teams[i * 3 + 1], teams[i * 3 + 2]]);
    M.FIELDS.forEach((f, k) => { metrics[i * K + k] = r.metrics[f]; });
    r.threats.forEach((t, k) => { threatIds[i * 6 + k] = t; });
    orders[i] = r.order;
    if (i % 20000 === 0) log('score', i, nTeams);
  }
  log('score', nTeams, nTeams);

  // Calibration: where each team check sits across every team in this format
  const calib = {};
  const calibrate = (k) => {
    const fi = M.FIELDS.indexOf(M.GRADES[k].field || k), col = new Float32Array(nTeams);
    for (let i = 0; i < nTeams; i++) col[i] = metrics[i * K + fi];
    calib[k] = quantiles(col);
  };
  M.CHECKS.filter((k) => k !== 'metaWins').forEach(calibrate);

  // Meta field: the 60 strongest varied teams by every other grade. Then every team plays them (FAINTR 3v3 model).
  const C0 = { bulkGoal: base.bulkGoal, calib };
  const comp0 = new Float32Array(nTeams), mm = {};
  for (let i = 0; i < nTeams; i++) { for (let k = 0; k < K; k++) mm[M.FIELDS[k]] = metrics[i * K + k]; comp0[i] = M.composite(mm, M.BASE_WEIGHTS, C0); }
  const Dlite = { members: new Uint8Array(teams), orders };
  const fieldTeams = T3.pickMetaTeams(Dlite, comp0, 60, 6);
  const fieldIdx = fieldTeams.map((i) => T3.ordered(Dlite, PERMS, i));
  const fieldIds = fieldIdx.map((tm) => tm.map((c) => statics[c].id));
  scorer.setMetaField(fieldIds);
  const mwi = M.FIELDS.indexOf('metaWin');
  for (let i = 0; i < nTeams; i++) {
    metrics[i * K + mwi] = scorer.metaWin(T3.ordered(Dlite, PERMS, i));
    if (i % 20000 === 0) log('meta', i, nTeams);
  }
  calibrate('metaWins');

  // Anti-Meta: the best 200 by Meta Wins, re-checked with 3v3 chains on PvPoke's engine
  const byMW = Array.from({ length: nTeams }, (_, i) => i).sort((x, y) => metrics[y * K + mwi] - metrics[x * K + mwi]).slice(0, opts.verifyCount || 200);
  const jobs = byMW.map((i) => ({ i, team: T3.ordered(Dlite, PERMS, i).map((c) => ({ id: statics[c].id, moveset: statics[c].moveset })) }));
  const field = fieldIdx.map((tm) => tm.map((c) => ({ id: statics[c].id, moveset: statics[c].moveset })));
  const verified = await runChainWorkers(srcDir, F, jobs, field, nWorkers, log);
  const antimeta = { field: fieldIds, fieldTeams, verified: byMW.map((i) => ({ i, fast: +metrics[i * K + mwi].toFixed(2), engine: verified[i].win, beat: verified[i].beat })) };

  const fmt = { key: F.key, cup: F.cup, cp: F.cp, meta: F.meta, title: F.title };
  fs.writeFileSync(path.join(outDir, 'teams.bin'), Buffer.concat([
    Buffer.from(new Uint8Array(teams).buffer), Buffer.from(metrics.buffer),
    Buffer.from(threatIds.buffer), Buffer.from(orders.buffer)]));
  fs.writeFileSync(path.join(outDir, 'teams.json'), JSON.stringify({
    schema: SCHEMA, fmt, cp: F.cp, nTeams, fields: M.FIELDS, pvpoke: opts.version || 'unknown', built: new Date().toISOString(),
    bulkGoal: base.bulkGoal, calib, cands: statics, threats: base.threats.map((t) => ({ id: t.id, name: t.name })), perms: PERMS,
  }));
  const packed = packRows(rows);
  fs.writeFileSync(path.join(outDir, 'matrix.json'), JSON.stringify({ fmt, cands: base.cands, threats: base.threats, meta: base.meta, metaField: fieldIds, statics, ...packed }));
  fs.writeFileSync(path.join(outDir, 'antimeta.json'), JSON.stringify(antimeta));
  log('done', nTeams, nTeams, `built ${nTeams} teams in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  return { nTeams };
}

module.exports = { buildAll, makeCtx, unpackMatrix, SCHEMA };

if (require.main === module) {
  const [srcDir, outDir, pool, key] = process.argv.slice(2);
  const { listFormats } = require('./formats');
  const gmData = JSON.parse(fs.readFileSync(path.join(srcDir, 'data/gamemaster.json'), 'utf8'));
  const F = listFormats(gmData, srcDir).find((f) => f.key === (key || 'all-1500'));
  if (!F) { console.error(`Unknown format ${key}`); process.exit(1); }
  let version = process.env.PVPOKE_VERSION || 'unknown';
  if (version === 'unknown') try { version = require('child_process').execSync(`git -C ${path.dirname(srcDir)} log -1 --format=%h_%cs`).toString().trim(); } catch (e) { /* not a git checkout */ }
  let lastPct = -1;
  buildAll(srcDir, outDir, { fmt: F, poolSize: parseInt(pool || '150', 10), version, verifyCount: process.env.VERIFY ? +process.env.VERIFY : undefined, onProgress: (stage, i, n, msg) => {
    if (msg) console.log(msg);
    const pct = Math.floor((i / n) * 10);
    if (pct !== lastPct || stage === 'done') { lastPct = pct; console.log(stage, `${i}/${n}`); }
  } }).catch((e) => { console.error(e); process.exit(1); });
}
