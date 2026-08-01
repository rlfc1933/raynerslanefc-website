// GATE 3 — turning a parsed provider match into registry rows.
//
// Two different jobs, treated differently on purpose:
//
//   LINE-UPS and PLAYERS are genuinely new. Nothing in production stores them,
//   so this gate writes them for real.
//
//   MATCH STATE and EVENTS already exist and work — match_state / match_events
//   carried a live match this afternoon. This gate does NOT write a second copy.
//   It builds what it *would* have written and compares, so parity can be proved
//   before anything migrates. Two systems writing a score on a Saturday is the
//   failure this whole architecture exists to prevent.
//
// Pure functions. No network, no database.
'use strict';

const N = require('../fwp/normalise');

/* ── identity ─────────────────────────────────────────────────────────────
   A provider name is not a person. Two players can share a name and one player
   can be spelled six ways, so a name resolves to an existing player only on an
   exact key match within the same club. Anything else becomes a NEW provisional
   record for a human to confirm or merge — never an automatic merge onto
   somebody who happens to look similar. */
function resolvePlayer(providerName, teamId, index) {
  const key = N.playerKey(providerName);
  if (!key) return { player: null, status: 'unusable', key: key };
  const hit = index[teamId + '|' + key];
  if (hit) return { player: hit, status: 'matched', key: key };

  // Same name, different club — a real occurrence, and a real trap.
  const elsewhere = Object.keys(index)
    .filter((k) => k.slice(k.indexOf('|') + 1) === key)
    .map((k) => index[k]);
  if (elsewhere.length) {
    return { player: null, status: 'name_used_at_another_club', key: key, candidates: elsewhere };
  }
  return { player: null, status: 'new', key: key };
}

/** Line-up rows for one side, in the order the provider listed them. */
function lineupRows(parsed, side, teamId, playerIndex) {
  const squad = (side === 'home' ? parsed.home.lineUp : parsed.away.lineUp) || [];
  const unresolved = [];
  const rows = squad.map((p, i) => {
    const r = resolvePlayer(p.name, teamId, playerIndex);
    if (r.status !== 'matched') unresolved.push({ name: p.name, key: r.key, status: r.status, teamId: teamId });
    return {
      player_id: r.player ? r.player.id : null,
      provider_player_name: p.name,
      shirt_number: p.number || null,
      // The provider marks the used starters with class="playing"; unused subs
      // and a sent-off player carry no class at all.
      lineup_role: p.role === 'playing' ? 'starter' : 'substitute',
      is_captain: !!p.isCaptain,
      is_goalkeeper: !!p.isKeeper,
      sort_order: i,
      _externalPlayerId: p.externalPlayerId || null,
    };
  });
  return { rows, unresolved };
}

/**
 * The match_state row this gate WOULD write. Built for comparison only.
 * Deliberately the same shape the live system uses, so a diff is meaningful.
 */
function stateRow(parsed) {
  return {
    home_team: parsed.home.name,
    away_team: parsed.away.name,
    home_score: parsed.homeScore,
    away_score: parsed.awayScore,
    period: parsed.period,
    match_minute: parsed.matchMinute,
    stoppage_minute: parsed.stoppageMinute,
    is_live: parsed.isLive,
    is_final: parsed.isFinal,
    referee: parsed.referee || null,
    venue: parsed.venue || null,
    competition: parsed.competition || null,
  };
}

/** The event rows this gate would write, keyed the same way the live one is. */
function eventRows(fixtureRef, parsed, eventKey) {
  return parsed.events.map((e) => {
    let type = e.type;
    if (type === 'goal' && e.ownGoal) type = 'own_goal';
    if (type === 'goal' && e.penalty) type = 'penalty_goal';
    return {
      event_type: type,
      side: e.side || null,
      team: e.team || null,
      player: e.player || null,
      related_player: e.assistant || null,
      minute: e.minute,
      stoppage_minute: e.stoppage || 0,
      own_goal: !!e.ownGoal,
      card_colour: type === 'yellow_card' ? 'yellow' : (type === 'red_card' ? 'red' : null),
      dedupe_key: eventKey(fixtureRef, e),
    };
  });
}

/* ── shadow comparison ─────────────────────────────────────────────────────
   The whole point of the gate: does the new pipeline agree with the system
   already running in production? Anything reported here must be understood
   before a consumer is migrated. */
function compareState(liveRow, shadowRow) {
  if (!liveRow) return [{ field: '*', live: null, shadow: 'present', note: 'no live row to compare' }];
  const fields = ['home_team', 'away_team', 'home_score', 'away_score',
    'period', 'match_minute', 'stoppage_minute', 'is_live', 'is_final'];
  const diffs = [];
  for (const f of fields) {
    const a = liveRow[f], b = shadowRow[f];
    // null and undefined mean the same thing here; 0 does not equal null.
    const same = (a === b) || (a == null && b == null);
    if (!same) diffs.push({ field: f, live: a, shadow: b });
  }
  return diffs;
}

function compareEvents(liveRows, shadowRows) {
  const liveKeys = new Set((liveRows || []).filter((r) => !r.retracted_at).map((r) => r.dedupe_key));
  const shadowKeys = new Set(shadowRows.map((r) => r.dedupe_key));
  const onlyLive = [...liveKeys].filter((k) => !shadowKeys.has(k));
  const onlyShadow = [...shadowKeys].filter((k) => !liveKeys.has(k));
  return {
    liveCount: liveKeys.size,
    shadowCount: shadowKeys.size,
    onlyLive, onlyShadow,
    identical: onlyLive.length === 0 && onlyShadow.length === 0,
  };
}

module.exports = {
  resolvePlayer, lineupRows, stateRow, eventRows,
  compareState, compareEvents,
};
