// THE CREST INCIDENT.
//
// Every opponent badge vanished from the home page and the fixtures page and
// 422 tests stayed green, because not one of them asserted that a club the site
// is about to draw actually has a crest to draw.
//
// Nothing was deleted. football_teams.crest_asset_path was declared with the
// comment "OUR artwork, from data/crests.json" and never written by anything.
// It was null for all 22 clubs from the day the registry was created. That was
// invisible while the pages read data/fixtures.json, which carries a crest for
// all 40 matches. The moment those pages were migrated to read the registry
// first, they asked a source that had never held the value and drew the
// initials placeholder — which is CORRECT behaviour for a club we have no
// artwork for, and is exactly why nobody noticed. The failure rendered as a
// design decision.
//
// These tests exist so it can never render as one again.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const J = (f) => JSON.parse(R(f));
const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const { loadBrowserScript } = require('./helpers/browser');

// The REAL js/crest.js the site ships, running in node, with the club's own
// library loaded into it. Testing a copy would let the copy drift.
const LaneCrest = loadBrowserScript('js/crest.js').LaneCrest;
J('data/crests.json').crests.forEach((c) => {
  LaneCrest._index[LaneCrest.norm(c.name)] = c.file;
});

const CRESTS = J('data/crests.json').crests;
const FIXTURES = J('data/fixtures.json').fixtures;

/* ── the artwork itself ───────────────────────────────────────────────────── */

test('every crest the library names exists on disk, with the exact filename', () => {
  // Case matters: the club's Mac is case-insensitive and Netlify's CDN is not,
  // so a capital letter here is a broken image only in production.
  const missing = [];
  CRESTS.forEach((c) => {
    const p = path.join(ROOT, c.file);
    if (!fs.existsSync(p)) { missing.push(c.name + ' → ' + c.file); return; }
    const dir = path.dirname(p);
    const base = path.basename(p);
    if (fs.readdirSync(dir).indexOf(base) === -1) missing.push(c.name + ' → case mismatch: ' + c.file);
  });
  assert.deepStrictEqual(missing, [], 'crest files named but not present');
});

test('no crest path is empty, absolute, or a guess', () => {
  CRESTS.forEach((c) => {
    assert.ok(c.name && c.name.trim(), 'a crest entry with no club name');
    assert.ok(c.file && c.file.trim(), c.name + ' has an empty file path');
    assert.ok(!/^https?:/i.test(c.file), c.name + ' hotlinks a remote asset');
    assert.ok(!c.file.startsWith('/'), c.name + ' uses a root-relative path, which breaks on subpaths');
  });
});

/* ── EVERY club the site actually shows ───────────────────────────────────── */

test('EVERY OPPONENT IN THE SEASON HAS A CREST', () => {
  // The invariant the incident broke. If a club is on the fixture list, the
  // site will draw it, and it must have something real to draw.
  const L = LaneCrest;
  const have = {};
  CRESTS.forEach((c) => { have[L.norm(c.name)] = c.file; });

  const opponents = [...new Set(FIXTURES.map((f) => f.opponent).filter(Boolean))];
  assert.ok(opponents.length >= 15, 'expected a full season of opponents');
  const without = opponents.filter((o) => !have[L.norm(o)]);
  assert.deepStrictEqual(without, [], 'season opponents with no crest');
});

test('Rayners Lane has its own badge', () => {
  const L = LaneCrest;
  const have = {};
  CRESTS.forEach((c) => { have[L.norm(c.name)] = c.file; });
  assert.ok(have[L.norm('Rayners Lane')], 'the club has no crest of its own');
  assert.ok(have[L.norm('Rayners Lane FC')], '"FC" must resolve to the same club');
});

test('the clubs named in this incident all resolve', () => {
  const L = LaneCrest;
  const have = {};
  CRESTS.forEach((c) => { have[L.norm(c.name)] = c.file; });
  ['Wallingford & Crowmarsh', 'Wallingford and Crowmarsh',
   'Broadfields United', 'Hilltop', 'London Lions'].forEach((n) => {
    assert.ok(have[L.norm(n)], n + ' does not resolve to a crest');
  });
});

/* ── the resolver ─────────────────────────────────────────────────────────── */

