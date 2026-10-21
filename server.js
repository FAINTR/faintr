// FAINTR desktop app: serves the UI on 127.0.0.1 and runs PvPoke's engine in-process.
// The app logic lives in appcore.js (shared with the website); this file adds files, storage, updates and cup builds.
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFile } = require('child_process');
const { loadTeams } = require('./teamdata');
const { makeCtx, unpackMatrix, SCHEMA } = require('./build');
const { EnginePool } = require('./pool');
const { createCore, DEFAULT_F } = require('./appcore');
const { listFormats, loadSchedule, periodAt } = require('./formats');
const store = require('./store');
const updater = require('./updater');

const APP = 'FAINTR';
const VERSION = require('./package.json').version;
const BUNDLED_SRC = path.join(__dirname, 'assets', 'pvpoke-src');
const BUNDLED_DATA = path.join(__dirname, 'assets', 'data');
const SCHEDULE_FILE = path.join(__dirname, 'schedule.json');

let G = null;                       // { srcDir, source, ctx, formats, pool, core, loadedAt }
const update = { running: false, stage: 'idle', i: 0, n: 0, message: '' };
const builds = {};                  // first-time cup builds in progress: key -> status
const liveNow = () => periodAt(loadSchedule(SCHEDULE_FILE), G.formats);

// ---------- data locations
function srcInfo() {
  if (fs.existsSync(path.join(store.USER_SRC, 'data', 'gamemaster.json'))) return { srcDir: store.USER_SRC, source: 'updated' };
  return { srcDir: BUNDLED_SRC, source: 'bundled' };
}
// Team data built by an older FAINTR is ignored and rebuilt
function schemaOk(dir) {
  try { return fs.existsSync(path.join(dir, 'teams.bin')) && JSON.parse(fs.readFileSync(path.join(dir, 'teams.json'), 'utf8')).schema >= SCHEMA; } catch (e) { return false; }
}
function dataDirFor(key) {
  const u = path.join(store.USER_DATA, key);
  if (schemaOk(u)) return u;
  const b = path.join(BUNDLED_DATA, key);
  if (schemaOk(b)) return b;
  return null;
}
function readFormatData(dir) {
  const D = loadTeams(dir);
  const matrix = unpackMatrix(JSON.parse(fs.readFileSync(path.join(dir, 'matrix.json'), 'utf8')));
  let changes = null;
  try { changes = JSON.parse(fs.readFileSync(path.join(dir, 'meta-changes.json'), 'utf8')); } catch (e) { /* none yet */ }
  return { D, matrix, changes };
}

// Saved data on this computer, in the async shape appcore expects
const storage = {
  rosterAll: async () => store.roster.all(),
  rosterUpsert: async (e) => store.roster.upsert(e),
  rosterRemove: async (uid) => store.roster.remove(uid),
  savedAll: async () => store.saved.all(),
  savedUpsert: async (t) => store.saved.upsert(t),
  savedRemove: async (id) => store.saved.remove(id),
  rosterUpsertMany: async (list) => { for (const e of list) store.roster.upsert(e); },
  savedUpsertMany: async (list) => { for (const t of list) store.saved.upsert(t); },
};

async function loadGlobal() {
  const t0 = Date.now();
  const { srcDir, source } = srcInfo();
  const ctx = makeCtx(srcDir);
  const gmData = JSON.parse(fs.readFileSync(path.join(srcDir, 'data', 'gamemaster.json'), 'utf8'));
  const formats = listFormats(gmData, srcDir);
  const oldPool = G && G.pool;
  const pool = new EnginePool(srcDir);
  const core = createCore({
    ev: (code) => vm.runInContext(code, ctx),
    pool, formats, storage,
    loadFormatData: async (F) => { const dir = dataDirFor(F.key); return dir ? readFormatData(dir) : null; },
    live: () => periodAt(loadSchedule(SCHEDULE_FILE), formats),
    info: { app: APP, version: VERSION, source, get installed() { return store.settings.get().installed; } },
    isBuilt: (key) => !!dataDirFor(key),
    buildStatus: (key) => builds[key] || null,
    log: store.log,
  });
  G = { srcDir, source, ctx, formats, pool, core, loadedAt: Date.now() };
  if (oldPool) oldPool.close();
  const gl = await core.fstate(DEFAULT_F);
  const s = store.settings.get();
  if (!s.installed && source === 'bundled' && gl.D) store.settings.set({ installed: gl.D.info.pvpoke });
  console.log(`Loaded ${formats.length} formats (${source} data) in ${Date.now() - t0} ms`);
  core.refreshRosterEvals().catch((e) => store.log('roster refresh failed: ' + e.message));
}
const regradeSaved = () => G.core.regradeSaved();

