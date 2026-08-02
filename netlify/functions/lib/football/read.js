// GATE 4 — the shared football read layer.
//
// One place that answers "what is the next match", "what was the last result",
// "where are we in the table". Before this, the homepage, the fixtures page, the
// programme and the portal each worked it out for themselves from different
// sources — which is how the site ended up offering the match it had just
// played as the next fixture.
//
// Returns NORMALISED records. No provider HTML, no provider vocabulary, no
// cursors. Callers never learn where the facts came from.
'use strict';

const S = require('./store');
const N = require('../fwp/normalise');

const CLUB = 'Rayners Lane';

/** Shape one registry fixture into the record every consumer uses. */
function shapeFixture(f, teams) {
  const home = teams[f.home_team_id] || null;
  const away = teams[f.away_team_id] || null;
  const isHome = f.is_home_fixture !== false;
  const opponent = isHome ? (away && away.canonical_name) : (home && home.canonical_name);
  return {
    id: f.internal_fixture_id || ('fwp-' + f.external_fixture_id),
    externalId: f.external_fixture_id,
    season: f.season,
    // The authoritative instant. Consumers compare against Date.now(); they must
    // never re-parse a local date string — that is what broke Los Angeles.
    kickoffAt: f.scheduled_kickoff_at,
    clubTimezone: f.club_timezone || 'Europe/London',
    homeTeam: home && home.canonical_name,
    awayTeam: away && away.canonical_name,
    homeCrest: home && home.crest_asset_path,
    awayCrest: away && away.crest_asset_path,
    isHome,
    opponent,
    competition: f.competition_id ? null : null,   // filled by caller from the map
    competitionId: f.competition_id,
    venue: f.venue,
    status: f.fixture_status,
    programmeEligible: !!f.programme_eligible,
    confidence: f.source_confidence,
  };
}

async function loadTeams() {
  const rows = await S.rest('football_teams?select=id,canonical_name,crest_asset_path,is_rayners_lane') || [];
  const map = {};
  rows.forEach((t) => { map[t.id] = t; });
  return map;
}
async function loadCompetitions() {
  const rows = await S.rest('football_competitions?select=id,canonical_name,competition_type') || [];
  const map = {};
  rows.forEach((c) => { map[c.id] = c; });
  return map;
}

/** The whole season, in kick-off order, already shaped. */
async function season(seasonLabel) {
  const [teams, comps, fixtures] = await Promise.all([
    loadTeams(), loadCompetitions(),
    S.rest('football_fixtures?select=*' +
      (seasonLabel ? '&season=eq.' + encodeURIComponent(seasonLabel) : '') +
      '&order=scheduled_kickoff_at.asc'),
  ]);
  return (fixtures || []).map((f) => {
    const shaped = shapeFixture(f, teams);
    const c = comps[f.competition_id];
    shaped.competition = c ? c.canonical_name : null;
    shaped.competitionType = c ? c.competition_type : null;
    return shaped;
  });
}

/**
 * The NEXT fixture — strictly one that has not kicked off yet.
 *
 * "Next" and "happening now" are different questions and were originally one
 * function with a 150-minute grace window, which meant a match in progress was
 * still being offered as the next match. currentFrom() answers the other one.
 *
 * Excludes anything already played: a played fixture with no score in the
 * legacy file is exactly how the site came to count down to the game it had
 * just finished.
 */
function nextFrom(list, nowMs) {
  const now = nowMs == null ? Date.now() : nowMs;
  return list
    .filter((f) => f.status === 'scheduled' && f.kickoffAt && Date.parse(f.kickoffAt) > now)
    .sort((a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt))[0] || null;
}

/**
 * The fixture happening NOW — kicked off, not yet recorded as played, and
 * within a plausible match length. This is what the homepage leads with; the
 * live match state decides what it says.
 */
