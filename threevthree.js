// FAINTR 3v3 model: plays one team against another using the 1v1 matchup matrix.
// It is a model, not a full battle: HP carries over between fights, each side has two shields and
// spends one per fight, the side losing the lead can switch once, and a fainted Pokemon is replaced by
// the best remaining answer. Checked against 3v3 chains played on PvPoke's engine (HP, energy and
// shields carried over): the two agree on the winner in about 80% of games (tools/validate_3v3.js).

// Time ratio from a fresh-vs-fresh rating: how long A needs to KO B, in units of how long B needs to KO A
function ratio(r) {
  if (r >= 500) return Math.max(0.02, 1 - (r - 500) / 500);
  return 500 / Math.max(r, 10);
}

// rate(s, a, b): rating (0..1000) of a against b with s shields each
function fight(rate, s, a, b, fa, fb) {
  const rho = ratio(rate(s, a, b));
  const need = rho * fb;            // time A needs; B needs fa to finish A
  if (need < fa) return fa - need;  // A wins with this much HP left
  return -(fb - fa / rho);          // B wins: negative of B's HP left
}

const sum = (a) => a[0] + a[1] + a[2];

// One game. A and B are member indexes in play order (lead first). Returns > 0 when A wins.
function playGameF(rate, A, B) {
  const hpA = [1, 1, 1], hpB = [1, 1, 1];
  let shA = 2, shB = 2, ia = 0, ib = 0;
  // Lead: the side losing it (at 1 shield) may switch once to a member that wins it
  const lead = rate(1, A[0], B[0]);
  if (lead < 450) {
    let best = 0, bv = lead;
    for (let k = 1; k < 3; k++) { const v = rate(1, A[k], B[0]); if (v > bv) { bv = v; best = k; } }
    if (bv > 520) ia = best;
  } else if (lead > 550) {
    let best = 0, bv = 1000 - lead;
    for (let k = 1; k < 3; k++) { const v = rate(1, B[k], A[0]); if (v > bv) { bv = v; best = k; } }
    if (bv > 520) ib = best;
  }
  for (let guard = 0; guard < 6; guard++) {
    const res = fight(rate, Math.min(shA, shB), A[ia], B[ib], hpA[ia], hpB[ib]);
    if (shA > 0) shA--; if (shB > 0) shB--;
    if (res > 0) { hpA[ia] = res; hpB[ib] = 0; } else { hpB[ib] = -res; hpA[ia] = 0; }
    const s = Math.min(shA, shB);
    if (hpA[ia] <= 0) {
      let best = -1, bv = -Infinity;
      for (let k = 0; k < 3; k++) if (hpA[k] > 0) { const v = fight(rate, s, A[k], B[ib], hpA[k], hpB[ib]); if (v > bv) { bv = v; best = k; } }
      if (best < 0) return -sum(hpB);
      ia = best;
    }
    if (hpB[ib] <= 0) {
      let best = -1, bv = -Infinity;
      for (let k = 0; k < 3; k++) if (hpB[k] > 0) { const v = -fight(rate, s, A[ia], B[k], hpA[ia], hpB[k]); if (v > bv) { bv = v; best = k; } }
      if (best < 0) return sum(hpA);
      ib = best;
    }
  }
  return sum(hpA) - sum(hpB);
}

// B leads with each of its three members in turn
const LEAD_ORDERS = [[0, 1, 2], [1, 0, 2], [2, 0, 1]];
function playSeriesF(rate, A, B) {
  let wins = 0, margin = 0;
  for (const o of LEAD_ORDERS) {
    const r = playGameF(rate, A, [B[o[0]], B[o[1]], B[o[2]]]);
    if (r > 0) wins++;
    margin += r;
  }
  return { wins, margin };
}

// Pool table: R[s][i*n+j] = rating of pool member i against pool member j
function ratingTable(matrix) {
  const n = matrix.statics.length;
  const tIndex = new Map(matrix.threats.map((t, i) => [t.id, i]));
  const R = [0, 1, 2].map(() => new Int16Array(n * n));
  for (let i = 0; i < n; i++) {
    const row = matrix.rows[i];
    for (let j = 0; j < n; j++) {
      const t = tIndex.get(matrix.statics[j].id);
      for (let s = 0; s < 3; s++) R[s][i * n + j] = t === undefined ? 500 : 1000 - row['r' + s][t];
    }
  }
  const rate = (s, a, b) => R[s][a * n + b];
  return { R, n, rate };
}
const playGame = (T, A, B) => playGameF(T.rate, A, B);
const playSeries = (T, A, B) => playSeriesF(T.rate, A, B);

// Win share (0..100) against a field of teams: three games per opponent, one per opposing lead
function metaWinShare(rate, A, field) {
  let w = 0;
  for (const B of field) w += playSeriesF(rate, A, B).wins;
  return (w / (field.length * 3)) * 100;
}

// The strongest varied teams in a format: best overall score, each Pokemon in at most `cap` of them
function pickMetaTeams(D, scores, count = 60, cap = 6) {
  const order = Array.from(scores.keys()).sort((x, y) => scores[y] - scores[x]);
  const used = new Map(), out = [];
  for (const i of order) {
    const mem = [D.members[i * 3], D.members[i * 3 + 1], D.members[i * 3 + 2]];
    if (mem.some((m) => (used.get(m) || 0) >= cap)) continue;
    mem.forEach((m) => used.set(m, (used.get(m) || 0) + 1));
    out.push(i);
    if (out.length >= count) break;
  }
  return out;
}

// Team members in play order (lead, safe swap, closer)
function ordered(D, perms, i) {
  const p = perms[D.orders[i]];
  return [D.members[i * 3 + p[0]], D.members[i * 3 + p[1]], D.members[i * 3 + p[2]]];
}

module.exports = { ratingTable, playGame, playSeries, playGameF, playSeriesF, metaWinShare, pickMetaTeams, ordered, LEAD_ORDERS };
