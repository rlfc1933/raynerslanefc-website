// GATE 4 — the shared read layer.
//
// These are the selectors every public surface will use, so a mistake here is a
// mistake everywhere at once. The scenarios are the ones that have actually
// gone wrong on this site.

const test = require('node:test');
const assert = require('node:assert');
const READ = require('../netlify/functions/lib/football/read');

const AUG1 = Date.parse('2026-08-01T14:00:00Z');   // 15:00 BST
const AUG4 = Date.parse('2026-08-04T18:45:00Z');   // 19:45 BST
const AUG8 = Date.parse('2026-08-08T14:00:00Z');
const AUG11 = Date.parse('2026-08-11T18:45:00Z');

const season = () => ([
  { id: 'fwp-578225', kickoffAt: new Date(AUG1).toISOString(), opponent: 'Wallingford & Crowmarsh',
    isHome: true, status: 'played', competition: 'Combined Counties Prem N', competitionType: 'league',
    programmeEligible: true },
  { id: 'fwp-578227', kickoffAt: new Date(AUG4).toISOString(), opponent: 'Broadfields United',
    isHome: false, status: 'scheduled', competition: 'Combined Counties Prem N', competitionType: 'league',
    programmeEligible: false },
  { id: 'facup-x', kickoffAt: new Date(AUG8).toISOString(), opponent: 'London Lions',
    isHome: false, status: 'scheduled', competition: 'FA Cup EP', competitionType: 'fa_competition',
    programmeEligible: false },
  { id: 'fwp-578241', kickoffAt: new Date(AUG11).toISOString(), opponent: 'Hilltop',
    isHome: true, status: 'scheduled', competition: 'Combined Counties Prem N', competitionType: 'league',
    programmeEligible: true },
]);

test('the next fixture is never the match just played', () => {
  // The exact defect that shipped: a played fixture with no score in the legacy
  // file was handed back as "next up", so the hero counted down to a game that
  // had finished an hour earlier.
  const next = READ.nextFrom(season(), AUG1 + 2 * 3600000);   // two hours after kick-off
  assert.strictEqual(next.id, 'fwp-578227');
  assert.notStrictEqual(next.id, 'fwp-578225');
});

test('a match in progress is "current", not "next"', () => {
  // These were one function with a grace window, which meant the game being
  // played was still offered as the next match.
  const now = AUG4 + 30 * 60000;   // 30 minutes into the Broadfields game
  assert.strictEqual(READ.currentFrom(season(), now).id, 'fwp-578227', 'it is the current match');
  assert.strictEqual(READ.nextFrom(season(), now).id, 'facup-x', 'the NEXT one is the following fixture');
});

test('nothing is "current" outside a match', () => {
  assert.strictEqual(READ.currentFrom(season(), AUG4 - 60000), null, 'not yet kicked off');
  assert.strictEqual(READ.currentFrom(season(), AUG4 + 200 * 60000), null, 'long finished');
});

test('the handover from "next" to "current" has no gap and no overlap', () => {
  // One second before kick-off it is the next match; at kick-off it becomes the
  // current one. Exactly one of the two answers it at any instant — a gap would
  // blank the hero, an overlap would show a countdown beside a live score.
  const before = AUG4 - 1000, at = AUG4, during = AUG4 + 60000;

  assert.strictEqual(READ.nextFrom(season(), before).id, 'fwp-578227');
  assert.strictEqual(READ.currentFrom(season(), before), null);

  assert.strictEqual(READ.currentFrom(season(), at).id, 'fwp-578227', 'at kick-off it is current');
  assert.notStrictEqual(READ.nextFrom(season(), at).id, 'fwp-578227', 'and no longer next');

  assert.strictEqual(READ.currentFrom(season(), during).id, 'fwp-578227');
  assert.strictEqual(READ.nextFrom(season(), during).id, 'facup-x');
});

test('previous is the most recent COMPLETED fixture', () => {
  const prev = READ.previousFrom(season(), AUG11);
  assert.strictEqual(prev.id, 'fwp-578225');
  // A scheduled fixture in the past is not a result.
  const list = season().map((f) => (f.id === 'fwp-578227' ? Object.assign({}, f, { status: 'scheduled' }) : f));
  assert.strictEqual(READ.previousFrom(list, AUG11).id, 'fwp-578225');
});

test('there is no previous result before the first match', () => {
  assert.strictEqual(READ.previousFrom(season(), AUG1 - 86400000), null);
});

