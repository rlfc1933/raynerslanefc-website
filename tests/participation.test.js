// GATE 7 — appearances, goals and minutes.
//
// These numbers become the club's permanent record of its players. Every test
// here is a way that record could quietly become wrong.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const P = require('../netlify/functions/lib/football/participation');
const F = require('../netlify/functions/lib/fwp');
const I = require('../netlify/functions/lib/football/match-ingest');

const starter = (name, o) => Object.assign({ name, role: 'starter' }, o || {});
const sub = (name, o) => Object.assign({ name, role: 'substitute' }, o || {});
const unused = (name) => ({ name, role: 'unused' });

test('an UNUSED substitute has not played', () => {
  const r = P.forPlayer(unused('Bench Warmer'), [], {});
  assert.strictEqual(r.appearance, false);
  assert.strictEqual(r.unusedSubstitute, true);
  assert.strictEqual(r.started, false);
  assert.strictEqual(r.minutesPlayed, 0);
});

test('a named substitute who came on HAS played', () => {
  const r = P.forPlayer(sub('Came On', { enteredMinute: 60 }), [], {});
  assert.strictEqual(r.appearance, true);
  assert.strictEqual(r.substitute, true);
  assert.strictEqual(r.started, false);
  assert.strictEqual(r.minutesPlayed, 30);
});

test('a starter who was substituted still STARTED', () => {
  const r = P.forPlayer(starter('Withdrawn', { exitedMinute: 70 }), [], {});
  assert.strictEqual(r.started, true);
  assert.strictEqual(r.appearance, true);
  assert.strictEqual(r.substitute, false);
  assert.strictEqual(r.minutesPlayed, 70);
});

test('a starter who was SENT OFF still started, and stops at the dismissal', () => {
  const events = [{ player: 'Beau Pryce', type: 'red_card', minute: 30 }];
  const r = P.forPlayer(starter('Beau Pryce'), events, {});
  assert.strictEqual(r.started, true);
  assert.strictEqual(r.redCards, 1);
  assert.strictEqual(r.dismissedMinute, 30);
  assert.strictEqual(r.minutesPlayed, 30);
});

test('AN OWN GOAL IS NEVER A GOAL FOR THE SCORER', () => {
  // The whole reason this rule is written down: Harry Bonner put through his
  // own net. It counts on Rayners Lane's scoreline. It is not a goal for him.
  const events = [{ player: 'Harry Bonner', type: 'own_goal', minute: 13, ownGoal: true }];
  const r = P.forPlayer(starter('Harry Bonner'), events, {});
  assert.strictEqual(r.goals, 0, 'an own goal must not appear in his goal count');
  assert.strictEqual(r.ownGoals, 1, 'it is recorded separately');
});

test('two yellows are a dismissal, counted once', () => {
  const events = [
    { player: 'X', type: 'yellow_card', minute: 20 },
    { player: 'X', type: 'yellow_card', minute: 65 },
  ];
  const r = P.forPlayer(starter('X'), events, {});
  assert.strictEqual(r.yellowCards, 2);
  assert.strictEqual(r.redCards, 1, 'a second yellow is a red');
  assert.strictEqual(r.secondYellow, true);
});

test('a straight red is not double-counted with a booking', () => {
  const events = [
    { player: 'X', type: 'yellow_card', minute: 20 },
    { player: 'X', type: 'red_card', minute: 40 },
  ];
  const r = P.forPlayer(starter('X'), events, {});
  assert.strictEqual(r.redCards, 1);
});

test('a captain suffix does not split one player into two', () => {
  const events = [{ player: 'Keiran Barnard-White', type: 'goal', minute: 41 }];
  const r = P.forPlayer(starter('Keiran Barnard-White (C)', { isCaptain: true }), events, {});
  assert.strictEqual(r.goals, 1, 'the (C) suffix must not hide his goal');
  assert.strictEqual(r.isCaptain, true);
});

// ── minutes: honest or withheld ─────────────────────────────────────────────
test('a full match is ninety minutes', () => {
  const r = P.forPlayer(starter('Ever Present'), [], {});
  assert.strictEqual(r.minutesPlayed, 90);
  assert.strictEqual(r.minutesConfidence, P.CONF.PARTIAL, 'full time was assumed, not stated');
});

test('both ends known gives high confidence', () => {
  const r = P.forPlayer(sub('On and Off', { enteredMinute: 55, exitedMinute: 80 }), [], {});
  assert.strictEqual(r.minutesPlayed, 25);
  assert.strictEqual(r.minutesConfidence, P.CONF.HIGH);
});

test('a substitution with NO minute yields no figure at all', () => {
  // Better to show nothing than to invent a number that looks authoritative.
  const r = P.forPlayer(sub('Unknown Entry', {}), [], {});
  assert.strictEqual(r.appearance, false, 'no entry minute and not a starter — did not play');
  const forced = P.forPlayer({ name: 'X', role: 'substitute', enteredMinute: null }, [], {});
  assert.strictEqual(forced.minutesPlayed, 0);
});

test('an abandoned match yields no minutes', () => {
  const r = P.forPlayer(starter('X'), [], { abandoned: true });
  assert.strictEqual(r.minutesPlayed, null);
  assert.strictEqual(r.minutesConfidence, P.CONF.NONE);
});

