// ════════════════════════════════════════════════════════════════════════════
// STAFF INVITATIONS — nobody handles anybody else's password.
//
// The alternative was a temporary password per person, handed over by message.
// Between creation and first login that is a working credential in a channel
// nobody controls — and for the Chairman, a full administrative login sitting
// in somebody's chat history. These tests hold the replacement to its promise.
//
// Every test runs against an in-memory store. Nothing can reach the club's
// real staff accounts.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeDriver } = require('./helpers/staff-store-driver.js');
const STORE = require('../netlify/functions/lib/staff-store.js');

process.env.MD_TOKEN_SECRET = process.env.MD_TOKEN_SECRET || 'test-secret-at-least-16-chars-long';
process.env.ADMIN_PIN = process.env.ADMIN_PIN || 'test-pin-1234';
const PIN = process.env.ADMIN_PIN;

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const AUTH = require('../netlify/functions/lib/md-auth.js');
const INV = require('../netlify/functions/lib/invitations.js');
// Point every store read/write at memory. Nothing in this file can reach the
// club's real staff accounts.
let DB = makeDriver();
STORE._setDriver(DB);
const INVITE_FN = require('../netlify/functions/staff-invite.js');
const ACTIVATE_FN = require('../netlify/functions/staff-activate.js');
const BOOTSTRAP_FN = require('../netlify/functions/staff-bootstrap.js');

const tok = (u, r, chair, auth) => AUTH.issue({ username: u, role: r, isChairman: !!chair, auth: auth || 'custom' });
const parse = (r) => { try { return JSON.parse(r.body); } catch (e) { return {}; } };
const invite = (body, token) => INVITE_FN.handler({
  httpMethod: 'POST', headers: token ? { authorization: 'Bearer ' + token } : {},
  body: JSON.stringify(Object.assign({ pin: PIN }, body)),
});
const activate = (body) => ACTIVATE_FN.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(body) });
const PETE = () => tok('pete', 'Chairman', true, 'custom');

test.beforeEach(() => { DB = makeDriver(); STORE._setDriver(DB); });

