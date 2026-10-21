// A small pool of engine workers so simulations run in parallel and never block the UI server.
const path = require('path');
const os = require('os');
const { Worker } = require('worker_threads');

const ALLOWED = new Set(['memberRow', 'memberStatic', 'memberVs', 'ivInfo', 'battleDetail', 'rosterEval', 'ivTable', 'familyRanks']);
// Interactive calls jump ahead of background simulations
const PRIORITY = new Set(['ivInfo', 'battleDetail', 'memberStatic', 'memberVs', 'rosterEval', 'ivTable', 'familyRanks']);

class EnginePool {
  constructor(srcDir, size) {
    this.size = size || Math.max(2, Math.min(6, os.cpus().length - 1));
    this.srcDir = srcDir;
    this.queue = [];
    this.workers = [];
    this.seq = 0;
    this.pending = new Map();
    for (let i = 0; i < this.size; i++) this._spawn();
  }
  _spawn() {
    const w = new Worker(path.join(__dirname, 'engine_worker.js'), { workerData: { srcDir: this.srcDir } });
    w.busy = false;
    w.on('message', (m) => {
      const p = this.pending.get(m.id);
      this.pending.delete(m.id);
      w.busy = false;
      if (p) (m.error ? p.reject(new Error(m.error)) : p.resolve(m.result));
      this._drain();
    });
    w.on('error', (e) => { console.error('engine worker error', e); });
    w.on('exit', () => {
      this.workers = this.workers.filter((x) => x !== w);
      if (!this.closing) this._spawn();
    });
    this.workers.push(w);
  }
  _drain() {
    for (const w of this.workers) {
      if (w.busy || !this.queue.length) continue;
      const job = this.queue.shift();
      w.busy = true;
      this.pending.set(job.id, job);
      w.postMessage({ id: job.id, fn: job.fn, args: job.args });
    }
  }
  run(fn, ...args) {
    if (!ALLOWED.has(fn)) return Promise.reject(new Error('unknown engine call ' + fn));
    return new Promise((resolve, reject) => {
      const job = { id: ++this.seq, fn, args, resolve, reject };
      if (PRIORITY.has(fn)) { const i = this.queue.findIndex((j) => !PRIORITY.has(j.fn)); this.queue.splice(i < 0 ? this.queue.length : i, 0, job); } else this.queue.push(job);
      this._drain();
    });
  }
  async close() {
    this.closing = true;
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}

module.exports = { EnginePool };
