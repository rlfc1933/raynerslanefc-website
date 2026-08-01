// GATE 2 — season reconciliation.
//
// The failure this guards against is quiet and expensive: attaching a provider
// match to the wrong internal fixture puts somebody else's score on the club's
// website, and it looks perfectly fine until weeks later.
//
// Run against the club's REAL season — 40 fixtures from data/fixtures.json and
// the provider's own list.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const F = require('../netlify/functions/lib/fwp');
const R = require('../netlify/functions/lib/football/reconcile');

const FX = path.join(__dirname, 'fixtures', 'fwp');
const read = (f) => fs.readFileSync(path.join(FX, f), 'utf8');
const internalFixtures = () =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'fixtures.json'), 'utf8')).fixtures;
const providerFixtures = (file) => F.parseFixtureList(read(file || 'fixtures-results.html')).fixtures;

test('the whole real season reconciles with nothing left over', () => {
  const r = R.reconcileSeason(providerFixtures(), internalFixtures());
  assert.strictEqual(r.summary.unmatchedProvider, 0, 'provider fixtures with no home: ' +
    r.unmatchedProvider.map((u) => u.provider.date + ' ' + u.provider.opponent).join(', '));
  assert.strictEqual(r.summary.unmatchedInternal, 0, 'our fixtures the provider does not have: ' +
    r.unmatchedInternal.map((f) => f.id).join(', '));
  assert.strictEqual(r.summary.matched, r.summary.provider);
  assert.ok(r.summary.exactId >= 35, 'most fixtures should match on the provider id, got ' + r.summary.exactId);
});

test('the current season has no critical conflicts', () => {
  const r = R.reconcileSeason(providerFixtures(), internalFixtures());
  const critical = r.conflicts.filter((c) => c.severity === 'critical');
  assert.deepStrictEqual(critical, [], 'unexpected disagreement with the provider: ' + JSON.stringify(critical));
});

test('a score disagreement IS detected — proved with a mid-match capture', () => {
  // This capture was taken while the match was still 2-1. The club's record now
  // holds the final 3-3. The reconciler must notice, not shrug.
  const r = R.reconcileSeason(providerFixtures('fixtures-results-midmatch.html'), internalFixtures());
  const critical = r.conflicts.filter((c) => c.severity === 'critical');
  assert.strictEqual(critical.length, 2, 'expected both score fields to conflict');
  assert.deepStrictEqual(critical.map((c) => c.field).sort(), ['them', 'us']);
  assert.strictEqual(critical[0].fixtureId, 'fwp-578225');
  // Still fully matched — a disagreement is not a failure to identify.
  assert.strictEqual(r.summary.unmatchedProvider, 0);
});

test('an exact provider id beats every other signal', () => {
  const internal = [
    { id: 'fwp-578225', date: '2026-08-01', kickoff: '15:00', opponent: 'Wallingford & Crowmarsh', isHome: true },
    { id: 'other-1', date: '2026-08-01', kickoff: '15:00', opponent: 'Wallingford & Crowmarsh', isHome: true },
  ];
  const p = { externalFixtureId: '578225', date: '2026-08-01', kickoff: '15:00', opponent: 'Wallingford & Crowmarsh', isHome: true };
  const m = R.matchToInternal(p, internal);
  assert.strictEqual(m.confidence, 'exact_id');
  assert.strictEqual(m.internal.id, 'fwp-578225');
});

test('date and opponent alone are not enough when home/away disagree', () => {
  // Everything agrees except which ground it is on. That is a contradiction,
  // and accepting it would invert the scoreline on the public site.
  const internal = [{ id: 'x-1', date: '2026-08-04', kickoff: '19:45', opponent: 'Broadfields United', isHome: true }];
  const p = { externalFixtureId: '999', date: '2026-08-04', kickoff: '19:45', opponent: 'Broadfields United', isHome: false };
  const m = R.matchToInternal(p, internal);
  assert.strictEqual(m.confidence, 'rejected');
  assert.match(m.reasons.join(' '), /home\/away disagree/);
});

test('two fixtures on one day against the same club need a human', () => {
  const internal = [
    { id: 'a', date: '2026-08-01', opponent: 'Hilltop', isHome: true },
    { id: 'b', date: '2026-08-01', opponent: 'Hilltop', isHome: true },
  ];
  const p = { externalFixtureId: '123', date: '2026-08-01', opponent: 'Hilltop', isHome: true };
  const m = R.matchToInternal(p, internal);
  assert.strictEqual(m.confidence, 'needs_review');
  assert.strictEqual(m.internal, null, 'must not pick one at random');
});

