// GATE 6 — the programme publication gate.
//
// This decides whether supporters see a programme. Two rules carry the weight:
// home fixtures only, and never without both confirmed elevens.

const test = require('node:test');
const assert = require('node:assert');
const P = require('../netlify/functions/lib/programme/publish-rules');

const OURS = 1, THEIRS = 2;
const KO = Date.parse('2026-08-11T18:45:00Z');           // 19:45 BST, Tue 11 Aug

function fixture(over) {
  return Object.assign({
    id: 10, external_fixture_id: '578241',
    home_team_id: OURS, away_team_id: THEIRS,
    scheduled_kickoff_at: new Date(KO).toISOString(),
    fixture_status: 'scheduled', programme_eligible: true,
  }, over || {});
}
function lineup(teamId, over) {
  const players = [];
  for (let i = 1; i <= 11; i++) players.push({ name: 'Player ' + teamId + '-' + i, role: 'starter' });
  for (let i = 1; i <= 5; i++) players.push({ name: 'Sub ' + teamId + '-' + i, role: 'substitute' });
  return Object.assign({
    status: 'confirmed', fixtureId: 10, teamId,
    sourceUpdatedAt: new Date(KO).toISOString(), players,
  }, over || {});
}
const edition = (over) => Object.assign({ generated_at: 'x', mandatory_content_valid: true }, over || {});
const decide = (o) => P.decide(Object.assign({
  fixture: fixture(), edition: edition(), ourTeamId: OURS,
  homeLineup: lineup(OURS), awayLineup: lineup(THEIRS), now: KO - 45 * 60000,
}, o || {}));

// ── eligibility ─────────────────────────────────────────────────────────────
test('a home fixture on matchday with both elevens publishes', () => {
  const d = decide();
  assert.strictEqual(d.canPublish, true);
  assert.strictEqual(d.state, P.STATES.READY_TO_PUBLISH);
});

test('an AWAY fixture never gets an automatic programme', () => {
  const d = decide({ fixture: fixture({ home_team_id: THEIRS, away_team_id: OURS }) });
  assert.strictEqual(d.canPublish, false);
  assert.strictEqual(d.state, P.STATES.WITHHELD);
  assert.match(d.reasons.join(' '), /away fixture/);
});

test('home is decided by the registry, not by the venue', () => {
  // Broadfields groundshare at Tithe Farm. "The venue is Tithe Farm" does not
  // mean Rayners Lane are at home, and venue text must never be consulted.
  const away = fixture({ home_team_id: THEIRS, away_team_id: OURS, venue: 'Tithe Farm Sports & Social Club' });
  assert.strictEqual(decide({ fixture: away }).canPublish, false, 'still an away fixture');
});

test('an explicit override can allow a special away edition', () => {
  // For an away fixture the HOME line-up is the opposition's. Getting this
  // round the wrong way is caught by the team check — which is the point of it.
  const d = decide({
    fixture: fixture({ home_team_id: THEIRS, away_team_id: OURS }),
    edition: edition({ programme_eligible_override: true }),
    homeLineup: lineup(THEIRS), awayLineup: lineup(OURS),
  });
  assert.strictEqual(d.canPublish, true, 'an authorised override is honoured');
});

test('an away override with the line-ups the wrong way round is refused', () => {
  const d = decide({
    fixture: fixture({ home_team_id: THEIRS, away_team_id: OURS }),
    edition: edition({ programme_eligible_override: true }),
    homeLineup: lineup(OURS), awayLineup: lineup(THEIRS),   // reversed
  });
  assert.strictEqual(d.canPublish, false);
  assert.match(d.reasons.join(' '), /different team/);
});

test('a fixture with no provider id is never published', () => {
  const d = decide({ fixture: fixture({ external_fixture_id: null }) });
  assert.strictEqual(d.canPublish, false);
  assert.match(d.reasons.join(' '), /identity unproven/);
});

test('postponed, cancelled and abandoned are withheld', () => {
  for (const s of ['postponed', 'cancelled', 'abandoned']) {
    const d = decide({ fixture: fixture({ fixture_status: s }) });
    assert.strictEqual(d.canPublish, false, s);
    assert.strictEqual(d.state, P.STATES.WITHHELD);
  }
});

// ── matchday, in club time ──────────────────────────────────────────────────
test('the day before matchday it stays private', () => {
  const d = decide({ now: KO - 26 * 3600000 });
  assert.strictEqual(d.canPublish, false);
  assert.strictEqual(d.state, P.STATES.WAITING_FOR_MATCHDAY);
});

test('matchday is the CLUB day, whatever the reader’s timezone', () => {
  // 22:00 Pacific on 10 August is already 06:00 on 11 August in Harrow, and the
  // programme belongs to Harrow's Saturday.
  const beforeUkMidnight = Date.parse('2026-08-11T05:00:00Z');   // 06:00 BST, matchday
  assert.strictEqual(P.isMatchday(fixture(), beforeUkMidnight), true);
  const stillPreviousDay = Date.parse('2026-08-10T22:00:00Z');   // 23:00 BST, 10 Aug
  assert.strictEqual(P.isMatchday(fixture(), stillPreviousDay), false);
});

test('after UK midnight the following day it is no longer matchday', () => {
  assert.strictEqual(P.isMatchday(fixture(), Date.parse('2026-08-12T00:30:00Z')), false);
});

