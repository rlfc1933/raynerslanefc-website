// ════════════════════════════════════════════════════════════════════════════
// TWO FIXES, BOTH OF WHICH FAIL SILENTLY IF THEY REGRESS.
//
//  1. SERVER-SIDE SOURCE WAS DOWNLOADABLE AS IF IT WERE A PAGE. Netlify
//     publishes the repository root, so /netlify/functions/lib/invitations.js
//     returned its own source — including the pepper used to hash invitation
//     tokens and staff passwords. Nothing was leaked (every secret is read from
//     the environment) but a pepper anybody can read adds nothing.
//
//     The dangerous half of this fix is the path. Functions are INVOKED at
//     /.netlify/functions/<name> — with a leading dot. The block matches
//     /netlify/... — without one. Get that wrong and the entire back end goes
//     down: no sign-in, no invitations, no programme, no football data. So the
//     rule is asserted character by character.
//
//  2. THE VICE CHAIRMAN COULD NOT REACH THE SCREEN HE HAD RIGHTS ON. Nigel
//     holds DISABLE_ACCOUNT permanently — the club's continuity rule, so a
//     compromised login can be shut down even when the Chairman's own account
//     is the problem. The interface hid Staff Access behind staffIsChairman(),
//     so the capability existed and was unreachable.
//
//     The failure mode to guard against now is the opposite one: opening the
//     screen must not open the CONTROLS. Hiding a button is a courtesy, never
//     a control — the server is asserted to still refuse.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
const admin = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const AUTHZ = require(path.join(ROOT, 'netlify/functions/lib/authz.js'));

function loadTools() {
  const src = fs.readFileSync(path.join(ROOT, 'js/portal-tools.js'), 'utf8');
  const ctx = vm.createContext({ window: {}, console });
  ctx.window.window = ctx.window;
  vm.runInContext(src, ctx);
  return ctx.window.PortalTools;
}
const PT = loadTools();

/** Every redirect block in netlify.toml, as {from,to,status,force}. */
function redirects() {
  return toml.split('[[redirects]]').slice(1).map((block) => {
    const get = (k) => (block.match(new RegExp('^\\s*' + k + '\\s*=\\s*"?([^"\\n]+)"?', 'm')) || [])[1];
    return { from: get('from'), to: get('to'), status: get('status'), force: get('force') };
  });
}

// ── 1 · SERVER-SIDE SOURCE IS BLOCKED ───────────────────────────────────────

test('the server-side source trees are blocked with a 404', () => {
  const blocked = redirects().filter((r) => r.status === '404');
  const froms = blocked.map((r) => r.from);
  ['/netlify/*', '/tests/*', '/scripts/*', '/supabase/*',
   '/package.json', '/package-lock.json'].forEach((p) => {
    assert.ok(froms.indexOf(p) > -1, `${p} is still publicly served`);
  });
});

test('every block is forced, so a real file cannot win over the rule', () => {
  // Without force, Netlify serves the static file and the rule never fires —
  // which is precisely the case here, because the files DO exist.
  redirects().filter((r) => r.status === '404').forEach((r) => {
    assert.strictEqual(r.force, 'true', `${r.from} is not forced and will be bypassed`);
  });
});

test('THE BLOCK CANNOT REACH THE FUNCTION INVOCATION PATH', () => {
  // Functions are called at /.netlify/functions/<name>. If any rule matched
  // that, the whole back end would 404: no sign-in, no invitations, no
  // programme, no football data.
  redirects().filter((r) => r.status === '404').forEach((r) => {
    assert.ok(!r.from.startsWith('/.netlify'),
      `${r.from} would break function invocation`);
    assert.ok(!/^\/\.?netlify\/functions\/[a-z]/.test(r.from),
      `${r.from} looks like an invocation path, not a source path`);
  });
  // And the one rule that does cover the source tree must be the dotless form.
  const netlifyRule = redirects().find((r) => r.from === '/netlify/*');
  assert.ok(netlifyRule, 'expected the /netlify/* source block');
  assert.strictEqual(netlifyRule.from.charAt(0), '/');
  assert.strictEqual(netlifyRule.from.charAt(1), 'n', 'must be /netlify, never /.netlify');
});

test('the rewrites that make the site work are untouched', () => {
  // rss.xml and sitemap.xml are 200-rewrites onto functions. A 404 rule that
  // caught them would silently kill the club's feed and its search listing.
  const two_hundreds = redirects().filter((r) => r.status === '200');
  const to = two_hundreds.map((r) => r.to);
  assert.ok(to.some((t) => /\/\.netlify\/functions\/rss/.test(t)), 'rss rewrite lost');
  assert.ok(to.some((t) => /\/\.netlify\/functions\/sitemap/.test(t)), 'sitemap rewrite lost');
  two_hundreds.forEach((r) => {
    assert.ok(r.to.startsWith('/.netlify/functions/'),
      `a 200-rewrite should target a function: ${r.to}`);
  });
});

