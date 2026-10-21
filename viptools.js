// Account tools shared by the website worker and its regression checks.
function battleEntry(body, teams, formats, now = new Date()) {
  const team = teams.find(t => t.id === body.teamId);
  if (!team) throw new Error('Save a team in My Teams before logging a battle.');
  const format = formats.find(f => f.key === body.format);
  if (!format || format.key !== team.f) throw new Error('Choose the cup this saved team belongs to.');
  if (!['win', 'loss', 'draw'].includes(body.result)) throw new Error('Choose win, loss or draw.');
  const at = new Date(body.at || now);
  if (!Number.isFinite(+at) || +at > +now + 5 * 60000) throw new Error('Choose a valid battle date that is not in the future.');
  return { id: body.id || `b${+now}-${Math.random().toString(36).slice(2, 8)}`, teamId: team.id, teamName: team.name,
    members: team.members.map(m => ({ id: m.id })), format: format.key, formatTitle: format.title, result: body.result,
    at: at.toISOString(), notes: String(body.notes || '').slice(0, 500) };
}
function battleStats(entries) {
  const summarize = list => {
    const wins = list.filter(b => b.result === 'win').length, losses = list.filter(b => b.result === 'loss').length, draws = list.length - wins - losses;
    return { count: list.length, wins, losses, draws, winRate: wins + losses ? wins / (wins + losses) * 100 : null };
  };
  const group = key => {
    const groups = new Map();
    for (const b of entries) { const k = key(b); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); }
    return [...groups].map(([key, list]) => ({ key, name: list[0].teamName, format: list[0].formatTitle, ...summarize(list) }));
  };
  const chronological = entries.slice().sort((a, b) => a.at.localeCompare(b.at));
  return { ...summarize(entries), byTeam: group(b => `${b.teamId}|${b.format}`), byCup: group(b => b.format),
    trend: chronological.map((b, i) => ({ at: b.at, ...summarize(chronological.slice(Math.max(0, i - 19), i + 1)) })) };
}
function teamAlerts(teams, seen = []) {
  const read = new Set(seen);
  return teams.flatMap(team => {
    const [current, previous] = team.history || [];
    if (!current || !previous || current.version === previous.version) return [];
    const token = `${team.id}:${current.version}`;
    const changes = Object.entries(current.letters || {}).filter(([key, value]) => previous.letters?.[key] && previous.letters[key] !== value)
      .map(([key, value]) => ({ key, from: previous.letters[key], to: value }));
    const delta = (current.composite || 0) - (previous.composite || 0);
    if (!changes.length && Math.abs(delta) < 0.1) return [];
    return [{ token, teamId: team.id, name: team.name, format: team.f, from: previous.version, to: current.version, delta, changes, read: read.has(token) }];
  });
}

function upgradeCandidates(roster, statics, catalog, cp) {
  const pool = new Map(statics.map((s, i) => [s.id, { ...s, poolRank: i + 1 }]));
  const eligible = new Set(catalog.map(c => c.id));
  const ready = new Set(), candidates = [];
  for (const entry of roster) {
    const evaluations = [{ id: entry.id, name: entry.name, leagues: entry.eval?.leagues || [] }, ...(entry.eval?.evolves || [])];
    for (const target of evaluations) {
      if (!pool.has(target.id) || !eligible.has(target.id)) continue;
      const league = (target.leagues || []).find(l => l.cp === cp);
      if (!league || league.status === 'over') continue;
      const evolved = target.id !== entry.id;
      if (!evolved && league.status === 'ready') ready.add(target.id);
      const moves = pool.get(target.id).moveset || [];
      const missingMoves = !evolved && entry.moveset?.length && moves.some(id => !entry.moveset.includes(id));
      if (!evolved && league.status === 'ready' && !missingMoves) continue;
      candidates.push({ uid: entry.uid, sourceId: entry.id, sourceName: entry.nickname || entry.name, id: target.id, name: target.name,
        action: evolved ? 'Evolve and build' : league.status === 'powerup' ? 'Power up' : missingMoves ? 'Review moves' : 'Check current CP',
        level: league.level, targetCp: league.maxCp, ivRank: league.rank, pctOfBest: league.pctOfBest,
        needsXL: league.level > 40 && (!entry.eval?.currentLevel || entry.eval.currentLevel <= 40),
        moves: pool.get(target.id).moves || [], poolRank: pool.get(target.id).poolRank, missingMoves: !!missingMoves });
    }
  }
  // A second copy never creates an extra team slot. Pick the strongest IV copy per target.
  const unique = new Map();
  for (const c of candidates) { const old = unique.get(c.id); if (!old || c.pctOfBest > old.pctOfBest) unique.set(c.id, c); }
  return { ready: [...ready], candidates: [...unique.values()].sort((a, b) => a.poolRank - b.poolRank).slice(0, 30) };
}
module.exports = { battleEntry, battleStats, teamAlerts, upgradeCandidates };
