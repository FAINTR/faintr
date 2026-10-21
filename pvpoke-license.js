// Stop an automatic update if upstream's license differs from the reviewed text.
const fs = require('fs');
const path = require('path');
const normalize = value => String(value).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
function verifyPvpokeLicense(text) {
  const approved = fs.readFileSync(path.join(__dirname, 'assets/pvpoke-src/LICENSE-pvpoke.txt'), 'utf8');
  if (normalize(text) !== normalize(approved)) throw new Error('PvPoke license changed. Review its terms before downloading and publishing an update.');
  return Buffer.from(normalize(text) + '\n');
}
module.exports = { verifyPvpokeLicense };