test('the 404 target is a page that exists', () => {
  redirects().filter((r) => r.status === '404').forEach((r) => {
    assert.strictEqual(r.to, '/404.html');
  });
  assert.ok(fs.existsSync(path.join(ROOT, '404.html')), '404.html must exist');
});

test('no public page lives under a blocked prefix', () => {
  // If a real page were under /tests/ or /scripts/, this fix would break it.
  ['tests', 'scripts', 'supabase', 'netlify'].forEach((dir) => {
    const d = path.join(ROOT, dir);
    if (!fs.existsSync(d)) return;
    const html = fs.readdirSync(d, { recursive: true })
      .filter((f) => typeof f === 'string' && f.endsWith('.html'))
      // tests/fixtures/ holds saved copies of Football Web Pages, kept so the
      // parsers can be tested offline. They are exactly the sort of thing that
      // SHOULD stop being served publicly.
      .filter((f) => !f.startsWith('fixtures/'));
    assert.deepStrictEqual(html, [], `${dir}/ contains a page that would now 404`);
  });
});

// ── 2 · THE PORTAL AND THE SERVER AGREE ON CAPABILITIES ─────────────────────

test('the browser capability mirror matches the server exactly', () => {
  // PortalTools.STAFF_CAPS decides what is DRAWN. If it drifts from
  // DEFAULT_CAPS the interface starts lying about what somebody can do.
  Object.keys(PT.STAFF_CAPS).forEach((role) => {
    assert.ok(AUTHZ.DEFAULT_CAPS[role], `the server has no defaults for "${role}"`);
    // Array.from, not .slice() — PortalTools is evaluated in a vm realm, so its
    // arrays carry a different Array.prototype and deepStrictEqual would reject
    // two identical lists on their prototype alone.
    assert.deepStrictEqual(
      Array.from(PT.STAFF_CAPS[role]).sort(),
      Array.from(AUTHZ.DEFAULT_CAPS[role]).sort(),
      `"${role}" differs between the portal and lib/authz.js`
    );
  });
  Object.keys(AUTHZ.DEFAULT_CAPS).forEach((role) => {
    assert.ok(PT.STAFF_CAPS[role], `the portal has no mirror for "${role}"`);
  });
});

test('the Vice Chairman holds disable, and holds nothing that escalates', () => {
  const v = AUTHZ.DEFAULT_CAPS['V Chairman'];
  assert.ok(v.indexOf(AUTHZ.CAP.DISABLE_ACCOUNT) > -1, 'the continuity rule is gone');
  assert.ok(v.indexOf(AUTHZ.CAP.VIEW_STAFF) > -1);
  [AUTHZ.CAP.MANAGE_USERS, AUTHZ.CAP.ASSIGN_ROLES, AUTHZ.CAP.ASSIGN_ADMIN,
   AUTHZ.CAP.RESET_CREDENTIALS].forEach((c) => {
    assert.ok(v.indexOf(c) === -1, `V Chairman must not hold ${c}`);
  });
});

// ── 3 · WHAT THE INTERFACE DRAWS ────────────────────────────────────────────

test('Staff Access is visible to the Vice Chairman; Developer is not', () => {
  const users = PT.byId('users');
  const dev = PT.byId('developer');
  assert.strictEqual(PT.canSee(users, 'V Chairman', false), true, 'Nigel cannot reach Staff Access');
  assert.strictEqual(PT.canSee(dev, 'V Chairman', false), false, 'Nigel can reach Developer');
  assert.strictEqual(PT.canSee(users, 'Chairman', true), true);
  assert.strictEqual(PT.canSee(dev, 'Chairman', true), true);
});

test('nobody else can see either of them', () => {
  ['Committee', 'Team Manager', 'Club Secretary', 'Marketing/Media', 'Volunteer',
   'Treasurer', 'Coach', 'Nonsense'].forEach((r) => {
    assert.strictEqual(PT.canSee(PT.byId('users'), r, false), false, `${r} sees Staff Access`);
    assert.strictEqual(PT.canSee(PT.byId('developer'), r, false), false, `${r} sees Developer`);
  });
});

test('an ordinary tool is visible to everyone, as before', () => {
  ['Committee', 'Volunteer', 'Team Manager'].forEach((r) => {
    assert.strictEqual(PT.canSee(PT.byId('fixtures'), r, false), true);
  });
});

