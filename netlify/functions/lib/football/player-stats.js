// GATE 7 — turning line-ups and events into the club's record of its players.
//
// Everything here RECOMPUTES. Nothing increments.
//
// A counter is the obvious way to build appearance and goal totals and it is
// wrong for a reason that only shows up months later: a counter cannot follow a
// correction. When the provider re-attributes a goal, or a committee member
// fixes a misspelled scorer, an incremented total keeps the old number forever
// and there is nothing in the data that says it is stale. A recomputation just
// produces the right answer next time it runs.
//
// The cost is that this must be safe to run over and over. It is: the same
// inputs always give the same rows, and rows a human has corrected are left
// alone.
'use strict';

const S = require('./store');
const P = require('./participation');
const ID = require('./identity');
const N = require('../fwp/normalise');

const SEASON = process.env.FWP_SEASON || '2026-2027';

/** Fixtures worth computing from: those that have actually been played. */
async function playedFixtures(season) {
  return (await S.rest('football_fixtures?season=eq.' + encodeURIComponent(season) +
    '&fixture_status=eq.played&select=id,internal_fixture_id,external_fixture_id,' +
    'home_team_id,away_team_id,competition_id,scheduled_kickoff_at&order=scheduled_kickoff_at.asc')) || [];
}

async function competitionTypes() {
  const rows = await S.rest('football_competitions?select=id,competition_type') || [];
  const m = {};
  rows.forEach((c) => { m[c.id] = c.competition_type; });
  return m;
}

/**
 * The events of one fixture, in the shape participation.js expects.
 *
 * Retracted events are excluded: the provider withdrew them, and a withdrawn
 * red card is not a red card. They stay in the table as history — they just do
 * not count.
 */
async function eventsFor(fixture) {
  const ref = fixture.internal_fixture_id;
  if (!ref) return [];
  const rows = await S.rest('match_events?fixture_id=eq.' + encodeURIComponent(ref) +
    '&retracted_at=is.null&select=event_type,side,player_side,player,assistant,minute,stoppage_minute,own_goal') || [];
  return rows.map((e) => ({
    type: e.event_type === 'penalty_goal' ? 'goal' : e.event_type,
    side: e.player_side || e.side,
    player: e.player,
    assistant: e.assistant,
    minute: e.minute,
    stoppage: e.stoppage_minute || 0,
    ownGoal: !!e.own_goal || e.event_type === 'own_goal',
  }));
}

/** The full-time minute, from the match's own timeline where it exists. */
function fullTimeMinuteFrom(events) {
  const ft = events.filter((e) => e.type === 'full_time')[0];
  if (ft && ft.minute) return Math.max(90, ft.minute);
  return 90;
}

async function lineupsFor(fixtureRowId) {
  const lineups = await S.rest('football_lineups?fixture_id=eq.' + fixtureRowId +
    '&select=id,team_id,status') || [];
  if (!lineups.length) return null;
  const ids = lineups.map((l) => l.id).join(',');
  const rows = await S.rest('football_lineup_players?lineup_id=in.(' + ids + ')' +
    '&select=lineup_id,player_id,provider_player_name,lineup_role,entered_minute,' +
    'exited_minute,is_captain,is_goalkeeper,sort_order&order=sort_order.asc') || [];
  const byLineup = {};
  rows.forEach((r) => { (byLineup[r.lineup_id] = byLineup[r.lineup_id] || []).push(r); });
  return lineups.map((l) => ({
    teamId: l.team_id,
    status: l.status,
    players: (byLineup[l.id] || []).map((r) => ({
      playerId: r.player_id,
      name: r.provider_player_name,
      role: r.lineup_role,
      enteredMinute: r.entered_minute,
      exitedMinute: r.exited_minute,
      isCaptain: r.is_captain,
      isKeeper: r.is_goalkeeper,
    })),
  }));
}

/**
 * One fixture's participation records, already attached to registry players and
 * with merged records followed to whoever survived the merge.
 */
