/* FAINTR (browser side). Follows docs/FAINTR_BRAND_GUIDE.md */
const G = TFMetrics.GRADES;
const KEYS = Object.keys(G);
const SHORT = { coverage: 'Cover', bulk: 'Bulk', safety: 'Safe', consistency: 'Consist', blindSpots: 'Blind', twoAnswers: '2 ans', resilience: 'Shields', sharedWeak: 'Weak', pilot: 'Pilot', metaWins: 'Meta' };
const TYPE_COLOR = { normal: '#9FA19F', fire: '#E62829', water: '#2980EF', electric: '#FAC000', grass: '#3FA129', ice: '#3DCEF3', fighting: '#FF8000', poison: '#9141CB', ground: '#915121', flying: '#81B9EF', psychic: '#EF4179', bug: '#91A119', rock: '#AFA981', ghost: '#704170', dragon: '#5060E1', dark: '#624D4E', steel: '#60A1B8', fairy: '#EF70EF' };
const ROLES = ['Lead', 'Safe swap', 'Closer'];
const LEAGUES = [{ key: 'all-1500', short: 'Great', cp: 1500 }, { key: 'all-2500', short: 'Ultra', cp: 2500 }, { key: 'all-10000', short: 'Master', cp: 10000 }];
const LEAGUE_NAME = { 500: 'Little', 1500: 'Great', 2500: 'Ultra', 10000: 'Master' };
const BALLS = [['poke', 'Poké Ball'], ['great', 'Great Ball'], ['ultra', 'Ultra Ball'], ['master', 'Master Ball'], ['premier', 'Premier Ball'], ['other', 'Other']];
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const typeDots = (types) => `<span class="typedots">${(types || []).map((t) => `<i title="${t}" style="background:${TYPE_COLOR[t] || '#999'}"></i>`).join('')}</span>`;
const cls = (my) => (my > 550 ? 'win' : my >= 450 ? 'close' : 'loss');
const fmt = (n, d = 0) => Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const STAR = '<span class="star" aria-label="rank 1">★</span>';
const rankText = (r, count) => (r === 1 ? `Rank 1 ${STAR}` : `Rank ${fmt(r)}${count ? ` of ${fmt(count)}` : ''}`);
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } } };

const S = { info: null, f: 'all-1500', fmt: null, include: [], exclude: [], mins: {}, maxShadow: '', weights: {}, limit: 50, ownedOnly: false, roster: [], full: null, anti: false };
const title = () => (S.fmt ? S.fmt.title : 'Great League');

const WEB = !!window.FAINTR_BRIDGE; // the website runs the engine in the browser; the desktop app has a local server
const CFG = window.FAINTR_CONFIG || {};
const PREMIUM = false;
function hasPremium() { return !PREMIUM || window.FAINTR_BRIDGE.billing.hasAccess(); }
function needPremium() { if (hasPremium()) return false; openPremium(); return true; }
async function api(path, body, opts = {}) {
  let url = path;
  if (body === undefined) { if (!opts.noF) url += (path.includes('?') ? '&' : '?') + 'f=' + encodeURIComponent(S.f); }
  else if (body && typeof body === 'object' && !Array.isArray(body) && body.f === undefined && !opts.noF) body = { ...body, f: S.f };
  if (WEB) {
    try { return await window.FAINTR_BRIDGE.api(url, body); } catch (e) { if (e.code === 402) openPremium(); const err = new Error(e.message || 'Something went wrong.'); err.needsBuild = e.code === 409; throw err; }
  }
  const r = await fetch(url, body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({ error: "FAINTR isn't answering. Is its window still open?" }));
  if (!r.ok || (j && j.error)) { const e = new Error(j.error || 'Request failed'); e.needsBuild = !!j.needsBuild; throw e; }
  return j;
}
const catalogById = () => (S._cat || (S._cat = new Map(S.fmt.catalog.map((c) => [c.id, c]))));
const rosterIds = () => new Set(S.roster.map((e) => e.id));

/* ---------- shared pieces */
function card(grades) {
  const tile = (k) => `<span class="tile" title="${esc(G[k].label)}: ${esc(grades[k].text)}. ${esc(G[k].desc)}"><span class="L ${grades[k].letter}">${grades[k].letter}</span><small>${SHORT[k]}</small></span>`;
  return `<div class="card"><div><div class="setname">PvPoke grades</div><div class="set">${KEYS.filter((k) => G[k].pvpoke).map(tile).join('')}</div></div>
    <div><div class="setname">FAINTR team checks</div><div class="set">${KEYS.filter((k) => !G[k].pvpoke).map(tile).join('')}</div></div></div>`;
}
// Overall score, colored by where it ranks among every team in this league or cup
function scoreBadge(composite, tier, under, ftitle) {
  const t = tier || { key: 'fair', label: '' };
  return `<span class="score" title="${t.key === 'fair' ? 'Outside the top 25% of teams' : `${esc(t.label)} of every ${esc(ftitle || title())} team`}"><b class="tb t-${t.key}">${composite.toFixed(1)}</b><span>${under || (t.key === 'fair' ? 'overall' : esc(t.label))}</span></span>`;
}
function monCell(m, role) {
  const own = rosterIds().has(m.id) ? '<span class="own" title="In your Roster">✓</span>' : '';
  return `<div class="mon" style="--t1:${TYPE_COLOR[(m.types || [])[0]] || 'var(--line)'}"><div class="role">${role}</div>
    <div class="name" title="${esc(m.name)}">${esc(m.name)}${own}${typeDots(m.types)}</div><div class="moves" title="${esc((m.moves || []).join(', '))}">${esc((m.moves || []).join(', '))}</div></div>`;
}