function currentFrom(list, nowMs) {
  const now = nowMs == null ? Date.now() : nowMs;
  return list
    .filter((f) => f.status === 'scheduled' && f.kickoffAt)
    .filter((f) => {
      const ko = Date.parse(f.kickoffAt);
      return ko <= now && now < ko + 150 * 60000;
    })
    .sort((a, b) => Date.parse(b.kickoffAt) - Date.parse(a.kickoffAt))[0] || null;
}

/** The most recently completed fixture. */
function previousFrom(list, nowMs) {
  const now = nowMs == null ? Date.now() : nowMs;
  return list
    .filter((f) => f.status === 'played' && f.kickoffAt && Date.parse(f.kickoffAt) <= now)
    .sort((a, b) => Date.parse(b.kickoffAt) - Date.parse(a.kickoffAt))[0] || null;
}

/** The next fixture that would carry a programme. */
function nextProgrammeFrom(list, nowMs) {
  const now = nowMs == null ? Date.now() : nowMs;
  return list
    .filter((f) => f.programmeEligible && f.status === 'scheduled' && f.kickoffAt && Date.parse(f.kickoffAt) > now - 150 * 60000)
    .sort((a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt))[0] || null;
}

/**
 * Recent form, from OUR point of view.
 *
 * Orientation matters: a 0-3 away win is a win. Reading the home score as ours
 * would turn half the season upside down.
 */
function formFrom(results, opts) {
  const o = opts || {};
  const list = results
    .filter((r) => r.us != null && r.them != null)
    .filter((r) => (o.leagueOnly ? r.competitionType === 'league' : true))
    .sort((a, b) => Date.parse(b.kickoffAt) - Date.parse(a.kickoffAt))
    .slice(0, o.limit || 5);
  return list.map((r) => ({
    id: r.id, date: r.kickoffAt, opponent: r.opponent, isHome: r.isHome,
    us: r.us, them: r.them,
    outcome: r.us > r.them ? 'W' : (r.us === r.them ? 'D' : 'L'),
    competition: r.competition,
  }));
}

/** Completed fixtures with their scores attached from the live match state. */
async function results(seasonLabel) {
  const list = await season(seasonLabel);
  const played = list.filter((f) => f.status === 'played');
  if (!played.length) return [];
  const ids = played.map((f) => '"' + f.id + '"').join(',');
  const states = await S.rest('match_state?fixture_id=in.(' + encodeURIComponent(ids) +
    ')&select=fixture_id,home_score,away_score,is_final') || [];
  const byFixture = {};
  states.forEach((s) => { byFixture[s.fixture_id] = s; });
  return played.map((f) => {
    const st = byFixture[f.id];
    const us = st ? (f.isHome ? st.home_score : st.away_score) : null;
    const them = st ? (f.isHome ? st.away_score : st.home_score) : null;
    return Object.assign({}, f, { us, them, hasScore: us != null && them != null });
  });
}

/** The current confirmed league table, with its freshness. */
async function leagueTable() {
  const snaps = await S.rest('football_league_tables?snapshot_type=eq.current&select=*&order=created_at.desc&limit=1');
  const snap = snaps && snaps[0];
  if (!snap) return null;
  const rows = await S.rest('football_league_table_rows?table_id=eq.' + snap.id +
    '&select=*&order=position.asc') || [];
  return {
    snapshotId: snap.id,
    season: snap.season,
    sourceUpdatedAt: snap.source_updated_at,
    lastSyncedAt: snap.last_synced_at,
    rows: rows.map((r) => ({
      position: r.position, team: r.provider_team_name, teamId: r.team_id,
      played: r.played, won: r.won, drawn: r.drawn, lost: r.lost,
      goalsFor: r.goals_for, goalsAgainst: r.goals_against,
      goalDifference: r.goal_difference, points: r.points,
      isUs: N.sameClub(r.provider_team_name, CLUB),
    })),
  };
}

module.exports = {
  CLUB, shapeFixture, season, results, leagueTable,
  nextFrom, currentFrom, previousFrom, nextProgrammeFrom, formFrom,
};
