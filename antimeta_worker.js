// Worker: 3v3 chains on PvPoke's engine for Anti-Meta verification.
const vm = require('vm');
const { parentPort, workerData } = require('worker_threads');
const { makeCtx } = require('./build');
const ctx = makeCtx(workerData.srcDir);
const F = JSON.stringify({ cup: workerData.F.cup, cp: workerData.F.cp, meta: workerData.F.meta });
const LEADS = [[0, 1, 2], [1, 0, 2], [2, 0, 1]];
for (const job of workerData.jobs) {
  let wins = 0, games = 0;
  const beat = [];
  workerData.field.forEach((B, k) => {
    let w = 0;
    for (const o of LEADS) {
      const r = vm.runInContext(`chainGame(${JSON.stringify(job.team)}, ${JSON.stringify(o.map((j) => B[j]))}, ${F})`, ctx);
      if (r.win) { w++; wins++; }
      games++;
    }
    beat.push(w);
  });
  parentPort.postMessage({ res: { i: job.i, win: +(wins / games * 100).toFixed(2), beat } });
}
parentPort.postMessage({ done: true });
