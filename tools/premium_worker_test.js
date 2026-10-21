const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Anti-Meta is private, requires a valid account and paid entitlement, and fails closed', async () => {
  const src = fs.readFileSync(path.join(__dirname, '../web/premium-worker.js'), 'utf8')
    .replace('const data = __PREMIUM_DATA__;', 'const data = {"test-cup":{"verified":[1,2,3]}};')
    .replace('const supabaseUrl = __SUPABASE_URL__;', 'const supabaseUrl = "https://database.example";')
    .replace('const supabaseKey = __SUPABASE_KEY__;', 'const supabaseKey = "publishable_test";');
  const worker = (await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))).default;
  const original = global.fetch;
  let valid = false, paid = false, unavailable = false, calls = 0;
  global.fetch = async url => { calls++; if (unavailable) throw Error('offline'); return String(url).endsWith('/user') ? new Response('{}', {status: valid ? 200 : 401}) : new Response(JSON.stringify(paid)); };
  const run = (token = '') => worker.fetch(new Request('https://faintr.com/api/premium/antimeta?f=test-cup', { headers: token ? {Authorization: 'Bearer ' + token} : {} }), {});
  try {
    assert.equal((await run()).status, 401); assert.equal(calls, 0);
    assert.equal((await run('fake')).status, 401);
    valid = true; assert.equal((await run('valid')).status, 402);
    paid = true; const response = await run('valid'); assert.equal(response.status, 200); assert.deepEqual(await response.json(), {verified:[1,2,3]});
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    unavailable = true; assert.equal((await run('valid')).status, 503);
    const asset = await worker.fetch(new Request('https://faintr.com/'), {ASSETS:{fetch:async () => new Response('free tools')}});
    assert.equal(await asset.text(), 'free tools');
  } finally { global.fetch = original; }
});
