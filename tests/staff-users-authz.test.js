// ════════════════════════════════════════════════════════════════════════════
// PHASE 0 — THE STAFF-ACCOUNT ESCALATION BOUNDARY.
//
// The 2026-08-05 audit found that staff-users.js read the chairman flag out of
// the request body behind nothing but the shared club PIN:
//
//     is_chairman: (b.isChairman != null ? !!b.isChairman : …) || (b.role === 'Chairman')
//
// One POST made anybody Chairman. These tests exist so that can never be true
// again, and so the specification's Nigel rule — disable, but not promote — is
// a property of the code rather than a paragraph in a document.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

// A signing key so md-auth will actually mint and verify tokens under test.
process.env.MD_TOKEN_SECRET = process.env.MD_TOKEN_SECRET || 'test-secret-at-least-16-chars-long';
process.env.ADMIN_PIN = process.env.ADMIN_PIN || 'test-pin-1234';

const AUTH = require('../netlify/functions/lib/md-auth.js');
const AUTHZ = require('../netlify/functions/lib/authz.js');
const FN = require('../netlify/functions/staff-users.js');

const PIN = process.env.ADMIN_PIN;

/** A real signed token, exactly as md-session would mint one. */
function tokenFor(username, role, isChairman, auth) {
  return AUTH.issue({ username, role, isChairman: !!isChairman, auth: auth || 'custom' });
}
function call(method, body, token, qs) {
  return FN.handler({
    httpMethod: method,
    headers: token ? { authorization: 'Bearer ' + token } : {},
    queryStringParameters: qs || (method === 'GET' ? { pin: PIN } : null),
    body: body ? JSON.stringify(body) : null,
  });
}
const parse = (r) => { try { return JSON.parse(r.body); } catch (e) { return {}; } };

/* ══════════════════════════════════════════════════════════════════════════
   1. THE ORIGINAL EXPLOIT
   ══════════════════════════════════════════════════════════════════════════ */
