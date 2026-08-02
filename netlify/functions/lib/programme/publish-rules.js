// GATE 6 — when a matchday programme may go public.
//
// ONE place decides this. The homepage, the Match Centre, the programme page,
// the library and the portal all ask the same function, because a programme
// that is "published" on one surface and "waiting" on another is worse than
// having no programme at all.
//
// Two rules matter more than the rest:
//
//   HOME ONLY. Eligibility comes from the registry — our canonical team id must
//   equal the fixture's home_team_id. Never from venue text, team order in a
//   sentence, an old JSON flag or a portal toggle. Broadfields groundshare at
//   Tithe Farm, so "the venue is Tithe Farm" does not mean we are at home.
//
//   BOTH TEAMS, OR NOTHING. A programme with an empty squad page is not a
//   programme. It publishes when Football Web Pages has given us two confirmed
//   elevens for THIS fixture, and not before — even if that is minutes before
//   kick-off, and even if that turns out to be after it.
//
// Pure functions. No network, no database, no clock of their own — `now` is
// always passed in, so every state is testable.
'use strict';

var MT = require('../../../../js/match-time');

var STATES = {
  DRAFT_HIDDEN: 'draft_hidden',
  WAITING_FOR_MATCHDAY: 'waiting_for_matchday',
  WAITING_FOR_LINEUPS: 'waiting_for_lineups',
  READY_TO_PUBLISH: 'ready_to_publish',
  PUBLISHED_MATCHDAY: 'published_matchday',
  PUBLISHED_LATE: 'published_late',
  FULL_TIME_CURRENT: 'full_time_current',
  ARCHIVED: 'archived',
  WITHHELD: 'withheld',
};

var BLOCKED_FIXTURE_STATUS = ['postponed', 'cancelled', 'abandoned'];

/** The club's own calendar day, in Europe/London, for an instant. */
function londonDay(ms) {
  if (!isFinite(ms)) return null;
  try {
    var p = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day;
  } catch (e) { return null; }
}

/**
 * Is it matchday?
 *
 * Compared as CLUB days, not as the viewer's. A supporter reading this in Los
 * Angeles at 9pm on Friday is already in Saturday in Harrow, and the programme
 * belongs to Harrow's Saturday.
 */
function isMatchday(fixture, nowMs) {
  var ko = fixture && fixture.scheduled_kickoff_at ? Date.parse(fixture.scheduled_kickoff_at) : NaN;
  if (!isFinite(ko)) return false;
  var today = londonDay(nowMs == null ? Date.now() : nowMs);
  return !!today && today === londonDay(ko);
}

/** Home fixture, from the registry and nothing else. */
function isHomeFixture(fixture, ourTeamId) {
  if (!fixture || ourTeamId == null) return false;
  return String(fixture.home_team_id) === String(ourTeamId);
}

/**
 * Validate ONE side's line-up.
 *
 * Uses the corrected Gate 3 interpretation: a starter who was substituted or
 * sent off is still a starter. The provider drops class="playing" the moment a
 * player leaves the pitch, so counting that class gives a starting ten.
 */
function validateLineup(lineup, expected) {
  var errors = [];
  if (!lineup) return { ok: false, errors: ['no line-up'], starters: 0 };
  if (lineup.status !== 'confirmed') errors.push('line-up is not confirmed');

  var players = lineup.players || [];
  var starters = players.filter(function (p) { return p.role === 'starter'; });
  var subs = players.filter(function (p) { return p.role === 'substitute'; });

  if (starters.length !== 11) errors.push('expected 11 starters, found ' + starters.length);

  // The same person cannot be in the eleven twice, and cannot be both a starter
  // and a substitute — either is a sign the provider sent us two matches.
  var seen = {};
  players.forEach(function (p) {
    var k = String(p.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!k) { errors.push('a player row has no name'); return; }
    if (seen[k]) errors.push('duplicate player: ' + p.name);
    seen[k] = true;
  });
  starters.forEach(function (s) {
    var k = String(s.name || '').toLowerCase();
    if (subs.some(function (b) { return String(b.name || '').toLowerCase() === k; })) {
      errors.push('listed as both starter and substitute: ' + s.name);
    }
  });

  if (expected) {
    // The line-up must belong to THIS match. A carried-over line-up from the
    // previous fixture is the quiet failure this check exists for.
    if (expected.fixtureId != null && lineup.fixtureId != null &&
        String(lineup.fixtureId) !== String(expected.fixtureId)) {
      errors.push('line-up belongs to a different fixture');
    }
    if (expected.teamId != null && lineup.teamId != null &&
        String(lineup.teamId) !== String(expected.teamId)) {
      errors.push('line-up belongs to a different team');
    }
  }
  if (!lineup.sourceUpdatedAt) errors.push('no source timestamp');

  return { ok: errors.length === 0, errors: errors, starters: starters.length, substitutes: subs.length };
}

