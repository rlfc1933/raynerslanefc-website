// GATE 7 — resolving a provider string to a person.
//
// This file is allowed to PROPOSE. It is never allowed to DECIDE.
//
// The distinction matters because the failure it prevents is invisible. If a
// pipeline quietly merges "J Smith" onto John Smith and it is the wrong Smith,
// nothing breaks, no error is logged, and the club's record of who played is
// simply wrong from then on. The only signal is a player one day noticing his
// appearance count is short — by which time three seasons have been built on it.
//
// So:
//   • An EXACT key match inside the SAME club is a match. Nothing else is.
//   • Everything looser is a suggestion carrying its reason, for a human.
//   • Nothing crosses a club boundary. Ever. Two clubs' J Smiths are two people
//     until somebody who knows them both says otherwise.
//   • A suggestion a human has rejected is never offered again.
//
// Pure functions: no network, no database, no clock.
'use strict';

var N = require('../fwp/normalise');

var STATUS = {
  CONFIRMED: 'confirmed',
  PROVISIONAL: 'provisional',
  UNRESOLVED: 'unresolved',
  NAME_ELSEWHERE: 'name_at_another_club',
  DUPLICATE: 'duplicate_candidate',
  REJECTED: 'rejected',
};

/**
 * The keys a name could reasonably be filed under, strongest first.
 *
 * Only the first is ever used to MATCH. The rest exist so a human can be shown
 * "this might be the same person" without the machine acting on it.
 */
function variantKeys(name) {
  var key = N.playerKey(name);
  if (!key) return [];
  var out = [key];
  var parts = key.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    var surname = parts[parts.length - 1];
    var first = parts[0];
    // "j smith" ↔ "john smith". A suggestion, never a match: initials are the
    // single most common way two different people collapse into one record.
    out.push(first.charAt(0) + ' ' + surname);
    // Middle names come and go between team sheets.
    if (parts.length > 2) out.push(first + ' ' + surname);
  }
  return out.filter(function (k, i) { return out.indexOf(k) === i; });
}

/** Has a human already ruled this pairing out? */
function isRejected(rejections, normalised, teamId, clubPlayerId) {
  return (rejections || []).some(function (r) {
    return r.normalised === normalised
      && (r.team_id == null || String(r.team_id) === String(teamId))
      && (clubPlayerId == null || r.club_player_id == null
          || r.club_player_id === clubPlayerId);
  });
}

/**
 * Resolve one provider name.
 *
 * ctx.index          { 'teamId|key': player }  existing registry records
 * ctx.roster         [{ id, name }]            data/players.json, OUR players
 * ctx.ourTeamId      the Rayners Lane team id
 * ctx.rejections     rows a human has ruled out
 *
 * Returns { status, playerId, action, reason, suggestions[] }.
 */
function resolve(providerName, teamId, ctx) {
  ctx = ctx || {};
  var index = ctx.index || {};
  var key = N.playerKey(providerName);

  if (!key || key.length < 2) {
    return {
      status: STATUS.UNRESOLVED, playerId: null, action: 'skip',
      reason: 'no usable name in "' + String(providerName) + '"', suggestions: [],
    };
  }

  // ── the only automatic match ──────────────────────────────────────────────
  var exact = index[teamId + '|' + key];
  if (exact) {
    return {
      status: exact.identity_status || STATUS.PROVISIONAL,
      playerId: exact.id, action: 'match', key: key,
      reason: 'exact name match within the same club', suggestions: [],
    };
  }

  var suggestions = [];

  // ── the club's own roster ─────────────────────────────────────────────────
  // Only ever consulted for OUR side. An exact match against a player the club
  // has actually registered is the strongest suggestion this file can make —
  // and it is still only a suggestion, because it is the club's record of a
  // person and only the club can confirm it.
  var isOurs = ctx.ourTeamId != null && String(teamId) === String(ctx.ourTeamId);
  if (isOurs) {
    var variants = variantKeys(providerName);
    (ctx.roster || []).forEach(function (rp) {
      var rkeys = variantKeys(rp.name);
      var strength = null;
      if (rkeys[0] === key) strength = 'exact';
      else if (rkeys.some(function (k) { return variants.indexOf(k) >= 0; })) strength = 'variant';
      if (!strength) return;
      if (isRejected(ctx.rejections, key, teamId, rp.id)) return;
      suggestions.push({
        type: 'club_player', clubPlayerId: rp.id, name: rp.name,
        strength: strength,
        reason: strength === 'exact'
          ? 'the club has a registered player with exactly this name'
          : 'the club has a registered player whose name could be written this way',
      });
    });
  }

  // ── the same name at a different club ─────────────────────────────────────
  // A real occurrence and a real trap. Surfaced so a human sees it; never acted
  // on, because a shared name across two clubs is evidence of nothing.
  var elsewhere = Object.keys(index)
    .filter(function (k) { return k.slice(k.indexOf('|') + 1) === key; })
    .map(function (k) { return index[k]; });
  if (elsewhere.length) {
    return {
      status: STATUS.NAME_ELSEWHERE, playerId: null, action: 'create_flagged', key: key,
      reason: 'this exact name already belongs to a player at another club',
      suggestions: suggestions.concat(elsewhere.map(function (p) {
        return {
          type: 'other_club_player', playerId: p.id, name: p.canonical_name,
          teamId: p.current_team_id, strength: 'name_only',
          reason: 'same name, different club — almost certainly a different person',
        };
      })),
    };
  }

  // Same club, a name that could be the same person written differently.
  var nearby = Object.keys(index)
    .filter(function (k) { return k.slice(0, k.indexOf('|')) === String(teamId); })
    .map(function (k) { return index[k]; })
    .filter(function (p) {
      var pk = variantKeys(p.canonical_name);
      var vk = variantKeys(providerName);
      return pk[0] !== vk[0] && pk.some(function (x) { return vk.indexOf(x) >= 0; });
    });
  nearby.forEach(function (p) {
    if (isRejected(ctx.rejections, key, teamId, null)) return;
    suggestions.push({
      type: 'same_club_player', playerId: p.id, name: p.canonical_name,
      strength: 'variant',
      reason: 'same club, a name that could be the same person written differently',
    });
  });

  return {
    status: STATUS.PROVISIONAL, playerId: null,
    action: suggestions.length ? 'create_with_suggestions' : 'create',
    key: key,
    reason: suggestions.length
      ? 'new to the registry, with candidates for a human to check'
      : 'new to the registry',
    suggestions: suggestions,
  };
}

