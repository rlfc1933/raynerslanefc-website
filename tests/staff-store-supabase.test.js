// ════════════════════════════════════════════════════════════════════════════
// THE STORE MOVE — from a Netlify Blobs store that never existed to Supabase.
//
// In production every staff function called getStore('rlfc-staff') and Netlify
// answered "The environment has not been configured to use Netlify Blobs". No
// account, invitation or setup token could ever be written. The portal looked
// finished with nothing underneath it, which is why the shared committee
// password has been the only working way in — and why the sign-in screen had
// nothing but generic role names to show.
//
// These tests exercise the real store logic against an in-memory table, so the
// behaviour that was previously only observable in production is observable in
// the suite: hashes never come back out, a disabled account is refused before
// its password is read, a replacement invitation kills its predecessor, and the
// first-Chairman route closes itself for good.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const STORE = require(path.join(ROOT, 'netlify/functions/lib/staff-store.js'));
const ROLES = require(path.join(ROOT, 'netlify/functions/lib/roles.js'));
const AUTHZ = require(path.join(ROOT, 'netlify/functions/lib/authz.js'));
const { makeDriver } = require('./helpers/staff-store-driver.js');

function fresh() {
  const d = makeDriver();
  STORE._setDriver(d);
  return d;
}
test.afterEach(() => STORE._setDriver(null));

async function seedPete() {
  await STORE.createUser({ username: 'pete', name: 'Pete Singh', title: 'Chairman', role: 'Chairman' });
}

// ── 1 · ACCOUNTS PERSIST, AND HASHES DO NOT ESCAPE ──────────────────────────

test('an account can be created and read back', async () => {
  fresh();
  await seedPete();
  const u = await STORE.getUser('pete');
  assert.strictEqual(u.username, 'pete');
  assert.strictEqual(u.name, 'Pete Singh');
  assert.strictEqual(u.role, 'Chairman');
  assert.strictEqual(u.status, 'setup_required');
});

test('usernames are case-insensitive, so one person cannot become two accounts', async () => {
  fresh();
  await seedPete();
  assert.ok(await STORE.getUser('PETE'));
  assert.ok(await STORE.getUser('  Pete  '));
  await STORE.createUser({ username: 'PETE', name: 'Impostor', role: 'Committee' });
  const all = await STORE.listUsers();
  assert.strictEqual(all.filter((u) => u.username === 'pete').length, 1);
});

test('no account shape returned by the store can carry a password hash', async () => {
  fresh();
  await seedPete();
  await STORE.setPassword('pete', 'a-long-enough-password');
  const one = await STORE.getUser('pete');
  const many = await STORE.listUsers();
  [one, ...many].forEach((u) => {
    assert.ok(!('pass_hash' in u), 'publicUser must never include the hash');
    assert.ok(!JSON.stringify(u).includes('pass_hash'));
  });
});

test('the raw row is reachable only inside the module', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/staff-store.js'), 'utf8');
  // publicUser is the only shape callers get; nothing may spread the raw row.
  assert.ok(!/return Object\.assign\(\{\}, u\)/.test(src));
  assert.ok(!/\.\.\.u\b/.test(src.replace(/^\s*\/\/.*$/gm, '')));
  // And no other function may reach into the users table for a hash.
  const callers = ['staff-login.js', 'staff-users.js', 'staff-roster.js', 'md-session.js'];
  callers.forEach((f) => {
    const c = fs.readFileSync(path.join(ROOT, 'netlify/functions', f), 'utf8');
    assert.ok(!/pass_hash/.test(c.replace(/^\s*\/\/.*$/gm, '')),
      `${f} should not touch pass_hash — verifyPassword does that`);
  });
});

test('setting a password activates the account in the same step', async () => {
  fresh();
  await seedPete();
  const after = await STORE.setPassword('pete', 'a-long-enough-password');
  assert.strictEqual(after.status, 'active');
  // An account must never hold a password while still reading as pending.
  const u = await STORE.getUser('pete');
  assert.strictEqual(u.status, 'active');
});

test('updates persist', async () => {
  fresh();
  await seedPete();
  await STORE.updateUser('pete', { club_title: 'Club Chairman' });
  assert.strictEqual((await STORE.getUser('pete')).title, 'Club Chairman');
});

