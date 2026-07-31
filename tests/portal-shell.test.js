// PORTAL RELEASE 1 — the new front door.
//
// These protect the promise made to the club: the navigation changed, and
// NOTHING ELSE DID. Every panel still reachable, every bookmark still valid,
// every save path untouched.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const tools = fs.readFileSync(path.join(ROOT, 'js/portal-tools.js'), 'utf8');
const home = fs.readFileSync(path.join(ROOT, 'js/portal-home.js'), 'utf8');

const panelIds = [...new Set([...admin.matchAll(/id="panel-([a-z]+)"/g)].map(m => m[1]))];
const registryIds = [...new Set([...tools.matchAll(/\{ id: '([a-z]+)'/g)].map(m => m[1]))];

// ── NOTHING BECAME UNREACHABLE ─────────────────────────────────────────────
test('every existing panel still exists in admin.html', () => {
  // 39 panels before Release 1. None may be deleted by a navigation change.
  assert.ok(panelIds.length >= 39, `expected >=39 panels, found ${panelIds.length}`);
  ['fixtures','mdops','matchday','squad','players','news','sponsors','records',
   'fanclub','users','developer','undo','settings','analytics','playbook','trialists',
   'siteguide','lowdown'].forEach(id => {
    assert.ok(panelIds.includes(id), `panel ${id} must still exist`);
  });
});

test('every panel is represented in the navigation registry', () => {
  // The registry is what the new Home renders from. A panel missing here would
  // become invisible even though it still exists — the exact trap this release
  // is fixing (the Business Playbook had no tile at all).
  const missing = panelIds.filter(id => !registryIds.includes(id));
  assert.deepStrictEqual(missing, [],
    'these panels exist but are not in the registry: ' + missing.join(', '));
});

test('the Business Playbook is now reachable through normal navigation', () => {
  assert.ok(/id: 'playbook'/.test(tools), 'playbook must be in the registry');
  assert.ok(/Income and Growth Plan/.test(tools), 'with its plain-English name');
  assert.ok(/area: 'admin'/.test(tools.slice(tools.indexOf("id: 'playbook'"), tools.indexOf("id: 'playbook'") + 400)),
    'filed under Club Administration');
});

// ── ROUTING, HISTORY AND BOOKMARKS ARE UNCHANGED ───────────────────────────
test('openPanel, hash routing and back-button behaviour are intact', () => {
  assert.ok(/function openPanel\(name\)/.test(admin));
  assert.ok(/history\.pushState\(\{ panel: name \}, '', '#' \+ name\)/.test(admin),
    'panels must still push a history entry so the back button works');
  assert.ok(/window\.addEventListener\('popstate'/.test(admin) || /popstate/.test(admin),
    'popstate handling must remain');
  assert.ok(/function restoreReturnPanel\(\)/.test(admin),
    'hash restore after reload must remain');
});

test('the new Home never calls a save function or an API', () => {
  // It reads fixtures/matchday/news and asks Match Day Ops for its list. It
  // must never write anything.
  assert.ok(!/commitDomain|save-data|pushToGitHub/.test(home),
    'the Home must not contain any write path');
  const writes = home.match(/method:\s*'POST'/g) || [];
  assert.strictEqual(writes.length, 1, 'only the read-only matchday-ops list call may POST');
  assert.ok(/action: 'list'/.test(home), 'and it must be the list action');
});

// ── SAFETY CLEAN-UP ────────────────────────────────────────────────────────
test('the retired takings ledger is archived, read-only and clearly marked', () => {
  assert.ok(/Historic Match-Day Takings/.test(admin), 'renamed to its archive name');
  assert.ok(/Historic takings recorded before Match-Day Attendance and Takings/.test(tools),
    'with the approved plain-English description');
  assert.ok(/archived: true/.test(tools), 'flagged as archived so it leaves normal navigation');
  assert.ok(/ANALYTICS_RETIRED/.test(admin), 'its write path stays closed');
  assert.ok(/Archived &mdash; read-only/.test(admin), 'its save button tells the truth');
});

test('the retired ledger no longer demands a password to read its notice', () => {
  assert.ok(!/if \(name === 'analytics' && !analyticsUnlocked\) \{ showAnalyticsGate\(\); return; \}/.test(admin),
    'opening the archive must not be blocked by the old password prompt');
});

test('emergency controls are isolated and explain the consequence first', () => {
  assert.ok(/Emergency Controls/.test(admin), 'renamed from Undo / Stop');
  assert.ok(/ph-danger/.test(admin), 'given warning treatment');
  assert.ok(/Use only if something has gone wrong/.test(admin));
  assert.ok(/stored <b>on this device only<\/b>/.test(admin),
    'the localStorage-only rollback history must be disclosed — users assume it is club-wide');
  assert.ok(/danger: true/.test(tools), 'flagged in the registry');
  assert.ok(/area: 'system'/.test(tools.slice(tools.indexOf("id: 'undo'"), tools.indexOf("id: 'undo'") + 400)),
    'moved out of Match Days into System');
});

test('rolling the website back requires a typed confirmation', () => {
  assert.ok(/Type RESTORE to continue/.test(admin), 'a tap-through confirm is not enough here');
  assert.ok(/!== 'RESTORE'/.test(admin), 'and the typed word must be checked');
});

test('Trial Applications shows only actions that actually persist', () => {
  assert.ok(/Trial Applications/.test(tools), 'renamed');
  assert.ok(/Contact and status are managed in HubSpot/.test(admin),
    'the read-only reality must be stated, not hidden');
  assert.ok(/href="mailto:/.test(admin), 'a real email action where an address exists');
  assert.ok(!/Mark reviewed/.test(admin), 'no button that could not save');
});

test('the guides are one destination', () => {
  assert.ok(/Guides and Handbook/.test(admin));
  assert.ok(/How To Run The Site/.test(admin), 'How To routes through it');
  assert.ok(/The Lane Lowdown/.test(admin), 'and the Lowdown keeps its branding inside it');
});

// ── ROLE PERSONALISATION IS NOT A LOCK ─────────────────────────────────────
test('every role has a home list, and none of them hides the rest of the portal', () => {
  ['Committee','Match Day Secretary','Club Secretary','Marketing/Media',
   'Club Management','V Chairman','Chairman'].forEach(r => {
    assert.ok(tools.includes(`'${r}':`), `${r} needs a My Club Work list`);
  });
  assert.ok(/View all club tools/.test(home), 'the escape hatch must always be rendered');
  assert.ok(/function toggleAll/.test(home));
});

test('chairman-only tools stay protected', () => {
  assert.ok(/\(name === 'users' \|\| name === 'developer'\) && !staffIsChairman\(\)/.test(admin),
    'the existing server-side-adjacent guard must remain');
  assert.ok(/chairman: true/.test(tools), 'and the registry marks them');
  assert.ok(/!t\.chairman \|\| isChairman\(\)/.test(home), 'and the Home filters them out');
});

test('Match Day Ops permissions were not touched', () => {
  const auth = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/md-auth.js'), 'utf8');
  assert.ok(/'Committee':\s*\[CAP\.RECORD\]/.test(auth), 'committee still records');
  assert.ok(/ELEVATED = \[CAP\.APPROVE, CAP\.REOPEN, CAP\.PRICES, CAP\.FINANCE\]/.test(auth),
    'senior actions unchanged');
});

// ── HONEST SAVE LANGUAGE ───────────────────────────────────────────────────
test('no bare "Save to Site" remains where it publishes public content', () => {
  assert.ok(!/>&#10003; Save to Site<\/button>/.test(admin),
    'every save button must say what it actually does');
  ['Save and publish fixtures','Save and publish squad','Save and publish sponsors',
   'Save to club portal'].forEach(l => {
    assert.ok(admin.includes(l), `expected the label "${l}"`);
  });
});

test('a public change gets a confirmation that stays until dismissed', () => {
  assert.ok(/function portalSaid\(kind, detail\)/.test(admin));
  assert.ok(/published:.*sticky: true/.test(admin),
    'a three-second toast is not proof of a public update');
  assert.ok(/draft:.*Draft saved at/.test(admin));
  assert.ok(/internal:.*This is not public/.test(admin));
  assert.ok(/failed:.*Check your connection/.test(admin));
});

// ── ORIENTATION ────────────────────────────────────────────────────────────
test('every tool shows a breadcrumb without breaking routing', () => {
  assert.ok(/function paintCrumb\(name, panel\)/.test(admin));
  assert.ok(/paintCrumb\(name, p\);/.test(admin), 'called on every panel open');
  assert.ok(/ph-crumb/.test(admin));
  assert.ok(/onclick="back\(\)"/.test(admin), 'Home in the crumb uses the existing back()');
});

// ── PLAIN ENGLISH ──────────────────────────────────────────────────────────
test('technical terms do not appear in normal navigation', () => {
  const banned = ['FWP', 'JSON', 'RLS', 'canonical', 'lifecycle'];
  banned.forEach(w => {
    assert.ok(!new RegExp('\\b' + w + '\\b').test(tools),
      `"${w}" must not appear in the navigation registry`);
  });
});

test('the approved plain-English names are used', () => {
  [['Fixtures and Results'], ['Match-Day Attendance and Takings'], ['Live Scoreboard'],
   ['Club Enquiries'], ['Club Overview'], ['Sponsor Prospects'], ['Commercial Pipeline'],
   ['Match Tweet Cards'], ['Monthly Fixture Posters'], ['Review Drafted Stories'],
   ['Trial Applications'], ['Committee and Staff'], ['Supporter Offers'],
   ['View the Public Website'], ['Emergency Controls'], ['Staff Logins']].forEach(([n]) => {
    assert.ok(tools.includes(n), `expected the approved name "${n}"`);
  });
  // Branded names kept, but always explained.
  assert.ok(/Post Studio/.test(tools) && /Make match-day graphics/.test(tools));
  assert.ok(/The Lane Lowdown/.test(tools) && /Club facts, history and talking points/.test(tools));
});

test('every tool card states whether it changes the public website', () => {
  const entries = tools.match(/effect: '(public|internal|download|view)'/g) || [];
  assert.ok(entries.length >= registryIds.length,
    'every registry entry needs an effect so the card can say what it changes');
  assert.ok(/Changes the website/.test(home), 'and the card must render it');
});

// ── PRESENTATION RULES ─────────────────────────────────────────────────────
test('attention limits and readable type are enforced', () => {
  assert.ok(/window\.innerWidth < 700 \? 3 : 5/.test(home),
    '3 attention items on mobile, 5 on desktop, then View all');
  const css = fs.readFileSync(path.join(ROOT, 'css/portal-home.css'), 'utf8');
  assert.ok(/\.ph-tool__desc[\s\S]{0,120}font-size: 14px/.test(css), 'descriptions >= 14px');
  assert.ok(/\.ph-att__go[\s\S]{0,200}min-height: 48px/.test(css), 'primary actions >= 48px');
  assert.ok(/\.ph-att--red/.test(css) && /\.ph-att--amber/.test(css),
    'red for overdue, amber for upcoming');
});
