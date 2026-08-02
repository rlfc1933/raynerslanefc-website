// GATE 7 — what the public may know about a player.
//
// The rule this file exists to enforce: a provider string is not a person, so
// it never gets a page, a portrait or a biography. Only an identity a human has
// confirmed against the club's own roster is publicly addressable.
//
// Unconfirmed names still appear — on a team sheet, in a match report — because
// hiding them would misrepresent the match. They appear as plain text.
'use strict';

const S = require('./store');
const ID = require('./identity');

const SEASON = process.env.FWP_SEASON || '2026-2027';

/** Shown as "not known", never as zero. */
function minutesOut(row) {
  if (row.minutes_played == null) return { minutes: null, minutesKnown: false };
  return {
    minutes: row.minutes_played,
    minutesKnown: true,
    minutesExact: row.minutes_confidence === 'system_derived_high'
      || row.minutes_confidence === 'provider_confirmed',
  };
}

function shapeTotals(row) {
  if (!row) {
    return { appearances: 0, starts: 0, substituteAppearances: 0, goals: 0,
      ownGoals: 0, yellowCards: 0, redCards: 0, minutes: null, minutesKnown: false };
  }
  return Object.assign({
    appearances: row.appearances || 0,
    starts: row.starts || 0,
    substituteAppearances: row.substitute_appearances || 0,
    unusedSubstitute: row.unused_substitute || 0,
    goals: row.goals || 0,
    ownGoals: row.own_goals || 0,
    yellowCards: row.yellow_cards || 0,
    redCards: row.red_cards || 0,
  }, minutesOut(row));
}

async function ourTeamId() {
  const t = await S.findOne('football_teams', 'is_rayners_lane=is.true&select=id');
  return t ? t.id : null;
}

/**
 * The club's squad with the season's computed record attached.
 *
 * The roster itself stays the club's — data/players.json is the owner of who is
 * in the squad, their shirt number, position and photograph. This adds only what
 * the matches say, and only where an identity has been confirmed. A player with
 * no confirmed identity yet simply has no numbers, which is honest: nothing has
 * been established about him.
 */
async function squad(seasonLabel, roster, opts) {
  const o = opts || {};
  const season = seasonLabel || SEASON;
  const scope = o.scope || 'all';
  const teamId = await ourTeamId();
  if (!teamId) return roster.map((p) => Object.assign({}, p, { stats: null, playerPage: null }));

  const players = await S.rest('football_players?current_team_id=eq.' + teamId +
    '&identity_status=eq.confirmed&merged_into_id=is.null' +
    '&select=id,canonical_name,display_name,club_player_id,public_slug,identity_status,merged_into_id') || [];
  const byClubId = {};
  players.forEach((p) => { if (p.club_player_id) byClubId[p.club_player_id] = p; });

  const ids = players.map((p) => p.id);
  let totals = [];
  if (ids.length) {
    totals = await S.rest('football_player_season_stats?season=eq.' + encodeURIComponent(season) +
      '&scope=eq.' + scope + '&player_id=in.(' + ids.join(',') + ')&select=*') || [];
  }
  const byPlayer = {};
  totals.forEach((t) => { byPlayer[t.player_id] = t; });

  return roster.map((p) => {
    const reg = byClubId[p.id];
    return Object.assign({}, p, {
      registryId: reg ? reg.id : null,
      // Only a confirmed identity is addressable.
      playerPage: reg && ID.isPublic(reg) ? '/player.html?p=' + reg.public_slug : null,
      stats: reg ? shapeTotals(byPlayer[reg.id]) : null,
    });
  });
}

