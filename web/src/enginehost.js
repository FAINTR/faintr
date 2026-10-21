// Runs PvPoke's battle engine inside a Web Worker: the browser twin of engine.js.
// PvPoke's scripts run in the worker's global scope with the same tiny jQuery shim as the desktop app.
// Data files are fetched on first use (synchronous XHR is allowed in workers) and cached.
const GLUE = require('../../engine_glue');
const GRADES = require('../../pvpoke_grades');
const MEMBERLIB = require('../../memberlib');

const ENGINE_FILES = ['js/GameMaster.js', 'js/pokemon/Pokemon.js', 'js/battle/DamageCalculator.js', 'js/battle/actions/ActionLogic.js',
  'js/battle/timeline/TimelineEvent.js', 'js/battle/timeline/TimelineAction.js', 'js/training/DecisionOption.js', 'js/battle/Battle.js',
  'js/battle/rankers/TeamRanker.js'];

let MANIFEST = null;
const FILES = {};

function fileUrl(rel) {
  const h = MANIFEST.files[rel];
  if (!h) throw new Error(`This data file isn't published: ${rel}`);
  return '/' + h;
}
function readData(u) {
  let rel = String(u).split('?')[0].replace(/^\/+/, '');
  if (rel.endsWith('gamemaster.min.json')) rel = rel.replace('gamemaster.min.json', 'gamemaster.json');
  if (!(rel in FILES)) {
    const x = new XMLHttpRequest();
    x.open('GET', fileUrl('pvpoke/' + rel), false);
    x.send();
    if (x.status !== 200) throw new Error(`Couldn't load ${rel} (${x.status}).`);
    FILES[rel] = JSON.parse(x.responseText.replace(/^\uFEFF/, ''));
  }
  return FILES[rel];
}

function makeJQ() {
  const stub = new Proxy(function () {}, {
    get: (t, p) => (p === 'length' ? 0 : p === Symbol.toPrimitive ? () => '' : stub),
    apply: () => stub,
  });
  const $ = function () { return stub; };
  $.__queue = [];
  $.ajax = (opts) => { $.__queue.push(opts); };
  $.__flush = () => { while ($.__queue.length) { const o = $.__queue.shift(); o.success && o.success(readData(o.url)); } };
  $.getJSON = (url, cb) => { cb(readData(url)); return { fail: () => {} }; };
  $.each = (obj, fn) => {
    if (Array.isArray(obj)) obj.forEach((v, i) => fn.call(v, i, v));
    else Object.keys(obj).forEach((k) => fn.call(obj[k], k, obj[k]));
    return obj;
  };
  return $;
}

let booted = false;
function boot(manifest) {
  MANIFEST = manifest;
  if (booted) return;
  const g = self;
  g.$ = makeJQ();
  g.host = 'https://pvpoke.com/';
  g.webRoot = '/';
  g.siteVersion = '1';
  g.get = false;
  g.settings = { defaultIVs: 'gamemaster', animateTimeline: 0, matrixDirection: 'row', gamemaster: 'gamemaster', pokeboxId: 0, pokeboxLastDateTime: 0,
    xls: true, rankingDetails: 'one-page', hardMovesetLinks: 0, colorblindMode: 0, performanceMode: 1, theme: 'default' };
  g.window = { localStorage: { getItem() { return null; }, setItem() {} }, location: { href: '' } };
  const realLog = console.log;
  console.log = () => {}; // PvPoke logs a lot
  importScripts(...ENGINE_FILES.map((f) => fileUrl('pvpoke/' + f)));
  const ev = (code) => (0, eval)(code);
  ev(GLUE.BOOT);
  g.__readData = readData;
  ev(GLUE.HELPERS);
  ev(GRADES);
  ev(MEMBERLIB);
  console.log = realLog;
  booted = true;
}

module.exports = { boot, readData, fileUrl, manifest: () => MANIFEST };
