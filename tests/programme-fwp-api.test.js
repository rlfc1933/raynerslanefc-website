// The official FWP API adapter — exercised against a stub fetch only. No
// request in this file reaches Football Web Pages, and passing these tests
// says nothing about whether the live API works (it needs a key the club does
// not hold yet).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const API = require('../netlify/functions/lib/programme/fwp-api');

function stubFetch(seq) {
  const calls = [];
  const f = async (url, opts) => {
    calls.push({ url, headers: opts.headers });
    const next = seq.length > 1 ? seq.shift() : seq[0];
    if (next instanceof Error) throw next;
    return { status: next.status, ok: next.status >= 200 && next.status < 300, json: async () => next.body };
  };
  f.calls = calls;
  return f;
}
const noSleep = () => Promise.resolve();

test('API key missing → degrades to the registry, makes no request', async () => {
  const f = stubFetch([{ status: 200, body: {} }]);
  const c = API.createClient({ key: '', fetchImpl: f, sleep: noSleep });
  const r = await c.match('590749');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.degraded, true);
  assert.strictEqual(r.source, 'registry');
  assert.strictEqual(f.calls.length, 0);
  const src = API.source({ api: c, registry: async () => ({ fixtures: ['registry'] }) });
  const s = await src.fetch('match', { match: '1' });
  assert.strictEqual(s.source, 'registry');
  assert.deepStrictEqual(s.data, { fixtures: ['registry'] });
});

test('the documented header carries the key, to the documented base URL', async () => {
  const f = stubFetch([{ status: 200, body: { ok: 1 } }]);
  const c = API.createClient({ key: 'k-123', fetchImpl: f, sleep: noSleep });
  const r = await c.match('590749');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(f.calls[0].url, 'https://api.footballwebpages.co.uk/v2/match.json?match=590749');
  assert.strictEqual(f.calls[0].headers['FWP-API-Key'], 'k-123');
});

test('undocumented endpoints and parameters are refused before any request', async () => {
  const f = stubFetch([{ status: 200, body: {} }]);
  const c = API.createClient({ key: 'k', fetchImpl: f, sleep: noSleep });
  assert.match((await c.get('news', {})).error, /undocumented endpoint/);
  assert.match((await c.get('match', { id: 1 })).error, /undocumented parameter/);
  assert.match((await c.get('fixtures-results', {})).error, /needs one of: comp, team/);
  assert.strictEqual(f.calls.length, 0);
});

test('the ten-per-minute budget is enforced and reported, not exceeded', async () => {
  const f = stubFetch([{ status: 200, body: {} }]);
  let t = 1e12;
  const c = API.createClient({ key: 'k', fetchImpl: f, sleep: noSleep, cacheMs: 0, budget: API.memoryBudget(10), now: () => t });
  for (let i = 0; i < 10; i++) assert.strictEqual((await c.match(String(i))).ok, true);
  const over = await c.match('11');
  assert.strictEqual(over.rateLimited, true);
  assert.strictEqual(f.calls.length, 10);
  t += 61000;
  assert.strictEqual((await c.match('12')).ok, true, 'the window slides');
});

test('transient errors retry with backoff; the key never appears in an error', async () => {
  const f = stubFetch([new Error('socket reset while sending k-SECRET'), { status: 503 }, { status: 200, body: { v: 1 } }]);
  const c = API.createClient({ key: 'k-SECRET', fetchImpl: f, sleep: noSleep });
  const r = await c.match('1');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(f.calls.length, 3);
  const g = stubFetch([new Error('down k-SECRET')]);
  const c2 = API.createClient({ key: 'k-SECRET', fetchImpl: g, sleep: noSleep });
  const r2 = await c2.match('1');
  assert.strictEqual(r2.ok, false);
  assert.ok(!JSON.stringify(r2).includes('k-SECRET'));
});

test('a 401 is not retried (it would only spend budget), and last good data is preserved', async () => {
  const f = stubFetch([{ status: 200, body: { v: 'good' } }, { status: 401 }]);
  const c = API.createClient({ key: 'k', fetchImpl: f, sleep: noSleep, cacheMs: 0 });
  await c.match('1');
  const r = await c.match('1');
  assert.strictEqual(r.status, 401);
  assert.deepStrictEqual(r.lastKnown.data, { v: 'good' });
  assert.strictEqual(f.calls.length, 2);
});

test('the key is read only on the server and never shipped to a browser', () => {
  const fs = require('fs'); const path = require('path');
  const root = path.join(__dirname, '..');
  const js = fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(root, 'js', f), 'utf8')).join('\n');
  assert.ok(!/FWP_API_KEY|FWP-API-Key|api\.footballwebpages/.test(js));
});
