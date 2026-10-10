// The programme reconciliation, run against fixtures built from the verified
// 9 October 2026 facts — on the registry as it was (stale rows) and as it is
// after the superseded-row fix. Both must produce the same answer.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const REC = require('../netlify/functions/lib/programme/reconcile');
const SEASON = require('./fixtures/programme/season-2026-27');

function byId(rec, id) { return rec.rows.filter((r) => r.fixtureId === id)[0]; }

for (const shape of ['stale', 'corrected']) {
  test(shape + ' registry: the four completed home matches are all eligible, cup included', () => {
    const rec = REC.reconcile(SEASON[shape](), SEASON.productionEditions(), SEASON.NOW);
    const played = rec.rows.filter((r) => r.programmeExpected && r.matchStatus === 'played')
      .map((r) => r.externalId).sort();
    assert.deepStrictEqual(played, ['571413', '578225', '578278', '590749']);
    assert.strictEqual(rec.summary.eligiblePlayedHome, 4);
    const vase = byId(rec, 'favase-1q-new-bradwell-20260815');
    assert.ok(vase.cup, 'the FA Vase tie is a cup fixture');
    assert.strictEqual(vase.status, 'Published');
  });

  test(shape + ' registry: Hilltop 8 Sep (590749) is the one missing historical edition', () => {
    const rec = REC.reconcile(SEASON[shape](), SEASON.productionEditions(), SEASON.NOW);
    assert.deepStrictEqual(rec.summary.historicalMissing, ['fwp-590749']);
    const h = byId(rec, 'fwp-590749');
    assert.strictEqual(h.status, 'Historical edition missing');
    assert.deepStrictEqual(h.result, { us: 0, them: 1 });
    assert.match(h.repairAction, /retrospective Archive Edition/);
  });

  test(shape + ' registry: Wokingham 19 Sep is postponed, never a completed match', () => {
    const rec = REC.reconcile(SEASON[shape](), SEASON.productionEditions(), SEASON.NOW);
    const w = byId(rec, 'fwp-578321');
    assert.strictEqual(w.result, null, 'never a completed match');
    if (shape === 'corrected') {
      assert.strictEqual(w.status, 'Fixture postponed');
      assert.strictEqual(w.programmeExpected, false);
      assert.match(w.repairAction, /cancellation record/);
    } else {
      // The stale registry has a past 'scheduled' row, no result and no
      // replacement: the honest answer is "find the official record", not a
      // guess in either direction.
      assert.strictEqual(w.status, 'Requires manual evidence');
      assert.deepStrictEqual(rec.summary.needsEvidence, ['fwp-578321']);
    }
  });

  test(shape + ' registry: Hilltop 11 Aug (578241) is superseded by 590749', () => {
    const rec = REC.reconcile(SEASON[shape](), SEASON.productionEditions(), SEASON.NOW);
    const h = byId(rec, 'fwp-578241');
    assert.strictEqual(h.matchStatus, 'superseded');
    assert.strictEqual(h.supersededBy, 'fwp-590749');
    assert.strictEqual(h.programmeExpected, false);
  });

  test(shape + ' registry: 4 Aug Broadfields v Rayners Lane at Tithe Farm is AWAY', () => {
    const rec = REC.reconcile(SEASON[shape](), SEASON.productionEditions(), SEASON.NOW);
    const b = byId(rec, 'fwp-578227');
    const input = SEASON[shape]().filter((f) => f.externalId === '578227')[0];
    assert.match(input.venue, /Tithe Farm/, 'played at our shared ground');
    assert.strictEqual(b.officialHome, false);
    assert.strictEqual(b.status, 'Not required');
    // …and the reverse fixture at the same ground is ours.
    assert.strictEqual(byId(rec, 'fwp-578415').officialHome, true);
  });

  test(shape + ' registry: the next home programme is Thatcham Town, not yet generated', () => {
    const rec = REC.reconcile(SEASON[shape](), SEASON.productionEditions(), SEASON.NOW);
    assert.strictEqual(rec.summary.nextHome, 'fwp-578384');
    assert.strictEqual(byId(rec, 'fwp-578384').status, 'Never generated');
  });
}

test('the corrected registry carries the date for 590749 without inventing a time', () => {
  const rec = REC.reconcile(SEASON.corrected(), SEASON.productionEditions(), SEASON.NOW);
  const h = byId(rec, 'fwp-590749');
  assert.strictEqual(h.date, '2026-09-08');
  assert.strictEqual(h.kickoffTimeConfirmed, false);
  assert.ok(h.errors.some((e) => /time not confirmed/.test(e)));
});

test('the stale registry reports the missing date for 590749 rather than guessing one', () => {
  const rec = REC.reconcile(SEASON.stale(), SEASON.productionEditions(), SEASON.NOW);
  const h = byId(rec, 'fwp-590749');
  assert.strictEqual(h.date, null);
  assert.ok(h.errors.includes('no date in the registry'));
});

test('a published edition for a fixture later postponed is preserved, not deleted', () => {
  const eds = SEASON.productionEditions().concat([{ id: 9, internal_fixture_id: 'fwp-578321',
    external_fixture_id: '578321', state: 'published_matchday', published_at: '2026-09-19T08:00:00Z', current_version: 1 }]);
  const rec = REC.reconcile(SEASON.corrected(), eds, SEASON.NOW);
  const w = byId(rec, 'fwp-578321');
  assert.strictEqual(w.status, 'Fixture postponed');
  assert.match(w.repairAction, /preserve the published edition/);
  assert.strictEqual(w.publiclyAccessible, true);
});

test('an edition whose fixture vanished from the registry is reported, never dropped', () => {
  const eds = SEASON.productionEditions().concat([{ internal_fixture_id: 'fwp-1', state: 'archived' }]);
  const rec = REC.reconcile(SEASON.corrected(), eds, SEASON.NOW);
  assert.strictEqual(rec.orphans.length, 1);
});

test('the public ledger lists every home fixture with an honest label', () => {
  const rec = REC.reconcile(SEASON.corrected(), SEASON.productionEditions(), SEASON.NOW);
  const L = REC.publicLedger(rec);
  const label = (id) => L.filter((r) => r.fixtureId === id)[0].label;
  assert.strictEqual(label('fwp-578225'), 'Programme published');
  assert.strictEqual(label('favase-1q-new-bradwell-20260815'), 'Programme published');
  assert.strictEqual(label('fwp-590749'), 'Archive edition in preparation');
  assert.strictEqual(label('fwp-578321'), 'Postponed');
  assert.strictEqual(label('fwp-578241'), 'Postponed · rearranged');
  assert.strictEqual(label('fwp-578384'), 'Not yet published');
  // Away fixtures are not on the programme ledger.
  assert.ok(!L.some((r) => r.fixtureId === 'fwp-578227'));
  // Nothing internal leaks.
  assert.ok(!JSON.stringify(L).match(/repairAction|editionState|draft/));
});

test('an unpublished edition is "published but inaccessible", with the reason', () => {
  const eds = [{ internal_fixture_id: 'fwp-578225', state: 'withheld', published_at: '2026-08-02T09:00:00Z',
    current_version: 2, unpublished_at: '2026-10-01T00:00:00Z', unpublished_by: 'Jenny' }];
  const rec = REC.reconcile(SEASON.corrected(), eds, SEASON.NOW);
  const w = byId(rec, 'fwp-578225');
  assert.strictEqual(w.status, 'Published but inaccessible');
  assert.match(w.repairAction, /Jenny/);
});
