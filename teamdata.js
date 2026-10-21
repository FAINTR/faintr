// Loads a format's teams.bin + teams.json and answers queries.
const fs = require('fs');
const path = require('path');
const M = require('./metrics');

function loadTeams(dir) {
  const info = JSON.parse(fs.readFileSync(path.join(dir, 'teams.json'), 'utf8'));
  const buf = fs.readFileSync(path.join(dir, 'teams.bin'));
  const n = info.nTeams, K = info.fields.length;
  let off = 0;
  const copy = (bytes) => { const b = new ArrayBuffer(bytes); new Uint8Array(b).set(buf.subarray(off, off + bytes)); off += bytes; return b; };
  const members = new Uint8Array(copy(n * 3));
  const metrics = new Float32Array(copy(n * K * 4));
  const threats = new Uint16Array(copy(n * 6 * 2));
  const orders = new Uint8Array(copy(n));
  const C = { bulkGoal: info.bulkGoal || 22000, calib: info.calib || {} };
  // Anti-Meta: the meta field and the top teams re-checked on PvPoke's engine
  let anti = null;
  try {
    const a = JSON.parse(fs.readFileSync(path.join(dir, 'antimeta.json'), 'utf8'));
    anti = { field: a.field, fieldTeams: a.fieldTeams, fieldSet: new Set(a.fieldTeams), verified: new Map(a.verified.map((v) => [v.i, v])) };
  } catch (e) { anti = null; }
  return { info, n, K, members, metrics, threats, orders, C, anti, mwi: info.fields.indexOf('metaWin'), _cuts: new Map() };
}

function teamMetrics(D, i) {
  const m = {};
  D.info.fields.forEach((f, k) => { m[f] = D.metrics[i * D.K + k]; });
  return m;
}

// Overall-score cut-offs for the tiers (top 0.1%, 1%, 5%, 25%) under these weights, cached
function tierCuts(D, weights) {
  const w = Object.assign({}, M.DEFAULT_WEIGHTS, weights || {});
  const key = M.FIELDS.map((f) => w[f] || 0).join(',') + Object.keys(M.GRADES).map((k) => w[k] || 0).join(',');
  if (D._cuts.has(key)) return D._cuts.get(key);
  const all = new Float32Array(D.n), m = {};
  for (let i = 0; i < D.n; i++) {
    for (let k = 0; k < D.K; k++) m[D.info.fields[k]] = D.metrics[i * D.K + k];
    all[i] = M.composite(m, w, D.C);
  }
  all.sort();
  const cuts = M.TIERS.map((t) => all[Math.max(0, Math.floor(D.n * (1 - t.top)) - 1)]);
  if (D._cuts.size > 8) D._cuts.clear();
  D._cuts.set(key, cuts);
  return cuts;
}

function describe(D, i, weights, cuts) {
  const m = teamMetrics(D, i);
  const perm = D.info.perms[D.orders[i]];
  const mem = [D.members[i * 3], D.members[i * 3 + 1], D.members[i * 3 + 2]];
  const ordered = perm.map((p) => D.info.cands[mem[p]]);
  const w = Object.assign({}, M.DEFAULT_WEIGHTS, weights || {});
  const composite = M.composite(m, w, D.C);
  return {
    i,
    members: ordered.map((c) => ({ id: c.id, name: c.name, types: c.types, moves: c.moves, moveStr: c.moveStr })),
    roles: ['Lead', 'Safe swap', 'Closer'],
    grades: M.grades(m, D.C),
    composite, tier: M.tierOf(composite, cuts || tierCuts(D, w)),
    anti: antiOf(D, i, m),
    threats: D.threats ? Array.from(D.threats.subarray(i * 6, i * 6 + 6)).map((t) => D.info.threats[t].name) : [],
    metrics: m,
  };
}

// Anti-Meta result for a team: engine-checked share of games won against the meta field when available
function antiOf(D, i, m) {
  const v = D.anti && D.anti.verified.get(i);
  return { win: v ? v.engine : (m.metaWin || 0), model: m.metaWin || 0, verified: !!v, inField: !!(D.anti && D.anti.fieldSet.has(i)) };
}

// Filter + rank. opts: {weights, include:[ids], exclude:[ids], owned:[ids], minGrades:{key:'A'..}, limit, maxShadow}
function query(D, opts) {
  const w = Object.assign({}, M.DEFAULT_WEIGHTS, opts.weights || {});
  const candIdx = Object.fromEntries(D.info.cands.map((c, i) => [c.id, i]));
  const inc = (opts.include || []).map((id) => candIdx[id]).filter((x) => x !== undefined);
  if ((opts.include || []).length && inc.length < opts.include.length) return { matched: 0, teams: [], cuts: tierCuts(D, w), missing: opts.include.filter((id) => candIdx[id] === undefined) };
  const exc = new Set((opts.exclude || []).map((id) => candIdx[id]).filter((x) => x !== undefined));
  const owned = opts.owned ? new Set(opts.owned.map((id) => candIdx[id]).filter((x) => x !== undefined)) : null;
  const order = { A: 4, B: 3, C: 2, D: 1, F: 0 };
  const mins = Object.entries(opts.minGrades || {}).filter(([, v]) => v && v !== 'any');
  const isShadow = D.info.cands.map((c) => c.id.endsWith('_shadow'));
  const limit = Math.min(opts.limit || 100, 500);
  const anti = opts.mode === 'anti';
  const top = [];
  let matched = 0;
  const m = {};
  for (let i = 0; i < D.n; i++) {
    const a = D.members[i * 3], b = D.members[i * 3 + 1], c = D.members[i * 3 + 2];
    if (exc.has(a) || exc.has(b) || exc.has(c)) continue;
    if (inc.length && !inc.every((x) => x === a || x === b || x === c)) continue;
    if (owned && !(owned.has(a) && owned.has(b) && owned.has(c))) continue;
    if (anti && D.anti && D.anti.fieldSet.has(i)) continue; // the meta field itself isn't anti-meta
    if (opts.maxShadow !== undefined && opts.maxShadow !== null && (isShadow[a] + isShadow[b] + isShadow[c]) > opts.maxShadow) continue;
    for (let k = 0; k < D.K; k++) m[D.info.fields[k]] = D.metrics[i * D.K + k];
    let ok = true;
    for (const [g, v] of mins) if (order[M.GRADES[g].letter(m, D.C)] < order[v]) { ok = false; break; }
    if (!ok) continue;
    matched++;
    let s;
    if (anti) { const v = D.anti && D.anti.verified.get(i); s = v ? 1000 + v.engine : m.metaWin || 0; }
    else s = M.composite(m, w, D.C);
    if (top.length < limit) { top.push([s, i]); if (top.length === limit) top.sort((x, y) => x[0] - y[0]); }
    else if (s > top[0][0]) { top[0] = [s, i]; let j = 0; while (j + 1 < top.length && top[j][0] > top[j + 1][0]) { const t = top[j]; top[j] = top[j + 1]; top[j + 1] = t; j++; } }
  }
  top.sort((x, y) => y[0] - x[0]);
  const cuts = tierCuts(D, w);
  return { matched, cuts, teams: top.map(([, i]) => describe(D, i, w, cuts)) };
}

module.exports = { loadTeams, teamMetrics, describe, query, tierCuts };
