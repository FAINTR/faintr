// Leagues and cups FAINTR supports, discovered from PvPoke's game master.
// Great, Ultra and Master League are always present; cups come and go each season.
const fs = require('fs');
const path = require('path');

const LEAGUES = [
  { key: 'all-1500', cup: 'all', cp: 1500, meta: 'great', title: 'Great League', short: 'Great', kind: 'league', bundled: true },
  { key: 'all-2500', cup: 'all', cp: 2500, meta: 'ultra', title: 'Ultra League', short: 'Ultra', kind: 'league', bundled: true },
  { key: 'all-10000', cup: 'all', cp: 10000, meta: 'master', title: 'Master League', short: 'Master', kind: 'league', bundled: true },
];
// Cups that ship with team data already built and get their own button (while PvPoke lists them)
const FEATURED = {};
const CATEGORIES = ['overall', 'leads', 'closers', 'switches'];
const LEAGUE_NAME = { 500: 'Little', 1500: 'Great', 2500: 'Ultra', 10000: 'Master' };

function rankingFile(cup, cat, cp) { return `data/rankings/${cup}/${cat}/rankings-${cp}.json`; }

// All formats PvPoke currently lists (plus the three leagues). srcDir lets us drop cups whose files are missing.
function listFormats(gamemaster, srcDir, scheduledKeys = []) {
  const out = LEAGUES.map((f) => ({ ...f }));
  const seen = new Set(out.map((f) => f.key));
  for (const f of gamemaster.formats || []) {
    const key = `${f.cup}-${f.cp}`;
    if ((!f.showFormat && !scheduledKeys.includes(key)) || f.cup === 'custom' || f.cup === 'all') continue;
    if (seen.has(key)) continue;
    const cupDef = (gamemaster.cups || []).find((c) => c.name === f.cup);
    if (!f.showFormat && !cupDef) continue; // A schedule name is not a set of battle rules.
    const cupForFiles = (cupDef && cupDef.rankingAlias) || f.cup;
    if (srcDir && !fs.existsSync(path.join(srcDir, rankingFile(cupForFiles, 'overall', f.cp)))) continue;
    seen.add(key);
    out.push({ key, cup: f.cup, cp: f.cp, meta: f.meta || (f.cp === 2500 ? 'ultra' : f.cp === 10000 ? 'master' : 'great'),
      title: f.title, short: (FEATURED[key] && FEATURED[key].short) || f.title, league: LEAGUE_NAME[f.cp] || `${f.cp} CP`, kind: 'cup',
      bundled: !!FEATURED[key], featured: !!FEATURED[key], filesCup: cupForFiles });
  }
  return out;
}

// GO Battle League schedule: what's live now and next (schedule.json, edited each season)
function loadSchedule(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { periods: [] }; }
}
function periodAt(schedule, formats, when) {
  const t = when || Date.now(), have = new Set(formats.map((f) => f.key));
  const ps = (schedule.periods || []).map((p) => ({ start: Date.parse(p.start), end: Date.parse(p.end), formats: p.formats.filter(([k]) => have.has(k)).map(([key, label]) => ({ key, label })) }))
    .filter((p) => p.formats.length).sort((a, b) => a.start - b.start);
  const now = ps.filter((p) => p.start <= t && t < p.end).pop() || null; // the later one wins when two overlap
  const next = ps.find((p) => p.start > t && (!now || p.start >= now.end - 1)) || ps.find((p) => p.start > t) || null;
  return { now, next, season: schedule.season || '' };
}

// Data files needed to run a set of formats (relative to src/)
function dataFilesFor(formats) {
  const files = new Set(['data/gamemaster.json']);
  for (const f of formats) {
    const cup = f.filesCup || f.cup;
    CATEGORIES.forEach((c) => files.add(rankingFile(cup, c, f.cp)));
    files.add(`data/groups/${f.meta}.json`);
  }
  // Little Cup is used by the Roster's league check even when it isn't a listed format
  CATEGORIES.forEach((c) => files.add(rankingFile('little', c, 500)));
  files.add('data/groups/little.json');
  return [...files];
}

module.exports = { LEAGUES, FEATURED, CATEGORIES, loadSchedule, periodAt, listFormats, dataFilesFor, rankingFile };