/** Both sides, plus the cross-checks that only make sense together. */
function validateLineupGate(home, away, fixture) {
  var h = validateLineup(home, { fixtureId: fixture && fixture.id, teamId: fixture && fixture.home_team_id });
  var a = validateLineup(away, { fixtureId: fixture && fixture.id, teamId: fixture && fixture.away_team_id });
  var errors = h.errors.map(function (e) { return 'home: ' + e; })
    .concat(a.errors.map(function (e) { return 'away: ' + e; }));

  if (home && away && home.teamId != null && away.teamId != null &&
      String(home.teamId) === String(away.teamId)) {
    errors.push('both line-ups are for the same team');
  }
  return { ok: errors.length === 0, errors: errors, home: h, away: a };
}

/**
 * The one decision.
 *
 * @returns {{state:string, canPublish:boolean, reasons:string[]}}
 */
function decide(input) {
  var fixture = input.fixture;
  var edition = input.edition || {};
  var now = input.now == null ? Date.now() : input.now;
  var reasons = [];

  if (!fixture) return { state: STATES.WITHHELD, canPublish: false, reasons: ['no fixture'] };

  // A human has deliberately stopped it. That outranks everything.
  if (edition.withheld_reason) {
    return { state: STATES.WITHHELD, canPublish: false, reasons: ['withheld: ' + edition.withheld_reason] };
  }
  if (BLOCKED_FIXTURE_STATUS.indexOf(fixture.fixture_status) !== -1) {
    return { state: STATES.WITHHELD, canPublish: false, reasons: ['fixture is ' + fixture.fixture_status] };
  }
  if (!isHomeFixture(fixture, input.ourTeamId) && !edition.programme_eligible_override) {
    return { state: STATES.WITHHELD, canPublish: false, reasons: ['away fixture — no automatic programme'] };
  }
  if (!fixture.programme_eligible && !edition.programme_eligible_override) {
    return { state: STATES.WITHHELD, canPublish: false, reasons: ['fixture is not programme eligible'] };
  }
  if (!fixture.external_fixture_id) {
    return { state: STATES.WITHHELD, canPublish: false, reasons: ['no provider fixture id — identity unproven'] };
  }

  // Already finished with an edition out.
  if (edition.archived_at) return { state: STATES.ARCHIVED, canPublish: false, reasons: ['archived'] };

  var published = !!edition.published_at;
  if (published && input.isFinal) {
    return { state: STATES.FULL_TIME_CURRENT, canPublish: false, reasons: ['full time — enriching'] };
  }
  if (published) {
    return { state: STATES.PUBLISHED_MATCHDAY, canPublish: false, reasons: ['already published'] };
  }

  if (!isMatchday(fixture, now)) {
    return {
      state: edition.generated_at ? STATES.WAITING_FOR_MATCHDAY : STATES.DRAFT_HIDDEN,
      canPublish: false,
      reasons: ['not matchday in Europe/London'],
    };
  }

  // It is matchday. Everything now hangs on the two elevens.
  var gate = validateLineupGate(input.homeLineup, input.awayLineup, fixture);
  if (!gate.ok) {
    return { state: STATES.WAITING_FOR_LINEUPS, canPublish: false, reasons: gate.errors };
  }
  if (!edition.mandatory_content_valid) {
    return { state: STATES.WAITING_FOR_LINEUPS, canPublish: false, reasons: ['programme content is not complete'] };
  }

  // Everything holds. Publishing after kick-off is normal, not an error — teams
  // are often released late, and a late programme beats no programme.
  var ko = Date.parse(fixture.scheduled_kickoff_at);
  var late = isFinite(ko) && now >= ko;
  return {
    state: late ? STATES.PUBLISHED_LATE : STATES.READY_TO_PUBLISH,
    canPublish: true,
    reasons: reasons,
    late: late,
  };
}

/** Plain English for the portal. No jargon, no state names. */
function portalWording(decision, fixture) {
  var map = {};
  map[STATES.DRAFT_HIDDEN] = 'Programme being prepared';
  map[STATES.WAITING_FOR_MATCHDAY] = 'Programme ready — publishes on matchday';
  map[STATES.WAITING_FOR_LINEUPS] = 'Waiting for official starting line-ups from Football Web Pages';
  map[STATES.READY_TO_PUBLISH] = 'Ready to publish';
  map[STATES.PUBLISHED_LATE] = 'Published';
  map[STATES.PUBLISHED_MATCHDAY] = 'Published';
  map[STATES.FULL_TIME_CURRENT] = 'Full time — final score being added';
  map[STATES.ARCHIVED] = 'Archived';
  map[STATES.WITHHELD] = 'Not published';
  return {
    headline: map[decision.state] || 'Programme',
    detail: decision.state === STATES.WAITING_FOR_LINEUPS ? 'No action required' : '',
    reasons: decision.reasons || [],
  };
}

module.exports = {
  STATES, londonDay, isMatchday, isHomeFixture,
  validateLineup, validateLineupGate, decide, portalWording,
};
