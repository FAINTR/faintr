// Compact team data for the website (about 4 MB per format instead of 32 MB), with exactly the desktop app's numbers.
// Teams aren't stored: they're re-enumerated from the candidate pool with the same rules as build.js.
// Order and the cheap metrics (bulk, safety, consistency, shared weakness, order score) are recomputed
// from candidate statics. Only the expensive per-team numbers are stored, column by column:
//   threatScore (Uint16), metaWin games won (Uint8), blindSpots (Uint8), pilot count (Uint8),
//   twoAnswers (Uint16 index into a table of its distinct Float32 values), resilience (Float32, bytes split into
//   4 planes so it compresses well). Every stored value round-trips bit for bit.
const M = require('./metrics');

const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
const VERSION = 2;
// Same enumeration as build.js: one Pokemon per Pokedex number, at most one Mega
function enumerate(statics) {
  const out = [], n = statics.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    if (statics[a].base === statics[b].base || (statics[a].mega && statics[b].mega)) continue;
    for (let c = b + 1; c < n; c++) {
      if (statics[c].base === statics[a].base || statics[c].base === statics[b].base) continue;
      if (statics[c].mega && (statics[a].mega || statics[b].mega)) continue;
      out.push(a, b, c);
    }
  }
  return new Uint8Array(out);
}

function bestOrder(S, a, b, c) {
  const m = [a, b, c]; let bestO = 0, bestV = -1;
  PERMS.forEach((p, k) => { const v = S[m[p[0]]].lead + S[m[p[1]]].sw + S[m[p[2]]].closer; if (v > bestV) { bestV = v; bestO = k; } });
  return { order: bestO, orderScore: bestV / 3 };
}

const shuffle = (f32) => { const b = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength), n = f32.length, o = new Uint8Array(n * 4); for (let p = 0; p < 4; p++) for (let i = 0; i < n; i++) o[p * n + i] = b[i * 4 + p]; return o; };
const unshuffle = (u8, n) => { const o = new Uint8Array(n * 4); for (let p = 0; p < 4; p++) for (let i = 0; i < n; i++) o[i * 4 + p] = u8[p * n + i]; return new Float32Array(o.buffer); };

// Build side: D from loadTeams, plus field size and meta-opponent count from the scorer
function encode(D, fieldSize, metaOppLen) {
  const n = D.n, K = D.K, F = D.info.fields, idx = (f) => F.indexOf(f);
  const col = (f) => { const k = idx(f), a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = D.metrics[i * K + k]; return a; };
  const games = fieldSize * 3;
  const threat = new Uint16Array(n), mw = new Uint8Array(n), blind = new Uint8Array(n), pilot = new Uint8Array(n);
  const tsc = col('threatScore'), mwc = col('metaWin'), bsc = col('blindSpots'), plc = col('pilot');
  for (let i = 0; i < n; i++) {
    threat[i] = Math.round(tsc[i]); mw[i] = Math.round(mwc[i] / 100 * games); blind[i] = Math.round(bsc[i]); pilot[i] = Math.round(plc[i] / 100 * metaOppLen);
  }
  const two = col('twoAnswers'), res = col('resilience');
  const dict = [...new Set(two)].sort((x, y) => x - y);
  const parts = [threat, mw, blind, pilot];
  let twoMode;
  if (dict.length <= 65535) {
    const at = new Map(dict.map((v, k) => [v, k])), ix = new Uint16Array(n);
    for (let i = 0; i < n; i++) ix[i] = at.get(two[i]);
    parts.push(ix, Float32Array.from(dict)); twoMode = 'dict';
  } else { parts.push(shuffle(two)); twoMode = 'f32'; }
  parts.push(shuffle(res));
  const header = Buffer.from(JSON.stringify({ v: VERSION, n, fieldSize, metaOppLen, twoMode, dictLen: twoMode === 'dict' ? dict.length : 0 }));
  const len = Buffer.alloc(4); len.writeUInt32LE(header.length);
  const out = Buffer.concat([len, header, ...parts.map((b) => Buffer.from(b.buffer, b.byteOffset, b.byteLength))]);
  // Never publish data that doesn't come back exactly
  const back = decode(D.info, out, null, true);
  for (const [name, a, b] of [['threatScore', tsc, back.cols.threatScore], ['twoAnswers', two, back.cols.twoAnswers], ['resilience', res, back.cols.resilience]]) {
    for (let i = 0; i < n; i++) if (Math.fround(a[i]) !== b[i]) throw new Error(`teamcodec: ${name} of team ${i} doesn't round-trip (${a[i]} vs ${b[i]})`);
  }
  return out;
}

