const { test } = require('node:test');
const assert = require('node:assert/strict');
const { centralDay, selectedFormats, render, webhook, publish } = require('./discord-rankings.cjs');
const { loadTeams, query } = require('../teamdata');
const path = require('node:path');

test('Central calendar handles both daylight saving transitions', () => {
  assert.equal(centralDay(new Date('2026-03-08T05:30:00Z')), '2026-03-07');
  assert.equal(centralDay(new Date('2026-11-01T05:30:00Z')), '2026-11-01');
});

test('only built leagues and currently active cups are selected', () => {
  const formats = [{ key: 'all-1500', kind: 'league', built: true }, { key: 'now-1500', kind: 'cup', built: true }, { key: 'future-1500', kind: 'cup', built: true }, { key: 'empty-1500', kind: 'league', built: false }];
  const schedule = { periods: [{ start: '2026-10-20', end: '2026-10-25', formats: [['now-1500', 'Current']] }, { start: '2026-11-01', end: '2026-11-05', formats: [['future-1500', 'Future']] }] };
  assert.deepEqual(selectedFormats({ formats, schedule }, new Date('2026-10-22')), formats.slice(0, 2));
});

test('real league output preserves the scorer’s top 10, moves and mode labels within Discord limits', () => {
  const D = loadTeams(path.join(__dirname, '../assets/data/all-1500'));
  for (const mode of ['meta', 'anti']) {
    const body = render({ title: 'Great League' }, D, mode, '2026-10-22');
    const top = query(D, { limit: 10, ...(mode === 'anti' ? { mode: 'anti' } : {}) }).teams;
    assert.equal(body.embeds[0].fields.length, 10);
    assert.ok(body.embeds[0].fields[0].value.includes(top[0].members[0].name));
    for (const move of top[0].members[0].moves) assert.ok(body.embeds[0].fields[0].value.includes(move));
    assert.ok(!/undefined|\[object Object\]/.test(body.embeds[0].fields[0].value));
    assert.match(body.embeds[0].fields[0].value, /PvPoke: \*\*[ABCDF] [ABCDF] [ABCDF] [ABCDF]\*\*/);
    assert.deepEqual(body.allowed_mentions, { parse: [] });
  }
});

const urls = { meta: 'https://discord.com/api/webhooks/123/fakeMetaToken', anti: 'https://discord.com/api/webhooks/456/fakeAntiToken' };
const plans = { meta: ['great', 'ultra'].map(key => ({ key, body: { embeds: [{ title: key }], allowed_mentions: { parse: [] } } })), anti: ['great', 'ultra'].map(key => ({ key, body: { embeds: [{ title: key }], allowed_mentions: { parse: [] } } })) };
const destination = url => ({ guild_id: '1562164464135045121', channel_id: String(url).includes('/123/') ? '1562327310076608512' : '1562327349704527932' });

test('only exact Discord webhook URLs are accepted', () => {
  assert.equal(webhook(urls.meta).hostname, 'discord.com');
  for (const raw of ['https://discord.com.evil.example/api/webhooks/123/token', 'http://discord.com/api/webhooks/123/token', urls.meta + '?wait=true']) assert.throws(() => webhook(raw));
});

test('one everyone ping per feed, confirmed sends are skipped on retry', async () => {
  const sent = [], state = {};
  const fetcher = async (url, opt) => ({ ok: true, status: 200, json: async () => {
    if (opt.method === 'GET') return destination(url);
    sent.push(JSON.parse(opt.body)); return { id: String(1000 + sent.length) };
  } });
  await publish(plans, urls, state, () => {}, '2026-10-22', fetcher);
  assert.equal(sent.length, 4);
  assert.equal(sent.filter(x => x.content?.startsWith('@everyone')).length, 2);
  assert.equal(sent.filter(x => x.allowed_mentions.parse.includes('everyone')).length, 2);
  await publish(plans, urls, state, () => {}, '2026-10-22', fetcher);
  assert.equal(sent.length, 4);
});

test('wrong destination is rejected before any posts', async () => {
  let posts = 0;
  const fetcher = async (url, opt) => { if (opt.method === 'POST') posts++; return { ok: true, status: 200, json: async () => ({ guild_id: 'another-server', channel_id: 'wrong-channel' }) }; };
  await assert.rejects(publish(plans, urls, {}, () => {}, '2026-10-22', fetcher), /wrong channel/);
  assert.equal(posts, 0);
});

test('setup posts can be sent without mass pings', async () => {
  const sent = [];
  const fetcher = async (url, opt) => ({ ok: true, status: 200, json: async () => {
    if (opt.method === 'GET') return destination(url);
    sent.push(JSON.parse(opt.body)); return { id: String(1000 + sent.length) };
  } });
  await publish(plans, urls, {}, () => {}, '2026-10-22', fetcher, true);
  assert.ok(sent.every(body => !body.content?.includes('@everyone') && body.allowed_mentions.parse.length === 0));
});

test('ambiguous send fails closed and is not automatically repeated', async () => {
  const state = {}; let posts = 0;
  const fetcher = async (url, opt) => {
    if (opt.method === 'POST') { posts++; throw new Error('timeout'); }
    return { ok: true, status: 200, json: async () => destination(url) };
  };
  await assert.rejects(publish(plans, urls, state, () => {}, '2026-10-22', fetcher), /uncertain/);
  await assert.rejects(publish(plans, urls, state, () => {}, '2026-10-22', fetcher), /uncertain/);
  assert.equal(posts, 1);
});
