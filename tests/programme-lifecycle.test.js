// The two-stage programme: editorial edition first (when a person approves
// it), confirmed teams second, and every awkward case in between.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const LC = require('../netlify/functions/lib/programme/lifecycle');

const OURS = 1, THEIRS = 2;
// Thatcham Town, Sat 31 Oct 2026, 3pm GMT (clocks went back on 25 Oct).
const KO = Date.parse('2026-10-31T15:00:00Z');

function fixture(over) {
  return Object.assign({ id: 77, external_fixture_id: '578384', home_team_id: OURS, away_team_id: THEIRS,
    scheduled_kickoff_at: new Date(KO).toISOString(), fixture_status: 'scheduled', programme_eligible: true }, over || {});
}
function lineup(teamId, over) {
  const players = [];
  for (let i = 1; i <= 11; i++) players.push({ name: 'Player ' + teamId + '-' + i, number: i, role: 'starter', isCaptain: i === 4 });
  for (let i = 1; i <= 5; i++) players.push({ name: 'Sub ' + teamId + '-' + i, number: 11 + i, role: 'substitute' });
  return Object.assign({ status: 'confirmed', fixtureId: 77, teamId, sourceUpdatedAt: '2026-10-31T14:02:00Z', players,
    starters: players.filter((p) => p.role === 'starter'), substitutes: players.filter((p) => p.role === 'substitute') }, over || {});
}
const approved = { generated_at: 'x', mandatory_content_valid: true, editorial_approved_at: '2026-10-29T18:00:00Z',
  editorial_approved_by: 'Jenny' };

function stage(o) {
  const home = o.home === undefined ? null : o.home;
  const away = o.away === undefined ? null : o.away;
  const fx = o.fixture || fixture();
  return LC.decideStage(Object.assign({ fixture: fx, edition: o.edition || {}, ourTeamId: OURS, now: o.now,
    homeLineup: home, awayLineup: away, teams: LC.teamSheets(home, away, fx), contentValid: true }, o.extra || {}));
}

test('matchday morning: an APPROVED editorial edition publishes with teams pending', () => {
  const d = stage({ edition: approved, now: KO - 6 * 3600000 });
  assert.strictEqual(d.action, 'publish');
  assert.strictEqual(d.stage, 'editorial');
  assert.strictEqual(d.state, 'published_matchday');
});

test('without approval nothing goes out early — the original both-teams rule holds', () => {
  const d = stage({ edition: { generated_at: 'x', mandatory_content_valid: true }, now: KO - 6 * 3600000 });
  assert.strictEqual(d.action, 'hold');
});

test('the day before, even an approved edition waits for matchday (Europe/London)', () => {
  const d = stage({ edition: approved, now: KO - 30 * 3600000 });
  assert.strictEqual(d.action, 'hold');
});

test('editorial changed after approval goes back for review, it is not published', () => {
  const d = stage({ edition: Object.assign({ editorial_approved_hash: 'aaa' }, approved), now: KO - 3600000,
    extra: { editorialHash: 'bbb' } });
  assert.strictEqual(d.action, 'hold');
  assert.strictEqual(d.state, 'ready_for_review');
});

test('both teams confirmed before publication → published straight to Stage B', () => {
  const d = stage({ edition: { generated_at: 'x', mandatory_content_valid: true }, now: KO - 45 * 60000,
    home: lineup(OURS), away: lineup(THEIRS) });
  assert.strictEqual(d.action, 'publish');
  assert.strictEqual(d.stage, 'teams_confirmed');
});

test('published editorial edition + both teams later → a REVISION of the team sheet only', () => {
  const ed = Object.assign({ published_at: '2026-10-31T08:00:00Z', state: 'published_matchday', teams_status: 'pending' }, approved);
  const d = stage({ edition: ed, now: KO - 50 * 60000, home: lineup(OURS), away: lineup(THEIRS) });
  assert.strictEqual(d.action, 'revise');
  assert.strictEqual(d.stage, 'teams_confirmed');
});

