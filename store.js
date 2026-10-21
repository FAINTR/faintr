// Per-user storage: settings, saved teams, updated data. Lives in %LOCALAPPDATA%\FAINTR (Windows).
const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE = process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share');
const USER_DIR = process.env.FAINTR_HOME || process.env.TRIAD_HOME || path.join(BASE, 'FAINTR');
// One-time move from the pre-rebrand folder (Triad) so saved teams and settings carry over
try {
  const legacy = path.join(BASE, 'Triad');
  if (!process.env.FAINTR_HOME && !process.env.TRIAD_HOME && !fs.existsSync(USER_DIR) && fs.existsSync(legacy)) fs.renameSync(legacy, USER_DIR);
} catch (e) { /* keep going with a fresh folder */ }
const USER_SRC = path.join(USER_DIR, 'pvpoke-src');
const USER_DATA = path.join(USER_DIR, 'data');
const SETTINGS = path.join(USER_DIR, 'settings.json');
const SAVED = path.join(USER_DIR, 'saved-teams.json');
const ROSTER = path.join(USER_DIR, 'roster.json');
const LOG = path.join(USER_DIR, 'update.log');

const DAMAGED = new Set();
// A damaged file is set aside (never silently overwritten), and the last good copy is used if there is one
function readJSON(f, fallback) {
  let text;
  try { text = fs.readFileSync(f, 'utf8'); } catch (e) { return fallback; }
  try { return JSON.parse(text); } catch (e) {
    if (!DAMAGED.has(f)) {
      DAMAGED.add(f);
      try { fs.copyFileSync(f, `${f}.damaged-${Date.now()}`); } catch (e2) { /* ignore */ }
      log(`could not read ${path.basename(f)}: ${e.message}; kept a copy and used the last good one`);
    }
    try {
      const good = JSON.parse(fs.readFileSync(f + '.bak', 'utf8'));
      fs.copyFileSync(f + '.bak', f); // put the last good copy back so this only happens once
      return good;
    } catch (e3) { return fallback; }
  }
}
function writeJSON(f, obj) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
  try { if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak'); } catch (e) { /* ignore */ }
  fs.renameSync(tmp, f);
}

const DEFAULT_SETTINGS = { autoUpdate: true, lastCheck: 0, lastUpdate: 0, installed: null };
const settings = {
  get() { return Object.assign({}, DEFAULT_SETTINGS, readJSON(SETTINGS, {})); },
  set(patch) { const s = Object.assign(settings.get(), patch); writeJSON(SETTINGS, s); return s; },
};

const saved = {
  all() { return readJSON(SAVED, []); },
  write(list) { writeJSON(SAVED, list); },
  upsert(team) {
    const list = saved.all();
    const i = list.findIndex((t) => t.id === team.id);
    if (i >= 0) list[i] = team; else list.unshift(team);
    saved.write(list);
    return team;
  },
  remove(id) { saved.write(saved.all().filter((t) => t.id !== id)); },
};

// Roster: the user's PvP-ready Pokemon (moves, IVs, CP, ball, shiny, optional picture)
const roster = {
  all() { return readJSON(ROSTER, []); },
  write(list) { writeJSON(ROSTER, list); },
  upsert(entry) {
    const list = roster.all();
    const i = list.findIndex((e) => e.uid === entry.uid);
    if (i >= 0) list[i] = entry; else list.push(entry);
    roster.write(list);
    return entry;
  },
  remove(uid) {
    const list = roster.all(), gone = list.find((e) => e.uid === uid);
    roster.write(list.filter((e) => e.uid !== uid));
    return gone || null;
  },
};

function log(line) {
  try { fs.mkdirSync(USER_DIR, { recursive: true }); fs.appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`); } catch (e) { /* ignore */ }
}

module.exports = { USER_DIR, USER_SRC, USER_DATA, settings, saved, roster, readJSON, writeJSON, log };
