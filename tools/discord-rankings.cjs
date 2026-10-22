// Posts the public website's Top 10 results. No account or roster data is read.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const codec = require('../teamcodec');
const { query } = require('../teamdata');
const { periodAt } = require('../formats');

const SITE = 'https://faintr.com';
const GUILD = '1562164464135045121';
const CHANNELS = { meta: '1562327310076608512', anti: '1562327349704527932' };
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const clean = value => String(value).replace(/[\\`*_~|<>@]/g, '').replace(/\s+/g, ' ').trim();
const centralDay = when => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(when);

function selectedFormats(manifest, when) {
  const live = periodAt(manifest.schedule || { periods: [] }, manifest.formats, +when);
  const current = new Set((live.now?.formats || []).map(f => f.key));
  return manifest.formats.filter(f => f.built && (f.kind === 'league' || current.has(f.key)));
}

function unpack(info, bytes, matrix, anti) {
  if (!anti?.verified || !anti?.fieldTeams) throw new Error('Anti-Meta data is missing; no partial ranking digest will be posted.');
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = zlib.gunzipSync(bytes);
  return { info, ...codec.decode(info, bytes, matrix.meta.metaTypes), threats: null,
    C: { bulkGoal: info.bulkGoal || 22000, calib: info.calib || {} },
    mwi: info.fields.indexOf('metaWin'), _cuts: new Map(),
    anti: { field: anti.field, fieldTeams: anti.fieldTeams, fieldSet: new Set(anti.fieldTeams), verified: new Map(anti.verified.map(v => [v.i, v])) } };
}

async function getPublic(relative, fetcher = fetch) {
  if (!/^(manifest\.json|d\/[a-f0-9]{16}\.[a-z0-9]+)$/.test(relative)) throw new Error('Unexpected public data path.');
  let response;
  try { response = await fetcher(`${SITE}/${relative}`, { signal: AbortSignal.timeout(60000), redirect: 'error' }); }
  catch { throw new Error('Could not load public FAINTR ranking data.'); }
  if (!response.ok) throw new Error(`Public FAINTR data returned HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

async function loadPublished(manifest, format, fetcher) {
  const base = `formats/${format.key}/`;
  const rel = ['teams.json', 'teams.bin.gz', 'matrix.json', 'antimeta.json'];
  const files = await Promise.all(rel.map(name => {
    const hashed = manifest.files[base + name];
    if (!hashed) throw new Error(`Published data is incomplete for ${format.key}.`);
    return getPublic(hashed, fetcher);
  }));
  const info = JSON.parse(files[0]);
  if (info.fmt.key !== format.key || info.built !== format.dataBuilt) throw new Error('Ranking data does not match the published manifest.');
  return unpack(info, files[1], JSON.parse(files[2]), JSON.parse(files[3]));
}

function render(format, D, mode, day) {
  const teams = query(D, { limit: 10, ...(mode === 'anti' ? { mode: 'anti' } : {}) }).teams;
  if (teams.length !== 10) throw new Error(`Expected 10 teams for ${format.key}.`);
  const pvpoke = ['coverage', 'bulk', 'safety', 'consistency'];
  const checks = ['blindSpots', 'twoAnswers', 'resilience', 'sharedWeak', 'pilot', 'metaWins'];
  const fields = teams.map((team, i) => {
    const score = mode === 'anti' ? `${team.anti.win.toFixed(1)}% ${team.anti.verified ? 'engine checked' : 'model estimate'}` : `${team.composite.toFixed(1)} overall`;
    return { name: `${i + 1}. ${score}`, inline: false,
      value: team.members.map((m, j) => `**${['Lead', 'Swap', 'Closer'][j]}: ${clean(m.name)}**\n${clean((m.moves || []).map(x => x.name || x).join(', ') || m.moveStr)}`).join('\n')
        + `\nPvPoke: **${pvpoke.map(k => team.grades[k].letter).join(' ')}** · FAINTR: **${checks.map(k => team.grades[k].letter).join(' ')}**` };
  });
  const embed = { title: `${clean(format.title)} · Top 10 ${mode === 'anti' ? 'Anti-Meta' : 'Meta'} · ${day}`, url: SITE,
    color: mode === 'anti' ? 0xD7263D : 0xF5B800,
    description: mode === 'anti' ? 'Ranked with FAINTR’s Anti-Meta mode, excluding its meta field. Engine-checked results are labeled; estimates are not observed win rates.' : 'Highest overall team scores with FAINTR’s default weights and no roster filters. These are model rankings, not live usage or tournament results.',
    fields, footer: { text: `Data built: ${D.info.built} · PvPoke ${D.info.pvpoke} · Free tools: faintr.com` } };
  const length = embed.title.length + embed.description.length + embed.footer.text.length + fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
  if (length > 5900 || fields.some(f => f.value.length > 1024)) throw new Error(`Discord size limit exceeded for ${format.key}; no truncated team will be posted.`);
  return { content: '', allowed_mentions: { parse: [] }, embeds: [embed] };
}

function webhook(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Invalid Discord webhook configuration.'); }
  if (url.origin !== 'https://discord.com' || !/^\/api\/(?:v10\/)?webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url.pathname) || url.search || url.hash) throw new Error('Invalid Discord webhook configuration.');
  return url;
}

async function request(url, method, body, fetcher = fetch) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let response;
    try { response = await fetcher(url, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(30000) }); }
    catch { throw new Error('Discord request outcome is uncertain. Check the channel before retrying this digest.'); }
    if (response.status === 429) {
      const retry = await response.json();
      await new Promise(resolve => setTimeout(resolve, Math.min(30000, Math.max(1000, Number(retry.retry_after || 1) * 1000))));
      continue;
    }
    if (!response.ok) throw new Error(`Discord rejected the request (HTTP ${response.status}).`);
    return response.json();
  }
  throw new Error('Discord rate limit persisted; no unbounded retries were made.');
}