test('a different opponent on the same day is never silently accepted', () => {
  const internal = [{ id: 'a', date: '2026-08-01', opponent: 'Hilltop', isHome: true }];
  const p = { externalFixtureId: '123', date: '2026-08-01', opponent: 'Burnham', isHome: true };
  const m = R.matchToInternal(p, internal);
  assert.strictEqual(m.confidence, 'needs_review');
  assert.strictEqual(m.internal, null);
});

test('a club spelled differently on each side still matches', () => {
  const internal = [{ id: 'a', date: '2026-08-01', opponent: 'Wallingford and Crowmarsh', isHome: true }];
  const p = { externalFixtureId: '123', date: '2026-08-01', opponent: 'Wallingford & Crowmarsh', isHome: true };
  const m = R.matchToInternal(p, internal);
  assert.strictEqual(m.confidence, 'strong');
  assert.strictEqual(m.internal.id, 'a');
});

test('one internal fixture cannot be claimed twice', () => {
  const internal = [{ id: 'a', date: '2026-08-01', opponent: 'Hilltop', isHome: true }];
  const provider = [
    { externalFixtureId: '1', date: '2026-08-01', opponent: 'Hilltop', isHome: true },
    { externalFixtureId: '2', date: '2026-08-01', opponent: 'Hilltop', isHome: true },
  ];
  const r = R.reconcileSeason(provider, internal);
  assert.strictEqual(r.summary.matched, 1);
  assert.strictEqual(r.summary.unmatchedProvider, 1);
});

test('the provider stopping reporting a kick-off is silence, not disagreement', () => {
  // A played fixture has no time in that cell — it holds the score instead.
  const internal = { id: 'a', date: '2026-08-01', kickoff: '15:00', opponent: 'Hilltop', isHome: true };
  const p = { externalFixtureId: '1', date: '2026-08-01', kickoff: null, opponent: 'Hilltop', isHome: true, played: true, homeScore: 1, awayScore: 0 };
  const diffs = R.diffFixture(internal, p);
  assert.ok(!diffs.some((d) => d.field === 'kickoff'), 'a null kick-off must not raise a conflict');
});

test('a changed kick-off time IS a conflict', () => {
  const internal = { id: 'a', date: '2026-08-04', kickoff: '19:45', opponent: 'Broadfields United', isHome: false };
  const p = { externalFixtureId: '1', date: '2026-08-04', kickoff: '20:00', opponent: 'Broadfields United', isHome: false };
  const diffs = R.diffFixture(internal, p);
  const ko = diffs.find((d) => d.field === 'kickoff');
  assert.ok(ko, 'a moved kick-off must be reported');
  assert.strictEqual(ko.severity, 'critical');
});

test('competition wording differences are informational, not contradictions', () => {
  // "Combined Counties Prem N" and "Combined Counties Premier Division North"
  // are the same competition abbreviated differently.
  const internal = { id: 'a', date: '2026-08-01', opponent: 'Hilltop', isHome: true, competition: 'Combined Counties Prem N' };
  const p = { externalFixtureId: '1', date: '2026-08-01', opponent: 'Hilltop', isHome: true, competition: 'Combined Counties League Premier Division North' };
  const diffs = R.diffFixture(internal, p);
  const comp = diffs.find((d) => d.field === 'competition');
  assert.ok(comp);
  assert.strictEqual(comp.severity, 'info', 'must not be critical');
});

test('only home league fixtures are programme-eligible', () => {
  assert.strictEqual(R.programmeEligible({ isHome: true, competition: 'Combined Counties Prem N' }), true);
  assert.strictEqual(R.programmeEligible({ isHome: false, competition: 'Combined Counties Prem N' }), false);
  assert.strictEqual(R.programmeEligible({ isHome: true, competition: 'Pre-Season Friendly' }), false);
  assert.strictEqual(R.programmeEligible({ isHome: true, competition: 'FA Cup EP' }), true);
});

test('every reconciled fixture yields one absolute kick-off instant', () => {
  const MT = require('../js/match-time');
  const r = R.reconcileSeason(providerFixtures(), internalFixtures());
  let checked = 0;
  for (const m of r.matched) {
    const time = m.provider.kickoff || (m.internal && m.internal.kickoff);
    if (!time) continue;                       // played: provider reports no time
    const ko = MT.parseLondonKickoff(m.provider.date, time);
    assert.ok(isFinite(ko), 'no instant for ' + m.provider.date + ' ' + time);
    checked++;
  }
  assert.ok(checked >= 30, 'expected most fixtures to yield an instant, got ' + checked);
});