test('the panel opens on view-staff, and Developer still on chairman', () => {
  const code = admin.replace(/^\s*(\/\/.*)$/gm, '');
  assert.ok(/name === 'users' && !staffCanViewStaff\(\)/.test(code),
    'Staff Access should gate on the view-staff capability');
  assert.ok(/name === 'developer' && !staffIsChairman\(\)/.test(code),
    'Developer must stay chairman-only');
});

test('the capability helpers read the signed session, never the request', () => {
  const fn = admin.match(/function staffCan\(cap\) \{[\s\S]*?\n\}/)[0];
  assert.ok(/staffSession\(\)/.test(fn));
  assert.ok(/PortalTools\.roleHas/.test(fn));
  // A missing registry must deny, not permit.
  assert.ok(/if \(!window\.PortalTools\) return false/.test(fn),
    'an absent registry must fail closed');
});

test('creation controls are hidden from someone who cannot manage users', () => {
  assert.ok(/class="manage-only"/.test(admin), 'the create block needs a hook');
  assert.ok(/#panel-users \.manage-only/.test(admin), 'and initUsers must toggle it');
  assert.ok(/canManage \? '' : 'none'/.test(admin));
  // The invitation list is chairman data; do not fetch it for a viewer.
  assert.ok(/window\.invList && staffCanManage\(\)/.test(admin));
});

test('the off-switch is drawn for whoever may disable, and nothing more', () => {
  const fn = admin.match(/if \(staffCanManage\(\)\) \{[\s\S]*?\n    \}/)[0];
  assert.ok(/setUserPassword/.test(fn), 'Set password belongs to manage');
  assert.ok(/removeUser/.test(fn), 'Remove belongs to manage');
  const dis = admin.match(/if \(staffCanDisable\(\)[\s\S]*?\n    \}/)[0];
  assert.ok(/disableUser/.test(dis) && /enableUser/.test(dis));
  assert.ok(!/setUserPassword|removeUser/.test(dis),
    'the disable branch must not expose management controls');
});

test('the removal prompt says nothing is deleted', () => {
  const fn = admin.match(/async function disableUser\(username\) \{[\s\S]*?\n\}/)[0];
  assert.ok(/Nothing is deleted/.test(fn), 'a volunteer must know this is reversible');
  assert.ok(/action: 'disable'/.test(fn));
  assert.ok(/staffAdminFetch/.test(fn), 'must go through the signed-session helper');
});

// ── 4 · THE SERVER IS STILL THE AUTHORITY ───────────────────────────────────

test('the server decides disable by capability, not by who drew the button', () => {
  const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/staff-users.js'), 'utf8');
  const needed = src.match(/const NEEDED = \{[\s\S]*?\};/)[0];
  assert.ok(/disable:\s*CAP\.DISABLE_ACCOUNT/.test(needed));
  assert.ok(/enable:\s*CAP\.DISABLE_ACCOUNT/.test(needed));
  // And the things Nigel must never do stay on stronger capabilities.
  assert.ok(/add:\s*CAP\.MANAGE_USERS/.test(needed));
  assert.ok(/setpassword:\s*CAP\.RESET_CREDENTIALS/.test(needed));
  assert.ok(/setrole:\s*CAP\.ASSIGN_ROLES/.test(needed));
});

test('MANAGE_USERS, RESET_CREDENTIALS and ASSIGN_ADMIN still need elevation', () => {
  [AUTHZ.CAP.MANAGE_USERS, AUTHZ.CAP.RESET_CREDENTIALS, AUTHZ.CAP.ASSIGN_ADMIN]
    .forEach((c) => assert.ok(AUTHZ.ELEVATED.indexOf(c) > -1, `${c} lost its elevation rule`));
});

test('a Vice Chairman cannot promote himself or assign a chairman', () => {
  const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/staff-users.js'), 'utf8');
  const code = src.replace(/^\s*(\/\/.*)$/gm, '');
  assert.ok(/self_promotion/.test(code), 'self-promotion refusal is gone');
  assert.ok(/no_admin_assign/.test(code), 'chairman assignment is no longer gated');
  assert.ok(/is_chairman: ADMIN_ROLES\.indexOf\(role\) > -1/.test(code),
    'is_chairman must be derived from the validated role, never sent');
});

test('disabling a chairman still needs chairman-level authority', () => {
  const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/staff-users.js'), 'utf8');
  const block = src.match(/if \(action === 'disable' \|\| action === 'enable'\) \{[\s\S]*?\n    \}/)[0];
  assert.ok(/admin_target/.test(block));
  assert.ok(/CAP\.ASSIGN_ADMIN/.test(block));
  assert.ok(/self_disable/.test(block), 'nobody may disable their own account');
});
