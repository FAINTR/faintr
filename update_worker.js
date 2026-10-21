// Builds one format's team data off the server thread (used by updates and first-time cup builds).
const { parentPort, workerData } = require('worker_threads');
const { buildAll } = require('./build');

buildAll(workerData.srcDir, workerData.outDir, {
  fmt: workerData.fmt,
  poolSize: 150,
  version: workerData.version,
  leaveOneCore: true,
  onProgress: (stage, i, n) => parentPort.postMessage({ progress: { stage, i, n } }),
}).then(() => parentPort.postMessage({ done: true }), (e) => parentPort.postMessage({ error: e.message }));
