// THE LANE 100 — real numbering from the database, honest counter, opt-in wall.
// Runs the REAL submit-form and lane-100 functions against the in-memory
// PostgREST stand-in used by the browser journeys.
'use strict';
process.env.SUPABASE_URL = 'https://fake-supabase.local';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
const test = require('node:test');
const assert = require('node:assert');
const { makeDb, install } = require('../quality/tests/support/fake-supabase');

function fresh() {
  for (const k of Object.keys(require.cache)) if (/netlify[\\/]functions/.test(k)) delete require.cache[k];
  return { submit: require('../netlify/functions/submit-form'), read: require('../netlify/functions/lane-100') };
}
let ip = 0;
async function join(fn, body) {
  const r = await fn.submit.handler({ httpMethod: 'POST', body: JSON.stringify({ type: 'lane100', _elapsed: 5000, consent: 'on', ...body }), headers: { 'x-forwarded-for': '10.0.0.' + (++ip) } });
  return JSON.parse(r.body);
}
async function count(fn) { return JSON.parse((await fn.read.handler({ httpMethod: 'GET' })).body); }

test('zero is an honest zero, then numbers come from real sign-ups in order', async () => {
  const db = makeDb(); const restore = install(db); const fn = fresh();
  try {
    assert.deepEqual(await count(fn), { ok: true, count: 0, target: 100, wall: [] });
    assert.deepEqual(await join(fn, { name: 'Sam Baker', email: 'sam@example.com', show_on_wall: 'on', town: 'Pinner' }), { ok: true, number: 1 });
    assert.deepEqual(await join(fn, { name: 'Alex Private', email: 'alex@example.com' }), { ok: true, number: 2 });
    const c = await count(fn);
    assert.equal(c.count, 2);
    assert.deepEqual(c.wall, [{ no: 1, name: 'Sam B.', town: 'Pinner' }]);   // only the opted-in member, no surname, no email
    assert.ok(!JSON.stringify(c).includes('example.com'));
  } finally { restore(); }
});

test('the same email cannot take a second number; consent and email are required', async () => {
  const db = makeDb(); const restore = install(db); const fn = fresh();
  try {
    await join(fn, { name: 'Sam Baker', email: 'sam@example.com' });
    assert.deepEqual(await join(fn, { name: 'Sam B', email: ' SAM@example.com ' }), { ok: false, error: 'already-joined' });
    assert.deepEqual(await join(fn, { name: 'No Consent', email: 'nc@example.com', consent: '' }), { ok: false, error: 'consent-required' });
    assert.deepEqual(await join(fn, { name: 'Phone Only', phone: '07700900000', email: '' }), { ok: false, error: 'email-required' });
    assert.equal(db.lane100_members.length, 1);
    assert.equal(db.submissions.length, 0);   // Lane 100 lives in its own table
  } finally { restore(); }
});

test('the 101st sign-up is refused, not numbered', async () => {
  const seed = Array.from({ length: 100 }, (_, i) => ({ id: 'm' + i, supporter_no: i + 1, name: 'M ' + i, email: `m${i}@example.com`, email_key: `m${i}@example.com`, status: 'active', show_on_wall: false }));
  const db = makeDb({ lane100_members: seed }); const restore = install(db); const fn = fresh();
  try {
    assert.deepEqual(await join(fn, { name: 'Late Comer', email: 'late@example.com' }), { ok: false, error: 'full' });
    assert.equal((await count(fn)).count, 100);
  } finally { restore(); }
});

test('database down → no number is claimed and the counter says unavailable', async () => {
  const restore = install({});   // no tables at all
  const fn = fresh();
  try {
    assert.deepEqual(await join(fn, { name: 'Sam Baker', email: 'sam@example.com' }), { ok: false, error: 'save-failed' });
    assert.equal((await count(fn)).ok, false);
  } finally { restore(); }
});

test('existing form types are unchanged: a volunteer offer is still a submissions row', async () => {
  const db = makeDb(); const restore = install(db); const fn = fresh();
  try {
    const r = await fn.submit.handler({ httpMethod: 'POST', body: JSON.stringify({ type: 'volunteer', _elapsed: 5000, name: 'Val Unteer', email: 'val@example.com', role: 'Help on one matchday' }), headers: { 'x-forwarded-for': '10.9.9.9' } });
    assert.deepEqual(JSON.parse(r.body), { ok: true });
    assert.equal(db.submissions[0].type, 'volunteer');
    assert.equal(db.submissions[0].payload.role, 'Help on one matchday');
  } finally { restore(); }
});
