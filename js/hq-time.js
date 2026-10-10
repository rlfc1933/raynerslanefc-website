/* ════════════════════════════════════════════════════════════════════════
   LANE HQ — club time.

   Every "today", "tomorrow", "next match" and "overdue" in Staff HQ is a
   question about the calendar in Harrow, not about UTC and not about the
   laptop's own time zone. The old home page used toISOString(), so between
   midnight and 1am in summer it believed it was still yesterday, and it
   labelled a Saturday fixture "Today at the club" on the Friday evening.

   Pure functions, no DOM. Loaded in the browser as window.HQTime and in
   node:test through module.exports.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var TZ = 'Europe/London';
  var DAY = 86400000;

  var _ymd = null, _wd = null, _hm = null, _long = null;
  function fmt(kind) {
    if (kind === 'ymd') return _ymd || (_ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }));
    if (kind === 'wd') return _wd || (_wd = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }));
    if (kind === 'long') return _long || (_long = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }));
    return _hm || (_hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }));
  }

  function toMs(x) {
    if (x == null || x === '') return NaN;
    if (typeof x === 'number') return x;
    if (x instanceof Date) return x.getTime();
    var s = String(x);
    // A bare date is a club calendar day; noon UTC is the same day in London
    // all year round, so it can never slip across midnight.
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(s + 'T12:00:00Z');
    return Date.parse(s);
  }

  /** The club calendar day (YYYY-MM-DD) for an instant. */
  function londonDate(x) {
    var ms = x == null ? Date.now() : toMs(x);
    if (!isFinite(ms)) return '';
    return fmt('ymd').format(new Date(ms));
  }

  /** Whole calendar days from `fromDay` to `toDay` (both YYYY-MM-DD). */
  function dayDiff(fromDay, toDay) {
    var a = Date.parse(fromDay + 'T12:00:00Z'), b = Date.parse(toDay + 'T12:00:00Z');
    if (!isFinite(a) || !isFinite(b)) return NaN;
    return Math.round((b - a) / DAY);
  }

  /** "Today", "Tomorrow", "Yesterday", or "Sat 10 Oct". */
  function relativeDay(x, nowMs) {
    var d = londonDate(x), t = londonDate(nowMs == null ? Date.now() : nowMs);
    if (!d) return 'Date to be confirmed';
    var n = dayDiff(t, d);
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n === -1) return 'Yesterday';
    return fmt('wd').format(new Date(toMs(x)));
  }

  function shortDate(x) { var ms = toMs(x); return isFinite(ms) ? fmt('wd').format(new Date(ms)) : ''; }
  function longDate(x) { var ms = toMs(x); return isFinite(ms) ? fmt('long').format(new Date(ms)) : ''; }
  function clock(x) { var ms = toMs(x); return isFinite(ms) ? fmt('hm').format(new Date(ms)) : ''; }

  /**
   * How a fixture's kick-off should read. When the registry says the time is
   * not confirmed (a rearranged game), only the date is shown — a guessed
   * 15:00 on a midweek fixture is how people turn up at the wrong time.
   */
  function kickoffLabel(f, nowMs) {
    if (!f) return '';
    var at = f.kickoffAt || (f.date ? f.date + (f.kickoff ? 'T' + f.kickoff + ':00' : '') : null);
    var ms = toMs(at);
    if (!isFinite(ms)) return 'Date to be confirmed';
    var rel = relativeDay(ms, nowMs);
    var dated = rel === 'Today' || rel === 'Tomorrow' || rel === 'Yesterday' ? rel + ', ' + shortDate(ms) : shortDate(ms);
    if (f.kickoffTimeConfirmed === false) return dated + ' · time to be confirmed';
    return dated + ' · ' + clock(ms);
  }

  /** "3 minutes ago", "2 hours ago", "Yesterday", "4 Oct". */
  function ago(x, nowMs) {
    var ms = toMs(x), now = nowMs == null ? Date.now() : nowMs;
    if (!isFinite(ms)) return '';
    var s = Math.max(0, Math.round((now - ms) / 1000));
    if (s < 60) return 'Just now';
    if (s < 3600) { var m = Math.round(s / 60); return m + (m === 1 ? ' minute ago' : ' minutes ago'); }
    if (londonDate(ms) === londonDate(now)) { var h = Math.round(s / 3600); return h + (h === 1 ? ' hour ago' : ' hours ago'); }
    if (dayDiff(londonDate(ms), londonDate(now)) === 1) return 'Yesterday, ' + clock(ms);
    return shortDate(ms);
  }

  var api = { TZ: TZ, londonDate: londonDate, dayDiff: dayDiff, relativeDay: relativeDay,
    shortDate: shortDate, longDate: longDate, clock: clock, kickoffLabel: kickoffLabel, ago: ago, toMs: toMs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HQTime = api;
}(typeof window !== 'undefined' ? window : globalThis));
