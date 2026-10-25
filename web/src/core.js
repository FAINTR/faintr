// The website's "server": runs FAINTR's app logic (appcore.js) in a Web Worker on the visitor's own device.
// Static data comes from the site (hashed files listed in manifest.json); heavy engine jobs go to a pool of
// engine workers; saved Roster entries and teams live in the main thread (browser storage or Supabase).
const { createCore } = require('../../appcore');
const { periodAt } = require('../../formats');
const codec = require('../../teamcodec');
const host = require('./enginehost');

let core = null, MANIFEST = null;
const pending = new Map();
let rpcId = 0;

// ---------- calls back to the main thread (storage)
function toMain(op, args) {
  return new Promise((resolve, reject) => {
    const id = ++rpcId;
    pending.set(id, { resolve, reject });
    self.postMessage({ type: 'storage', id, op, args });
  });
}
const storage = {
  rosterAll: () => toMain('rosterAll', []),
  rosterUpsert: (e,expected) => toMain('rosterUpsert', [e,expected]),
  rosterRemove: (uid) => toMain('rosterRemove', [uid]),
  savedAll: () => toMain('savedAll', []),
  savedUpsert: (t) => toMain('savedUpsert', [t]),
  savedRemove: (id) => toMain('savedRemove', [id]),
  rosterUpsertMany: (list) => toMain('rosterUpsertMany', [list]),
  rosterInsertMany: (list) => toMain('rosterInsertMany', [list]),
  savedUpsertMany: (list) => toMain('savedUpsertMany', [list]),
  rosterRefreshMany: (list) => toMain('rosterRefreshMany', [list]),
  savedRefreshMany: (list) => toMain('savedRefreshMany', [list]),
};

// ---------- engine worker pool (falls back to running jobs here if nested workers aren't available)
const { Pool } = require('./engine-pool');

// ---------- data files
function progress(label, loaded, total) { self.postMessage({ type: 'progress', label, loaded, total }); }
async function fetchBytes(rel, label) {
  const hashed = MANIFEST.files[rel];
  if (!hashed) throw new Error(`Missing data file ${rel}`);
  const res = await fetch('/' + hashed);
  if (!res.ok) { const e = new Error(`Couldn't load ${rel} (${res.status}).`); e.stale = res.status === 404; throw e; }
  const total = (MANIFEST.sizes && MANIFEST.sizes[rel]) || +res.headers.get('content-length') || 0;
  if (!res.body || !res.body.getReader) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader(), chunks = [];
  let got = 0, last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    if (label && Date.now() - last > 150) { last = Date.now(); progress(label, got, total); }
  }
  if (label) progress(label, got, total);
  const out = new Uint8Array(got); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
const json = async (rel) => JSON.parse(new TextDecoder().decode(await fetchBytes(rel)));
function unpackMatrix(mx) {
  if (mx.metaField && mx.meta) mx.meta.metaField = mx.metaField;
  if (mx.traitDict) mx.rows = mx.rows.map((r) => ({ id: r.id, moveset: r.moveset, r0: r.r0, r1: r.r1, r2: r.r2, ra: r.ra, traits: r.t.map((i) => mx.traitDict[i]) }));
  return mx;
}
const fmtEntry = (key) => (MANIFEST.formats || []).find((f) => f.key === key);
async function loadFormatData(F) {
  const entry = fmtEntry(F.key);
  if (!entry || !entry.built) return null;
  const base = `formats/${F.key}/`;
  const label = `Loading ${F.title} teams`;
  const [info, matrixRaw, anti, changes, bin] = await Promise.all([
    json(base + 'teams.json'), json(base + 'matrix.json'),
    (MANIFEST.premium ? toMain('premiumAnti', [F.key]) : json(base + 'antimeta.json')).catch(() => null), MANIFEST.files[base + 'meta-changes.json'] ? json(base + 'meta-changes.json').catch(() => null) : null,
    fetchBytes(base + 'teams.bin.gz', label).then((b) => (b[0] === 0x1f && b[1] === 0x8b ? gunzip(b) : b)),
  ]);
  const matrix = unpackMatrix(matrixRaw);
  const dec = codec.decode(info, bin, matrix.meta.metaTypes);
  const D = { info, ...dec, threats: null, C: { bulkGoal: info.bulkGoal || 22000, calib: info.calib || {} }, mwi: info.fields.indexOf('metaWin'), _cuts: new Map(),
    anti: anti ? { field: anti.field, fieldTeams: anti.fieldTeams, fieldSet: new Set(anti.fieldTeams), verified: new Map(anti.verified.map((v) => [v.i, v])) } : null };
  return { D, matrix, changes };
}

// ---------- boot
function init(manifest) {
  MANIFEST = manifest;
  host.boot(manifest);
  const n = Math.max(1, Math.min(4, ((self.navigator && navigator.hardwareConcurrency) || 2) - 1));
  const pool = new Pool(n, { lazy:true,WorkerClass: typeof Worker === 'undefined' ? null : Worker, url: '/' + MANIFEST.files['engine-worker.js'], manifest, runInline: (fn,...args)=>self[fn](...args) });
  const formats = manifest.formats.map((f) => ({ ...f }));
  core = createCore({
    ev: (code) => (0, eval)(code),
    pool, formats, storage, loadFormatData,
    live: () => periodAt(manifest.schedule || { periods: [] }, formats),
    info: { app: 'FAINTR', version: manifest.appVersion, source: 'web', web: true, installed: manifest.pvpoke, dataBuilt: manifest.built, pendingFormats:manifest.pendingFormats||[] },
    isBuilt: (key) => !!(fmtEntry(key) && fmtEntry(key).built),
    buildStatus: () => null,
    inlineImages: true,
  });
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'storage-reply') {
    const p = pending.get(m.id); pending.delete(m.id);
    if (p) { if (m.error) p.reject(new Error(m.error)); else p.resolve(m.result); }
    return;
  }
  if (m.type === 'init') {
    try { init(m.manifest); self.postMessage({ type: 'ready' }); } catch (err) { self.postMessage({ type: 'fatal', error: err.message }); }
    return;
  }
  if (m.type === 'api') {
    try {
      let result;
      if (m.path === '/core/membership') { core.forget(); result = { ok: true }; }
      else if (m.path === '/core/regrade') result = await core.regradeSaved();
      else if (m.path === '/core/refresh-roster') result = await core.refreshRosterEvals();
      else result = await core.handle(m.method, m.path, m.q, m.body);
      if (result === undefined) self.postMessage({ id: m.id, error: 'Not available on the website.', code: 404 });
      else self.postMessage({ id: m.id, result });
    } catch (err) {
      self.postMessage({ id: m.id, error: err.message || String(err), code: err.code || 500, stale: !!err.stale });
    }
  }
};