// ── 2 · WHO MAY SIGN IN ─────────────────────────────────────────────────────

test('the right password is accepted, a wrong one is not', async () => {
  fresh();
  await seedPete();
  await STORE.setPassword('pete', 'correct-horse-battery');
  assert.strictEqual((await STORE.verifyPassword('pete', 'correct-horse-battery')).ok, true);
  assert.strictEqual((await STORE.verifyPassword('pete', 'wrong-horse-battery')).reason, 'wrong-password');
});

test('an account awaiting setup cannot be signed into, even with an empty password', async () => {
  fresh();
  await seedPete();
  ['', 'anything', 'null'].forEach(async (pw) => {
    const v = await STORE.verifyPassword('pete', pw);
    assert.strictEqual(v.ok, false);
    assert.strictEqual(v.reason, 'setup-required');
  });
});

test('a disabled account is refused BEFORE its password is considered', async () => {
  fresh();
  await seedPete();
  await STORE.setPassword('pete', 'correct-horse-battery');
  await STORE.setDisabled('pete', true);
  const v = await STORE.verifyPassword('pete', 'correct-horse-battery');
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.reason, 'account-disabled', 'the right password must not rescue a disabled account');
});

test('re-enabling restores the status the account actually deserves', async () => {
  fresh();
  await seedPete();
  await STORE.setDisabled('pete', true);
  await STORE.setDisabled('pete', false);
  // Never activated, so it must come back as pending — not as a signable
  // account with no password, which the database would reject anyway.
  assert.strictEqual((await STORE.getUser('pete')).status, 'setup_required');
});

test('disabled status persists across reads', async () => {
  fresh();
  await seedPete();
  await STORE.setDisabled('pete', true);
  assert.strictEqual((await STORE.getUser('pete')).status, 'disabled');
  assert.strictEqual((await STORE.listUsers())[0].status, 'disabled');
});

// ── 3 · INVITATIONS ─────────────────────────────────────────────────────────

test('an invitation persists and returns its raw token exactly once', async () => {
  fresh();
  await seedPete();
  const made = await STORE.createInvite({ username: 'pete', createdBy: 'dev' });
  assert.ok(made.token && made.token.length > 20);
  assert.ok(!JSON.stringify(made.invite).includes(made.token), 'the token must not be in the stored shape');
  const list = await STORE.listInvites();
  assert.strictEqual(list.length, 1);
  assert.ok(!('token_hash' in list[0]), 'the hash must not be listed either');
});

test('a replacement invitation revokes its predecessor', async () => {
  const d = fresh();
  await seedPete();
  const first = await STORE.createInvite({ username: 'pete' });
  await STORE.createInvite({ username: 'pete' });
  const rows = d._tables.la_staff_invitations;
  const old = rows.find((r) => r.token_hash === STORE.hashToken(first.token));
  assert.strictEqual(old.status, 'revoked', '"send them a new link" must not leave two working ways in');
  assert.strictEqual(old.revoked_reason, 'replaced');
  assert.strictEqual(rows.filter((r) => r.status === 'pending').length, 1);
});

test('a revoked or replaced link cannot be redeemed', async () => {
  fresh();
  await seedPete();
  const first = await STORE.createInvite({ username: 'pete' });
  await STORE.createInvite({ username: 'pete' });
  const r = await STORE.redeemInvite(first.token, 'a-long-enough-password');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'invalid');
});

test('redeeming sets the password, activates the account and burns the link', async () => {
  fresh();
  await seedPete();
  const made = await STORE.createInvite({ username: 'pete' });
  const r = await STORE.redeemInvite(made.token, 'a-long-enough-password');
  assert.strictEqual(r.ok, true);
  assert.strictEqual((await STORE.getUser('pete')).status, 'active');
  assert.strictEqual((await STORE.verifyPassword('pete', 'a-long-enough-password')).ok, true);
  // Single use.
  const again = await STORE.redeemInvite(made.token, 'another-long-password');
  assert.strictEqual(again.ok, false);
});

