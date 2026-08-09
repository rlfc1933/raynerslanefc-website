// ════════════════════════════════════════════════════════════════════════════
// A CALLED-OFF MATCH MUST NOT BE ADVERTISED.
//
// Rayners Lane v Hilltop, Tuesday 11 August, 7.45pm, was postponed — Broadfields'
// FA Cup replay took priority. On the day the club confirmed it, the live
// homepage still read:
//
//     NEXT MATCH · RAYNERS LANE HOME VS HILLTOP
//     02 Days 02 Hrs 47 Min 48 Sec
//     Tue 11 Aug · 7.45pm · Tithe Farm — DIRECTIONS · ADD TO CALENDAR
//
// The postponed STATUS was already modelled, and Match Centre and the JSON-LD
// already honoured it. The hole was narrower and worse: every "what's next"
// selector decided by asking whether a score had been entered.
//
//     upcoming = fixtures.filter(f => !(f.us != null && f.them != null))
//
// A postponed game has no score either. So the status could be recorded
// perfectly and the front page would still count down to it — and the fixtures
// page would file it under RESULTS the next morning, as a match awaiting a
// score it was never going to get.
//
// The rule now lives once, in MatchTime, and these tests keep every surface on
// it. The question they answer is the one the club asked: if nobody touches the
// site again, is there any route by which it still says the match is on?
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const MT = require(path.join(ROOT, 'js/match-time.js'));
const FIXTURES = JSON.parse(read('data/fixtures.json')).fixtures || [];
const HILLTOP = FIXTURES.filter((f) => f.id === 'fwp-578241')[0];

const NOW = Date.parse('2026-08-09T16:00:00Z');   // before the original kick-off

// ── 1 · THE RULE ────────────────────────────────────────────────────────────

test('a called-off fixture is not playable, however empty its score', () => {
  ['postponed', 'cancelled', 'abandoned', 'void'].forEach((s) => {
    const f = { date: '2026-08-11', kickoff: '19:45', status: s, us: null, them: null };
    assert.strictEqual(MT.isPlayable(f), false, s + ' must not count as upcoming');
    assert.strictEqual(MT.isCalledOff(f), true);
  });
});

test('a scheduled fixture with no score is still playable', () => {
  const f = { date: '2026-08-15', kickoff: '15:00', status: 'scheduled', us: null, them: null };
  assert.strictEqual(MT.isPlayable(f), true);
  assert.strictEqual(MT.isCalledOff(f), false);
});

test('a played fixture is not playable either', () => {
  assert.strictEqual(MT.isPlayable(
    { date: '2026-08-01', status: 'played', us: 3, them: 3 }), false);
});

test('the status test is case-insensitive and survives a missing status', () => {
  assert.strictEqual(MT.isCalledOff({ status: 'Postponed' }), true);
  assert.strictEqual(MT.isCalledOff({ status: 'POSTPONED' }), true);
  assert.strictEqual(MT.isCalledOff({}), false, 'no status means scheduled, not called off');
  assert.strictEqual(MT.isPlayable(null), false);
});

// ── 2 · THE FIXTURE ITSELF ──────────────────────────────────────────────────

test('Hilltop on 11 August is recorded as postponed', () => {
  assert.ok(HILLTOP, 'the fixture must NOT be deleted');
  assert.strictEqual(HILLTOP.status, 'postponed');
  assert.strictEqual(HILLTOP.opponent, 'Hilltop');
});

test('the original date and kick-off are retained', () => {
  assert.strictEqual(HILLTOP.date, '2026-08-11', 'the archive and the audit need this');
  assert.strictEqual(HILLTOP.kickoff, '19:45');
  assert.strictEqual(HILLTOP.isHome, true);
});

test('the reason is recorded and the new date is not invented', () => {
  assert.match(HILLTOP.postponedReason, /Broadfields/);
  assert.strictEqual(HILLTOP.rearrangedDate, null, 'TBC must be null, never a guess');
  assert.strictEqual(HILLTOP.statusSource, 'club', 'club-confirmed ahead of the feed');
  assert.ok(HILLTOP.statusUpdatedAt);
});

test('it is not marked cancelled', () => {
  assert.notStrictEqual(HILLTOP.status, 'cancelled', 'the game will be played, on a new date');
});

// ── 3 · NOTHING ADVERTISES IT ───────────────────────────────────────────────