/** One player's page. Refuses anything not confirmed, including by id. */
async function playerDetail(slug, seasonLabel) {
  const season = seasonLabel || SEASON;
  if (!slug) return null;
  const p = await S.findOne('football_players',
    'public_slug=eq.' + encodeURIComponent(slug) +
    '&identity_status=eq.confirmed&merged_into_id=is.null&select=*');
  if (!p || !ID.isPublic(p)) return null;

  const [totals, matches, teams] = await Promise.all([
    S.rest('football_player_season_stats?player_id=eq.' + p.id + '&select=*&order=season.desc'),
    S.rest('football_player_match_stats?player_id=eq.' + p.id +
      '&select=*,football_fixtures(internal_fixture_id,external_fixture_id,scheduled_kickoff_at,' +
      'home_team_id,away_team_id,is_home_fixture,fixture_status)&order=season.desc'),
    S.rest('football_teams?select=id,canonical_name,display_name,slug'),
  ]);
  const teamName = {};
  (teams || []).forEach((t) => { teamName[t.id] = t.display_name || t.canonical_name; });

  const bySeason = {};
  (totals || []).forEach((t) => {
    (bySeason[t.season] = bySeason[t.season] || {})[t.scope] = shapeTotals(t);
  });

  const games = (matches || []).map((m) => {
    const f = m.football_fixtures || {};
    const opponentId = f.is_home_fixture ? f.away_team_id : f.home_team_id;
    return {
      fixtureId: f.internal_fixture_id || f.external_fixture_id || null,
      date: f.scheduled_kickoff_at || null,
      opponent: teamName[opponentId] || null,
      home: !!f.is_home_fixture,
      season: m.season,
      competitionType: m.competition_type,
      started: m.started, substitute: m.substitute,
      unusedSubstitute: m.unused_substitute, appearance: m.appearance,
      goals: m.goals, ownGoals: m.own_goals,
      yellowCards: m.yellow_cards, redCards: m.red_cards,
      corrected: !!m.manually_corrected,
      // A match centre link only where a permanent page exists.
      matchCentre: f.internal_fixture_id ? '/match.html?id=' + encodeURIComponent(f.internal_fixture_id) : null,
    };
  }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  return {
    id: p.id,
    slug: p.public_slug,
    name: p.display_name || p.canonical_name,
    clubPlayerId: p.club_player_id,
    // Portraits and biographies are the club's, not the provider's. Only what
    // the club has approved appears.
    portrait: p.approved_portrait || null,
    bio: p.approved_bio || null,
    seasons: bySeason,
    currentSeason: bySeason[season] || null,
    matches: games,
  };
}

/**
 * The identity review queue: everything a human has to decide.
 * Portal only — it names real people the system is unsure about.
 */
/**
 * The review queue, with the evidence a person needs to decide.
 *
 * A bare list of names is not a decision aid — it asks the committee to
 * confirm identities from a string. This adds what the matches actually show:
 * how often the name appeared, whether it started, what is provisionally
 * attached to it, and whether the same name exists at another club.
 */
async function reviewQueueDetailed(limit) {
  const base = await reviewQueue(limit);
  if (!base.length) return base;
  const ids = base.map((p) => p.id);
  const [stats, lineups, teams] = await Promise.all([
    S.rest('football_player_match_stats?player_id=in.(' + ids.join(',') +
      ')&select=player_id,started,substitute,unused_substitute,appearance,goals,' +
      'own_goals,yellow_cards,red_cards,season'),
    S.rest('football_lineup_players?player_id=in.(' + ids.join(',') +
      ')&select=player_id,lineup_role,created_at'),
    S.rest('football_players?id=in.(' + ids.join(',') + ')&select=id,canonical_name,current_team_id'),
  ]);
  const byPlayer = {};
  (stats || []).forEach((r) => {
    const a = byPlayer[r.player_id] || (byPlayer[r.player_id] = {
      matches: 0, starts: 0, subs: 0, unused: 0, goals: 0, ownGoals: 0, yellows: 0, reds: 0 });
    if (r.appearance) a.matches++;
    if (r.started) a.starts++;
    if (r.substitute) a.subs++;
    if (r.unused_substitute) a.unused++;
    a.goals += r.goals || 0; a.ownGoals += r.own_goals || 0;
    a.yellows += r.yellow_cards || 0; a.reds += r.red_cards || 0;
  });
  const seen = {};
  (lineups || []).forEach((l) => {
    const s2 = seen[l.player_id] || (seen[l.player_id] = { first: null, last: null, listed: 0 });
    s2.listed++;
    if (!s2.first || l.created_at < s2.first) s2.first = l.created_at;
    if (!s2.last || l.created_at > s2.last) s2.last = l.created_at;
  });
  // The same name at another club is the trap this whole gate exists for.
  const nameCount = {};
  (teams || []).forEach((t) => {
    const k = require('../fwp/normalise').playerKey(t.canonical_name);
    (nameCount[k] = nameCount[k] || []).push(t.current_team_id);
  });

  return base.map((p) => {
    const key = require('../fwp/normalise').playerKey(p.name);
    const elsewhere = (nameCount[key] || []).filter((t) => String(t) !== String(p.teamId));
    return Object.assign({}, p, {
      evidence: byPlayer[p.id] || { matches: 0, starts: 0, subs: 0, unused: 0,
        goals: 0, ownGoals: 0, yellows: 0, reds: 0 },
      listed: (seen[p.id] || {}).listed || 0,
      firstSeen: (seen[p.id] || {}).first || p.since,
      lastSeen: (seen[p.id] || {}).last || p.since,
      sameNameAtAnotherClub: elsewhere.length > 0,
    });
  });
}

async function reviewQueue(limit) {
  const players = await S.rest('football_players?identity_status=in.' +
    '(provisional,name_at_another_club,duplicate_candidate,unresolved)' +
    '&merged_into_id=is.null&select=id,canonical_name,current_team_id,identity_status,' +
    'club_player_id,created_at&order=created_at.desc&limit=' + (limit || 200)) || [];
  const teams = await S.rest('football_teams?select=id,canonical_name,is_rayners_lane') || [];
  const teamById = {};
  teams.forEach((t) => { teamById[t.id] = t; });
  return players.map((p) => ({
    id: p.id,
    name: p.canonical_name,
    teamId: p.current_team_id,
    team: (teamById[p.current_team_id] || {}).canonical_name || null,
    ours: !!(teamById[p.current_team_id] || {}).is_rayners_lane,
    status: p.identity_status,
    clubPlayerId: p.club_player_id,
    since: p.created_at,
  }));
}

/**
 * The season's record for our confirmed players, keyed by the club's own roster
 * id, so the squad page can overlay it onto data/players.json without this
 * function needing to know what the squad is. The roster stays the club's.
 */
async function statsByClubPlayer(seasonLabel, scope) {
  const season = seasonLabel || SEASON;
  const teamId = await ourTeamId();
  if (!teamId) return {};
  const players = await S.rest('football_players?current_team_id=eq.' + teamId +
    '&identity_status=eq.confirmed&merged_into_id=is.null' +
    '&select=id,club_player_id,public_slug,identity_status,merged_into_id') || [];
  const withClubId = players.filter((p) => p.club_player_id && ID.isPublic(p));
  if (!withClubId.length) return {};
  const totals = await S.rest('football_player_season_stats?season=eq.' +
    encodeURIComponent(season) + '&scope=eq.' + (scope || 'all') +
    '&player_id=in.(' + withClubId.map((p) => p.id).join(',') + ')&select=*') || [];
  const byPlayer = {};
  totals.forEach((t) => { byPlayer[t.player_id] = t; });
  const out = {};
  withClubId.forEach((p) => {
    out[p.club_player_id] = Object.assign(
      { playerPage: '/player.html?p=' + p.public_slug }, shapeTotals(byPlayer[p.id]));
  });
  return out;
}

module.exports = { squad, playerDetail, reviewQueue, reviewQueueDetailed, shapeTotals, ourTeamId, statsByClubPlayer };
