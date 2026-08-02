// GATE 7 — what a player actually did in a match.
//
// Everything public about a player's season is derived here, from the line-up
// and the timeline. Nothing is counted twice, nothing is guessed, and where the
// evidence will not support a number the number is withheld rather than
// estimated.
//
// Three rules the club's records depend on:
//
//   AN UNUSED SUBSTITUTE HAS NOT PLAYED. Being named is not an appearance.
//
//   AN OWN GOAL IS NOT A GOAL FOR THE SCORER. Harry Bonner's own goal counts on
//   Rayners Lane's scoreline; he is a Wallingford player and it is not a
//   Rayners Lane goal for him, nor a goal for him at all.
//
//   A STARTER WHO LEAVES THE PITCH STILL STARTED. Substituted, sent off, or
//   simply no longer carrying the provider's "playing" class — all started.
//
// Pure. No network, no database, no clock.
'use strict';

var CONF = {
  PROVIDER: 'provider_confirmed',
  HIGH: 'system_derived_high',
  PARTIAL: 'system_derived_partial',
  NONE: 'unavailable',
};

/**
 * One player's participation in one match.
 *
 * @param {Object} p line-up row {name, role, enteredMinute, exitedMinute, isCaptain}
 * @param {Array}  events attributed events for the fixture
 * @param {Object} ctx {side, fullTimeMinute, abandoned}
 */
function forPlayer(p, events, ctx) {
  var c = ctx || {};
  var key = norm(p.name);
  var mine = (events || []).filter(function (e) { return norm(e.player) === key; });

  var started = p.role === 'starter';
  var namedSub = p.role === 'substitute' || p.role === 'unused';
  var used = started || p.enteredMinute != null;

  // A dismissal ends a player's match wherever it happened.
  var red = mine.filter(function (e) { return e.type === 'red_card'; })[0] || null;
  var dismissedMinute = red ? absMinute(red) : null;

  var out = {
    name: p.name,
    side: c.side || null,
    listed: true,
    started: started,
    substitute: namedSub && p.enteredMinute != null,
    unusedSubstitute: namedSub && p.enteredMinute == null && !started,
    appearance: used,
    isCaptain: !!p.isCaptain,
    enteredMinute: p.enteredMinute == null ? null : p.enteredMinute,
    exitedMinute: p.exitedMinute == null ? null : p.exitedMinute,
    dismissedMinute: dismissedMinute,

    // Goals credited to this player. An own goal is recorded separately and is
    // never added to his goals — it is not a goal he scored for anyone.
    goals: mine.filter(function (e) {
      return (e.type === 'goal' || e.type === 'penalty_goal') && !e.ownGoal;
    }).length,
    ownGoals: mine.filter(function (e) { return e.type === 'own_goal' || e.ownGoal; }).length,
    yellowCards: mine.filter(function (e) { return e.type === 'yellow_card'; }).length,
    redCards: red ? 1 : 0,
  };

  // A second booking IS a dismissal, but only count one red.
  if (!red && out.yellowCards >= 2) {
    out.redCards = 1;
    out.secondYellow = true;
  }

  var m = minutes(out, c);
  out.minutesPlayed = m.value;
  out.minutesConfidence = m.confidence;
  return out;
}

/** "45+3" is the 45th minute plus stoppage — not the 48th. */
function absMinute(e) {
  if (!e || e.minute == null) return null;
  return e.minute;      // stoppage is kept separately; it does not extend the clock
}

function norm(s) {
  return String(s || '')
    .replace(/\s*\((?:c|gk|capt|captain|vc)\)\s*$/i, '')
    .toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ').trim();
}

/**
 * Minutes played, with an honest confidence.
 *
 * Withheld rather than estimated whenever the evidence is incomplete: a squad
 * page that says "63 minutes" when it is really guessing is worse than one that
 * says nothing. Appearances and starts can still be shown.
 */
