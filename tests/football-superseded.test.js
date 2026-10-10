'use strict';
// Why the registry missed Hilltop (8 Sep) and kept Wokingham (19 Sep) live.
//
// FWP re-issues a NEW fixture id when the league re-arranges a match and drops
// a postponed one that has no new date yet. Verified on footballwebpages.co.uk
// on 9 Oct 2026: Hilltop H was 578241 (11 Aug, P-P) and is now 590749 on Tue
// 8 Sep, played 0-1; Holyport A moved 578296 (5 Sep) -> 593622 (10 Oct);
// Wokingham H 578321 (19 Sep) is no longer listed. Two faults followed:
//  1. a match first seen after it was played has a date but no kick-off, and
//     was stored with NO instant — it sorted nowhere and vanished;
//  2. the superseded old ids were never touched again and stayed "scheduled".
const test = require('node:test');
const assert = require('node:assert');
const SYNC = require('../netlify/functions/football-sync-season');
const { buildFixtureRows, supersededRows } = SYNC._internal;

const cache = { teamByKey: {}, compByKey: {} };
const entry = (p) => ({ provider: Object.assign({ competition: 'Combined Counties Prem N' }, p), internal: null, confidence: 'needs_review' });

test('a re-arranged match first seen as played still gets a date — and an honest "time unconfirmed"', () => {
  const { rows } = buildFixtureRows([entry({ externalFixtureId: '590749', date: '2026-09-08', kickoff: null,
    providerKoCell: '(0) 0 - 1 (0)', played: true, isHome: true, opponent: 'Hilltop' })], cache, [], '2026-10-10T03:00:00Z');
  assert.strictEqual(rows[0].scheduled_kickoff_at, '2026-09-08T11:00:00.000Z', 'midday London (BST) on the real date');
  assert.strictEqual(rows[0].kickoff_time_confirmed, false);
  assert.strictEqual(rows[0].fixture_status, 'played');
  assert.strictEqual(rows[0].is_home_fixture, true);
});

test('a known kick-off time is never replaced by the midday placeholder', () => {
  const existing = [{ external_fixture_id: '590749', scheduled_kickoff_at: '2026-09-08T18:45:00Z', kickoff_time_confirmed: true }];
  const { rows } = buildFixtureRows([entry({ externalFixtureId: '590749', date: '2026-09-08', kickoff: null,
    providerKoCell: '(0) 0 - 1 (0)', played: true, isHome: true, opponent: 'Hilltop' })], cache, existing, '2026-10-10T03:00:00Z');
  assert.strictEqual(rows[0].scheduled_kickoff_at, '2026-09-08T18:45:00Z');
  assert.strictEqual(rows[0].kickoff_time_confirmed, true);
});

test('ids the provider no longer lists, never played, are superseded (Hilltop old id, Holyport old id, Wokingham)', () => {
  const existing = [
    { external_fixture_id: '578241', fixture_status: 'scheduled', external_provider: 'fwp', first_team: true },  // Hilltop 11 Aug P-P
    { external_fixture_id: '578296', fixture_status: 'scheduled', external_provider: 'fwp', first_team: true },  // Holyport old date
    { external_fixture_id: '578321', fixture_status: 'scheduled', external_provider: 'fwp', first_team: true },  // Wokingham 19 Sep
    { external_fixture_id: '578225', fixture_status: 'played', external_provider: 'fwp', first_team: true },     // still listed
    { external_fixture_id: '500000', fixture_status: 'played', external_provider: 'fwp', first_team: true },     // unlisted but played: kept
  ];
  const listed = ['578225', '590749', '593622'].concat(Array.from({ length: 30 }, (_, i) => String(600000 + i)));
  assert.deepStrictEqual(supersededRows(existing, listed, listed.length).sort(), ['578241', '578296', '578321']);
});

test('a short or empty provider list never marks the season postponed', () => {
  const existing = [{ external_fixture_id: '578321', fixture_status: 'scheduled', external_provider: 'fwp', first_team: true }];
  assert.deepStrictEqual(supersededRows(existing, ['1', '2'], 2), []);
  assert.deepStrictEqual(supersededRows(existing, [], 0), []);
});
