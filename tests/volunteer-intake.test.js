// A volunteer offer is saved first, then handed to Club OS (intakeVolunteer)
// best-effort — a Club OS failure, or an older club-os without the function,
// never fails the visitor's submission.
'use strict';
process.env.SUPABASE_URL = 'https://fake-supabase.local';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { makeDb, install } = require('../quality/tests/support/fake-supabase');

const CO_PATH = path.join(__dirname, '..', 'netlify', 'functions', 'club-os.js');
function load(clubOs) {
  for (const k of Object.keys(require.cache)) if (/netlify[\\/]functions/.test(k)) delete require.cache[k];
  require.cache[CO_PATH] = { id: CO_PATH, filename: CO_PATH, loaded: true, exports: clubOs };
  return require('../netlify/functions/submit-form');
}
let ip = 0;
const offer = (fn) => fn.handler({ httpMethod: 'POST', headers: { 'x-forwarded-for': '10.7.0.' + (++ip) },
  body: JSON.stringify({ type: 'volunteer', _elapsed: 5000, name: 'Val Test', email: 'val@example.com', phone: '07700900123', role: 'Help on one matchday', availability: 'Sat 31 Oct', message: 'Happy to help', consent: 'on' }) }).then((r) => JSON.parse(r.body));

test('volunteer offer → saved, then passed to intakeVolunteer with the chosen role', async () => {
  const db = makeDb(); const restore = install(db); const calls = [];
  try {
    const fn = load({ intakeVolunteer: async (v) => { calls.push(v); return { ok: true }; } });
    assert.deepEqual(await offer(fn), { ok: true });
    assert.equal(db.submissions.length, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].id, db.submissions[0].id);
    assert.deepEqual([calls[0].name, calls[0].email, calls[0].phone, calls[0].role, calls[0].availability, calls[0].message],
      ['Val Test', 'val@example.com', '07700900123', 'Help on one matchday', 'Sat 31 Oct', 'Happy to help']);
  } finally { restore(); delete require.cache[CO_PATH]; }
});

test('intakeVolunteer throwing, or missing, never fails the visitor', async () => {
  const db = makeDb(); const restore = install(db);
  try {
    assert.deepEqual(await offer(load({ intakeVolunteer: async () => { throw new Error('boom'); } })), { ok: true });
    assert.deepEqual(await offer(load({})), { ok: true });
    assert.equal(db.submissions.length, 2);
  } finally { restore(); delete require.cache[CO_PATH]; }
});
