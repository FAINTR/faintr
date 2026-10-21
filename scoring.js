// Team scorer shared by the bulk search and live grading.
// Reproduces PvPoke Team Builder's Coverage walk exactly and computes the added grades.
const vm = require('vm');
const T3 = require('./threevthree');

const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

class Scorer {
  // threats: [{id, skip}], meta: {metaGroup:[ids], metaOpp:[{id,w}], metaTypes:[types]}
  // rows: [{r0,r1,r2,traits}] per member, statics: [{bulk,safety,consistency,weak,lead,sw,closer}]
  constructor(ctx, threats, meta, rows, statics, F) {
    this.ctx = ctx;
    // ctx is a Node vm context (desktop) or { ev } that runs code in the engine's own scope (website)
    this.run = ctx && ctx.ev ? ctx.ev : (code) => vm.runInContext(code, ctx);
    this.F = F || { cup: 'all', cp: 1500, meta: 'great' };
    this.Fjson = JSON.stringify({ cup: this.F.cup, cp: this.F.cp, meta: this.F.meta });
    this.threats = threats;
    this.nT = threats.length;
    this.skip = threats.map((t) => t.skip);
    const metaSet = new Set(meta.metaGroup);
    const isMeta = threats.map((t) => metaSet.has(t.id));
    const tIndex = Object.fromEntries(threats.map((t, i) => [t.id, i]));
    this.metaOpp = meta.metaOpp.filter((o) => tIndex[o.id] !== undefined).map((o) => ({ t: tIndex[o.id], w: o.w }));
    this.metaW = this.metaOpp.reduce((s, o) => s + o.w, 0);
    this.metaTypes = meta.metaTypes;
    this.statics = statics;
    const nC = rows.length, nT = this.nT;
    this.avgR = new Float64Array(nC * nT); this.score = new Float64Array(nC * nT);
    this.r0 = new Int16Array(nC * nT); this.r1 = new Int16Array(nC * nT); this.r2 = new Int16Array(nC * nT);
    this.traitIds = new Int32Array(nC * nT);
    this.traitDict = []; const tIdx = new Map();
    for (let c = 0; c < nC; c++) {
      const row = rows[c];
      for (let t = 0; t < nT; t++) {
        const a = row.r0[t], b = row.r1[t], d = row.r2[t], o = c * nT + t;
        this.r0[o] = a; this.r1[o] = b; this.r2[o] = d;
        // PvPoke "Average (0 & 1)" shield mode, then the team-counter sort score with meta weighting
        const avg = row.ra ? row.ra[t] : Math.round(Math.pow(a * Math.pow(b, 3), 1 / 4));
        let s = avg > 500 ? 500 + Math.pow(avg - 500, 0.75) : avg / 2;
        if (s > 500) s = isMeta[t] ? s + (1000 - s) * 0.85 : s - (s - 500) * (1 - 0.85);
        this.avgR[o] = avg; this.score[o] = s;
        const key = row.traits[t];
        let id = tIdx.get(key); if (id === undefined) { id = this.traitDict.length; tIdx.set(key, id); this.traitDict.push(key); }
        this.traitIds[o] = id;
      }
    }
    if (meta.metaField) this.setMetaField(meta.metaField);
    this.simCache = new Map();
    this.BUF = 48; this.bufT = new Int32Array(this.BUF); this.bufS = new Float64Array(this.BUF);
  }

  similar(last, a, b, first) {
    const nT = this.nT;
    const ta = first ? this.traitIds[last * nT + a] : -1, tb = this.traitIds[last * nT + b];
    const k = `${a},${b},${ta},${tb}`;
    let v = this.simCache.get(k);
    if (v === undefined) {
      const ka = first ? this.traitDict[ta] : '|', kb = this.traitDict[tb];
      v = this.run(`similarWithTraits(${JSON.stringify(this.threats[a].id)}, ${JSON.stringify(this.threats[b].id)}, ${first}, ${JSON.stringify(ka)}, ${JSON.stringify(kb)}, ${this.Fjson})`, this.ctx);
      this.simCache.set(k, v);
    }
    return v;
  }

  // Exact port of TeamInterface's top-6 threat walk. last = member battled last (team order).
  threats6(a, b, c, last) {
    const nT = this.nT, oa = a * nT, ob = b * nT, oc = c * nT, score = this.score, avgR = this.avgR, skip = this.skip;
    const BUF = this.BUF, bufT = this.bufT, bufS = this.bufS;
    let n = 0;
    for (let t = 0; t < nT; t++) {
      if (skip[t]) continue;
      const s = (score[oa + t] + score[ob + t] + score[oc + t]) / 3;
      if (n === BUF && s <= bufS[BUF - 1]) continue;
      let i = n < BUF ? n++ : BUF - 1;
      while (i > 0 && bufS[i - 1] < s) { bufS[i] = bufS[i - 1]; bufT[i] = bufT[i - 1]; i--; }
      bufS[i] = s; bufT[i] = t;
    }
    let order = Array.from(bufT.subarray(0, n));
    const walk = (list) => {
      const picked = []; let sum = 0;
      for (const t of list) {
        if (picked.length >= 6) break;
        if (picked.some((p, j) => this.similar(last, p, t, j === 0))) continue;
        picked.push(t); sum += Math.floor((avgR[oa + t] + avgR[ob + t] + avgR[oc + t]) / 3);
      }
      return { picked, threatScore: Math.round(sum / 6) };
    };
    let res = walk(order);
    if (res.picked.length < 6 && n === BUF) { // rare: fall back to a full sort
      order = []; for (let t = 0; t < nT; t++) if (!skip[t]) order.push(t);
      const sc = (t) => (score[oa + t] + score[ob + t] + score[oc + t]) / 3;
      order.sort((x, y) => sc(y) - sc(x) || x - y);
      res = walk(order);
    }
    return res;
  }

