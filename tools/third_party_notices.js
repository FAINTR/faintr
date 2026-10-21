// License texts for the third-party code and fonts distributed to browsers.
const fs = require('fs');
const path = require('path');
function collectNotices(root) {
  const components = [
    ['PvPoke', 'assets/pvpoke-src/LICENSE-pvpoke.txt'],
    ['Inter font', 'node_modules/@fontsource/inter/LICENSE'],
    ...['supabase-js', 'auth-js', 'functions-js', 'postgrest-js', 'realtime-js', 'storage-js'].map(name => ['@supabase/' + name, 'node_modules/@supabase/' + name + '/LICENSE']),
    ['Phoenix JavaScript client', 'node_modules/@supabase/phoenix/LICENSE.md'],
    ['iceberg-js', 'node_modules/iceberg-js/LICENSE'],
    ['TypeScript runtime helpers', 'node_modules/tslib/LICENSE.txt'],
  ];
  return 'FAINTR — Third-party notices\n\nThese licenses apply to their respective software and fonts. They do not grant rights in Pokémon trademarks, characters, or other third-party game content.\n\n'
    + components.map(([name, file]) => name + '\n' + '='.repeat(name.length) + '\n\n' + fs.readFileSync(path.join(root, file), 'utf8').trim()).join('\n\n');
}
module.exports = { collectNotices };