test('an expired invitation is refused even though the row still says pending', async () => {
  const d = fresh();
  await seedPete();
  const made = await STORE.createInvite({ username: 'pete' });
  d._tables.la_staff_invitations[0].expires_at = new Date(Date.now() - 1000).toISOString();
  const r = await STORE.redeemInvite(made.token, 'a-long-enough-password');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'invalid');
});

test('every failure to redeem gives the same answer', async () => {
  fresh();
  await seedPete();
  // A caller probing tokens must not learn whether one existed.
  const a = await STORE.redeemInvite('never-existed', 'a-long-enough-password');
  const made = await STORE.createInvite({ username: 'pete' });
  await STORE.redeemInvite(made.token, 'a-long-enough-password');
  const b = await STORE.redeemInvite(made.token, 'a-long-enough-password');
  assert.strictEqual(a.reason, b.reason);
});

test('a short password is refused before anything is written', async () => {
  fresh();
  await seedPete();
  const made = await STORE.createInvite({ username: 'pete' });
  const r = await STORE.redeemInvite(made.token, 'short');
  assert.strictEqual(r.reason, 'weak_password');
  assert.strictEqual((await STORE.getUser('pete')).status, 'setup_required');
});

// ── 4 · BOOTSTRAP STATE ─────────────────────────────────────────────────────

test('bootstrap state persists once consumed', async () => {
  fresh();
  assert.strictEqual(await STORE.bootstrapConsumed(), false);
  await STORE.consumeBootstrap('pete', 'test');
  assert.strictEqual(await STORE.bootstrapConsumed(), true);
});

test('adminExists only counts ACTIVE administrators', async () => {
  fresh();
  await seedPete();
  // Pending is not active — otherwise seeding the roster would close the very
  // route that exists to activate it.
  assert.strictEqual(await STORE.adminExists(ROLES.ADMIN_ROLES), false);
  await STORE.setPassword('pete', 'a-long-enough-password');
  assert.strictEqual(await STORE.adminExists(ROLES.ADMIN_ROLES), true);
});

// ── 5 · NOTHING STAFF-RELATED STILL DEPENDS ON BLOBS ────────────────────────

test('no staff function imports Netlify Blobs any more', () => {
  ['staff-login.js', 'staff-users.js', 'staff-roster.js', 'staff-bootstrap.js',
   'md-session.js', 'lib/invitations.js'].forEach((f) => {
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions', f), 'utf8');
    const code = src.replace(/^\s*(\/\/.*)$/gm, '');   // prose may still explain the move
    assert.ok(!/@netlify\/blobs/.test(code), `${f} still imports Netlify Blobs`);
    assert.ok(!/getStore\(/.test(code), `${f} still calls getStore()`);
  });
});

test('the only remaining Blobs use is the unrelated sponsor radar', () => {
  const dir = path.join(ROOT, 'netlify/functions');
  const hits = [];
  (function walk(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) return walk(p);
      if (!e.name.endsWith('.js')) return;
      const code = fs.readFileSync(p, 'utf8').replace(/^\s*(\/\/.*)$/gm, '');
      if (/getStore\(/.test(code)) hits.push(path.relative(dir, p));
    });
  }(dir));
  assert.deepStrictEqual(hits.sort(), ['lib/radar.js'],
    'staff auth must not depend on Blobs; the radar cache legitimately may');
});

// ── 6 · SYSTEM MAINTAINER ───────────────────────────────────────────────────

test('System Maintainer holds the full capability bundle', () => {
  const caps = AUTHZ.DEFAULT_CAPS['System Maintainer'];
  assert.ok(caps, 'the role must have defaults');
  [AUTHZ.CAP.VIEW_STAFF, AUTHZ.CAP.MANAGE_USERS, AUTHZ.CAP.DISABLE_ACCOUNT,
   AUTHZ.CAP.RESET_CREDENTIALS, AUTHZ.CAP.ASSIGN_ROLES, AUTHZ.CAP.ASSIGN_ADMIN]
    .forEach((c) => assert.ok(caps.indexOf(c) > -1, `missing ${c}`));
});

