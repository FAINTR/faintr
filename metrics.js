// Shared grade definitions (scorer, server and browser).
// C = format context: { bulkGoal, calib } where calib[k] is an ascending array of 1001 quantiles
// of that check's raw value across every team in the format (built by build.js).
(function (root) {
  const FIELDS = ['threatScore', 'bulk', 'safety', 'consistency', 'blindSpots', 'twoAnswers', 'resilience', 'sharedWeak', 'pilot', 'orderScore', 'metaWin'];
  const CHECKS = ['blindSpots', 'twoAnswers', 'resilience', 'sharedWeak', 'pilot', 'metaWins'];

  function pvpokeLetter(value, goal) {
    const p = value / goal + 1e-6; // tolerance: stored values are 32-bit and PvPoke's cut-offs are exact
    return p >= 0.9 ? 'A' : p >= 0.8 ? 'B' : p >= 0.7 ? 'C' : p >= 0.6 ? 'D' : 'F';
  }
  // Share of teams in the format this value is at least as good as (0..1)
  function percentile(Q, v, dir) {
    if (!Q || !Q.length) return 0.5;
    const n = Q.length - 1;
    let lo = 0, hi = n;
    if (dir === 'high') { // last index with Q <= v
      if (v < Q[0]) return 0;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (Q[mid] <= v + 1e-9) lo = mid; else hi = mid - 1; }
      return lo / n;
    }
    if (v > Q[n]) return 0; // lower is better: first index with Q >= v
    while (lo < hi) { const mid = (lo + hi) >> 1; if (Q[mid] >= v - 1e-9) hi = mid; else lo = mid + 1; }
    return 1 - lo / n;
  }
  // A = best 10%, B next 20%, C next 30%, D next 25%, F bottom 15%
  const pctLetter = (p) => (p >= 0.9 ? 'A' : p >= 0.7 ? 'B' : p >= 0.4 ? 'C' : p >= 0.15 ? 'D' : 'F');
  const fmtTop = (p) => { const t = (1 - p) * 100; return t <= 0.5 ? 'top 1%' : `top ${Math.max(1, Math.round(t))}%`; };
  const need = (C, k, dir, f) => { const Q = C && C.calib && C.calib[k]; if (!Q) return ''; const v = dir === 'high' ? Q[Math.round(0.9 * (Q.length - 1))] : Q[Math.round(0.1 * (Q.length - 1))]; return f(v); };

  const GRADES = {
    coverage: { label: 'Coverage', pvpoke: true, desc: "How hard the meta's best counters hit you (PvPoke: 1200 − threat score vs a goal of 680).",
      fmt: (m) => `threat ${Math.round(m.threatScore)}`, q: (m) => (1200 - m.threatScore) / 680,
      letter: (m) => pvpokeLetter(1200 - m.threatScore, 680), need: () => 'A needs a threat score of 588 or lower' },
    bulk: { label: 'Bulk', pvpoke: true, desc: 'Average Defense × HP, against PvPoke’s goal for this league.',
      fmt: (m) => Math.round(m.bulk).toLocaleString('en-US'), q: (m, C) => m.bulk / ((C && C.bulkGoal) || 22000),
      letter: (m, C) => pvpokeLetter(m.bulk, (C && C.bulkGoal) || 22000), need: (C) => `A needs ${Math.round(0.9 * ((C && C.bulkGoal) || 22000)).toLocaleString('en-US')}` },
    safety: { label: 'Safety', pvpoke: true, desc: "Average of each member's PvPoke Switch score (goal 98).",
      fmt: (m) => m.safety.toFixed(1), q: (m) => m.safety / 98, letter: (m) => pvpokeLetter(m.safety, 98), need: () => 'A needs 88.2' },
    consistency: { label: 'Consistency', pvpoke: true, desc: 'How little the movesets rely on shield baits (goal 98).',
      fmt: (m) => m.consistency.toFixed(1), q: (m) => m.consistency / 98, letter: (m) => pvpokeLetter(m.consistency, 98), need: () => 'A needs 88.2' },
    blindSpots: { label: 'Blind Spots', dir: 'low', desc: 'Top-100 meta Pokémon that beat all three members at 1 shield. Fewer is better.',
      fmt: (m) => `${m.blindSpots} Pokémon` },
    twoAnswers: { label: 'Two Answers', dir: 'high', desc: 'Rank-weighted share of the top-100 meta that two or more members beat at 1 shield.',
      fmt: (m) => `${m.twoAnswers.toFixed(0)}%` },
    resilience: { label: 'Shield Resilience', dir: 'high', desc: 'Worst ÷ best meta coverage across 0, 1 and 2 shield games.',
      fmt: (m) => m.resilience.toFixed(2) },
    sharedWeak: { label: 'Shared Weakness', dir: 'low', desc: 'Attack types common in the top-50 meta that hit two or more members super-effectively.',
      fmt: (m) => `${m.sharedWeak} type${m.sharedWeak === 1 ? '' : 's'}` },
    pilot: { label: 'Pilot Ease', dir: 'low', desc: 'Share of top-100 meta matchups that are close (450–550) or flip with shields. Lower is easier.',
      fmt: (m) => `${m.pilot.toFixed(0)}% swingy` },
    metaWins: { label: 'Meta Wins', dir: 'high', field: 'metaWin', desc: 'Simulated 3v3 games won against the 60 strongest varied teams in this league, three games each (one per opposing lead).',
      fmt: (m) => `${(m.metaWin || 0).toFixed(0)}% won` },
  };
  const NEED_FMT = { blindSpots: (v) => (v < 1 ? 'A needs none' : `A needs ${Math.floor(v)} or fewer`), twoAnswers: (v) => `A needs ${Math.ceil(v)}%`, resilience: (v) => `A needs ${v.toFixed(2)}`,
    sharedWeak: (v) => (v < 1 ? 'A needs none' : `A needs ${Math.floor(v)} or fewer`), pilot: (v) => `A needs ${Math.floor(v)}% or less`, metaWins: (v) => `A needs ${Math.ceil(v)}% won` };
  for (const k of CHECKS) {
    const g = GRADES[k];
    const f = g.field || k;
    g.q = (m, C) => percentile(C && C.calib && C.calib[k], m[f], g.dir);
    g.letter = (m, C) => pctLetter(g.q(m, C));
    g.rank = (m, C) => fmtTop(g.q(m, C));
    g.need = (C) => need(C, k, g.dir, NEED_FMT[k]);
  }
  const DEFAULT_WEIGHTS = { coverage: 3, bulk: 1, safety: 1, consistency: 1, blindSpots: 2, twoAnswers: 2, resilience: 1, sharedWeak: 1, pilot: 1, metaWins: 3 };
  // Used to pick the meta field before Meta Wins exists
  const BASE_WEIGHTS = Object.assign({}, DEFAULT_WEIGHTS, { metaWins: 0 });

  function composite(m, w, C) {
    let s = 0, t = 0;
    for (const k in GRADES) { const wk = w[k] || 0; s += wk * Math.max(0, Math.min(1, GRADES[k].q(m, C))); t += wk; }
    return t ? (s / t) * 100 : 0;
  }
  function grades(m, C) {
    const g = {};
    for (const k in GRADES) g[k] = { letter: GRADES[k].letter(m, C), text: GRADES[k].fmt(m), q: Math.max(0, Math.min(1, GRADES[k].q(m, C))), need: GRADES[k].need(C) };
    return g;
  }
  // Overall-score tiers by share of all teams in the format (thresholds come from the server)
  const TIERS = [{ key: 'elite', label: 'Top 0.1%', top: 0.001 }, { key: 'excellent', label: 'Top 1%', top: 0.01 }, { key: 'strong', label: 'Top 5%', top: 0.05 }, { key: 'good', label: 'Top 25%', top: 0.25 }];
  function tierOf(score, cuts) {
    if (!cuts) return { key: 'fair', label: '' };
    for (let i = 0; i < TIERS.length; i++) if (score >= cuts[i] - 1e-9) return TIERS[i];
    return { key: 'fair', label: 'Below top 25%' };
  }

  const api = { FIELDS, CHECKS, GRADES, DEFAULT_WEIGHTS, BASE_WEIGHTS, composite, grades, pvpokeLetter, percentile, pctLetter, TIERS, tierOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TFMetrics = api;
})(typeof window !== 'undefined' ? window : globalThis);
