// ════════════════════════════════════════════════════════════════════════════
// NEXT MATCH FOLLOWS THE CALENDAR. Home or away is just the state of it.
//
// The old code took every fixture without a score, filtered to HOME games,
// sorted, and printed the first one as "Next at The Lane". Three faults:
//
//   IT NEVER EXCLUDED THE EDITION'S OWN FIXTURE. Against the club's real
//   fixture list, the Hilltop programme advertised Hilltop as the next game —
//   at the ground the reader was stood in.
//
//   THERE WAS NO "NEXT MATCH" AT ALL, only next HOME match, so an away trip was
//   skipped in favour of the next prettier home page.
//
//   "NO SCORE YET" WAS TREATED AS "STILL TO BE PLAYED", so a postponed fixture
//   would be promoted as upcoming.
//
// The cases below use the club's REAL fixture list, because invented fixtures
// would have let the original bug through — it only shows up when the edition's
// own match is the earliest unplayed home game, which is the normal case.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const print = read('programme-print.html');
const REAL = JSON.parse(read('data/fixtures.json')).fixtures || [];

/** The renderer's own selection logic, lifted out and run for real. */
function selector() {
  const from = print.indexOf('function fxKey(f){');
  const to = print.indexOf('/* Frozen for a published edition');
  const src = print.slice(from, to);
  return new Function(src + '; return { fxKey, fxIsHome, upcomingAfter };')();
}
const S = selector();

/** What the page would show for an edition on this date. */
function pick(fixtures, editionDate, doc) {
  const d = doc || {};
  const up = S.upcomingAfter(fixtures, editionDate);
  return {
    nextMatch: d.published ? (d.nextFixture || null) : (up[0] || null),
    nextHome: d.published ? (d.nextHomeFixture || null) : (up.filter(S.fxIsHome)[0] || null),
  };
}

// ── 1 · THE BUG THAT STARTED IT ─────────────────────────────────────────────

test("an edition never advertises its own fixture as the next one", () => {
  // 11 Aug is the club's real home fixture against Hilltop.
  const r = pick(REAL, '2026-08-11');
  assert.ok(r.nextMatch, 'there is a next fixture');
  assert.notStrictEqual(r.nextMatch.date, '2026-08-11');
  assert.notStrictEqual(r.nextMatch.opponent, 'Hilltop');
  assert.ok(r.nextHome.date > '2026-08-11');
});

test('the old rule would have picked the edition itself — proving the fix', () => {
  const old = REAL.slice()
    .filter((f) => (f.us == null || f.them == null) && f.isHome !== false)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  assert.strictEqual(old.opponent, 'Hilltop',
    'the old logic selected the 11 Aug home fixture — the programme’s own match');
});

// ── 2 · THE FIVE CASES, AGAINST REAL FIXTURES ───────────────────────────────

test('CASE 1 — next match is AWAY, and is shown as the next match', () => {
  // Edition: 15 Aug, home v New Bradwell. Next up: 19 Aug away at Burnham.
  const r = pick(REAL, '2026-08-15');
  assert.strictEqual(r.nextMatch.opponent, 'Burnham');
  assert.strictEqual(r.nextMatch.isHome, false, 'it is away');
  assert.strictEqual(S.fxIsHome(r.nextMatch), false);
});

test('CASE 2 — next match is HOME, and is shown as the next match', () => {
  // Edition: 11 Aug v Hilltop. Next up: 15 Aug home v New Bradwell.
  const r = pick(REAL, '2026-08-11');
  assert.strictEqual(r.nextMatch.opponent, 'New Bradwell St Peter');
  assert.strictEqual(S.fxIsHome(r.nextMatch), true);
});

test('CASE 3 — away next match, and a DIFFERENT next home fixture', () => {
  const r = pick(REAL, '2026-08-15');
  assert.strictEqual(r.nextMatch.opponent, 'Burnham');          // 19 Aug, away
  assert.strictEqual(r.nextHome.opponent, 'Ardley United');     // 29 Aug, home
  assert.notStrictEqual(r.nextHome.id, r.nextMatch.id);
  // The away trip on 19 Aug and the away game on 22 Aug are both skipped by
  // "next at The Lane" — but neither may be skipped by "next match".
  assert.ok(r.nextMatch.date < r.nextHome.date);
});

test('CASE 4 — a postponed fixture is passed over', () => {
  const fx = REAL.map((f) =>
    f.date === '2026-08-19' ? Object.assign({}, f, { status: 'Postponed' }) : f);
  const r = pick(fx, '2026-08-15');
  assert.notStrictEqual(r.nextMatch.opponent, 'Burnham');
  assert.strictEqual(r.nextMatch.opponent, 'Harefield United', 'the next VALID fixture');
  ['cancelled', 'Abandoned', 'called off', 'VOID'].forEach((st) => {
    const f2 = REAL.map((f) => (f.date === '2026-08-19' ? Object.assign({}, f, { status: st }) : f));
    assert.notStrictEqual(pick(f2, '2026-08-15').nextMatch.opponent, 'Burnham', st + ' must be skipped');
  });
});