// ── the line-up gate ────────────────────────────────────────────────────────
test('no line-ups means waiting, never publishing', () => {
  const d = decide({ homeLineup: null, awayLineup: null });
  assert.strictEqual(d.canPublish, false);
  assert.strictEqual(d.state, P.STATES.WAITING_FOR_LINEUPS);
});

test('one line-up is not enough', () => {
  assert.strictEqual(decide({ awayLineup: null }).canPublish, false);
  assert.strictEqual(decide({ homeLineup: null }).canPublish, false);
});

test('ten or twelve starters are rejected', () => {
  const ten = lineup(OURS);
  ten.players = ten.players.filter((p, i) => !(p.role === 'starter' && i === 0));
  assert.strictEqual(decide({ homeLineup: ten }).canPublish, false);

  const twelve = lineup(OURS);
  twelve.players.push({ name: 'Extra', role: 'starter' });
  const d = decide({ homeLineup: twelve });
  assert.strictEqual(d.canPublish, false);
  assert.match(d.reasons.join(' '), /12 starters|expected 11/);
});

test('a duplicate player blocks publication', () => {
  const dup = lineup(OURS);
  dup.players.push({ name: 'Player 1-1', role: 'substitute' });
  const d = decide({ homeLineup: dup });
  assert.strictEqual(d.canPublish, false);
  assert.match(d.reasons.join(' '), /duplicate|both starter and substitute/i);
});

test('a line-up from the PREVIOUS match is caught', () => {
  const stale = lineup(OURS, { fixtureId: 9 });
  const d = decide({ homeLineup: stale });
  assert.strictEqual(d.canPublish, false);
  assert.match(d.reasons.join(' '), /different fixture/);
});

test('two line-ups for the same team are caught', () => {
  const d = decide({ awayLineup: lineup(OURS) });
  assert.strictEqual(d.canPublish, false);
  assert.match(d.reasons.join(' '), /same team|different team/);
});

test('an unconfirmed line-up does not count', () => {
  const d = decide({ homeLineup: lineup(OURS, { status: 'provisional' }) });
  assert.strictEqual(d.canPublish, false);
  assert.match(d.reasons.join(' '), /not confirmed/);
});

test('a substituted or dismissed starter is still a starter', () => {
  // The Gate 3 correction, protected here: the provider drops class="playing"
  // when a player leaves the pitch, so counting it gives a starting ten.
  const l = lineup(OURS);
  l.players[0].exitedMinute = 70;      // substituted
  l.players[1].exitedMinute = null;    // sent off, no substitution row
  const v = P.validateLineup(l, {});
  assert.strictEqual(v.starters, 11, 'both remain starters');
  assert.strictEqual(v.ok, true);
});

test('a provisional player identity does not block publication', () => {
  const l = lineup(OURS);
  l.players.forEach((p) => { p.identityStatus = 'provisional'; });
  assert.strictEqual(decide({ homeLineup: l }).canPublish, true,
    'the programme shows the provider name; identity resolution is separate work');
});

// ── late publication ────────────────────────────────────────────────────────
test('teams released AFTER kick-off publish immediately, marked late', () => {
  const d = decide({ now: KO + 12 * 60000 });
  assert.strictEqual(d.canPublish, true);
  assert.strictEqual(d.state, P.STATES.PUBLISHED_LATE);
  assert.strictEqual(d.late, true);
});

test('a late programme still beats no programme', () => {
  const d = decide({ now: KO + 60 * 60000 });
  assert.strictEqual(d.canPublish, true, 'an hour into the match is still worth publishing');
});

// ── lifecycle ───────────────────────────────────────────────────────────────
test('an already published edition is not published twice', () => {
  const d = decide({ edition: edition({ published_at: 'now' }) });
  assert.strictEqual(d.canPublish, false);
  assert.strictEqual(d.state, P.STATES.PUBLISHED_MATCHDAY);
});

test('full time moves it to enrichment, not back to publishing', () => {
  const d = decide({ edition: edition({ published_at: 'now' }), isFinal: true });
  assert.strictEqual(d.state, P.STATES.FULL_TIME_CURRENT);
  assert.strictEqual(d.canPublish, false);
});

test('an archived edition stays archived', () => {
  const d = decide({ edition: edition({ published_at: 'x', archived_at: 'y' }) });
  assert.strictEqual(d.state, P.STATES.ARCHIVED);
});

test('a deliberate withhold outranks everything', () => {
  const d = decide({ edition: edition({ withheld_reason: 'pitch inspection' }) });
  assert.strictEqual(d.state, P.STATES.WITHHELD);
  assert.match(d.reasons.join(' '), /pitch inspection/);
});

test('incomplete programme content blocks publication even with both teams', () => {
  const d = decide({ edition: edition({ mandatory_content_valid: false }) });
  assert.strictEqual(d.canPublish, false);
  assert.match(d.reasons.join(' '), /content is not complete/);
});

test('missing optional notes never block publication', () => {
  // The whole point: human inactivity must not mean no programme.
  const d = decide({ edition: edition({ chair_notes: null, manager_notes: null }) });
  assert.strictEqual(d.canPublish, true);
});

test('the portal wording never leaks a state name', () => {
  const d = decide({ homeLineup: null });
  const w = P.portalWording(d, fixture());
  assert.match(w.headline, /Waiting for official starting line-ups/);
  assert.strictEqual(w.detail, 'No action required');
  assert.ok(!/waiting_for_lineups|draft_hidden/.test(w.headline), 'no internal state names');
});