test('System Maintainer is an ESCALATING role and cannot be assigned casually', () => {
  // The previous attempt added the role to the list without this guard, which
  // would have let anyone holding MANAGE_USERS hand out full authority.
  assert.ok(ROLES.ADMIN_ROLES.indexOf('System Maintainer') > -1);
  assert.strictEqual(ROLES.ASSIGNABLE_ROLES.indexOf('System Maintainer'), -1,
    'it must never be in the ordinarily-assignable list');
  assert.deepStrictEqual(
    ROLES.ASSIGNABLE_ROLES.filter((r) => ROLES.ADMIN_ROLES.indexOf(r) > -1), [],
    'no admin role may be ordinarily assignable');
});

test('the two files that decide escalation cannot drift apart', () => {
  assert.deepStrictEqual(Array.from(AUTHZ.ADMIN_ROLES), Array.from(ROLES.ADMIN_ROLES));
  const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/authz.js'), 'utf8');
  assert.ok(/require\('\.\/roles'\)\.ADMIN_ROLES/.test(src),
    'authz must take the list from roles.js rather than restating it');
});

test('assigning an administrative role needs elevation as well as the capability', () => {
  [AUTHZ.CAP.ASSIGN_ADMIN, AUTHZ.CAP.MANAGE_USERS, AUTHZ.CAP.RESET_CREDENTIALS]
    .forEach((c) => assert.ok(AUTHZ.ELEVATED.indexOf(c) > -1, `${c} lost its elevation rule`));
});

test('self-promotion and self-disable stay refused', () => {
  const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/staff-users.js'), 'utf8');
  const code = src.replace(/^\s*(\/\/.*)$/gm, '');
  assert.ok(/self_promotion/.test(code));
  assert.ok(/self_disable/.test(code));
  assert.ok(/self_remove/.test(code));
  // The chairman flag must never be read from the request body.
  assert.ok(!/body\.isChairman/.test(code));
});

// ── 7 · THE FIRST-CHAIRMAN PAGE ─────────────────────────────────────────────

const SETUP = require(path.join(ROOT, 'netlify/functions/staff-chairman-setup.js'));

test('chairman setup is closed unless the flag is set', () => {
  const before = process.env.STAFF_BOOTSTRAP_ENABLED;
  delete process.env.STAFF_BOOTSTRAP_ENABLED;
  assert.strictEqual(SETUP._internal.windowOpen(Date.now()).open, false);
  process.env.STAFF_BOOTSTRAP_ENABLED = before === undefined ? '' : before;
  if (before === undefined) delete process.env.STAFF_BOOTSTRAP_ENABLED;
});

test('a timestamped flag closes itself after thirty minutes', () => {
  const before = process.env.STAFF_BOOTSTRAP_ENABLED;
  const now = Date.now();
  process.env.STAFF_BOOTSTRAP_ENABLED = new Date(now - 5 * 60000).toISOString();
  assert.strictEqual(SETUP._internal.windowOpen(now).open, true, '5 minutes in, still open');
  process.env.STAFF_BOOTSTRAP_ENABLED = new Date(now - 31 * 60000).toISOString();
  const shut = SETUP._internal.windowOpen(now);
  assert.strictEqual(shut.open, false, 'a flag left on must still expire');
  assert.strictEqual(shut.reason, 'window_expired');
  if (before === undefined) delete process.env.STAFF_BOOTSTRAP_ENABLED;
  else process.env.STAFF_BOOTSTRAP_ENABLED = before;
});

test('the setup route can only ever make Pete, and only a Chairman', () => {
  const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/staff-chairman-setup.js'), 'utf8');
  const code = src.replace(/^\s*(\/\/.*)$/gm, '');
  assert.ok(/const WHO = 'pete'/.test(code));
  assert.ok(/STORE\.norm\(b\.username\) !== WHO/.test(code), 'any other username must be refused');
  // The role is never read from the request.
  assert.ok(!/b\.role/.test(code), 'the role must not come from the request');
});

