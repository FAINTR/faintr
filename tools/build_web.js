#!/usr/bin/env node
// Builds the FAINTR website into a folder of static files (default: site/), ready for Cloudflare Pages.
//
//   node tools/build_web.js                 use the bundled PvPoke copy and team data in assets/
//   node tools/build_web.js --fetch         download the latest PvPoke from GitHub first (what the nightly job does)
//
// Options:
//   --out DIR        where the site goes (site)
//   --cache DIR      PvPoke copy + built team data kept between runs (.webcache)
//   --src DIR        PvPoke src folder to use instead of downloading (assets/pvpoke-src)
//   --seed DIR       already-built team data to reuse when its PvPoke files match (assets/data)
//   --formats a,b    only (re)build these formats; others are reused if they have data
//   --force          rebuild the chosen formats even if nothing changed
//   --only-built     don't build anything new; publish what already has data
//
// Each format is rebuilt only when its PvPoke inputs (game master, its rankings and its meta group) or
// FAINTR's scoring code change. Unchanged formats are reused from the cache, so a quiet night takes a minute.
// Environment (all optional): FAINTR_DISCORD_URL, FAINTR_PATREON_URL, SUPABASE_URL, SUPABASE_ANON_KEY.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const rq = (m) => require(path.join(ROOT, m));
const { listFormats, dataFilesFor, rankingFile, loadSchedule, periodAt } = rq('formats');
const { ENGINE_FILES } = rq('engine');
const { verifyPvpokeLicense } = rq('pvpoke-license');
const { buildAll, SCHEMA } = rq('build');
const { loadTeams } = rq('teamdata');
const { latestCommit, metaChanges } = rq('updater');
const codec = rq('teamcodec');
const PKG = rq('package.json');

// ---------- options
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i < 0 ? def : argv[i + 1]; };
const flag = (name) => argv.includes('--' + name);
const OUT = path.resolve(opt('out', path.join(ROOT, 'site')));
const CACHE = path.resolve(opt('cache', path.join(ROOT, '.webcache')));
const SEED = path.resolve(opt('seed', path.join(ROOT, 'assets/data')));
const ONLY = (opt('formats', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const FORCE = flag('force'), ONLY_BUILT = flag('only-built'), FETCH = flag('fetch');
// All website tools are free; a stale repository variable must not re-enable billing.
const PREMIUM = false;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { return d; } };
const writeJ = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v)); };

function get(url) {
  return fetch(url, { headers: { 'User-Agent': 'FAINTR-site-builder' } }).then(async (r) => {
    if (!r.ok) throw new Error(`${url} returned ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  });
}

// ---------- 1. PvPoke source
// Latest PvPoke commit: GitHub's API (with the workflow's token, so shared runners don't hit the anonymous rate limit),
// falling back to git itself
async function latestPvPoke() {
  try {
    const headers = { 'User-Agent': 'FAINTR-site-builder', Accept: 'application/vnd.github+json' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const r = await fetch('https://api.github.com/repos/pvpoke/pvpoke/commits/master', { headers });
    if (r.ok) { const c = await r.json(); const date = c.commit && c.commit.committer && c.commit.committer.date; if (/^[0-9a-f]{40}$/.test(c.sha || '') && date) return { sha: c.sha, version: c.sha.slice(0, 7) + '_' + date.slice(0, 10) }; }
  } catch (e) { /* try git */ }
  try {
    const out = require('child_process').execFileSync('git', ['ls-remote', 'https://github.com/pvpoke/pvpoke', 'refs/heads/master'], { timeout: 60000 }).toString();
    const sha = out.split(/\s/)[0];
    if (/^[0-9a-f]{40}$/.test(sha)) {
      const prev = readJ(path.join(CACHE, 'src/.version.json'), {});
      return { sha, version: prev.sha === sha ? prev.version : sha.slice(0, 7) + '_' + new Date().toISOString().slice(0, 10) };
    }
  } catch (e) { /* offline */ }
  return latestCommit();
}

async function pvpokeSource() {
  if (!FETCH) {
    const src = path.resolve(opt('src', path.join(ROOT, 'assets/pvpoke-src')));
    const info = readJ(path.join(SEED, 'all-1500/teams.json'), {});
    return { src, version: process.env.PVPOKE_VERSION || info.pvpoke || 'bundled' };
  }
  const remote = await latestPvPoke();
  if (!remote) throw new Error("Couldn't reach GitHub to check PvPoke's latest version.");
  const license = verifyPvpokeLicense(await get(`https://raw.githubusercontent.com/pvpoke/pvpoke/${remote.sha}/LICENSE`));
  const src = path.join(CACHE, 'src');
  const stamp = readJ(path.join(src, '.version.json'), {});
  if (stamp.sha === remote.sha && !FORCE) { fs.writeFileSync(path.join(src, 'LICENSE-pvpoke.txt'), license); log(`PvPoke ${remote.version} already downloaded`); return { src, version: remote.version }; }
  log(`Downloading PvPoke ${remote.version}`);
  const tmp = src + '.new';
  fs.rmSync(tmp, { recursive: true, force: true });
  const fetchTo = async (f) => { const buf = await get(`https://raw.githubusercontent.com/pvpoke/pvpoke/${remote.sha}/src/${f}`); fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.writeFileSync(path.join(tmp, f), buf); };
  await fetchTo('data/gamemaster.json');
  fs.writeFileSync(path.join(tmp, 'LICENSE-pvpoke.txt'), license);
  const gm = readJ(path.join(tmp, 'data/gamemaster.json'));
  const files = [...ENGINE_FILES, ...dataFilesFor(listFormats(gm)).filter((f) => f !== 'data/gamemaster.json')];
  let k = 0;
  const queue = files.slice();
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const f = queue.shift();
      try { await fetchTo(f); } catch (e) { if (!/rankings|groups/.test(f)) throw e; } // a cup without rankings yet is skipped
      if (++k % 20 === 0) log(`  ${k}/${files.length} files`);
    }
  }));
  writeJ(path.join(tmp, '.version.json'), remote);
  // Keep last run's rankings for the Meta tab's "what changed"
  fs.rmSync(src + '.prev', { recursive: true, force: true });
  if (fs.existsSync(src)) fs.renameSync(src, src + '.prev');
  fs.renameSync(tmp, src);
  return { src, version: remote.version };
}