/* ══════════════════════════════════════════════════════════════════════════ */
test('A TOKEN IS SHOWN ONCE AND STORED NEVER', async (t) => {
  await t.test('creation returns a raw token', async () => {
    const r = await invite({ action: 'create', username: 'jenny', name: 'Jenny Pitt',
      title: 'Secretary', profile: 'Match Day Secretary' }, PETE());
    const j = parse(r);
    assert.strictEqual(j.ok, true, j.error);
    assert.ok(j.setupToken && j.setupToken.length >= 40, 'a real token must come back');
    assert.match(j.notice, /will not be shown again/);
  });

  await t.test('only a HASH is persisted — the raw token is nowhere', async () => {
    const j = parse(await invite({ action: 'create', username: 'jenny', profile: 'Committee' }, PETE()));
    const stored = JSON.stringify(DB._tables.la_staff_invitations);
    assert.ok(!stored.includes(j.setupToken), 'the raw token must not be in the store');
    assert.match(stored, /"token_hash":"[a-f0-9]{64}"/, 'a sha-256 hash is what is kept');
  });

  await t.test('listing invitations never returns a token or a hash', async () => {
    await invite({ action: 'create', username: 'jenny', profile: 'Committee' }, PETE());
    const j = parse(await invite({ action: 'list' }, PETE()));
    const s = JSON.stringify(j);
    assert.ok(!/token_hash|setupToken/.test(s), 'the list must carry neither');
    assert.strictEqual(j.invitations[0].status, 'pending');
  });

  await t.test('the token is 32 bytes of CSPRNG and unique each time', () => {
    const a = INV.mintToken(), b = INV.mintToken();
    assert.notStrictEqual(a, b);
    assert.ok(Buffer.from(a, 'base64url').length >= 32);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
test('AN INVITATION WORKS EXACTLY ONCE', async (t) => {
  async function fresh(username, profile) {
    return parse(await invite({ action: 'create', username, profile: profile || 'Committee' }, PETE())).setupToken;
  }

  await t.test('redeeming activates the account', async () => {
    const token = await fresh('jenny', 'Match Day Secretary');
    const j = parse(await activate({ token, password: 'a-good-long-password', confirm: 'a-good-long-password' }));
    assert.strictEqual(j.ok, true, j.error);
    const jenny = DB._tables.la_staff_users.find((r) => r.username === 'jenny');
    assert.ok(jenny.pass_hash, 'a password hash is stored');
    assert.strictEqual(jenny.status, 'active', 'the account is now active');
    // Chairman-ness is no longer stored at all — it is derived from the role,
    // so there is no flag that could be set on an ordinary account.
    assert.ok(!('is_chairman' in jenny));
  });

  await t.test('the plain password is never stored', async () => {
    const token = await fresh('jenny');
    await activate({ token, password: 'plain-text-password-here', confirm: 'plain-text-password-here' });
    const dump = JSON.stringify(DB._tables);
    assert.ok(!dump.includes('plain-text-password-here'), 'the password must not appear anywhere');
  });

  await t.test('the same token cannot be used twice', async () => {
    const token = await fresh('jenny');
    await activate({ token, password: 'a-good-long-password', confirm: 'a-good-long-password' });
    const j = parse(await activate({ token, password: 'another-long-password', confirm: 'another-long-password' }));
    assert.strictEqual(j.ok, false);
    // The message is now IDENTICAL for every bad token — used, expired,
      // revoked or never real. A caller probing tokens must not learn which.
      assert.match(j.error, /Something went wrong|not valid|try again/i);
  });

  await t.test('a wrong token is refused, and says nothing useful', async () => {
    await fresh('jenny');
    const j = parse(await activate({ token: 'not-a-real-token', password: 'a-good-long-password', confirm: 'a-good-long-password' }));
    assert.strictEqual(j.ok, false);
    assert.match(j.error, /not valid/);
    assert.ok(!/expired|used|revoked/.test(j.error), 'must not reveal whether a token existed');
  });

  await t.test('an expired token is refused', async () => {
    const token = await fresh('jenny');
    const all = DB._tables.la_staff_invitations;
    Object.keys(all).forEach((k) => { all[k].expires_at = new Date(Date.now() - 1000).toISOString(); });
    const j = parse(await activate({ token, password: 'a-good-long-password', confirm: 'a-good-long-password' }));
    // The message is now IDENTICAL for every bad token — used, expired,
      // revoked or never real. A caller probing tokens must not learn which.
      assert.match(j.error, /Something went wrong|not valid|try again/i);
  });

  await t.test('a revoked token is refused', async () => {
    const token = await fresh('jenny');
    const id = parse(await invite({ action: 'list' }, PETE())).invitations[0].id;
    await invite({ action: 'revoke', id }, PETE());
    const j = parse(await activate({ token, password: 'a-good-long-password', confirm: 'a-good-long-password' }));
    // The message is now IDENTICAL for every bad token — used, expired,
      // revoked or never real. A caller probing tokens must not learn which.
      assert.match(j.error, /Something went wrong|not valid|try again/i);
  });

  await t.test('a REPLACEMENT invalidates the previous link', async () => {
    const first = await fresh('jenny');
    const second = await fresh('jenny');
    assert.notStrictEqual(first, second);
    const a = parse(await activate({ token: first, password: 'a-good-long-password', confirm: 'a-good-long-password' }));
    assert.strictEqual(a.ok, false, 'the old link must stop working');
    const b = parse(await activate({ token: second, password: 'a-good-long-password', confirm: 'a-good-long-password' }));
    assert.strictEqual(b.ok, true, 'the new link must work');
  });

  await t.test('mismatched confirmation is refused', async () => {
    const token = await fresh('jenny');
    const j = parse(await activate({ token, password: 'a-good-long-password', confirm: 'different-password-x' }));
    assert.match(j.error, /do not match/);
  });

  await t.test('a short password is refused', async () => {
    const token = await fresh('jenny');
    const j = parse(await activate({ token, password: 'short', confirm: 'short' }));
    assert.match(j.error, /at least 10/);
  });

  await t.test('an invitation cannot reset a LIVE account', async () => {
    const token = await fresh('jenny');
    await activate({ token, password: 'a-good-long-password', confirm: 'a-good-long-password' });
    const second = await fresh('jenny');
    const j = parse(await activate({ token: second, password: 'hijack-this-account', confirm: 'hijack-this-account' }));
    assert.strictEqual(j.ok, false, 'a live account must not be re-passworded by invitation');
    assert.match(j.error, /already set up/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
test('A PENDING ACCOUNT CANNOT SIGN IN', async (t) => {
  await t.test('it is created with no password hash', async () => {
    await invite({ action: 'create', username: 'jenny', profile: 'Committee' }, PETE());
    const u = DB._tables.la_staff_users.find(r => r.username === 'jenny');
    assert.strictEqual(u.status, 'setup_required');
    assert.strictEqual(u.pass_hash, undefined, 'no password exists until they set one');
  });

  await t.test('staff-login cannot admit a row with no hash', () => {
    // The check moved into lib/staff-store.js with the store itself. An account
    // with no password is refused by name — it is never treated as a match.
    const store = read('netlify/functions/lib/staff-store.js');
    assert.match(store, /if \(!u\.pass_hash\) return \{ ok: false, reason: 'setup-required' \}/,
      'a pending row must be refused explicitly');
    const login = read('netlify/functions/staff-login.js');
    assert.match(login, /STORE\.verifyPassword\(/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
test('INVITING IS AN ADMINISTRATIVE ACT', async (t) => {
  await t.test('no session means no invitation', async () => {
    const r = await invite({ action: 'create', username: 'x', profile: 'Committee' });
    assert.strictEqual(r.statusCode, 401);
  });

  await t.test('the club PIN alone is not enough', async () => {
    const r = await invite({ action: 'create', username: 'x', profile: 'Committee' }, 'forged-token');
    assert.strictEqual(r.statusCode, 401);
  });

  await t.test('an ordinary committee member cannot invite', async () => {
    const r = await invite({ action: 'create', username: 'x', profile: 'Committee' },
      tok('jenny', 'Committee', false));
    assert.strictEqual(r.statusCode, 403);
  });

  await t.test('Nigel can view but cannot invite', async () => {
    const nigel = tok('nigel', 'V Chairman', false);
    assert.strictEqual((await invite({ action: 'list' }, nigel)).statusCode, 200);
    assert.strictEqual((await invite({ action: 'create', username: 'x', profile: 'Committee' }, nigel)).statusCode, 403);
  });

  await t.test('Nigel cannot invite a Chairman', async () => {
    const r = await invite({ action: 'create', username: 'x', profile: 'Chairman' },
      tok('nigel', 'V Chairman', false));
    assert.strictEqual(r.statusCode, 403);
  });

  await t.test('a Chairman invitation needs a personal password, not the shared one', async () => {
    const r = await invite({ action: 'create', username: 'x', profile: 'Chairman' },
      tok('pete', 'Chairman', true, 'shared'));
    assert.strictEqual(r.statusCode, 403);
  });

  await t.test('an unknown profile is refused', async () => {
    const j = parse(await invite({ action: 'create', username: 'x', profile: 'Superuser' }, PETE()));
    assert.strictEqual(j.ok, false);
  });

  await t.test('the audit never carries a token', async () => {
    const src = strip(read('netlify/functions/staff-invite.js'));
    const audits = src.match(/AUTHZ\.audit\(\{[\s\S]*?\}\)/g) || [];
    audits.forEach((a) => assert.ok(!/setupToken|made\.token|token:/.test(a),
      'an audit entry must not contain a token'));
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
test('THE TOKEN-MINTING BOOTSTRAP IS RETIRED', async (t) => {
  // It produced a setup TOKEN that somebody had to copy out of a terminal and
  // carry to Pete — a live credential in transit, seen by whoever ran it.
  // chairman-setup.html replaced it: Pete types his own password directly, so
  // no token exists at any point. Two routes that can both make a first
  // Chairman is one more than the club needs.
  const call = (body) => BOOTSTRAP_FN.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(body || {}) });

  await t.test('it refuses unconditionally, flag or no flag', async () => {
    delete process.env.STAFF_BOOTSTRAP_ENABLED;
    assert.strictEqual((await call({})).statusCode, 410);
    process.env.STAFF_BOOTSTRAP_ENABLED = '1';
    const r = await call({ username: 'pete' });
    assert.strictEqual(r.statusCode, 410);
    assert.strictEqual(parse(r).retired, true);
    delete process.env.STAFF_BOOTSTRAP_ENABLED;
  });

  await t.test('it can no longer mint a token at all', () => {
    const code = strip(read('netlify/functions/staff-bootstrap.js'));
    assert.ok(!/setupToken/.test(code));
    assert.ok(!/createInvite|INV\.create/.test(code));
  });

  await t.test('the page that replaced it never produces one either', () => {
    const code = strip(read('netlify/functions/staff-chairman-setup.js'));
    assert.ok(!/setupToken|mintToken|createInvite/.test(code));
    assert.match(code, /STORE\.setPassword\(WHO, password\)/,
      'the password comes straight from the person');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
test('NO CREDENTIAL IS COMMITTED ANYWHERE', async (t) => {
  await t.test('no temporary password pattern appears in the tree', () => {
    ['LaneChairman', 'LaneVice', 'LaneManager', 'LaneSecretary',
     'LaneProgramme', 'LaneSponsors', 'LaneSocial'].forEach((p) => {
      const files = ['netlify/functions/lib/invitations.js', 'netlify/functions/staff-invite.js',
        'netlify/functions/staff-activate.js', 'netlify/functions/staff-bootstrap.js'];
      files.forEach((f) => assert.ok(!read(f).includes(p), p + ' must not appear in ' + f));
    });
  });

  await t.test('the invitation module holds no literal secret', () => {
    // Token generation moved into lib/staff-store.js with the store itself.
    const store = read('netlify/functions/lib/staff-store.js');
    assert.match(store, /crypto\.randomBytes\(32\)/, 'the token is generated, never fixed');
    const inv = read('netlify/functions/lib/invitations.js');
    assert.ok(!/=\s*'[A-Za-z0-9+/_-]{20,}'/.test(strip(inv)), 'no fixed token or key');
  });
});
