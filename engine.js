// Loads PvPoke's browser scripts into a Node vm context with a tiny jQuery shim.
// Data is read synchronously from the local PvPoke checkout.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const GLUE = require('./engine_glue');

const PVPOKE = process.env.PVPOKE_DIR || '/root/pvpoke';
const SRC = path.join(PVPOKE, 'src');

let SRC_DIR = SRC;
function readData(url) {
  // url looks like "/data/rankings/all/overall/rankings-1500.json?v=1"
  let rel = url.split('?')[0].replace(/^\/+/, '');
  if (rel.endsWith('gamemaster.min.json')) rel = rel.replace('gamemaster.min.json', 'gamemaster.json');
  return JSON.parse(fs.readFileSync(path.join(SRC_DIR, rel), 'utf8').replace(/^\uFEFF/, ''));
}

function makeJQ() {
  // Chainable no-op for any DOM call
  const stub = new Proxy(function () {}, {
    get: (t, p) => (p === 'length' ? 0 : p === Symbol.toPrimitive ? () => '' : stub),
    apply: () => stub,
  });
  const $ = function () { return stub; };
  $.__queue = [];
  $.ajax = (opts) => { $.__queue.push(opts); };
  $.__flush = () => {
    while ($.__queue.length) {
      const opts = $.__queue.shift();
      try { opts.success && opts.success(readData(opts.url)); }
      catch (e) { console.error('ajax fail', opts.url, e); throw e; }
    }
  };
  $.getJSON = (url, cb) => { cb(readData(url)); return { fail: () => {} }; };
  $.each = (obj, fn) => {
    if (Array.isArray(obj)) obj.forEach((v, i) => fn.call(v, i, v));
    else Object.keys(obj).forEach((k) => fn.call(obj[k], k, obj[k]));
    return obj;
  };
  return $;
}

function load(srcDir) {
  if (srcDir) SRC_DIR = srcDir;
  const ctx = {
    console: { log() {}, warn() {}, error: console.error },
    $: makeJQ(),
    host: 'https://pvpoke.com/',
    webRoot: '/',
    siteVersion: '1',
    get: false,
    settings: {
      defaultIVs: 'gamemaster', animateTimeline: 0, matrixDirection: 'row',
      gamemaster: 'gamemaster', pokeboxId: 0, pokeboxLastDateTime: 0, xls: true,
      rankingDetails: 'one-page', hardMovesetLinks: 0, colorblindMode: 0,
      performanceMode: 1, theme: 'default',
    },
    window: { localStorage: { getItem() { return null; }, setItem() {} }, location: { href: '' } },
    Math, JSON, Date, Array, Object, String, Number, Boolean, Set, Map, Symbol, Promise,
    parseInt, parseFloat, isNaN, isFinite, setTimeout, clearTimeout,
  };
  ctx.self = ctx.window;
  vm.createContext(ctx);
  const files = [
    'js/GameMaster.js',
    'js/pokemon/Pokemon.js',
    'js/battle/DamageCalculator.js',
    'js/battle/actions/ActionLogic.js',
    'js/battle/timeline/TimelineEvent.js',
    'js/battle/timeline/TimelineAction.js',
    'js/training/DecisionOption.js',
    'js/battle/Battle.js',
    'js/battle/rankers/TeamRanker.js',
  ];
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(SRC_DIR, f), 'utf8'), ctx, { filename: f });
  }
  vm.runInContext(GLUE.BOOT, ctx);
  ctx.__readData = readData;
  vm.runInContext(GLUE.HELPERS, ctx);
  return ctx;
}

// Engine + data files needed at runtime (relative to src/)
const ENGINE_FILES = ['js/GameMaster.js', 'js/pokemon/Pokemon.js', 'js/battle/DamageCalculator.js', 'js/battle/actions/ActionLogic.js',
  'js/battle/timeline/TimelineEvent.js', 'js/battle/timeline/TimelineAction.js', 'js/training/DecisionOption.js', 'js/battle/Battle.js',
  'js/battle/rankers/TeamRanker.js'];
module.exports = { load, readData, PVPOKE, SRC, ENGINE_FILES };