test('CASE 5 — a published edition keeps what was printed', () => {
  const frozen = {
    published: true,
    nextFixture: { id: 'x', opponent: 'Burnham', isHome: false, date: '2026-08-19', kickoff: '19:45' },
    nextHomeFixture: { id: 'y', opponent: 'Ardley United', isHome: true, date: '2026-08-29' },
  };
  // The live list changes completely afterwards.
  const changed = [{ id: 'z', date: '2026-12-01', opponent: 'Somebody Else', isHome: true, us: null, them: null, status: 'scheduled' }];
  const r = pick(changed, '2026-08-15', frozen);
  assert.strictEqual(r.nextMatch.opponent, 'Burnham', 'the archive does not follow the fixture list');
  assert.strictEqual(r.nextHome.opponent, 'Ardley United');
});

test('a played fixture is never promoted as upcoming', () => {
  const up = S.upcomingAfter(REAL, '2026-07-01');
  assert.ok(up.every((f) => f.us == null || f.them == null));
  assert.ok(up.length > 0);
});

test('fixtures are ordered by date AND kick-off', () => {
  const up = S.upcomingAfter(REAL, '2026-07-01');
  for (let i = 1; i < up.length; i++) {
    assert.ok(S.fxKey(up[i - 1]) <= S.fxKey(up[i]), 'out of order at ' + i);
  }
});

test('home and away come from the canonical field, not a display string', () => {
  const src = print.slice(print.indexOf('function fxIsHome'), print.indexOf('function upcomingAfter'));
  assert.match(src, /f\.isHome !== false/);
  assert.ok(!/venue|opponent|indexOf|match\(/.test(src),
    'nothing may be inferred from text');
});

// ── 3 · WHAT THE PAGE ACTUALLY PRINTS ───────────────────────────────────────

test('the page is headed Next Match, not Next at The Lane', () => {
  assert.match(print, /banner\(away \? 'On The Road' : 'Don’t Miss It', 'Next Match'\)/);
});

test('away is never dressed up as a home game', () => {
  assert.match(print, /var away = !fxIsHome\(nextMatch\)/);
  assert.match(print, /away \? '@' : 'v'/);
  assert.match(print, /'Away' : 'Home'/);
  // The home venue must not be substituted onto an away fixture.
  assert.match(print, /var nmVenue = away \? \(nextMatch\.venue \|\| ''\) : \(nextMatch\.venue \|\| venue\)/);
  assert.match(print, /Venue to be confirmed/);
});

test('the away treatment stays a Rayners Lane page', () => {
  const css = print.match(/\.nx-away \.nx\{[^}]*\}/)[0];
  assert.match(css, /var\(--y\)/, 'the club yellow still leads');
  assert.ok(!/opponent|opp-/.test(css), 'no opposition colours are adopted');
});

test('next at The Lane only appears when it is a different fixture', () => {
  assert.match(print, /nextHome && nextHome\.id !== nextMatch\.id/);
});

test('one connector convention throughout', () => {
  assert.strictEqual((print.match(/'vs '/g) || []).length, 0, "'vs' was mixed with 'v' and '@'");
  const conns = print.match(/isHome===false\?'@ ':'v '/g) || [];
  assert.ok(conns.length >= 2, 'results and fixtures both use v / @');
});

// ── 4 · THE FREEZE IS WRITTEN ───────────────────────────────────────────────

test('publishing records what the next fixture was', () => {
  const admin = read('admin.html');
  const pub = admin.match(/async function publishProgramme\(\)[\s\S]*?\n\}/)[0];
  assert.match(pub, /doc\.nextFixture = up\[0\] \|\| null;/);
  assert.match(pub, /doc\.nextHomeFixture = up\.filter\(function \(f\) \{ return f\.isHome !== false; \}\)\[0\] \|\| null;/);
  assert.match(pub, /postpon\|cancel\|abandon\|void\|off/, 'the freeze uses the same validity rule');
  assert.match(pub, /dd > cutD/, 'and the same after-this-edition rule');
});

// ── 5 · THE KIT CORRECTION ──────────────────────────────────────────────────

test('the home kit is yellow, yellow, yellow', () => {
  const cfg = JSON.parse(read('data/config.json'));
  assert.strictEqual(cfg.kit.home.shirt.name, 'Yellow');
  assert.strictEqual(cfg.kit.home.shorts.name, 'Yellow', 'green shorts were wrong');
  assert.strictEqual(cfg.kit.home.socks.name, 'Yellow');
});

test('the goalkeeper colours are not invented', () => {
  const cfg = JSON.parse(read('data/config.json'));
  assert.strictEqual(cfg.kit.home.goalkeeper, null,
    'unconfirmed must stay empty — an invented colour reaches print unchallenged');
  assert.match(print, /To be confirmed<\/em>/);
});

test('nothing else in the repo carries the old green-shorts value', () => {
  ['data/config.json', 'programme-print.html', 'admin.html'].forEach((f) => {
    const s = read(f);
    assert.ok(!/"shorts":\s*\{\s*"name":\s*"Green"/.test(s), f + ' still has green shorts');
  });
});