test('spelling variants collapse to one club', () => {
  const L = LaneCrest;
  assert.strictEqual(L.norm('Wallingford & Crowmarsh'), L.norm('Wallingford and Crowmarsh'));
  assert.strictEqual(L.norm('Broadfields Utd'), L.norm('Broadfields United'));
  assert.strictEqual(L.norm('Rayners Lane FC'), L.norm('Rayners Lane'));
  assert.strictEqual(L.norm('AFC Hayes'), L.norm('A.F.C. Hayes'));
  // And genuinely different clubs stay different.
  assert.notStrictEqual(L.norm('London Lions'), L.norm('Lions'));
  assert.notStrictEqual(L.norm('Hayes & Yeading United'), L.norm('Hayes'));
});

test('NO TWO CLUBS THE SITE ACTUALLY SHOWS COLLIDE', () => {
  // The property that matters. Stripping "AFC" means "AFC Hayes" and "Hayes"
  // would collapse to one key — a latent trap, documented below — so the guard
  // is not "the rule is perfect" but "no club we actually carry hits it".
  const L = LaneCrest;
  const seen = {};
  const clashes = [];
  CRESTS.forEach((c) => {
    const k = L.norm(c.name);
    if (seen[k]) clashes.push(seen[k] + ' <-> ' + c.name);
    seen[k] = c.name;
  });
  assert.deepStrictEqual(clashes, [], 'two clubs in the crest library share a key');

  const oppSeen = {};
  const oppClashes = [];
  [...new Set(FIXTURES.map((f) => f.opponent).filter(Boolean))].forEach((o) => {
    const k = L.norm(o);
    if (oppSeen[k]) oppClashes.push(oppSeen[k] + ' <-> ' + o);
    oppSeen[k] = o;
  });
  assert.deepStrictEqual(oppClashes, [], 'two clubs in the season share a key');
});

test('the AFC collapse is a KNOWN latent trap, not a live one', () => {
  // Recorded deliberately rather than quietly tolerated. "AFC Hayes" and
  // "Hayes" normalise identically, here and in the Netlify functions. If a
  // league ever contains both, this test fails and somebody has to decide —
  // rather than one club silently wearing the other's badge.
  const L = LaneCrest;
  assert.strictEqual(L.norm('AFC Hayes'), L.norm('Hayes'),
    'documenting the actual behaviour, so a change to it is deliberate');
  const names = CRESTS.map((c) => c.name)
    .concat([...new Set(FIXTURES.map((f) => f.opponent).filter(Boolean))]);
  const risky = names.filter((n) => /\bA\.?F\.?C\.?\b/i.test(n));
  risky.forEach((n) => {
    const bare = n.replace(/\bA\.?F\.?C\.?\b/i, '').trim();
    assert.ok(!names.some((m) => m !== n && L.norm(m) === L.norm(bare)),
      'both "' + n + '" and a bare "' + bare + '" are in play — they now collide');
  });
});

test('THE RESOLVER NEVER RETURNS NOTHING', () => {
  const L = LaneCrest;
  ['', null, undefined, '   ', 'A Club We Have Never Played'].forEach((n) => {
    const r = L.resolve(n);
    assert.ok(r, 'no result for ' + JSON.stringify(n));
    assert.strictEqual(typeof r.initials, 'string');
    assert.ok(r.initials.length >= 1, 'the shield must always have something to show');
    assert.strictEqual(r.fallback, true);
    assert.strictEqual(r.url, null, 'a guessed filename is worse than an honest fallback');
  });
});

test('a fallback declares itself and can never pass as a crest', () => {
  const L = LaneCrest;
  const real = L.resolve('Broadfields United');
  const none = L.resolve('Club With No Artwork');
  assert.strictEqual(real.fallback, false);
  assert.strictEqual(real.healthy, true);
  assert.strictEqual(none.fallback, true);
  assert.strictEqual(none.healthy, false, 'health must be able to see this');
  assert.notStrictEqual(real.source, none.source);
});

test('initials read as the club, not as noise', () => {
  const L = LaneCrest;
  assert.strictEqual(L.initials('Wallingford & Crowmarsh'), 'WC');
  assert.strictEqual(L.initials('Broadfields United'), 'B');
  assert.strictEqual(L.initials('New Bradwell St Peter'), 'NBS');
  assert.strictEqual(L.initials(''), '?');
});

test('an approved local crest outranks anything passed in', () => {
  const L = LaneCrest;
  const r = L.resolve('Broadfields United', 'https://someone-elses-cdn.example/badge.png');
  assert.strictEqual(r.url, 'img/crests/broadfields-united.png',
    'the club\'s own artwork is the club\'s record');
  assert.strictEqual(r.source, 'club-library-unverified');
});

