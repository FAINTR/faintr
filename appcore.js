// FAINTR's app logic, shared by the desktop server (server.js) and the website (web/src/core.js).
// Everything that touches the outside world comes in through `env`:
//   ev(code)                 run code in PvPoke's global scope (Node vm, or the worker's own scope)
//   pool.run(fn, ...args)    run a heavy engine function in a background worker
//   formats                  the list from formats.listFormats
//   loadFormatData(F)        async: { D, matrix, changes } for a built format, or null
//   storage                  async roster/saved-team storage (see ROSTER/SAVED calls below)
//   live()                   { now, next, season } from the GO Battle League schedule
//   info                     { app, version, source }
//   isBuilt(key), buildStatus(key)
const M = require('./metrics');
const { describe, query, tierCuts } = require('./teamdata');
const { Scorer, PERMS } = require('./scoring');
const { buildReport, gradesFor } = require('./report');
const { upgradeCandidates } = require('./viptools');
const rosterLeagues = require('./ui/roster-leagues');
const storagePatches = require('./ui/storage-patches');
const {teamError}=require('./team-rules');

const DEFAULT_F = 'all-1500';
const IV_FLOORS = [0, 1, 2, 3, 4, 5, 10, 12];
const LEAGUE_KEYS = { 500: 'little-500', 1500: 'all-1500', 2500: 'all-2500', 10000: 'all-10000' };
const Fjs = (F) => JSON.stringify({ cup: F.cup, cp: F.cp, meta: F.meta });
const clampInt = (v, lo, hi, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const err = (msg, code) => { const e = new Error(msg); e.code = code; return e; };

function normIVs(ivs) {
  if (!ivs) return null;
  const v = { atk: +ivs.atk, def: +ivs.def, hp: +ivs.hp };
  if ([v.atk, v.def, v.hp].some((x) => !(x >= 0 && x <= 15) || !Number.isInteger(x))) throw err('IVs must be whole numbers from 0 to 15.', 400);
  return v;
}
function memberKey(m) { return `${m.id}|${(m.moveset || []).join(',')}|${m.ivs ? `${m.ivs.atk}/${m.ivs.def}/${m.ivs.hp}` : 'default'}|${m.levelCap || 50}`; }

const ROSTER_MAX = 2000;
function createCore(env) {
  const fstates = new Map();
  let fullCat = null;
  const ev = env.ev;
  const fullCatalog = () => fullCat || (fullCat = ev('fullCatalog()'));

  function formatDef(key) {
    const F = env.formats.find((f) => f.key === (key || DEFAULT_F));
    if (!F) throw err('That league or cup is not available in this data. Pick another one.', 404);
    return F;
  }

  // ---------- per-format state (loaded on first use)
  async function fstate(key) {
    key = key || DEFAULT_F;
    if (fstates.has(key)) return fstates.get(key);
    const p = (async () => {
      const F = formatDef(key);
      const catalog = ev(`pokemonCatalog(${Fjs(F)})`);
      const extraMoves=ev(`Object.fromEntries(gm.data.pokemon.filter(p=>p.extraChargedMoves).map(p=>[p.speciesId,p.extraChargedMoves.map(id=>[id,gm.getMoveById(id).name])]))`);
      catalog.forEach(p=>{p.extra=extraMoves[p.id]||[];});
      const rank = (cat) => ev(`loadRankings(${JSON.stringify(F.cup)}, '${cat}', ${F.cp})`);
      const overallRaw = rank('overall').filter((r) => r.speciesId.indexOf('_xs') === -1);
      const leads = rank('leads').filter((r) => r.speciesId.indexOf('_xs') === -1).map((r) => ({ id: r.speciesId }));
      const st = { F, catalog, catalogNames: new Map(catalog.map((c) => [c.id, c.name])), catalogById: new Map(catalog.map((c) => [c.id, c])),
        overallRaw, leads, memberCache: new Map(), D: null, matrix: null, scorer: null, teamIndex: null, changes: null };
      const data = await env.loadFormatData(F);
      if (data) attachTeams(st, data);
      return st;
    })();
    fstates.set(key, p);
    p.then((st) => { p._n = st.D ? st.D.n : null; }, () => fstates.delete(key));
    return p;
  }
  function attachTeams(st, { D, matrix, changes }) {
    st.D = D; st.matrix = matrix; st.changes = changes || null;
    st.scorer = new Scorer({ ev }, matrix.threats, matrix.meta, matrix.rows, matrix.statics, st.F);
    matrix.cands.forEach((c, i) => st.memberCache.set(memberKey({ id: c.id, moveset: matrix.rows[i].moveset }), Promise.resolve({ row: matrix.rows[i], stat: matrix.statics[i] })));
    st.teamIndex = new Map();
    for (let i = 0; i < D.n; i++) st.teamIndex.set(D.members[i * 3] * 65536 + D.members[i * 3 + 1] * 256 + D.members[i * 3 + 2], i);
  }
  async function builtState(key) {
    const st = await fstate(key);
    if (!st.D) throw err(`${st.F.title} isn't set up yet.`, 409);
    return st;
  }
  function forget(key) { if (key) fstates.delete(key); else fstates.clear(); }

  // ---------- members
  function resolveMember(st, mem) {
    const p = st.catalogById.get(mem.id);
    if (!p) throw err(`${(fullCat || []).find((c) => c.id === mem.id)?.name || mem.id} isn't eligible for ${st.F.title}.`, 422);
    const moveset = mem.moveset && mem.moveset.length ? mem.moveset : p.rec;
    if (!Array.isArray(moveset) || moveset.length<2 || moveset.length>4 ||
        !p.fast.some(([id])=>id===moveset[0]) || moveset.slice(1).some((move,i)=>!(i===2?p.extra:p.charged).some(([id])=>id===move))) {
      throw err(`${p.name} has a move that is no longer available. Edit its Roster entry or choose its moves again.`,422);
    }
    const cap = [40, 41, 50, 51].includes(+mem.levelCap) ? +mem.levelCap : 50;
    return { id: mem.id, moveset, ivs: normIVs(mem.ivs), levelCap: cap };
  }
  function getMember(st, m) {
    const key = memberKey(m);
    let p = st.memberCache.get(key);
    if (!p) {
      p = Promise.all([env.pool.run('memberRow', m.id, m.moveset, st.F, m.ivs, m.levelCap), env.pool.run('memberStatic', m.id, m.moveset, st.F, m.ivs, m.levelCap)])
        .then(([row, stat]) => ({ row, stat }));
      p.catch(() => st.memberCache.delete(key));
      st.memberCache.set(key, p);
    }
    return p;
  }
  const teamLink = (st, ms) => ev(`pvpokeTeamLink(${JSON.stringify(ms)}, ${Fjs(st.F)})`);

  async function report(st, members, weights) {
    const ms = members.map((m) => resolveMember(st, m));
    const invalid=teamError(ms.map(m=>st.catalogById.get(m.id)));if(invalid)throw err(invalid,422);
    const custom = ms.map((m) => !!m.ivs);
    const ivP = ms.map((m) => env.pool.run('ivInfo', m.id, m.ivs, m.levelCap, st.F));
    const mineP = ms.map((m) => getMember(st, m));
    const defP = ms.map((m, k) => (custom[k] ? getMember(st, { id: m.id, moveset: m.moveset, ivs: null, levelCap: 50 }) : Promise.resolve(null)));
    const r1P = ms.map((m, k) => ivP[k].then((iv) => {
      const r1 = iv.rank1;
      const isRank1 = r1 && iv.ivs.atk === r1.atk && iv.ivs.def === r1.def && iv.ivs.hp === r1.hp;
      return r1 && !isRank1 ? getMember(st, { id: m.id, moveset: m.moveset, ivs: { atk: r1.atk, def: r1.def, hp: r1.hp }, levelCap: m.levelCap }) : null;
    }));
    const [ivInfos, mine, defs, r1s] = await Promise.all([Promise.all(ivP), Promise.all(mineP), Promise.all(defP), Promise.all(r1P)]);
    const alts = ms.map((m, k) => ({ def: defs[k] && defs[k].row, rank1: r1s[k] && r1s[k].row, custom: custom[k] }));
    const rep = buildReport({
      ctx: { ev }, F: st.F, C: st.D.C, matrix: st.matrix, rows: mine.map((x) => x.row), stats: mine.map((x) => x.stat),
      ivs: ivInfos, ivRows: alts, leads: st.leads, overallTop: st.overallRaw.map((r) => ({ id: r.speciesId })),
      catalogNames: st.catalogNames, weights, cuts: tierCuts(st.D, weights),
    });
    rep.pvpoke = teamLink(st, ms);
    rep.input = ms;
    rep.f = st.F.key;
    if (st.matrix.metaField) { const names = fieldNames(st); rep.field = { verified: false, teams: names.map((n, k) => ({ names: n, wins: rep.fieldWins[k] })) }; }
    delete rep.fieldWins;
    return rep;
  }
  async function quickGrade(st, members) {
    const ms = members.map((m) => resolveMember(st, m));
    const invalid=teamError(ms.map(m=>st.catalogById.get(m.id)));if(invalid)throw err(invalid,422);
    const mine = await Promise.all(ms.map((m) => getMember(st, m)));
    const sc = new Scorer({ ev }, st.matrix.threats, st.matrix.meta, mine.map((x) => x.row), mine.map((x) => x.stat), st.F);
    const r = sc.scoreTeam([0, 1, 2], 0);
    return { grades: gradesFor(r.metrics, st.D.C), composite: M.composite(r.metrics, M.DEFAULT_WEIGHTS, st.D.C) };
  }
  const historyEntry = (st, g) => ({ version: st.D.info.pvpoke, at: new Date().toISOString(), letters: Object.fromEntries(Object.entries(g.grades).map(([k, v]) => [k, v.letter])), composite: g.composite });

  // Re-grade saved teams after a data update so you can see what changed. Returns the teams that changed.
  // Several changes in one write (the website saves each account's data as one record)
  const rosterPutMany = (list) => (env.storage.rosterUpsertMany ? env.storage.rosterUpsertMany(list) : list.reduce((p, e) => p.then(() => env.storage.rosterUpsert(e)), Promise.resolve()));
  const savedPutMany = (list) => (env.storage.savedUpsertMany ? env.storage.savedUpsertMany(list) : list.reduce((p, t) => p.then(() => env.storage.savedUpsert(t)), Promise.resolve()));
  async function regradeSaved() {
    const list = await env.storage.savedAll();
    const changed = [];
    for (const t of list) {
      try {
        const st = await fstate(t.f || DEFAULT_F);
        if (!st.D) continue;
        if (t.history && t.history.length && t.history[0].version === st.D.info.pvpoke) continue;
        const basis=storagePatches.basis(t,'saved');
        const g = await quickGrade(st, t.members);
        changed.push({id:t.id,basis,history:[historyEntry(st,g)].concat(t.history||[]).slice(0,30)});
      } catch (e) { if (env.log) env.log(`regrade failed for ${t.name}: ${e.message}`); }
    }
    if (changed.length) await env.storage.savedRefreshMany(changed);
    return changed.length;
  }

  // ---------- teams
  function fieldNames(st) {
    if (!st._fieldNames) st._fieldNames = (st.matrix.metaField || []).map((tm) => tm.map((id) => st.catalogNames.get(id) || id));
    return st._fieldNames;
  }
  function fieldResults(st, i, orderedIdx) {
    if (!st.matrix.metaField) return null;
    const v = i !== null && st.D.anti && st.D.anti.verified.get(i);
    const wins = v ? v.beat : st.scorer.metaDetail(orderedIdx);
    return { verified: !!v, teams: fieldNames(st).map((n, k) => ({ names: n, wins: wins[k] })) };
  }
  function teamDetail(st, i, weights) {
    const D = st.D;
    const base = describe(D, i, weights);
    const mem = [D.members[i * 3], D.members[i * 3 + 1], D.members[i * 3 + 2]];
    const ordered = PERMS[D.orders[i]].map((p) => mem[p]);
    const r = st.scorer.scoreTeam(mem);
    const det = st.scorer.detail(ordered, r.threats);
    const stat = ordered.map((x) => st.matrix.statics[x]);
    const input = stat.map((s) => ({ id: s.id, moveset: s.moveset }));
    return { ...base, threats: r.threats.map((t) => st.matrix.threats[t].name), detail: det, sharedTypes: r.sharedTypes, memberIdx: ordered,
      field: fieldResults(st, i, ordered), input, pvpoke: teamLink(st, input) };
  }
  function swapAdvice(st, memberIdx, weights) {
    const w = Object.assign({}, M.DEFAULT_WEIGHTS, weights || {});
    const S = st.matrix.statics, D = st.D;
    const cur = M.composite(st.scorer.scoreTeam(memberIdx).metrics, w, D.C);
    const out = [];
    for (let slot = 0; slot < 3; slot++) {
      const others = memberIdx.filter((_, k) => k !== slot);
      let best = null;
      for (let c = 0; c < S.length; c++) {
        if (memberIdx.includes(c) || others.some((o) => S[o].base === S[c].base)) continue;
        const key = [others[0], others[1], c].sort((a, b) => a - b);
        const ti = st.teamIndex.get(key[0] * 65536 + key[1] * 256 + key[2]);
        if (ti === undefined) continue;
        const m = {}; D.info.fields.forEach((f, k) => { m[f] = D.metrics[ti * D.K + k]; });
        const s = M.composite(m, w, D.C);
        if (!best || s > best.score) best = { score: s, c };
      }
      if (best) out.push({ out: S[memberIdx[slot]].name, in: S[best.c].name, delta: best.score - cur });
    }
    return { current: cur, swaps: out.sort((a, b) => b.delta - a.delta) };
  }

  // ---------- matchups
  function threatIndex(st) {
    if (!st._tIndex) {
      const list = st.matrix ? st.matrix.threats : ev(`threatList(${Fjs(st.F)})`);
      st._tIndex = new Map(list.map((t, i) => [t.id, i]));
    }
    return st._tIndex;
  }
  async function vsMeta(st, mem) {
    const m = resolveMember(st, mem);
    const [{ row, stat }, iv] = await Promise.all([getMember(st, m), env.pool.run('ivInfo', m.id, m.ivs, m.levelCap, st.F)]);
    const tIndex = threatIndex(st);
    const list = st.overallRaw.slice(0, 100).filter((r) => tIndex.has(r.speciesId)).map((r, n) => {
      const t = tIndex.get(r.speciesId);
      return { rank: n + 1, id: r.speciesId, name: st.catalogNames.get(r.speciesId) || r.speciesName, r: [1000 - row.r0[t], 1000 - row.r1[t], 1000 - row.r2[t]] };
    });
    return { member: { id: stat.id, name: stat.name, types: stat.types, moves: stat.moves }, iv, wins: [0, 1, 2].map((s) => list.filter((x) => x.r[s] > 500).length), list };
  }
  // Counter finder: the best answers to up to three opponents, from the top 150 or from the Roster
  async function counters(st, opponents, source) {
    const tIndex = threatIndex(st);
    const opp = opponents.filter((id) => st.catalogById.has(id)).slice(0, 3);
    const needsDirect = opp.some(id=>!tIndex.has(id));
    if (!opp.length) throw err(`Pick at least one opponent that's eligible for ${st.F.title}.`, 400);
    let cands = [];
    if (source === 'roster') {
      const roster = (await env.storage.rosterAll()).filter((e) => st.catalogById.has(e.id) && rosterLeagues.usable(e, st.F.cp));
      if (!roster.length) throw err(`Nothing in your Roster is eligible for ${st.F.title} yet.`, 400);
      // Only battle the chosen opponents: a few dozen sims per Pokemon instead of the whole league
      cands = await Promise.all(roster.map(async (e) => {
        const m = resolveMember(st, { id: e.id, moveset: e.moveset, ivs: e.ivs, levelCap: e.levelCap });
        const c = st.catalogById.get(m.id), mv = new Map([...c.fast, ...c.charged, ...(c.extra||[])]);
        const direct = await env.pool.run('memberVs', m.id, m.moveset, st.F, m.ivs, m.levelCap, opp);
        return { direct, stat: { id: m.id, name: c.name, types: c.types, moves: m.moveset.map((x) => mv.get(x) || x) }, label: e.nickname || c.name, uid: e.uid, ivs: e.ivs, shiny: !!e.shiny };
      }));
    } else if (!st.matrix || needsDirect) {
      const choices=st.matrix?st.matrix.statics:st.overallRaw.slice(0,40).filter(r=>st.catalogById.has(r.speciesId)).map(r=>({id:r.speciesId,moveset:r.moveset}));
      cands=await Promise.all(choices.map(async candidate=>{
        const m=resolveMember(st,{id:candidate.id,moveset:candidate.moveset}),c=st.catalogById.get(m.id),moves=new Map([...c.fast,...c.charged,...(c.extra||[])]);
        const direct=await env.pool.run('memberVs',m.id,m.moveset,st.F,m.ivs,m.levelCap,opp);
        return {direct,stat:{id:m.id,name:c.name,types:c.types,moves:m.moveset.map(id=>moves.get(id)||id)},label:c.name};
      }));
    } else cands = st.matrix.rows.map((row, i) => ({ row, stat: st.matrix.statics[i], label: st.matrix.statics[i].name }));
    const oi = opp.map((id) => tIndex.get(id));
    const res = cands.filter((c) => !opp.includes(c.stat.id)).map((c) => {
      const vs = c.direct ? opp.map((_, k) => [1000 - c.direct.r0[k], 1000 - c.direct.r1[k], 1000 - c.direct.r2[k]])
        : oi.map((t) => [1000 - c.row.r0[t], 1000 - c.row.r1[t], 1000 - c.row.r2[t]]);
      const wins = [0, 1, 2].map((s) => vs.filter((v) => v[s] > 500).length);
      const avg1 = vs.reduce((a, v) => a + v[1], 0) / vs.length;
      return { id: c.stat.id, name: c.label, types: c.stat.types, moves: c.stat.moves, uid: c.uid, ivs: c.ivs, vs, wins, avg1, worst1: Math.min(...vs.map((v) => v[1])) };
    });
    res.sort((a, b) => b.wins[1] - a.wins[1] || b.avg1 - a.avg1);
    return { opponents: opp.map((id) => ({ id, name: st.catalogNames.get(id) || id })), results: res.slice(0, 20), source };
  }
  function metaView(st) {
    const per = st.changes ? st.changes.per : {};
    const rows = st.overallRaw.slice(0, 250).map((r, i) => {
      const c = st.catalogById.get(r.speciesId);
      const mv = new Map(c ? [...c.fast, ...c.charged] : []);
      return { rank: i + 1, id: r.speciesId, name: c ? c.name : r.speciesName, types: c ? c.types : [], score: r.score,
        scores: { lead: r.scores[0], closer: r.scores[1], switch: r.scores[2], charger: r.scores[3], attacker: r.scores[4], consistency: r.scores[5] },
        moves: r.moveset.map((x) => mv.get(x) || x), delta: per[r.speciesId] === undefined ? undefined : per[r.speciesId] };
    });
    const c = st.changes;
    return { f: st.F.key, title: st.F.title, rows, changes: c ? { from: c.from, to: c.to, at: c.at, risers: c.risers, fallers: c.fallers, newcomers: c.newcomers, movesets: c.movesets } : null };
  }

  // ---------- Roster
  // Entries plus which standard leagues each is eligible for, and its move names
  async function rosterSummary(entries) {
    if (!entries.length) return [];
    const elig = {};
    // Eligibility needs the catalog, not hundreds of thousands of ranked teams.
    for (const [cp, key] of Object.entries(LEAGUE_KEYS)) { try { elig[cp] = new Set(ev(`pokemonCatalog(${Fjs(formatDef(key))})`).map(p=>p.id)); } catch (e) { elig[cp] = null; } }
    const byId = new Map(fullCatalog().map((c) => [c.id, c]));
    return entries.map((e) => ({ ...e, image: undefined,
      moveNames: (() => { const c = byId.get(e.id); if (!c) return []; const mv = new Map([...c.fast, ...c.charged,...(c.extra||[])]); return (e.moveset || []).map((m) => mv.get(m) || m); })(),
      eval: e.eval && { ...e.eval, leagues: e.eval.leagues.map((l) => ({ ...l, eligible: elig[l.cp] ? elig[l.cp].has(e.id) : true })) } }));
  }
  // Validates a Roster entry and evaluates it; the caller stores it
  async function makeRosterEntry(body, old) {
    const sp = fullCatalog().find((c) => c.id === body.id);
    if (!sp) throw err('Pick a Pokémon from the list.', 400);
    const ivs = normIVs(body.ivs || { atk: 0, def: 0, hp: 0 });
    const cp = body.cp ? Number(body.cp) : null;
    if(cp!==null&&(!Number.isInteger(cp)||cp<10||cp>9999))throw err('Current CP must be a whole number from 10 to 9,999.',400);
    const levelCap = +body.levelCap === 51 ? 51 : 50;
    if(body.moveset!=null&&(!Array.isArray(body.moveset)||body.moveset.length>4||body.moveset.some(m=>typeof m!=='string')))throw err('Moves must be a list of up to four move IDs.',400);
    const moveset = body.moveset||[];
    if(moveset.length&&(moveset.length<2||!sp.fast.some(([id])=>id===moveset[0])||moveset.slice(1).some((move,i)=>!(i===2?sp.extra||[]:sp.charged).some(([id])=>id===move))))throw err('Those moves do not match this Pokémon. Choose its moves again, or leave them on PvPoke’s pick.',400);
    const ball = ['poke', 'great', 'ultra', 'master', 'premier', 'other'].includes(body.ball) ? body.ball : 'poke';
    const evalRes = await env.pool.run('rosterEval', sp.id, ivs, cp, levelCap);
    return {
      uid: old ? old.uid : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      id: sp.id, name: sp.name, types: sp.types, dex: sp.dex, nickname: String(body.nickname || '').slice(0, 24),
      moveset, ivs, cp, levelCap, shiny: !!body.shiny, ball,
      leagues: rosterLeagues.normalize(body.leagues === undefined && old ? old.leagues : body.leagues),
      notes: String(body.notes || '').slice(0, 80), pinned: !!body.pinned,
      added: old ? old.added : new Date().toISOString(), eval: evalRes,
    };
  }
  async function saveRosterEntry(body) {
    const all = await env.storage.rosterAll();
    const old = body.uid ? all.find((x) => x.uid === body.uid) : null;
    storagePatches.assertCurrent(old,body.expected);
    if (!old && all.length >= ROSTER_MAX) throw err(`Your Roster holds up to ${ROSTER_MAX} Pokémon. Remove some to add more.`, 400);
    const entry = await makeRosterEntry(body, old);
    await env.storage.rosterUpsert(entry,body.expected===undefined&&old?storagePatches.contentBasis(old):body.expected);
    return entry;
  }
  // Entries saved by an older version get the newer evaluation (evolutions, XL)
  async function refreshRosterEvals() {
    const list = await env.storage.rosterAll(), changed = [];
    for (const e of list) {
      if (e.eval && e.eval.v >= 2) continue;
      const basis=storagePatches.basis(e,'roster');
      try { changed.push({uid:e.uid,basis,eval:await env.pool.run('rosterEval',e.id,e.ivs,e.cp,e.levelCap)}); } catch (err2) { /* keep the old one */ }
    }
    if (changed.length) await env.storage.rosterRefreshMany(changed);
    return changed.length;
  }
  // Quick add from pasted lines like "Azumarill 0/15/15 1498"
  function parseRosterLines(text) {
    const full = fullCatalog();
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const out = [], bad = [];
    for (const raw of String(text || '').split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
      const ivm = raw.match(/(\d{1,2})\s*[/\-. ]\s*(\d{1,2})\s*[/\-. ]\s*(\d{1,2})/);
      const cpm = raw.replace(ivm ? ivm[0] : '', ' ').match(/\b(?:cp\s*)?(\d{2,4})\b/i);
      const shiny = /\bshiny\b/i.test(raw);
      const namePart = norm(raw.replace(ivm ? ivm[0] : '', ' ').replace(cpm ? cpm[0] : '', ' ').replace(/\bshiny\b/i, ''));
      const shadow = /\bshadow\b/.test(namePart);
      const base = namePart.replace(/\bshadow\b/, '').trim();
      const hit = full.find((c) => norm(c.name.replace(/\(shadow\)/i, '')) === base && c.shadow === shadow) || full.find((c) => norm(c.name) === namePart);
      if (!hit || !ivm) { bad.push(raw); continue; }
      out.push({ id: hit.id, ivs: { atk: +ivm[1], def: +ivm[2], hp: +ivm[3] }, cp: cpm ? +cpm[1] : null, shiny });
    }
    return { entries: out, bad };
  }
  // CSV exports from Poke Genie, Calcy IV and similar
  function parseCSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
      if (c === '"') q = true; else if (c === ',' || c === ';' || c === '\t') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim()));
  }
  function rosterFromCSV(text) {
    const full = fullCatalog();
    const rows = parseCSV(String(text || ''));
    if (rows.length < 2) throw err('That file has no rows. Export a CSV from Poke Genie or Calcy IV and try again.', 400);
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (...tests) => head.findIndex((h) => tests.some((t) => (t instanceof RegExp ? t.test(h) : h === t)));
    const C = {
      name: col('name', 'pokemon', 'species', 'pokémon'), form: col('form'), nick: col('nickname'), cp: col('cp'),
      atk: col(/^(atk|attack)( iv)?$/, /atk iv/, /attack iv/), def: col(/^(def|defense|defence)( iv)?$/, /def iv/, /defen[cs]e iv/),
      hp: col(/^(sta|stamina|hp) iv$/, /sta iv/, /stamina iv/, /^sta$/), shadow: col('shadow/purified', 'shadow'), shiny: col('shiny'),
      fast: col('quick move', 'fast move', 'fast'), c1: col('charge move', 'charge move 1', 'special move', 'special move 1', 'charged move', 'charged move 1'), c2: col('charge move 2', 'special move 2', 'charged move 2'),
    };
    if (C.name < 0 || C.atk < 0 || C.def < 0 || C.hp < 0) throw err("Couldn't find the name and IV columns. FAINTR reads CSV exports with Name, Atk IV, Def IV and Sta IV (or HP IV) columns.", 400);
    const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const FORM = { alola: 'alolan', alolan: 'alolan', galar: 'galarian', galarian: 'galarian', hisui: 'hisuian', hisuian: 'hisuian', paldea: 'paldean', paldean: 'paldean' };
    const out = [], bad = [];
    for (const r of rows.slice(1)) {
      const get = (k) => (C[k] >= 0 ? String(r[C[k]] || '').trim() : '');
      let name = norm(get('name')), form = norm(get('form'));
      const sv = get('shadow').toLowerCase();
      const shadow = sv === '1' || sv === 'shadow' || /\bshadow\b/.test(name);
      name = name.replace(/\bshadow\b/, '').trim();
      form = FORM[form] || (form === 'normal' ? '' : form);
      const cands = full.filter((c) => c.shadow === shadow && norm(c.name.replace(/\(.*\)/, '')) === name);
      let hit = null;
      if (form) hit = cands.find((c) => norm(c.name).includes(form));
      if(form&&!hit){bad.push(`${get('name')}: form "${get('form')}" was not recognized`);continue;}
      if (!hit) hit = cands.find((c) => !/\(/.test(c.name.replace(/\(shadow\)/i, ''))) || cands[0];
      const ivs = { atk: parseInt(get('atk'), 10), def: parseInt(get('def'), 10), hp: parseInt(get('hp'), 10) };
      if (!hit || [ivs.atk, ivs.def, ivs.hp].some((v) => !(v >= 0 && v <= 15))) { bad.push(get('name') || '(blank)'); continue; }
      const mv = (list, label) => { const n = norm(label); if (!n) return null; const f = list.find(([, nm]) => norm(nm) === n); return f ? f[0] : null; };
      const fast = mv(hit.fast, get('fast')), c1 = mv(hit.charged, get('c1')), c2 = mv(hit.charged, get('c2'));
      if((get('fast')&&!fast)||(get('c1')&&!c1)||(get('c2')&&!c2)||((fast||c1||c2)&&(!fast||!c1))){bad.push(`${get('name')}: moves could not be read; check the fast and charged move columns`);continue;}
      out.push({ id: hit.id, name: hit.name, nickname: get('nick').slice(0, 24), ivs, cp: parseInt(get('cp'), 10) || null,
        shiny: /^(1|yes|true|shiny)$/i.test(get('shiny')), moveset: fast && c1 ? [fast, c1].concat(c2 ? [c2] : []) : [] });
    }
    return { entries: out, bad: bad.slice(0, 20), badCount: bad.length };
  }

  // ---------- PvP IVs
  async function ivCompare(st, body) {
    const m = resolveMember(st, body);
    const iv = await env.pool.run('ivInfo', m.id, m.ivs, m.levelCap, st.F);
    const r1 = iv.rank1;
    if (!r1 || (iv.ivs.atk === r1.atk && iv.ivs.def === r1.def && iv.ivs.hp === r1.hp)) return { rank1: true, flips: [], of: 0 };
    const [mine, best] = await Promise.all([getMember(st, m), getMember(st, { ...m, ivs: { atk: r1.atk, def: r1.def, hp: r1.hp } })]);
    const tIndex = threatIndex(st);
    const top = st.overallRaw.slice(0, 100).filter((r) => tIndex.has(r.speciesId));
    const flips = [];
    for (const r of top) {
      const t = tIndex.get(r.speciesId);
      for (let s = 0; s < 3; s++) {
        const a = 1000 - mine.row['r' + s][t], b = 1000 - best.row['r' + s][t];
        if ((a > 500) !== (b > 500)) flips.push({ name: st.catalogNames.get(r.speciesId) || r.speciesName, shields: s, mine: a, theirs: b, gained: a > 500 });
      }
    }
    return { rank1: false, flips, of: top.length, ivs: iv.ivs, best: r1 };
  }

  // ---------- formats
  function formatsView() {
    return env.formats.map((f) => {
      const p = fstates.get(f.key);
      return { key: f.key, title: f.title, short: f.short, featured: !!f.featured, cp: f.cp, kind: f.kind, league: f.league,
        built: env.isBuilt(f.key), building: !!(env.buildStatus(f.key) && env.buildStatus(f.key).running), nTeams: p && p._n ? p._n : null };
    });
  }

  // ---------- the API. q = query parameters (GET), body = JSON body (POST). Returns plain data or throws (e.code = HTTP status).
  let lastDeleted = null;
  async function handle(method, p, q, body) {
    q = q || {}; body = body || {};
    if (method === 'GET') {
      if (p === '/api/vip/upgrades') {
        const st = await builtState(q.f);
        const roster = (await env.storage.rosterAll()).filter(e=>rosterLeagues.usable(e,st.F.cp));
        const { ready, candidates } = upgradeCandidates(roster, st.matrix.statics, st.catalog, st.F.cp);
        const best = (ids, include) => query(st.D, { owned: ids, include: include ? [include] : [], limit: 1 }).teams[0] || null;
        const baseline = best(ready);
        const suggestions = candidates.map(c => {
          const team = best([...new Set([...ready, c.id])], c.id);
          return { ...c, team, improvement: baseline && team ? team.composite - baseline.composite : null };
        }).sort((a, b) => (b.improvement || 0) - (a.improvement || 0) || a.poolRank - b.poolRank);
        return { format: st.F.title, baseline, readyCount: ready.length, suggestions: suggestions.slice(0, 10) };
      }
      if (p === '/api/info') {
        const gl = env.info.web ? null : await fstate(DEFAULT_F);
        return { live: env.live(), pendingFormats:env.info.pendingFormats||[], app: env.info.app, version: env.info.version, source: env.info.source, web: !!env.info.web,
          pvpoke: gl && gl.D ? gl.D.info.pvpoke : env.info.installed, dataBuilt: env.info.dataBuilt || null,
          grades: Object.fromEntries(Object.entries(M.GRADES).map(([k, g]) => [k, { label: g.label, desc: g.desc, pvpoke: !!g.pvpoke }])),
          weights: M.DEFAULT_WEIGHTS, tiers: M.TIERS, formats: formatsView() };
      }
      if (p === '/api/format') {
        const st = await fstate(q.f);
        return { key: st.F.key, title: st.F.title, cp: st.F.cp, built: !!st.D, nTeams: st.D ? st.D.n : null, pvpoke: st.D ? st.D.info.pvpoke : null,
          pool: st.D ? st.matrix.statics.map((s) => ({ id: s.id, name: s.name, types: s.types })) : [], cuts: st.D ? tierCuts(st.D) : null, bulkGoal: st.D ? st.D.C.bulkGoal : null,
          catalog: st.catalog.map((c) => ({ id: c.id, name: c.name, dex:c.dex, types: c.types, rank: c.rank, fast: c.fast, charged: c.charged, extra:c.extra, rec: c.rec })),
          anti: st.D && st.D.anti ? { field: st.D.anti.field.length, verified: st.D.anti.verified.size, fieldTeams: fieldNames(st) } : null,
          build: env.buildStatus(st.F.key) || null };
      }
      if (p === '/api/catalog/all') return fullCatalog();
      if (p === '/api/team') {
        const st = await builtState(q.f);
        const i = parseInt(q.i, 10);
        if (!(i >= 0 && i < st.D.n)) throw err('That team number is out of range.', 400);
        return teamDetail(st, i);
      }
      if (p === '/api/meta') return metaView(await fstate(q.f));
      if (p === '/api/saved') {
        const list = await env.storage.savedAll();
        for (const t of list) {
          try {
            const st = await fstate(t.f || DEFAULT_F); t.f = st.F.key; t.title = st.F.title;
            const cur = t.history && t.history[0];
            if (st.D && cur) t.tier = M.tierOf(cur.composite, tierCuts(st.D));
          } catch (e) { t.title = t.f; }
        }
        return list;
      }
      if (p === '/api/roster') return rosterSummary(await env.storage.rosterAll());
    }
    if (method === 'POST') {
      if (p === '/api/query') {
        const st = await builtState(body.f), res = query(st.D, body);
        // The website's compact data doesn't store each team's top threats; work them out for the teams shown
        if (!st.D.threats && st.scorer && res && Array.isArray(res.teams)) {
          for (const t of res.teams) { const D = st.D, i = t.i; t.threats = st.scorer.scoreTeam([D.members[i * 3], D.members[i * 3 + 1], D.members[i * 3 + 2]]).threats.map((x) => st.matrix.threats[x].name); }
        }
        return res;
      }
      if (p === '/api/swap') return swapAdvice(await builtState(body.f), body.memberIdx, body.weights);
      if (p === '/api/report') {
        if (!Array.isArray(body.members) || body.members.length !== 3) throw err('Pick three Pokémon to grade.', 400);
        return report(await builtState(body.f), body.members, body.weights);
      }
      if (p === '/api/prefetch') {
        const st = await fstate(body.f);
        const m = resolveMember(st, body);
        getMember(st, m).catch(() => {});
        env.pool.run('ivInfo', m.id, m.ivs, m.levelCap, st.F).then((iv) => {
          const r1 = iv.rank1;
          if (r1 && !(iv.ivs.atk === r1.atk && iv.ivs.def === r1.def && iv.ivs.hp === r1.hp)) getMember(st, { ...m, ivs: { atk: r1.atk, def: r1.def, hp: r1.hp } }).catch(() => {});
        }).catch(() => {});
        if (m.ivs) getMember(st, { ...m, ivs: null, levelCap: 50 }).catch(() => {});
        return { ok: true };
      }
      if (p === '/api/iv') { const st = await fstate(body.f); const m = resolveMember(st, body); return env.pool.run('ivInfo', m.id, m.ivs, m.levelCap, st.F); }
      if (p === '/api/battle') {
        const st = await fstate(body.f);
        const a = resolveMember(st, body.a), b = resolveMember(st, body.b);
        const opts = { shieldsA: clampInt(body.shieldsA, 0, 2, 1), shieldsB: clampInt(body.shieldsB, 0, 2, 1), baitA: body.baitA !== false, baitB: body.baitB !== false,
          energyA: clampInt(body.energyA, 0, 100, 0), energyB: clampInt(body.energyB, 0, 100, 0) };
        return env.pool.run('battleDetail', a, b, opts, st.F);
      }
      if (p === '/api/battle/meta') return vsMeta(await fstate(body.f), body.a);
      if (p === '/api/counters') return counters(await fstate(body.f), Array.isArray(body.opponents) ? body.opponents : [], body.source === 'roster' ? 'roster' : 'pool');
      if (p === '/api/saved') {
        const t = body.team;
        if (!t || !Array.isArray(t.members) || t.members.length !== 3) throw err('A saved team needs three Pokémon.', 400);
        const st = await builtState(t.f || body.f);
        const g = await quickGrade(st, t.members);
        const existing = (await env.storage.savedAll()).find((x) => x.id === t.id);
        const saved = {
          id: t.id || `t${Date.now().toString(36)}`, name: String(t.name || 'My team').slice(0, 60), f: st.F.key, members: t.members.map((m) => resolveMember(st, m)),
          created: existing ? existing.created : new Date().toISOString(),
          history: existing && existing.history ? existing.history : [historyEntry(st, g)],
        };
        await env.storage.savedUpsert(saved);
        return saved;
      }
      if (p === '/api/saved/delete') { await env.storage.savedRemove(body.id); return { ok: true }; }
      if (p === '/api/roster') return saveRosterEntry(body);
      if (p === '/api/roster/delete') { lastDeleted = await env.storage.rosterRemove(body.uid); return { ok: true, name: lastDeleted && (lastDeleted.nickname || lastDeleted.name) }; }
      if (p === '/api/roster/undo') {
        if (!lastDeleted) throw err('Nothing to undo.', 400);
        await env.storage.rosterUpsert(lastDeleted); const e = lastDeleted; lastDeleted = null; return { ok: true, uid: e.uid };
      }
      if (p === '/api/roster/csv') return rosterFromCSV(body.text);
      if (p === '/api/roster/parse') return parseRosterLines(body.text);
      if (p === '/api/roster/import') {
        if(!Array.isArray(body.roster))throw err('That file must contain a Roster array. Nothing was imported.',400);
        const list = body.roster;
        const errors = [], entries = [], rejected=[];
        const existing=await env.storage.rosterAll(),known=new Set(existing.map(e=>e.uid));
        const room = Math.max(0, ROSTER_MAX - existing.length);
        let confirmed=0;
        const count=Math.min(1000,list.length);
        for (const [index,e] of list.slice(0,count).entries()) {
          try {
            // A retry after an uncertain network response must not add another copy.
            // Keys belong to one import preview; normal exported Pokémon get new keys.
            const key=/^[a-z0-9-]{16,80}$/i.test(e?._importKey||'')?'import-'+e._importKey:null;
            if(key&&known.has(key)){confirmed++;continue;}
            if(entries.length>=room)throw Error('Your Roster is full. This entry is still pending.');
            const entry=await makeRosterEntry({ ...e, uid: undefined }, null);
            if(key){entry.uid=key;known.add(key);}
            entries.push(entry);
          } catch (e2) { errors.push(`${e?.name || e?.id || 'Entry'}: ${e2.message}`);rejected.push(index); }
        }
        if(list.length>count){for(let index=count;index<list.length;index++)rejected.push(index);errors.push('Only 1,000 entries can be imported in one batch. The remaining entries are still pending.');}
        if (entries.length) await (env.storage.rosterInsertMany?env.storage.rosterInsertMany(entries):rosterPutMany(entries));
        return { added: entries.length+confirmed, errors: errors.slice(0, 10), rejected };
      }
      if (p === '/api/ivtable') {
        const cp = [500, 1500, 2500, 10000].includes(+body.cp) ? +body.cp : 1500;
        const floor = IV_FLOORS.includes(+body.floor) ? +body.floor : 0;
        const cap = [40, 41, 50, 51].includes(+body.levelCap) ? +body.levelCap : 50;
        if (!fullCatalog().some((c) => c.id === body.id)) throw err('Pick a Pokémon from the list.', 400);
        return env.pool.run('ivTable', body.id, cp, cap, floor);
      }
      if (p === '/api/family') {
        const cp = [500, 1500, 2500, 10000].includes(+body.cp) ? +body.cp : 1500;
        const cap = [40, 41, 50, 51].includes(+body.levelCap) ? +body.levelCap : 50;
        return env.pool.run('familyRanks', String(body.id), normIVs(body.ivs || { atk: 0, def: 15, hp: 15 }), cp, cap);
      }
      if (p === '/api/ivcompare') return ivCompare(await fstate(body.f), body);
    }
    return undefined; // not handled here: the host decides (status, updates, files)
  }

  return { handle, fstate, builtState, forget, attachTeams, regradeSaved, refreshRosterEvals, makeRosterEntry, fullCatalog, formatsView, formatDef, DEFAULT_F };
}

module.exports = { createCore, normIVs, memberKey, DEFAULT_F };
