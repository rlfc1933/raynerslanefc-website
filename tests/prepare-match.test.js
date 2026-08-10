// ════════════════════════════════════════════════════════════════════════════
// THE FIXTURE COMES FIRST, AND IT IS THE SAME FIXTURE EVERYWHERE.
//
// A volunteer opening the portal saw thirty-one tools and no football.
// Preparing Saturday's game meant knowing the programme lives in one panel,
// the squad in another and the sponsors in a third — knowledge the portal
// never gave anyone.
//
// The two things most likely to go wrong here, and which these tests exist to
// hold:
//
//   1. DERIVING LIVE FROM THE CLOCK. A kick-off time that has passed does not
//      mean the match is live and certainly does not mean we know the score.
//      Live is read from the block that publishes it, or it is not claimed.
//
//   2. DISAGREEING WITH THE REST OF THE SITE ABOUT "NEXT MATCH". The first
//      version counted a POSTPONED fixture as the next match, so this card
//      said Hilltop while the homepage said New Bradwell. Two surfaces naming
//      different next matches is precisely the confusion the screen exists to
//      remove — and there is no programme to build for a game not happening.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/prepare-match.js'), 'utf8');
const ADMIN = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');

/** Load the module against a minimal window, with no live authority present. */
function load(win) {
  const w = Object.assign({ fetch: () => Promise.resolve({ ok: false }) }, win || {});
  const ctx = vm.createContext({ window: w, globalThis: w, document: w.document || null, fetch: w.fetch });
  vm.runInContext(SRC, ctx);
  return w.PrepareMatch;
}

const FIXTURES = [
  { id: 'a', date: '2026-08-11', kickoff: '19:45', opponent: 'Hilltop', status: 'postponed', isHome: true },
  { id: 'b', date: '2026-08-15', kickoff: '15:00', opponent: 'New Bradwell St Peter', status: 'scheduled', isHome: true },
  { id: 'c', date: '2026-08-22', kickoff: '15:00', opponent: 'Harefield United', status: 'scheduled', isHome: false },
  { id: 'z', date: '2026-08-01', kickoff: '15:00', opponent: 'Wallingford', status: 'played', isHome: true, us: 3, them: 3 }
];

// ── 1 · WHICH MATCH ─────────────────────────────────────────────────────────

test('a postponed fixture is not the match you prepare', () => {
  const PM = load({});
  const got = PM._pick(FIXTURES);
  assert.strictEqual(got.state, 'upcoming');
  assert.strictEqual(got.fixture.opponent, 'New Bradwell St Peter',
    'the postponed Hilltop tie must be skipped in favour of the next playable game');
});

test('cancelled and abandoned are skipped for the same reason', () => {
  const PM = load({});
  const list = FIXTURES.map((f) => (f.id === 'b' ? Object.assign({}, f, { status: 'cancelled' }) : f));
  assert.strictEqual(PM._pick(list).fixture.opponent, 'Harefield United');
});

test('with nothing ahead, the most recent completed match is offered', () => {
  const PM = load({});
  const got = PM._pick(FIXTURES.filter((f) => f.status === 'played'));
  assert.strictEqual(got.state, 'finished');
  assert.strictEqual(got.fixture.opponent, 'Wallingford');
});

test('an empty calendar produces no fixture rather than a guess', () => {
  const PM = load({});
  const got = PM._pick([]);
  assert.strictEqual(got.fixture, null);
  assert.strictEqual(got.state, 'none');
});

// ── 2 · LIVE IS READ, NEVER DERIVED ─────────────────────────────────────────

test('a passed kick-off time does not make a match live', () => {
  const PM = load({});
  // Every fixture here is in the past relative to a far-future clock, and no
  // live authority is present. Nothing may claim to be live.
  const past = [{ id: 'p', date: '2020-01-01', kickoff: '15:00', opponent: 'X', status: 'scheduled' }];
  assert.notStrictEqual(PM._pick(past).state, 'live');
});

test('live is taken from the authority that publishes it', () => {
  const PM = load({ __rlfcLive: { isLive: true, fixtureId: 'c' } });
  const got = PM._pick(FIXTURES);
  assert.strictEqual(got.state, 'live');
  assert.strictEqual(got.fixture.id, 'c', 'and it is that authority’s fixture, not the soonest one');
});

test('the module never compares a kick-off to the clock to decide live', () => {
  const fn = SRC.slice(SRC.indexOf('function liveFixtureId'), SRC.indexOf('function pick'));
  assert.ok(!/Date\.now\(\)/.test(fn),
    'live resolution must not consult the clock at all');
});

// ── 3 · MISSING WORK IS "TO DO", NOT A FAILURE ──────────────────────────────

test('an unstarted programme reads as not started, never as an error', () => {
  const PM = load({});
  const prep = PM._prepFor(FIXTURES[1], null);
  const prog = prep.filter((p) => p.key === 'programme')[0];
  assert.strictEqual(prog.state, 'notstarted');
  assert.match(prog.note, /Not started/i);
});

test('a programme for a DIFFERENT fixture does not count as this one', () => {
  // The saved draft is for Hilltop; the next match is New Bradwell. Counting
  // it would tell staff the programme was ready when no page of it exists.
  const PM = load({});
  const draft = { opponent: 'Hilltop', date: '2026-08-11', managerNotes: 'x', welcomeNotes: 'y', oppSummary: 'z' };
  const prep = PM._prepFor(FIXTURES[1], draft);
  assert.strictEqual(prep.filter((p) => p.key === 'programme')[0].state, 'notstarted');
});

test('a substantially written draft for THIS fixture reads as ready', () => {
  const PM = load({});
  const draft = {
    opponent: 'New Bradwell St Peter', date: '2026-08-15',
    managerNotes: 'a', welcomeNotes: 'b', oppSummary: 'c'
  };
  assert.strictEqual(PM._prepFor(FIXTURES[1], draft).filter((p) => p.key === 'programme')[0].state, 'ready');
});

test('an away fixture is not nagged about a home programme', () => {
  const PM = load({});
  const prep = PM._prepFor(FIXTURES[2], null);
  assert.strictEqual(prep.filter((p) => p.key === 'programme')[0].state, 'na');
});

// ── 4 · IT CONSUMES AUTHORITY, IT DOES NOT BECOME IT ────────────────────────

test('every action opens an existing panel rather than acting directly', () => {
  assert.match(SRC, /function go\(panel\)[\s\S]*openPanel/,
    'actions must route through the portal’s own opener, which the server re-checks');
  assert.ok(!/fetch\([^)]*save-/.test(SRC), 'this file must never write club data');
  assert.ok(!/method:\s*'POST'/i.test(SRC), 'and must never POST anything');
});

test('a failure resolving the fixture cannot take the dashboard down', () => {
  assert.match(SRC, /\.catch\(function \(\) \{ S\.loaded = true; return S; \}\)/,
    'load() must resolve rather than reject');
  assert.match(ADMIN, /try \{ if \(window\.PrepareMatch\) PrepareMatch\.init\(\); \} catch \(e\) \{\}/,
    'and the dashboard hook must be wrapped independently of PortalHome');
});

test('the hub is wired to a real panel and initialiser', () => {
  assert.match(ADMIN, /<div class="panel" id="panel-preparematch">/);
  assert.match(ADMIN, /if \(name === 'preparematch'\)/);
  assert.match(ADMIN, /<div id="pm-next"><\/div>/, 'the dashboard needs a mount point');
});

test('the staff card asks for the confirmed palette only', () => {
  assert.match(SRC, /if \(p && p\.usable\) pal = p;/,
    'an unconfirmed club colour must not reach the portal either');
});