test('only ONE team published: show it, keep an honest placeholder for the other', () => {
  const ts = LC.teamSheets(lineup(OURS), null, fixture());
  assert.strictEqual(ts.status, 'partial');
  const sq = LC.squadsSection(ts, { homeTeam: 'Rayners Lane', awayTeam: 'Thatcham Town' });
  assert.strictEqual(sq.home.confirmed, true);
  assert.strictEqual(sq.home.starters.length, 11);
  assert.strictEqual(sq.away.confirmed, false);
  assert.strictEqual(sq.away.note, 'Confirmed teams will appear here when available.');
  assert.strictEqual(sq.source, 'Football Web Pages');
  assert.strictEqual(sq.sourceUpdatedAt, '2026-10-31T14:02:00Z');
  const ed = Object.assign({ published_at: 'x', state: 'published_matchday', teams_status: 'pending' }, approved);
  assert.strictEqual(stage({ edition: ed, now: KO - 3600000, home: lineup(OURS) }).stage, 'teams_partial');
});

test('no team sheet at all: the editorial edition stands and nothing is revised', () => {
  const ed = Object.assign({ published_at: 'x', state: 'published_matchday', teams_status: 'pending' }, approved);
  assert.strictEqual(stage({ edition: ed, now: KO - 600000 }).action, 'none');
});

test('an unconfirmed (predicted) line-up is never shown as confirmed', () => {
  const ts = LC.teamSheets(lineup(OURS, { status: 'predicted' }), lineup(THEIRS, { status: 'predicted' }), fixture());
  assert.strictEqual(ts.status, 'pending');
  const sq = LC.squadsSection(ts, { homeTeam: 'A', awayTeam: 'B' });
  assert.ok(!sq.home.starters && !sq.away.starters);
});

test('the same team sheet arriving twice makes no second revision', () => {
  const ed = { published_at: 'x', state: 'published_matchday', teams_status: 'confirmed' };
  assert.strictEqual(stage({ edition: ed, now: KO - 600000, home: lineup(OURS), away: lineup(THEIRS) }).action, 'none');
  // …and identical content hashes identically, whatever the key order or timestamps.
  assert.strictEqual(LC.contentHash({ a: 1, b: [1, 2], capturedAt: 'now' }), LC.contentHash({ b: [1, 2], a: 1, capturedAt: 'later' }));
  assert.notStrictEqual(LC.contentHash({ a: 1 }), LC.contentHash({ a: 2 }));
});

test('POSTPONED before publication: paused, no fictional edition', () => {
  const d = stage({ fixture: fixture({ fixture_status: 'postponed' }), edition: approved, now: KO - 3600000 });
  assert.strictEqual(d.action, 'mark_called_off');
  assert.strictEqual(d.state, 'postponed');
});

test('POSTPONED after publication: the edition is preserved and marked', () => {
  const ed = Object.assign({ published_at: 'x', state: 'published_matchday' }, approved);
  const d = stage({ fixture: fixture({ fixture_status: 'postponed' }), edition: ed, now: KO - 3600000 });
  assert.strictEqual(d.action, 'mark_called_off');
  assert.strictEqual(d.state, 'published_matchday', 'stays public');
  // and a second run does nothing more
  const again = stage({ fixture: fixture({ fixture_status: 'postponed' }),
    edition: Object.assign({ fixture_postponed_at: 'y' }, ed), now: KO - 3500000 });
  assert.strictEqual(again.action, 'none');
});

test('a superseded registry row (rearranged under a new id) counts as called off', () => {
  assert.ok(LC.isCalledOff({ fixture_status: 'postponed', sync_status: 'superseded' }));
  assert.ok(LC.isCalledOff({ fixture_status: 'scheduled', sync_status: 'superseded' }));
});

test('a person who unpublished an edition is never overridden by the timer', () => {
  const ed = Object.assign({ published_at: 'x', unpublished_at: 'y', unpublished_by: 'Pete', state: 'withheld' }, approved);
  assert.strictEqual(stage({ edition: ed, now: KO - 600000, home: lineup(OURS), away: lineup(THEIRS) }).action, 'none');
});

test('a played match without an edition becomes a proposal, not a publication', () => {
  const d = stage({ fixture: fixture({ fixture_status: 'played' }), edition: { generated_at: 'x', mandatory_content_valid: true },
    now: KO + 30 * 86400000 });
  assert.strictEqual(d.action, 'hold');
  assert.strictEqual(d.state, 'retrospective_candidate');
});

