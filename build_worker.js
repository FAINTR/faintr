// Worker: simulate assigned candidates against every threat in one format.
const vm = require('vm');
const { parentPort, workerData } = require('worker_threads');
const { makeCtx } = require('./build');

const ctx = makeCtx(workerData.srcDir);
const F = JSON.stringify({ cup: workerData.F.cup, cp: workerData.F.cp, meta: workerData.F.meta });
for (const c of workerData.cands) {
  const row = vm.runInContext(`memberRow(${JSON.stringify(c.id)}, ${JSON.stringify(c.moveset)}, ${F})`, ctx);
  parentPort.postMessage({ row });
}
parentPort.postMessage({ done: true });