/**
 * Records at the SAME club that might be one person.
 *
 * Deliberately never spans clubs, and deliberately never merges: it produces a
 * review list. Merging is a human action with an audit row behind it.
 */
function duplicateCandidates(players) {
  var byTeam = {};
  (players || []).forEach(function (p) {
    var t = String(p.current_team_id);
    (byTeam[t] = byTeam[t] || []).push(p);
  });
  var out = [];
  Object.keys(byTeam).forEach(function (t) {
    var list = byTeam[t];
    for (var i = 0; i < list.length; i++) {
      for (var j = i + 1; j < list.length; j++) {
        var a = list[i], b = list[j];
        if (a.merged_into_id || b.merged_into_id) continue;
        var ka = variantKeys(a.canonical_name), kb = variantKeys(b.canonical_name);
        if (ka[0] === kb[0]) {
          out.push({ teamId: t, a: a.id, b: b.id, strength: 'exact',
            reason: 'two records with exactly the same name at the same club' });
        } else if (ka.some(function (x) { return kb.indexOf(x) >= 0; })) {
          out.push({ teamId: t, a: a.id, b: b.id, strength: 'variant',
            reason: 'two records at the same club whose names could be one person' });
        }
      }
    }
  });
  return out;
}

/**
 * What a confirm decision writes.
 *
 * A record becomes publicly addressable only here, only when a person is
 * attached, and only with somebody's name against the decision.
 */
function confirmPatch(player, clubPlayerId, decidedBy, note) {
  if (!clubPlayerId) throw new Error('confirming needs the club player it refers to');
  if (!decidedBy) throw new Error('confirming needs the name of whoever decided it');
  return {
    identity_status: STATUS.CONFIRMED,
    club_player_id: clubPlayerId,
    public_slug: N.slug(player.canonical_name),
    identity_decided_by: decidedBy,
    identity_decided_at: new Date().toISOString(),
    identity_note: note || null,
    merged_into_id: null,
  };
}

/**
 * What a merge writes. The losing record is kept and pointed at the winner —
 * never deleted, because archived line-ups reference it and an archive is not
 * rewritten to tidy up the present.
 */
function mergePatch(loser, winnerId, decidedBy, note) {
  if (!winnerId) throw new Error('merging needs a record to merge into');
  if (String(loser.id) === String(winnerId)) throw new Error('a record cannot be merged into itself');
  if (!decidedBy) throw new Error('merging needs the name of whoever decided it');
  return {
    merged_into_id: winnerId,
    identity_status: STATUS.REJECTED,
    public_slug: null,                 // one person, one public page
    identity_decided_by: decidedBy,
    identity_decided_at: new Date().toISOString(),
    identity_note: note || null,
  };
}

/** Follow a merge chain to the record that survived. */
function canonicalId(playerId, byId, depth) {
  depth = depth || 0;
  var p = byId[playerId];
  if (!p || !p.merged_into_id || depth > 10) return playerId;
  return canonicalId(p.merged_into_id, byId, depth + 1);
}

/** Is this record allowed a public page? */
function isPublic(player) {
  return !!player && player.identity_status === STATUS.CONFIRMED
    && !player.merged_into_id && !!player.public_slug;
}

module.exports = {
  STATUS, variantKeys, resolve, duplicateCandidates,
  confirmPatch, mergePatch, canonicalId, isPublic, isRejected,
};
