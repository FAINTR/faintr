// Keeps FAINTR on the latest PvPoke data: version check, download, rebuild, meta-change report,
// and an optional Windows scheduled task that updates daily even when the app is closed.
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');
const { Worker } = require('worker_threads');
const { ENGINE_FILES } = require('./engine');
const { listFormats, dataFilesFor, rankingFile } = require('./formats');
const store = require('./store');
const { verifyPvpokeLicense } = require('./pvpoke-license');

const UA = 'FAINTR';
const TASK_NAME = 'FAINTR daily update';
const LEGACY_TASK = 'Triad Team Finder daily update';

function get(url, asJSON) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA, Accept: asJSON ? 'application/vnd.github+json' : '*/*' }, timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return get(res.headers.location, asJSON).then(resolve, reject);
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode !== 200) return reject(new Error(`${url} returned ${res.statusCode}`));
        if (!asJSON) return resolve(buf);
        try { resolve(JSON.parse(buf.toString('utf8'))); } catch (e) { reject(new Error('GitHub response was not JSON')); }
      });
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timed out')); });
  });
}

// Latest PvPoke commit, or null when GitHub can't be reached
async function latestCommit() {
  try {
    const c = await get('https://api.github.com/repos/pvpoke/pvpoke/commits/master', true);
    const date = c && c.commit && c.commit.committer && c.commit.committer.date;
    if (c && /^[0-9a-f]{40}$/.test(c.sha || '') && date) return { sha: c.sha, version: c.sha.slice(0, 7) + '_' + date.slice(0, 10) };
  } catch (e) { /* offline or rate limited */ }
  return null;
}

function isNewer(remote, installedVersion) {
  if (!remote) return false;
  if (!installedVersion) return true;
  return !installedVersion.startsWith(remote.sha.slice(0, 7));
}

// Rank movement between two overall ranking files (for the Meta tab)
function metaChanges(oldList, newList, fromVersion, toVersion) {
  const clean = (l) => l.filter((r) => r.speciesId.indexOf('_xs') === -1);
  const o = clean(oldList), n = clean(newList);
  const oldRank = new Map(o.map((r, i) => [r.speciesId, { rank: i + 1, moveset: r.moveset.join(','), score: r.score }]));
  const per = {};
  const moves = [];
  n.forEach((r, i) => {
    const prev = oldRank.get(r.speciesId);
    per[r.speciesId] = prev ? prev.rank - (i + 1) : null; // + = moved up
    if (prev && prev.moveset !== r.moveset.join(',') && i < 150) moves.push({ id: r.speciesId, name: r.speciesName, from: prev.moveset.split(','), to: r.moveset });
  });
  const top = n.slice(0, 150).map((r, i) => ({ id: r.speciesId, name: r.speciesName, rank: i + 1, delta: per[r.speciesId] }));
  return {
    from: fromVersion, to: toVersion, at: new Date().toISOString(), per,
    risers: top.filter((t) => t.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 12),
    fallers: top.filter((t) => t.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 12),
    newcomers: top.filter((t) => t.delta === null).slice(0, 12),
    movesets: moves.slice(0, 20),
  };
}

// Build one format with a worker thread (keeps the server responsive)
function buildFormatWorker(srcDir, outDir, fmt, version, set, label) {
  return new Promise((resolve, reject) => {
    const w = new Worker(path.join(__dirname, 'update_worker.js'), { workerData: { srcDir, outDir, version, fmt } });
    w.on('message', (m) => {
      const STAGE = { start: 'starting', matrix: 'simulating matchups', score: 'scoring every team', meta: 'playing every team against the meta', verify: "re-playing the top Anti-Meta teams on PvPoke's engine", done: 'finishing' };
      if (m.progress) set({ ...m.progress, message: `${label}: ${STAGE[m.progress.stage] || 'working'}` });
      if (m.done) resolve(); if (m.error) reject(new Error(m.error));
    });
    w.on('error', reject);
  });
}

