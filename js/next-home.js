/* ════════════════════════════════════════════════════════════════════════
   NEXT HOME MATCH — one rule, used by the homepage and "Your first visit".

   The next match and the next HOME match are different questions. Someone
   bringing friends to Tithe Farm needs the second one, so it is worked out
   here once, from the football registry list (js/football-data.js →
   fixtures), and both pages render the same answer:

     · next     the earliest home fixture still scheduled to kick off
     · offList  home fixtures between now and that match which have been
                postponed, cancelled or abandoned — said out loud, so a
                supporter never travels for a game that is off
     · timeTbc  true when the registry has the date but not a confirmed
                kick-off time; the time is then never shown

   Dates and times are always computed in Europe/London.
   Works in the browser (window.LaneNextHome) and in Node (unit tests).
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var TZ = 'Europe/London';
  var OFF = /^(postponed|cancelled|abandoned)$/i;

  function t(f) { var x = Date.parse(f && f.kickoffAt); return isFinite(x) ? x : NaN; }
  function isHome(f) { return !!f && f.isHome === true; }
  function timeConfirmed(f) { return !(f && f.kickoffTimeConfirmed === false); }

  /** Start of "today" in London, as an epoch ms. */
  function londonDayStart(nowMs) {
    var d = new Date(nowMs);
    var parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d);
    var p = {}; parts.forEach(function (x) { p[x.type] = x.value; });
    var elapsed = ((+p.hour * 60 + +p.minute) * 60 + +p.second) * 1000 + d.getMilliseconds();
    return nowMs - elapsed;
  }

  function pick(fixtures, nowMs) {
    var now = nowMs == null ? Date.now() : nowMs;
    var list = (fixtures || []).filter(function (f) { return isHome(f) && isFinite(t(f)); })
      .sort(function (a, b) { return t(a) - t(b); });
    var next = list.filter(function (f) { return String(f.status || '').toLowerCase() === 'scheduled' && t(f) > now; })[0] || null;
    var from = londonDayStart(now);
    var until = next ? t(next) : now + 28 * 864e5;
    var offList = list.filter(function (f) { return OFF.test(String(f.status || '')) && t(f) >= from && t(f) <= until; });
    return { next: next, offList: offList, timeTbc: !!next && !timeConfirmed(next) };
  }

  function fmt(iso, o) { try { return new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: TZ }, o)).format(new Date(iso)); } catch (e) { return ''; } }
  function dateLong(f) { return fmt(f.kickoffAt, { weekday: 'long', day: 'numeric', month: 'long' }); }
  function dateShort(f) { return fmt(f.kickoffAt, { weekday: 'short', day: 'numeric', month: 'short' }); }
  /** "3pm", "7.45pm" — or '' when the time is not confirmed. */
  function kickOff(f) {
    if (!f || !timeConfirmed(f)) return '';
    var hm = fmt(f.kickoffAt, { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' }).replace(/\s/g, '').toLowerCase();
    return hm.replace(':00', '').replace(':', '.');
  }
  function statusWord(f) { var s = String(f && f.status || '').toLowerCase(); return s === 'cancelled' ? 'Cancelled' : s === 'abandoned' ? 'Abandoned' : 'Postponed'; }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /**
   * Fill `el` with the next-home-match block. `fx` is the registry response
   * ({fixtures:[…]}) or null when the registry could not be read — in which
   * case the block says so and points to the fixtures page; it never guesses.
   */
  function render(el, fx, nowMs) {
    if (!el) return null;
    if (!fx || !Array.isArray(fx.fixtures)) {
      el.innerHTML = '<p class="nh__none">We can&rsquo;t load the fixture list right now. The <a href="fixtures.html">fixtures page</a> has every date, or email <a href="mailto:info@raynerslanefc.co.uk">info@raynerslanefc.co.uk</a>.</p>';
      el.setAttribute('data-state', 'unavailable');
      return null;
    }
    var r = pick(fx.fixtures, nowMs);
    var off = r.offList.map(function (f) {
      return '<p class="nh__off" role="status"><b>' + statusWord(f) + ':</b> ' + esc(f.opponent) + ' at Tithe Farm on ' + esc(dateLong(f)) +
        ' is off. A new date goes on the <a href="fixtures.html">fixtures page</a> once the league confirms it.</p>';
    }).join('');
    if (!r.next) {
      el.innerHTML = off + '<p class="nh__none">No home match is confirmed yet. New dates go on the <a href="fixtures.html">fixtures page</a> as soon as the league confirms them.</p>';
      el.setAttribute('data-state', 'none');
      return r;
    }
    var f = r.next, ko = kickOff(f);
    el.innerHTML = off +
      '<p class="nh__when"><span class="nh__date">' + esc(dateLong(f)) + '</span>' +
        '<span class="nh__ko">' + (ko ? 'Kick-off ' + esc(ko) : 'Kick-off time to be confirmed') + '</span></p>' +
      '<p class="nh__opp">' + esc(f.opponent || 'Opponent to be confirmed') + '</p>' +
      '<p class="nh__where">Tithe Farm, 151 Rayners Lane, Harrow HA2 0XH' + (f.competition ? ' &middot; ' + esc(f.competition) : '') + '</p>';
    el.setAttribute('data-state', 'next');
    el.setAttribute('data-fixture', f.id || '');
    return r;
  }

  var API = { render: render, pick: pick, dateLong: dateLong, dateShort: dateShort, kickOff: kickOff, statusWord: statusWord, timeConfirmed: timeConfirmed, londonDayStart: londonDayStart };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.LaneNextHome = API;
})(typeof window !== 'undefined' ? window : this);