test('a published programme keeps the artwork it published', () => {
  // Immutability: an archived edition showing today's badge would rewrite the
  // past. preferHint is how the cover honours what the snapshot stored.
  const L = LaneCrest;
  const r = L.resolve('Broadfields United', 'img/crests/old-broadfields.png', { preferHint: true });
  assert.strictEqual(r.url, 'img/crests/old-broadfields.png');
  assert.match(r.source, /snapshot/);
});

/* ── the surfaces ─────────────────────────────────────────────────────────── */

test('EVERY public surface uses the one resolver', () => {
  // Six pages had improvised six resolvers. Five broke. One survived.
  const surfaces = {
    'js/club-now.js': 'homepage next match and last result',
    'fixtures.html': 'fixtures and results',
    'js/programme-cover.js': 'programme covers and archive cards',
  };
  Object.keys(surfaces).forEach((f) => {
    const s = strip(R(f));
    assert.match(s, /LaneCrest\.html\(/, surfaces[f] + ' does not use the shared resolver');
  });
});

test('the pages that resolve crests actually load the resolver', () => {
  ['index.html', 'fixtures.html', 'programmes.html'].forEach((f) => {
    assert.match(R(f), /js\/crest\.js\?v=\d+/, f + ' renders crests without loading the resolver');
  });
});

test('the crest library is proven BEFORE the first paint', () => {
  // Otherwise the page draws initials, the library arrives, and nothing
  // re-renders — which looks exactly like having no crest.
  const cn = strip(R('js/club-now.js'));
  assert.match(cn, /loadCrestLibrary\(\)/);
  assert.match(cn, /Promise\.all\(\[loadCrestLibrary\(\)/,
    'the homepage must wait for the library before building');
  const fx = strip(R('fixtures.html'));
  assert.match(fx, /await window\.LaneCrest\.load\(\)/,
    'the fixtures page must wait for the library');
});

test('THE READER STAYS SNAPSHOT-ONLY', () => {
  // The one surface that must NOT resolve at read time. An archived programme
  // reaching for a current asset would quietly rewrite the club's own history.
  const s = R('js/programme-reader.js');
  assert.ok(s.indexOf('crests.json') === -1, 'the reader must not read the live crest library');
  assert.ok(s.indexOf('LaneCrest') === -1, 'the reader must not resolve crests at read time');
  assert.ok(R('programme.html').indexOf('js/crest.js') === -1,
    'the reader page must not even load the resolver');
});

/* ── the data path that caused it ─────────────────────────────────────────── */

test('the registry sync WRITES a crest for a team it creates', () => {
  const s = strip(R('netlify/functions/football-sync-season.js'));
  assert.match(s, /CRESTS\.backfill\(allTeams\)/,
    'nothing populates crest_asset_path, which is the whole incident');
  assert.match(s, /crestsRestored/, 'the run must say how many it restored');
});

test('A NULL CREST CAN NEVER OVERWRITE APPROVED ARTWORK', () => {
  const CR = require('../netlify/functions/lib/football/crests');
  // The rule, directly.
  assert.strictEqual(CR.patchFor('img/crests/broadfields-united.png', 'Broadfields United').keep, true);
  assert.strictEqual(CR.patchFor(null, 'Broadfields United').keep, false);
  assert.strictEqual(CR.patchFor('', 'Broadfields United').keep, false, 'empty string is an absence');
  assert.strictEqual(CR.patchFor('   ', 'Broadfields United').keep, false);
});

test('the backfill only ever fills a blank', async () => {
  const CR = require('../netlify/functions/lib/football/crests');
  const map = { 'broadfieldsunited': 'img/crests/broadfields-united.png' };
  const teams = [
    { id: 1, canonical_name: 'Broadfields United', crest_asset_path: null },
    { id: 2, canonical_name: 'Broadfields United', crest_asset_path: 'img/crests/custom.png' },
    { id: 3, canonical_name: 'A Club With No Artwork', crest_asset_path: null },
  ];
  // Inject the library rather than reaching the network in a test.
  const out = teams.filter((t) => !CR.patchFor(t.crest_asset_path, t.canonical_name).keep)
    .map((t) => ({ id: t.id, crest_asset_path: CR.forName(map, t.canonical_name) }))
    .filter((r) => r.crest_asset_path);
  assert.deepStrictEqual(out, [{ id: 1, crest_asset_path: 'img/crests/broadfields-united.png' }],
    'it must fill 1, leave 2 alone, and refuse to guess for 3');
});

test('the crest is kept OUT of the destructive upsert path', () => {
  // ensureTeams upserts with merge-duplicates, which writes every column it is
  // given. A crest in that payload would be written as null on any run where
  // the library failed to load — turning a bad minute into permanent loss.
  const s = R('netlify/functions/football-sync-season.js');
  const fn = s.slice(s.indexOf('async function ensureTeams'), s.indexOf('async function ensureCompetitions'));
  const payload = fn.slice(fn.indexOf('const rows = missing.map'), fn.indexOf('const saved'));
  assert.ok(payload.indexOf('crest_asset_path') === -1,
    'crest_asset_path must not be in the merge-duplicates payload');
});

test('the server and the browser agree on what club a name is', () => {
  // If they disagree, the registry stores a crest under one key and the page
  // looks it up under another, and the badge silently vanishes again.
  const server = require('../netlify/functions/lib/fwp/normalise');
  const L = LaneCrest;
  ['Wallingford & Crowmarsh', 'Broadfields United', 'Rayners Lane FC',
   'AFC Hayes', 'Penn & Tylers Green', 'New Bradwell St Peter'].forEach((n) => {
    assert.strictEqual(L.norm(n), server.clubKey(n), 'disagreement on: ' + n);
  });
});

/* ── the health view must be able to SEE this ─────────────────────────────── */

test('HEALTH CANNOT REPORT GREEN WHILE AN ACTIVE CLUB HAS NO CREST', () => {
  // The reason the incident ran undetected: this view reported everything
  // running while every opponent badge was gone, because it never looked.
  const s = strip(R('netlify/functions/football-health.js'));
  assert.match(s, /name: 'crests'/, 'crests must be a subsystem in their own right');
  assert.match(s, /crests\.state === 'missing' \? 'failing'/,
    'a missing crest must make the subsystem fail, not footnote it');
  // The overall verdict is computed from the subsystem list, so a failing
  // crest state necessarily makes the whole view non-green.
  const worst = s.indexOf("const worst = ['failing'");
  const push = s.indexOf("name: 'crests'");
  assert.ok(push < worst, 'crests must be in the list BEFORE the verdict is taken');
  assert.match(s, /club\(s\) on the fixture list have no crest/,
    'the summary line must say it in words a committee member can act on');
});

test('health names the clubs, not just a count', () => {
  const s = strip(R('netlify/functions/football-health.js'));
  assert.match(s, /clubsWithoutCrest/, '"3 missing" is not something anybody can go and fix');
});

test('health looks at the teams a fixture or table row actually uses', () => {
  const s = strip(R('netlify/functions/football-health.js'));
  assert.match(s, /home_team_id,away_team_id/, 'it must select the ids it then reads');
  assert.match(s, /football_league_table_rows\?select=team_id/);
});

test('AN EDITION CAN NEVER BE PUBLISHED WITH A BLANK COVER', () => {
  // The reader is snapshot-only by design, so whatever artwork an edition is
  // published with is what it shows for ever. If crest_asset_path were still
  // null at publication, that cover would carry two grey letters permanently.
  const s = strip(R('netlify/functions/programme-sync.js'));
  assert.match(s, /CRESTS\.library\(\)/, 'the sync must resolve artwork before generating');
  assert.match(s, /CRESTS\.patchFor\(t\.crest_asset_path, t\.canonical_name\)\.keep/,
    'and must never overwrite a crest the registry already holds');
  // Resolved BEFORE the snapshot is built, not after.
  assert.ok(s.indexOf('CRESTS.library()') < s.indexOf('return {\n    homeTeam'),
    'artwork must be settled before the context is returned');
});

test('the crest backfill is NOT rate-limited behind provider courtesy', () => {
  // It reads the club's own published library and makes no provider request.
  // Folded into the season step it would have waited hours behind a courtesy
  // limit that does not apply to it — a missing badge staying missing for no
  // reason at all.
  const s = strip(R('netlify/functions/football-registry-sync.js'));
  const crestStep = s.slice(s.indexOf("step('crests'"), s.indexOf("step('players'"));
  assert.ok(crestStep.length > 0, 'crests must be a step of their own');
  assert.ok(!/age < EVERY/.test(crestStep), 'the backfill must not be gated on freshness');
  assert.match(crestStep, /CRESTS\.backfill\(teams\)/);
  assert.match(crestStep, /withoutArtwork/, 'and it must name what it could not fix');
});
