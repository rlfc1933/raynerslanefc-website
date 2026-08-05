// ════════════════════════════════════════════════════════════════════════════
// THE PERSONALISED PORTAL — what these tests are actually protecting.
//
// Three failures were possible here, and all three are silent — the portal
// would look completely normal while being wrong:
//
//  1. A ROLE THE PORTAL OFFERS BUT THE SERVER REFUSES. The Chairman fills in
//     the invitation form, picks "Team Manager", and is told it is not a role
//     this club uses. Nothing in the interface hinted at that.
//
//  2. A TOOL THAT FALLS OUT OF ALL CLUB TOOLS. Grouping is by membership of a
//     list. Add a panel, forget the list, and the tool is unreachable except
//     by typing its URL — and nobody knows it happened, because the page still
//     renders perfectly.
//
//  3. RECENT WORK THAT REPORTS A SAVE THAT DID NOT HAPPEN. The functions
//     answer { ok: false } with HTTP 200. Trusting the status code would put
//     "Saved Fixtures — just now" on screen after a failed save, which is the
//     exact moment a volunteer most needs to be told the truth.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SERVER_ROLES = require(path.join(ROOT, 'netlify/functions/lib/roles.js'));

/** Load a browser file into a throwaway global. No DOM is needed by these. */
function loadBrowser(rel, extraGlobals) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const win = Object.assign({}, extraGlobals || {});
  const ctx = vm.createContext({ window: win, document: undefined, console });
  ctx.window.window = ctx.window;
  vm.runInContext(src, ctx);
  return ctx.window;
}

const PT = loadBrowser('js/portal-tools.js').PortalTools;

// ── 1 · THE PORTAL AND THE SERVER AGREE ON WHAT A ROLE IS ───────────────────

test('every role profile the portal offers is a role the server accepts', () => {
  Object.keys(PT.PROFILES).forEach((key) => {
    assert.ok(
      SERVER_ROLES.ROLES.indexOf(key) > -1,
      `the portal offers "${key}" but lib/roles.js would refuse it`
    );
  });
});

test('every role the server accepts has a profile in the portal', () => {
  SERVER_ROLES.ROLES.forEach((r) => {
    assert.ok(
      PT.PROFILES[r],
      `lib/roles.js accepts "${r}" but the portal has no layout for it`
    );
  });
});

test('there are thirteen role profiles, and they are jobs rather than names', () => {
  const keys = Object.keys(PT.PROFILES);
  assert.strictEqual(keys.length, 13);
  // A profile keyed to a person would have to be edited the day they leave.
  ['pete', 'nigel', 'gary', 'jenny', 'russell', 'darren', 'smallz'].forEach((n) => {
    keys.forEach((k) => {
      assert.ok(k.toLowerCase().indexOf(n) === -1, `profile "${k}" is named after a person`);
    });
  });
});

test('Chairman is the only role the server treats as escalation', () => {
  assert.deepStrictEqual(SERVER_ROLES.ADMIN_ROLES, ['Chairman']);
  assert.ok(SERVER_ROLES.ASSIGNABLE_ROLES.indexOf('Chairman') === -1);
  assert.strictEqual(SERVER_ROLES.ASSIGNABLE_ROLES.length, SERVER_ROLES.ROLES.length - 1);
});

test('a role that is not on the list is refused', () => {
  assert.strictEqual(SERVER_ROLES.isRole('Chairman'), true);
  assert.strictEqual(SERVER_ROLES.isRole('chairman'), false);   // case matters
  assert.strictEqual(SERVER_ROLES.isRole('Superuser'), false);
  assert.strictEqual(SERVER_ROLES.isRole(''), false);
  assert.strictEqual(SERVER_ROLES.isRole(null), false);
  assert.strictEqual(SERVER_ROLES.isRole(undefined), false);
});