test('THE PIN ALONE CANNOT ADMINISTER STAFF ACCOUNTS', async (t) => {
  await t.test('the exact original exploit is refused', async () => {
    // This is the request that used to make anybody Chairman.
    const r = await call('POST', {
      pin: PIN, action: 'add', username: 'attacker',
      password: 'longenoughpassword', isChairman: true,
    });
    assert.strictEqual(r.statusCode, 401, 'PIN + forged flag must be refused');
    assert.strictEqual(parse(r).ok, false);
  });

  await t.test('a body-supplied role of Chairman is refused too', async () => {
    const r = await call('POST', {
      pin: PIN, action: 'add', username: 'attacker',
      password: 'longenoughpassword', role: 'Chairman',
    });
    assert.strictEqual(r.statusCode, 401);
  });

  await t.test('no token at all is refused on every write action', async () => {
    for (const action of ['add', 'setpassword', 'setrole', 'disable', 'enable', 'remove']) {
      const r = await call('POST', { pin: PIN, action, username: 'x', password: 'longenoughpw' });
      assert.strictEqual(r.statusCode, 401, action + ' must require a session');
    }
  });

  await t.test('a wrong PIN is still refused even with a valid token', async () => {
    const r = await call('POST', { pin: 'wrong', action: 'disable', username: 'x' },
      tokenFor('Pete', 'Chairman', true));
    assert.strictEqual(r.statusCode, 401);
  });

  await t.test('an unsigned / forged token is refused', async () => {
    for (const bad of ['not-a-token', '', 'a.b.c', Buffer.from('{"u":"Pete","r":"Chairman"}').toString('base64')]) {
      const r = await call('POST', { pin: PIN, action: 'disable', username: 'x' }, bad);
      assert.strictEqual(r.statusCode, 401, 'forged token accepted: ' + bad);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. THE BODY IS NEVER AN AUTHORISATION CLAIM
   ══════════════════════════════════════════════════════════════════════════ */
test('NOTHING IN THE REQUEST BODY GRANTS AUTHORITY', async (t) => {
  await t.test('isChairman is not read from the body at all', () => {
    const src = strip(read('netlify/functions/staff-users.js'));
    assert.ok(!/b\.isChairman|body\.isChairman/.test(src),
      'the chairman flag must never be read from the request — that was the vulnerability');
  });

  await t.test('is_chairman is derived from the server-validated role', () => {
    const src = strip(read('netlify/functions/staff-users.js'));
    assert.match(src, /is_chairman: ADMIN_ROLES\.indexOf\(role\) > -1/);
  });

  await t.test('a committee member supplying isChairman:true stays ordinary', async () => {
    const r = await call('POST', {
      pin: PIN, action: 'add', username: 'someone',
      password: 'longenoughpassword', isChairman: true,
    }, tokenFor('Jenny', 'Committee', false));
    // Refused for lack of capability — and the flag never even reaches the store.
    assert.strictEqual(r.statusCode, 403);
    assert.match(parse(r).error, /permission/i);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. CAPABILITIES ARE SEPARATE, NOT ONE BLANKET RIGHT
   ══════════════════════════════════════════════════════════════════════════ */
test('EACH ACTION NEEDS ITS OWN CAPABILITY', async (t) => {
  await t.test('the six capabilities are distinct', () => {
    const caps = Object.values(AUTHZ.CAP);
    assert.strictEqual(new Set(caps).size, caps.length, 'no duplicate capability names');
    assert.ok(caps.includes('can_manage_users'),
      'the pre-existing la_permissions name must be reused, not duplicated');
  });

  await t.test('Chairman holds all six; V Chairman holds view + disable only', () => {
    assert.strictEqual(AUTHZ.DEFAULT_CAPS['Chairman'].length, 6);
    assert.deepStrictEqual(AUTHZ.DEFAULT_CAPS['V Chairman'],
      [AUTHZ.CAP.VIEW_STAFF, AUTHZ.CAP.DISABLE_ACCOUNT]);
  });

  await t.test('an ordinary committee member holds none', async () => {
    const sess = { username: 'Jenny', role: 'Committee', isChairman: false, auth: 'custom', elevated: true };
    for (const cap of Object.values(AUTHZ.CAP)) {
      assert.strictEqual(await AUTHZ.can(sess, cap), false, 'Committee must not hold ' + cap);
    }
  });

  await t.test('Marketing/Media holds none', async () => {
    const sess = { username: 'Smallz', role: 'Marketing/Media', isChairman: false, auth: 'custom', elevated: true };
    assert.strictEqual(await AUTHZ.can(sess, AUTHZ.CAP.MANAGE_USERS), false);
    assert.strictEqual(await AUTHZ.can(sess, AUTHZ.CAP.DISABLE_ACCOUNT), false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. THE NIGEL RULE — disable, but never promote
   ══════════════════════════════════════════════════════════════════════════ */
test('DISABLE-ONLY ACCESS IS TECHNICALLY EXPRESSIBLE', async (t) => {
  const nigel = { username: 'Nigel', role: 'V Chairman', isChairman: false, auth: 'custom', elevated: true };

  await t.test('V Chairman CAN disable', async () => {
    assert.strictEqual(await AUTHZ.can(nigel, AUTHZ.CAP.DISABLE_ACCOUNT), true);
  });

  await t.test('V Chairman CANNOT create, reset, assign roles or escalate', async () => {
    for (const cap of [AUTHZ.CAP.MANAGE_USERS, AUTHZ.CAP.RESET_CREDENTIALS,
                       AUTHZ.CAP.ASSIGN_ROLES, AUTHZ.CAP.ASSIGN_ADMIN]) {
      assert.strictEqual(await AUTHZ.can(nigel, cap), false, 'V Chairman must not hold ' + cap);
    }
  });

  await t.test('V Chairman is refused when creating an account', async () => {
    const r = await call('POST', { pin: PIN, action: 'add', username: 'newperson', password: 'longenoughpw' },
      tokenFor('Nigel', 'V Chairman', false));
    assert.strictEqual(r.statusCode, 403);
  });

  await t.test('the reasoning is recorded where the rule lives', () => {
    const src = read('netlify/functions/lib/authz.js');
    assert.match(src, /if the compromised account is the Chairman's, there is nobody/,
      'the why must travel with the rule');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. SELF-PROMOTION AND SELF-HARM
   ══════════════════════════════════════════════════════════════════════════ */
test('AN ADMINISTRATOR CANNOT PROMOTE OR DELETE THEMSELVES', async (t) => {
  const src = strip(read('netlify/functions/staff-users.js'));

  await t.test('self-promotion is refused even for a Chairman', () => {
    assert.match(src, /if \(isSelf\) return refuse\('self_promotion'/);
  });
  await t.test('self-disable is refused', () => {
    assert.match(src, /refuse\('self_disable'/);
  });
  await t.test('self-removal is refused', () => {
    assert.match(src, /refuse\('self_remove'/);
  });
  await t.test('isSelf compares case-insensitively', () => {
    assert.match(src, /username\.toLowerCase\(\) === String\(actor\.username \|\| ''\)\.toLowerCase\(\)/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6. ELEVATION — the shared committee password is not enough
   ══════════════════════════════════════════════════════════════════════════ */
test('HIGH-RISK ACTIONS NEED A PERSONAL PASSWORD', async (t) => {
  await t.test('shared-password sessions are refused for elevated capabilities', async () => {
    const r = await call('POST', { pin: PIN, action: 'add', username: 'x', password: 'longenoughpw' },
      tokenFor('Pete', 'Chairman', true, 'shared'));
    assert.strictEqual(r.statusCode, 403);
    assert.match(parse(r).error, /own personal password/i);
  });

  await t.test('the elevated set covers creation, credential reset and escalation', () => {
    assert.deepStrictEqual(AUTHZ.ELEVATED.slice().sort(),
      [AUTHZ.CAP.ASSIGN_ADMIN, AUTHZ.CAP.MANAGE_USERS, AUTHZ.CAP.RESET_CREDENTIALS].sort());
  });

  await t.test('md-auth remains the elevation authority — not reimplemented', () => {
    const src = read('netlify/functions/lib/authz.js');
    assert.match(src, /require\('\.\/md-auth'\)/);
    assert.match(src, /v\.auth === 'custom'/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   7. DISABLE ACTUALLY STOPS A LOGIN
   ══════════════════════════════════════════════════════════════════════════ */
test('DISABLING AN ACCOUNT IS NOT JUST A LABEL', async (t) => {
  await t.test('staff-login refuses a disabled account before checking the password', () => {
    const src = read('netlify/functions/staff-login.js');
    const i = src.indexOf("u.disabled");
    const j = src.indexOf("u.pass_hash !== hash");
    assert.ok(i > -1 && i < j, 'the disabled check must come first');
    assert.match(src, /account-disabled/);
  });

  await t.test('md-session refuses to mint a token for a disabled account', () => {
    const src = read('netlify/functions/md-session.js');
    assert.match(src, /u && u\.disabled/);
    assert.match(src, /account-disabled/);
  });

  await t.test('disable preserves the account rather than deleting it', () => {
    const src = strip(read('netlify/functions/staff-users.js'));
    assert.match(src, /disabled_at:.*new Date\(\)\.toISOString\(\)/);
    assert.match(src, /disabled_by: action === 'disable' \? actor\.username : null/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   8. SECRETS AND ROLES
   ══════════════════════════════════════════════════════════════════════════ */
test('NO SECRET LEAVES THE FUNCTION, AND NO ROLE IS INVENTED', async (t) => {
  await t.test('the user list never carries a password hash', () => {
    const u = FN._internal.publicUser('Pete', {
      role: 'Chairman', is_chairman: true, pass_hash: 'deadbeef', disabled: false,
    });
    assert.ok(!('pass_hash' in u), 'pass_hash must never be returned');
    assert.strictEqual(u.has_custom_password, true, 'presence may be reported, never the value');
  });

  await t.test('roles are validated against a server-side list', () => {
    assert.ok(FN._internal.ASSIGNABLE_ROLES.includes('Committee'));
    assert.ok(!FN._internal.ASSIGNABLE_ROLES.includes('Superuser'));
    assert.deepStrictEqual(FN._internal.ADMIN_ROLES, ['Chairman']);
  });

  await t.test('an unknown role is refused', async () => {
    const r = await call('POST', { pin: PIN, action: 'setrole', username: 'x', role: 'Superuser' },
      tokenFor('Pete', 'Chairman', true));
    assert.strictEqual(parse(r).ok, false);
  });

  await t.test('the audit writer never receives a secret', () => {
    const src = read('netlify/functions/lib/authz.js');
    const fn = /async function audit\(entry\)[\s\S]*?\n}/.exec(src)[0];
    assert.ok(!/pass_hash|password|token|pin/i.test(fn.replace(/\/\/.*$/gm, '')),
      'the audit payload must carry states and roles, never secrets');
    assert.match(fn, /auth: e\.auth/, 'authentication STRENGTH is recorded, not the secret');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   9. FAIL CLOSED
   ══════════════════════════════════════════════════════════════════════════ */
test('EVERY UNCERTAINTY FAILS CLOSED', async (t) => {
  await t.test('an unknown action is refused before any capability lookup', async () => {
    const r = await call('POST', { pin: PIN, action: 'nonsense', username: 'x' },
      tokenFor('Pete', 'Chairman', true));
    assert.strictEqual(r.statusCode, 400);
  });

  await t.test('can() returns false for a null session', async () => {
    assert.strictEqual(await AUTHZ.can(null, AUTHZ.CAP.MANAGE_USERS), false);
  });

  await t.test('an unreachable database does not widen access', () => {
    const src = read('netlify/functions/lib/authz.js');
    assert.match(src, /must never\s*\n?\s*\/\/ widen access/,
      'the catch path must fall back to the default map, never to allow');
  });

  await t.test('a database row can DENY as well as grant', () => {
    const src = read('netlify/functions/lib/authz.js');
    assert.match(src, /if \(rows && rows\.length\) return !!rows\[0\]\.granted/,
      'granted:false must be honoured, not treated as absent');
  });
});