async function recordsForFixture(fixture, ctx) {
  const lineups = await lineupsFor(fixture.id);
  if (!lineups || !lineups.length) return [];
  const events = await eventsFor(fixture);
  const ftMin = fullTimeMinuteFrom(events);
  const abandoned = events.some((e) => e.type === 'abandoned');

  const out = [];
  lineups.forEach((lu) => {
    const side = String(lu.teamId) === String(fixture.home_team_id) ? 'home' : 'away';
    const sideEvents = events.filter((e) => !e.side || e.side === side);
    lu.players.forEach((p) => {
      const rec = P.forPlayer(p, sideEvents, { fullTimeMinute: ftMin, abandoned: abandoned });
      const pid = p.playerId ? ID.canonicalId(p.playerId, ctx.playersById) : null;
      out.push(Object.assign(rec, {
        playerId: pid,
        teamId: lu.teamId,
        side: side,
        fixtureRowId: fixture.id,
        fixtureId: fixture.internal_fixture_id || fixture.external_fixture_id,
        season: ctx.season,
        competitionType: ctx.competitionTypes[fixture.competition_id] || 'league',
        lineupStatus: lu.status,
      }));
    });
  });
  return out;
}

/**
 * Write per-match rows, leaving human corrections standing.
 *
 * A committee member who fixes a scorer must not have that fix quietly undone
 * by the next sync. Those rows are skipped and reported, so the difference
 * between "we agree" and "a human overruled the provider" stays visible.
 */
async function writeMatchStats(records, existingByKey) {
  const rows = [];
  const preserved = [];
  records.forEach((r) => {
    if (!r.playerId) return;                       // unresolved names carry no statistics
    const key = r.fixtureRowId + '|' + r.playerId;
    const prev = existingByKey[key];
    if (prev && prev.manually_corrected) { preserved.push(key); return; }
    rows.push({
      fixture_id: r.fixtureRowId,
      player_id: r.playerId,
      team_id: r.teamId,
      season: r.season,
      competition_type: r.competitionType,
      appearance: r.appearance,
      started: r.started,
      substitute: r.substitute,
      unused_substitute: r.unusedSubstitute,
      entered_minute: r.enteredMinute,
      exited_minute: r.exitedMinute,
      minutes_played: r.minutesPlayed,
      minutes_confidence: r.minutesConfidence,
      goals: r.goals,
      own_goals: r.ownGoals,
      yellow_cards: r.yellowCards,
      red_cards: r.redCards,
      source: 'fwp',
      confidence: r.minutesConfidence,
    });
  });
  if (rows.length) {
    // In batches: a full season of both sides is well over a thousand rows and
    // one request carrying all of them is how a function times out in April.
    for (let i = 0; i < rows.length; i += 200) {
      await S.rest('football_player_match_stats?on_conflict=fixture_id,player_id', {
        method: 'POST', body: rows.slice(i, i + 200),
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, timeout: 15000,
      });
    }
  }
  return { written: rows.length, preserved: preserved };
}

/**
 * Season totals, rebuilt from the per-match rows that were just written —
 * including the human-corrected ones, which is the whole reason totals are
 * derived from the table rather than from the records in memory.
 */
