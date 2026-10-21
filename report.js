// Builds the detailed Team Report: grades, plain-language verdict, game plan, matchup heat map,
// per-member breakdown, IV effects and swap suggestions.
const M = require('./metrics');
const { Scorer } = require('./scoring');

const TOP_HEAT = 40, TOP_META = 100, TOP_LEADS = 20;

function gradesFor(m, C) { return M.grades(m, C); }

const PLAIN = {
  coverage: ['the meta’s best counters barely dent you', 'the meta’s best counters hit you hard'],
  bulk: ['your team soaks up damage', 'your team goes down fast'],
  safety: ['your Pokémon hold up when switched in behind', 'switching in is risky'],
  consistency: ['your movesets work without shield baits', 'you lean on baiting shields'],
  blindSpots: ['almost nothing in the meta beats all three of you', 'several meta Pokémon beat all three of you'],
  twoAnswers: ['you have backup answers to most of the meta', 'many meta Pokémon have only one answer on your team'],
  resilience: ['you play the same in 0, 1 and 2 shield games', 'your results swing with shield counts'],
  sharedWeak: ['no common attack type hits two of you', 'one attack type hits two of you super-effectively'],
  pilot: ['your matchups are decisive and easy to play', 'many matchups are close calls that punish misplays'],
};

function summarize(grades, comp, threats, members, blind, sharedTypes, tierInfo, title) {
  const keys = Object.keys(grades);
  const sorted = keys.slice().sort((a, b) => grades[b].q - grades[a].q);
  const best = sorted.filter((k) => grades[k].letter === 'A').slice(0, 2);
  const worst = sorted.slice().reverse().filter((k) => ['C', 'D', 'F'].includes(grades[k].letter)).slice(0, 2);
  const TIER_TEXT = { elite: 'Elite team', excellent: 'Excellent team', strong: 'Strong team', good: 'Good team with a few gaps', fair: 'Playable team with clear weaknesses' };
  const lines = [tierInfo && tierInfo.key !== 'fair'
    ? `${TIER_TEXT[tierInfo.key]}: ${tierInfo.label.toLowerCase()} of every ${title} team (${comp.toFixed(0)} out of 100).`
    : `${TIER_TEXT.fair} (${comp.toFixed(0)} out of 100).`];
  if (best.length) lines.push(`Strengths: ${best.map((k) => PLAIN[k][0]).join('; ')}.`);
  if (worst.length) lines.push(`Watch out: ${worst.map((k) => `${PLAIN[k][1]} (${M.GRADES[k].label} ${grades[k].letter})`).join('; ')}.`);
  if (threats.length) {
    const t = threats[0];
    const beaten = t.vs.filter((v) => v.avg > 500).length;
    lines.push(`Biggest threat: ${t.name}, which beats ${beaten} of your 3.`);
  }
  if (blind.length) lines.push(`${blind.length === 1 ? 'One meta Pokémon beats' : `${blind.length} meta Pokémon beat`} your whole team at 1 shield, led by ${blind.slice(0, 3).join(', ')}.`);
  if (sharedTypes.length) lines.push(`${sharedTypes.map(cap).join(' and ')} damage is super-effective on two of your three.`);
  return lines;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// rows/stats: the 3 members (in team order). matrix: bundled candidate matrix. rank: {id:{rank, lead, ...}} lookups.
function buildReport({ ctx, F, C, matrix, rows, stats, ivs, ivRows, leads, overallTop, catalogNames, weights, cuts }) {
  const w = Object.assign({}, M.DEFAULT_WEIGHTS, weights || {});
  const allRows = rows.concat(matrix.rows), allStats = stats.concat(matrix.statics);
  const sc = new Scorer(ctx, matrix.threats, matrix.meta, allRows, allStats, F);
  const res = sc.scoreTeam([0, 1, 2], 0);
  const grades = gradesFor(res.metrics, C);
  const composite = M.composite(res.metrics, w, C);
  const det = sc.detail([0, 1, 2], res.threats);
  const nT = sc.nT;
  const tIndex = new Map(matrix.threats.map((t, i) => [t.id, i]));
  const name = (id) => catalogNames.get(id) || id;
  const my = (k, t, s) => 1000 - [sc.r0, sc.r1, sc.r2][s][k * nT + t]; // member k's rating vs threat t at s shields

  // Game plan: what to do against each popular lead
  const plan = leads.slice(0, TOP_LEADS).filter((l) => tIndex.has(l.id)).map((l) => {
    const t = tIndex.get(l.id);
    const r = [0, 1, 2].map((k) => my(k, t, 1));
    let action, who = 0;
    if (r[0] > 500) action = 'stay';
    else {
      who = r[1] >= r[2] ? 1 : 2;
      action = r[who] > 500 ? 'switch' : (Math.max(r[0], r[1], r[2]) > 450 ? 'close' : 'tough');
      if (action !== 'switch') who = r.indexOf(Math.max(...r));
    }
    return { id: l.id, name: name(l.id), ratings: r, action, who };
  });

  // Matchup heat map vs the top of the meta, all shield counts
  const heat = overallTop.slice(0, TOP_HEAT).filter((o) => tIndex.has(o.id)).map((o) => {
    const t = tIndex.get(o.id);
    return { id: o.id, name: name(o.id), r: [0, 1, 2].map((k) => [0, 1, 2].map((s) => my(k, t, s))) };
  });

  // Per-member breakdown
  const metaIdx = overallTop.slice(0, TOP_META).filter((o) => tIndex.has(o.id)).map((o) => tIndex.get(o.id));
  const memberCards = stats.map((st, k) => {
    const wins = [0, 1, 2].map((s) => metaIdx.filter((t) => my(k, t, s) > 500).length);
    const list = metaIdx.map((t) => ({ name: matrix.threats[t].name, r: my(k, t, 1) }));
    list.sort((a, b) => b.r - a.r);
    // Unique wins: meta mons only this member beats at 1 shield
    const unique = metaIdx.filter((t) => my(k, t, 1) > 500 && [0, 1, 2].filter((j) => j !== k).every((j) => my(j, t, 1) <= 500)).map((t) => matrix.threats[t].name);
    return {
      id: st.id, name: st.name, types: st.types, moves: st.moves, level: ivs[k].level, cp: ivs[k].cp, stats: ivs[k].stats,
      iv: ivs[k], roles: { lead: st.lead, switch: st.sw, closer: st.closer, overall: st.overall },
      wins, of: metaIdx.length, best: list.slice(0, 5), worst: list.slice(-5).reverse(), unique: unique.slice(0, 8),
      weak: st.weak,
    };
  });

  // IV effects: matchups that change versus PvPoke's default IVs and versus rank 1
  const ivEffects = stats.map((st, k) => {
    const cmp = (alt) => {
      if (!alt) return null;
      const out = [];
      for (const t of metaIdx) for (let s = 0; s <= 2; s++) {
        const mine = 1000 - [rows[k].r0, rows[k].r1, rows[k].r2][s][t];
        const theirs = 1000 - [alt.r0, alt.r1, alt.r2][s][t];
        if ((mine > 500) !== (theirs > 500)) out.push({ name: matrix.threats[t].name, shields: s, mine, theirs, gained: mine > 500 });
      }
      return out;
    };
    return { name: st.name, vsDefault: cmp(ivRows[k].def), vsRank1: cmp(ivRows[k].rank1), custom: !!ivRows[k].custom };
  });

  // Swaps: best replacement for each slot from the top 150 (keeps the other two in place)
  const swaps = [];
  for (let slot = 0; slot < 3; slot++) {
    const others = [0, 1, 2].filter((x) => x !== slot);
    const cands = [];
    for (let c = 3; c < allStats.length; c++) {
      if (others.some((o) => allStats[o].base === allStats[c].base) || allStats[slot].base === allStats[c].base) continue;
      const m = [0, 1, 2].map((x) => (x === slot ? c : x));
      const r = sc.scoreTeam(m, 0);
      cands.push({ c, score: M.composite(r.metrics, w, C), m: r.metrics });
    }
    cands.sort((a, b) => b.score - a.score);
    cands.slice(0, 3).forEach((x) => swaps.push({ slot, out: stats[slot].name, in: allStats[x.c].name, inId: allStats[x.c].id,
      inMoves: allStats[x.c].moves, delta: x.score - composite, grades: gradesFor(x.m, C) }));
  }
  swaps.sort((a, b) => b.delta - a.delta);

  const sharedTypes = res.sharedTypes;
  return {
    members: stats.map((s) => ({ id: s.id, name: s.name, types: s.types, moves: s.moves, moveStr: s.moveStr })),
    grades, metrics: res.metrics, composite, tier: M.tierOf(composite, cuts),
    summary: summarize(grades, composite, det.threats, stats, det.blind, sharedTypes, M.tierOf(composite, cuts), (F && F.title) || 'Great League'),
    threats: det.threats, blind: det.blind, sharedTypes,
    plan, heat, memberCards, ivEffects, swaps: swaps.slice(0, 6), fieldWins: sc.metaDetail([0, 1, 2]),
    searchString: stats.map((s) => s.name.replace(/\s*\(.*\)$/, '').toLowerCase()).filter((v, i, a) => a.indexOf(v) === i).join(',') + (F && F.cp < 10000 ? `&cp-${F.cp}` : ''),
  };
}

module.exports = { buildReport, gradesFor };