test('once authorised, the retrospective Archive Edition publishes from the verified record alone', () => {
  const d = stage({ fixture: fixture({ fixture_status: 'played' }),
    edition: { generated_at: 'x', mandatory_content_valid: true, retrospective_authorised_by: 'Pete' },
    now: KO + 30 * 86400000, extra: { result: { home: 0, away: 1 } } });
  assert.strictEqual(d.action, 'retrospective');
  assert.strictEqual(d.state, 'published_recovery');
});

test('the Archive Edition is labelled, never prints an unknown kick-off, never invents line-ups', () => {
  const e = LC.retrospectiveEdition({ homeTeam: 'Rayners Lane', awayTeam: 'Hilltop', competition: 'Combined Counties Prem N',
    dateLong: 'Tuesday 8 September 2026', kickoff: '12:00', kickoffTimeConfirmed: false, result: { home: 0, away: 1 } });
  assert.strictEqual(e.sections.cover.archiveMarker, 'Archive Edition — Reconstructed from verified match records');
  assert.strictEqual(e.sections.cover.kickoff, null, 'the stored 12:00 placeholder must not print');
  assert.ok(!JSON.stringify(e).includes('12:00'));
  assert.strictEqual(e.sections.squads.confirmed, false);
  assert.ok(e.sections.record.lines.includes('Result: Rayners Lane 0–1 Hilltop'));
  assert.strictEqual(e.validation.ok, true);
});

test('manual editorial survives a data refresh; unapproved drafts and unattributed chair notes do not appear', () => {
  const built = { sections: { welcome: { lead: 'generated' }, history: { founded: 1933 } } };
  const out = LC.applySections(built, [
    { section_key: 'preview', title: 'Preview', body: 'Written by Jenny', approved_by: 'Jenny' },
    { section_key: 'chairNotes', body: 'Draft', approved_by: null, preapproved: true },
    { section_key: 'article:one', title: 'Draft only', body: 'x' },
  ]);
  assert.strictEqual(out.sections.preview.body, 'Written by Jenny');
  assert.ok(!out.sections.chairNotes, 'pre-approval never stands in for the chairman');
  assert.ok(!out.sections.articles, 'an unapproved article never renders');
  assert.strictEqual(built.sections.preview, undefined, 'the built edition is not mutated');
});

test('sponsor placements: approved records only; missing artwork is flagged, never substituted', () => {
  const rows = [
    { id: 1, edition_id: 5, sponsor_name: 'Approved Ball Co', placement_kind: 'match_ball', approval_status: 'approved', approved_by: 'Pete' },
    { id: 2, edition_id: 5, sponsor_name: 'Prospect Ltd', placement_kind: 'full_page', approval_status: 'proposed' },
    { id: 3, edition_id: 5, sponsor_name: 'No Art Ltd', placement_kind: 'half_page', approval_status: 'approved', approved_by: 'Pete' },
    { id: 4, edition_id: 6, sponsor_name: 'Other match', placement_kind: 'match_sponsor', approval_status: 'approved', approved_by: 'Pete' },
    { id: 5, edition_id: 5, sponsor_name: 'Squashed', placement_kind: 'full_page', approval_status: 'approved', approved_by: 'Pete',
      artwork_path: 'x.png', artwork_width: 1000, artwork_height: 300 },
  ];
  const r = LC.sponsorPlacements(rows, { editionId: 5, season: '2026-2027' });
  assert.deepStrictEqual(r.placements.map((p) => p.sponsor), ['Approved Ball Co']);
  assert.deepStrictEqual(r.issues.map((i) => i.issue.split(' ')[0]), ['artwork', 'artwork']);
  assert.deepStrictEqual(LC.sponsorPlacements([], { editionId: 5 }).placements, [], 'none invented');
});

test('rollback is a new version that restores an old payload, with a name', () => {
  const vs = [{ version: 1, payload: { a: 1 } }, { version: 2, payload: { a: 2 } }];
  const r = LC.rollbackVersion(vs, 1, 'Jenny', 'wrong name');
  assert.strictEqual(r.row.version, 3);
  assert.deepStrictEqual(r.row.payload, { a: 1 });
  assert.strictEqual(r.row.restored_from_version, 1);
  assert.strictEqual(LC.rollbackVersion(vs, 1, '').ok, false);
  assert.strictEqual(LC.rollbackVersion(vs, 9, 'J').ok, false);
});