async function writeSeasonStats(season, playersById) {
  const rows = await S.rest('football_player_match_stats?season=eq.' + encodeURIComponent(season) +
    '&select=fixture_id,player_id,team_id,season,competition_type,appearance,started,substitute,' +
    'unused_substitute,goals,own_goals,yellow_cards,red_cards,minutes_played,minutes_confidence') || [];

  const asRecords = rows.map((r) => ({
    playerId: r.player_id, teamId: r.team_id, season: r.season,
    competitionType: r.competition_type,
    fixtureId: r.fixture_id, name: (playersById[r.player_id] || {}).canonical_name || String(r.player_id),
    appearance: r.appearance, started: r.started, substitute: r.substitute,
    unusedSubstitute: r.unused_substitute,
    goals: r.goals, ownGoals: r.own_goals,
    yellowCards: r.yellow_cards, redCards: r.red_cards,
    minutesPlayed: r.minutes_played, minutesConfidence: r.minutes_confidence,
  }));

  const scopes = {
    all: {},
    league: { competitionType: 'league' },
    cup: { competitionTypes: ['league_cup', 'fa_competition', 'county_cup'] },
    friendly: { competitionType: 'friendly' },
  };

  const out = [];
  Object.keys(scopes).forEach((scope) => {
    const opts = Object.assign({ season: season }, scopes[scope]);
    P.aggregate(asRecords, opts).forEach((a) => {
      if (a.playerId == null) return;                      // a total needs a person
      if (!a.appearances && !a.unusedSubstitute) return;    // nothing to record
      out.push({
        player_id: a.playerId, team_id: a.teamId, season: season, scope: scope,
        appearances: a.appearances, starts: a.starts,
        substitute_appearances: a.substituteAppearances,
        unused_substitute: a.unusedSubstitute,
        goals: a.goals, own_goals: a.ownGoals,
        yellow_cards: a.yellowCards, red_cards: a.redCards,
        minutes_played: a.minutesPlayed,
        minutes_confidence: a.minutesConfidence,
        computed_at: new Date().toISOString(),
      });
    });
  });

  // Rows that no longer have any basis are deleted, not left standing. A player
  // whose only appearance was corrected away should not keep an appearance.
  const keep = {};
  out.forEach((r) => { keep[r.player_id + '|' + r.scope + '|' + r.team_id] = true; });
  const existing = await S.rest('football_player_season_stats?season=eq.' +
    encodeURIComponent(season) + '&select=id,player_id,scope,team_id') || [];
  const stale = existing.filter((e) => !keep[e.player_id + '|' + e.scope + '|' + e.team_id]);
  if (stale.length) {
    await S.rest('football_player_season_stats?id=in.(' + stale.map((s) => s.id).join(',') + ')', {
      method: 'DELETE', headers: { Prefer: 'return=minimal' },
    });
  }

  for (let i = 0; i < out.length; i += 200) {
    await S.rest('football_player_season_stats?on_conflict=player_id,season,scope,team_id', {
      method: 'POST', body: out.slice(i, i + 200),
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, timeout: 15000,
    });
  }
  return { seasonRows: out.length, removed: stale.length };
}

/** Every registry player, indexed, with merge chains available. */
async function loadPlayers() {
  const rows = await S.rest('football_players?select=id,canonical_name,display_name,' +
    'current_team_id,identity_status,club_player_id,public_slug,merged_into_id,' +
    'approved_portrait,approved_bio,active') || [];
  const byId = {};
  rows.forEach((p) => { byId[p.id] = p; });
  return { rows: rows, byId: byId };
}

/**
 * The whole job. Safe to run at any time, as often as you like.
 */
async function recompute(opts) {
  opts = opts || {};
  const season = opts.season || SEASON;
  const fixtures = await playedFixtures(season);
  if (!fixtures.length) return { ok: true, season: season, fixtures: 0, note: 'no played fixtures' };

  const [players, comps] = await Promise.all([loadPlayers(), competitionTypes()]);
  const existingRows = await S.rest('football_player_match_stats?season=eq.' +
    encodeURIComponent(season) + '&select=fixture_id,player_id,manually_corrected') || [];
  const existingByKey = {};
  existingRows.forEach((r) => { existingByKey[r.fixture_id + '|' + r.player_id] = r; });

  const ctx = { season: season, playersById: players.byId, competitionTypes: comps };
  let records = [];
  for (const f of fixtures) {
    records = records.concat(await recordsForFixture(f, ctx));
  }

  const match = await writeMatchStats(records, existingByKey);
  const seasonOut = await writeSeasonStats(season, players.byId);

  return {
    ok: true, season: season,
    fixtures: fixtures.length,
    participationRecords: records.length,
    unresolvedNames: records.filter((r) => !r.playerId).length,
    matchRowsWritten: match.written,
    humanCorrectionsPreserved: match.preserved.length,
    seasonRowsWritten: seasonOut.seasonRows,
    seasonRowsRemoved: seasonOut.removed,
  };
}

module.exports = {
  recompute, recordsForFixture, playedFixtures, loadPlayers,
  eventsFor, lineupsFor, writeSeasonStats, fullTimeMinuteFrom,
};
