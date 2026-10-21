const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { verifyPvpokeLicense } = require('../pvpoke-license');
const approved = fs.readFileSync(path.join(__dirname, '../assets/pvpoke-src/LICENSE-pvpoke.txt'), 'utf8');
test('approved upstream notice tolerates transport line endings and preserves the notice', () => {
  assert.equal(verifyPvpokeLicense('\uFEFF' + approved.replace(/\r?\n/g, '\r\n')).toString().trim(), approved.replace(/\r\n/g, '\n').trim());
});
test('unreviewed license text stops automatic publication', () => {
  for (const text of ['', 'Permission for noncommercial use only', approved + '\nAdditional restrictions apply.']) {
    assert.throws(() => verifyPvpokeLicense(text), /license changed/);
  }
});