function minutes(pp, ctx) {
  var full = ctx && ctx.fullTimeMinute != null ? ctx.fullTimeMinute : 90;
  if (ctx && ctx.abandoned) return { value: null, confidence: CONF.NONE };
  if (!pp.appearance) return { value: 0, confidence: CONF.PROVIDER };

  var start = pp.started ? 0 : pp.enteredMinute;
  var end = pp.dismissedMinute != null ? pp.dismissedMinute
    : (pp.exitedMinute != null ? pp.exitedMinute : full);

  if (start == null) return { value: null, confidence: CONF.NONE };
  // A substitution with no recorded minute cannot yield a defensible figure.
  if (!pp.started && pp.enteredMinute == null) return { value: null, confidence: CONF.NONE };
  if (end < start) return { value: null, confidence: CONF.NONE };

  var value = end - start;
  // Exact where both ends are known events; partial where full time was assumed.
  var exact = (pp.started || pp.enteredMinute != null) &&
    (pp.dismissedMinute != null || pp.exitedMinute != null);
  return { value: value, confidence: exact ? CONF.HIGH : CONF.PARTIAL };
}

/** Every player in one fixture, both sides. */
function forFixture(lineups, events, ctx) {
  var c = ctx || {};
  var out = [];
  ['home', 'away'].forEach(function (side) {
    var l = lineups && lineups[side];
    if (!l || !l.players) return;
    l.players.forEach(function (p) {
      out.push(forPlayer(p, events, { side: side, fullTimeMinute: c.fullTimeMinute, abandoned: c.abandoned }));
    });
  });
  return out;
}

/**
 * Season totals.
 *
 * Recomputed from participation records every time — never incremented. A "+1"
 * counter becomes permanently wrong the moment an event is corrected, and no
 * amount of later syncing repairs it.
 */
function aggregate(records, opts) {
  var o = opts || {};
  var rows = records.filter(function (r) {
    if (o.season && r.season !== o.season) return false;
    if (o.competitionType && r.competitionType !== o.competitionType) return false;
    if (o.competitionTypes && o.competitionTypes.indexOf(r.competitionType) < 0) return false;
    if (o.excludeFriendlies && r.competitionType === 'friendly') return false;
    if (o.teamId != null && String(r.teamId) !== String(o.teamId)) return false;
    return true;
  });

  var by = {};
  rows.forEach(function (r) {
    // A registry id identifies a person. Without one, a name identifies a person
    // only WITHIN a club — two clubs' John Smiths are two people, and grouping
    // them together would hand one of them the other's goals.
    var k = r.playerId != null ? 'id:' + r.playerId
      : 'name:' + (r.teamId == null ? '' : r.teamId) + '|' + (r.playerKey || norm(r.name));
    var a = by[k] || (by[k] = {
      key: k, name: r.name, playerId: r.playerId == null ? null : r.playerId,
      teamId: r.teamId == null ? null : r.teamId,
      appearances: 0, starts: 0, substituteAppearances: 0, unusedSubstitute: 0,
      goals: 0, ownGoals: 0, yellowCards: 0, redCards: 0,
      minutesPlayed: 0, minutesConfidence: CONF.PROVIDER, fixtures: [],
    });
    if (r.appearance) a.appearances++;
    if (r.started) a.starts++;
    if (r.substitute) a.substituteAppearances++;
    if (r.unusedSubstitute) a.unusedSubstitute++;
    a.goals += r.goals || 0;
    a.ownGoals += r.ownGoals || 0;
    a.yellowCards += r.yellowCards || 0;
    a.redCards += r.redCards || 0;
    a.fixtures.push(r.fixtureId);

    // Total minutes are only as trustworthy as the weakest match in them.
    if (r.minutesPlayed == null) a.minutesConfidence = CONF.NONE;
    else {
      a.minutesPlayed += r.minutesPlayed;
      if (r.minutesConfidence === CONF.PARTIAL && a.minutesConfidence !== CONF.NONE) {
        a.minutesConfidence = CONF.PARTIAL;
      }
    }
  });

  return Object.keys(by).map(function (k) {
    var a = by[k];
    if (a.minutesConfidence === CONF.NONE) a.minutesPlayed = null;
    return a;
  }).sort(function (x, y) {
    return (y.goals - x.goals) || (y.appearances - x.appearances) || x.name.localeCompare(y.name);
  });
}

module.exports = { CONF, forPlayer, forFixture, aggregate, minutes, norm };