// ---------- 2. team data per format
// Inputs that affect built numbers: rebuild current leagues/cups; withhold other stale caches.
const CODE = ['build.js', 'build_worker.js', 'antimeta_worker.js', 'scoring.js', 'threevthree.js', 'memberlib.js', 'pvpoke_grades.js', 'engine.js', 'engine_glue.js', 'metrics.js', 'teamcodec.js'];
const codeHash = sha(Buffer.concat([Buffer.from(`schema${SCHEMA}-verified-inputs-v2`), ...CODE.map((f) => fs.readFileSync(path.join(ROOT, f)))]));
function inputFiles(F) {
  const cup = F.filesCup || F.cup;
  return ['data/gamemaster.json', ...['overall', 'leads', 'closers', 'switches'].map((c) => rankingFile(cup, c, F.cp)), `data/groups/${F.meta}.json`];
}
function inputHash(src, F) {
  const h = crypto.createHash('sha256').update(codeHash).update(F.key);
  for (const f of inputFiles(F)) { try { h.update(fs.readFileSync(path.join(src, f))); } catch (e) { h.update('missing:' + f); } }
  return h.digest('hex');
}
const hasData = (dir) => readJ(path.join(dir, 'teams.json'), {}).schema === SCHEMA && fs.existsSync(path.join(dir, 'teams.bin')) && fs.existsSync(path.join(dir, 'antimeta.json'));

