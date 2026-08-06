// ════════════════════════════════════════════════════════════════════════════
// THE SIGN-IN LIST — and the bug that made it look like nothing existed.
//
// The sign-in screen fetched the roster through staffAdminFetch(), which
// attaches a SIGNED SESSION. At the sign-in screen nobody has one, because
// signing in is what the screen is for. So the call 401'd on every load, the
// .catch() swallowed it, and the list silently fell back to seven generic role
// names.
//
// That failure is indistinguishable from "the accounts were never created",
// which is exactly how it was reported. Both were true at once, and fixing
// only the accounts would have fixed nothing visible.
//
// The other half of this file guards the new endpoint's blast radius: listing
// who can sign in must never become a way to learn anything ABOUT them beyond
// what the club already publishes on its own About page.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const rosterSrc = fs.readFileSync(path.join(ROOT, 'netlify/functions/staff-roster.js'), 'utf8');
const ROSTER = require(path.join(ROOT, 'netlify/functions/staff-roster.js'));

// ── 1 · THE ENDPOINT LEAKS NOTHING ──────────────────────────────────────────

test('the roster never returns a password hash', () => {
  const entry = ROSTER._internal.publicEntry('jenny', {
    name: 'Jenny Pitt', title: 'Secretary', role: 'Club Secretary',
    pass_hash: 'THIS-MUST-NEVER-ESCAPE', disabled: false,
    disabled_by: 'someone', activated_at: '2026-08-05',
  });
  assert.deepStrictEqual(Object.keys(entry).sort(),
    ['name', 'role', 'status', 'title', 'username']);
  assert.ok(!JSON.stringify(entry).includes('THIS-MUST-NEVER-ESCAPE'));
});

test('no field beyond the five needed to draw a button is returned', () => {
  // Anything added here later must be a conscious decision, not a spread.
  const code = rosterSrc.replace(/^\s*(\/\/.*|\*.*|\/\*.*)$/gm, '');
  assert.ok(!/\.\.\.u/.test(code), 'spreading the stored user would leak the hash');
  assert.ok(!/Object\.assign\(\{\}, u\)/.test(code));
  assert.ok(!/pass_hash:/.test(code), 'the hash must never be assigned to output');
});

test('status is derived from the record, not sent by anyone', () => {
  const s = ROSTER._internal.statusOf;
  assert.strictEqual(s({ pass_hash: 'x' }), 'active');
  assert.strictEqual(s({}), 'setup_required');
  assert.strictEqual(s({ pass_hash: 'x', disabled: true }), 'disabled');
  // Disabled beats active: a switched-off account must never read as usable.
  assert.strictEqual(s({ pass_hash: 'x', disabled: true }), 'disabled');
});

