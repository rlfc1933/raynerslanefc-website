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
    // Stronger than before: chairman-ness is no longer STORED at all. The
    // account row keeps only the role, and admin status is derived from it at
    // read time — so there is no flag to go stale, and none for a request to
    // set. The row cannot disagree with the role it holds.
    const src = strip(read('netlify/functions/staff-users.js'));
    assert.ok(!/is_chairman:/.test(src), 'no chairman flag may be written to the row');
    const login = strip(read('netlify/functions/staff-login.js'));
    assert.match(login, /ROLES\.ADMIN_ROLES\.indexOf\(u\.role\) > -1/,
      'it must be derived from the role the server holds');
    const session = strip(read('netlify/functions/md-session.js'));
    assert.match(session, /ROLES\.ADMIN_ROLES\.indexOf\(v\.user\.role\) > -1/);
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
    // The check moved into lib/staff-store.js with the store itself. The ORDER
    // is the guarantee: a disabled account is refused before its password is
    // read, so the right password cannot rescue it.
    const src = read('netlify/functions/lib/staff-store.js');
    const i = src.indexOf("reason: 'account-disabled'");
    const j = src.indexOf('timingSafeEqual');
    assert.ok(i > -1 && i < j, 'the disabled check must come first');
    assert.match(src, /account-disabled/);
  });

  await t.test('md-session refuses to mint a token for a disabled account', () => {
    // The store answers with a reason; md-session acts on it. No token is
    // issued at any authentication strength, which is what makes "disabled"
    // mean something in Match Day Ops as well as at sign-in.
    const src = read('netlify/functions/md-session.js');
    assert.match(src, /v\.reason === 'account-disabled'/);
    assert.match(src, /return resp\(200, \{ ok: false, error: 'account-disabled' \}\)/);
  });

  await t.test('disable preserves the account rather than deleting it', () => {
    // Disabling now goes through the store, which flips the flag and the status
    // and DELETES NOTHING — the row, the role and the history all survive.
    const src = strip(read('netlify/functions/staff-users.js'));
    assert.match(src, /STORE\.setDisabled\(username, action === 'disable'\)/);
    const store = strip(read('netlify/functions/lib/staff-store.js'));
    assert.match(store, /disabled: !!disabled, status: status/);
    assert.ok(!/delete /.test(store.match(/async function setDisabled[\s\S]*?\n\}/)[0]),
      'disable must never delete');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   8. SECRETS AND ROLES
   ══════════════════════════════════════════════════════════════════════════ */
test('NO SECRET LEAVES THE FUNCTION, AND NO ROLE IS INVENTED', async (t) => {
  await t.test('the user list never carries a password hash', () => {
    const u = FN._internal.publicUser({
      username: 'pete', role: 'Chairman', pass_hash: 'deadbeef', disabled: false,
    });
    assert.ok(!('pass_hash' in u), 'pass_hash must never be returned');
    assert.ok(!JSON.stringify(u).includes('deadbeef'));
    // Presence is still reportable — 'active' means a password exists — but the
    // value never is.
    assert.strictEqual(u.status, 'active');
  });

  await t.test('roles are validated against a server-side list', () => {
    assert.ok(FN._internal.ASSIGNABLE_ROLES.includes('Committee'));
    assert.ok(!FN._internal.ASSIGNABLE_ROLES.includes('Superuser'));
    // Both administrative roles: Chairman runs the club, System Maintainer keeps
    // the site working. Assigning either is escalation.
    assert.deepStrictEqual(Array.from(FN._internal.ADMIN_ROLES).sort(),
      ['Chairman', 'System Maintainer']);
    // This route's own list deliberately INCLUDES the administrative roles, so
    // that asking for one produces the honest refusal ("only a chairman-level
    // account can assign that role") rather than the untrue "that is not a role
    // this club uses". The guard is the escalation check below it, not the list.
    const src = strip(read('netlify/functions/staff-users.js'));
    assert.match(src, /const escalating = ADMIN_ROLES\.indexOf\(role\) > -1/);
    assert.match(src, /if \(escalating\) \{[\s\S]*?self_promotion[\s\S]*?no_admin_assign[\s\S]*?needs_elevated/,
      'assigning an administrative role needs a second person, the capability and elevation');
    // And the CLUB-WIDE list — the one everything else derives from — excludes
    // them, so no other caller can hand one out.
    const ROLES = require('../netlify/functions/lib/roles.js');
    assert.strictEqual(ROLES.ASSIGNABLE_ROLES.indexOf('System Maintainer'), -1);
    assert.strictEqual(ROLES.ASSIGNABLE_ROLES.indexOf('Chairman'), -1);
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
