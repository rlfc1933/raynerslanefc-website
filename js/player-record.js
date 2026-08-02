/* GATE 7 — the club's computed record of a player, for the pages that show it.
 *
 * data/players.json stays the owner of WHO is in the squad — name, number,
 * position, photograph. That is the club's to maintain and nothing here writes
 * to it. This adds only what the matches themselves say: appearances, goals,
 * cards, minutes.
 *
 * Two rules the pages built on this must keep:
 *
 *   A number that has not been established is shown as "–", never as 0. A zero
 *   is a claim — "he has played no games" — and it is a different statement
 *   from "the club has not counted".
 *
 *   Minutes are shown only where they are known. A season containing one match
 *   whose substitutions were never recorded has no defensible minutes total,
 *   so it does not get one.
 */
(function () {
  'use strict';

  var API = '/.netlify/functions/football-data';
  var cache = null;
  var detailCache = {};

  /** The season record for every confirmed player, keyed by data/players.json id. */
  function season() {
    if (cache) return cache;
    cache = fetch(API + '?what=squad')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.ok && j.players) ? j.players : {}; })
      // A missing record is not an error state for the page. The squad still
      // renders; it simply has no statistics beside it yet.
      .catch(function () { return {}; });
    return cache;
  }

  /** One player's full record. Only confirmed identities have one. */
  function detail(slug) {
    if (!slug) return Promise.resolve(null);
    if (detailCache[slug]) return detailCache[slug];
    detailCache[slug] = fetch(API + '?what=player&p=' + encodeURIComponent(slug))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.ok) ? j.player : null; })
      .catch(function () { return null; });
    return detailCache[slug];
  }

  /** Has anything actually been established about this player? */
  function hasRecord(s) {
    if (!s) return false;
    return (s.appearances || 0) > 0 || (s.goals || 0) > 0
      || (s.unusedSubstitute || 0) > 0 || (s.yellowCards || 0) > 0 || (s.redCards || 0) > 0;
  }

  /** A recorded number, or an em-dash. Never a fabricated nought. */
  function stat(v) {
    return (v == null) ? '–' : String(v);
  }

  /** Minutes, or nothing at all. */
  function minutes(s) {
    if (!s || !s.minutesKnown || s.minutes == null) return null;
    return s.minutes;
  }

  /** Plain English for a match row, in the club's voice. */
  function describe(m) {
    if (!m) return '';
    var bits = [];
    if (m.unusedSubstitute) bits.push('Unused substitute');
    else if (m.started) bits.push('Started');
    else if (m.substitute) bits.push('Substitute');
    if (m.goals === 1) bits.push('1 goal');
    else if (m.goals > 1) bits.push(m.goals + ' goals');
    if (m.ownGoals) bits.push(m.ownGoals > 1 ? m.ownGoals + ' own goals' : 'Own goal');
    if (m.redCards) bits.push('Sent off');
    else if (m.yellowCards) bits.push(m.yellowCards > 1 ? m.yellowCards + ' bookings' : 'Booked');
    return bits.join(' · ');
  }

  window.LaneRecord = {
    season: season, detail: detail,
    hasRecord: hasRecord, stat: stat, minutes: minutes, describe: describe,
  };
})();
