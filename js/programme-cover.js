/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — programme cover

   ONE renderer, used by the reader, the library cards and the featured
   edition. Covers are composed in CSS from real assets rather than generated
   as images: crests stay sharp at any size, the text stays selectable and
   readable by a screen reader, and a 200px thumbnail is legible without a
   separate render pipeline.

   A missing opponent crest gets a designed initials mark — never a stretched
   low-resolution logo and never an invented badge.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function initials(name) {
    return String(name || '').replace(/\b(fc|afc|utd|united|town|city)\b/gi, '')
      .trim().split(/\s+/).map(function (w) { return w[0] || ''; })
      .join('').slice(0, 3).toUpperCase() || '?';
  }
  function crest(src, name) {
    if (!src) return '<span class="pc__crest pc__crest--ini" aria-hidden="true">' + esc(initials(name)) + '</span>';
    return '<img class="pc__crest" src="' + esc(src) + '" alt="" aria-hidden="true">';
  }
  function clubDate(iso) {
    var ms = Date.parse(iso);
    if (!isFinite(ms)) return '';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(ms));
  }
  function clubTime(iso) {
    var ms = Date.parse(iso);
    if (!isFinite(ms)) return '';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(ms));
  }

  /**
   * @param {Object} e edition-shaped record
   * @param {Object} opts {as:'div'|'a', href, label}
   *
   * The crests are aria-hidden and the whole cover carries one accessible
   * label, because a screen reader announcing two decorative badges before the
   * fixture is noise. Every fact on the cover is also in the page text.
   */
  function render(e, opts) {
    var o = opts || {};
    var tag = o.as === 'a' ? 'a' : 'div';
    var href = o.as === 'a' && o.href ? ' href="' + esc(o.href) + '"' : '';
    var label = o.label || (e.homeTeam + ' versus ' + e.awayTeam + ', ' + clubDate(e.kickoffAt));
    var comp = e.competition || '';
    var sponsor = e.matchSponsor ? '<div class="pc__sponsor">Match sponsor · ' + esc(e.matchSponsor) + '</div>' : '';

    return '<div class="pc-wrap">' +
      '<' + tag + ' class="pc"' + href + ' aria-label="' + esc(label) + '">' +
        '<div class="pc__top">Matchday Programme' + (e.season ? '<br>' + esc(e.season) : '') + '</div>' +
        '<div class="pc__crests">' +
          crest(e.homeCrest, e.homeTeam) +
          '<span class="pc__v" aria-hidden="true">V</span>' +
          crest(e.awayCrest, e.awayTeam) +
        '</div>' +
        '<div class="pc__teams">' +
          '<span>' + esc(e.homeTeam || '') + '</span>' +
          '<span class="pc__opp">' + esc(e.awayTeam || '') + '</span>' +
        '</div>' +
        '<div class="pc__foot">' +
          (comp ? esc(comp) + '<br>' : '') +
          esc(clubDate(e.kickoffAt)) +
          (e.kickoffAt ? '<br>Kick-off ' + esc(clubTime(e.kickoffAt)) : '') +
        '</div>' + sponsor +
      '</' + tag + '></div>';
  }

  global.RLFCCover = { render: render, initials: initials, clubDate: clubDate, clubTime: clubTime };
})(window);