/** The homepage shaper's rule, run against the real fixture list. */
function nextMatch(list, now) {
  const sorted = list.slice().sort((a, b) => MT.fixtureSortKey(a) - MT.fixtureSortKey(b));
  const upcoming = sorted.filter((f) => MT.isPlayable(f));
  const live = upcoming.filter((f) => MT.fixtureSortKey(f) > now - 6 * 3600000);
  return live.filter((f) => f.pinned)[0] || live[0] || upcoming[0] || null;
}

test('THE HEADLINE CASE — the homepage no longer offers Hilltop', () => {
  const next = nextMatch(FIXTURES, NOW);
  assert.ok(next);
  assert.notStrictEqual(next.id, 'fwp-578241');
  assert.notStrictEqual(next.date, '2026-08-11');
  assert.strictEqual(next.opponent, 'New Bradwell St Peter', 'the next game actually being played');
});

test('the old rule would still have advertised it — proving the fix', () => {
  const sorted = FIXTURES.slice().sort((a, b) => MT.fixtureSortKey(a) - MT.fixtureSortKey(b));
  const oldUpcoming = sorted.filter((f) => !(f.us != null && f.them != null));
  const oldLive = oldUpcoming.filter((f) => MT.fixtureSortKey(f) > NOW - 6 * 3600000);
  assert.strictEqual((oldLive[0] || {}).opponent, 'Hilltop',
    'the "has no score" rule picked the postponed game');
});

test('both next-match selectors use the shared rule, not a score check', () => {
  ['js/main.js', 'js/club-now.js'].forEach((f) => {
    const s = read(f);
    assert.match(s, /MatchTime\.isPlayable\(f\)/, f + ' must use the shared rule');
    assert.ok(!/filter\(function \(f\) \{ return !\(f\.us != null && f\.them != null\); \}\)/.test(s),
      f + ' still classifies by score alone');
  });
});

test('the fixtures page keeps it out of upcoming AND out of results', () => {
  const s = read('fixtures.html');
  assert.match(s, /var calledOff = sorted\.filter\(function \(f\) \{ return MatchTime\.isCalledOff\(f\); \}\)/);
  assert.match(s, /var live      = sorted\.filter\(function \(f\) \{ return !MatchTime\.isCalledOff\(f\); \}\)/);
  ['played', 'awaiting', 'upcoming'].forEach((b) =>
    assert.ok(new RegExp('var ' + b + '\\s+= live\\.filter').test(s),
      b + ' must be derived from the live list, not the whole list'));
});

// ── 4 · IT IS STILL SHOWN, NOT HIDDEN ───────────────────────────────────────

test('the public list displays it, with the reason and the TBC', () => {
  const s = read('fixtures.html');
  assert.match(s, /POSTPONED<\/span>/);
  assert.match(s, /f\.postponedReason/);
  assert.match(s, /A rearranged date will be announced once confirmed/);
  assert.match(s, /Was ' \+ fxEsc\(fxDate\(f\)/, 'the original date is shown');
});

test('a rearranged date is displayed once it exists', () => {
  const s = read('fixtures.html');
  assert.match(s, /f\.rearrangedDate\s*\n?\s*\? 'Rearranged for '/);
});

// ── 5 · IT CAN NEVER GO LIVE ────────────────────────────────────────────────

test('Match Centre refuses to put a postponed fixture in play', () => {
  const s = read('js/match-centre.js');
  const t = s.match(/function temporal\(f\) \{[\s\S]*?\n  \}/)[0];
  const off = t.indexOf("f.status === 'postponed'");
  const live = t.indexOf('f.isLive');
  assert.ok(off > -1 && off < live, 'the called-off check must come before any live check');
});

test('the shared temporal state refuses a countdown for a called-off match', () => {
  ['postponed', 'cancelled', 'abandoned'].forEach((p) => {
    const st = MT.temporalState({ date: '2026-08-11', kickoff: '19:45' }, { period: p }, NOW);
    assert.strictEqual(st.state, p);
    assert.strictEqual(st.showCountdown, false, p + ' must not run a countdown');
  });
});

test('a live feed cannot resurrect it into play', () => {
  // Even if something reported "first half" for a postponed fixture, the page
  // decides from the FIXTURE status first.
  const s = read('js/match-centre.js');
  assert.match(s, /if \(f\.status === 'postponed' \|\| f\.status === 'cancelled' \|\| f\.status === 'abandoned'\)/);
});

// ── 6 · THE PROGRAMME DOES NOT WAKE UP FOR IT ───────────────────────────────

test('programme next-match logic skips it', () => {
  const print = read('programme-print.html');
  assert.match(print, /postpon\|cancel\|abandon\|void\|off/,
    'the programme already passes over a called-off fixture');
});

test('the publish freeze uses the same validity rule', () => {
  const admin = read('admin.html');
  const pub = admin.match(/async function publishProgramme\(\)[\s\S]*?\n\}/)[0];
  assert.match(pub, /postpon\|cancel\|abandon\|void\|off/);
});