test('the invite route and the user route read the same list', () => {
  ['staff-invite.js', 'staff-users.js'].forEach((f) => {
    const src = fs.readFileSync(path.join(ROOT, 'netlify/functions', f), 'utf8');
    const code = src.replace(/^\s*(\/\/.*)$/gm, '');   // never match our own prose
    assert.ok(/require\(['"]\.\/lib\/roles['"]\)/.test(code),
      `${f} should take its roles from lib/roles.js, not keep its own copy`);
  });
});

// ── 2 · NOTHING FALLS OUT OF ALL CLUB TOOLS ─────────────────────────────────

test('every tool appears in exactly one group', () => {
  const grouped = [].concat(...PT.AREAS.map((a) => a.ids));
  const seen = {};
  grouped.forEach((id) => {
    assert.ok(!seen[id], `"${id}" is in more than one group`);
    seen[id] = true;
  });
  PT.TOOLS.forEach((t) => {
    assert.ok(seen[t.id], `"${t.id}" is in no group — it would be unreachable`);
  });
  assert.strictEqual(grouped.length, PT.TOOLS.length);
});

test('every group id names a tool that exists', () => {
  PT.AREAS.forEach((a) => {
    a.ids.forEach((id) => {
      assert.ok(PT.byId(id), `group "${a.key}" lists "${id}", which is not a tool`);
    });
  });
});

test('every panel in admin.html is a tool in the registry', () => {
  const html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  const ids = [...html.matchAll(/<div class="panel" id="panel-([\w-]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 40, 'expected to find the portal panels');
  ids.forEach((id) => {
    assert.ok(PT.byId(id), `panel-${id} exists in admin.html but is in no group`);
  });
});

test('the eight groups the club asked for are all present', () => {
  const names = PT.AREAS.map((a) => a.name);
  ['Match Day', 'News and Website', 'Programme', 'Social and Marketing',
   'Photos and Media', 'Sponsors', 'Reports and Committee', 'Help'
  ].forEach((n) => assert.ok(names.indexOf(n) > -1, `missing the "${n}" group`));
});

test('Emergency Controls is not filed under Help', () => {
  // It takes the live scoreboard down. Somebody looking for the handbook must
  // not find it in the same list.
  assert.strictEqual(PT.areaOf('undo').key, 'system');
  assert.notStrictEqual(PT.areaOf('undo').key, 'help');
});

// ── 3 · EVERY PROFILE POINTS AT SOMETHING REAL ──────────────────────────────

test('no profile recommends a tool that does not exist', () => {
  Object.keys(PT.PROFILES).forEach((key) => {
    const p = PT.PROFILES[key];
    p.home.forEach((id) => assert.ok(PT.byId(id), `${key}.home names "${id}"`));
    p.quick.forEach((q) => assert.ok(PT.byId(q.panel), `${key}.quick names "${q.panel}"`));
  });
});

test('every profile has quick actions and a home layout', () => {
  Object.keys(PT.PROFILES).forEach((key) => {
    const p = PT.PROFILES[key];
    assert.ok(p.home.length >= 3, `${key} has too few tools on its home`);
    assert.ok(p.quick.length >= 2, `${key} has too few quick actions`);
    assert.ok(p.quick.length <= 4, `${key} has too many quick actions to scan`);
    assert.ok(p.title && p.blurb, `${key} needs a title and a one-line description`);
  });
});

test('only the Chairman profile leads with staff accounts', () => {
  assert.strictEqual(PT.PROFILES['Chairman'].quick[0].panel, 'users');
  Object.keys(PT.PROFILES).forEach((key) => {
    if (key === 'Chairman' || key === 'V Chairman') return;
    PT.PROFILES[key].quick.forEach((q) => {
      assert.notStrictEqual(q.panel, 'users', `${key} should not lead with staff accounts`);
    });
  });
});

test('an unknown role falls through to Committee, never to Chairman', () => {
  assert.strictEqual(PT.profileKey('Nonsense'), 'Committee');
  assert.strictEqual(PT.profileKey(''), 'Committee');
  assert.strictEqual(PT.profileKey(null), 'Committee');
  assert.strictEqual(PT.profileKey(undefined), 'Committee');
  assert.notStrictEqual(PT.profileKey('Nonsense'), 'Chairman');
});

test('the role names the sign-in screen already offers still resolve', () => {
  // Anyone signed in today holds one of these. None may become "Committee" by
  // accident, because that would silently change what their portal opens on.
  const existing = ['Club Management', 'Chairman', 'V Chairman', 'Committee',
    'Club Secretary', 'Match Day Secretary', 'Marketing/Media'];
  existing.forEach((r) => {
    const p = PT.profileFor(r);
    assert.ok(p, `"${r}" no longer resolves to a profile`);
    if (r !== 'Committee') {
      assert.notStrictEqual(PT.profileKey(r), 'Committee',
        `"${r}" quietly fell back to the Committee layout`);
    }
  });
  assert.strictEqual(PT.profileKey('Club Management'), 'Team Manager');
});

test('a profile recommends but never hides — every tool stays in a group', () => {
  // The real permission boundary is the server. If a tool were reachable only
  // through a profile, the profile would be acting as a permission it cannot
  // enforce.
  const grouped = [].concat(...PT.AREAS.map((a) => a.ids));
  Object.keys(PT.PROFILES).forEach((key) => {
    PT.PROFILES[key].home.forEach((id) => {
      assert.ok(grouped.indexOf(id) > -1, `"${id}" is only reachable through ${key}`);
    });
  });
});

// ── 4 · PLAIN-LANGUAGE STATUS ───────────────────────────────────────────────

test('the six statuses a volunteer sees are the six that exist', () => {
  assert.deepStrictEqual(Object.keys(PT.STATUS),
    ['draft', 'saved', 'submitted', 'approved', 'published', 'archived']);
});

test('every status says who is waiting on whom', () => {
  Object.keys(PT.STATUS).forEach((k) => {
    const s = PT.STATUS[k];
    assert.ok(s.label && /^[A-Z]/.test(s.label), `${k} needs a plain one-word label`);
    assert.ok(s.means && s.means.length > 25, `${k} needs a sentence explaining it`);
    assert.ok(!/_/.test(s.label), `${k} label still reads like a database value`);
  });
});

test('the database wording a volunteer would otherwise see is translated', () => {
  assert.strictEqual(PT.statusOf('awaiting_reconciliation').label, 'Submitted');
  assert.strictEqual(PT.statusOf('in_progress').label, 'Draft');
  assert.strictEqual(PT.statusOf('unpublished').label, 'Draft');
  assert.strictEqual(PT.statusOf('live').label, 'Published');
  assert.strictEqual(PT.statusOf('PENDING').label, 'Submitted');
  assert.strictEqual(PT.statusOf('signed off').label, 'Approved');
});

test('an unrecognised status returns nothing rather than guessing', () => {
  // Showing "Published" for a status nobody has mapped would be a lie about
  // whether supporters can see something.
  assert.strictEqual(PT.statusOf('quantum'), null);
  assert.strictEqual(PT.statusOf(''), null);
  assert.strictEqual(PT.statusOf(null), null);
});

// ── 5 · MY RECENT WORK RECORDS ONLY CONFIRMED SAVES ─────────────────────────

test('recent work only watches endpoints that actually change something', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/portal-recent.js'), 'utf8');
  const code = src.replace(/^\s*(\/\/.*|\*.*|\/\*.*)$/gm, '');
  // A 200 with { ok: false } is a failed save. It must not be recorded.
  assert.ok(/j\.ok === false/.test(code),
    'a save that failed with HTTP 200 would be recorded as a success');
  assert.ok(/res && res\.ok/.test(code), 'the HTTP status is still checked');
});

test('recent work never leaves the browser', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/portal-recent.js'), 'utf8');
  const code = src.replace(/^\s*(\/\/.*|\*.*|\/\*.*)$/gm, '');
  assert.ok(/localStorage/.test(code));
  // No route, no table, no beacon — this is a note to self, not an audit log.
  assert.ok(!/netlify\/functions/.test(code) || !/method:\s*['"]POST/.test(code),
    'recent work should not post anywhere');
  assert.ok(!/sendBeacon/.test(code));
});

test('recent work stores no content, only which tool and when', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/portal-recent.js'), 'utf8');
  const stored = src.match(/rows\.unshift\(\{([^}]*)\}\)/);
  assert.ok(stored, 'expected the shape of a stored row to be findable');
  const fields = stored[1].split(',').map((f) => f.split(':')[0].trim()).filter(Boolean);
  assert.deepStrictEqual(fields.sort(), ['at', 'tool', 'verb']);
});

test('the portal home paints recent work from PortalRecent, not from a guess', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/portal-home.js'), 'utf8');
  const code = src.replace(/^\s*(\/\/.*|\*.*|\/\*.*)$/gm, '');
  assert.ok(/PortalRecent/.test(code));
  // An empty list must render as empty, not as a placeholder that looks like work.
  assert.ok(/Nothing saved yet/.test(code));
});