test('the next programme is the next eligible HOME fixture', () => {
  // Skips the away league game AND the away cup tie.
  const p = READ.nextProgrammeFrom(season(), AUG1 + 3 * 3600000);
  assert.strictEqual(p.id, 'fwp-578241');
  assert.strictEqual(p.opponent, 'Hilltop');
  assert.strictEqual(p.isHome, true);
});

test('postponed and cancelled fixtures are never selected as next', () => {
  for (const bad of ['postponed', 'cancelled', 'abandoned']) {
    const list = season().map((f) => (f.id === 'fwp-578227' ? Object.assign({}, f, { status: bad }) : f));
    const next = READ.nextFrom(list, AUG1 + 3 * 3600000);
    assert.strictEqual(next.id, 'facup-x', bad + ' must be skipped');
  }
});

test('form is read from OUR orientation, not the home column', () => {
  // A 0-3 away win is a win. Reading the home score as ours inverts half a season.
  const results = [
    { id: 'a', kickoffAt: new Date(AUG1).toISOString(), opponent: 'X', isHome: true,  us: 3, them: 3, competition: 'L', competitionType: 'league' },
    { id: 'b', kickoffAt: new Date(AUG4).toISOString(), opponent: 'Y', isHome: false, us: 3, them: 0, competition: 'L', competitionType: 'league' },
    { id: 'c', kickoffAt: new Date(AUG8).toISOString(), opponent: 'Z', isHome: false, us: 0, them: 2, competition: 'C', competitionType: 'fa_competition' },
  ];
  const form = READ.formFrom(results, { limit: 5 });
  assert.deepStrictEqual(form.map((f) => f.outcome), ['L', 'W', 'D'], 'most recent first');
  assert.strictEqual(form[1].us, 3, 'the away win stays a win');
});

test('league-only form excludes cup ties', () => {
  const results = [
    { id: 'a', kickoffAt: new Date(AUG1).toISOString(), opponent: 'X', isHome: true, us: 1, them: 0, competitionType: 'league' },
    { id: 'c', kickoffAt: new Date(AUG8).toISOString(), opponent: 'Z', isHome: false, us: 0, them: 2, competitionType: 'fa_competition' },
  ];
  assert.strictEqual(READ.formFrom(results, { leagueOnly: true }).length, 1);
  assert.strictEqual(READ.formFrom(results, {}).length, 2);
});

test('a fixture with no score never enters form', () => {
  const results = [
    { id: 'a', kickoffAt: new Date(AUG1).toISOString(), opponent: 'X', isHome: true, us: null, them: null, competitionType: 'league' },
    { id: 'b', kickoffAt: new Date(AUG4).toISOString(), opponent: 'Y', isHome: true, us: 2, them: 1, competitionType: 'league' },
  ];
  const f = READ.formFrom(results, {});
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].id, 'b');
});

test('a nil-nil draw is a draw, not a missing score', () => {
  const f = READ.formFrom([{ id: 'a', kickoffAt: new Date(AUG1).toISOString(), opponent: 'X', isHome: true, us: 0, them: 0, competitionType: 'league' }], {});
  assert.strictEqual(f.length, 1, '0-0 must not be filtered out as absent');
  assert.strictEqual(f[0].outcome, 'D');
});

test('two fixtures on the same day both stay selectable', () => {
  const list = season().concat([{
    id: 'second-team', kickoffAt: new Date(AUG4).toISOString(), opponent: 'Other',
    isHome: true, status: 'scheduled', competition: 'L', competitionType: 'league', programmeEligible: true,
  }]);
  const next = READ.nextFrom(list, AUG1 + 3 * 3600000);
  assert.ok(next, 'one of them leads');
  assert.strictEqual(Date.parse(next.kickoffAt), AUG4);
  // Both are present in the season — nothing is discarded.
  assert.strictEqual(list.filter((f) => Date.parse(f.kickoffAt) === AUG4).length, 2);
});

test('an empty season yields nulls rather than throwing', () => {
  assert.strictEqual(READ.nextFrom([], Date.now()), null);
  assert.strictEqual(READ.previousFrom([], Date.now()), null);
  assert.strictEqual(READ.nextProgrammeFrom([], Date.now()), null);
  assert.deepStrictEqual(READ.formFrom([], {}), []);
});

test('a fixture with no kick-off instant is never chosen', () => {
  const list = [{ id: 'x', kickoffAt: null, status: 'scheduled', programmeEligible: true }];
  assert.strictEqual(READ.nextFrom(list, Date.now()), null, 'no instant means it cannot be scheduled against now');
});