// ── 7 · STRUCTURED DATA ─────────────────────────────────────────────────────

test('search engines are told the event is postponed', () => {
  const s = read('fixtures.html');
  assert.match(s, /postponed: 'EventPostponed'/);
  assert.match(s, /eventStatus: 'https:\/\/schema\.org\/' \+ \(ST\[f\.status\] \|\| 'EventScheduled'\)/);
});

// ── 8 · A SYNC CANNOT SILENTLY UNDO IT ──────────────────────────────────────

test('the club-confirmed status records where it came from', () => {
  // `statusSource: 'club'` is the marker that says a human at the club knows
  // something the upstream feed has not caught up with yet.
  assert.strictEqual(HILLTOP.statusSource, 'club');
});

// ── 8b · THE FRESHNESS RACE ─────────────────────────────────────────────────
// js/components.js intercepts every data/*.json fetch, races jsDelivr@main
// against the deployed file, and keeps whichever has the newer `updatedAt`.
// A fixture edited without touching `updatedAt` TIES — and a tie goes to the
// CDN, so the browser keeps the stale copy and the correction is invisible to
// every visitor while curl shows it applied perfectly. That is precisely how a
// postponement could be recorded, deployed and still advertised.

test('the file wins the freshness race against the CDN', () => {
  const doc = JSON.parse(read('data/fixtures.json'));
  assert.ok(doc.updatedAt, 'without this the deployed file can never win');
  const changed = (doc.fixtures || [])
    .filter((f) => f.statusUpdatedAt)
    .map((f) => Date.parse(f.statusUpdatedAt));
  changed.forEach((t) => assert.ok(Date.parse(doc.updatedAt) >= t,
    'a status change must bump the document updatedAt, or the CDN copy wins'));
});

test('the interceptor keeps the newer copy, and falls back safely', () => {
  const s = read('js/components.js');
  assert.match(s, /ts\(dep\) > ts\(cdn\) \? dep : cdn/, 'newer wins');
  assert.match(s, /return _fetch\(url, opts\)/, 'and a total failure falls back to the plain fetch');
});

test('the automatic fixture sync is permission-gated', () => {
  const s = read('netlify/functions/fwp-sync.js');
  assert.match(s, /FWP_SYNC_ENABLED/,
    'nothing writes fixtures automatically without that flag being set');
});

test('fixture import is a staff preview-and-confirm, not a silent job', () => {
  const s = read('netlify/functions/import-fixtures.js');
  assert.match(s, /merge-safe/);
  const toml = read('netlify.toml');
  assert.ok(!/import-fixtures[\s\S]{0,200}schedule/.test(toml),
    'the importer must not be on a schedule');
});

// ── 9 · IT COMES BACK CLEANLY ───────────────────────────────────────────────

test('setting a rearranged date and status returns it to the fixture list', () => {
  const back = Object.assign({}, HILLTOP, {
    status: 'scheduled', date: '2026-08-26', rearrangedDate: null,
  });
  assert.strictEqual(MT.isPlayable(back), true);
  const list = FIXTURES.filter((f) => f.id !== 'fwp-578241').concat([back]);
  const next = nextMatch(list, Date.parse('2026-08-24T12:00:00Z'));
  assert.strictEqual(next.opponent, 'Hilltop', 'it becomes the next match again');
});

test('nothing about the mechanism is specific to one club', () => {
  // Comments may describe the incident that produced the rule — that is how the
  // next reader understands it. The CODE may not name a club, because the next
  // postponement will be a different one.
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  ['js/match-time.js', 'js/main.js', 'js/club-now.js'].forEach((f) => {
    assert.ok(!/hilltop/i.test(strip(read(f))), f + ' must not name a club in code');
  });
  // fixtures.html legitimately lists all twenty clubs as a league-table
  // fallback, so check the postponement block itself rather than the file.
  const fx = read('fixtures.html');
  const block = fx.slice(fx.indexOf('if (calledOff.length)'), fx.indexOf("var done = played.concat"));
  assert.ok(!/hilltop|broadfields/i.test(block), 'the called-off renderer must name no club');
  // And the fixture data carries no bespoke field naming the opponent either.
  assert.ok(!Object.keys(HILLTOP).some((k) => /hilltop/i.test(k)));
});