test('the roster is gated on the club PIN and refuses without it', () => {
  const code = rosterSrc.replace(/^\s*(\/\/.*)$/gm, '');
  assert.ok(/require\('\.\/lib\/pin'\)/.test(code));
  assert.ok(/if \(!adminOk\(pin\)\) return resp\(401/.test(code));
});

test('the roster is never cached', () => {
  // An account activated a minute ago must not still read "Setup required".
  assert.ok(/'Cache-Control': 'private, no-store, max-age=0'/.test(rosterSrc));
});

test('listing an account is not admitting it', () => {
  // The roster is a display list. Every one of these still has to pass
  // staff-login.js, which checks the password and refuses disabled accounts.
  const login = fs.readFileSync(path.join(ROOT, 'netlify/functions/staff-login.js'), 'utf8');
  assert.ok(/u\.pass_hash !== hash\(b\.password\)/.test(login));
  assert.ok(/if \(u\.disabled\) return resp\(200, \{ ok: false, error: 'account-disabled' \}\)/.test(login));
  // An account with no password cannot match any hash, so setup_required
  // accounts are refused by that same line without needing a special case.
  assert.ok(!/pass_hash \|\| /.test(login), 'never treat a missing hash as a pass');
});

// ── 2 · THE SIGN-IN SCREEN CAN ACTUALLY READ IT ─────────────────────────────

test('the sign-in screen no longer asks for a session it cannot have', () => {
  const fn = admin.match(/function showRoleLogin\(\) \{[\s\S]*?\n\}/)[0];
  const code = fn.replace(/^\s*(\/\/.*)$/gm, '');
  assert.ok(!/staffAdminFetch/.test(code),
    'staffAdminFetch needs a signed session, which nobody has at the sign-in screen');
  assert.ok(/staff-roster\?pin=/.test(code), 'it should read the PIN-gated roster');
  assert.ok(/fetch\(/.test(code), 'a plain fetch, with no Authorization header');
});

test('a roster failure falls back to a usable list rather than a blank screen', () => {
  const fn = admin.match(/function showRoleLogin\(\) \{[\s\S]*?\n\}/)[0];
  assert.ok(/staffUsers = staffDefaultUsers\(\)/.test(fn), 'seed the list before fetching');
  assert.ok(/if \(!j \|\| !j\.ok \|\| !j\.staff \|\| !j\.staff\.length\) return/.test(fn),
    'an empty roster must keep the fallback, not clear the screen');
  assert.ok(/\.catch\(/.test(fn));
});

// ── 3 · PENDING ACCOUNTS ARE SHOWN, NOT HIDDEN ──────────────────────────────

test('an account awaiting setup appears in the list with its own badge', () => {
  const fn = admin.match(/function renderRoleOptions\(\) \{[\s\S]*?\n\}/)[0];
  assert.ok(/setup_required/.test(fn));
  assert.ok(/Setup required/.test(fn));
  // Hiding it is what made people think the portal was broken.
  assert.ok(!/filter\([^)]*setup_required/.test(fn), 'pending accounts must not be filtered out');
});

test('choosing a pending account explains what to do instead of asking for a password', () => {
  const fn = admin.match(/function pickRole\(username\) \{[\s\S]*?\n\}/)[0];
  assert.ok(/status === 'setup_required'/.test(fn));
  assert.ok(/pw\) pw\.style\.display = 'none'/.test(fn), 'the password box must be hidden');
  assert.ok(/still need to create your personal password/.test(admin));
  assert.ok(/Ask Pete or DEV for your private setup link/.test(admin));
});

test('a pending account cannot be password-guessed from the screen', () => {
  const fn = admin.match(/async function submitRoleLogin\(\) \{[\s\S]*?var username = picked\.username/)[0];
  assert.ok(/status === 'setup_required'/.test(fn));
  assert.ok(/return;/.test(fn), 'it must stop before contacting the server');
});

test('a switched-off account says so rather than failing as a wrong password', () => {
  const fn = admin.match(/function pickRole\(username\) \{[\s\S]*?\n\}/)[0];
  assert.ok(/status === 'disabled'/.test(fn));
  assert.ok(/switched off/i.test(fn));
});

// ── 4 · TEMPORARY COMMITTEE ACCESS ──────────────────────────────────────────

test('temporary committee access is offered, and explained', () => {
  assert.ok(/Continue with temporary committee access/.test(admin));
  assert.ok(/Use this only until your individual account has been activated/.test(admin));
  assert.ok(/function pickTempAccess\(\)/.test(admin));
});

test('temporary access cannot reach anything administrative', () => {
  // Not by hiding buttons — by the shape of the session it produces. A shared
  // password yields auth:'shared'; every elevated capability needs 'custom'.
  const authz = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/authz.js'), 'utf8');
  assert.ok(/elevated: v\.auth === 'custom'/.test(authz));
  const AUTHZ = require(path.join(ROOT, 'netlify/functions/lib/authz.js'));
  [AUTHZ.CAP.MANAGE_USERS, AUTHZ.CAP.RESET_CREDENTIALS, AUTHZ.CAP.ASSIGN_ADMIN]
    .forEach((c) => assert.ok(AUTHZ.ELEVATED.indexOf(c) > -1, `${c} must need elevation`));
  // And the Committee role holds no staff capability at all by default.
  assert.strictEqual(AUTHZ.DEFAULT_CAPS['Committee'], undefined);
});

test('the temporary session never claims to be a chairman', () => {
  const fn = admin.match(/function pickTempAccess\(\) \{[\s\S]*?\n\}/)[0];
  assert.ok(/isChairman: false/.test(fn));
  assert.ok(/role: 'Committee'/.test(fn));
});

// ── 5 · NOTHING IS DECIDED IN THE BROWSER ───────────────────────────────────

test('the chosen person comes from the roster, never from a typed field', () => {
  const fn = admin.match(/async function submitRoleLogin\(\) \{[\s\S]*?document\.getElementById\('role-err'\)\.textContent = 'Checking…';/)[0];
  assert.ok(/var picked = rolePicked/.test(fn));
  assert.ok(!/gv\('role-user'\)/.test(fn), 'the old free-text role field is gone');
  assert.ok(!/document\.getElementById\('role-user'\)/.test(admin));
});

test('name, title and chairman status still come only from the server', () => {
  const block = admin.match(/var sName = null[\s\S]*?rlfc_staff[^\n]*\n/)[0];
  assert.ok(/sName = res\.name \|\| null/.test(block));
  assert.ok(/isChair = !!res\.isChairman/.test(block));
  assert.ok(!/isChair = picked\.isChairman;\s*$/m.test(block),
    'the browser must not be the source of chairman status on success');
});