async function buildFormats(src, version, formats) {
  const dataRoot = path.join(CACHE, 'data');
  const results = [];
  const live = periodAt(loadSchedule(path.join(ROOT, 'schedule.json')), formats);
  const activeKeys = new Set(live.now ? live.now.formats.map(f => f.key) : ['all-1500', 'all-2500', 'all-10000']);
  for (const F of formats) {
    const dir = path.join(dataRoot, F.key), hash = inputHash(src, F);
    const prev = readJ(path.join(dir, 'inputs.json'), {});
    // Nightly refreshes focus on the live rotation. An explicit --formats request
    // can still prepare a different cup later, without rebuilding future cups now.
    const policy=rq('tools/build-policy.cjs');
    const wanted = policy.wantedFormat(F.key,[...activeKeys],ONLY,FETCH);
    let state = 'reused';
    if (wanted && (FORCE || prev.hash !== hash || !hasData(dir))) {
      // Already-built data shipped with the app counts if it was built from these exact inputs
      const seed = path.join(SEED, F.key), seedSrc = path.join(ROOT, 'assets/pvpoke-src');
      if (!FORCE && hasData(seed) && fs.existsSync(seedSrc) && policy.verifiedSeed(readJ(path.join(seed,'inputs.json')),hash) && inputHash(seedSrc, F) === hash) {
        fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
        for (const f of ['teams.json', 'teams.bin', 'matrix.json', 'antimeta.json', 'meta-changes.json']) if (fs.existsSync(path.join(seed, f))) fs.copyFileSync(path.join(seed, f), path.join(dir, f));
        state = 'seeded';
      } else if (ONLY_BUILT) {
        state = hasData(dir) ? 'stale' : 'skipped';
      } else {
        log(`Building ${F.title} (${F.key})`);
        const t0 = Date.now(), tmp = dir + '.new';
        fs.rmSync(tmp, { recursive: true, force: true });
        let last = '';
        await buildAll(src, tmp, { fmt: F, poolSize: 150, version, onProgress: (stage, i, n) => { const s = `${stage} ${Math.floor((i / Math.max(1, n)) * 4) * 25}%`; if (s !== last) { last = s; log(`  ${F.key}: ${s}`); } } });
        // What moved since the last build of this format
        try {
          const rel = rankingFile(F.filesCup || F.cup, 'overall', F.cp);
          const oldList = readJ(path.join(dir, 'overall.json')) || readJ(path.join(src + '.prev', rel));
          const newList = readJ(path.join(src, rel));
          if (oldList && newList && JSON.stringify(oldList) !== JSON.stringify(newList)) writeJ(path.join(tmp, 'meta-changes.json'), metaChanges(oldList, newList, prev.version || null, version));
          else if (fs.existsSync(path.join(dir, 'meta-changes.json'))) fs.copyFileSync(path.join(dir, 'meta-changes.json'), path.join(tmp, 'meta-changes.json'));
        } catch (e) { /* new cup: nothing to compare */ }
        fs.rmSync(dir, { recursive: true, force: true }); fs.renameSync(tmp, dir);
        state = 'built';
        log(`  ${F.key} done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
      }
      if (state === 'seeded' || state === 'built') {
        try { fs.copyFileSync(path.join(src, rankingFile(F.filesCup || F.cup, 'overall', F.cp)), path.join(dir, 'overall.json')); } catch (e) { /* no rankings */ }
        writeJ(path.join(dir, 'inputs.json'), { hash, version, at: new Date().toISOString() });
      }
    } else if (!hasData(dir)) state = 'none';
    results.push({ F, dir, state, ok:policy.publishable({hasData:hasData(dir),hash,record:prev,state,preview:ONLY_BUILT}) });
  }
  return results;
}

// ---------- 3. assemble the site
// Compact team data (teamcodec.js), checked to decode to exactly the desktop app's teams and numbers
function webTeams(dir) {
  const D = loadTeams(dir);
  const matrix = readJ(path.join(dir, 'matrix.json'));
  const anti = readJ(path.join(dir, 'antimeta.json'));
  // The scorer excludes opponents missing from this cup's threat list. Use the
  // same denominators when recovering the integer counts from percentages.
  const threats = new Set(matrix.threats.map((t) => t.id));
  const fieldSize = anti.field.filter((team) => team.every((id) => threats.has(id))).length;
  const metaOppLen = matrix.meta.metaOpp.filter((opponent) => threats.has(opponent.id)).length;
  const bin = codec.encode(D, fieldSize, metaOppLen);
  const dec = codec.decode(D.info, bin, matrix.meta.metaTypes);
  let mismatch = 0;
  for (let i = 0; i < D.n * 3; i++) if (dec.members[i] !== D.members[i]) mismatch++;
  for (let i = 0; i < D.n; i++) if (dec.orders[i] !== D.orders[i]) mismatch++;
  for (let i = 0; i < D.metrics.length; i++) if (dec.metrics[i] !== D.metrics[i]) mismatch++;
  if (mismatch) {
    const fields = D.info.fields.map((field, k) => {
      let count = 0;
      for (let i = 0; i < D.n; i++) if (dec.metrics[i * D.K + k] !== D.metrics[i * D.K + k]) count++;
      return count ? `${field}: ${count}` : null;
    }).filter(Boolean);
    throw new Error(`${D.info.fmt.key}: compact team data doesn't match the full data (${mismatch} differences; ${fields.join(', ')})`);
  }
  return { info: D.info, bin: zlib.gzipSync(bin, { level: 9 }), nTeams: D.n };
}

async function assemble(src, version, built, formats) {
  log('Assembling the site');
  const tmp = OUT + '.new';
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const files = {}, sizes = {};
  const sourceLicense = fs.readFileSync(path.join(src, 'LICENSE-pvpoke.txt'));
  verifyPvpokeLicense(sourceLicense);
  // Content-addressed files: a new version gets a new name, so browsers can cache them forever
  const publish = (rel, buf, ext) => {
    const h = sha(buf).slice(0, 16), name = `d/${h}${ext || path.extname(rel) || '.bin'}`;
    files[rel] = name; sizes[rel] = buf.length;
    const dest = path.join(tmp, name);
    if (!fs.existsSync(dest)) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf); }
  };
  // PvPoke engine and data
  const pvFiles = new Set([...ENGINE_FILES, ...dataFilesFor(formats)]);
  for (const f of pvFiles) { const p = path.join(src, f); if (fs.existsSync(p)) publish('pvpoke/' + f, fs.readFileSync(p)); }
  const provenance = { provider: 'PvPoke', repository: 'https://github.com/pvpoke/pvpoke',
    revision: readJ(path.join(src, '.version.json'), {}).sha || null, version, license: 'MIT',
    faintrEngine: { bridgeSha256: sha(fs.readFileSync(path.join(ROOT,'engine_glue.js'))), compatibilityRules: ['Supply the missing Morpeko Hangry-to-Full-Belly charged-attack transition only when upstream data omits it.'] },
    licenseSha256: sha(sourceLicense), files: [...pvFiles].filter(f => fs.existsSync(path.join(src, f))).sort().map(f => ({ path: f, sha256: sha(fs.readFileSync(path.join(src, f))) })),
    scope: 'Software, numerical game data, rankings and cup definitions; not a grant of third-party trademark or game-content rights.' };
  fs.writeFileSync(path.join(tmp, 'source-provenance.json'), JSON.stringify(provenance, null, 2));
  fs.mkdirSync(path.join(tmp, 'sources'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'sources/index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sources — FAINTR</title><style>body{margin:0;background:#22252e;color:#f2f4f7;font:17px/1.7 system-ui,sans-serif}main{max-width:780px;margin:auto;padding:28px 24px 70px}a{color:#f5c937}</style></head><body><main><a href="/">Back to FAINTR</a><h1>Data and simulation sources</h1><p>FAINTR uses <a href="https://github.com/pvpoke/pvpoke">PvPoke's open-source battle simulator</a>, numerical game data, rankings and cup definitions. FAINTR calculates its own team grades, comparisons and account features on top of those inputs.</p><p>The interface uses locally drawn type symbols and FAINTR branding. FAINTR does not connect to a trainer's Pokémon GO account or request game credentials.</p><p><a href="/source-provenance.json">Published source versions and file fingerprints</a> · <a href="/licenses/">Full software and font license notices</a></p><p>Software licenses cover their respective components. They do not provide blanket rights in third-party trademarks or game content. FAINTR is an independent project and is not affiliated with or endorsed by the Pokémon rights holders.</p></main></body></html>`);
  // Team data
  const fmtList = [], premiumData = {};
  for (const r of built) {
    const entry = { ...r.F, built: false, nTeams: null };
    if (r.ok) {
      const w = webTeams(r.dir), base = `formats/${r.F.key}/`;
      publish(base + 'teams.json', Buffer.from(JSON.stringify(w.info)));
      publish(base + 'teams.bin.gz', w.bin, '.bin'); // .bin so no host adds its own Content-Encoding
      publish(base + 'matrix.json', fs.readFileSync(path.join(r.dir, 'matrix.json')));
      if (PREMIUM) premiumData[r.F.key] = readJ(path.join(r.dir, 'antimeta.json'));
      else publish(base + 'antimeta.json', fs.readFileSync(path.join(r.dir, 'antimeta.json')));
      if (fs.existsSync(path.join(r.dir, 'meta-changes.json'))) publish(base + 'meta-changes.json', fs.readFileSync(path.join(r.dir, 'meta-changes.json')));
      Object.assign(entry, { built: true, nTeams: w.nTeams, pvpoke: w.info.pvpoke, dataBuilt: w.info.built });
    }
    fmtList.push(entry);
  }
  // Code: the core worker and engine workers, bundled for the browser
  const esbuild = require('esbuild');
  const shim = (n) => path.join(ROOT, 'web/shims', n);
  for (const [entry, rel] of [['web/src/core.js', 'core.js'], ['web/src/engine-worker.js', 'engine-worker.js']]) {
    const r = esbuild.buildSync({ entryPoints: [path.join(ROOT, entry)], bundle: true, write: false, format: 'iife', platform: 'browser', target: ['chrome100', 'firefox113', 'safari16.4'], minify: true, legalComments: 'none',
      alias: { fs: shim('fs.js'), path: shim('path.js'), vm: shim('vm.js'), os: shim('empty.js'), worker_threads: shim('empty.js'), child_process: shim('empty.js'), https: shim('empty.js') } });
    publish(rel, Buffer.from(r.outputFiles[0].contents));
  }
  // The page: the desktop app's UI with the website bridge
  const copyDir = (from, to) => { fs.mkdirSync(to, { recursive: true }); for (const e of fs.readdirSync(from, { withFileTypes: true })) { const a = path.join(from, e.name), b = path.join(to, e.name); if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b); } };
  copyDir(path.join(ROOT, 'ui'), path.join(tmp, 'static'));
  const notices = rq('tools/third_party_notices').collectNotices(ROOT);
  fs.writeFileSync(path.join(tmp, 'static/THIRD_PARTY_NOTICES.txt'), notices);
  fs.mkdirSync(path.join(tmp, 'licenses'), { recursive: true });
  const noticesHtml = notices.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  fs.writeFileSync(path.join(tmp, 'licenses/index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Open-source notices — FAINTR</title><style>body{margin:0;background:#22252e;color:#f2f4f7;font:16px/1.6 system-ui,sans-serif}main{max-width:900px;margin:auto;padding:28px 24px 70px}a{color:#f5c937}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 ui-monospace,monospace}</style></head><body><main><a href="/">Back to FAINTR</a><h1>Open-source notices</h1><p><a href="/static/THIRD_PARTY_NOTICES.txt">Plain text license notices</a></p><pre>${noticesHtml}</pre></main></body></html>`);
  const supportCss = fs.readFileSync(path.join(ROOT, 'web/supporters.css'));
  fs.mkdirSync(path.join(tmp, 'supporters'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'supporters/style.css'), supportCss);
  fs.writeFileSync(path.join(tmp, 'supporters/index.html'), rq('tools/supporters-page').renderSupportersPage({
    supporters: readJ(path.join(ROOT, 'web/supporters.json'), { supporters: [] }).supporters,
    patreonUrl: (process.env.FAINTR_SUPPORT_URL || '').trim(), cssVersion: sha(supportCss).slice(0, 10),
    appCssVersion: sha(fs.readFileSync(path.join(tmp, 'static/app.css'))).slice(0, 10),
  }));
  for (const page of ['privacy', 'terms']) {
    const source = path.join(ROOT, 'web/legal', page + '.html');
    if (fs.existsSync(source)) {
      fs.mkdirSync(path.join(tmp, page), { recursive: true });
      fs.copyFileSync(source, path.join(tmp, page, 'index.html'));
    }
  }
  fs.rmSync(path.join(tmp, 'static/index.html'));
  // Site settings from the environment (GitHub repository variables), so nobody edits code to change a link
  const env = (k) => (process.env[k] || '').trim();
  const cfg = { discordUrl: env('FAINTR_DISCORD_URL'), patreonUrl: '', patreonReady: false, supabaseUrl: env('SUPABASE_URL').replace(/\/$/, ''), supabaseAnonKey: env('SUPABASE_ANON_KEY'), loginProviders: env('FAINTR_LOGIN_PROVIDERS').toLowerCase(), billingEnabled: PREMIUM, analyticsEnabled:env('FAINTR_ANALYTICS_ENABLED')==='true' };
  if (PREMIUM) {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('Premium requires Supabase.');
    const worker = fs.readFileSync(path.join(ROOT, 'web/premium-worker.js'), 'utf8')
      .replace('const data = __PREMIUM_DATA__;', `const data = ${JSON.stringify(premiumData)};`)
      .replace('const supabaseUrl = __SUPABASE_URL__;', `const supabaseUrl = ${JSON.stringify(cfg.supabaseUrl)};`)
      .replace('const supabaseKey = __SUPABASE_KEY__;', `const supabaseKey = ${JSON.stringify(cfg.supabaseAnonKey)};`);
    fs.writeFileSync(path.join(tmp, '_worker.js'), worker);
    fs.writeFileSync(path.join(tmp, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/premium/*'], exclude: [] }));
  }
  const cfgJs = `window.FAINTR_CONFIG = Object.assign(${JSON.stringify(cfg)}, window.FAINTR_CONFIG || {});\n`;
  fs.writeFileSync(path.join(tmp, 'static/config.js'), cfgJs);
  fs.mkdirSync(path.join(tmp, 'static/vendor'), { recursive: true });
  fs.copyFileSync(require.resolve('@supabase/supabase-js/dist/umd/supabase.js', { paths: [ROOT] }), path.join(tmp, 'static/vendor/supabase.js'));
  fs.copyFileSync(path.join(ROOT, 'web/bridge.js'), path.join(tmp, 'static/bridge.js'));
  esbuild.buildSync({ stdin: { contents: 'window.FAINTR_VIP_TOOLS = require("./viptools");', resolveDir: ROOT }, bundle: true, platform: 'browser', format: 'iife', outfile: path.join(tmp, 'static/viptools.js'), minify: true });
  fs.copyFileSync(path.join(ROOT, 'web/share-codec.js'), path.join(tmp, 'static/share-codec.js'));
  fs.copyFileSync(path.join(ROOT, 'metrics.js'), path.join(tmp, 'metrics.js'));
  fs.copyFileSync(path.join(ROOT, 'CHANGELOG.md'), path.join(tmp, 'changelog.md'));
  const v = (rel) => sha(fs.readFileSync(path.join(tmp, rel))).slice(0, 10);
  let html = fs.readFileSync(path.join(ROOT, 'ui/index.html'), 'utf8');
  html = rq('tools/initial-controls.cjs').initialControls(html,loadSchedule(path.join(ROOT,'schedule.json')),fmtList);
  html = html.replace('<!--WEB-HEAD-->', `
<link rel="canonical" href="https://faintr.com/"><meta property="og:type" content="website"><meta property="og:title" content="FAINTR: Win the matchup"><meta property="og:description" content="Free Pokémon GO PvP team tools, built on PvPoke's battle simulator."><meta property="og:image" content="https://faintr.com/static/faintr-preview.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="https://faintr.com/static/faintr-preview.png"><meta name="theme-color" content="#2B2F3A">`)
    .replace('<!--SHARE-SCRIPT-->', '<script src="/static/share-codec.js"></script>')
    .replace('<!--WEB-SCRIPTS-->', `<script src="/static/vendor/supabase.js?v=${v('static/vendor/supabase.js')}"></script>\n<script src="/static/viptools.js?v=${v('static/viptools.js')}"></script>\n<script src="/static/bridge.js?v=${v('static/bridge.js')}"></script>`)
    .replace(/(href|src)="\/(static\/[^"?]+\.(?:css|js|svg)|metrics\.js)"/g, (m, attr, rel) => `${attr}="/${rel}?v=${v(rel)}"`);
  fs.writeFileSync(path.join(tmp, 'index.html'), html);
  // Manifest: the only file that changes name-in-place; never cached
  const schedule = loadSchedule(path.join(ROOT, 'schedule.json'));
  const manifest = { appVersion: PKG.version, pvpoke: version, built: new Date().toISOString(), premium: PREMIUM, schedule, formats: fmtList, files, sizes };
  fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(tmp, '_headers'), [
    '/d/*', '  Cache-Control: public, max-age=31536000, immutable', '  Access-Control-Allow-Origin: *', '',
    '/manifest.json', '  Cache-Control: no-store', '',
    '/', '  Cache-Control: no-cache', '/index.html', '  Cache-Control: no-cache', '',
    '/static/*', '  Cache-Control: public, max-age=86400', '',
    // 'unsafe-eval': PvPoke's engine and FAINTR's grading code are evaluated inside the workers
    '/*', '  X-Content-Type-Options: nosniff', '  Referrer-Policy: strict-origin-when-cross-origin', '  X-Frame-Options: DENY',
    `  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-eval' https://static.cloudflareinsights.com; worker-src 'self'; connect-src 'self' https://cloudflareinsights.com${cfg.supabaseUrl ? ` ${cfg.supabaseUrl} ${cfg.supabaseUrl.replace(/^https/, 'wss')}` : ''}; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`, '',
  ].join('\n'));
  // Short sharing links resolve only a sanitized public setup; legacy tokens stay supported.
  const shareGm=readJ(path.join(src,'data/gamemaster.json'));
  const pokemon={};
  for(const p of shareGm.pokemon){
    const value={name:p.speciesName,types:p.types,fast:p.fastMoves||[],charged:p.chargedMoves||[],extra:p.extraChargedMoves||[]};
    pokemon[p.speciesId]=value;
    if(p.shadow){pokemon[p.speciesId+'_shadow']={...value,name:p.speciesName+' (Shadow)',charged:[...value.charged,'FRUSTRATION','RETURN']};}
  }
  const shareMetadata={analyticsEnabled:cfg.analyticsEnabled,supabaseUrl:cfg.supabaseUrl,supabaseAnonKey:cfg.supabaseAnonKey,formats:Object.fromEntries(formats.map(f=>[f.key,f.title])),pokemon,moves:Object.fromEntries(shareGm.moves.map(m=>[m.moveId,m.name])),csp:fs.readFileSync(path.join(tmp,'_headers'),'utf8').split('Content-Security-Policy: ')[1].split('\n')[0]};
  const sharedWorker=(await esbuild.build({entryPoints:[path.join(ROOT,'web/share-worker.js')],bundle:true,platform:'browser',format:'esm',minify:true,write:false,plugins:[{name:'share-metadata',setup(build){build.onResolve({filter:/share-metadata\.json$/},()=>({path:'share-metadata',namespace:'faintr'}));build.onLoad({filter:/.*/,namespace:'faintr'},()=>({contents:JSON.stringify(shareMetadata),loader:'json'}));}}]})).outputFiles[0].contents;
  fs.writeFileSync(path.join(tmp,'_worker.js'),sharedWorker);
  fs.writeFileSync(path.join(tmp,'_routes.json'),JSON.stringify({version:1,include:['/share/*','/s/*',...(cfg.analyticsEnabled?['/a/event']:[])],exclude:[]}));
  const imageCode=esbuild.buildSync({entryPoints:[path.join(ROOT,'web/share-image.js')],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
  const imageModule={exports:{}};new Function('module','exports',imageCode)(imageModule,imageModule.exports);
  const preview=await imageModule.exports.renderCard({format:'Pokemon GO PvP'});
  fs.writeFileSync(path.join(tmp,'static/faintr-preview.png'),Buffer.from(await preview.arrayBuffer()));
  rq('tools/public-pages.cjs').publishPublicPages(tmp,{analytics:cfg.analyticsEnabled,version:v('static/config.js')});
  // Single-page app: unknown paths show the app
  fs.writeFileSync(path.join(tmp, '_redirects'), '/changelog /changelog.md 302\n/privacy.html /privacy/ 301\n/terms.html /terms/ 301\n');
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.renameSync(tmp, OUT);
  const total = Object.values(sizes).reduce((a, b) => a + b, 0);
  const big = Object.entries(sizes).filter(([, s]) => s > 25 * 1048576);
  if (big.length) throw new Error(`Files over Cloudflare Pages' 25 MB limit: ${big.map(([f]) => f).join(', ')}`);
  log(`Site ready in ${path.relative(process.cwd(), OUT) || OUT}: ${Object.keys(files).length} data files, ${(total / 1048576).toFixed(0)} MB, ${fmtList.filter((f) => f.built).length} of ${fmtList.length} formats with teams`);
  return manifest;
}

(async () => {
  const t0 = Date.now();
  const { src, version } = await pvpokeSource();
  const gm = readJ(path.join(src, 'data/gamemaster.json'));
  const formats = listFormats(gm, src);
  log(`PvPoke ${version}: ${formats.length} formats`);
  const built = await buildFormats(src, version, formats);
  const counts = built.reduce((a, r) => { a[r.state] = (a[r.state] || 0) + 1; return a; }, {});
  log('Formats:', Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', '));
  await assemble(src, version, built, formats);
  // For the GitHub Action summary
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### FAINTR data ${version}\n\n| Format | Result |\n|---|---|\n${built.map((r) => `| ${r.F.title} | ${r.state}${r.ok ? '' : ' (no teams yet)'} |`).join('\n')}\n\nTook ${((Date.now() - t0) / 60000).toFixed(1)} minutes.\n`);
  log(`Done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
})().catch((e) => { console.error(e); process.exit(1); });
