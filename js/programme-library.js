/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — programme library

   The club's growing collection of free digital matchday programmes.

   Cover-led, because a shelf of covers is how anyone actually browses a
   collection. The feeling is borrowed from a record shelf or a bookcase; the
   interface, type and colour are entirely Rayners Lane. No prices, no locks,
   no carts — every edition is free.

   Accessibility is not decorative here: each card carries a real text label
   independent of its artwork, so nothing on this page is available only inside
   an image.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var root = document.getElementById('programme-library');
  if (!root) return;

  var ALL = [];
  var filters = { season: null, competition: null };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function dateLong(iso) { return RLFCCover.clubDate(iso); }

  function card(e) {
    var url = 'programme.html?id=' + encodeURIComponent(e.fixtureId);
    var score = (e.homeScore != null && e.awayScore != null)
      ? '<span class="pl-card__score">' + e.homeScore + '–' + e.awayScore + '</span>' : '';
    var label = e.homeTeam + ' versus ' + e.awayTeam + ', ' + dateLong(e.kickoffAt) +
      '. Read the matchday programme.';
    return '<article>' +
      '<a class="pl-card" href="' + esc(url) + '" aria-label="' + esc(label) + '">' +
        '<div class="pl-card__cover">' + RLFCCover.render(e, { as: 'div' }) + '</div>' +
        '<div class="pl-card__t">' + esc(e.homeTeam) + ' v ' + esc(e.awayTeam) + '</div>' +
        '<div class="pl-card__m">' + esc(dateLong(e.kickoffAt)) +
          (e.competition ? ' · ' + esc(e.competition) : '') + '</div>' +
        score +
      '</a></article>';
  }

  function featured(e) {
    var live = e.state !== 'archived';
    return '<section class="pl-featured" aria-labelledby="pl-feat-h">' +
      '<div>' + RLFCCover.render(e, { as: 'div' }) + '</div>' +
      '<div class="pl-featured__meta">' +
        '<span class="label">' + (live ? 'Today at The Lane' : 'Latest edition') + '</span>' +
        '<h2 class="pl-featured__title" id="pl-feat-h">' + esc(e.homeTeam) + ' v ' + esc(e.awayTeam) + '</h2>' +
        '<p class="pl-featured__sub">' + esc(dateLong(e.kickoffAt)) +
          (e.competition ? ' · ' + esc(e.competition) : '') +
          (e.homeScore != null ? ' · ' + e.homeScore + '–' + e.awayScore : '') + '</p>' +
        '<div class="pl-actions">' +
          '<a class="btn btn-primary" href="programme.html?id=' + encodeURIComponent(e.fixtureId) + '">' +
            (live ? 'Read today’s programme' : 'Read programme') + '</a>' +
          '<a class="btn" href="match-centre.html?id=' + encodeURIComponent(e.fixtureId) + '">Match Centre</a>' +
        '</div>' +
      '</div></section>';
  }

  function seasonOf(e) { return e.season || 'Earlier'; }

  function filterBar() {
    var seasons = [], comps = [];
    ALL.forEach(function (e) {
      if (e.season && seasons.indexOf(e.season) === -1) seasons.push(e.season);
      if (e.competition && comps.indexOf(e.competition) === -1) comps.push(e.competition);
    });
    if (seasons.length < 2 && comps.length < 2) return '';   // nothing worth filtering yet
    function group(name, values, active) {
      return values.map(function (v) {
        return '<button class="pl-filter" data-kind="' + name + '" data-value="' + esc(v) + '" ' +
          'aria-pressed="' + (active === v ? 'true' : 'false') + '">' + esc(v) + '</button>';
      }).join('');
    }
    return '<div class="pl-filters" role="group" aria-label="Filter programmes">' +
      '<button class="pl-filter" data-kind="clear" aria-pressed="' +
        (!filters.season && !filters.competition ? 'true' : 'false') + '">All</button>' +
      group('season', seasons, filters.season) +
      group('competition', comps, filters.competition) +
      '</div>';
  }

  function visible() {
    return ALL.filter(function (e) {
      if (filters.season && e.season !== filters.season) return false;
      if (filters.competition && e.competition !== filters.competition) return false;
      return true;
    });
  }

  function paint() {
    var list = visible();
    if (!ALL.length) {
      // Honest, and deliberately not padded with fake editions.
      root.innerHTML = '<div class="pl-empty">' +
        '<div class="pl-empty__h">The collection starts soon</div>' +
        '<p class="pl-empty__p">Rayners Lane publishes a free digital programme for every home fixture. ' +
        'Each edition appears here on matchday, once both official team sheets are confirmed, ' +
        'and stays in the collection permanently.</p>' +
        '<a class="btn btn-primary" href="fixtures.html">See the fixtures</a></div>';
      return;
    }

    var current = list.filter(function (e) { return e.state !== 'archived'; })[0] || list[0];
    var rest = list.filter(function (e) { return e !== current; });

    var bySeason = {};
    rest.forEach(function (e) {
      var s = seasonOf(e);
      (bySeason[s] = bySeason[s] || []).push(e);
    });
    var seasons = Object.keys(bySeason).sort().reverse();

    root.innerHTML =
      featured(current) +
      filterBar() +
      (rest.length
        ? seasons.map(function (s) {
            return '<h2 class="pl-season">' + esc(s) + '</h2>' +
              '<div class="pl-grid">' + bySeason[s].map(card).join('') + '</div>';
          }).join('')
        : '<p class="pl-intro">More editions will appear here as the season goes on.</p>');

    root.querySelectorAll('.pl-filter').forEach(function (b) {
      b.addEventListener('click', function () {
        var kind = b.getAttribute('data-kind');
        var value = b.getAttribute('data-value');
        if (kind === 'clear') { filters = { season: null, competition: null }; }
        else { filters[kind] = filters[kind] === value ? null : value; }
        paint();
      });
    });
  }

  fetch('/.netlify/functions/programme-data')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      ALL = (d && d.ok && d.editions) ? d.editions : [];
      paint();
    })
    .catch(function () { ALL = []; paint(); });
})();
