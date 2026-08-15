// ════════════════════════════════════════════════════════════════════════════
// A MATCH BEING PLAYED IS THE CURRENT MATCH.
//
// 15 AUGUST 2026, 15:37 BST, 37 MINUTES INTO THE FA VASE TIE.
// The homepage's CLUB NOW panel was counting down four days to Burnham, and
// New Bradwell — the game in progress — was listed underneath as
// "LAST · RESULT TO FOLLOW".
//
// The registry had today's fixture carrying fixture_status = 'played' with no
// score at all. currentFrom() required 'scheduled', so it matched nothing.
// previousFrom() required 'played', so it claimed a game in progress.
// nextFrom() then promoted the following fixture. One premature flag upstream
// moved the club's most-read panel onto the wrong match.
//
// THE RULE THESE TESTS HOLD: the current match is decided by TIME AND RESULT,
// which are facts, not by a status column something upstream can set early.
// An unknown score is not the same as no match.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const R = require(path.join(__dirname, '..', 'netlify/functions/lib/football/read.js'));

const KO = '2026-08-15T14:00:00+00:00';          // 15:00 BST
const AT = (iso) => Date.parse(iso);
const MID = AT('2026-08-15T14:37:00Z');           // 35+ minutes in — the screenshot

const NB = (over) => Object.assign({
  id: 'nb', opponent: 'New Bradwell St Peter', kickoffAt: KO,
  status: 'played', us: null, them: null, competitionId: 'fa-vase'
}, over || {});
const BURNHAM = { id: 'bu', opponent: 'Burnham', kickoffAt: '2026-08-19T18:45:00+00:00', status: 'scheduled' };

// ── 1 · THE SCREENSHOT, AS A TEST ───────────────────────────────────────────

test('35 minutes in with no score, today\'s fixture is the current match', () => {
  const list = [NB(), BURNHAM];
  assert.strictEqual(R.currentFrom(list, MID).opponent, 'New Bradwell St Peter');
});

test('and the next fixture is NOT promoted over it', () => {
  const list = [NB(), BURNHAM];
  assert.strictEqual(R.nextFrom(list, MID).opponent, 'Burnham', 'Burnham stays NEXT');
  assert.strictEqual(R.currentFrom(list, MID).opponent, 'New Bradwell St Peter',
    'but the current match is today’s');
});

test('a match in progress is never listed as the previous match', () => {
  assert.strictEqual(R.previousFrom([NB(), BURNHAM], MID), null,
    'THE INCIDENT: a game being played appeared under "LAST · RESULT TO FOLLOW"');
});

test('a premature played flag cannot hide the match in progress', () => {
  // Exactly today's data: status 'played', no score, mid-window.
  const f = NB({ status: 'played' });
  assert.ok(R.inMatchWindow(f, MID), 'time and result decide, not the flag');
});

test('a scheduled flag is equally not required', () => {
  assert.ok(R.inMatchWindow(NB({ status: 'scheduled' }), MID));
});

// ── 2 · IT DOES NOT STAY CURRENT FOREVER ────────────────────────────────────

test('a recorded result ends the match immediately', () => {
  const done = NB({ us: 2, them: 1 });
  assert.ok(!R.inMatchWindow(done, MID), 'a score means it is over');
  assert.strictEqual(R.currentFrom([done, BURNHAM], MID), null);
  assert.strictEqual(R.previousFrom([done, BURNHAM], MID).opponent, 'New Bradwell St Peter');
});

test('an unresolved fixture expires out of the window', () => {
  const late = AT('2026-08-15T17:00:00Z');        // three hours after kick-off
  assert.ok(!R.inMatchWindow(NB(), late), 'it cannot lead the homepage all week');
  assert.strictEqual(R.currentFrom([NB(), BURNHAM], late), null);
});

test('before kick-off there is no current match', () => {
  const before = AT('2026-08-15T13:30:00Z');
  assert.strictEqual(R.currentFrom([NB(), BURNHAM], before), null);
  assert.strictEqual(R.nextFrom([NB({ status: 'scheduled' }), BURNHAM], before).opponent,
    'New Bradwell St Peter', 'today’s game is NEXT until it starts');
});

test('a called-off fixture is never the current match', () => {
  ['postponed', 'cancelled', 'abandoned'].forEach((s) =>
    assert.strictEqual(R.currentFrom([NB({ status: s })], MID), null, s + ' is not in progress'));
});

// ── 3 · PROVIDER AND VISITOR INDEPENDENCE ───────────────────────────────────

test('the current match does not depend on any score provider', () => {
  // No live feed, no manual score, nothing. Still the current match.
  assert.strictEqual(R.currentFrom([NB(), BURNHAM], MID).opponent, 'New Bradwell St Peter');
});

test('a non-provider fixture id is treated identically', () => {
  const internal = NB({ id: 'favase-1q-new-bradwell-20260815' });
  assert.strictEqual(R.currentFrom([internal], MID).id, 'favase-1q-new-bradwell-20260815');
});

test('an FA Vase tie behaves exactly like a league game', () => {
  const league = NB({ id: 'lg', competitionId: 'ccl-prem-north' });
  assert.ok(R.inMatchWindow(league, MID));
  assert.ok(R.inMatchWindow(NB(), MID));
});

test('the visitor\'s timezone cannot change the answer', () => {
  // Every comparison is on absolute instants. Same wall-clock moment expressed
  // three ways must give one result — the club's match is not decided by where
  // the supporter is standing.
  ['2026-08-15T14:37:00Z', '2026-08-15T15:37:00+01:00', '2026-08-15T07:37:00-07:00']
    .forEach((iso) => assert.strictEqual(
      R.currentFrom([NB(), BURNHAM], AT(iso)).opponent, 'New Bradwell St Peter',
      'same instant, same current match: ' + iso));
});

test('nulls are not a nil-nil draw', () => {
  assert.strictEqual(R.hasResult(NB()), false);
  assert.strictEqual(R.hasResult(NB({ us: 0, them: 0 })), true);
});