// Download + rebuild into USER_DIR. builtKeys: formats that already have data (leagues plus cups the user opened).
async function runUpdate(status, currentSrcDir, opts = {}) {
  const set = (p) => Object.assign(status, p);
  set({ running: true, stage: 'check', i: 0, n: 1, message: 'Checking PvPoke on GitHub' });
  const remote = await latestCommit();
  const s = store.settings.get();
  if (!opts.force && remote && !isNewer(remote, s.installed)) {
    store.settings.set({ lastCheck: Date.now() });
    set({ running: false, stage: 'current', message: 'Already on the latest PvPoke data.' });
    return null;
  }
  const sha = remote ? remote.sha : 'master';
  const license = verifyPvpokeLicense(await get(`https://raw.githubusercontent.com/pvpoke/pvpoke/${sha}/LICENSE`));
  const version = remote ? remote.version : 'latest_' + new Date().toISOString().slice(0, 10);
  const tmpSrc = store.USER_SRC + '.new', tmpData = store.USER_DATA + '.new';
  fs.rmSync(tmpSrc, { recursive: true, force: true }); fs.rmSync(tmpData, { recursive: true, force: true });
  const fetchTo = async (f) => {
    const buf = await get(`https://raw.githubusercontent.com/pvpoke/pvpoke/${sha}/src/${f}`);
    const dest = path.join(tmpSrc, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
  };
  set({ stage: 'download', i: 0, n: 1, message: 'Downloading the game master' });
  await fetchTo('data/gamemaster.json');
  fs.writeFileSync(path.join(tmpSrc, 'LICENSE-pvpoke.txt'), license);
  const gmData = JSON.parse(fs.readFileSync(path.join(tmpSrc, 'data/gamemaster.json'), 'utf8'));
  const allFormats = listFormats(gmData); // cups PvPoke lists right now
  const files = [...ENGINE_FILES, ...dataFilesFor(allFormats).filter((f) => f !== 'data/gamemaster.json')];
  set({ i: 1, n: files.length + 1 });
  for (const f of files) {
    set({ message: `Downloading ${path.basename(f)}` });
    try { await fetchTo(f); } catch (e) { if (!/rankings|groups/.test(f)) throw e; } // a cup without rankings yet is skipped
    status.i++;
  }
  const formats = listFormats(gmData, tmpSrc);
  // Nothing new (same files as the data in use): skip the rebuild unless forced
  const same = ['data/gamemaster.json', ...files].every((f) => {
    try { return fs.readFileSync(path.join(tmpSrc, f)).equals(fs.readFileSync(path.join(currentSrcDir, f))); } catch (e) { return !fs.existsSync(path.join(tmpSrc, f)); }
  });
  if (same && !opts.force) {
    fs.rmSync(tmpSrc, { recursive: true, force: true });
    store.settings.set({ lastCheck: Date.now() });
    set({ running: false, stage: 'current', i: 1, n: 1, message: 'Already on the latest PvPoke data. Nothing to rebuild.' });
    return null;
  }
  // Leagues, featured cups that ship built, and any cup set up on this computer
  const want = new Set(['all-1500', 'all-2500', 'all-10000', ...formats.filter((f) => f.featured).map((f) => f.key), ...(opts.builtKeys || [])]);
  const toBuild = formats.filter((f) => want.has(f.key));
  for (let k = 0; k < toBuild.length; k++) {
    const F = toBuild[k];
    await buildFormatWorker(tmpSrc, path.join(tmpData, F.key), F, version, set, `${F.title} (${k + 1} of ${toBuild.length})`);
    // Meta-change report against the data in use before this update
    try {
      const rel = rankingFile(F.filesCup || F.cup, 'overall', F.cp);
      const oldList = JSON.parse(fs.readFileSync(path.join(currentSrcDir, rel), 'utf8'));
      const newList = JSON.parse(fs.readFileSync(path.join(tmpSrc, rel), 'utf8'));
      store.writeJSON(path.join(tmpData, F.key, 'meta-changes.json'), metaChanges(oldList, newList, s.installed, version));
    } catch (e) { /* new cup: nothing to compare */ }
  }
  fs.rmSync(store.USER_SRC, { recursive: true, force: true }); fs.rmSync(store.USER_DATA, { recursive: true, force: true });
  fs.renameSync(tmpSrc, store.USER_SRC); fs.renameSync(tmpData, store.USER_DATA);
  store.settings.set({ installed: version, lastCheck: Date.now(), lastUpdate: Date.now() });
  store.log(`updated to ${version} (${toBuild.map((f) => f.key).join(', ')})`);
  set({ running: false, stage: 'done', i: 1, n: 1, message: `Updated to PvPoke data from ${version.split('_')[1] || version}.` });
  return version;
}

// ---------- Windows Task Scheduler (daily update while the app is closed)
function schtasks(args) {
  return new Promise((resolve) => execFile('schtasks', args, { windowsHide: true }, (err, stdout, stderr) => resolve({ ok: !err, out: String(stdout || stderr || '') })));
}
async function scheduleStatus() {
  if (process.platform !== 'win32') return { supported: false, enabled: false };
  const r = await schtasks(['/Query', '/TN', TASK_NAME]);
  return { supported: true, enabled: r.ok };
}
async function setSchedule(enabled, time) {
  if (process.platform !== 'win32') return { supported: false, enabled: false, error: 'Daily background updates use Windows Task Scheduler.' };
  if (!enabled) { await schtasks(['/Delete', '/TN', TASK_NAME, '/F']); return scheduleStatus(); }
  const exe = process.execPath; // the packaged FAINTR.exe
  const r = await schtasks(['/Create', '/SC', 'DAILY', '/TN', TASK_NAME, '/TR', `"${exe}" --update`, '/ST', time || '06:00', '/F']);
  const st = await scheduleStatus();
  if (!r.ok) st.error = r.out.trim() || 'Windows refused to create the task.';
  return st;
}

// Replace a scheduled task left by the pre-rebrand build with the FAINTR one
async function migrateLegacyTask() {
  if (process.platform !== 'win32') return;
  const r = await schtasks(['/Query', '/TN', LEGACY_TASK]);
  if (!r.ok) return;
  await schtasks(['/Delete', '/TN', LEGACY_TASK, '/F']);
  await setSchedule(true, '06:00');
}

module.exports = { buildFormatWorker, migrateLegacyTask, runUpdate, latestCommit, isNewer, metaChanges, scheduleStatus, setSchedule, TASK_NAME };