  // Meta field for the Meta Wins check: teams as arrays of threat ids in play order
  setMetaField(teams) {
    const tIndex = Object.fromEntries(this.threats.map((t, i) => [t.id, i]));
    this.field = teams.map((tm) => tm.map((id) => tIndex[id])).filter((tm) => tm.every((t) => t !== undefined));
  }

  // Meta Wins for one team (member rows m, in play order). Members are 0..2, field Pokemon are 3 + threat index.
  metaWin(ordered) {
    if (!this.field || !this.field.length) return 0;
    const nT = this.nT, R = [this.r0, this.r1, this.r2];
    const rate = (s, a, b) => {
      if (a < 3) return 1000 - R[s][ordered[a] * nT + (b - 3)];
      return R[s][ordered[b] * nT + (a - 3)];
    };
    const field = this.field.map((tm) => tm.map((t) => t + 3));
    return T3.metaWinShare(rate, [0, 1, 2], field);
  }

  // Games won (0..3) against each field team
  metaDetail(ordered) {
    if (!this.field) return [];
    const nT = this.nT, R = [this.r0, this.r1, this.r2];
    const rate = (s, a, b) => (a < 3 ? 1000 - R[s][ordered[a] * nT + (b - 3)] : R[s][ordered[b] * nT + (a - 3)]);
    return this.field.map((tm) => T3.playSeriesF(rate, [0, 1, 2], tm.map((t) => t + 3)).wins);
  }

  bestOrder(m) {
    const S = this.statics; let bestO = 0, bestV = -1;
    PERMS.forEach((p, k) => { const v = S[m[p[0]]].lead + S[m[p[1]]].sw + S[m[p[2]]].closer; if (v > bestV) { bestV = v; bestO = k; } });
    return { order: bestO, orderScore: bestV / 3 };
  }

  // m = [i, j, k] member row indices. orderIdx optional (index into PERMS); default = best order.
  scoreTeam(m, orderIdx) {
    const nT = this.nT, S = this.statics;
    const bo = this.bestOrder(m);
    const order = orderIdx === undefined ? bo.order : orderIdx;
    const last = m[PERMS[order][2]];
    const th = this.threats6(m[0], m[1], m[2], last);
    let blind = 0, two = 0, pilotClose = 0;
    const any = [0, 0, 0];
    const R = [this.r0, this.r1, this.r2];
    for (const o of this.metaOpp) {
      let wins1 = 0, best1 = 1000;
      for (const x of m) { const v = this.r1[x * nT + o.t]; if (v < 500) wins1++; if (v < best1) best1 = v; }
      if (wins1 === 0) blind++;
      if (wins1 >= 2) two += o.w;
      const out = R.map((A) => Math.min(A[m[0] * nT + o.t], A[m[1] * nT + o.t], A[m[2] * nT + o.t]) < 500);
      out.forEach((w, s) => { if (w) any[s] += o.w; });
      if ((best1 >= 450 && best1 <= 550) || !(out[0] === out[1] && out[1] === out[2])) pilotClose++;
    }
    let shared = 0;
    const sharedTypes = [];
    for (const t of this.metaTypes) { let k = 0; for (const x of m) if (S[x].weak.includes(t)) k++; if (k >= 2) { shared++; sharedTypes.push(t); } }
    return {
      metrics: {
        threatScore: th.threatScore,
        bulk: (S[m[0]].bulk + S[m[1]].bulk + S[m[2]].bulk) / 3,
        safety: (S[m[0]].safety + S[m[1]].safety + S[m[2]].safety) / 3,
        consistency: (S[m[0]].consistency + S[m[1]].consistency + S[m[2]].consistency) / 3,
        blindSpots: blind,
        twoAnswers: (two / this.metaW) * 100,
        resilience: Math.min(...any) / Math.max(...any, 1),
        sharedWeak: shared,
        pilot: (pilotClose / this.metaOpp.length) * 100,
        orderScore: bo.orderScore,
        metaWin: this.field ? this.metaWin(PERMS[order].map((p) => m[p])) : 0,
      },
      threats: th.picked,
      order,
      sharedTypes,
    };
  }

  // Detail for one team: per-threat answers and the blind-spot list (used by the UI drill-down)
  detail(m, picked) {
    const nT = this.nT;
    const ans = (t) => m.map((x) => ({ r0: this.r0[x * nT + t], r1: this.r1[x * nT + t], r2: this.r2[x * nT + t], avg: this.avgR[x * nT + t] }));
    const threats = picked.map((t) => ({ id: this.threats[t].id, name: this.threats[t].name, rating: Math.floor((this.avgR[m[0] * nT + t] + this.avgR[m[1] * nT + t] + this.avgR[m[2] * nT + t]) / 3), vs: ans(t) }));
    const blind = this.metaOpp.filter((o) => m.every((x) => this.r1[x * nT + o.t] >= 500)).map((o) => this.threats[o.t].name);
    return { threats, blind };
  }
}

module.exports = { Scorer, PERMS };