test('stoppage time does not inflate the clock', () => {
  // 45+3 is the 45th minute, not the 48th.
  const events = [{ player: 'X', type: 'red_card', minute: 45, stoppage: 3 }];
  const r = P.forPlayer(starter('X'), events, {});
  assert.strictEqual(r.dismissedMinute, 45);
  assert.strictEqual(r.minutesPlayed, 45);
});

// ── the real match ──────────────────────────────────────────────────────────
test('the real Wallingford match produces defensible records', () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'fwp', 'match-fulltime.html'), 'utf8');
  const parsed = F.parseMatch(html);
  const lineups = {
    home: { players: I.lineupRows(parsed, 'home', 1, {}).rows.map(shape) },
    away: { players: I.lineupRows(parsed, 'away', 2, {}).rows.map(shape) },
  };
  function shape(r) {
    return { name: r.provider_player_name, role: r.lineup_role,
      enteredMinute: r.entered_minute, exitedMinute: r.exited_minute, isCaptain: r.is_captain };
  }
  const events = parsed.events.map((e) => ({
    player: e.player, type: e.ownGoal && e.type === 'goal' ? 'own_goal' : e.type,
    minute: e.minute, stoppage: e.stoppage, ownGoal: e.ownGoal,
  }));
  const recs = P.forFixture(lineups, events, { fullTimeMinute: 90 });

  // Eleven starters each, and the unused substitute is not an appearance.
  const home = recs.filter((r) => r.side === 'home');
  assert.strictEqual(home.filter((r) => r.started).length, 11);
  assert.strictEqual(recs.filter((r) => r.unusedSubstitute && r.appearance).length, 0,
    'an unused substitute can never also be an appearance');

  // Bonner: an own goal, no goals, and he is on the AWAY side.
  const bonner = recs.filter((r) => /Bonner/.test(r.name))[0];
  assert.strictEqual(bonner.side, 'away');
  assert.strictEqual(bonner.goals, 0);
  assert.strictEqual(bonner.ownGoals, 1);

  // Pryce: started, sent off on 30.
  const pryce = recs.filter((r) => /Pryce/.test(r.name))[0];
  assert.strictEqual(pryce.started, true);
  assert.strictEqual(pryce.redCards, 1);
  assert.strictEqual(pryce.minutesPlayed, 30);

  // Every appearance is either a start or a used substitute — never neither.
  recs.filter((r) => r.appearance).forEach((r) => {
    assert.ok(r.started || r.substitute, r.name + ' appeared as neither');
  });
});

// ── aggregation ─────────────────────────────────────────────────────────────
const rec = (o) => Object.assign({
  name: 'A Player', fixtureId: 'f1', season: '2026-27', competitionType: 'league', teamId: 1,
  appearance: true, started: true, substitute: false, unusedSubstitute: false,
  goals: 0, ownGoals: 0, yellowCards: 0, redCards: 0,
  minutesPlayed: 90, minutesConfidence: P.CONF.HIGH,
}, o || {});

test('season totals add up and are recomputed, never incremented', () => {
  const rows = [
    rec({ fixtureId: 'f1', goals: 2 }),
    rec({ fixtureId: 'f2', goals: 1, started: false, substitute: true, minutesPlayed: 20 }),
    rec({ fixtureId: 'f3', appearance: false, started: false, unusedSubstitute: true, minutesPlayed: 0 }),
  ];
  const [a] = P.aggregate(rows, {});
  assert.strictEqual(a.appearances, 2, 'the unused listing is not an appearance');
  assert.strictEqual(a.starts, 1);
  assert.strictEqual(a.substituteAppearances, 1);
  assert.strictEqual(a.unusedSubstitute, 1);
  assert.strictEqual(a.goals, 3);
  assert.strictEqual(a.minutesPlayed, 110);

  // Running it twice gives the same answer — the property a counter loses.
  assert.deepStrictEqual(P.aggregate(rows, {}), P.aggregate(rows, {}));
});

test('one uncertain match withholds the season minutes total', () => {
  const rows = [rec({ fixtureId: 'f1' }), rec({ fixtureId: 'f2', minutesPlayed: null, minutesConfidence: P.CONF.NONE })];
  const [a] = P.aggregate(rows, {});
  assert.strictEqual(a.minutesPlayed, null, 'a total built on a gap is not a total');
  assert.strictEqual(a.appearances, 2, 'appearances are still known');
});

test('seasons, competitions and teams never bleed into each other', () => {
  const rows = [
    rec({ fixtureId: 'a', season: '2026-27' }),
    rec({ fixtureId: 'b', season: '2025-26' }),
    rec({ fixtureId: 'c', competitionType: 'fa_competition' }),
    rec({ fixtureId: 'd', competitionType: 'friendly' }),
    rec({ fixtureId: 'e', teamId: 2 }),
  ];
  assert.strictEqual(P.aggregate(rows, { season: '2026-27' })[0].appearances, 4);
  assert.strictEqual(P.aggregate(rows, { season: '2026-27', competitionType: 'league' })[0].appearances, 2);
  assert.strictEqual(P.aggregate(rows, { teamId: 1 })[0].appearances, 4);
  assert.strictEqual(P.aggregate(rows, { excludeFriendlies: true })[0].appearances, 4);
});

test('a corrected event changes the total on the next recompute', () => {
  const before = P.aggregate([rec({ goals: 2 })], {})[0];
  const after = P.aggregate([rec({ goals: 1 })], {})[0];   // scorer corrected
  assert.strictEqual(before.goals, 2);
  assert.strictEqual(after.goals, 1, 'recomputation follows the correction');
});