// ---------- first-time cup builds
async function buildFormat(key) {
  const F = G.core.formatDef(key);
  if (builds[key] && builds[key].running) return builds[key];
  if (update.running) throw new Error('A data update is running. Try again when it finishes.');
  const status = builds[key] = { running: true, stage: 'matrix', i: 0, n: 1, message: `Setting up ${F.title}` };
  const out = path.join(store.USER_DATA, key), tmp = out + '.new';
  const version = store.settings.get().installed || 'unknown';
  (async () => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
      await updater.buildFormatWorker(G.srcDir, tmp, F, version, (p) => Object.assign(status, p), F.title);
      fs.rmSync(out, { recursive: true, force: true });
      fs.renameSync(tmp, out);
      G.core.forget(key);
      await G.core.fstate(key);
      Object.assign(status, { running: false, stage: 'done', message: `${F.title} is ready.` });
    } catch (e) {
      Object.assign(status, { running: false, stage: 'error', message: `Couldn't set up ${F.title}: ${e.message}` });
    }
  })();
  return status;
}
// Formats live in GO Battle League this week and next
function liveKeys() {
  const L = liveNow();
  return [...(L.now ? L.now.formats : []), ...(L.next ? L.next.formats : [])].map((f) => f.key);
}
// Get this week's and next week's formats ready in the background, one at a time, when nothing else is running
async function prebuildLive() {
  if (update.running || Object.values(builds).some((b) => b.running)) return;
  const key = liveKeys().find((k) => !dataDirFor(k) && !(builds[k] && builds[k].stage === 'error'));
  if (!key) return;
  store.log(`preparing ${key} because it is live in GO Battle League`);
  try { const b = await buildFormat(key); b.auto = true; } catch (e) { /* try again later */ }
}
function builtCupKeys() {
  try { return fs.readdirSync(store.USER_DATA).filter((k) => !k.endsWith('.new') && fs.existsSync(path.join(store.USER_DATA, k, 'teams.bin'))); } catch (e) { return []; }
}

// ---------- update orchestration
async function doUpdate(force) {
  if (update.running || Object.values(builds).some((b) => b.running)) return;
  try {
    const v = await updater.runUpdate(update, G.srcDir, { force, builtKeys: [...new Set([...builtCupKeys(), ...liveKeys()])] });
    if (v) { await loadGlobal(); await regradeSaved(); }
  } catch (e) {
    const net = /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket|network|timed out/i.test(e.message);
    Object.assign(update, { running: false, stage: 'error', message: net ? "Couldn't reach GitHub. Check your internet connection and try again. Your current data is unchanged." : `Update failed: ${e.message}. Your current data is unchanged.` });
    store.log('update failed: ' + e.message);
  }
}
async function autoCheck() {
  const s = store.settings.get();
  if (!s.autoUpdate || update.running) return;
  if (Date.now() - (s.lastCheck || 0) < 6 * 3600 * 1000) return;
  store.settings.set({ lastCheck: Date.now() });
  const remote = await updater.latestCommit();
  if (updater.isNewer(remote, store.settings.get().installed)) doUpdate(false);
}
// Picks up data written by the scheduled background update
function watchData() {
  if (update.running) return;
  const s = store.settings.get();
  if ((s.lastUpdate || 0) > G.loadedAt + 1000) loadGlobal().then(regradeSaved).catch((e) => console.error(e));
}

// ---------- http
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (d) => { s += d; if (s.length > 3e6) reject(new Error('Request too large.')); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(new Error('Request was not valid JSON.')); } });
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8', '.png': 'image/png' };
function sendFile(res, f, cache) {
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': cache ? 'max-age=86400' : 'no-store' });
  res.end(fs.readFileSync(f));
}

