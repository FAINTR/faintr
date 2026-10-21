// Engine worker: one PvPoke context per thread, answers whitelisted calls from pool.js.
const vm = require('vm');
const { parentPort, workerData } = require('worker_threads');
const { makeCtx } = require('./build');

const ctx = makeCtx(workerData.srcDir);
parentPort.on('message', ({ id, fn, args }) => {
  try {
    ctx.__args = args;
    const result = vm.runInContext(`${fn}.apply(null, __args)`, ctx);
    parentPort.postMessage({ id, result });
  } catch (e) {
    parentPort.postMessage({ id, error: e.message || String(e) });
  }
});