const fullSource = () => S.full || [];
function picker(el, onPick, sourceFn) {
  const input = $('input', el), box = $('.suggest', el);
  let hl = -1, items = [];
  const close = () => { box.hidden = true; hl = -1; };
  const render = () => {
    const q = input.value.trim().toLowerCase();
    items = q ? sourceFn().filter((p) => p.name.toLowerCase().includes(q) || p.id.includes(q.replace(/\s+/g, '_')) || String(p.dex) === q).slice(0, 40) : [];
    box.innerHTML = items.map((p, i) => `<button type="button" data-i="${i}" class="${i === hl ? 'hl' : ''}">${esc(p.name)}${typeDots(p.types)}${p.rank && p.rank < 9999 ? `<span class="rk">#${p.rank}</span>` : ''}</button>`).join('')
      || (q.length > 1 && sourceFn !== fullSource && el.dataset.scope !== 'all' ? `<div class="nomatch">No ${esc(title())} Pokémon match "${esc(input.value.trim())}". Is it eligible here? Switch league or cup at the top.</div>` : '');
    box.hidden = !box.innerHTML;
  };
  const pick = (p) => { onPick(p); input.value = ''; close(); };
  input.addEventListener('input', () => { hl = -1; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { hl = Math.min(items.length - 1, hl + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { hl = Math.max(0, hl - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter' && items.length) { pick(items[Math.max(0, hl)]); e.preventDefault(); }
    else if (e.key === 'Escape') close();
  });
  box.addEventListener('mousedown', (e) => { const b = e.target.closest('button'); if (b) { pick(items[+b.dataset.i]); e.preventDefault(); } });
  input.addEventListener('blur', () => setTimeout(close, 150));
}

/* ---------- pixel type icons: original 12x12 glyphs for each type (not the game's type badges)
   o = dark shade, x = type color, h = light shade */
const TYPE_GLYPH = {
  normal: ['....oooo....', '..ooxxxxoo..', '.oxxxxxxxxo.', '.oxhhxxxxxo.', 'oxhxxxxxxxxo', 'oxhxxxxxxxxo', 'oxxxxxxxxxxo', 'oxxxxxxxxxxo', '.oxxxxxxxxo.', '.oxxxxxxxxo.', '..ooxxxxoo..', '....oooo....'],
  fire: ['.....o......', '....oxo.....', '....oxxo....', '...oxxxo..o.', '..oxxhxxo.oo', '..oxxhhxxoxo', '.oxxhhhhxxxo', '.oxxhhhhhxxo', '.oxxhhhhhxxo', '.oxxxhhhxxxo', '..oxxxxxxxo.', '...ooooooo..'],
  water: ['.....oo.....', '....oxxo....', '....oxxo....', '...oxxxxo...', '..oxxxxxxo..', '..oxhxxxxo..', '.oxhxxxxxxo.', '.oxhxxxxxxo.', '.oxxhxxxxxo.', '..oxxxxxxo..', '...oxxxxo...', '....oooo....'],
  grass: ['........oooo', '......ooxxxo', '.....oxxxxxo', '....oxxxxhxo', '...oxxxxhxxo', '..oxxxxhxxo.', '..oxxxhxxxo.', '.oxxxhxxxo..', '.oxxhxxxo...', '.oxhxxoo....', '.ohoo.......', 'oo..........'],
  electric: ['......ooooo.', '.....oxxxo..', '....oxxxo...', '...oxxxo....', '..oxxxxoooo.', '.oxxhhhhxxo.', '.ooooxxxxo..', '....oxxxo...', '...oxxxo....', '..oxxo......', '..oxo.......', '..oo........'],
  ice: ['.....oo.....', '..o..oo..o..', '...o.oo.o...', '....oxxo....', '.o..oxxo..o.', 'ooooxhhxoooo', 'ooooxhhxoooo', '.o..oxxo..o.', '....oxxo....', '...o.oo.o...', '..o..oo..o..', '.....oo.....'],
  fighting: ['............', '..ooooooooo.', '.oxxoxxoxxxo', '.oxxoxxoxxxo', '.ohxohxohxxo', 'ooooooooooxo', 'oxxxxxoxxxxo', 'ohxxxxoxxxxo', '.oooooxxxxxo', '..oxxxxxxxo.', '...oxxxxxo..', '...ooooooo..'],
  poison: ['........oo..', '.......oxxo.', '.......ohxo.', '...oo...oo..', '..oxxo......', '..ohxo..ooo.', '...oo..oxxxo', '.......ohxxo', '..oooo.oxxxo', '.oxxxxo.ooo.', '.ohxxxo.....', '..oooo......'],
  ground: ['............', '............', '.....oo.....', '....oxxo....', '...oxhxxo...', '..oxhxxxxo..', '.oxxxxxxxxo.', 'oooooooooooo', 'oxxxxxxxxxxo', 'oxhhxxxhhxxo', 'oxxxxxxxxxxo', 'oooooooooooo'],
  flying: ['............', 'oo..........', 'oxoo........', 'oxxxoo......', '.oxxxxoo....', '.oxhxxxxoo..', '..oxhxxxxxoo', '..oxxhxxxxxo', '...oxxhhxxo.', '....oxxxxo..', '.....oooo...', '............'],
  psychic: ['............', '............', '...oooooo...', '..oxxxxxxo..', '.oxxoooxxxo.', 'oxxohhooxxxo', 'oxxohoooxxxo', '.oxxoooxxxo.', '..oxxxxxxo..', '...oooooo...', '............', '............'],
  bug: ['...o....o...', '....o..o....', '...oooooo...', '..oxxxxxxo..', '.oxxxoxxxxo.', 'oxxhxoxxxxxo', '.oxhxoxxxxo.', 'oxxxxoxxxxxo', '.oxxxoxxxxo.', '..oxxoxxxo..', '...oooooo...', '............'],
  rock: ['............', '....oooo....', '..ooxxxxoo..', '.oxxhhxxxxo.', '.oxhxxxxxxo.', 'oxxxxxoxxxxo', 'oxxxxoxxxxxo', 'oxxxxxxxxxxo', '.oxxxxxxxxo.', '..oooooooo..', '............', '............'],
  ghost: ['....oooo....', '..ooxxxxoo..', '.oxxxxxxxxo.', '.oxooxxooxo.', 'oxxooxxooxxo', 'oxxxxxxxxxxo', 'oxhxxxxxxxxo', 'oxhxxxxxxxxo', 'oxxxxxxxxxxo', 'oxoxxoxxoxxo', 'oo.oo.oo.oo.', '............'],
  dragon: ['o...........', 'oo......oo..', '.oxo...oxo..', '.oxxooooxo..', '..oxxxxxxo..', '.oxxoxxxxxo.', '.oxxxxxxxxxo', '..oxxxxxhhxo', '...oxxxooooo', '....oxxo....', '....oxxo....', '.....oo.....'],
  dark: ['....oooo....', '..ooxxxo....', '.oxxxo......', '.oxxo.......', 'oxxo........', 'oxho........', 'oxho........', 'oxxxo.......', '.oxxxo....o.', '.oxxxxoooxo.', '..ooxxxxxo..', '....oooo....'],
  steel: ['....oooo....', '..ooxxxxoo..', '.oxxxxxxxxo.', '.oxxhoohxxo.', 'oxxxo..oxxxo', 'oxxo....oxxo', 'oxxo....oxxo', 'oxxxo..oxxxo', '.oxxhoohxxo.', '.oxxxxxxxxo.', '..ooxxxxoo..', '....oooo....'],
  fairy: ['.....oo.....', '.....oo.....', '....oxxo....', '....oxxo....', '..ooxhhxoo..', 'ooxxhhhhxxoo', 'ooxxhhhhxxoo', '..ooxhhxoo..', '....oxxo....', '....oxxo....', '.....oo.....', '.....oo.....'],
};
function hexToHsl(h) {
  const n = parseInt(h.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let hh = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60; }
  return [hh, s, l];
}
const hsl = (h, s, l) => `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(Math.max(0, Math.min(1, s)) * 100)}% ${Math.round(Math.max(0, Math.min(1, l)) * 100)}%)`;
// One type as a pixel icon. Shiny swaps to an alternate palette and adds sparkles, like a shiny's alternate colors.
function typeIcon(type, shiny) {
  const g = TYPE_GLYPH[type] || TYPE_GLYPH.normal;
  const [h0, s, l] = hexToHsl(TYPE_COLOR[type] || '#9FA19F');
  const h = h0 + (shiny ? 180 : 0), sat = shiny ? Math.max(0.55, s) : s;
  const pal = { x: hsl(h, sat, Math.min(0.6, Math.max(0.42, l))), o: hsl(h, Math.min(0.6, sat), 0.2), h: hsl(h, sat, Math.min(0.88, Math.max(l, 0.5) + 0.25)) };
  const rects = [];
  g.forEach((row, y) => [...row.padEnd(12, '.').slice(0, 12)].forEach((c, x) => { if (pal[c]) rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[c]}"/>`); }));
  if (shiny) [[-1, -1], [12, 0], [-1, 11]].forEach(([x, y]) => rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="#F5B800"/>`));
  return `<svg viewBox="-1.5 -1.5 15 15" shape-rendering="crispEdges" role="img" aria-label="${esc(type)}${shiny ? ', shiny' : ''}"><title>${esc(type)}${shiny ? ' (shiny)' : ''}</title>${rects.join('')}</svg>`;
}
// The crest: one icon per type, primary first
function crestSVG(id, types, shiny) { return (types && types.length ? types : ['normal']).slice(0, 2).map((t) => typeIcon(t, shiny)).join(''); }
function crestFor(e) { return crestSVG(e.id, e.types || [], e.shiny); }

/* ======================= FORMATS ======================= */
function renderFormatBar() {
  const fl = S.info.formats;
  // Front buttons: what's live in GO Battle League right now. Everything else is in the menu.
  const live = S.info.live && S.info.live.now ? S.info.live.now.formats : LEAGUES.map((l) => ({ key: l.key, label: l.short }));
  const liveKeys = new Set(live.map((f) => f.key));
  $('#leagueSeg').innerHTML = live.map((f) => `<button type="button" data-f="${f.key}" aria-pressed="${S.f === f.key}" title="${esc((fl.find((x) => x.key === f.key) || {}).title || f.label)}">${esc(f.label)}</button>`).join('');
  const rest = fl.filter((f) => !liveKeys.has(f.key));
  const groups = [['Leagues', rest.filter((f) => f.kind === 'league')], ...['Little', 'Great', 'Ultra', 'Master'].map((g) => [g === 'Little' ? 'Little Cup (500 CP)' : `${g} League cups`, rest.filter((c) => c.kind === 'cup' && c.league === g)])].filter(([, c]) => c.length);
  $('#cupSel').innerHTML = `<option value="">More leagues and cups (${rest.length})</option>` + groups.map(([g, c]) => `<optgroup label="${g}">${c.map((x) => `<option value="${x.key}" ${x.key === S.f ? 'selected' : ''}>${esc(x.title)}${x.built ? '' : ' (not set up)'}</option>`).join('')}</optgroup>`).join('');
  $('#cupSel').classList.toggle('on', !liveKeys.has(S.f));
  const L = S.info.live;
  $('#fmtLabel').textContent = L && L.now ? 'Live now' : 'League';
  $('#fmtLabel').title = L && L.now ? `GO Battle League ${L.season ? `(${L.season}) ` : ''}until ${new Date(L.now.end).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${L.next ? `. Next: ${L.next.formats.map((f) => f.label).join(', ')}` : ''}` : '';
  const until = L && L.now && liveKeys.has(S.f) ? ` · in GO Battle League until ${new Date(L.now.end).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}` : '';
  $('#fmtNote').textContent = S.fmt ? `${S.fmt.cp >= 10000 ? 'No CP cap' : `${fmt(S.fmt.cp)} CP cap`}${S.fmt.built ? ` · ${fmt(S.fmt.nTeams)} teams graded` : ' · not set up yet'}${until}` : '';
  const can = !!(S.fmt && S.fmt.anti);
  $('#antiBtn').setAttribute('aria-pressed', S.anti && can);
  $('#antiBtn').title = can ? `Rank ${title()} teams by how they do against its ${S.fmt.anti.field} strongest teams` : `Set up ${title()} to use Anti-Meta`;
  document.documentElement.dataset.mode = S.anti && can ? 'anti' : '';
  syncLedes();
}
function syncLedes() {
  const t = title(), anti = S.anti && S.fmt && S.fmt.anti;
  $('#findTitle').textContent = anti ? 'Anti-Meta Teams' : 'FAINTR Teams';
  $('#findLede').textContent = anti
    ? `Teams built to beat the ${t} meta: every team ranked by the share of 3v3 games it wins against the ${S.fmt.anti.field} strongest varied teams, with each one leading three ways. The top ${S.fmt.anti.verified} are re-played on PvPoke's engine.`
    : `Every ${t} team from PvPoke's top 150, graded and ranked. Tell us what matters and what you own, and we'll sort the rest.`;
}
$('#antiBtn').addEventListener('click', () => {
  if (needPremium()) return;
  if (!S.fmt || !S.fmt.anti) { showToast(`${title()} isn't set up yet. Open Teams to set it up, then try Anti-Meta.`); return; }
  S.anti = !S.anti; store.set('faintr.anti', S.anti ? '1' : '');
  renderFormatBar(); S.limit = 50; if (!$('#view-find').classList.contains('on')) showView('find'); runQuery();
});
$('#leagueSeg').addEventListener('click', (e) => { const b = e.target.closest('button[data-f]'); if (b) setFormat(b.dataset.f); });
$('#cupSel').addEventListener('change', (e) => { if (e.target.value) setFormat(e.target.value); });

async function setFormat(key, quiet) {
  if (key === S.f && S.fmt && !quiet) return;
  S.f = key; store.set('faintr.format', key);
  S.fmt = await api('/api/format', undefined); S._cat = null;
  renderFormatBar();
  const t = title();
  $('#gradeLede').textContent = `Pick three Pokémon, their moves and your IVs, or load them from your Roster. We battle each one against every ${t} Pokémon at 0, 1 and 2 shields, then show you what the team does well, what beats it, and how to play it.`;
  const pool = new Set(S.fmt.pool.map((p) => p.id));
  S.include = S.include.filter((p) => pool.has(p.id)); S.exclude = S.exclude.filter((p) => pool.has(p.id));
  renderChips('include'); renderChips('exclude');
  CF.opp = CF.opp.filter((p) => catalogById().has(p.id)); renderChips('opp'); $('#cfResult').innerHTML = '';
  if (!quiet) {
    slots.forEach((s) => s.reformat()); bs.forEach((b) => b.ed.reformat());
    if (lastReport) { $('#gradeResult').innerHTML = `<div class="empty">Switched to ${esc(t)}. Grade the team again to see how it does here.</div>`; lastReport = null; $('#saveBtn').disabled = true; }
    $('#battleResult').innerHTML = '';
  }
  META = null; if ($('#view-meta').classList.contains('on')) loadMeta();
  ownedNote(); renderRoster();
  S.limit = 50; runQuery();
}

// First-time setup for a cup: builds its team data on this computer
async function startBuild() {
  try { const r = await api('/api/format/build', {}); if (WEB) showToast(r.message || 'Build started.'); } catch (e) { $('#gradeStatus').textContent = e.message; if (WEB) showToast(e.message); }
  pollStatus();
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-build]')) { showView('find'); startBuild(); } });
function buildPanel(b) {
  const t = esc(title());
  if (WEB) {
    const admin = window.FAINTR_BRIDGE.webInfo().admin;
    return `<div class="empty buildbox"><h3>${t} teams are on their way</h3>
      <p>FAINTR grades every team for this cup on its servers overnight. It will show up here after the next nightly update (midnight Central time).</p>
      <p class="note">Matchups, Meta, PvP IVs and your Roster already work for ${t}.</p>
      ${admin ? `<button class="btn primary" type="button" data-build>Build ${t} now (admin)</button>` : ''}</div>`;
  }
  if (b && b.running) {
    return `<div class="empty buildbox"><h3>Setting up ${t}</h3><p>${esc(b.message || 'Working')}. This takes a minute or two. Everything else in FAINTR keeps working meanwhile.</p>
      <progress value="${b.i || 0}" max="${b.n || 1}"></progress></div>`;
  }
  return `<div class="empty buildbox"><h3>${t} isn't set up yet</h3>
    <p>FAINTR grades every team from this cup's top 150 on your computer, the same way it does for the leagues. It takes a minute or two, once. After that it updates along with the rest of your data.</p>
    ${b && b.stage === 'error' ? `<p class="note">${esc(b.message)}</p>` : ''}
    <p class="note">Matchups, Meta and your Roster already work for ${t}.</p>
    <button class="btn primary" type="button" data-build>Set up ${t}</button></div>`;
}

/* ======================= FIND TEAMS ======================= */
let qTimer = null, qSeq = 0;
const scheduleQuery = () => { clearTimeout(qTimer); qTimer = setTimeout(runQuery, 180); };
function ownedList() {
  if (!S.ownedOnly) return null;
  const pool = new Set(S.fmt.pool.map((p) => p.id));
  return [...rosterIds()].filter((id) => pool.has(id));
}
function ownedNote() {
  const box = $('#ownedOnly');
  if (!S.roster.length) { box.checked = false; box.disabled = true; S.ownedOnly = false; $('#ownedNote').innerHTML = 'Add Pokémon in the <a href="#" data-goto="roster">Roster</a> tab to see the best teams you can build today.'; return; }
  box.disabled = false;
  if (!S.fmt.built) { $('#ownedNote').textContent = ''; return; }
  const pool = new Set(S.fmt.pool.map((p) => p.id));
  const n = [...rosterIds()].filter((id) => pool.has(id)).length;
  $('#ownedNote').textContent = `${n} of your ${S.roster.length} Pokémon ${n === 1 ? 'is' : 'are'} in ${title()}'s top 150.`;
}
$('#ownedOnly').addEventListener('change', (e) => { S.ownedOnly = e.target.checked; store.set('faintr.ownedOnly', S.ownedOnly ? '1' : ''); S.limit = 50; runQuery(); });
document.addEventListener('click', (e) => { const a = e.target.closest('[data-goto]'); if (a) { e.preventDefault(); showView(a.dataset.goto); } });

async function runQuery() {
  const seq = ++qSeq;
  if (!S.fmt.built) {
    $('#matched').textContent = ''; $('#moreBtn').hidden = true; $('#tierLegend').hidden = true;
    const st = await api('/api/status', undefined, { noF: true }).catch(() => null);
    if (seq === qSeq) $('#teams').innerHTML = buildPanel(st && st.builds[S.f]);
    return;
  }
  $('#matched').textContent = 'Searching…'; $('#tierLegend').hidden = false;
  const owned = ownedList();
  const anti = S.anti && S.fmt.anti;
  $('#tierLegend').hidden = !!anti;
  const body = { include: S.include.map((p) => p.id), exclude: S.exclude.map((p) => p.id), owned, minGrades: S.mins, weights: S.weights, limit: S.limit, mode: anti ? 'anti' : undefined,
    maxShadow: S.maxShadow === '' ? undefined : parseInt(S.maxShadow, 10) };
  try {
    const r = await api('/api/query', body);
    if (seq !== qSeq) return;
    $('#matched').textContent = r.matched ? (anti ? `${fmt(r.matched)} anti-meta teams${owned ? ' from your Roster' : ''}, best first` : owned ? `Best teams from your Roster: ${fmt(r.matched)}` : `${fmt(r.matched)} ${title()} teams match`) : 'No teams match';
    renderTeams(r.teams, owned);
    $('#moreBtn').hidden = !(r.matched > r.teams.length && S.limit < 500);
  } catch (e) { $('#matched').textContent = e.message; if (e.needsBuild) { S.fmt.built = false; runQuery(); } }
}
function renderTeams(teams, owned) {
  const el = $('#teams');
  if (!teams.length) {
    el.innerHTML = `<div class="empty">${owned ? `No team of three from your Roster clears every filter in ${esc(title())}. You need at least three different Pokémon from its top 150; lower a minimum grade or add more to your Roster.` : 'No team clears every filter. Lower a minimum grade or drop a must-include.'}</div>`;
    return;
  }
  el.innerHTML = teams.map((t, n) => `<article class="team panel" data-i="${t.i}">
      <button class="head" type="button" aria-expanded="false"><span class="rank">${n + 1}</span>
        <span class="members">${t.members.map((m, k) => monCell(m, t.roles[k])).join('')}</span>${card(t.grades)}
        ${S.anti && S.fmt.anti ? antiBadge(t.anti) : scoreBadge(t.composite, t.tier)}</button>
      <div class="quick" hidden></div></article>`).join('');
}
// Anti-Meta score: share of games won against the meta field, on the same five-step color scale
function antiTier(w) { return w >= 80 ? 'elite' : w >= 70 ? 'excellent' : w >= 60 ? 'strong' : w >= 50 ? 'good' : 'fair'; }
function antiBadge(a) {
  return `<span class="score" title="${a.verified ? "Re-played on PvPoke's engine" : 'FAINTR 3v3 model'}: wins ${a.win.toFixed(0)}% of games against the meta field"><b class="tb t-${antiTier(a.win)}">${a.win.toFixed(0)}%</b><span>${a.verified ? 'won · verified' : 'won vs meta'}</span></span>`;
}
// Games won against each team in the meta field, as a compact grid
function fieldHTML(f, limit) {
  if (!f) return '';
  const list = f.teams.map((t, k) => ({ ...t, k })).sort((a, b) => a.wins - b.wins);
  const total = f.teams.reduce((s, t) => s + t.wins, 0), games = f.teams.length * 3;
  const show = limit ? list.slice(0, limit) : list;
  return `<p class="note" style="margin:0 0 6px">Won ${total} of ${games} games (${(total / games * 100).toFixed(0)}%) against the ${f.teams.length} strongest ${esc(title())} teams, three games each with every lead${f.verified ? ", re-played on PvPoke's engine" : ''}. ${limit ? 'Hardest first:' : ''}</p>
    <div class="fieldgrid">${show.map((t) => `<div class="fg w${t.wins}" title="${t.wins} of 3 games won"><b>${t.wins}/3</b><span>${t.names.map(esc).join(', ')}</span></div>`).join('')}</div>`;
}
function quickHTML(d) {
  const rows = d.detail.threats.map((t) => `<tr><td>${esc(t.name)}</td>${t.vs.map((v) => { const my = 1000 - v.avg; return `<td class="n ${cls(my)}" title="Your rating at 0 shields ${1000 - v.r0}, 1 shield ${1000 - v.r1}, 2 shields ${1000 - v.r2}">${my}</td>`; }).join('')}</tr>`).join('');
  return `<div><h4>Top threats and who answers them</h4><p class="hint">Your battle rating against PvPoke's six top threats (average of 0 and 1 shields). Over 500 is a win.</p>
      <table class="t"><thead><tr><th>Threat</th>${d.members.map((m) => `<th class="n">${esc(m.name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
      <p class="note" style="margin-top:10px">${d.detail.blind.length ? `Beat all three at 1 shield: ${d.detail.blind.map(esc).join(', ')}.` : 'No top-100 meta Pokémon beats all three at 1 shield.'}</p>
      ${d.field ? `<h4 style="margin-top:14px">Against the meta</h4>${fieldHTML(d.field, 6)}` : ''}</div>
    <div><h4>Next steps</h4>
      <div class="actions" style="margin-top:0"><button class="btn primary fullBtn" type="button">Open full report</button>
        <button class="btn swapBtn" type="button">Find the best swap</button><a class="btn" href="${d.pvpoke}" target="_blank" rel="noopener">Open on pvpoke.com</a></div>
      <div class="swaps" style="margin-top:10px;font-size:14px"></div></div>`;
}
$('#teams').addEventListener('click', async (e) => {
  const art = e.target.closest('.team'); if (!art) return;
  const q = $('.quick', art);
  if (e.target.closest('.head')) {
    const open = q.hidden; q.hidden = !open; $('.head', art).setAttribute('aria-expanded', open);
    if (open && !q._d) {
      q.innerHTML = '<span class="note"><span class="spin"></span> Loading</span>';
      try { q._d = await api('/api/team?i=' + art.dataset.i); q.innerHTML = quickHTML(q._d); } catch (err) { q.innerHTML = `<p class="note">${esc(err.message)}</p>`; }
    }
    return;
  }
  if (e.target.classList.contains('fullBtn')) { loadIntoGrader(q._d.input.map((m) => withRoster(m))); showView('grade'); runGrade(); }
  if (e.target.classList.contains('swapBtn')) {
    const b = e.target; b.disabled = true;
    try {
      const r = await api('/api/swap', { memberIdx: q._d.memberIdx, weights: S.weights });
      const good = r.swaps.filter((s) => s.delta > 0.05);
      $('.swaps', q).innerHTML = good.length ? `<ul class="tight">${good.map((s) => `<li>Swap ${esc(s.out)} for <b>${esc(s.in)}</b>: overall +${s.delta.toFixed(1)}</li>`).join('')}</ul>`
        : '<p class="note">No single swap from the top 150 raises the overall score. This team is a local best.</p>';
    } finally { b.disabled = false; }
  }
});
// When a team member is in your Roster, grade it with your real IVs and moves
function withRoster(m) {
  const own = S.roster.filter((e) => e.id === m.id);
  if (!own.length) return m;
  const lg = S.fmt.cp;
  const best = own.slice().sort((a, b) => rankIn(a, lg) - rankIn(b, lg))[0];
  return { id: m.id, moveset: best.moveset && best.moveset.length ? best.moveset : m.moveset, ivs: best.ivs, levelCap: best.levelCap };
}
$('#moreBtn').addEventListener('click', () => { S.limit = Math.min(500, S.limit + 50); runQuery(); });
function renderChips(list) {
  const el = $('#chips-' + list); if (!el) return;
  const src = list === 'opp' ? CF.opp : S[list];
  el.innerHTML = src.map((p, i) => `<span class="chip">${esc(p.name)}<button type="button" aria-label="Remove ${esc(p.name)}" data-list="${list}" data-i="${i}">×</button></span>`).join('');
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('.chip button[data-list]'); if (!b) return;
  if (b.dataset.list === 'opp') { CF.opp.splice(+b.dataset.i, 1); renderChips('opp'); return; }
  S[b.dataset.list].splice(+b.dataset.i, 1); renderChips(b.dataset.list); scheduleQuery();
});
function buildFilters() {
  $('#mins').innerHTML = KEYS.map((k) => `<div class="row2"><span title="${esc(G[k].desc)}">${esc(G[k].label)}</span><select data-k="${k}" aria-label="Minimum ${esc(G[k].label)}"><option value="any">Any</option><option>A</option><option>B</option><option>C</option><option>D</option></select></div>`).join('');
  const wRow = (k) => `<label class="weight"><span title="${esc(G[k].desc)}">${esc(G[k].label)}</span><input type="range" min="0" max="5" step="1" data-k="${k}"><output></output></label>`;
  $('#weights').innerHTML = '<div class="group-label">PvPoke grades</div>' + KEYS.filter((k) => G[k].pvpoke).map(wRow).join('') + '<div class="group-label">FAINTR team checks</div>' + KEYS.filter((k) => !G[k].pvpoke).map(wRow).join('');
  $('#howlist').innerHTML = KEYS.map((k) => `<dt>${esc(G[k].label)}${G[k].pvpoke ? '' : ' (FAINTR)'}</dt><dd>${esc(G[k].desc)}</dd>`).join('');
  $('#tierLegend').innerHTML = '<span class="note">Overall:</span>' + S.info.tiers.map((t) => `<span class="tb sm t-${t.key}">${esc(t.label)}</span>`).join('');
  $('#gradeKey').innerHTML = [['A', 'PvPoke: 90% of goal or better. Checks: best 10% of teams'], ['B', '80–90% of goal · next 20%'], ['C', '70–80% · next 30%'], ['D', '60–70% · next 25%'], ['F', 'Under 60% · bottom 15%']]
    .map(([l, t]) => `<span class="gk"><span class="L sm ${l}">${l}</span>${t}</span>`).join('');
  syncFilters();
}
function syncFilters() {
  $$('#mins select').forEach((s) => { s.value = S.mins[s.dataset.k] || 'any'; });
  $$('#weights input').forEach((r) => { r.value = S.weights[r.dataset.k]; r.nextElementSibling.textContent = r.value; });
  $('#maxShadow').value = S.maxShadow; renderChips('include'); renderChips('exclude');
}
$('#mins').addEventListener('change', (e) => { S.mins[e.target.dataset.k] = e.target.value; scheduleQuery(); });
$('#weights').addEventListener('input', (e) => { if (!e.target.dataset.k) return; S.weights[e.target.dataset.k] = +e.target.value; e.target.nextElementSibling.textContent = e.target.value; scheduleQuery(); });
$('#maxShadow').addEventListener('change', (e) => { S.maxShadow = e.target.value; scheduleQuery(); });
$('#resetBtn').addEventListener('click', () => { S.include = []; S.exclude = []; S.mins = {}; S.maxShadow = ''; S.weights = { ...S.info.weights }; S.limit = 50; syncFilters(); runQuery(); });

/* ======================= POKEMON EDITOR (grader + battle) ======================= */
// A reusable block: Roster shortcut, search, moves, IVs with live IV rank.
function monEditor(el, opts = {}) {
  const st = { p: null, iv: null, ivMode: 'default' };
  el.innerHTML = `<div class="pickrow"><div class="picker"><input type="text" placeholder="Search Pokémon" aria-label="${esc(opts.label || 'Pokémon')}"><div class="suggest" hidden></div></div>
    <select class="fromRoster" aria-label="Load from your Roster" title="Load one of your saved Pokémon"></select></div>
    <div class="picked note">None picked yet.</div>
    <label class="field">Fast move</label><select data-m="0" disabled></select>
    <label class="field">Charged move 1</label><select data-m="1" disabled></select>
    <label class="field">Charged move 2</label><select data-m="2" disabled></select>
    <div class="ivbox"><div class="ivrow">
      <label>Attack<input type="number" min="0" max="15" data-iv="atk" disabled></label>
      <label>Defense<input type="number" min="0" max="15" data-iv="def" disabled></label>
      <label>HP<input type="number" min="0" max="15" data-iv="hp" disabled></label>
      <label>Max level<select data-cap disabled><option value="50">50</option><option value="51">51 (best buddy)</option><option value="40">40</option><option value="41">41 (best buddy)</option></select></label></div>
      <div class="presets"><button class="btn small" type="button" data-preset="default" disabled>PvPoke default IVs</button><button class="btn small" type="button" data-preset="rank1" disabled>Rank 1 IVs</button></div>
      <div class="ivstats note">Pick a Pokémon to see its level, CP and IV rank.</div></div>`;
  const sels = $$('select[data-m]', el), ivIn = $$('input[data-iv]', el), cap = $('select[data-cap]', el), rsel = $('.fromRoster', el);
  const getIVs = () => ({ atk: +ivIn[0].value, def: +ivIn[1].value, hp: +ivIn[2].value });
  let ivTimer = null, ivSeq = 0;
  function fillRoster() {
    const elig = S.roster.filter((e) => catalogById().has(e.id));
    rsel.innerHTML = `<option value="">${S.roster.length ? (elig.length ? `Roster (${elig.length})` : 'Roster (none fit)') : 'Roster (empty)'}</option>`
      + elig.map((e) => `<option value="${e.uid}">${esc(e.nickname ? `${e.nickname} (${e.name})` : e.name)} · ${e.ivs.atk}/${e.ivs.def}/${e.ivs.hp}${e.cp ? ` · CP ${e.cp}` : ''}</option>`).join('');
    rsel.disabled = !elig.length;
  }
  rsel.addEventListener('change', () => {
    const e = S.roster.find((x) => x.uid === rsel.value); if (!e) return;
    const p = catalogById().get(e.id); if (p) choose(p, { moveset: e.moveset, ivs: e.ivs, levelCap: e.levelCap, label: e.nickname });
    rsel.value = '';
  });
  // Picking goes through opts.beforeSet so the grader can swap slots instead of duplicating a Pokemon
  function choose(p, preset) { if (opts.beforeSet && opts.beforeSet(p, preset)) return; set(p, preset); }
  async function refreshIV() {
    if (!st.p) return;
    const seq = ++ivSeq;
    $('.ivstats', el).innerHTML = '<span class="note"><span class="spin"></span> Updating level, CP and IV rank</span>';
    const body = { id: st.p.id, levelCap: +cap.value, ivs: st.ivMode === 'default' ? null : getIVs() };
    try {
      const iv = await api('/api/iv', body);
      if (seq !== ivSeq) return; // a newer edit is in flight
      st.iv = iv;
      if (st.ivMode === 'default') { ivIn[0].value = iv.ivs.atk; ivIn[1].value = iv.ivs.def; ivIn[2].value = iv.ivs.hp; }
      const q = iv.rank <= 100 ? 'good' : iv.rank <= 600 ? 'mid' : 'low';
      $('.ivstats', el).innerHTML = `<span class="stat ${q}">${iv.rank === 1 ? `IV <b>Rank 1</b> ${STAR}` : `IV rank <b>${fmt(iv.rank)}</b> of ${fmt(iv.count)}`}</span><span class="stat">Stat product <b>${iv.pctOfBest.toFixed(1)}%</b> of rank 1</span>
        <span class="stat">Level <b>${iv.level}</b></span><span class="stat">CP <b>${iv.cp}</b></span>
        <span class="stat" title="Attack, Defense and HP at this level">Atk <b>${iv.stats.atk.toFixed(1)}</b> Def <b>${iv.stats.def.toFixed(1)}</b> HP <b>${iv.stats.hp}</b></span>
        <span class="stat" title="Rank among all IV combos for each stat">Stat ranks <b>${iv.statRanks.atk}</b> / <b>${iv.statRanks.def}</b> / <b>${iv.statRanks.hp}</b></span>
        ${st.ivMode === 'default' ? '<span class="stat">Using PvPoke default IVs</span>' : ''}`;
      if (opts.onChange) opts.onChange();
    } catch (e) { $('.ivstats', el).textContent = e.message; }
  }
  function set(p, preset) {
    st.p = p; st.label = preset && preset.label ? preset.label : '';
    $('.picked', el).innerHTML = `<b>${esc(preset && preset.label ? preset.label : p.name)}</b>${typeDots(p.types)} <span class="note">${preset && preset.label ? esc(p.name) + ', ' : ''}${p.rank < 9999 ? `#${p.rank} in ${esc(title())}` : 'Unranked here'}</span>`;
    const opt = (list, sel, none) => (none ? '<option value="">None</option>' : '') + list.map(([id, name]) => `<option value="${id}" ${id === sel ? 'selected' : ''}>${esc(name)}</option>`).join('');
    const ok = (id, list) => list.some(([x]) => x === id);
    const pm = (preset && preset.moveset) || [];
    const mv = [ok(pm[0], p.fast) ? pm[0] : p.rec[0], ok(pm[1], p.charged) ? pm[1] : p.rec[1], pm.length ? (ok(pm[2], p.charged) ? pm[2] : '') : p.rec[2]];
    sels[0].innerHTML = opt(p.fast, mv[0]); sels[1].innerHTML = opt(p.charged, mv[1]); sels[2].innerHTML = opt(p.charged, mv[2], true);
    [...sels, ...ivIn, cap, ...$$('[data-preset]', el)].forEach((x) => { x.disabled = false; });
    cap.value = String((preset && preset.levelCap) || 50);
    if (preset && preset.ivs) { st.ivMode = 'custom'; ivIn[0].value = preset.ivs.atk; ivIn[1].value = preset.ivs.def; ivIn[2].value = preset.ivs.hp; } else st.ivMode = 'default';
    refreshIV();
  }
  picker($('.picker', el), (p) => choose(p), () => S.fmt.catalog);
  ivIn.forEach((i) => i.addEventListener('input', () => {
    const v = parseInt(i.value, 10); if (!(v >= 0 && v <= 15)) return;
    st.ivMode = 'custom'; ++ivSeq; clearTimeout(ivTimer); ivTimer = setTimeout(refreshIV, 250);
  }));
  cap.addEventListener('change', refreshIV);
  sels.forEach((s) => s.addEventListener('change', () => opts.onChange && opts.onChange()));
  $$('[data-preset]', el).forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.preset === 'default') { st.ivMode = 'default'; refreshIV(); return; }
    if (st.iv && st.iv.rank1) { const r = st.iv.rank1; ivIn[0].value = r.atk; ivIn[1].value = r.def; ivIn[2].value = r.hp; st.ivMode = 'custom'; refreshIV(); }
  }));
  fillRoster();
  const api_ = {
    st, set, fillRoster,
    clear() { Object.assign(api_, monEditor(el, opts)); },
    value() {
      if (!st.p) return null;
      return { id: st.p.id, moveset: sels.map((s) => s.value).filter(Boolean), ivs: st.ivMode === 'default' ? null : getIVs(), levelCap: +cap.value, label: st.label };
    },
    // League or cup changed: keep the pick if it's eligible, otherwise clear with a note
    reformat() {
      fillRoster();
      if (!st.p) { $('.picker input', el).placeholder = `Search ${title()} Pokémon`; return; }
      const v = api_.value(), p = catalogById().get(v.id), name = st.p.name;
      if (p) set(p, { moveset: v.moveset, ivs: v.ivs, levelCap: v.levelCap });
      else { api_.clear(); $('.picked', el).textContent = `${name} isn't eligible for ${title()}.`; }
    },
  };
  $('.picker input', el).placeholder = `Search ${title()} Pokémon`;
  return api_;
}

/* ======================= TEAM GRADER ======================= */
const slots = [];
let lastReport = null;
function buildSlots() {
  $('#slots').innerHTML = ROLES.map((r, i) => `<div class="slot panel" data-s="${i}"><div class="slothead"><h3>${r}</h3>
      <span class="slotmove">${i > 0 ? `<button type="button" class="btn small quiet" data-move="${i}" data-dir="-1" title="Swap with ${ROLES[i - 1]}" aria-label="Swap with ${ROLES[i - 1]}">◀</button>` : ''}${i < 2 ? `<button type="button" class="btn small quiet" data-move="${i}" data-dir="1" title="Swap with ${ROLES[i + 1]}" aria-label="Swap with ${ROLES[i + 1]}">▶</button>` : ''}</span></div><div class="ed"></div></div>`).join('');
  $$('#slots .slot').forEach((el, i) => {
    slots[i] = monEditor($('.ed', el), { label: ROLES[i], onChange: () => { const v = slots[i].value(); if (v) api('/api/prefetch', v).catch(() => {}); },
      // Picking a Pokemon that's already in another slot swaps the two slots
      beforeSet: (p, preset) => {
        const j = slots.findIndex((sl, k) => k !== i && sl.value() && sl.value().id === p.id);
        if (j < 0) return false;
        swapSlots(i, j, preset);
        $('#gradeStatus').textContent = `Swapped ${ROLES[i]} and ${ROLES[j]}.`;
        return true;
      } });
  });
}
// Exchange two slots, keeping each Pokemon's moves, IVs and level cap. preset overrides what lands in slot i.
function swapSlots(i, j, preset) {
  const a = slots[i].value(), b = slots[j].value();
  if (b) slots[i].set(catalogById().get(b.id), preset ? { ...b, ...preset, moveset: preset.moveset && preset.moveset.length ? preset.moveset : b.moveset } : b); else slots[i].clear();
  if (a) slots[j].set(catalogById().get(a.id), a); else slots[j].clear();
  if (lastReport) $('#gradeStatus').textContent = 'Order changed. Grade again to update the report.';
}
$('#slots').addEventListener('click', (e) => {
  const b = e.target.closest('[data-move]'); if (!b) return;
  const i = +b.dataset.move, j = i + +b.dataset.dir;
  swapSlots(i, j);
});
function loadIntoGrader(members) {
  members.forEach((m, i) => { const p = catalogById().get(m.id); if (p) slots[i].set(p, m); });
}
const GRADER_EMPTY = '<div class="empty">No team yet. Pick a lead and we\'ll find the rest.</div>';
$('#clearBtn').addEventListener('click', () => { buildSlots(); $('#gradeResult').innerHTML = GRADER_EMPTY; $('#saveBtn').disabled = true; lastReport = null; $('#gradeStatus').textContent = ''; });
$('#gradeBtn').addEventListener('click', runGrade);
const needsBuildMsg = () => `${esc(title())} isn't set up yet. <button class="btn small" type="button" data-build>Set it up</button>`;
// Find the rest: complete a partial team with the best match from FAINTR Teams (respects the Roster filter)
$('#fillBtn').addEventListener('click', async () => {
  const picked = slots.map((sl) => sl.value()).filter(Boolean);
  if (!picked.length) { $('#gradeStatus').textContent = 'Pick at least one Pokémon first, then we\'ll find the rest.'; return; }
  if (picked.length === 3) { $('#gradeStatus').textContent = 'Your team is already full. Clear a slot to find a replacement.'; return; }
  if (!S.fmt.built) { $('#gradeStatus').innerHTML = needsBuildMsg(); return; }
  const poolIds = new Set(S.fmt.pool.map((p) => p.id));
  const outside = picked.filter((m) => !poolIds.has(m.id));
  if (outside.length) { $('#gradeStatus').textContent = `Find the rest works from ${title()}'s top 150, and ${catalogById().get(outside[0].id).name} isn't in it. Pick the other slots yourself.`; return; }
  $('#gradeStatus').innerHTML = '<span class="spin"></span> Finding the best teammates';
  try {
    const owned = ownedList();
    const r = await api('/api/query', { include: picked.map((m) => m.id), owned: owned ? [...new Set([...owned, ...picked.map((m) => m.id)])] : null, weights: S.weights, limit: 1 });
    if (!r.teams.length) { $('#gradeStatus').textContent = owned ? 'No team from your Roster fits those picks. Add more to your Roster or turn off "Only Pokémon in my Roster" on the Teams tab.' : 'No team fits those picks.'; return; }
    const mine = new Map(picked.map((m) => [m.id, m]));
    r.teams[0].members.forEach((m, i) => slots[i].set(catalogById().get(m.id), mine.get(m.id) || withRoster({ id: m.id })));
    $('#gradeStatus').textContent = '';
    runGrade();
  } catch (e) { $('#gradeStatus').innerHTML = e.needsBuild ? needsBuildMsg() : esc(e.message); }
});
async function runGrade() {
  const members = slots.map((s) => s.value());
  if (members.some((m) => !m)) { $('#gradeStatus').textContent = 'Pick a Pokémon for all three slots first.'; return; }
  if (!S.fmt.built) { $('#gradeStatus').innerHTML = needsBuildMsg(); return; }
  $('#gradeBtn').disabled = true;
  $('#gradeStatus').innerHTML = `<span class="spin"></span> Battling every ${esc(title())} Pokémon at 0, 1 and 2 shields`;
  try {
    const d = await api('/api/report', { members, weights: S.weights });
    lastReport = d;
    $('#gradeStatus').textContent = '';
    renderReport(d);
    $('#saveBtn').disabled = false;
  } catch (e) { $('#gradeStatus').innerHTML = e.needsBuild ? needsBuildMsg() : esc(e.message); }
  $('#gradeBtn').disabled = false;
}
$('#saveBtn').addEventListener('click', async () => {
  if (needPremium()) return;
  if (!lastReport) return;
  const name = prompt('Name this team', lastReport.members.map((m) => m.name.replace(/\s*\(.*\)/, '')).join(' / '));
  if (name === null) return;
  try { await api('/api/saved', { team: { name, members: lastReport.input, f: lastReport.f } }); $('#gradeStatus').textContent = `Saved "${name}" to My Teams.`; } catch (e) { $('#gradeStatus').textContent = e.message; }
});

function checkRank(g) { const p = g.q * 100; return p >= 99.5 ? `As good as the best ${title()} teams.` : `Better than ${Math.floor(p)}% of ${title()} teams.`; }
const MEANING = {
  coverage: (m) => `PvPoke's six toughest counters average a ${Math.round(m.threatScore)} battle rating against you.`,
  bulk: (m) => `Average Defense × HP of ${fmt(m.bulk)}, against PvPoke's goal of ${fmt(S.fmt.bulkGoal || 22000)} for this league.`,
  safety: (m) => `Members average ${m.safety.toFixed(1)} in PvPoke's Switch rankings, which test coming in behind.`,
  consistency: (m) => `Movesets score ${m.consistency.toFixed(1)} for not depending on baits.`,
  blindSpots: (m) => `${m.blindSpots} of the top 100 beat all three of you at 1 shield.`,
  twoAnswers: (m) => `${m.twoAnswers.toFixed(0)}% of the meta (weighted by rank) has two or more answers on your team.`,
  resilience: (m) => `Your worst shield scenario keeps ${(m.resilience * 100).toFixed(0)}% of your best one's coverage.`,
  sharedWeak: (m) => `${m.sharedWeak} common attack type${m.sharedWeak === 1 ? '' : 's'} hit${m.sharedWeak === 1 ? 's' : ''} two of you super-effectively.`,
  pilot: (m) => `${m.pilot.toFixed(0)}% of top-100 matchups are close or flip with shields.`,
  metaWins: (m) => `Won ${(m.metaWin || 0).toFixed(0)}% of simulated 3v3 games against the strongest teams in this league.`,
};
function renderReport(d) {
  const sub = [['overview', 'Overview'], ['plan', 'Game plan'], ['vsmeta', 'Vs meta teams'], ['matchups', 'Matchups'], ['threats', 'Threats'], ['members', 'Members'], ['ivs', 'IV effects'], ['improve', 'Improve']];
  const t = d.tier || { key: 'fair', label: '' };
  $('#gradeResult').innerHTML = `<article class="panel">
    <div class="verdict"><div class="big"><b class="tb t-${t.key}">${d.composite.toFixed(0)}</b><span>overall out of 100</span>${t.key !== 'fair' ? `<span class="tierlbl">${esc(t.label)} of ${esc(title())} teams</span>` : ''}</div>
      <div class="summary">${d.summary.map((s) => `<p>${esc(s)}</p>`).join('')}</div>${card(d.grades)}</div>
    <div class="members" style="padding:0 20px 14px">${d.members.map((m, k) => monCell(m, ROLES[k])).join('')}</div>
    <div class="subtabs" role="tablist">${sub.map(([k, l], i) => `<button role="tab" data-sub="${k}" aria-selected="${i === 0}">${l}</button>`).join('')}</div>
    ${sub.map(([k], i) => `<div class="subview" data-subview="${k}" ${i ? 'hidden' : ''}></div>`).join('')}</article>`;
  const v = (k) => $(`[data-subview="${k}"]`, $('#gradeResult'));
  // Overview
  v('overview').innerHTML = `<div class="gcards">${KEYS.map((k) => { const g = d.grades[k]; return `<div class="gcard"><span class="L ${g.letter}">${g.letter}</span>
      <div><h4>${esc(G[k].label)}${G[k].pvpoke ? '' : ' <span class="tagline">FAINTR check</span>'}</h4><span class="val">${esc(g.text)}</span></div>
      <div class="meter"><i style="width:${(g.q * 100).toFixed(0)}%"></i></div><p>${esc(MEANING[k](d.metrics))} ${G[k].pvpoke ? '' : esc(checkRank(g))} ${g.letter === 'A' ? '' : `<span class="need">${esc(g.need)}.</span>`}</p></div>`; }).join('')}</div>
    <div class="actions"><a class="btn" href="${d.pvpoke}" target="_blank" rel="noopener">Open on pvpoke.com</a>
      <button class="btn" type="button" id="copySearch">Copy Pokémon GO search string</button><span class="note" id="copyNote"></span></div>`;
  $('#copySearch').addEventListener('click', () => copyText(d.searchString, $('#copyNote')));
  // Vs meta teams
  v('vsmeta').innerHTML = d.field ? `<p class="hint">FAINTR plays your team against each of the ${d.field.teams.length} strongest varied ${esc(title())} teams three times, once against each of their leads. HP and shields carry over; the side losing the lead switches once; a fainted Pokémon is replaced by the best remaining answer. It's a model of a 3v3, not a replay, so read it as how often you should come out ahead.</p>${fieldHTML(d.field)}` : '<p class="note">Not available for this data yet.</p>';
  // Game plan
  const ACT = { stay: () => `Stay in with ${d.members[0].name}`, switch: (p) => `Switch to ${d.members[p.who].name}`, close: (p) => `Close fight; best answer ${d.members[p.who].name}`, tough: (p) => `Hard matchup; ${d.members[p.who].name} loses least` };
  v('plan').innerHTML = `<p class="hint">What to do when the opponent leads with one of the 20 most popular leads in ${esc(title())}. Ratings are at 1 shield each; over 500 means you win.</p>
    <table class="t plan"><thead><tr><th>Opponent lead</th>${d.members.map((m) => `<th class="n">${esc(m.name)}</th>`).join('')}<th>Your play</th></tr></thead>
    <tbody>${d.plan.map((p) => `<tr><td>${esc(p.name)}</td>${p.ratings.map((r) => `<td class="n ${cls(r)}">${r}</td>`).join('')}<td class="act act-${p.action}">${esc(ACT[p.action](p))}</td></tr>`).join('')}</tbody></table>
    <p class="note" style="margin-top:8px">${d.plan.filter((p) => p.action === 'stay').length} of ${d.plan.length} popular leads are wins for ${esc(d.members[0].name)}; ${d.plan.filter((p) => p.action === 'switch').length} more have a clean switch.</p>`;
  // Matchups heat map
  const heat = (s) => `<div class="legendrow"><span>Shields each</span><span class="seg" id="heatSeg">${[0, 1, 2].map((x) => `<button type="button" data-s="${x}" aria-pressed="${x === s}">${x}</button>`).join('')}</span>
      <span><i class="sw" style="background:var(--win)"></i>win</span><span><i class="sw" style="background:var(--close)"></i>close</span><span><i class="sw" style="background:var(--loss)"></i>loss</span></div>
    <div class="scroll"><table class="t"><thead><tr><th>Top 40 meta</th>${d.members.map((m) => `<th class="n">${esc(m.name)}</th>`).join('')}<th class="n">Your best</th></tr></thead>
    <tbody>${d.heat.map((h) => { const r = h.r.map((x) => x[s]); const b = Math.max(...r); return `<tr><td>${esc(h.name)}</td>${r.map((x) => `<td class="n ${cls(x)}">${x}</td>`).join('')}<td class="n ${cls(b)}"><b>${b}</b></td></tr>`; }).join('')}</tbody></table></div>`;
  v('matchups').innerHTML = heat(1);
  v('matchups').addEventListener('click', (e) => { const b = e.target.closest('#heatSeg button'); if (b) v('matchups').innerHTML = heat(+b.dataset.s); });
  // Threats
  v('threats').innerHTML = `<div class="twocol"><div><h3 style="margin:0 0 6px">PvPoke's top threats</h3><p class="hint">The six counters that drive the Coverage grade, and your rating against each (average of 0 and 1 shields).</p>
      <table class="t"><thead><tr><th>Threat</th>${d.members.map((m) => `<th class="n">${esc(m.name)}</th>`).join('')}</tr></thead><tbody>
      ${d.threats.map((x) => `<tr><td>${esc(x.name)}</td>${x.vs.map((y) => { const my = 1000 - y.avg; return `<td class="n ${cls(my)}">${my}</td>`; }).join('')}</tr>`).join('')}</tbody></table>
      <button class="btn small" type="button" id="threatCounters" style="margin-top:10px">Find counters to these threats</button></div>
    <div><h3 style="margin:0 0 6px">Blind spots</h3><p class="note">${d.blind.length ? `These top-100 Pokémon beat all three of you at 1 shield: ${d.blind.map(esc).join(', ')}.` : 'Nothing in the top 100 beats all three of you at 1 shield.'}</p>
      <h3 style="margin:16px 0 6px">Shared weaknesses</h3><p class="note">${d.sharedTypes.length ? `${d.sharedTypes.map((x) => `<span style="color:${TYPE_COLOR[x]};font-weight:600">${x}</span>`).join(', ')} moves are super-effective on two or more of your team, and the top 50 use them.` : 'No common meta attack type is super-effective on two of you.'}</p></div></div>`;
  $('#threatCounters').addEventListener('click', () => {
    const byName = new Map(S.fmt.catalog.map((c) => [c.name, c]));
    CF.opp = d.threats.slice(0, 3).map((x) => byName.get(x.name)).filter(Boolean);
    renderChips('opp'); showView('battle'); setMode('counters'); runCounters();
  });
  // Members
  v('members').innerHTML = `<div class="mcards">${d.memberCards.map((m, k) => `<div class="mcard"><div class="note">${ROLES[k]}</div><h4>${esc(m.name)}${typeDots(m.types)}</h4>
      <div class="note">${esc(m.moves.join(', '))}</div>
      <dl class="kv"><dt>IVs</dt><dd>${m.iv.ivs.atk} / ${m.iv.ivs.def} / ${m.iv.ivs.hp}, level ${m.iv.level}, CP ${m.iv.cp}</dd>
        <dt>IV rank</dt><dd>${rankText(m.iv.rank, m.iv.count)} (${m.iv.pctOfBest.toFixed(1)}% of rank 1)</dd>
        <dt>Stats</dt><dd>Atk ${m.stats.atk.toFixed(1)}, Def ${m.stats.def.toFixed(1)}, HP ${m.stats.hp}</dd>
        <dt>Weak to</dt><dd>${m.weak.map((x) => `<span style="color:${TYPE_COLOR[x]}">${x}</span>`).join(', ') || 'nothing'}</dd></dl>
      <div class="note">Wins against the top ${m.of} at 0, 1 and 2 shields</div>
      ${m.wins.map((w, s) => `<div style="display:grid;grid-template-columns:62px 1fr 34px;gap:8px;align-items:center;font-size:13px"><span>${s} shield${s === 1 ? '' : 's'}</span><div class="bar"><i style="width:${(w / m.of * 100).toFixed(0)}%"></i></div><b>${w}</b></div>`).join('')}
      <dl class="kv"><dt>PvPoke roles</dt><dd>Lead ${m.roles.lead}, Switch ${m.roles.switch}, Closer ${m.roles.closer}</dd></dl>
      <div class="note">Best matchups</div><ul class="tight">${m.best.map((x) => `<li>${esc(x.name)} <span class="note">${x.r}</span></li>`).join('')}</ul>
      <div class="note">Worst matchups</div><ul class="tight">${m.worst.map((x) => `<li>${esc(x.name)} <span class="note">${x.r}</span></li>`).join('')}</ul>
      <div class="note">Only this member beats</div><p style="margin:2px 0;font-size:13.5px">${m.unique.length ? m.unique.map(esc).join(', ') : 'Nothing the others don’t also beat.'}</p></div>`).join('')}</div>`;
  // IV effects
  const flipList = (list, label) => (!list ? '' : !list.length ? `<p class="note">No top-100 matchup changes compared with ${label}.</p>`
    : `<table class="t"><thead><tr><th>Matchup</th><th class="n">Shields</th><th class="n">Yours</th><th class="n">${esc(label)}</th><th>Result</th></tr></thead><tbody>
      ${list.slice(0, 14).map((x) => `<tr><td>${esc(x.name)}</td><td class="n">${x.shields}</td><td class="n ${cls(x.mine)}">${x.mine}</td><td class="n ${cls(x.theirs)}">${x.theirs}</td><td class="${x.gained ? 'gain' : 'lost'}">${x.gained ? 'Gained' : 'Lost'}</td></tr>`).join('')}</tbody></table>
      ${list.length > 14 ? `<p class="note">and ${list.length - 14} more</p>` : ''}`);
  v('ivs').innerHTML = `<p class="hint">Matchups against the top 100 where your IVs change the winner, across 0, 1 and 2 shields. Gained means your IVs win a matchup the other IVs lose; Lost is the reverse.</p>
    <p class="jargon">Most flips come from <b>breakpoints</b> (your Attack is just high enough for a fast move to deal 1 more damage), <b>bulkpoints</b> (your Defense is just high enough to take 1 less), or <b>CMP</b> (when both throw a charged move on the same turn, higher Attack goes first).</p>
    <div class="mcards">${d.ivEffects.map((e, k) => {
      const g1 = e.vsDefault ? e.vsDefault.filter((x) => x.gained).length : 0, l1 = e.vsDefault ? e.vsDefault.length - g1 : 0;
      const g2 = e.vsRank1 ? e.vsRank1.filter((x) => x.gained).length : 0, l2 = e.vsRank1 ? e.vsRank1.length - g2 : 0;
      const iv = d.memberCards[k].iv;
      return `<div class="mcard"><h4>${esc(e.name)}</h4><div class="note">IVs ${iv.ivs.atk} / ${iv.ivs.def} / ${iv.ivs.hp}, ${rankText(iv.rank)}</div>
        ${e.custom ? `<h4 style="font-size:17px;margin:10px 0 4px">Versus PvPoke's default IVs: +${g1} / −${l1}</h4>${flipList(e.vsDefault, 'Default')}` : '<p class="note">Using PvPoke default IVs. Enter your IVs, or load from your Roster, to compare.</p>'}
        ${e.vsRank1 ? `<h4 style="font-size:17px;margin:12px 0 4px">Versus rank 1 IVs: +${g2} / −${l2}</h4>${flipList(e.vsRank1, 'Rank 1')}` : `<p class="note">These are the rank 1 IVs ${STAR}</p>`}</div>`;
    }).join('')}</div>`;
  // Improve
  const good = d.swaps.filter((s) => s.delta > 0.05);
  v('improve').innerHTML = `<p class="hint">The best single replacements from the top 150, keeping the other two in their slots. Overall score now: ${d.composite.toFixed(1)}. A ✓ means it's in your Roster.</p>
    ${good.length ? `<table class="t"><thead><tr><th>Swap out</th><th>Bring in</th><th class="n">Overall</th><th>New grades</th><th></th></tr></thead><tbody>
      ${good.map((s, i) => `<tr><td>${esc(s.out)}</td><td><b>${esc(s.in)}</b>${rosterIds().has(s.inId) ? '<span class="own" title="In your Roster">✓</span>' : ''}<div class="note">${esc(s.inMoves.join(', '))}</div></td><td class="n">+${s.delta.toFixed(1)}</td><td>${card(s.grades)}</td>
        <td><button class="btn small trySwap" type="button" data-i="${i}">Try it</button></td></tr>`).join('')}</tbody></table>`
      : '<p class="note">No single swap from the top 150 raises the overall score. This team is a local best.</p>'}`;
  v('improve').addEventListener('click', (e) => {
    const b = e.target.closest('.trySwap'); if (!b) return;
    const s = good[+b.dataset.i];
    const p = catalogById().get(s.inId); if (!p) return;
    slots[s.slot].set(p, withRoster({ id: s.inId })); window.scrollTo({ top: 0, behavior: 'smooth' }); runGrade();
  });
  $('.subtabs', $('#gradeResult')).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sub]'); if (!b) return;
    $$('.subtabs button', $('#gradeResult')).forEach((x) => x.setAttribute('aria-selected', x === b));
    $$('[data-subview]', $('#gradeResult')).forEach((x) => { x.hidden = x.dataset.subview !== b.dataset.sub; });
  });
}
function showToast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" class="btn small">${esc(action.label)}</button>` : ''}`;
  t.hidden = false;
  if (action) $('button', t).onclick = () => { t.hidden = true; action.run(); };
  clearTimeout(showToast._t); showToast._t = setTimeout(() => { t.hidden = true; }, action ? 8000 : 4000);
}
async function copyText(text, noteEl) {
  try { await navigator.clipboard.writeText(text); noteEl.textContent = `Copied: ${text}`; } catch (e) { noteEl.textContent = text; }
}

/* ======================= FAINTR MATCHUPS ======================= */
function setMode(m) {
  $$('#battleMode button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === m));
  $('#mode-1v1').hidden = m !== '1v1'; $('#mode-counters').hidden = m !== 'counters';
}
$('#battleMode').addEventListener('click', (e) => { const b = e.target.closest('button[data-m]'); if (b) setMode(b.dataset.m); });
// Shield pips (guide 7): two pips, filled = shield available
const SHIELD = '<svg viewBox="0 0 22 26" aria-hidden="true"><path d="M11 1.5 L20 4.6 V11.8 C20 18 15.6 22.4 11 24.5 C6.4 22.4 2 18 2 11.8 V4.6 Z" stroke-width="2"/></svg>';
function renderPips(el) {
  const v = +el.dataset.v;
  el.innerHTML = [1, 2].map((n) => `<button type="button" data-n="${n}" class="${n <= v ? 'full' : 'empty'}" aria-label="${n} shield${n > 1 ? 's' : ''}" aria-pressed="${n <= v}">${SHIELD}</button>`).join('')
    + `<span class="lbl">${v === 0 ? 'No shields' : v === 1 ? '1 shield' : '2 shields'}</span>`;
}
function shieldNote() {
  const a = sideOpts(0).shields, b = sideOpts(1).shields;
  $('#battleStatus').textContent = a === 2 && b === 2 ? 'Two shields each. Use them wisely.' : a === 0 && b === 0 ? 'No shields. Pure damage race.' : '';
}
const bs = [];
function buildBattle() {
  $('#bsides').innerHTML = ['Your Pokémon', 'Opponent'].map((t, i) => `<div class="bside panel" data-b="${i}"><h3>${t}</h3><div class="ed"></div>
    <div class="opts"><span class="note">Shields</span><span class="pips" data-shields data-v="1" role="group" aria-label="Shields for ${t}"></span>
      <label class="check"><input type="checkbox" data-bait checked> Baits shields</label>
      <label class="note">Start energy <input type="number" min="0" max="100" step="1" value="0" data-energy style="width:64px"></label></div></div>`).join('');
  $$('#bsides .bside').forEach((el, i) => {
    bs[i] = { ed: monEditor($('.ed', el), { label: i ? 'Opponent' : 'Your Pokémon' }), el };
    const pipEl = $('[data-shields]', el);
    renderPips(pipEl);
    pipEl.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const n = +b.dataset.n, cur = +pipEl.dataset.v;
      pipEl.dataset.v = cur === n ? n - 1 : n; // tap a filled pip to spend it
      renderPips(pipEl); shieldNote();
    });
  });
}
const sideOpts = (i) => ({ shields: +$('[data-shields]', bs[i].el).dataset.v, bait: $('[data-bait]', bs[i].el).checked, energy: +$('[data-energy]', bs[i].el).value || 0 });
$('#swapSidesBtn').addEventListener('click', () => {
  const a = bs[0].ed.value(), b = bs[1].ed.value();
  if (b) bs[0].ed.set(catalogById().get(b.id), b); if (a) bs[1].ed.set(catalogById().get(a.id), a);
});
$('#battleBtn').addEventListener('click', runBattle);
async function runBattle() {
  const a = bs[0].ed.value(), b = bs[1].ed.value();
  if (!a || !b) { $('#battleStatus').textContent = 'Pick a Pokémon on both sides first.'; return; }
  const oa = sideOpts(0), ob = sideOpts(1);
  $('#battleStatus').innerHTML = '<span class="spin"></span> Battling';
  try {
    const body = { a, b, shieldsA: oa.shields, shieldsB: ob.shields, baitA: oa.bait, baitB: ob.bait, energyA: oa.energy, energyB: ob.energy };
    const r1iv = bs[0].ed.st.iv && bs[0].ed.st.iv.rank1;
    const [r, def, r1] = await Promise.all([
      api('/api/battle', body),
      a.ivs ? api('/api/battle', { ...body, a: { ...a, ivs: null, levelCap: 50 } }) : null,
      r1iv ? api('/api/battle', { ...body, a: { ...a, ivs: { atk: r1iv.atk, def: r1iv.def, hp: r1iv.hp } } }) : null,
    ]);
    $('#battleStatus').textContent = '';
    renderBattle(r, { def, r1 });
  } catch (e) { $('#battleStatus').textContent = e.message; }
}
function hpSeries(r) {
  // Walk the timeline: each attack event's first value is damage dealt to the other side
  const hp = [r.a.stats.hp, r.b.stats.hp];
  const pts = [[{ t: 0, hp: hp[0] }], [{ t: 0, hp: hp[1] }]];
  for (const e of r.timeline) {
    if (!/^(fast|charged)/.test(e.type)) continue;
    const def = 1 - e.actor;
    hp[def] = Math.max(0, hp[def] - (+e.values[0] || 0));
    pts[def].push({ t: e.turn, hp: hp[def] });
  }
  return pts;
}
function timelineSVG(r) {
  const W = 1000, H = 320, padL = 84, padR = 16, lane = [62, 152], hpTop = 214, hpBot = 290;
  const maxT = Math.max(r.turns, ...r.timeline.map((e) => e.turn), 1);
  const x = (t) => padL + (t / maxT) * (W - padL - padR);
  const lx = (t) => Math.max(padL + 44, Math.min(W - padR - 44, x(t)));
  const col = ['var(--fr-red)', 'var(--data-2)'];
  const ev = r.timeline.filter((e) => /^(fast|charged|shield)/.test(e.type));
  const marks = ev.map((e) => {
    const y = lane[e.actor];
    if (e.type.startsWith('fast')) return `<circle cx="${x(e.turn).toFixed(1)}" cy="${y}" r="3.4" fill="${col[e.actor]}"><title>Turn ${e.turn}: ${esc(e.name)}, ${e.values[0]} damage</title></circle>`;
    if (e.type.startsWith('charged')) {
      const tColor = TYPE_COLOR[e.type.split(' ')[1]] || col[e.actor];
      return `<g><rect x="${(x(e.turn) - 7).toFixed(1)}" y="${y - 15}" width="14" height="30" rx="4" fill="${tColor}" stroke="var(--surface)" stroke-width="1.5"><title>Turn ${e.turn}: ${esc(e.name)}, ${e.values[0]} damage</title></rect>
        <text x="${lx(e.turn).toFixed(1)}" y="${y - 22}" font-size="12.5" text-anchor="middle" fill="var(--ink)">${esc(e.name)}</text></g>`;
    }
    // shield: drawn just under the lane of the Pokemon that used it
    return `<path transform="translate(${x(e.turn).toFixed(1)} ${y + 20})" d="M0 0 l9 4 v7 c0 6 -9 10 -9 10 c0 0 -9 -4 -9 -10 v-7 z" fill="var(--muted)"><title>Turn ${e.turn}: shield</title></path>`;
  }).join('');
  const pts = hpSeries(r), maxHp = [r.a.stats.hp, r.b.stats.hp];
  const hy = (hp, side) => hpBot - (hpBot - hpTop) * (hp / maxHp[side]);
  const line = (side) => {
    const p = pts[side]; let d = `M${x(0).toFixed(1)},${hy(p[0].hp, side).toFixed(1)}`;
    for (let i = 1; i < p.length; i++) d += ` H${x(p[i].t).toFixed(1)} V${hy(p[i].hp, side).toFixed(1)}`;
    return `<path d="${d} H${x(maxT).toFixed(1)}" fill="none" stroke="${col[side]}" stroke-width="2.2"/>`;
  };
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Battle timeline">
    <text x="0" y="${lane[0] + 4}" font-size="13.5" fill="var(--ink)" font-weight="600">${esc(r.a.name.slice(0, 11))}</text>
    <text x="0" y="${lane[1] + 4}" font-size="13.5" fill="var(--ink)" font-weight="600">${esc(r.b.name.slice(0, 11))}</text>
    <line x1="${padL}" x2="${W - padR}" y1="${lane[0]}" y2="${lane[0]}" stroke="var(--line)"/><line x1="${padL}" x2="${W - padR}" y1="${lane[1]}" y2="${lane[1]}" stroke="var(--line)"/>
    ${marks}
    <text x="0" y="${hpTop + 4}" font-size="12" fill="var(--muted)">Full HP</text><text x="0" y="${hpBot + 4}" font-size="12" fill="var(--muted)">0 HP</text>
    <line x1="${padL}" x2="${W - padR}" y1="${hpTop}" y2="${hpTop}" stroke="var(--line)" stroke-dasharray="3 4"/><line x1="${padL}" x2="${W - padR}" y1="${hpBot}" y2="${hpBot}" stroke="var(--line)"/>
    ${line(0)}${line(1)}
    <text x="${padL}" y="${H - 8}" font-size="12" fill="var(--muted)">Turn 0</text><text x="${W - padR}" y="${H - 8}" font-size="12" fill="var(--muted)" text-anchor="end">Turn ${maxT}</text></svg>
    <div class="legendrow" style="margin-top:4px"><span><i class="sw" style="background:var(--fr-red)"></i>${esc(r.a.name)} HP</span><span><i class="sw" style="background:var(--data-2)"></i>${esc(r.b.name)} HP</span><span>Gray shield = shield used</span></div>`;
}
function renderBattle(r, alt) {
  const win = r.ratingA > 500, lose = r.ratingA < 500;
  const ivRow = (label, x) => (x ? `<tr><td>${label}</td><td class="n">${x.a.ivs.atk} / ${x.a.ivs.def} / ${x.a.ivs.hp}</td><td class="n ${cls(x.ratingA)}">${x.ratingA}</td><td>${x.ratingA > 500 ? 'Win' : x.ratingA < 500 ? 'Loss' : 'Tie'}, ${x.hpA} HP left</td></tr>` : '');
  const fastLine = (side, other) => { const b = r.breakpoints[side]; return `${esc(r[side].name)}'s ${esc(b.move)} does <b>${b.damage}</b> damage to ${esc(r[other].name)}${b.next ? `. It would do ${b.next.damage} at ${b.next.attack} Attack (you have ${b.attack}).` : '. That is the most it can do with any IVs.'}`; };
  $('#battleResult').innerHTML = `<article class="panel bresult">
    <div class="bhead"><div class="side"><div class="note">Your Pokémon</div><h3 style="margin:2px 0;font-size:24px">${esc(r.a.name)}</h3>
        <div class="rating ${win ? 'w' : lose ? 'l' : ''}">${r.ratingA}</div><div class="note">${r.hpA} of ${r.a.stats.hp} HP left, ${r.energyA} energy</div>
        <div class="hpbar"><i style="width:${(r.hpA / r.a.stats.hp * 100).toFixed(0)}%"></i></div></div>
      <div class="vs">${win ? 'Win' : lose ? 'Loss' : 'Tie'}</div>
      <div class="side r"><div class="note">Opponent</div><h3 style="margin:2px 0;font-size:24px">${esc(r.b.name)}</h3>
        <div class="rating ${r.ratingB > 500 ? 'w' : 'l'}">${r.ratingB}</div><div class="note">${r.hpB} of ${r.b.stats.hp} HP left, ${r.energyB} energy</div>
        <div class="hpbar r"><i style="width:${(r.hpB / r.b.stats.hp * 100).toFixed(0)}%"></i></div></div></div>
    <div class="timeline"><p class="note" style="margin:0 0 4px">${esc(title())}. ${r.shields[0]} vs ${r.shields[1]} shields, ${r.turns} turns. Dots are fast moves and colored bars are charged moves, in the move's type color. The lower chart is HP. Hover any mark for details.</p>${timelineSVG(r)}</div>
    <div class="subview twocol" style="padding-top:0">
      <div><h3 style="margin:0 0 6px">Every shield scenario</h3><p class="hint">Your battle rating with your shields down the side and theirs across.</p>
        <table class="t grid3"><thead><tr><th>You \\ Them</th>${[0, 1, 2].map((j) => `<th class="n">${j}</th>`).join('')}</tr></thead>
        <tbody>${r.grid.map((row, i) => `<tr><th>${i} shield${i === 1 ? '' : 's'}</th>${row.map((v) => `<td class="n ${cls(v)}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table>
        <h3 style="margin:16px 0 6px">IV matchup</h3><p class="hint">This same battle with different IVs on your side. Higher Attack also wins CMP ties: when both Pokémon throw a charged move on the same turn, the higher Attack goes first.</p>
        <table class="t"><thead><tr><th>IVs</th><th class="n">Atk / Def / HP</th><th class="n">Rating</th><th>Result</th></tr></thead><tbody>
          ${ivRow('Yours', r)}${ivRow('PvPoke default', alt.def)}${ivRow('Rank 1', alt.r1)}</tbody></table></div>
      <div><h3 style="margin:0 0 6px">Damage and breakpoints</h3>
        <p class="jargon"><b>Breakpoint:</b> the Attack stat where a fast move deals 1 more damage. <b>Bulkpoint:</b> the Defense stat where an opponent's fast move deals 1 less. Both come from IVs and level.</p><p style="font-size:14px">${fastLine('a', 'b')}</p><p style="font-size:14px">${fastLine('b', 'a')}</p>
        <table class="t"><thead><tr><th>Charged move</th><th class="n">Damage</th><th class="n">Energy</th></tr></thead><tbody>
          ${r.chargedDamage.a.map((m) => `<tr><td>${esc(m.name)} <span class="note">(${esc(r.a.name)})</span></td><td class="n">${m.damage}</td><td class="n">${m.energy}</td></tr>`).join('')}
          ${r.chargedDamage.b.map((m) => `<tr><td>${esc(m.name)} <span class="note">(${esc(r.b.name)})</span></td><td class="n">${m.damage}</td><td class="n">${m.energy}</td></tr>`).join('')}</tbody></table>
        <details style="margin-top:12px"><summary class="note" style="cursor:pointer">Turn-by-turn log</summary><div class="scroll" style="max-height:300px;margin-top:6px"><table class="t"><thead><tr><th class="n">Turn</th><th>Who</th><th>Event</th><th class="n">Damage</th></tr></thead><tbody>
          ${r.timeline.filter((e) => /^(fast|charged|shield|faint)/.test(e.type)).map((e) => `<tr><td class="n">${e.turn}</td><td>${esc(e.actor ? r.b.name : r.a.name)}</td><td>${esc(e.name)}</td><td class="n">${/^(fast|charged)/.test(e.type) ? e.values[0] : ''}</td></tr>`).join('')}</tbody></table></div></details></div></div></article>`;
}
$('#vsMetaBtn').addEventListener('click', async () => {
  const a = bs[0].ed.value();
  if (!a) { $('#battleStatus').textContent = 'Pick a Pokémon on the left side first.'; return; }
  $('#battleStatus').innerHTML = '<span class="spin"></span> Battling the top 100';
  try {
    const r = await api('/api/battle/meta', { a });
    $('#battleStatus').textContent = '';
    let s = 1;
    const render = () => {
      const list = r.list.slice().sort((x, y) => y.r[s] - x.r[s]);
      $('#battleResult').innerHTML = `<article class="panel" style="padding:16px 18px"><h3 style="margin:0 0 4px;font-size:24px">${esc(r.member.name)} against the ${esc(title())} top 100</h3>
        <p class="note">IVs ${r.iv.ivs.atk} / ${r.iv.ivs.def} / ${r.iv.ivs.hp} (${rankText(r.iv.rank)}), level ${r.iv.level}, CP ${r.iv.cp}. Wins: ${r.wins[0]} at 0 shields, ${r.wins[1]} at 1, ${r.wins[2]} at 2.</p>
        <div class="legendrow"><span>Sort by shields</span><span class="seg" id="vmSeg">${[0, 1, 2].map((x) => `<button type="button" data-s="${x}" aria-pressed="${x === s}">${x}</button>`).join('')}</span></div>
        <div class="scroll"><table class="t"><thead><tr><th class="n">Meta rank</th><th>Opponent</th><th class="n">0 shields</th><th class="n">1 shield</th><th class="n">2 shields</th></tr></thead><tbody>
        ${list.map((x) => `<tr><td class="n">${x.rank}</td><td>${esc(x.name)}</td>${x.r.map((v) => `<td class="n ${cls(v)}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div></article>`;
      $('#vmSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { s = +b.dataset.s; render(); } });
    };
    render();
  } catch (e) { $('#battleStatus').textContent = e.message; }
});

/* ---------- Counter finder */
const CF = { opp: [], source: 'pool' };
$('#cfSource').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-s]'); if (!b) return;
  CF.source = b.dataset.s; $$('#cfSource button').forEach((x) => x.setAttribute('aria-pressed', x === b));
  $('#cfHint').textContent = CF.source === 'roster' ? 'Uses your real IVs and moves. Ranked by wins at 1 shield, then average battle rating.' : `Answers from ${title()}'s top 150. Ranked by wins at 1 shield, then average battle rating.`;
});
$('#cfBtn').addEventListener('click', runCounters);
async function runCounters() {
  if (!CF.opp.length) { $('#cfStatus').textContent = 'Pick at least one opponent.'; return; }
  $('#cfStatus').innerHTML = '<span class="spin"></span> Battling';
  try {
    const r = await api('/api/counters', { opponents: CF.opp.map((p) => p.id), source: CF.source });
    $('#cfStatus').textContent = '';
    if (!r.results.length) { $('#cfResult').innerHTML = '<div class="empty">No answers found.</div>'; return; }
    $('#cfResult').innerHTML = `<article class="panel" style="padding:16px 18px;margin-top:14px"><h3 style="margin:0 0 4px">Best answers to ${r.opponents.map((o) => esc(o.name)).join(', ')}</h3>
      <p class="hint">${r.source === 'roster' ? 'From your Roster, with your IVs.' : `From ${esc(title())}'s top meta, with PvPoke default IVs.`} Ratings are at 1 shield each; hover for 0 and 2 shields.</p>
      <div class="scroll"><table class="t"><thead><tr><th class="n">#</th><th>Pokémon</th><th>Moves</th>${r.opponents.map((o) => `<th class="n">vs ${esc(o.name)}</th>`).join('')}<th class="n">Wins at 0 / 1 / 2</th><th></th></tr></thead><tbody>
      ${r.results.map((x, i) => `<tr><td class="n">${i + 1}</td><td><b>${esc(x.name)}</b>${typeDots(x.types)}${x.ivs ? ` <span class="note">${x.ivs.atk}/${x.ivs.def}/${x.ivs.hp}</span>` : rosterIds().has(x.id) ? '<span class="own" title="In your Roster">✓</span>' : ''}</td><td class="note">${esc(x.moves.join(', '))}</td>
        ${x.vs.map((v) => `<td class="n ${cls(v[1])}" title="0 shields ${v[0]}, 1 shield ${v[1]}, 2 shields ${v[2]}">${v[1]}</td>`).join('')}
        <td class="n">${x.wins.join(' / ')} <span class="note">of ${r.opponents.length}</span></td><td><button class="btn small cfBattle" type="button" data-i="${i}">Battle</button></td></tr>`).join('')}</tbody></table></div></article>`;
    $('#cfResult').onclick = (e) => {
      const b = e.target.closest('.cfBattle'); if (!b) return;
      const x = r.results[+b.dataset.i];
      const own = x.uid && S.roster.find((y) => y.uid === x.uid);
      bs[0].ed.set(catalogById().get(x.id), own ? { moveset: own.moveset, ivs: own.ivs, levelCap: own.levelCap, label: own.nickname } : null);
      bs[1].ed.set(catalogById().get(r.opponents[0].id));
      setMode('1v1'); runBattle();
    };
  } catch (e) { $('#cfStatus').textContent = e.message; }
}

/* ======================= ROSTER ======================= */
const R = { league: null, view: store.get('faintr.rview') || 'cards' };
async function loadRoster() {
  S.roster = await api('/api/roster', undefined, { noF: true });
  renderRoster(); ownedNote();
  slots.forEach((s) => s.fillRoster()); bs.forEach((b) => b.ed.fillRoster());
}
const leagueOf = (e, cp) => e.eval && e.eval.leagues.find((l) => l.cp === cp);
function rankIn(e, cp) { const l = leagueOf(e, cp); return l && l.eligible !== false ? l.rank : 1e9; }
function rLeague() { return R.league || (S.fmt ? (S.fmt.cp >= 10000 ? 10000 : S.fmt.cp > 1500 ? 2500 : S.fmt.cp > 500 ? 1500 : 500) : 1500); }
const capOf = (e) => (e.levelCap === 51 ? 51 : 50);
function statusText(l, e) {
  const short = l.cp < 10000 && l.maxCp < l.cp * 0.94; // can't get near the cap even at max level
  const xl = l.level > 40 && (!e.eval || !e.eval.currentLevel || e.eval.currentLevel <= 40); // past level 40 takes XL Candy
  let st;
  if (l.status === 'ready') st = '<span class="st ok">Ready</span>';
  else if (l.status === 'powerup') st = `<span class="st up">Power up to L${l.level}${short ? '' : `, CP ${fmt(l.maxCp)}`}</span>${xl ? ' <span class="xl" title="Levels above 40 need XL Candy">XL</span>' : ''}`;
  else if (l.status === 'over') st = `<span class="st over">Over ${fmt(l.cp)} CP</span>`;
  else st = `<span class="st">L${l.level}${short ? '' : `, CP ${fmt(l.maxCp)}`}</span>${xl ? ' <span class="xl" title="Levels above 40 need XL Candy">XL</span>' : ''}`;
  if (short && l.status !== 'over') st += `<span class="note" title="Its highest CP at max level"> · tops out at CP ${fmt(l.maxCp)}</span>`;
  return st;
}
function leagueRow(e, l, sel) {
  if (l.eligible === false) return '';
  return `<div class="lrow ${sel ? 'sel' : ''}"><span class="lg">${LEAGUE_NAME[l.cp]}</span><span class="rk">${rankText(l.rank)}</span><span class="pct" title="Stat product compared with rank 1">${l.pctOfBest.toFixed(1)}%</span><span>${statusText(l, e)}</span></div>`;
}
// Evolving changes the IV rank: show it when an evolution does better in this league
function evolveHint(e, lg) {
  const ev = (e.eval && e.eval.evolves) || [];
  const rows = ev.map((x) => ({ x, l: x.leagues.find((y) => y.cp === lg) })).filter((r) => r.l && (lg >= 10000 || r.l.maxCp >= lg * 0.94));
  if (!rows.length) return '';
  return `<div class="evo note">Evolve: ${rows.slice(0, 3).map(({ x, l }) => `${esc(x.name)} ${l.rank === 1 ? `rank 1 ${STAR}` : `rank ${fmt(l.rank)}`} (${l.pctOfBest}%)`).join(' · ')} in ${LEAGUE_NAME[lg]}</div>`;
}
function rosterList() {
  const lg = rLeague();
  const q = $('#rSearch').value.trim().toLowerCase();
  const filt = $('#rFilter').value;
  const counts = new Map(); S.roster.forEach((e) => counts.set(e.id, (counts.get(e.id) || 0) + 1));
  let list = S.roster.filter((e) => !q || e.name.toLowerCase().includes(q) || (e.nickname || '').toLowerCase().includes(q) || (e.notes || '').toLowerCase().includes(q) || (e.types || []).some((t) => t.includes(q)));
  list = list.filter((e) => {
    const l = leagueOf(e, lg), ok = l && l.eligible !== false;
    if (filt === 'ready') return ok && l.status === 'ready';
    if (filt === 'powerup') return ok && l.status === 'powerup';
    if (filt === 'top') return ok && l.rank <= 100;
    if (filt === 'pinned') return e.pinned;
    if (filt === 'shiny') return e.shiny;
    if (filt === 'dupes') return counts.get(e.id) > 1;
    return true;
  });
  const sort = $('#rSort').value;
  const cmp = {
    rank: (a, b) => rankIn(a, lg) - rankIn(b, lg) || (b.cp || 0) - (a.cp || 0),
    cpdesc: (a, b) => (b.cp || 0) - (a.cp || 0), cpasc: (a, b) => (a.cp || 1e9) - (b.cp || 1e9),
    name: (a, b) => a.name.localeCompare(b.name) || rankIn(a, lg) - rankIn(b, lg), dex: (a, b) => (a.dex || 0) - (b.dex || 0) || a.name.localeCompare(b.name),
    new: (a, b) => (b.added > a.added ? 1 : -1),
  }[sort];
  // Pinned first, then the chosen order
  return { lg, counts, list: list.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || cmp(a, b)) };
}
function renderRoster() {
  const el = $('#rGrid'); if (!el || !S.info) return;
  const { lg, counts, list } = rosterList();
  $('#rLeague').innerHTML = [500, 1500, 2500, 10000].map((cp) => `<button type="button" data-cp="${cp}" aria-pressed="${cp === lg}">${LEAGUE_NAME[cp]}</button>`).join('');
  $$('#rView button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === R.view));
  const n1 = S.roster.filter((e) => rankIn(e, lg) === 1).length;
  const shown = list.length !== S.roster.length ? ` ${list.length} shown.` : '';
  $('#rNote').innerHTML = S.roster.length ? `${S.roster.length} Pokémon saved${n1 ? `, ${n1} with rank 1 ${LEAGUE_NAME[lg]} League IVs ${STAR}` : ''}.${shown}` : '';
  if (!S.roster.length) {
    el.className = 'rgrid';
    el.innerHTML = `<div class="empty"><h3 style="margin:0 0 6px;color:var(--ink)">Your Roster is empty</h3><p>Add the Pokémon you've built for PvP. FAINTR will rank their IVs in every league, tell you what to power up, and find the best teams you can field today. Already use Poke Genie or Calcy IV? Export a CSV there and use Import here.</p>
      <div class="actions" style="justify-content:center"><button class="btn primary" type="button" data-r="add">Add Pokémon</button><button class="btn" type="button" data-r="quick">Quick add a list</button><button class="btn" type="button" data-r="import">Import a CSV or file</button></div></div>`;
    return;
  }
  if (!list.length) { el.className = 'rgrid'; el.innerHTML = '<div class="empty">Nothing matches. Clear the filter or search.</div>'; return; }
  if (R.view === 'list') {
    el.className = 'rlist panel scroll';
    const cell = (e, cp) => { const l = leagueOf(e, cp); if (!l || l.eligible === false) return '<td class="n note">—</td>'; return `<td class="n ${l.status === 'over' ? 'note' : ''}" title="${l.status === 'ready' ? 'Ready' : l.status === 'powerup' ? `Power up to L${l.level}` : l.status === 'over' ? 'Over the cap' : `L${l.level}`}">${l.rank === 1 ? `1 ${STAR}` : fmt(l.rank)}<span class="pct"> ${l.pctOfBest.toFixed(0)}%</span></td>`; };
    el.innerHTML = `<table class="t"><thead><tr><th></th><th>Pokémon</th><th class="n">CP</th><th class="n">IVs</th>${[500, 1500, 2500, 10000].map((cp) => `<th class="n ${cp === lg ? 'sel' : ''}">${LEAGUE_NAME[cp]}</th>`).join('')}<th>Moves</th><th></th></tr></thead><tbody>
      ${list.map((e) => `<tr data-uid="${e.uid}"><td class="mini"><span class="crest sm ${e.shiny ? 'shiny' : ''}">${crestFor(e)}</span></td>
        <td><b>${esc(e.nickname || e.name)}</b>${e.pinned ? ' <span class="pin" title="Pinned">Pinned</span>' : ''}${e.shiny ? ' <span class="shinytag">Shiny</span>' : ''}${counts.get(e.id) > 1 ? ` <span class="dupe" title="You have ${counts.get(e.id)} of these">×${counts.get(e.id)}</span>` : ''}<div class="note">${e.nickname ? esc(e.name) : ''}${e.notes ? `${e.nickname ? ' · ' : ''}${esc(e.notes)}` : ''}</div></td>
        <td class="n">${e.cp ? fmt(e.cp) : '—'}</td><td class="n">${e.ivs.atk}/${e.ivs.def}/${e.ivs.hp}</td>${[500, 1500, 2500, 10000].map((cp) => cell(e, cp)).join('')}
        <td class="note rmv">${esc(e.moveNames && e.moveNames.length ? e.moveNames.join(', ') : "PvPoke's pick")}</td>
        <td class="nowrap"><button class="btn small quiet" type="button" data-act="grade">Grade</button> <button class="btn small quiet" type="button" data-act="edit">Edit</button></td></tr>`).join('')}</tbody></table>`;
    return;
  }
  el.className = 'rgrid';
  el.innerHTML = list.map((e) => {
    const nm = e.nickname || e.name;
    const leagues = (e.eval ? e.eval.leagues : []).map((l) => leagueRow(e, l, l.cp === lg)).join('');
    const ball = (BALLS.find((b) => b[0] === e.ball) || BALLS[0])[1];
    const moveNames = e.moveNames && e.moveNames.length ? e.moveNames.join(', ') : "PvPoke's recommended moves for each league";
    const third = e.eval && e.eval.thirdMoveCost && (e.moveset || []).length && (e.moveset || []).length < 3 ? `<div class="note">Second charged move: ${fmt(e.eval.thirdMoveCost)} Stardust</div>` : '';
    return `<article class="rcard panel ${e.pinned ? 'pinned' : ''}" data-uid="${e.uid}">
      <div class="rtop"><span class="crest ${e.shiny ? 'shiny' : ''} ${!e.image && (e.types || []).length > 1 ? 'dual' : ''}">${crestFor(e)}</span>
        <div class="rname"><h4>${esc(nm)}${e.shiny ? ' <span class="shinytag" title="Shiny">Shiny</span>' : ''}</h4><div class="note">${e.nickname ? esc(e.name) + ' ' : ''}${typeDots(e.types)}${counts.get(e.id) > 1 ? ` <span class="dupe" title="You have ${counts.get(e.id)} of these">×${counts.get(e.id)}</span>` : ''}</div></div>
        <div class="rcp"><button type="button" class="pinbtn" data-act="pin" aria-pressed="${!!e.pinned}" title="${e.pinned ? 'Unpin' : 'Pin to top'}">${e.pinned ? 'Pinned' : 'Pin'}</button><span>CP</span><b>${e.cp ? fmt(e.cp) : '—'}</b></div></div>
      <div class="rmeta"><span>IVs <b>${e.ivs.atk}/${e.ivs.def}/${e.ivs.hp}</b></span><span>${esc(ball)}</span>${e.levelCap === 51 ? '<span>Best buddy</span>' : ''}${e.eval && e.eval.currentLevel ? `<span>Level ${e.eval.currentLevel}</span>` : ''}</div>
      <div class="rmoves note" title="${esc(moveNames)}">${esc(moveNames)}</div>${third}${e.notes ? `<div class="rnotes">${esc(e.notes)}</div>` : ''}
      <div class="rleagues">${leagues || `<p class="note">${(e.eval && e.eval.evolves && e.eval.evolves.length) ? `${esc(e.name)} isn't used in the standard leagues; see its evolution below.` : 'Not eligible for the standard leagues.'}</p>`}</div>${evolveHint(e, lg)}
      <div class="ract"><button class="btn small" type="button" data-act="grade" title="Put it in the Team Grader">Grade</button><button class="btn small" type="button" data-act="battle" title="1v1 in Matchups">Battle</button><button class="btn small" type="button" data-act="counters" title="Best answers to it">Counters</button><button class="btn small" type="button" data-act="ivs" title="Open in PvP IVs">IVs</button>
        <span class="spacer"></span><button class="btn small quiet" type="button" data-act="edit">Edit</button><button class="btn small quiet" type="button" data-act="del">Delete</button></div></article>`;
  }).join('');
}
$('#rSearch').addEventListener('input', renderRoster);
$('#rSort').addEventListener('change', () => { store.set('faintr.rsort', $('#rSort').value); renderRoster(); });
$('#rFilter').addEventListener('change', renderRoster);
$('#rView').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) { R.view = b.dataset.v; store.set('faintr.rview', R.view); renderRoster(); } });
$('#rLeague').addEventListener('click', (e) => { const b = e.target.closest('button[data-cp]'); if (b) { R.league = +b.dataset.cp; renderRoster(); } });
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && $('#view-roster').classList.contains('on') && !/input|select|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); $('#rSearch').focus(); }
});
$('#rGrid').addEventListener('click', async (ev) => {
  const r = ev.target.closest('[data-r]');
  if (r) { if (r.dataset.r === 'add') openRosterForm(); if (r.dataset.r === 'quick') $('#rQuick').click(); if (r.dataset.r === 'import') $('#rImportFile').click(); return; }
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const card_ = b.closest('[data-uid]'); const e = S.roster.find((x) => x.uid === card_.dataset.uid); if (!e) return;
  const act = b.dataset.act;
  const p = catalogById().get(e.id);
  const preset = { moveset: e.moveset, ivs: e.ivs, levelCap: e.levelCap, label: e.nickname };
  const notHere = () => showToast(`${e.name} isn't eligible for ${title()}. Switch league or cup at the top first.`);
  if (act === 'grade') {
    if (!p) return notHere();
    const have = slots.findIndex((s) => s.value() && s.value().id === e.id);
    const i = have >= 0 ? have : slots.findIndex((s) => !s.value());
    slots[i < 0 ? 2 : i].set(p, preset); showView('grade');
    $('#gradeStatus').textContent = i < 0 ? `Put ${e.nickname || e.name} in the Closer slot.` : '';
  }
  if (act === 'battle') { if (!p) return notHere(); bs[0].ed.set(p, preset); showView('battle'); setMode('1v1'); }
  if (act === 'counters') { if (!p) return notHere(); CF.opp = [p]; renderChips('opp'); showView('battle'); setMode('counters'); runCounters(); }
  if (act === 'ivs') { openIVs(e.id, e.ivs, capOf(e)); }
  if (act === 'edit') openRosterForm(e);
  if (act === 'pin') { await saveRosterPatch(e, { pinned: !e.pinned }); }
  if (act === 'del') {
    b.closest('.ract').innerHTML = `<span class="confirm">Remove ${esc(e.nickname || e.name)} from your Roster? <button class="btn small" type="button" data-act="yesdel">Yes, remove</button><button class="btn small quiet" type="button" data-act="keep">Keep it</button></span>`;
  }
  if (act === 'keep') renderRoster();
  if (act === 'yesdel') {
    await api('/api/roster/delete', { uid: e.uid }, { noF: true }); await loadRoster();
    showToast(`Removed ${e.nickname || e.name}.`, { label: 'Undo', run: async () => { await api('/api/roster/undo', {}, { noF: true }); loadRoster(); } });
  }
});
// Save one change to an entry
async function saveRosterPatch(e, patch) {
  const body = { ...e, ...patch };
  delete body.eval; delete body.moveNames;
  await api('/api/roster', body, { noF: true }); await loadRoster();
}
$('#rExport').addEventListener('click', async (e) => {
  if (!WEB) return; // the desktop server sends the file
  e.preventDefault();
  const data = await api('/api/roster/export', undefined, { noF: true });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  a.download = 'faintr-roster.json'; document.body.appendChild(a); a.click(); a.remove();
});
$('#rCopy').addEventListener('click', () => {
  const { lg, list } = rosterList();
  const dex = [...new Set(list.filter((e) => { const l = leagueOf(e, lg); return l && l.eligible !== false && l.status !== 'over'; }).map((e) => e.dex))].filter(Boolean);
  if (!dex.length) { $('#rNote').textContent = `Nothing shown fits ${LEAGUE_NAME[lg]} League.`; return; }
  copyText(dex.join(',') + (lg < 10000 ? `&cp-${lg}` : ''), $('#rNote'));
});
$('#rImportFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  e.target.value = '';
  const text = await f.text();
  // A CSV from Poke Genie, Calcy IV and similar: preview first, then add
  if (/\.csv$/i.test(f.name) || !/^\s*[[{]/.test(text)) {
    try {
      const r = await api('/api/roster/csv', { text }, { noF: true });
      QA = r.entries;
      $('#qText').value = '';
      $('#qPreview').innerHTML = `<p>Found ${QA.length} Pokémon in ${esc(f.name)}${r.badCount ? `; ${r.badCount} rows couldn't be read (${r.bad.slice(0, 6).map(esc).join(', ')}${r.badCount > 6 ? '…' : ''})` : ''}.</p>`
        + (QA.length ? `<p>${QA.slice(0, 30).map((x) => `${esc(x.name)} ${x.ivs.atk}/${x.ivs.def}/${x.ivs.hp}${x.cp ? ` CP ${x.cp}` : ''}`).join(', ')}${QA.length > 30 ? ` and ${QA.length - 30} more` : ''}.</p>` : '');
      $('#qAdd').disabled = !QA.length; $('#qDlg').showModal();
    } catch (err) { showToast(err.message); }
    return;
  }
  $('#rNote').innerHTML = '<span class="spin"></span> Importing';
  try {
    const j = JSON.parse(text);
    const r = await api('/api/roster/import', { roster: j.roster || j }, { noF: true });
    $('#rNote').textContent = `Imported ${r.added} Pokémon.${r.errors.length ? ` Skipped: ${r.errors.join('; ')}` : ''}`;
    await loadRoster();
  } catch (err) { $('#rNote').textContent = `That file couldn't be imported: ${err.message}`; }
});

/* ---------- Roster form */
const RF = { p: null, uid: null, ball: 'poke' };
async function fullCatalog() { if (!S.full) S.full = await api('/api/catalog/all', undefined, { noF: true }); return S.full; }
$('#rfBall').innerHTML = BALLS.map(([k, n]) => `<button type="button" role="radio" data-ball="${k}" aria-checked="false">${n}</button>`).join('');
$('#rfBall').addEventListener('click', (e) => { const b = e.target.closest('[data-ball]'); if (b) { RF.ball = b.dataset.ball; syncBall(); } });
function syncBall() { $$('#rfBall button').forEach((b) => b.setAttribute('aria-checked', b.dataset.ball === RF.ball)); }
function rfCrest() {
  $('#rfCrest').innerHTML = RF.p ? crestSVG(RF.p.id, RF.p.types, $('#rfShiny').checked) : '';
  $('#rfCrest').classList.toggle('shiny', $('#rfShiny').checked);
  $('#rfCrest').classList.toggle('dual', !!RF.p && RF.p.types.length > 1);
}
function rfSetSpecies(p, mv) {
  RF.p = p;
  $('#rfPicked').innerHTML = `<b>${esc(p.name)}</b>${typeDots(p.types)} <span class="note">#${p.dex}</span>`;
  // Empty moves mean "PvPoke's pick", which can differ by league
  const m = mv && mv.length ? mv : [];
  const opt = (list, sel, first) => `<option value="">${first}</option>` + list.map(([id, name]) => `<option value="${id}" ${id === sel ? 'selected' : ''}>${esc(name)}</option>`).join('');
  $('#rfFast').innerHTML = opt(p.fast, m[0], "PvPoke's pick"); $('#rfC1').innerHTML = opt(p.charged, m[1], "PvPoke's pick"); $('#rfC2').innerHTML = opt(p.charged, m[2] || '', m.length ? 'None' : "PvPoke's pick");
  ['#rfFast', '#rfC1', '#rfC2'].forEach((s) => { $(s).disabled = false; });
  rfCrest(); rfPreview();
}
let rfSeq = 0, rfTimer = null;
function rfPreview() {
  clearTimeout(rfTimer);
  rfTimer = setTimeout(async () => {
    if (!RF.p) return;
    const seq = ++rfSeq, ivs = { atk: +$('#rfAtk').value, def: +$('#rfDef').value, hp: +$('#rfHp').value };
    if ([ivs.atk, ivs.def, ivs.hp].some((v) => !(v >= 0 && v <= 15))) { $('#rfPreview').textContent = 'IVs go from 0 to 15.'; return; }
    const cap = $('#rfBuddy').checked ? 51 : 50;
    const rows = await Promise.all(LEAGUES.map((l) => api('/api/iv', { id: RF.p.id, ivs, levelCap: cap, f: l.key }).then((iv) => [l, iv]).catch(() => null)));
    if (seq !== rfSeq) return;
    $('#rfPreview').innerHTML = rows.filter(Boolean).map(([l, iv]) => `<div class="lrow"><span class="lg">${l.short}</span><span class="rk">${rankText(iv.rank)}</span><span class="pct">${iv.pctOfBest.toFixed(1)}%</span><span class="st">L${iv.level}, CP ${fmt(iv.cp)}</span></div>`).join('') || '<span class="note">Not eligible for the standard leagues.</span>';
  }, 200);
}
['#rfAtk', '#rfDef', '#rfHp', '#rfBuddy'].forEach((s) => $(s).addEventListener('input', rfPreview));
$('#rfShiny').addEventListener('change', rfCrest);
async function openRosterForm(e) {
  const full = await fullCatalog();
  RF.uid = e ? e.uid : null; RF.ball = e ? e.ball : 'poke'; RF.p = null;
  $('#rfTitle').textContent = e ? `Edit ${e.nickname || e.name}` : 'Add to Roster';
  $('#rfNick').value = e ? e.nickname || '' : '';
  $('#rfAtk').value = e ? e.ivs.atk : 0; $('#rfDef').value = e ? e.ivs.def : 15; $('#rfHp').value = e ? e.ivs.hp : 15;
  $('#rfCp').value = e && e.cp ? e.cp : ''; $('#rfShiny').checked = !!(e && e.shiny); $('#rfBuddy').checked = !!(e && e.levelCap === 51);
  $('#rfNotes').value = e ? e.notes || '' : ''; $('#rfPin').checked = !!(e && e.pinned);
  $('#rfStatus').textContent = ''; $('#rfPreview').innerHTML = ''; $('#rfPicked').textContent = 'None picked yet.';
  ['#rfFast', '#rfC1', '#rfC2'].forEach((s) => { $(s).innerHTML = ''; $(s).disabled = true; });
  syncBall();
  if (e) { const p = full.find((c) => c.id === e.id); if (p) rfSetSpecies(p, e.moveset); } else rfCrest();
  $('#rDlg').showModal();
  if (!e) $('#pk-roster input').focus();
}
window.openRosterForm = openRosterForm;
$('#rAdd').addEventListener('click', () => openRosterForm());
$('#rfCancel').addEventListener('click', () => $('#rDlg').close());
$('#rfSave').addEventListener('click', async () => {
  if (!RF.p) { $('#rfStatus').textContent = 'Pick a Pokémon first.'; return; }
  const body = { uid: RF.uid, id: RF.p.id, nickname: $('#rfNick').value.trim(), ivs: { atk: +$('#rfAtk').value, def: +$('#rfDef').value, hp: +$('#rfHp').value },
    cp: $('#rfCp').value ? +$('#rfCp').value : null, levelCap: $('#rfBuddy').checked ? 51 : 50, shiny: $('#rfShiny').checked, ball: RF.ball,
    notes: $('#rfNotes').value.trim(), pinned: $('#rfPin').checked,
    moveset: $('#rfFast').value && $('#rfC1').value ? [$('#rfFast').value, $('#rfC1').value, $('#rfC2').value].filter(Boolean) : [] };
  $('#rfStatus').innerHTML = '<span class="spin"></span> Saving';
  try { await api('/api/roster', body, { noF: true }); $('#rDlg').close(); await loadRoster(); showToast(RF.uid ? 'Saved.' : `Added ${RF.p.name} to your Roster.`); } catch (e) { $('#rfStatus').textContent = e.message; }
});

/* ---------- Quick add */
let QA = [];
$('#rQuick').addEventListener('click', () => { $('#qPreview').innerHTML = ''; $('#qAdd').disabled = true; $('#qDlg').showModal(); $('#qText').focus(); });
$('#qClose').addEventListener('click', () => $('#qDlg').close());
$('#qCheck').addEventListener('click', async () => {
  const r = await api('/api/roster/parse', { text: $('#qText').value }, { noF: true });
  const full = await fullCatalog();
  QA = r.entries;
  $('#qPreview').innerHTML = (QA.length ? `<p>Ready to add ${QA.length}: ${QA.map((x) => `${esc((full.find((c) => c.id === x.id) || {}).name || x.id)} ${x.ivs.atk}/${x.ivs.def}/${x.ivs.hp}${x.cp ? ` CP ${x.cp}` : ''}${x.shiny ? ' (shiny)' : ''}`).join(', ')}.</p>` : '')
    + (r.bad.length ? `<p>Couldn't read: ${r.bad.map(esc).join('; ')}. Each line needs a Pokémon name and three IVs like 0/15/15.</p>` : '');
  $('#qAdd').disabled = !QA.length;
});
$('#qAdd').addEventListener('click', async () => {
  $('#qAdd').disabled = true;
  let n = 0;
  // In batches: one save per batch, with progress
  for (let k = 0; k < QA.length; k += 25) {
    try { const r = await api('/api/roster/import', { roster: QA.slice(k, k + 25).map((x) => ({ ball: 'poke', ...x })) }, { noF: true }); n += r.added; if (r.errors.length && /holds up to/.test(r.errors[r.errors.length - 1])) { showToast(r.errors[r.errors.length - 1]); break; } } catch (e) { showToast(e.message); break; }
    $('#qPreview').innerHTML = `<span class="spin"></span> Added ${n} of ${QA.length}`;
  }
  $('#qDlg').close(); $('#qText').value = ''; await loadRoster();
  $('#rNote').textContent = `Added ${n} Pokémon. Edit any card to set its moves and ball.`;
});

/* ======================= PVP IVS ======================= */
const IVS = { p: null, cp: null, table: null, key: '', limit: 100, fam: null, seq: 0 };
const LEAGUE_KEY = { 500: 'little-500', 1500: 'all-1500', 2500: 'all-2500', 10000: 'all-10000' };
const ivVals = () => ({ atk: +$('#ivAtk').value, def: +$('#ivDef').value, hp: +$('#ivHp').value });
const bucket = (v) => (v === 0 ? 0 : v <= 5 ? 1 : v <= 10 ? 2 : v <= 14 ? 3 : 4); // appraisal bar segments
function ivLeague() { return IVS.cp || (S.fmt ? (S.fmt.cp >= 10000 ? 10000 : S.fmt.cp > 1500 ? 2500 : S.fmt.cp > 500 ? 1500 : 500) : 1500); }
function renderIvLeague() { $('#ivLeague').innerHTML = [500, 1500, 2500, 10000].map((cp) => `<button type="button" data-cp="${cp}" aria-pressed="${cp === ivLeague()}">${LEAGUE_NAME[cp]}</button>`).join(''); }
$('#ivLeague').addEventListener('click', (e) => { const b = e.target.closest('button[data-cp]'); if (b) { IVS.cp = +b.dataset.cp; renderIvLeague(); refreshIVs(); } });
function openIVs(id, ivs, cap) {
  showView('ivs');
  fullCatalog().then((full) => {
    const p = full.find((c) => c.id === id); if (!p) return;
    if (ivs) { $('#ivAtk').value = ivs.atk; $('#ivDef').value = ivs.def; $('#ivHp').value = ivs.hp; }
    if (cap) $('#ivCap').value = String(cap);
    setIvSpecies(p);
  });
}
function setIvSpecies(p) {
  IVS.p = p; IVS.limit = 100;
  $('#ivPicked').innerHTML = `<b>${esc(p.name)}</b>${typeDots(p.types)} <span class="note">#${p.dex}</span>`;
  $('#ivAddRoster').disabled = false; $('#ivBattle').disabled = false;
  store.set('faintr.ivspecies', p.id);
  refreshIVs();
}
let ivTimer = null;
['#ivAtk', '#ivDef', '#ivHp'].forEach((s) => $(s).addEventListener('input', () => { clearTimeout(ivTimer); ivTimer = setTimeout(refreshIVs, 150); }));
['#ivCap', '#ivFloor'].forEach((s) => $(s).addEventListener('change', refreshIVs));
['#ivMinA', '#ivMinD', '#ivMinH', '#ivSort'].forEach((s) => $(s).addEventListener('input', () => { IVS.limit = 100; renderIvTable(); }));
$('#ivMore').addEventListener('click', () => { IVS.limit += 200; renderIvTable(); });
$('#ivR1').addEventListener('click', () => { const r = IVS.table && IVS.table.rows[0]; if (r) { $('#ivAtk').value = r[1]; $('#ivDef').value = r[2]; $('#ivHp').value = r[3]; refreshIVs(); } });
$('#ivHundo').addEventListener('click', () => { $('#ivAtk').value = 15; $('#ivDef').value = 15; $('#ivHp').value = 15; refreshIVs(); });
$('#ivAddRoster').addEventListener('click', async () => {
  if (!IVS.p) return;
  await openRosterForm();
  rfSetSpecies(IVS.p); const v = ivVals(); $('#rfAtk').value = v.atk; $('#rfDef').value = v.def; $('#rfHp').value = v.hp;
  $('#rfBuddy').checked = +$('#ivCap').value === 51; rfPreview();
});
$('#ivBattle').addEventListener('click', () => {
  const p = IVS.p && catalogById().get(IVS.p.id);
  if (!p) { showToast(`${IVS.p ? IVS.p.name : 'That Pokémon'} isn't eligible for ${title()}. Pick another league or cup at the top.`); return; }
  bs[0].ed.set(p, { ivs: ivVals(), levelCap: +$('#ivCap').value }); showView('battle'); setMode('1v1');
});
async function refreshIVs() {
  renderIvLeague();
  if (!IVS.p) return;
  const v = ivVals();
  if ([v.atk, v.def, v.hp].some((x) => !(x >= 0 && x <= 15) || !Number.isInteger(x))) { $('#ivOut').innerHTML = '<p class="note" style="padding:16px">IVs are whole numbers from 0 to 15.</p>'; return; }
  const seq = ++IVS.seq, cp = ivLeague(), cap = +$('#ivCap').value, floor = +$('#ivFloor').value;
  const key = `${IVS.p.id}|${cp}|${cap}|${floor}`;
  $('#ivOut').innerHTML = '<p class="note" style="padding:16px"><span class="spin"></span> Ranking every IV combination</p>';
  try {
    const [table, fam] = await Promise.all([
      IVS.key === key ? IVS.table : api('/api/ivtable', { id: IVS.p.id, cp, levelCap: cap, floor }, { noF: true }),
      api('/api/family', { id: IVS.p.id, ivs: v, cp, levelCap: cap }, { noF: true }),
    ]);
    if (seq !== IVS.seq) return;
    IVS.table = table; IVS.key = key; IVS.fam = fam;
    renderIvOut(); renderIvFamily(); renderIvTable();
  } catch (e) { if (seq === IVS.seq) $('#ivOut').innerHTML = `<p class="note" style="padding:16px">${esc(e.message)}</p>`; }
}
function myIvRow() { const v = ivVals(); return IVS.table.rows.find((r) => r[1] === v.atk && r[2] === v.def && r[3] === v.hp); }
function renderIvOut() {
  const t = IVS.table, v = ivVals(), r = myIvRow(), r1 = t.rows[0], cp = ivLeague();
  const n = t.rows.length;
  if (!n) { $('#ivOut').innerHTML = `<p class="note" style="padding:16px">${esc(t.name)} can't get under ${fmt(cp)} CP at any level.</p>`; return; }
  const short = cp < 10000 && r1[5] < cp * 0.94;
  const statRank = (k, val) => t.rows.filter((x) => x[k] > val + 1e-9).length + 1;
  const pct = r ? r[6] : null;
  const head = r
    ? `<div class="ivbig"><b class="tb ${r[0] === 1 ? 't-elite' : r[0] <= 10 ? 't-excellent' : r[0] <= 100 ? 't-strong' : r[0] <= 500 ? 't-good' : 't-fair'}">${r[0] === 1 ? `Rank 1 ★` : `Rank ${fmt(r[0])}`}</b><span>of ${fmt(n)} possible IVs in ${LEAGUE_NAME[cp]} League${+$('#ivFloor').value ? ` with a floor of ${$('#ivFloor').value}` : ''}</span></div>`
    : `<div class="ivbig"><b class="tb t-fair">Not possible</b><span>${v.atk}/${v.def}/${v.hp} is below the IV floor you picked.</span></div>`;
  const tiles = r ? [
    ['Stat product', `${pct.toFixed(2)}%`], ['Level', r[4]], ['CP', fmt(r[5])],
    ['Attack', `${r[7].toFixed(2)} <span class="note">#${statRank(7, r[7])}</span>`], ['Defense', `${r[8].toFixed(2)} <span class="note">#${statRank(8, r[8])}</span>`], ['HP', `${r[9]} <span class="note">#${statRank(9, r[9])}</span>`],
  ] : [];
  const bests = `Rank 1 is <b>${r1[1]}/${r1[2]}/${r1[3]}</b> at level ${r1[4]}, CP ${fmt(r1[5])}.`;
  const top = Math.min(50, n);
  const sets = [1, 2, 3].map((k) => [...new Set(t.rows.slice(0, top).map((x) => bucket(x[k])))].sort());
  const fam = (IVS.fam || []).map((f) => f.name.replace(/\s*\(.*\)$/, ''))[0] || t.name.replace(/\s*\(.*\)$/, '');
  const search = `+${fam.toLowerCase()}&${sets[0].map((b) => `${b}attack`).join(',')}&${sets[1].map((b) => `${b}defense`).join(',')}&${sets[2].map((b) => `${b}hp`).join(',')}`;
  $('#ivOut').innerHTML = `${head}
    ${short ? (() => { const up = (IVS.fam || []).filter((f) => f.id !== t.id && f.cp >= cp * 0.94);
      const best = up.sort((a, b) => a.rank - b.rank)[0];
      return `<div class="ivnote"><span>${esc(t.name)} can't reach ${fmt(cp)} CP: even rank 1 tops out at CP ${fmt(r1[5])}.${best ? ` As <b>${esc(best.name)}</b> these IVs are ${best.rank === 1 ? `rank 1 ${STAR}` : `rank ${fmt(best.rank)}`}.` : ''}</span>${best ? `<button class="btn small" type="button" id="ivEvo" data-id="${best.id}">Rank as ${esc(best.name)}</button>` : ''}</div>`; })() : ''}
    <div class="ivtiles">${tiles.map(([k, x]) => `<div><span>${k}</span><b>${x}</b></div>`).join('')}</div>
    <p class="note">${bests} Stat ranks (#) count how many IV spreads beat yours on that one stat, which is what decides breakpoints and bulkpoints.</p>
    <div class="ivsearch"><span class="note">Search string for the top ${top} IVs in this family</span><code id="ivSearchStr">${esc(search)}</code><button class="btn small" type="button" id="ivCopy">Copy</button></div>
    <p class="hint">Appraisal bars can't tell exact IVs apart, so this finds every Pokémon that could be top ${top}; check each match here.</p>
    <div class="actions"><button class="btn small" type="button" id="ivCmp" ${r && r[0] !== 1 && cp ? '' : 'disabled'}>Which matchups do my IVs change?</button><span class="note" id="ivCmpNote"></span></div><div id="ivCmpOut"></div>`;
  $('#ivCopy').addEventListener('click', () => copyText(search, $('#ivCmpNote')));
  if ($('#ivEvo')) $('#ivEvo').addEventListener('click', () => { const p = (S.full || []).find((c) => c.id === $('#ivEvo').dataset.id); if (p) setIvSpecies(p); });
  $('#ivCmp').addEventListener('click', async () => {
    $('#ivCmpNote').innerHTML = '<span class="spin"></span> Battling the top 100 with your IVs and with rank 1';
    try {
      const c = await api('/api/ivcompare', { id: t.id, ivs: v, levelCap: +$('#ivCap').value, f: LEAGUE_KEY[cp] }, { noF: true });
      $('#ivCmpNote').textContent = '';
      const g = c.flips.filter((x) => x.gained).length, l = c.flips.length - g;
      $('#ivCmpOut').innerHTML = c.rank1 ? '<p class="note">These are the rank 1 IVs.</p>' : !c.flips.length ? `<p class="note">Against the top ${c.of}, your IVs win and lose the same matchups as rank 1 at 0, 1 and 2 shields.</p>`
        : `<p class="note">Compared with rank 1 against the ${LEAGUE_NAME[cp]} League top ${c.of}: <b>+${g}</b> matchups won, <b>−${l}</b> lost.</p><table class="t"><thead><tr><th>Opponent</th><th class="n">Shields</th><th class="n">Yours</th><th class="n">Rank 1</th><th>Result</th></tr></thead><tbody>
          ${c.flips.slice(0, 20).map((x) => `<tr><td>${esc(x.name)}</td><td class="n">${x.shields}</td><td class="n ${cls(x.mine)}">${x.mine}</td><td class="n ${cls(x.theirs)}">${x.theirs}</td><td class="${x.gained ? 'gain' : 'lost'}">${x.gained ? 'Gained' : 'Lost'}</td></tr>`).join('')}</tbody></table>`;
    } catch (e) { $('#ivCmpNote').textContent = e.message; }
  });
}
function renderIvFamily() {
  const fam = IVS.fam || [], cp = ivLeague(), box = $('#ivFam');
  if (fam.length < 2) { box.hidden = true; return; }
  box.hidden = false;
  const idx = new Map(fam.map((f, k) => [f.id, k]));
  box.innerHTML = `<h3 style="margin:0 0 6px">The whole family in ${LEAGUE_NAME[cp]} League</h3><p class="hint">The same IVs carry through evolution. "Evolve at" is the CP an earlier stage shows at the level where this one is best, so you can power up before evolving without passing the cap.</p>
    <table class="t"><thead><tr><th>Pokémon</th><th class="n">Rank</th><th class="n">Stat product</th><th class="n">Level</th><th class="n">CP</th><th>Evolve at</th></tr></thead><tbody>
    ${fam.map((f) => { const short = cp < 10000 && f.cp < cp * 0.94; const pre = f.atLevel.filter((a) => idx.get(a.id) < idx.get(f.id));
      return `<tr class="${f.id === IVS.p.id ? 'me' : ''}"><td><b>${esc(f.name)}</b></td><td class="n">${short ? '<span class="note">can\'t reach cap</span>' : f.rank === 1 ? `1 ${STAR}` : fmt(f.rank)}</td><td class="n">${f.pctOfBest.toFixed(1)}%</td><td class="n">${f.level}</td><td class="n">${fmt(f.cp)}</td>
        <td class="note">${pre.length && !short ? pre.map((a) => `${esc(a.name)} CP ${fmt(a.cp)}`).join(' · ') : ''}</td></tr>`; }).join('')}</tbody></table>`;
}
function renderIvTable() {
  const t = IVS.table; if (!t) return;
  $('#ivTableBox').hidden = false;
  const mins = [+$('#ivMinA').value || 0, +$('#ivMinD').value || 0, +$('#ivMinH').value || 0];
  const sortK = { rank: 0, atk: 7, def: 8, hp: 9, cp: 5 }[$('#ivSort').value];
  let rows = t.rows.filter((r) => r[1] >= mins[0] && r[2] >= mins[1] && r[3] >= mins[2]);
  if (sortK) rows = rows.slice().sort((a, b) => b[sortK] - a[sortK] || a[0] - b[0]);
  const v = ivVals();
  $('#ivTableNote').textContent = `${fmt(rows.length)} of ${fmt(t.rows.length)} shown`;
  $('#ivTable').innerHTML = `<thead><tr><th class="n">Rank</th><th class="n">Atk</th><th class="n">Def</th><th class="n">HP</th><th class="n">Level</th><th class="n">CP</th><th class="n">Stat product</th><th class="n">Attack</th><th class="n">Defense</th><th class="n">HP stat</th></tr></thead>
    <tbody>${rows.slice(0, IVS.limit).map((r) => `<tr class="${r[1] === v.atk && r[2] === v.def && r[3] === v.hp ? 'me' : ''}" data-iv="${r[1]},${r[2]},${r[3]}"><td class="n">${r[0] === 1 ? `1 ${STAR}` : r[0]}</td><td class="n">${r[1]}</td><td class="n">${r[2]}</td><td class="n">${r[3]}</td><td class="n">${r[4]}</td><td class="n">${r[5]}</td><td class="n">${r[6].toFixed(2)}%</td><td class="n">${r[7].toFixed(2)}</td><td class="n">${r[8].toFixed(2)}</td><td class="n">${r[9]}</td></tr>`).join('')}</tbody>`;
  $('#ivMore').hidden = rows.length <= IVS.limit;
}
$('#ivTable').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-iv]'); if (!tr) return;
  const [a, d, h] = tr.dataset.iv.split(',').map(Number); $('#ivAtk').value = a; $('#ivDef').value = d; $('#ivHp').value = h; refreshIVs();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('#ivJump').addEventListener('click', () => {
  const r = myIvRow(); if (!r) return;
  if (IVS.limit < r[0] && $('#ivSort').value === 'rank') { IVS.limit = r[0] + 20; renderIvTable(); }
  const tr = $('#ivTable tr.me'); if (tr) tr.scrollIntoView({ block: 'center' });
});

/* ======================= META ======================= */
let META = null;
async function loadMeta() {
  $('#metaLede').textContent = `PvPoke's current ${title()} rankings with every role score.`;
  META = await api('/api/meta');
  const c = META.changes;
  const lst = (arr, f) => (arr && arr.length ? `<ul class="tight">${arr.slice(0, 8).map(f).join('')}</ul>` : '<p class="note">None</p>');
  $('#metaChanges').innerHTML = c ? `<p class="note" style="margin:-8px 0 14px">Changes since your previous data, ${esc(fmtVersion(c.from))} to ${esc(fmtVersion(c.to))}.</p><div class="changes">
      <div class="panel"><h4>Moved up</h4>${lst(c.risers, (x) => `<li>${esc(x.name)} <span class="delta up">+${x.delta}</span> <span class="note">now #${x.rank}</span></li>`)}</div>
      <div class="panel"><h4>Moved down</h4>${lst(c.fallers, (x) => `<li>${esc(x.name)} <span class="delta down">${x.delta}</span> <span class="note">now #${x.rank}</span></li>`)}</div>
      <div class="panel"><h4>New in the top 150</h4>${lst(c.newcomers, (x) => `<li>${esc(x.name)} <span class="note">#${x.rank}</span></li>`)}</div>
      <div class="panel"><h4>New recommended movesets</h4>${lst(c.movesets, (x) => `<li>${esc(x.name)}</li>`)}</div></div>`
    : '<p class="note" style="margin:-8px 0 14px">After your first data update, you\'ll also see who moved up, who fell, and which movesets changed.</p>';
  renderMeta();
}
function renderMeta() {
  if (!META) return;
  const q = $('#metaSearch').value.trim().toLowerCase(), sort = $('#metaSort').value, own = $('#metaOwned').checked, ids = rosterIds();
  let rows = META.rows.filter((r) => (!q || r.name.toLowerCase().includes(q) || r.types.some((t) => t.includes(q))) && (!own || ids.has(r.id)));
  if (sort === 'delta') rows = rows.slice().sort((a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0));
  else if (sort !== 'rank') rows = rows.slice().sort((a, b) => b.scores[sort] - a.scores[sort]);
  const bar = (v) => `<div style="display:flex;gap:6px;align-items:center"><div class="bar" style="width:46px"><i style="width:${v}%"></i></div><span>${Math.round(v)}</span></div>`;
  const dl = (d) => (d === undefined ? '' : d === null ? '<span class="note">new</span>' : d > 0 ? `<span class="delta up">+${d}</span>` : d < 0 ? `<span class="delta down">${d}</span>` : '<span class="note">=</span>');
  $('#metaNote').textContent = `${rows.length} shown`;
  $('#metaTable').innerHTML = `<thead><tr><th class="n">#</th><th class="n">Change</th><th>Pokémon</th><th>Moveset</th><th class="n">Score</th><th>Lead</th><th>Switch</th><th>Closer</th><th>Attacker</th><th>Charger</th><th>Consistency</th><th></th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td class="n">${r.rank}</td><td class="n">${dl(r.delta)}</td><td><b>${esc(r.name)}</b>${ids.has(r.id) ? '<span class="own" title="In your Roster">✓</span>' : ''}${typeDots(r.types)}</td><td class="note">${esc(r.moves.join(', '))}</td><td class="n"><b>${r.score}</b></td>
      ${['lead', 'switch', 'closer', 'attacker', 'charger', 'consistency'].map((k) => `<td>${bar(r.scores[k])}</td>`).join('')}
      <td><button class="btn small toBattle" type="button" data-id="${r.id}">Battle</button></td></tr>`).join('')}</tbody>`;
}
$('#metaSearch').addEventListener('input', renderMeta);
$('#metaSort').addEventListener('change', renderMeta);
$('#metaOwned').addEventListener('change', renderMeta);
$('#metaTable').addEventListener('click', (e) => {
  const b = e.target.closest('.toBattle'); if (!b) return;
  const p = catalogById().get(b.dataset.id); if (!p) return;
  bs[0].ed.set(p, withRoster({ id: p.id })); showView('battle'); setMode('1v1'); $('#vsMetaBtn').click();
});

/* ======================= MY TEAMS ======================= */
async function loadSaved() {
  const [list] = await Promise.all([api('/api/saved', undefined, { noF: true }), fullCatalog().catch(() => [])]);
  const el = $('#savedList');
  if (!list.length) { el.innerHTML = '<div class="empty">No saved teams yet. Grade one in the Team Grader, then save it here.</div>'; return; }
  const order = { A: 4, B: 3, C: 2, D: 1, F: 0 };
  const names = new Map((S.full || []).map((c) => [c.id, c.name]));
  el.innerHTML = list.map((t) => {
    const h = t.history || [], cur = h[0], prev = h[1];
    const tiles = cur ? KEYS.map((k) => {
      const ch = prev && prev.letters[k] && prev.letters[k] !== cur.letters[k] ? (order[cur.letters[k]] > order[prev.letters[k]] ? 'up' : 'down') : '';
      return `<span class="tile" title="${esc(G[k].label)}${prev ? ` (was ${prev.letters[k]})` : ''}"><span class="L sm ${cur.letters[k]}">${cur.letters[k]}</span><small class="${ch ? 'chg ' + ch : ''}">${ch === 'up' ? '▲' : ch === 'down' ? '▼' : SHORT[k]}</small></span>`;
    }).join('') : '';
    const diff = cur && prev ? cur.composite - prev.composite : 0;
    return `<div class="panel" data-id="${t.id}"><div><h4>${esc(t.name)} <span class="fmtchip">${esc(t.title || 'Great League')}</span></h4><div class="note">${t.members.map((m) => esc(names.get(m.id) || m.id) + (m.ivs ? ` (${m.ivs.atk}/${m.ivs.def}/${m.ivs.hp})` : '')).join(', ')}</div>
        <div style="display:flex;gap:3px;margin-top:8px">${tiles}</div>
        <div class="history" style="margin-top:6px">${prev ? `<span class="chg ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff >= 0 ? '+' : ''}${diff.toFixed(1)} since the last update.</span> ` : ''}Graded ${h.length} time${h.length === 1 ? '' : 's'}, latest on data from ${esc(cur ? fmtVersion(cur.version) : '—')}.</div></div>
      <div class="savedright">${cur ? scoreBadge(cur.composite, t.tier, null, t.title) : ''}<div class="actions" style="margin:0"><button class="btn primary openSaved" type="button">Open in grader</button><button class="btn quiet delSaved" type="button">Delete</button></div></div></div>`;
  }).join('');
  el.onclick = async (e) => {
    const row = e.target.closest('[data-id]'); if (!row) return;
    const t = list.find((x) => x.id === row.dataset.id);
    if (e.target.classList.contains('openSaved')) { if (t.f && t.f !== S.f) await setFormat(t.f); loadIntoGrader(t.members); showView('grade'); runGrade(); }
    // Destructive actions aren't red (red is the brand): two-step inline confirmation instead
    if (e.target.classList.contains('delSaved')) {
      e.target.closest('.actions').innerHTML = `<span class="confirm">Delete "${esc(t.name)}" for good? <button class="btn small yesDel" type="button">Yes, delete</button><button class="btn small quiet keepSaved" type="button">Keep it</button></span>`;
    }
    if (e.target.classList.contains('keepSaved')) loadSaved();
    if (e.target.classList.contains('yesDel')) { await api('/api/saved/delete', { id: t.id }); loadSaved(); }
  };
}

/* ======================= WHAT'S NEW ======================= */
function md(text) {
  const inline = (x) => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
  let html = '', depth = 0;
  const closeTo = (d) => { while (depth > d) { html += '</li></ul>'; depth--; } };
  for (const line of text.split('\n')) {
    const m = /^(\s*)- (.*)$/.exec(line);
    if (m) {
      const d = Math.floor(m[1].length / 2) + 1;
      if (d > depth) { while (depth < d) { html += '<ul>'; depth++; } }
      else { closeTo(d); html += '</li>'; }
      html += `<li>${inline(m[2])}`;
      continue;
    }
    closeTo(0);
    if (/^### /.test(line)) html += `<h3>${inline(line.slice(4))}</h3>`;
    else if (/^## /.test(line)) html += `<h2>${inline(line.slice(3))}</h2>`;
    else if (/^# /.test(line)) html += `<h1>${inline(line.slice(2))}</h1>`;
    else if (line.trim()) html += `<p>${inline(line)}</p>`;
  }
  closeTo(0);
  return html;
}
async function loadNews() { const r = await fetch('/changelog.md'); $('#changelog').innerHTML = md(await r.text()); }

/* ======================= DATA + UPDATES ======================= */
function fmtVersion(v) {
  const m = /_(\d{4}-\d{2}-\d{2})$/.exec(v || '');
  return m ? new Date(m[1] + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'an unknown date';
}
let statusTimer = null;
async function pollStatus() {
  clearTimeout(statusTimer);
  try {
    const st = await api('/api/status', undefined, { noF: true });
    if (st.web) { renderWebData(st.web); return; }
    const u = st.update;
    $('#autoUpd').checked = st.settings.autoUpdate;
    $('#schedUpd').checked = st.schedule.enabled; $('#schedUpd').disabled = !st.schedule.supported;
    $('#schedNote').textContent = st.schedule.supported ? '' : 'Works in the Windows app.';
    $('#dataNow').textContent = `Using PvPoke data from ${fmtVersion(S.info.pvpoke)} (${S.info.source === 'updated' ? 'downloaded' : 'bundled with this version'}). Last checked ${st.settings.lastCheck ? new Date(st.settings.lastCheck).toLocaleString() : 'never'}.`;
    $('#updProg').hidden = !u.running; $('#updProg').max = u.n || 1; $('#updProg').value = u.i || 0;
    if (u.message) $('#updMsg').textContent = u.message;
    $('#updNow').disabled = u.running;
    const b = st.builds[S.f];
    const building = Object.values(st.builds).some((x) => x.running);
    $('#updBanner').hidden = !u.running; if (u.running) $('#updBanner').textContent = `Updating PvPoke data: ${u.message}. Keep using FAINTR; results switch over when it's done.`;
    $('.dot').classList.toggle('busy', u.running || building);
    if (b && !S.fmt.built && $('#view-find').classList.contains('on')) $('#teams').innerHTML = buildPanel(b);
    if (b && b.stage === 'done' && !S.fmt.built) { S.info = await api('/api/info', undefined, { noF: true }); await setFormat(S.f, true); }
    if (u.running || building) statusTimer = setTimeout(pollStatus, 1000);
    else if (u.stage === 'done' && S._lastStage !== 'done') { await loadInfo(); await setFormat(S.f, true); loadSaved(); }
    S._lastStage = u.stage;
  } catch (e) { statusTimer = setTimeout(pollStatus, 5000); }
}
$('#dataBtn').addEventListener('click', () => { $('#dataDlg').showModal(); pollStatus(); });
// Website: when the data was built, and the admin's "update now" tools
function renderWebData(w) {
  $$('#dataDlg .desk').forEach((x) => { x.hidden = true; });
  $('#webData').hidden = false;
  $('#dataNow').textContent = `Using PvPoke data from ${fmtVersion(w.pvpoke)}. Published ${w.built ? new Date(w.built).toLocaleString() : 'recently'}.`;
  $('#devTools').hidden = !w.admin;
  if (w.admin && !$('#devRuns').dataset.loaded) loadDevRuns();
}
async function loadDevRuns() {
  $('#devRuns').dataset.loaded = '1';
  $('#devRuns').innerHTML = '<span class="spin"></span> Checking recent updates';
  try {
    const r = await api('/api/dev/runs', undefined, { noF: true });
    const runs = (r && r.runs) || [];
    $('#devRuns').innerHTML = runs.length ? `<table class="t"><thead><tr><th>Started</th><th>How</th><th>Status</th></tr></thead><tbody>${runs.map((x) => `<tr><td>${new Date(x.created_at).toLocaleString()}</td><td>${esc(x.event === 'schedule' ? 'Nightly' : 'Manual')}</td><td><a href="${esc(x.html_url)}" target="_blank" rel="noopener">${esc(x.conclusion || x.status)}</a></td></tr>`).join('')}</tbody></table>` : 'No updates have run yet.';
  } catch (e) { $('#devRuns').textContent = e.message; }
}
$('#devRun').addEventListener('click', async () => { try { const r = await api('/api/update', { force: false }, { noF: true }); showToast(r.message); $('#devRuns').dataset.loaded = ''; setTimeout(loadDevRuns, 4000); } catch (e) { showToast(e.message); } });
$('#devForce').addEventListener('click', async () => { try { const r = await api('/api/update', { force: true }, { noF: true }); showToast(r.message); $('#devRuns').dataset.loaded = ''; setTimeout(loadDevRuns, 4000); } catch (e) { showToast(e.message); } });
$('#devRefresh').addEventListener('click', loadDevRuns);
$('#dlgClose').addEventListener('click', () => $('#dataDlg').close());
$('#updNow').addEventListener('click', async () => { $('#updMsg').textContent = 'Checking PvPoke on GitHub.'; await api('/api/update', { force: false }, { noF: true }); pollStatus(); });
$('#autoUpd').addEventListener('change', (e) => api('/api/settings', { autoUpdate: e.target.checked }, { noF: true }));
$('#schedUpd').addEventListener('change', async (e) => {
  const r = await api('/api/schedule', { enabled: e.target.checked, time: $('#schedTime').value }, { noF: true });
  $('#schedUpd').checked = r.enabled; $('#schedNote').textContent = r.error || (r.enabled ? `Scheduled daily at ${$('#schedTime').value}.` : 'Off.');
});
const curTheme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const syncThemeBtn = () => { $('#themeBtn').textContent = curTheme() === 'dark' ? 'Light mode' : 'Dark mode'; };
$('#themeBtn').addEventListener('click', () => {
  const next = curTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.set('faintr.theme', next);
  syncThemeBtn();
});
{ const t = store.get('faintr.theme') || store.get('triad.theme'); if (t) document.documentElement.dataset.theme = t; }
syncThemeBtn();

/* ======================= COMMUNITY + ACCOUNTS ======================= */
// Discord and Patreon links come from config.js
[['#discordBtn', 'discordUrl'], ['#discordBtn2', 'discordUrl'], ['#patreonBtn', 'patreonUrl']].forEach(([sel, key]) => {
  const a = $(sel); if (!a) return;
  if (CFG[key]) a.href = CFG[key];
  else { a.href = '#'; a.title = 'Link coming soon'; a.addEventListener('click', (e) => { e.preventDefault(); showToast('That link is coming soon.'); }); }
});

// Report a Bug: saved to Supabase when it's set up; otherwise point people to Discord
async function sendBug(row) {
  if (WEB) return api('/api/bugs', row, { noF: true });
  if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) throw new Error('Bug reports from the app go through the Discord for now.');
  const r = await fetch(`${CFG.supabaseUrl}/rest/v1/bug_reports`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.supabaseAnonKey, Prefer: 'return=minimal' },
    body: JSON.stringify({ ...row, app_version: S.info && S.info.version, data_version: S.info && S.info.pvpoke, user_agent: `FAINTR desktop; ${navigator.userAgent}`.slice(0, 300) }) });
  if (!r.ok) throw new Error(`Couldn't send the report (${r.status}).`);
  return { ok: true };
}
$('#bugForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const row = { category: $('#bugCat').value, title: $('#bugTitle').value.trim(), details: $('#bugDetails').value.trim(), steps: $('#bugSteps').value.trim(),
    email: $('#bugEmail').value.trim(), page: S.lastView || 'Report a Bug', format: S.f };
  if (!row.title || row.details.length < 10) { $('#bugStatus').textContent = 'Add a short title and a few words about what happened.'; return; }
  $('#bugSend').disabled = true; $('#bugStatus').innerHTML = '<span class="spin"></span> Sending';
  try { await sendBug(row); $('#bugForm').reset(); $('#bugStatus').textContent = 'Thanks! Your report was sent.'; if (WEB && window.FAINTR_BRIDGE.webInfo().admin) loadBugs(); }
  catch (err) { $('#bugStatus').textContent = err.message; }
  $('#bugSend').disabled = false;
});
async function loadBugs() {
  if (!WEB || !window.FAINTR_BRIDGE.webInfo().admin) { $('#bugAdmin').hidden = true; return; }
  $('#bugAdmin').hidden = false;
  try {
    const list = await api('/api/bugs', undefined, { noF: true });
    $('#bugList').innerHTML = list.length ? list.map((b) => `<div class="bugrow" data-id="${b.id}"><div><b>${esc(b.title)}</b> <span class="fmtchip">${esc({ bug: 'Bug', data: 'Data', idea: 'Idea', other: 'Other' }[b.category] || b.category)}</span> <span class="fmtchip">${esc({ new: 'New', seen: 'Seen', fixed: 'Fixed', wontfix: "Won't fix" }[b.status] || b.status)}</span></div>
      <div class="note">${new Date(b.created_at).toLocaleString()} · ${esc(b.page || '')} · ${esc(b.format || '')}${b.email ? ` · ${esc(b.email)}` : ''}</div>
      <p>${esc(b.details)}</p>${b.steps ? `<pre class="note">${esc(b.steps)}</pre>` : ''}
      <div class="actions" style="margin-top:4px">${[['new', 'New'], ['seen', 'Seen'], ['fixed', 'Fixed'], ['wontfix', "Won't fix"]].map(([st, label]) => `<button class="btn small ${b.status === st ? '' : 'quiet'}" type="button" data-bugstatus="${st}" aria-pressed="${b.status === st}">${label}</button>`).join('')}</div></div>`).join('') : 'No reports yet.';
  } catch (e) { $('#bugList').textContent = e.message; }
}
$('#bugList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-bugstatus]'); if (!b) return;
  try { await window.FAINTR_BRIDGE.setBugStatus(+b.closest('[data-id]').dataset.id, b.dataset.bugstatus); loadBugs(); } catch (err) { showToast(err.message); }
});

// Accounts (website only)
const AUTH = { mode: 'in' };
const VIPUI = { battles: [], teams: [], alerts: [], seq: 0 };
function winText(value) { return value == null ? '—' : `${value.toFixed(1)}%`; }
function renderBattleLog() {
  const cup = $('#battleLogCupFilter').value, team = $('#battleLogTeamFilter').value;
  const entries = VIPUI.battles.filter(b => (!cup || b.format === cup) && (!team || b.teamId === team));
  const stats = window.FAINTR_VIP_TOOLS.battleStats(entries);
  const trend = stats.trend.slice(-40), points = trend.map((p, i) => `${40 + i / Math.max(1, trend.length - 1) * 560},${125 - (p.winRate || 0)}`).join(' ');
  $('#battleLogStats').innerHTML = `<div class="vipstatrow"><div><strong>${stats.count}</strong><span>Battles logged</span></div><div><strong>${stats.wins}–${stats.losses}–${stats.draws}</strong><span>Wins · losses · draws</span></div><div><strong>${winText(stats.winRate)}</strong><span>Win rate · draws excluded</span></div></div>${trend.length ? `<svg class="viptrend" viewBox="0 0 620 155" role="img" aria-label="Rolling win rate for up to the last 20 logged battles, from oldest to newest"><title>Rolling win rate. Most recent: ${winText(trend.at(-1).winRate)}</title><path d="M40 25H600 M40 75H600 M40 125H600" stroke="currentColor" opacity=".15"/><text x="0" y="29">100%</text><text x="7" y="79">50%</text><text x="15" y="129">0%</text><polyline points="${points}" stroke="#F5B800" stroke-width="3" fill="none"/><text x="40" y="150">Older</text><text x="550" y="150">Newer</text></svg>` : ''}
    ${stats.byTeam.length ? `<div class="scroll"><table class="t"><caption>Results by team and cup</caption><thead><tr><th>Team</th><th>Cup</th><th>Battles</th><th>Win rate</th></tr></thead><tbody>${stats.byTeam.map(g => `<tr><td>${esc(g.name)}</td><td>${esc(g.format)}</td><td>${g.count}</td><td>${winText(g.winRate)}</td></tr>`).join('')}</tbody></table></div><div class="scroll"><table class="t"><caption>Results by cup</caption><thead><tr><th>Cup</th><th>Battles</th><th>Win rate</th></tr></thead><tbody>${stats.byCup.map(g=>`<tr><td>${esc(g.format)}</td><td>${g.count}</td><td>${winText(g.winRate)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  $('#battleLogEntries').innerHTML = entries.length ? `<table class="t"><caption>Latest battles · showing up to 100</caption><thead><tr><th>Played</th><th>Team / cup</th><th>Result</th><th>Notes</th><th></th></tr></thead><tbody>${entries.slice().sort((a,b)=>b.at.localeCompare(a.at)).slice(0,100).map(b=>`<tr><td>${esc(new Date(b.at).toLocaleString())}</td><td>${esc(b.teamName)}<div class="note">${esc(b.formatTitle)}</div></td><td>${esc(b.result[0].toUpperCase()+b.result.slice(1))}</td><td class="battlelogtext">${esc(b.notes)}</td><td><button class="btn quiet small" type="button" data-remove-battle="${esc(b.id)}">Remove</button></td></tr>`).join('')}</tbody></table>` : '<p class="empty">No battles logged here yet. Save a team, then record your first result above.</p>';
}
function renderVipAlerts() {
  const unread = VIPUI.alerts.filter(a => !a.read).length;
  $('#vipAlertCount').textContent = unread ? `(${unread})` : '';
  $('#vipTab').textContent = unread ? `Battle tools · ${unread}` : 'Battle tools';
  $('#vipAlertList').innerHTML = VIPUI.alerts.length ? VIPUI.alerts.map(a => `<article class="vipalert ${a.read ? '' : 'unread'}"><h3>${esc(a.name)} <span class="fmtchip">${esc(S.info.formats.find(f=>f.key===a.format)?.title || a.format)}</span></h3><p>Overall score ${a.delta >= 0 ? '+' : ''}${a.delta.toFixed(1)} since the previous data version.</p><p class="note">${a.changes.map(c=>`${esc(G[c.key]?.label || c.key)}: ${esc(c.from)} → ${esc(c.to)}`).join(' · ') || 'The overall score changed; letter grades stayed the same.'}</p><p class="note">${esc(fmtVersion(a.from))} → ${esc(fmtVersion(a.to))}${a.read ? ' · Read' : ' · New'}</p><button class="btn small" type="button" data-goto="saved">Review My Teams</button></article>`).join('') : '<p class="empty">No changes to report. Save teams in My Teams; their grade changes will appear here after a data update.</p>';
}
async function loadVip() {
  if (!WEB) return;
  if (!window.FAINTR_BRIDGE.state.user) { $('#battleLogStatus').textContent = 'Sign in to save your battle log and use your roster across devices. All tools are free.'; $('#battleLogForm button').disabled = true; return; }
  const seq = ++VIPUI.seq;
  $('#battleLogStatus').textContent = 'Loading your battle tools…';
  try {
    const [battles, teams, alerts] = await Promise.all([api('/api/vip/battles', undefined, {noF:true}), api('/api/saved',undefined,{noF:true}), api('/api/vip/alerts',undefined,{noF:true})]);
    if (seq !== VIPUI.seq || !hasPremium()) return;
    VIPUI.battles = battles; VIPUI.teams = teams; VIPUI.alerts = alerts;
    const selected = $('#battleLogTeam').value;
    $('#battleLogTeam').innerHTML = teams.length ? teams.map(t=>`<option value="${esc(t.id)}">${esc(t.name)} · ${esc(t.title || t.f)}</option>`).join('') : '<option value="">Save a team in My Teams first</option>';
    if (teams.some(t=>t.id===selected)) $('#battleLogTeam').value = selected;
    const cupFilter = $('#battleLogCupFilter').value, teamFilter = $('#battleLogTeamFilter').value;
    $('#battleLogCupFilter').innerHTML = '<option value="">All cups</option>' + [...new Map(battles.map(b=>[b.format,b.formatTitle]))].map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');
    $('#battleLogTeamFilter').innerHTML = '<option value="">All teams</option>' + [...new Map(battles.map(b=>[b.teamId,b.teamName]))].map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');
    if (battles.some(b=>b.format===cupFilter)) $('#battleLogCupFilter').value = cupFilter;
    if (battles.some(b=>b.teamId===teamFilter)) $('#battleLogTeamFilter').value = teamFilter;
    if (!$('#battleLogDate').value) $('#battleLogDate').value = new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
    $('#battleLogForm button').disabled = !teams.length;
    renderBattleLog(); renderVipAlerts(); $('#battleLogStatus').textContent = '';
  } catch (err) { if (seq === VIPUI.seq) $('#battleLogStatus').textContent = err.message; }
}
function syncPremium() {
  if (!WEB) return;
  $('#vipTab').hidden = false;
  $('#authExport').hidden = false;
  $('#authIntro').textContent = 'All tools are free. Sign in to keep your roster, saved teams and battle history private and synced across devices.';
}
function openPremium() { if (WEB) openAuth(); }
if (WEB) {
  $('#battleLogRefresh').addEventListener('click', loadVip);
  $('#battleLogCupFilter').addEventListener('change', renderBattleLog); $('#battleLogTeamFilter').addEventListener('change', renderBattleLog);
  $('#battleLogForm').addEventListener('submit', async e => {
    e.preventDefault(); if (needPremium()) return;
    const team = VIPUI.teams.find(t=>t.id===$('#battleLogTeam').value);
    if (!team) { $('#battleLogStatus').textContent = 'Save a team in My Teams first.'; return; }
    const button = $('#battleLogForm button'); button.disabled = true;
    try { await api('/api/vip/battles',{teamId:team.id,format:team.f,result:$('#battleLogResult').value,at:new Date($('#battleLogDate').value).toISOString(),notes:$('#battleLogNotes').value},{noF:true}); $('#battleLogNotes').value=''; $('#battleLogDate').value=''; await loadVip(); showToast('Battle logged.'); } catch(err) { $('#battleLogStatus').textContent=err.message; } finally { button.disabled = false; }
  });
  $('#battleLogEntries').addEventListener('click',async e => {
    const button=e.target.closest('[data-remove-battle]'); if (!button) return;
    if (button.dataset.confirm !== 'yes') { button.dataset.confirm='yes'; button.textContent='Confirm removal'; return; }
    try { await api('/api/vip/battles/delete',{id:button.dataset.removeBattle},{noF:true}); await loadVip(); } catch(err) { $('#battleLogStatus').textContent=err.message; }
  });
  $('#vipAlertsRead').addEventListener('click',async () => {
    try { await api('/api/vip/alerts/read',{tokens:VIPUI.alerts.map(a=>a.token)},{noF:true}); VIPUI.alerts.forEach(a=>a.read=true); renderVipAlerts(); } catch(err) { $('#vipStatus').textContent=err.message; }
  });
  $('#vipUpgradeRun').addEventListener('click',async () => {
    if (needPremium()) return;
    const button=$('#vipUpgradeRun'); button.disabled=true; $('#vipUpgradeResults').innerHTML='<p class="note"><span class="spin"></span> Comparing your next builds…</p>';
    try {
      const data=await api('/api/vip/upgrades');
      $('#vipUpgradeIntro').textContent=`Your next builds for ${data.format}. ${data.readyCount} eligible Pokémon in the candidate pool have current CP marked ready.`;
      $('#vipUpgradeResults').innerHTML=data.suggestions.length ? `<p class="note">${data.baseline ? `Best team from your ready Pokémon: ${data.baseline.composite.toFixed(1)} overall.` : 'Add current CP for your Pokémon to establish a ready-team baseline.'} Team-score comparisons use the ranked pool’s standard IVs and moves. Check your actual build in Team Grader before spending Stardust, Candy or TMs.</p><div class="vipupgrades">${data.suggestions.map(c=>`<article class="vipupgrade"><span class="vipbadge subtle">${esc(c.action)}</span><h3>${esc(c.name)}</h3><p class="note">From ${esc(c.sourceName)} · IV rank ${fmt(c.ivRank)} · ${fmt(c.pctOfBest,1)}% of best stat product</p><p>Target: level ${c.level}, CP ${fmt(c.targetCp)}${c.needsXL ? ' · XL Candy needed' : ''}</p><p class="note">Recommended moves: ${esc(c.moves.join(', '))}</p>${c.improvement != null && c.improvement > .05 ? `<p class="vipgain">+${c.improvement.toFixed(1)} potential team score</p>` : c.team && !data.baseline ? '<p class="vipgain">Opens a complete team with your ready Pokémon</p>' : '<p class="note">Review this build for more roster options.</p>'}${c.team ? `<p class="note">Possible team: ${c.team.members.map(m=>esc(m.name)).join(' · ')}</p><button class="btn small" type="button" data-upgrade-team="${c.team.members.map(m=>esc(m.id)).join(',')}">Try team in grader</button>` : ''}</article>`).join('')}</div>` : '<p class="empty">No new builds found in this cup’s top candidate pool. Add more Pokémon or their current CP to your Roster, or select another cup.</p>';
    } catch(err) { $('#vipUpgradeResults').textContent=err.message; } finally { button.disabled=false; }
  });
  $('#vipUpgradeResults').addEventListener('click', e => { const button=e.target.closest('[data-upgrade-team]'); if (!button) return; loadIntoGrader(button.dataset.upgradeTeam.split(',').map(id=>({id}))); showView('grade'); runGrade(); });
  $('#authExport').addEventListener('click', async () => {
    try {
      const data = await window.FAINTR_BRIDGE.billing.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify({ app: 'FAINTR', exported: new Date().toISOString(), ...data }, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'faintr-account-data.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { $('#authStatus2').textContent = err.message; }
  });

}
function syncAccount() {
  if (!WEB) return;
  const B = window.FAINTR_BRIDGE, btn = $('#accountBtn');
  if (!B.auth.available) { btn.hidden = true; return; }
  btn.hidden = false;
  const u = B.state.user, prof = B.state.profile;
  btn.textContent = u ? ((prof && prof.display_name) || u.email.split('@')[0]) : 'Sign in';
  btn.classList.toggle('signedin', !!u);
  $('#bugEmailRow').hidden = !!u;
  // Each account has its own Roster; guests see a sign-in prompt there
  const gate = B.webInfo().rosterNeedsAccount;
  $('#rGate').hidden = !gate; $('#view-roster').classList.toggle('gated', gate);
  $('#rWhere').textContent = 'saved to your account';
  syncPremium();
}
function setAuthMode(m) {
  AUTH.mode = m;
  $$('#authMode button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === m));
  $('#authNameRow').hidden = m !== 'up';
  $('#authGo').textContent = m === 'up' ? 'Create account' : 'Sign in';
  $('#authTitle').textContent = m === 'up' ? 'Create your FAINTR account' : 'Sign in to FAINTR';
  $('#authPass').autocomplete = m === 'up' ? 'new-password' : 'current-password';
}
function openAuth() {
  const B = window.FAINTR_BRIDGE, u = B.state.user;
  $('#authOut').hidden = !!u; $('#authIn').hidden = !u; $('#authStatus').textContent = ''; $('#authStatus2').textContent = '';
  if (u) {
    $('#authWho').textContent = `Signed in as ${u.email}. Your Roster and saved teams are saved to your account.`;
    $('#authNewName').value = (B.state.profile && B.state.profile.display_name) || '';
    const c = B.auth.localCounts();
    $('#authMove').hidden = !c.saved;
    $('#authMove').innerHTML = `This browser also has ${c.saved} saved team${c.saved === 1 ? '' : 's'} from before you signed in. <button class="btn small" type="button" id="authMoveBtn">Add them to my account</button>`;
  }
  $('#authDlg').showModal();
}
if (WEB) {
  $('#accountBtn').addEventListener('click', openAuth);
  $('#rGateIn').addEventListener('click', () => { setAuthMode('in'); openAuth(); });
  $('#rGateUp').addEventListener('click', () => { setAuthMode('up'); openAuth(); });
  $('#authClose').addEventListener('click', () => $('#authDlg').close());
  $('#authMode').addEventListener('click', (e) => { const b = e.target.closest('button[data-m]'); if (b) setAuthMode(b.dataset.m); });
  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const A = window.FAINTR_BRIDGE.auth, email = $('#authEmail').value.trim(), pass = $('#authPass').value;
    $('#authStatus').innerHTML = '<span class="spin"></span> One moment';
    try {
      if (AUTH.mode === 'up') {
        const r = await A.signUp(email, pass, $('#authName').value.trim());
        $('#authStatus').textContent = r.session ? 'Account created. You are signed in.' : 'Check your email to confirm your account, then sign in.';
      } else { await A.signIn(email, pass); $('#authDlg').close(); showToast('Signed in.'); }
    } catch (err) { $('#authStatus').textContent = err.message; }
  });
  $('#authMagic').addEventListener('click', async () => {
    const email = $('#authEmail').value.trim(); if (!email) { $('#authStatus').textContent = 'Enter your email first.'; return; }
    try { await window.FAINTR_BRIDGE.auth.magicLink(email); $('#authStatus').textContent = 'Check your email for a sign-in link.'; } catch (err) { $('#authStatus').textContent = err.message; }
  });
  $('#authForgot').addEventListener('click', async () => {
    const email = $('#authEmail').value.trim(); if (!email) { $('#authStatus').textContent = 'Enter your email first.'; return; }
    try { await window.FAINTR_BRIDGE.auth.resetPassword(email); $('#authStatus').textContent = 'Check your email for a link to set a new password.'; } catch (err) { $('#authStatus').textContent = err.message; }
  });
  // Discord / Google buttons appear only for the sign-in methods turned on in config (FAINTR_LOGIN_PROVIDERS)
  const providers = String(CFG.loginProviders || '').split(/[,\s]+/).filter(Boolean);
  [['discord', '#authDiscord'], ['google', '#authGoogle']].forEach(([prov, sel]) => {
    $(sel).hidden = !providers.includes(prov);
    $(sel).addEventListener('click', async () => { try { await window.FAINTR_BRIDGE.auth.oauth(prov); } catch (err) { $('#authStatus').textContent = err.message; } });
  });
  $('#authAlt').hidden = !providers.some((p) => p === 'discord' || p === 'google');
  $('#authDelete').addEventListener('click', () => { $('#authDeleteConfirm').hidden = false; });
  $('#authDeleteYes').addEventListener('click', async () => {
    try { await window.FAINTR_BRIDGE.auth.deleteAccount(); $('#authDlg').close(); showToast('Your account and everything in it were deleted.'); } catch (err) { $('#authStatus2').textContent = err.message; }
  });
  $('#authSignOut').addEventListener('click', async () => { await window.FAINTR_BRIDGE.auth.signOut(); $('#authDlg').close(); showToast('Signed out.'); });
  $('#authSaveName').addEventListener('click', async () => { try { await window.FAINTR_BRIDGE.auth.setName($('#authNewName').value.trim()); $('#authStatus2').textContent = 'Saved.'; } catch (err) { $('#authStatus2').textContent = err.message; } });
  $('#authSetPass').addEventListener('click', async () => { try { await window.FAINTR_BRIDGE.auth.updatePassword($('#authPass2').value); $('#authStatus2').textContent = 'Password updated.'; $('#authNewPass').hidden = true; } catch (err) { $('#authStatus2').textContent = err.message; } });
  $('#authIn').addEventListener('click', async (e) => {
    if (e.target.id !== 'authMoveBtn') return;
    try { const r = await window.FAINTR_BRIDGE.auth.moveLocalToAccount(); $('#authMove').textContent = `Added ${r.saved} team${r.saved === 1 ? '' : 's'} to your account.`; await loadRoster(); if ($('#view-saved').classList.contains('on')) loadSaved(); } catch (err) { $('#authStatus2').textContent = err.message; }
  });
  // Signing in or out swaps which Roster and teams are shown
  window.FAINTR_BRIDGE.onChange(async (st, reason) => {
    if (reason === 'password-recovery') { syncAccount(); openAuth(); $('#authNewPass').hidden = false; return; }
    if (reason === 'membership') {
      syncPremium();
      if (S.booted) { await api('/core/membership', {}, { noF: true }); await loadRoster(); await setFormat(S.f, true); }
      return;
    }
    if (reason !== 'auth') return;
    VIPUI.seq++; VIPUI.battles=[]; VIPUI.teams=[]; VIPUI.alerts=[];
    if (WEB) { $('#battleLogStats').replaceChildren(); $('#battleLogEntries').replaceChildren(); $('#vipAlertList').replaceChildren(); $('#vipUpgradeResults').textContent='Find your next build for the selected cup.'; $('#savedList').replaceChildren(); }
    syncAccount();
    if (!S.info) return;
    if (PREMIUM) { await api('/core/membership', {}, { noF: true }); await setFormat(S.f, true); }
    if (WEB && $('#view-vip').classList.contains('on')) loadVip();
    await loadRoster().catch(() => {});
    if ($('#view-saved').classList.contains('on')) loadSaved();
    if ($('#view-bugs').classList.contains('on')) loadBugs();
    pollStatus();
    const c = window.FAINTR_BRIDGE.auth.localCounts();
    if (AUTH.returnToPremium && st.user) { AUTH.returnToPremium = false; $('#authDlg').close(); openPremium(); }
    if (st.user && c.saved && hasPremium() && !AUTH.offered) { AUTH.offered = true; showToast(`You have ${c.saved} saved team${c.saved === 1 ? '' : 's'} in this browser.`, { label: 'Add to my account', run: async () => { await window.FAINTR_BRIDGE.auth.moveLocalToAccount(); if ($('#view-saved').classList.contains('on')) loadSaved(); showToast('Added to your account.'); } }); }
  });
}
// Loading screen while the website starts its engine and downloads team data
function showLoader(title, loaded, total) {
  const L = $('#loader'); L.hidden = false;
  $('#loaderTitle').textContent = title;
  $('#loaderProg').max = total || 1; $('#loaderProg').value = total ? loaded : 0;
  $('#loaderNote').textContent = total ? `${(loaded / 1048576).toFixed(1)} of ${(total / 1048576).toFixed(1)} MB. Saved for next time.` : 'Starting the battle engine';
}

/* ======================= tabs + boot ======================= */
function showView(name) {
  if (['roster', 'saved'].includes(name) && needPremium()) return;
  const cur = $$('nav.tabs button[aria-selected="true"]')[0];
  if (cur && cur.dataset.view !== 'bugs') S.lastView = cur.textContent;
  if (name === 'bugs') loadBugs();
  $$('nav.tabs button').forEach((x) => x.setAttribute('aria-selected', x.dataset.view === name));
  $$('.view').forEach((v) => v.classList.toggle('on', v.id === 'view-' + name));
  if (name === 'meta' && !META) loadMeta();
  if (name === 'saved') loadSaved();
  if (name === 'news') loadNews();
  if (name === 'roster') renderRoster();
  if (name === 'vip') { syncPremium(); loadVip(); }
  if (name === 'ivs') { renderIvLeague(); if (!IVS.p) { const id = store.get('faintr.ivspecies'); if (id) fullCatalog().then((f) => { const p = f.find((c) => c.id === id); if (p && !IVS.p) setIvSpecies(p); }); } }
  window.scrollTo({ top: 0 });
}
$$('nav.tabs button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
async function loadInfo() {
  S.info = await api('/api/info', undefined, { noF: true });
  $('#datainfo').innerHTML = `<span class="dot"></span>Data from ${fmtVersion(S.info.pvpoke)}`;
  $('#datainfo').title = `PvPoke data from ${fmtVersion(S.info.pvpoke)}`;
}
(async function init() {
  if (WEB) {
    document.documentElement.classList.add('web');
    showLoader('Loading FAINTR');
    // Big team files load in the background; show progress while the first one arrives
    window.FAINTR_BRIDGE.onChange((st) => { if (st.progress && !S.booted) showLoader(st.progress.label, st.progress.loaded, st.progress.total); });
    try { await window.FAINTR_BRIDGE.ready; } catch (e) {
      $('#loaderTitle').textContent = "FAINTR couldn't start"; $('#loaderNote').textContent = `${e.message} Try reloading the page. Old browsers may not be supported.`; return;
    }
    syncAccount();
  }
  await loadInfo();
  S.weights = { ...S.info.weights };
  // Open on what's live in GO Battle League; keep your own pick only within the same week
  const saved = store.get('faintr.format'), period = S.info.live && S.info.live.now ? String(S.info.live.now.start) : 'none';
  const liveFirst = S.info.live && S.info.live.now ? S.info.live.now.formats[0].key : 'all-1500';
  S.f = saved && store.get('faintr.period') === period && S.info.formats.some((f) => f.key === saved) ? saved : liveFirst;
  store.set('faintr.period', period);
  S.fmt = await api('/api/format', undefined); S._cat = null;
  S.ownedOnly = store.get('faintr.ownedOnly') === '1';
  $('#ownedOnly').checked = S.ownedOnly;
  const rs = store.get('faintr.rsort'); if (rs) $('#rSort').value = rs;
  renderFormatBar();
  buildFilters(); buildSlots(); buildBattle();
  picker($('#pk-include'), (p) => { if (!S.include.some((x) => x.id === p.id)) S.include.push(p); renderChips('include'); scheduleQuery(); }, () => S.fmt.pool);
  picker($('#pk-exclude'), (p) => { if (!S.exclude.some((x) => x.id === p.id)) S.exclude.push(p); renderChips('exclude'); scheduleQuery(); }, () => S.fmt.pool);
  picker($('#pk-opp'), (p) => { if (!CF.opp.some((x) => x.id === p.id) && CF.opp.length < 3) CF.opp.push(p); renderChips('opp'); }, () => S.fmt.catalog);
  picker($('#pk-roster'), (p) => rfSetSpecies(p), fullSource);
  picker($('#pk-iv'), (p) => setIvSpecies(p), fullSource);
  renderIvLeague();
  S.anti = hasPremium() && store.get('faintr.anti') === '1';
  fullCatalog().catch(() => {});
  await loadRoster();
  await setFormat(S.f, true);
  S.booted = true;
  if (WEB) { $('#loader').hidden = true; api('/core/regrade', {}, { noF: true }).then(async () => {
    if (window.FAINTR_BRIDGE.state.user) { VIPUI.alerts=await api('/api/vip/alerts',undefined,{noF:true}); renderVipAlerts(); const count=VIPUI.alerts.filter(a=>!a.read).length; if (count) showToast(`${count} saved team${count===1?' has':'s have'} changed.`,{label:'View alerts',run:()=>showView('vip')}); }
  }).catch(() => {}); api('/core/refresh-roster', {}, { noF: true }).then(() => loadRoster()).catch(() => {}); }

  pollStatus();
})();
