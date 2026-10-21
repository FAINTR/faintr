// Engine worker: runs one heavy PvPoke job at a time (matchup rows, IV tables, battles) for the core worker.
const host = require('./enginehost');

const ALLOWED = new Set(['memberRow', 'memberStatic', 'memberVs', 'ivInfo', 'battleDetail', 'rosterEval', 'ivTable', 'familyRanks', 'chainGame']);

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    try { host.boot(m.manifest); self.postMessage({ type: 'ready' }); } catch (err) { self.postMessage({ type: 'fatal', error: err.message }); }
    return;
  }
  if (!ALLOWED.has(m.fn)) { self.postMessage({ id: m.id, error: `Unknown engine call ${m.fn}` }); return; }
  try {
    const result = self[m.fn](...m.args);
    self.postMessage({ id: m.id, result });
  } catch (err) {
    self.postMessage({ id: m.id, error: err.message || String(err) });
  }
};