test('the setup route refuses once an administrator is active, or once consumed', () => {
  const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/staff-chairman-setup.js'), 'utf8');
  assert.ok((src.match(/bootstrapConsumed\(\)/g) || []).length >= 2, 'checked on GET and POST');
  assert.ok((src.match(/adminExists\(/g) || []).length >= 2);
  assert.ok(/consumeBootstrap\(/.test(src), 'success must be recorded so it cannot run twice');
});

test('the setup route never produces or logs a token or password', () => {
  const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/staff-chairman-setup.js'), 'utf8');
  assert.ok(!/setupToken|mintToken|createInvite/.test(src), 'no token may be created');
  // Nothing that could contain the password may be logged.
  const logs = src.match(/console\.(log|warn|error)\([^)]*\)/g) || [];
  logs.forEach((l) => {
    assert.ok(!/password|b\.password/.test(l), `a log line references the password: ${l}`);
  });
  // And the audit entry records the outcome, never the credential.
  assert.ok(/after: \{ status: 'active' \}/.test(src));
});

test('the old token-minting bootstrap is retired', () => {
  const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/staff-bootstrap.js'), 'utf8');
  assert.ok(/retired: true/.test(src));
  assert.ok(/return resp\(410/.test(src));
  const code = src.replace(/^\s*(\/\/.*)$/gm, '');
  assert.ok(!/setupToken/.test(code), 'it must no longer be able to mint a token');
});

test('the setup page is kept out of search results', () => {
  const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
  assert.ok(robots.indexOf('Disallow: /chairman-setup.html') > -1);
  const page = fs.readFileSync(path.join(ROOT, 'chairman-setup.html'), 'utf8');
  assert.ok(/noindex,nofollow/.test(page));
});

test('the setup page sends the password once and keeps nothing', () => {
  const page = fs.readFileSync(path.join(ROOT, 'chairman-setup.html'), 'utf8');
  assert.ok(!/localStorage|sessionStorage/.test(page), 'a password must not be stored in the browser');
  assert.ok(/type="password"/.test(page));
  assert.ok(/autocomplete="new-password"/.test(page));
});

// ── 8 · THE EIGHT ACCOUNTS ARE IN THE MIGRATION ─────────────────────────────

const SQL = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260805210000_staff_auth.sql'), 'utf8');

test('all eight committee accounts are seeded, and none with a password', () => {
  ['pete', 'nigel', 'gary', 'jenny', 'russell', 'darren', 'smallz', 'dev']
    .forEach((u) => assert.ok(SQL.includes("('" + u + "'"), `${u} is missing`));
  // Every seeded row is setup_required and none supplies a hash.
  const insert = SQL.slice(SQL.indexOf('insert into public.la_staff_users'));
  assert.strictEqual((insert.match(/'setup_required'/g) || []).length, 8);
  assert.ok(!/pass_hash/.test(insert), 'no seeded account may be given a password');
});

test('the seeded roles are the club roles, and dev is the System Maintainer', () => {
  assert.ok(/'dev',\s*'DEV — Sukh Banwait',\s*'Full Developer Access',\s*'System Maintainer'/.test(SQL));
  ['Chairman', 'V Chairman', 'Team Manager', 'Club Secretary', 'Sponsorship',
   'Programme Editor', 'Marketing/Media', 'System Maintainer']
    .forEach((r) => assert.ok(ROLES.isRole(r), `${r} is not a role the server accepts`));
});

test('the staff tables are closed to the browser', () => {
  ['la_staff_users', 'la_staff_invitations', 'la_staff_bootstrap'].forEach((t) => {
    assert.ok(new RegExp('alter table public\\.' + t + '\\s+enable row level security').test(SQL),
      `${t} must have RLS enabled`);
    assert.ok(new RegExp('revoke all on public\\.' + t + '\\s+from anon, authenticated').test(SQL),
      `${t} must be revoked from the browser roles`);
  });
  // RLS with NO policy is the strongest setting: the anon key reads nothing.
  assert.ok(!/create policy .*la_staff/.test(SQL),
    'no policy may open these tables to a browser key');
});

test('the database itself refuses an active account with no password', () => {
  assert.ok(/la_staff_users_active_needs_hash/.test(SQL));
  assert.ok(/check \(status <> 'active' or pass_hash is not null\)/.test(SQL));
});

test('the database allows only one live invitation per person', () => {
  assert.ok(/unique index if not exists la_staff_invitations_one_pending/.test(SQL));
  assert.ok(/where status = 'pending'/.test(SQL));
});
