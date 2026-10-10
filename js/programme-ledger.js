/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — the season's programme ledger

   Every home fixture of the season and what a supporter can find for it:
   a published programme, an Archive Edition, a postponement, or "not yet
   published". It exists because the shelf of covers could only show what
   had been published — a home match with no edition simply vanished, which
   is how the rearranged Hilltop match went unnoticed.

   One renderer, used three ways: in the browser (live data), on the server
   (the no-JavaScript archive page) and at bake time (the static copy in
   programmes.html that text-only readers and crawlers see). Pure string
   building; no DOM, no network.
   ════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RLFCLedger = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Club-day date; the time only when the registry has confirmed it. */
  function when(r) {
    var iso = r.kickoffAt || (r.date ? r.date + 'T12:00:00Z' : null);
    var ms = Date.parse(iso);
    if (!isFinite(ms)) return { text: 'Date to be confirmed', iso: '' };
    var d = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' })
      .format(new Date(ms));
    var t = '';
    if (r.kind === 'upcoming' && r.kickoffTimeConfirmed !== false && r.kickoffAt) {
      t = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', minute: '2-digit', hour12: true })
        .format(new Date(ms)).replace(':00', '').replace(' ', '');
    }
    return { text: d + (t ? ' · ' + t : ''), iso: r.date || String(iso).slice(0, 10) };
  }

  function compLabel(r) {
    if (!r.competition) return '';
    return r.cup ? r.competition.replace(/\bEP\b/, 'Extra Preliminary') : 'League';
  }

  function row(r) {
    var w = when(r);
    var res = r.result ? '<span class="pg-led__res">' + esc(r.result.us) + '–' + esc(r.result.them) + '</span>' : '';
    var status = r.readable
      ? '<a class="pg-led__st" href="programme.html?id=' + encodeURIComponent(r.fixtureId) + '">' + esc(r.label) + '</a>'
      : '<span class="pg-led__st">' + esc(r.label) + '</span>';
    return '<li class="pg-led__row pg-led__row--' + esc(r.kind) + '" data-kind="' + esc(r.kind) + '" data-comp="' +
      esc(r.cup ? 'cup' : 'league') + '" data-opp="' + esc(r.opponent || '') + '">' +
      '<time class="pg-led__d" datetime="' + esc(w.iso) + '">' + esc(w.text) + '</time>' +
      '<span class="pg-led__o">Rayners Lane v ' + esc(r.opponent || 'opponent to be confirmed') + '</span>' +
      '<span class="pg-led__c">' + esc(compLabel(r)) + '</span>' + res + status + '</li>';
  }

  var KEY = [
    ['published', 'Free to read for Fan Zone members.'],
    ['retrospective', 'Reconstructed afterwards from verified match records.'],
    ['missing', 'No programme was published on the day. An archive edition is being prepared.'],
    ['postponed', 'Postponed or rearranged. No completed-match programme exists.'],
    ['upcoming', 'Each edition appears on matchday.'],
  ];

  /**
   * @param rows   reconcile.publicLedger() rows
   * @param opts   { season, asOf, live }
   */
  function render(rows, opts) {
    var o = opts || {};
    var list = (rows || []).slice().sort(function (a, b) {
      return String(a.date || '9999').localeCompare(String(b.date || '9999'));
    });
    var kinds = {};
    list.forEach(function (r) { kinds[r.kind] = true; });
    var asOf = o.asOf ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(Date.parse(o.asOf))) : '';
    return '<h2 class="pg-led__h" id="pg-led-h">' + esc(o.season || '2026/27') + ' home fixtures</h2>' +
      '<p class="pg-led__lede">Every home match of the season in every competition, cup ties included, and the programme for each.' +
      (asOf ? ' <span class="pg-led__asof">' + (o.live ? 'Updated ' : 'As recorded on ') + esc(asOf) + '.</span>' : '') + '</p>' +
      (list.length
        ? '<ol class="pg-led__list">' + list.map(row).join('') + '</ol>'
        : '<p class="pg-led__lede">No home fixtures are recorded for this season yet.</p>') +
      '<dl class="pg-led__key">' + KEY.filter(function (k) { return kinds[k[0]]; }).map(function (k) {
        return '<div><dt class="pg-led__row--' + k[0] + '"><span class="pg-led__dot" aria-hidden="true"></span>' +
          esc(k[0] === 'retrospective' ? 'Archive edition' : k[0] === 'missing' ? 'In preparation'
            : k[0] === 'upcoming' ? 'Not yet published' : k[0].charAt(0).toUpperCase() + k[0].slice(1)) + '</dt><dd>' + esc(k[1]) + '</dd></div>';
      }).join('') + '</dl>';
  }

  return { render: render, row: row, when: when, esc: esc };
}));