// Desktop-only endpoints: files, status, updates, cup builds, settings
async function hostHandle(req, res, p, url, body) {
  if (req.method === 'GET') {
    if (p === '/' || p === '/index.html') return sendFile(res, path.join(__dirname, 'ui', 'index.html')), true;
    if (p === '/metrics.js') return sendFile(res, path.join(__dirname, 'metrics.js')), true;
    if (p === '/changelog.md') return sendFile(res, path.join(__dirname, 'CHANGELOG.md')), true;
    if (p.startsWith('/static/')) {
      const root = path.join(__dirname, 'ui');
      const f = path.join(root, path.normalize(p.slice(8)));
      if (!f.startsWith(root + path.sep) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return true; }
      sendFile(res, f, p.includes('/fonts/'));
      return true;
    }
    if (p === '/api/roster/export') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="faintr-roster.json"' });
      res.end(JSON.stringify({ app: APP, version: VERSION, exported: new Date().toISOString(), roster: store.roster.all().map(({ image, ...e }) => e) }, null, 1));
      return true;
    }
    if (p === '/api/status') return json(res, 200, { update, builds, settings: store.settings.get(), schedule: await updater.scheduleStatus(), platform: process.platform, formats: G.core.formatsView() }), true;
  }
  if (req.method === 'POST') {
    if (p === '/api/format/build') return json(res, 200, await buildFormat(body.f)), true;
    if (p === '/api/update') { doUpdate(!!body.force); return json(res, 200, update), true; }
    if (p === '/api/settings') return json(res, 200, store.settings.set({ autoUpdate: !!body.autoUpdate })), true;
    if (p === '/api/schedule') return json(res, 200, await updater.setSchedule(!!body.enabled, /^\d{2}:\d{2}$/.test(body.time || '') ? body.time : '06:00')), true;
  }
  return false;
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    const body = req.method === 'POST' ? await readBody(req) : {};
    if (await hostHandle(req, res, p, url, body)) return;
    const out = await G.core.handle(req.method, p, Object.fromEntries(url.searchParams), body);
    if (out === undefined) { res.writeHead(404); return res.end('Not found'); }
    json(res, 200, out);
  } catch (e) {
    const code = [400, 404, 409, 422].includes(e.code) ? e.code : 500;
    if (code === 500) console.error(e);
    json(res, code, { error: e.message, needsBuild: code === 409 });
  }
}

function openBrowser(u) {
  if (process.env.NO_BROWSER) return;
  if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', u], () => {});
  else if (process.platform === 'darwin') execFile('open', [u], () => {});
  else execFile('xdg-open', [u], () => {});
}

async function headlessUpdate() {
  // Run by the Windows scheduled task: update data, re-grade saved teams, exit.
  console.log(`${APP} background update`);
  const { srcDir } = srcInfo();
  try {
    const v = await updater.runUpdate(update, srcDir, { builtKeys: builtCupKeys() });
    console.log(update.message);
    if (v) { await loadGlobal(); await regradeSaved(); await G.pool.close(); }
  } catch (e) { store.log('scheduled update failed: ' + e.message); console.error(e.message); process.exitCode = 1; }
  process.exit();
}

async function start() {
  process.title = APP;
  if (process.argv.includes('--update')) return headlessUpdate();
  console.log(`${APP} ${VERSION}. Win the matchup.\nLoading data...`);
  await loadGlobal();
  const server = http.createServer(handle);
  let port = parseInt(process.env.PORT || '5150', 10);
  const maxPort = port + 20;
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE' && port < maxPort) { port++; server.listen(port, '127.0.0.1'); } else { console.error(e); process.exit(1); }
  });
  server.on('listening', () => {
    const u = `http://127.0.0.1:${port}/`;
    console.log(`\nRunning at ${u}\nYour browser should open on its own. Keep this window open while you use FAINTR; close it to quit.`);
    openBrowser(u);
  });
  server.listen(port, '127.0.0.1');
  updater.migrateLegacyTask().catch(() => {});
  setTimeout(() => autoCheck().catch(() => {}), 5000);
  setInterval(() => autoCheck().catch(() => {}), 30 * 60 * 1000);
  setInterval(watchData, 60 * 1000);
  setTimeout(() => prebuildLive().catch(() => {}), 90 * 1000);
  setInterval(() => prebuildLive().catch(() => {}), 10 * 60 * 1000);
}

start();