async function verifyDestinations(urls, fetcher = fetch) {
  const destinations = {};
  for (const mode of ['meta', 'anti']) {
    const url = webhook(urls[mode]);
    const info = await request(url, 'GET', null, fetcher);
    if (info.guild_id !== GUILD || info.channel_id !== CHANNELS[mode]) throw new Error(`The ${mode} webhook points to the wrong channel.`);
    destinations[mode] = url;
  }
  return destinations;
}

async function publish(plans, urls, state, save, day, fetcher = fetch, quiet = false) {
  // Verify both destinations before posting any public message.
  const destinations = await verifyDestinations(urls, fetcher);
  for (const mode of ['meta', 'anti']) {
    for (const [index, plan] of plans[mode].entries()) {
      const key = `${day}/${mode}/${plan.key}`;
      if (state[key]?.status === 'sent') continue;
      if (state[key]?.status === 'pending') throw new Error('A previous send has an uncertain outcome. Review Discord before clearing its pending state.');
      const body = structuredClone(plan.body);
      if (index === 0) {
        body.content = `${quiet ? '' : '@everyone '}🛡️ **FAINTR daily ${mode === 'anti' ? 'Anti-Meta' : 'Meta'} teams · ${day}**\nGreat, Ultra, Master, plus any available current cup. Lead → swap → closer; full moves below. Discuss teams in <#1562882495870009395>.\nGrades: PvPoke = Coverage / Bulk / Safety / Consistency. FAINTR = Blind Spots / Two Answers / Shields / Shared Weakness / Pilot / Meta Wins.`;
        body.allowed_mentions = { parse: quiet ? [] : ['everyone'] };
      }
      const url = new URL(destinations[mode]); url.searchParams.set('wait', 'true');
      state[key] = { status: 'pending' }; save(state);
      const posted = await request(url, 'POST', body, fetcher);
      if (!/^\d+$/.test(posted.id || '')) throw new Error('Discord did not confirm a message ID.');
      state[key] = { status: 'sent', id: posted.id }; save(state);
      console.log(`Posted ${mode}: ${plan.key}.`);
    }
  }
}

async function main() {
  const send = process.argv.includes('--send');
  const urls = { meta: process.env.DISCORD_META_WEBHOOK_URL, anti: process.env.DISCORD_ANTIMETA_WEBHOOK_URL };
  if ((send || process.argv.includes('--verify')) && (!urls.meta || !urls.anti)) throw new Error('Both Discord ranking webhooks must be configured before scheduling.');
  const now = new Date(), day = centralDay(now);
  const manifest = JSON.parse(await getPublic('manifest.json'));
  const formats = selectedFormats(manifest, now);
  for (const key of ['all-1500', 'all-2500', 'all-10000']) if (!formats.some(f => f.key === key)) throw new Error('All three league datasets must be published before the daily digest can run.');
  const plans = { meta: [], anti: [] };
  for (const format of formats) {
    console.log(`Preparing ${format.key}.`);
    const D = await loadPublished(manifest, format);
    for (const mode of ['meta', 'anti']) plans[mode].push({ key: format.key, body: render(format, D, mode, day) });
  }
  if (!send) {
    if (process.argv.includes('--verify')) { await verifyDestinations(urls); console.log('Both Discord destinations verified.'); }
    const output = path.resolve(process.env.DISCORD_PREVIEW_FILE || '../output/discord-rankings-preview.json');
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(plans, null, 2));
    console.log(`Preview: ${formats.length} formats, 10 teams per mode. No Discord messages sent.`); return;
  }
  const file = path.resolve('.discord-state/state.json');
  const state = fs.existsSync(file) ? json(file) : {};
  const save = data => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2)); };
  await publish(plans, urls, state, save, day, fetch, process.argv.includes('--quiet'));
}

module.exports = { centralDay, selectedFormats, unpack, render, webhook, publish, loadPublished };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
