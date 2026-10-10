/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — programme library

   The club's growing collection of free digital matchday programmes.

   Two parts:
     1. the SHELF — covers of every published edition, the latest one large;
     2. the LEDGER — every home fixture of the season, in every competition,
        with what exists for it: published, archive edition, postponed, or not
        yet published. The ledger ships baked into programmes.html, so a reader
        without JavaScript (or whose request fails) still sees the season.

   WHAT WAS WRONG (October 2026). The page showed "Loading the collection…"
   until two things had BOTH finished: the crest library and the Fan Zone
   session. If the session bootstrap stalled, the page never asked for the
   programmes at all. And when the request did fail, the page said "The
   collection starts soon" — an empty-collection message for an error, which
   hid the fault and told supporters something untrue. Now the session gets a
   short grace period, a failure says it is a failure and offers a retry, and
   the baked season ledger stays visible throughout.

   Cover-led, because a shelf of covers is how anyone browses a collection.
   No prices, no locks, no carts — every edition is free to members.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var root = document.getElementById('programme-library');
  var ledgerRoot = document.getElementById('programme-ledger');
  if (!root) return;

  var ALL = [];
  var LEDGER = null;
  var filters = { season: null, competition: null };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function dateLong(iso) { return RLFCCover.clubDate(iso); }
  function isArchive(e) { return e.editionKind === 'retrospective'; }

  function card(e) {
    var url = 'programme.html?id=' + encodeURIComponent(e.fixtureId);
    var score = (e.homeScore != null && e.awayScore != null)
      ? '<span class="pl-card__score">' + e.homeScore + '–' + e.awayScore + '</span>' : '';
    var member = isMember();
    var label = e.homeTeam + ' versus ' + e.awayTeam + ', ' + dateLong(e.kickoffAt) +
      (isArchive(e) ? ', archive edition' : '') +
      (member ? '. Read the matchday programme.' : '. Unlock free in Fan Zone.');
    var note = isArchive(e) ? '<span class="pl-card__note">Archive edition, reconstructed from verified match records</span>'
      : (e.postponedAt ? '<span class="pl-card__note">Match postponed after this edition was published</span>' : '');
    // The card always shows the cover, the fixture, the date and the score.
    // What changes is the promise it makes about opening it.
    return '<article>' +
      '<a class="pl-card' + (member ? '' : ' pl-card--locked') + '" href="' + esc(url) +
        '" aria-label="' + esc(label) + '">' +
        '<div class="pl-card__cover">' + RLFCCover.render(coverOf(e), { as: 'div' }) + '</div>' +
        '<div class="pl-card__t">' + esc(e.homeTeam) + ' v ' + esc(e.awayTeam) + '</div>' +
        '<div class="pl-card__m">' + esc(dateLong(e.kickoffAt)) +
          (e.competition ? ' · ' + esc(e.competition) : '') + '</div>' +
        score + note +
        '<span class="pl-card__cta">' + (member ? 'Read programme' : 'Unlock free in Fan Zone') + '</span>' +
      '</a></article>';
  }

  function coverOf(e) {
    return { homeTeam: e.homeTeam, awayTeam: e.awayTeam, homeCrest: e.homeCrest, awayCrest: e.awayCrest,
      competition: e.competition, kickoffAt: e.kickoffAt, season: e.season, editionKind: e.editionKind,
      // Archive editions carry no kick-off time on the cover: the time is
      // part of the matchday promise, not the record.
      kickoffTimeConfirmed: isArchive(e) ? false : e.kickoffTimeConfirmed };
  }

  /* Is this fixture TODAY, at the ground? Decided from the kick-off instant in
     Europe/London — never from the edition's state. A recovered edition for
     yesterday's match is not archived, so a state check called it "Today at The
     Lane" and offered "Read today's programme" for a game already played. */
  function isToday(kickoffAt) {
    var ms = Date.parse(kickoffAt);
    if (!isFinite(ms)) return false;
    var fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London',
      year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(new Date(ms)) === fmt.format(new Date());
  }

  /* The library is public on purpose: it is how a supporter discovers the
     collection. Only the CONTENT is the member benefit, so the shelf stays
     open and the call to action changes depending on who is looking. */
  function isMember() {
    return !!(window.LaneFan && window.LaneFan.state && window.LaneFan.state.entitled);
  }
  function memberCTA(live) {
    if (isMember()) return live ? 'Read today’s programme' : 'Read the programme';
    return 'Unlock free in Fan Zone';
  }

  function featured(e) {
    var live = isToday(e.kickoffAt);
    var afterFullTime = !!e.afterFullTime;
    var label = live ? 'Today at The Lane'
      : isArchive(e) ? 'Archive edition'
      : (afterFullTime ? 'Inaugural digital edition' : 'Latest edition');
    return '<section class="pl-featured" aria-labelledby="pl-feat-h">' +
      '<div>' + RLFCCover.render(coverOf(e), { as: 'div' }) + '</div>' +
      '<div class="pl-featured__meta">' +
        '<span class="label">' + label + '</span>' +
        '<h2 class="pl-featured__title" id="pl-feat-h">' + esc(e.homeTeam) + ' v ' + esc(e.awayTeam) + '</h2>' +
        '<p class="pl-featured__sub">' + esc(dateLong(e.kickoffAt)) +
          (e.competition ? ' · ' + esc(e.competition) : '') +
          (e.homeScore != null ? ' · ' + e.homeScore + '–' + e.awayScore : '') + '</p>' +
        '<div class="pl-actions">' +
          '<a class="btn btn-primary" href="programme.html?id=' + encodeURIComponent(e.fixtureId) + '">' +
            (memberCTA(live)) + '</a>' +
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
      // Honest, and deliberately not padded with fake editions. This is the
      // answer to a SUCCESSFUL request that found nothing — never to an error.
      root.innerHTML = '<div class="pl-empty">' +
        '<div class="pl-empty__h">The collection starts soon</div>' +
        '<p class="pl-empty__p">Rayners Lane publishes a free digital programme for every home fixture. ' +
        'Each edition appears here on matchday and stays in the collection permanently.</p>' +
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
      (current ? featured(current) : '') +
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

  /* A failure is a failure. Not "the collection starts soon". */
  function failed() {
    root.innerHTML = '<div class="pl-notice" role="status">' +
      '<p><strong>The programme covers could not be loaded just now.</strong> ' +
      'The season record below lists every home fixture and its programme.</p>' +
      '<button class="btn" type="button" id="pl-retry">Try again</button></div>';
    var b = document.getElementById('pl-retry');
    if (b) b.addEventListener('click', function () { root.innerHTML = loadingHtml(); load(); });
  }
  function loadingHtml() {
    return '<div class="pl-notice" role="status"><p>Fetching the latest editions…</p></div>';
  }

  /* ── the season ledger: filters for the archive index ──────────────────── */
  var lf = { comp: '', opp: '', kind: '', month: '' };
  function ledgerFilters(rows) {
    var opps = [], months = [];
    rows.forEach(function (r) {
      if (r.opponent && opps.indexOf(r.opponent) === -1) opps.push(r.opponent);
      var m = String(r.date || '').slice(0, 7);
      if (m && months.indexOf(m) === -1) months.push(m);
    });
    opps.sort();
    function sel(id, label, opts) {
      return '<label class="pg-led__f"><span>' + label + '</span><select id="' + id + '">' +
        opts.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join('') +
        '</select></label>';
    }
    var monthName = function (m) {
      return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(m + '-01T00:00:00Z'));
    };
    return '<form class="pg-led__filters" aria-label="Filter the season record" onsubmit="return false">' +
      sel('pg-f-comp', 'Competition', [['', 'All'], ['league', 'League'], ['cup', 'Cup']]) +
      sel('pg-f-opp', 'Opponent', [['', 'All']].concat(opps.map(function (o) { return [o, o]; }))) +
      sel('pg-f-month', 'Month', [['', 'All']].concat(months.map(function (m) { return [m, monthName(m)]; }))) +
      sel('pg-f-kind', 'Programme', [['', 'All'], ['published', 'Published'], ['retrospective', 'Archive edition'],
        ['missing', 'In preparation'], ['postponed', 'Postponed'], ['upcoming', 'Not yet published']]) +
      '</form><p class="pg-led__count" aria-live="polite"></p>';
  }
  function applyLedgerFilters() {
    if (!ledgerRoot) return;
    var shown = 0, total = 0;
    ledgerRoot.querySelectorAll('.pg-led__row').forEach(function (li) {
      total++;
      var date = (li.querySelector('time') || {}).getAttribute ? li.querySelector('time').getAttribute('datetime') : '';
      var ok = (!lf.comp || li.getAttribute('data-comp') === lf.comp) &&
        (!lf.opp || li.getAttribute('data-opp') === lf.opp) &&
        (!lf.kind || li.getAttribute('data-kind') === lf.kind) &&
        (!lf.month || String(date).slice(0, 7) === lf.month);
      li.hidden = !ok;
      if (ok) shown++;
    });
    var c = ledgerRoot.querySelector('.pg-led__count');
    if (c) c.textContent = shown === total ? '' : 'Showing ' + shown + ' of ' + total + ' home fixtures.';
  }
  function wireLedger(rows) {
    if (!ledgerRoot) return;
    var list = ledgerRoot.querySelector('.pg-led__list');
    if (!list || !rows || rows.length < 4) return;
    list.insertAdjacentHTML('beforebegin', ledgerFilters(rows));
    [['pg-f-comp', 'comp'], ['pg-f-opp', 'opp'], ['pg-f-kind', 'kind'], ['pg-f-month', 'month']].forEach(function (p) {
      var el = document.getElementById(p[0]);
      if (el) el.addEventListener('change', function () { lf[p[1]] = el.value; applyLedgerFilters(); });
    });
  }
  /** Rows as the baked HTML carries them, so filters work without the API. */
  function bakedRows() {
    if (!ledgerRoot) return [];
    return [].map.call(ledgerRoot.querySelectorAll('.pg-led__row'), function (li) {
      var t = li.querySelector('time');
      return { opponent: li.getAttribute('data-opp'), date: t ? t.getAttribute('datetime') : '' };
    });
  }
  function paintLedger() {
    if (!ledgerRoot || !LEDGER || !window.RLFCLedger) return;
    ledgerRoot.innerHTML = window.RLFCLedger.render(LEDGER, { season: '2026/27', asOf: new Date().toISOString(), live: true });
    ledgerRoot.setAttribute('data-source', 'live');
    wireLedger(LEDGER);
    applyLedgerFilters();
  }

  // The library's cards are LIVE registry data, not archived editions, so the
  // crest library may answer for them. (The reader is different and must stay
  // snapshot-only — an archived programme that reached for a current asset
  // would quietly rewrite the past. tests/programme-surfaces enforces it.)
  var crestsReady = (window.LaneCrest && window.LaneCrest.load)
    ? window.LaneCrest.load().catch(function () {})
    : Promise.resolve();

  // Wait for the session too — but not for ever. A member who lands on the
  // library should never be told to unlock something they already have; a
  // session bootstrap that stalls must not keep the whole collection hidden.
  // The shelf repaints when the session answers (onChange below).
  function grace(p, ms) {
    return Promise.race([p, new Promise(function (r) { setTimeout(r, ms); })]);
  }
  var sessionReady = (window.LaneFan && window.LaneFan.ready)
    ? window.LaneFan.ready.catch(function () {}) : Promise.resolve();

  // Repaint if the answer changes — signing in should not need a reload.
  if (window.LaneFan && window.LaneFan.onChange) {
    var seen = null;
    window.LaneFan.onChange(function (s) {
      if (seen !== null && s.entitled !== seen && ALL.length) paint();
      seen = s.entitled;
    });
  }

  function load() {
    // Anonymous on purpose: the listing is public, only the contents are gated.
    // A request that hangs is treated as a failure after ten seconds.
    return grace(Promise.all([crestsReady, sessionReady]), 2500)
      .then(function () {
        return Promise.race([fetch('/.netlify/functions/programme-data'),
          new Promise(function (r) { setTimeout(function () { r(null); }, 10000); })]);
      })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || d.ok !== true || !Array.isArray(d.editions)) { failed(); return; }
        ALL = d.editions;
        LEDGER = Array.isArray(d.ledger) ? d.ledger : null;
        paint();
        paintLedger();
      })
      .catch(function () { failed(); });
  }

  wireLedger(bakedRows());
  load();
})();