// ── 6 · THE SHELL HAS THE SEVEN SECTIONS ────────────────────────────────────

test('the home renders all seven sections, in order', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/portal-home.js'), 'utf8');
  const call = src.match(/el\.innerHTML = (viewMyPortal[\s\S]*?);/);
  assert.ok(call, 'expected one render call listing the sections');
  const order = call[1].match(/view\w+/g);
  assert.deepStrictEqual(order, [
    'viewMyPortal', 'viewAttention', 'viewQuick', 'viewRecent',
    'viewMyWork', 'viewAreas', 'viewHelp',
  ]);
});

test('a person with no recorded name is greeted without one being invented', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/portal-home.js'), 'utf8');
  const fn = src.match(/function firstName\(\)[\s\S]*?\n  \}/)[0];
  const body = fn.replace(/^\s*(\/\/.*)$/gm, '');
  // Deriving a name from the username would produce "Hello, Vchairman".
  assert.ok(!/username/.test(body), 'a name must never be derived from a username');
  assert.ok(/return ''/.test(body), 'an account with no name must fall back to nothing');
  assert.ok(/Welcome back/.test(src), 'expected a greeting for accounts with no name');
});

test('the name shown on the home page comes from the server, not the sign-in form', () => {
  const html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  const block = html.match(/var sName = null[\s\S]*?rlfc_staff[^\n]*\n/)[0];
  assert.ok(/sName = res\.name \|\| null/.test(block));
  assert.ok(/name: sName/.test(block));
  // Nothing typed into the sign-in screen may become the greeting.
  assert.ok(!/sName = gv\(/.test(block));
});

// ── 7 · THE INVITATION FORM CANNOT OFFER WHAT THE SERVER REFUSES ────────────

test('the role menus are built from the registry, not hand-written options', () => {
  const html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  assert.ok(/<select id="inv-profile"><\/select>/.test(html),
    'the invitation role menu should be filled from the registry at open');
  assert.ok(/function staffRoleOptions\(\)/.test(html));
  assert.ok(/PortalTools\.PROFILES/.test(html));
});

test('the shared default password is no longer pre-filled into the add-user box', () => {
  const html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  const input = html.match(/<input[^>]*id="us-pass"[^>]*>/)[0];
  assert.ok(/value=""/.test(input), 'the password box must start empty');
  assert.ok(/type="password"/.test(input), 'a password box should not be plain text');
  assert.ok(!/20raynerslanefc26/.test(input));
  // And it must not be written back after a successful save either.
  assert.ok(!/setVal\('us-pass', '20raynerslanefc26'\)/.test(html));
});

// ── 8 · THE GUIDES EXIST AND ARE REACHABLE ──────────────────────────────────

test('every guide a profile points at is a file that exists', () => {
  Object.keys(PT.PROFILES).forEach((key) => {
    const g = PT.PROFILES[key].guide;
    if (!g) return;
    const f = path.join(ROOT, 'docs/guides', g + '.md');
    assert.ok(fs.existsSync(f), `${key} points at a guide that does not exist: ${g}`);
  });
});

test('the guide reader will only open guides it knows', () => {
  const html = fs.readFileSync(path.join(ROOT, 'guide.html'), 'utf8');
  const code = html.replace(/<!--[\s\S]*?-->/g, '');
  // The name comes from the URL. Fetching an arbitrary path would make this a
  // way to read any file the site serves.
  assert.ok(/GUIDES\[s\] \? s : SHARED/.test(code),
    'an unknown guide name must fall back, never be fetched');
  assert.ok(/fetch\('docs\/guides\/' \+ name \+ '\.md'/.test(code));
});

test('every guide named in the reader exists on disk, and vice versa', () => {
  const html = fs.readFileSync(path.join(ROOT, 'guide.html'), 'utf8');
  const listed = [...html.matchAll(/^\s*'([a-z0-9-]+)':\s+'/gm)].map((m) => m[1]);
  assert.ok(listed.length >= 8);
  listed.forEach((g) => {
    assert.ok(fs.existsSync(path.join(ROOT, 'docs/guides', g + '.md')),
      `guide.html offers "${g}" but there is no such guide`);
  });
  fs.readdirSync(path.join(ROOT, 'docs/guides'))
    .filter((f) => f.endsWith('.md'))
    .forEach((f) => {
      const slug = f.replace(/\.md$/, '');
      assert.ok(listed.indexOf(slug) > -1, `${f} exists but no one can open it`);
    });
});

test('the guides and the setup page are kept out of search results', () => {
  const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
  ['/guide.html', '/docs/', '/staff-setup.html', '/admin.html'].forEach((p) => {
    assert.ok(robots.indexOf('Disallow: ' + p) > -1, `robots.txt should disallow ${p}`);
  });
});

test('no guide contains a password, a token or a PIN', () => {
  const dir = path.join(ROOT, 'docs/guides');
  fs.readdirSync(dir).filter((f) => f.endsWith('.md')).forEach((f) => {
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/20raynerslanefc26/.test(txt), `${f} contains a password`);
    assert.ok(!/\b\d{4,8}\b\s*(is|as)\s*(the|your)\s*(PIN|pin)/.test(txt), `${f} contains a PIN`);
    // A guide is read on a phone at a ground. It must never carry a credential.
    assert.ok(!/password is\s+\S+/i.test(txt), `${f} appears to state a password`);
  });
});

test('every named committee member has a guide', () => {
  ['pete-singh-chairman', 'nigel-hanlon-vice-chairman', 'gary-pitt-team-manager',
   'jenny-pitt-secretary', 'russell-nugent-programme-sponsors',
   'darren-nugent-programme-sponsors', 'smallz-social-media',
   'how-the-club-portal-works',
  ].forEach((g) => {
    assert.ok(fs.existsSync(path.join(ROOT, 'docs/guides', g + '.md')), `${g}.md is missing`);
  });
});

// ── 9 · THE GUIDES ACTUALLY RENDER ──────────────────────────────────────────
//
// A guide that renders as a wall of asterisks and pipes is worse than no
// guide: the person concludes the portal is broken and stops trusting it. So
// the reader's own renderer is run against the real guide files, not a fixture.

/** Run guide.html's script with just enough of a browser for the renderer. */
function guideReader() {
  const html = fs.readFileSync(path.join(ROOT, 'guide.html'), 'utf8');
  const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const captured = {};
  const el = { set innerHTML(v) { captured.html = v; }, get innerHTML() { return captured.html; } };
  const ctx = vm.createContext({
    document: { getElementById: () => el, title: '' },
    location: { hash: '' },
    window: { addEventListener() {}, scrollTo() {} },
    fetch: () => Promise.resolve({ ok: false }),   // open() fails; we test render directly
    console,
  });
  ctx.window.location = ctx.location;
  // The IIFE keeps render() private, so evaluate the body one level out.
  const body = src.replace(/^\s*\(function \(\) \{/, '').replace(/\}\(\)\);\s*$/, '');
  vm.runInContext(body + '\n;this.__render = render; this.__GUIDES = GUIDES;', ctx);
  return { render: ctx.__render, GUIDES: ctx.__GUIDES };
}

test('every guide renders as real HTML, not as raw Markdown', () => {
  const { render, GUIDES } = guideReader();
  Object.keys(GUIDES).forEach((slug) => {
    const md = fs.readFileSync(path.join(ROOT, 'docs/guides', slug + '.md'), 'utf8');
    const out = render(md);
    assert.ok(/<h1>/.test(out), `${slug}: no heading rendered`);
    assert.ok(/<p>/.test(out), `${slug}: no paragraphs rendered`);
    // Markdown syntax left on the page means the renderer did not understand it.
    assert.ok(!/\*\*/.test(out), `${slug}: unconverted bold markers`);
    assert.ok(!/^#/m.test(out), `${slug}: unconverted heading markers`);
    assert.ok(!/^\|/m.test(out), `${slug}: unconverted table row`);
    assert.ok(!/^\s*[-*]\s/m.test(out), `${slug}: unconverted list item`);
  });
});

test('the tables in the guides become tables', () => {
  const { render } = guideReader();
  const md = fs.readFileSync(path.join(ROOT, 'docs/guides/jenny-pitt-secretary.md'), 'utf8');
  const out = render(md);
  assert.ok(/<table>/.test(out) && /<th>/.test(out) && /<td>/.test(out));
  // Wide content must scroll inside itself rather than widening the page.
  assert.ok(/<div class="tw"><table>/.test(out));
});

test('nothing in a guide can introduce markup', () => {
  const { render } = guideReader();
  const out = render('# Hi\n\nA <script>alert(1)</script> and an <img onerror=x>.\n');
  assert.ok(!/<script>/.test(out), 'a tag in the source became a tag on the page');
  assert.ok(!/<img/.test(out));
  assert.ok(/&lt;script&gt;/.test(out), 'it should be shown as text instead');
});

test('a link to another guide stays inside the reader', () => {
  const { render } = guideReader();
  const out = render('See [the shared guide](how-the-club-portal-works.md).');
  assert.ok(/href="guide.html#how-the-club-portal-works"/.test(out));
  // A .md link to something that is not a guide must not become a link at all.
  const bad = render('See [notes](../secrets.md).');
  assert.ok(!/href=/.test(bad), 'linked to a file that is not a guide');
});

// ── 10 · NO DATABASE WORDING REACHES A VOLUNTEER ────────────────────────────

test('match-day statuses read as English, not as column values', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/matchday-ops.js'), 'utf8');
  const labels = src.match(/var STATUS_LABEL = \{[\s\S]*?\};/)[0];
  // "Awaiting reconciliation" is accurate and useless — it does not tell the
  // reader whether they are the person who has to act.
  assert.ok(!/'Awaiting reconciliation'/.test(labels));
  assert.ok(/'Waiting to be checked'/.test(labels));
  assert.ok(!/in_progress: 'In progress'/.test(labels));
  // No label may still be a raw state name.
  const shown = [...labels.matchAll(/: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(shown.length >= 9);
  shown.forEach((l) => assert.ok(!/_/.test(l), `"${l}" still reads like a database value`));
});

test('every match-day status says who is waiting on whom', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/matchday-ops.js'), 'utf8');
  const labels = src.match(/var STATUS_LABEL = \{[\s\S]*?\};/)[0];
  const means = src.match(/var STATUS_MEANS = \{[\s\S]*?\};/)[0];
  const keys = (t) => [...t.matchAll(/(\w+):\s*'/g)].map((m) => m[1]).sort();
  assert.deepStrictEqual(keys(means), keys(labels),
    'every status needs a sentence, and no sentence may describe a status that does not exist');
  [...means.matchAll(/: '([^']+)'/g)].forEach((m) => {
    assert.ok(m[1].length > 30, `too short to explain anything: "${m[1]}"`);
  });
});

test('the explanation is attached to the badge, where the question is asked', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/matchday-ops.js'), 'utf8');
  const fn = src.match(/function pill\(status, extra\) \{[\s\S]*?\n  \}/)[0];
  assert.ok(/title="/.test(fn), 'a pointer user must be able to see the sentence');
  assert.ok(/aria-label="/.test(fn), 'and a screen-reader user must hear it');
});

test('the nine match-day states are preserved, only their wording changed', () => {
  // Collapsing them into the portal's six generic words would lose the
  // difference between a match nobody started and one that was abandoned.
  const core = fs.readFileSync(path.join(ROOT, 'js/matchday-core.js'), 'utf8');
  const ops = fs.readFileSync(path.join(ROOT, 'js/matchday-ops.js'), 'utf8');
  const declared = core.match(/var RECORD_STATUSES = \[([\s\S]*?)\];/)[1]
    .match(/'(\w+)'/g).map((s) => s.replace(/'/g, ''));
  const labelled = ops.match(/var STATUS_LABEL = \{[\s\S]*?\};/)[0];
  declared.forEach((st) => {
    assert.ok(new RegExp('\\b' + st + ':').test(labelled), `${st} has no plain label`);
  });
});
