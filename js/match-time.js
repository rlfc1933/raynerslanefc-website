/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — match time, in one place

   A fixture is a moment, not a string. "2026-08-01 15:00" means three o'clock
   in Harrow, and it means the same instant whether you are reading it in
   Rayners Lane, Los Angeles or Sydney.

   THE BUG THIS EXISTS TO KILL
   The homepage countdown did `new Date('2026-08-01T15:00:00')`. That string has
   no offset, so ECMAScript parses it in the VIEWER'S timezone. In Los Angeles
   it became 15:00 PDT — 22:00 UTC — eight hours after the real kick-off. A
   supporter in California was shown "starts in 7 hours" while the team were
   playing the second half at Tithe Farm.

   THE RULE
   Fixture date + fixture time are interpreted in Europe/London and converted to
   ONE absolute UTC instant. Every browser then compares Date.now() against that
   same number. The viewer's timezone may only affect optional display text such
   as "7:00 AM your time" — never the countdown and never the match state.

   BST/GMT is handled by the Europe/London zone itself. There is deliberately no
   "UK is UTC+1 in summer" rule anywhere in this file; that hand-rolled shortcut
   is wrong twice a year.
   ════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MatchTime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CLUB_TZ = 'Europe/London';

  /** Europe/London's offset from UTC, in ms, at a given instant. */
  function zoneOffsetAt(utcMs, tz) {
    var dtf = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || CLUB_TZ, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    var p = {};
    dtf.formatToParts(new Date(utcMs)).forEach(function (x) { p[x.type] = x.value; });
    var wall = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
    return wall - utcMs;
  }

  /**
   * "2026-08-01" + "15:00" (club time) → absolute UTC epoch ms.
   * Returns NaN for anything incomplete or unparseable — callers must treat NaN
   * as "we do not know", never as "now" and never as zero.
   */
  function parseLondonKickoff(dateStr, timeStr) {
    if (!dateStr) return NaN;
    var d = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!d) return NaN;
    var t = String(timeStr == null || timeStr === '' ? '15:00' : timeStr).trim().match(/^(\d{1,2}):(\d{2})/);
    if (!t) return NaN;
    var y = +d[1], mo = +d[2], da = +d[3], hh = +t[1], mi = +t[2];
    if (mo < 1 || mo > 12 || da < 1 || da > 31 || hh > 23 || mi > 59) return NaN;
    var wall = Date.UTC(y, mo - 1, da, hh, mi, 0);
    // Two passes: the offset depends on the instant, and the instant depends on
    // the offset. One pass is wrong for a kick-off within an hour of a clock
    // change; two settles it.
    var guess = wall - zoneOffsetAt(wall);
    guess = wall - zoneOffsetAt(guess);
    return guess;
  }

  /** Accepts a fixture record from data/fixtures.json (or matchday.json). */
  function kickoffEpoch(fixture) {
    if (!fixture) return NaN;
    if (fixture.kickoffEpoch != null && isFinite(fixture.kickoffEpoch)) return +fixture.kickoffEpoch;
    // The registry's own field, and the one every surface should be reading.
    // Absolute, so there is nothing to interpret and nothing to get wrong.
    if (fixture.kickoffAt) {
      var reg = Date.parse(fixture.kickoffAt);
      if (!isNaN(reg)) return reg;
    }
    // A stored timestamptz from Supabase is already absolute — trust it.
    if (fixture.scheduled_kickoff) {
      var abs = Date.parse(fixture.scheduled_kickoff);
      if (!isNaN(abs)) return abs;
    }
    var date = fixture.date || '';
    var time = fixture.kickoff || fixture.kickoff_time || '';
    // A combined "2026-08-01T15:00:00" with NO offset is club time, not local.
    if (!time && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(date)) {
      if (/[Zz]|[+-]\d{2}:?\d{2}$/.test(date)) return Date.parse(date);  // explicit offset: absolute
      var parts = date.split('T');
      return parseLondonKickoff(parts[0], parts[1].slice(0, 5));
    }
    return parseLondonKickoff(String(date).slice(0, 10), time);
  }

  /* ── temporal state ──────────────────────────────────────────────────────
     Priority, highest first:
       1. a trusted live source (Football Web Pages via our own database)
       2. a confirmed internal live state
       3. time-based inference from the kick-off instant
       4. pre-match countdown
     A trusted source saying "second half" must beat any clock arithmetic — and
     a countdown must never appear once a trusted source says the game is on. */
  var LIVE_PERIODS = ['first_half', 'half_time', 'second_half', 'extra_time', 'penalties', 'in_play'];

  function temporalState(fixture, live, nowMs) {
    var now = nowMs == null ? Date.now() : nowMs;
    var ko = kickoffEpoch(fixture);

    if (live) {
      var p = live.period;
      if (p === 'postponed' || p === 'cancelled' || p === 'abandoned' || p === 'delayed') {
        return { state: p, showCountdown: false, kickoff: ko, source: 'live' };
      }
      if (live.is_final || p === 'full_time') {
        return { state: 'full_time', showCountdown: false, kickoff: ko, source: 'live' };
      }
      if (live.is_live || LIVE_PERIODS.indexOf(p) !== -1) {
        return {
          state: 'live', period: p, showCountdown: false, kickoff: ko, source: 'live',
          minute: live.match_minute, stoppage: live.stoppage_minute,
        };
      }
    }

    if (!isFinite(ko)) return { state: 'unknown', showCountdown: false, kickoff: NaN, source: 'none' };

    if (now < ko) return { state: 'upcoming', showCountdown: true, kickoff: ko, msToKickoff: ko - now, source: 'clock' };

    // Kick-off has passed but nothing trustworthy has reported. Say so plainly
    // rather than inventing a live match or running the countdown negative.
    var since = now - ko;
    if (since < 15 * 60000) return { state: 'kickoff_due', showCountdown: false, kickoff: ko, source: 'clock' };
    if (since < 150 * 60000) return { state: 'awaiting_update', showCountdown: false, kickoff: ko, source: 'clock' };
    return { state: 'ended_unknown', showCountdown: false, kickoff: ko, source: 'clock' };
  }

  /** Never negative; returns null once the moment has passed. */
  function formatCountdown(targetMs, nowMs) {
    var now = nowMs == null ? Date.now() : nowMs;
    if (!isFinite(targetMs)) return null;
    var diff = targetMs - now;
    if (diff <= 0) return null;
    return {
      total: diff,
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
    };
  }

  function fmt(epoch, tz, opts) {
    if (!isFinite(epoch)) return '';
    return new Intl.DateTimeFormat('en-GB',
      Object.assign({ timeZone: tz }, opts)).format(new Date(epoch));
  }

  /** The official time. This is what the club published. */
  function formatKickoffClub(epoch) {
    return fmt(epoch, CLUB_TZ, { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  function formatDateClub(epoch) {
    return fmt(epoch, CLUB_TZ, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  /** Optional, supporting information only — never the official time. */
  function formatKickoffViewer(epoch) {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(epoch));
  }
  function viewerZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
  }
  /** True when the viewer is somewhere the club time would confuse them. */
  function viewerDiffersFromClub(epoch) {
    if (!isFinite(epoch)) return false;
    try {
      var here = new Date(epoch).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
      return here !== formatKickoffClub(epoch);
    } catch (e) { return false; }
  }

  /** Sort key for fixtures — absolute, so ordering cannot vary by viewer. */
  function fixtureSortKey(fixture) {
    var k = kickoffEpoch(fixture);
    return isFinite(k) ? k : Number.MAX_SAFE_INTEGER;
  }

  /* ── IS THIS GAME ACTUALLY GOING TO BE PLAYED? ───────────────────────────
     A fixture that has been called off still has no score, and "no score yet"
     was the only test the homepage and the Club Now panel applied when picking
     the next match. So the night Hilltop was postponed, the front page went on
     counting down to a game that was not happening — 7.45pm Tuesday, directions,
     add to calendar, the lot.

     The status was already modelled (matchday-core lists scheduled, played,
     postponed, cancelled, abandoned) and Match Centre and the JSON-LD already
     honoured it. Only the "what's next" logic did not, so a postponement could
     be recorded correctly and still be advertised.

     One rule, in the one module both callers already share. */
  var OFF_STATUSES = ['postponed', 'cancelled', 'abandoned', 'void'];

  function isCalledOff(fixture) {
    var s = String((fixture && fixture.status) || '').toLowerCase();
    return OFF_STATUSES.indexOf(s) > -1;
  }

  /**
   * A fixture the club is still expecting to play: no result recorded, and not
   * called off. This is what "next match", countdowns and match-day arming must
   * filter on — never "has no score".
   */
  function isPlayable(fixture) {
    if (!fixture) return false;
    if (fixture.us != null && fixture.them != null) return false;   // already played
    return !isCalledOff(fixture);
  }

  return {
    CLUB_TZ: CLUB_TZ,
    zoneOffsetAt: zoneOffsetAt,
    parseLondonKickoff: parseLondonKickoff,
    kickoffEpoch: kickoffEpoch,
    temporalState: temporalState,
    formatCountdown: formatCountdown,
    formatKickoffClub: formatKickoffClub,
    formatDateClub: formatDateClub,
    formatKickoffViewer: formatKickoffViewer,
    viewerZone: viewerZone,
    viewerDiffersFromClub: viewerDiffersFromClub,
    fixtureSortKey: fixtureSortKey,
    isPlayable: isPlayable,
    isCalledOff: isCalledOff,
    OFF_STATUSES: OFF_STATUSES,
    LIVE_PERIODS: LIVE_PERIODS,
  };
});
