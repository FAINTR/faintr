// Regression check for PvPoke JSON containing a UTF-8 byte-order mark.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const engine = require('../engine');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'assets/pvpoke-src');
const marked = 'data/groups/laic2027.json';
assert.equal(fs.readFileSync(path.join(src, marked), 'utf8').charCodeAt(0), 0xFEFF);

engine.load(src);
const expected = engine.readData(marked);
assert.ok(expected.length > 0);

// Run the real browser engine host with local files standing in for HTTP.
const sandbox = {
  module: { exports: {} },
  require: (name) => require(path.resolve(root, 'web/src', name)),
  console: { log() {}, warn() {}, error() {} },
  XMLHttpRequest: class {
    open(method, url) { this.url = url; }
    send() {
      this.responseText = fs.readFileSync(path.join(src, this.url.replace(/^\//, '')), 'utf8');
      this.status = 200;
    }
  },
};
sandbox.self = sandbox;
const context = vm.createContext(sandbox);
sandbox.importScripts = (...urls) => {
  for (const url of urls) vm.runInContext(fs.readFileSync(path.join(src, url.replace(/^\//, '')), 'utf8'), context);
};
vm.runInContext(fs.readFileSync(path.join(root, 'web/src/enginehost.js'), 'utf8'), context);
const files = Object.fromEntries([...engine.ENGINE_FILES, 'data/gamemaster.json', marked, 'data/groups/great.json'].map((file) => ['pvpoke/' + file, file]));
const host = sandbox.module.exports;
host.boot({ files });
assert.equal(JSON.stringify(host.readData('/' + marked + '?v=1')), JSON.stringify(expected));
assert.strictEqual(host.readData(marked), host.readData(marked));
assert.equal(JSON.stringify(host.readData('data/groups/great.json')), JSON.stringify(engine.readData('data/groups/great.json')));
console.log('Desktop and browser engine hosts load BOM-prefixed and ordinary PvPoke JSON successfully.');