// Both sides: rebuild a D object (same shape as teamdata.loadTeams) from the compact bytes
function decode(info, bytes, metaTypes, colsOnly) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const hlen = u8[0] | (u8[1] << 8) | (u8[2] << 16) | (u8[3] << 24);
  const head = JSON.parse(new TextDecoder().decode(u8.subarray(4, 4 + hlen)));
  if (head.v !== VERSION) throw new Error(`Team data format ${head.v} isn't supported by this version of FAINTR. Reload the page.`);
  const n = head.n;
  let off = 4 + hlen;
  const take = (bytesLen) => { const c = new Uint8Array(u8.buffer.slice(u8.byteOffset + off, u8.byteOffset + off + bytesLen)); off += bytesLen; return c; };
  const cols = {};
  cols.threatScore = new Uint16Array(take(n * 2).buffer);
  cols.metaWinGames = take(n); cols.blindSpots = take(n); cols.pilotCount = take(n);
  if (head.twoMode === 'dict') {
    const ix = new Uint16Array(take(n * 2).buffer), dict = new Float32Array(take(head.dictLen * 4).buffer);
    cols.twoAnswers = new Float32Array(n); for (let i = 0; i < n; i++) cols.twoAnswers[i] = dict[ix[i]];
  } else cols.twoAnswers = unshuffle(take(n * 4), n);
  cols.resilience = unshuffle(take(n * 4), n);
  if (colsOnly) return { cols };
  const S = info.cands;
  const members = enumerate(S);
  if (members.length !== n * 3) throw new Error(`Team data doesn't match its candidate list (${members.length / 3} vs ${n}).`);
  const mt = metaTypes || [];
  const weakMask = S.map((s) => mt.reduce((acc, t, k) => (s.weak.includes(t) ? acc | (1 << k) : acc), 0));
  const fields = M.FIELDS, K = fields.length, fi = (f) => fields.indexOf(f);
  const metrics = new Float32Array(n * K), orders = new Uint8Array(n);
  const games = head.fieldSize * 3;
  const pc = (x) => { let c = 0; while (x) { x &= x - 1; c++; } return c; };
  for (let i = 0; i < n; i++) {
    const a = members[i * 3], b = members[i * 3 + 1], c = members[i * 3 + 2];
    const bo = bestOrder(S, a, b, c);
    orders[i] = bo.order;
    const o = i * K;
    metrics[o + fi('threatScore')] = cols.threatScore[i];
    metrics[o + fi('bulk')] = (S[a].bulk + S[b].bulk + S[c].bulk) / 3;
    metrics[o + fi('safety')] = (S[a].safety + S[b].safety + S[c].safety) / 3;
    metrics[o + fi('consistency')] = (S[a].consistency + S[b].consistency + S[c].consistency) / 3;
    metrics[o + fi('blindSpots')] = cols.blindSpots[i];
    metrics[o + fi('twoAnswers')] = cols.twoAnswers[i];
    metrics[o + fi('resilience')] = cols.resilience[i];
    const wa = weakMask[a], wb = weakMask[b], wc = weakMask[c];
    metrics[o + fi('sharedWeak')] = pc((wa & wb) | (wa & wc) | (wb & wc));
    metrics[o + fi('pilot')] = head.metaOppLen ? (cols.pilotCount[i] / head.metaOppLen) * 100 : 0;
    metrics[o + fi('orderScore')] = bo.orderScore;
    metrics[o + fi('metaWin')] = games ? (cols.metaWinGames[i] / games) * 100 : 0;
  }
  return { n, K, members, metrics, orders };
}

module.exports = { encode, decode, enumerate, VERSION };
