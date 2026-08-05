// la-seed-staff — the SECOND staff-account creation route, retired 5 Aug 2026.
//
// Phase 0 closed the escalation in staff-users.js. This route could still
// create a CHAIRMAN account behind nothing but the shared club PIN, which
// would have made that work decorative — two doors, one still unlocked.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const SRC = read('netlify/functions/la-seed-staff.js');
const CODE = strip(SRC);

function call(env, body, method) {
  const saved = process.env.NODE_ENV, savedSeed = process.env.LA_ALLOW_DEV_SEED;
  if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env;
  delete process.env.LA_ALLOW_DEV_SEED;
  delete require.cache[require.resolve('../netlify/functions/la-seed-staff.js')];
  const fn = require('../netlify/functions/la-seed-staff.js');
  const p = fn.handler({ httpMethod: method || 'POST', headers: {}, body: JSON.stringify(body || {}) });
  process.env.NODE_ENV = saved; if (savedSeed) process.env.LA_ALLOW_DEV_SEED = savedSeed;
  return p;
}
const parse = (r) => { try { return JSON.parse(r.body); } catch (e) { return {}; } };

test('THE SECOND ACCOUNT-CREATION DOOR IS CLOSED', async (t) => {
  await t.test('the exact exploit is refused in production', async () => {
    // One request that used to create a chairman.
    const r = await call('production', {
      pin: 'whatever-the-club-pin-is', username: 'attacker', code: '1234', role: 'chairman',
    });
    assert.strictEqual(r.statusCode, 410, 'must be Gone, not merely Unauthorized');
    assert.strictEqual(parse(r).retired, true);
  });

  await t.test('an ABSENT NODE_ENV is treated as production', async () => {
    // Fail closed: an unset variable must never re-open account creation.
    const r = await call(undefined, { pin: 'x', username: 'a', code: '1234', role: 'chairman' });
    assert.strictEqual(r.statusCode, 410);
  });

  await t.test('refused on every method, before the body is read', async () => {
    for (const m of ['POST', 'GET', 'PUT', 'DELETE']) {
      const r = await call('production', { pin: 'x' }, m);
      assert.strictEqual(r.statusCode, 410, m + ' must be refused');
    }
  });

  await t.test('the refusal names where accounts are actually managed', async () => {
    const r = await call('production', {});
    assert.match(parse(r).error, /Staff Logins/);
    assert.match(parse(r).error, /not the shared club PIN/);
  });

  await t.test('the PIN is no longer even consulted', () => {
    assert.ok(!/adminOk/.test(CODE),
      'the shared PIN must not appear as a gate — it was the vulnerability');
    assert.ok(!/require\(.*lib\/pin.*\)/.test(CODE));
  });

  await t.test('production refusal precedes every other branch', () => {
    const gate = CODE.indexOf('isProduction()');
    const body = CODE.indexOf('parseBody');
    const store = CODE.indexOf('la_app_users');
    assert.ok(gate > -1 && gate < body && gate < store,
      'nothing may be parsed or read before the route refuses');
  });

  await t.test('even the development path cannot mint a chairman', () => {
    assert.match(CODE, /\['manager', 'coach', 'staff'\]/);
    assert.ok(!/'chairman'/.test(CODE.split('isProduction')[1] || ''),
      'chairman must not be seedable at any environment');
    assert.match(CODE, /Chairman cannot be seeded/);
  });

  await t.test('the development path needs an explicit opt-in that Netlify lacks', () => {
    assert.match(CODE, /LA_ALLOW_DEV_SEED/);
    assert.ok(!/netlify\.toml/.test(read('netlify.toml').includes('LA_ALLOW_DEV_SEED') ? 'x' : ''),
      'placeholder');
    assert.ok(!read('netlify.toml').includes('LA_ALLOW_DEV_SEED'),
      'the dev opt-in must not be configured in netlify.toml');
  });

  await t.test('no secret is logged when the route is called', () => {
    const warn = /console\.warn\([\s\S]*?\);/.exec(SRC)[0];
    assert.ok(!/pin|password|hash|token/i.test(warn.replace(/\/\/.*$/gm, '')),
      'the refusal log must not carry a credential');
  });
});

test('ONE SUPPORTED ACCOUNT PATH REMAINS', async (t) => {
  await t.test('staff-users is capability-gated', () => {
    assert.match(read('netlify/functions/staff-users.js'), /require\('\.\/lib\/authz'\)/);
  });
  await t.test('la-staff-admin is capability-gated', () => {
    assert.match(read('netlify/functions/la-staff-admin.js'), /L\.can\(sess, 'can_manage_users'\)/);
  });
  await t.test('no remaining function creates a staff account on the PIN alone', () => {
    const dir = path.join(ROOT, 'netlify/functions');
    const offenders = [];
    fs.readdirSync(dir).filter((f) => f.endsWith('.js')).forEach((f) => {
      const s = strip(fs.readFileSync(path.join(dir, f), 'utf8'));
      const creates = /ins\('la_app_users'|setJSON\('users'/.test(s);
      const pinOnly = /adminOk\(/.test(s) && !/lib\/authz|L\.can\(/.test(s);
      if (creates && pinOnly) offenders.push(f);
    });
    assert.deepStrictEqual(offenders, [],
      'these create accounts behind the shared PIN alone: ' + offenders.join(', '));
  });
});
