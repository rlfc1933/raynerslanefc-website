/* ════════════════════════════════════════════════════════════════════════
   HOMEPAGE DATA — fills the 2026/27 homepage from the club's own sources.
   · Next match, league position, results and fixtures: the football registry
     (js/football-data.js → /.netlify/functions/football-data). One source,
     the same one Club Now and the fixtures page use.
   · Prices: data/config.json. Squad: data/squad.json.
   Every block has an honest empty/failed state: if a source is down the
   page says so; it never fills a gap with a guess.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var TZ = 'Europe/London';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(iso, o) { try { return new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: TZ }, o)).format(new Date(iso)); } catch (e) { return ''; } }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  // ── ① lower third: the next match (or the live one) ──────────────────────
  var countTimer = null;
  function bug(sum) {
    var el = $('kl-bug'); if (!el) return;
    var body = el.querySelector('.kl-bug__body'), label = el.querySelector('.kl-bug__label');
    if (!sum) { body.innerHTML = '<span class="kl-bug__none">Fixture information is unavailable right now &mdash; see the fixtures page.</span>'; el.href = 'fixtures.html'; return; }
    var m = sum.current || sum.next;
    if (!m) { body.innerHTML = '<span class="kl-bug__none">No fixture scheduled yet. The full list is on the fixtures page.</span>'; el.href = 'fixtures.html'; return; }
    var live = !!sum.current;
    label.textContent = live ? 'Live' : 'Next match';
    var crest = m.isHome ? m.awayCrest : m.homeCrest;
    var where = m.isHome ? 'Tithe Farm' : (m.venue || 'Away');
    body.innerHTML =
      (crest ? '<img class="kl-bug__crest" src="' + esc(crest) + '" alt="" width="44" height="44" loading="lazy">' : '') +
      '<span class="kl-bug__vs">' + esc(m.opponent) + '<small>' + (m.isHome ? 'HOME' : 'AWAY') + '</small></span>' +
      '<span class="kl-bug__when">' + esc(fmt(m.kickoffAt, { weekday: 'short', day: 'numeric', month: 'short' })) + ' &middot; ' + esc(fmt(m.kickoffAt, { hour: '2-digit', minute: '2-digit' })) +
        '<span>' + esc(where) + ' &middot; ' + esc(m.competition || '') + '</span></span>' +
      (live ? '<span class="kl-bug__live">Live now</span>' : '<span class="kl-bug__count" id="kl-count" aria-label="Time to kick-off"></span>');
    el.setAttribute('aria-label', (live ? 'Live: ' : 'Next match: ') + m.opponent + (m.isHome ? ' at home, ' : ' away, ') + fmt(m.kickoffAt, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + '. Open match centre.');
    if (!live) tick(Date.parse(m.kickoffAt));
  }
  function tick(t) {
    var c = $('kl-count'); if (!c || !isFinite(t)) return;
    clearInterval(countTimer);
    function draw() {
      var s = Math.max(0, Math.floor((t - Date.now()) / 1000));
      var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
      c.innerHTML = '<span>' + d + '<small>days</small></span><span>' + String(h).padStart(2, '0') + '<small>hrs</small></span><span>' + String(m).padStart(2, '0') + '<small>mins</small></span>';
    }
    draw(); countTimer = setInterval(draw, 30000);   // minutes, not seconds: nothing on this page ticks for show
  }

  // ── ② league position beside Match Centre ────────────────────────────────
  function table(t) {
    var el = $('kl-table'); if (!el) return;
    var rows = t && t.table && t.table.rows; if (!rows || !rows.length) { el.textContent = ''; return; }
    var us = rows.filter(function (r) { return r.isUs; })[0]; if (!us) return;
    el.innerHTML = '<b>' + ord(us.position) + '</b>of ' + rows.length + ' in the Combined Counties Premier North &middot; ' + us.points + ' pts from ' + us.played + ' games.' +
      (t.table.lastSyncedAt ? ' <span class="kl-fresh">Updated ' + esc(fmt(t.table.lastSyncedAt, { day: 'numeric', month: 'short' })) + '.</span>' : '');
  }

  // ── ③ the run: last five results, then what's next ───────────────────────
  function run(fx, res) {
    var el = $('kl-run'); if (!el) return;
    var all = (fx && fx.fixtures) || [];
    if (!all.length) { el.innerHTML = '<li class="kl-run__item"><span class="kl-run__tbc">Fixtures are unavailable right now. <a href="fixtures.html">See the fixtures page.</a></span></li>'; return; }
    // Scores from the full results list (not just the five-game form strip), so
    // every played match on the rail can carry its score.
    var form = {}; ((res && res.results) || []).concat((res && res.form) || []).forEach(function (f) {
      if (f && f.us != null && f.them != null && !form[f.id]) form[f.id] = { us: f.us, them: f.them, outcome: f.outcome || (f.us > f.them ? 'W' : f.us === f.them ? 'D' : 'L') };
    });
    var now = Date.now();
    var played = all.filter(function (f) { return f.status === 'played' || Date.parse(f.kickoffAt) < now - 3 * 3600e3; })
      .filter(function (f) { return !/postpon|cancel/i.test(f.status); }).slice(-5);
    var ahead = all.filter(function (f) { return Date.parse(f.kickoffAt) >= now - 3 * 3600e3 && f.status !== 'played' && !/postpon|cancel/i.test(f.status); }).slice(0, 6);
    var html = played.map(function (f) {
      var r = form[f.id];
      var score = r && r.us != null ? '<span class="kl-run__score">' + r.us + '&ndash;' + r.them + ' <span class="kl-run__res kl-run__res--' + r.outcome + '">' + r.outcome + '</span></span>' :
        '<span class="kl-run__tbc">Result not yet<br>confirmed</span>';
      return item(f, score);
    }).concat(ahead.map(function (f, i) {
      return item(f, '<span class="kl-run__ko">' + esc(fmt(f.kickoffAt, { hour: '2-digit', minute: '2-digit' })) + '</span>', i === 0);
    })).join('');
    el.innerHTML = html;
    var nx = el.querySelector('.is-next');
    if (nx) requestAnimationFrame(function () { el.scrollLeft = Math.max(0, nx.offsetLeft - el.offsetLeft - parseFloat(getComputedStyle(el).paddingLeft || 0) - nx.offsetWidth * 2); });
  }
  function item(f, tail, next) {
    return '<li class="kl-run__item' + (next ? ' is-next' : '') + '">' +
      '<span class="kl-run__flag">Next</span>' +
      '<span class="kl-run__date">' + esc(fmt(f.kickoffAt, { weekday: 'short', day: 'numeric', month: 'short' })) + '</span>' +
      '<span class="kl-run__opp">' + esc(f.opponent) + '</span>' +
      '<span class="kl-run__ha">' + (f.isHome ? 'Home' : 'Away') + ' &middot; ' + esc(f.competitionType === 'league' ? 'League' : (f.competition || '')) + '</span>' +
      tail + '</li>';
  }

  // ── ④ prices ─────────────────────────────────────────────────────────────
  function prices(cfg) {
    var el = $('kl-prices'); if (!el) return;
    var a = cfg && (cfg.admission || cfg.gate); var p = a && a.prices;
    if (!p || !p.length) { el.innerHTML = '<div class="kl-gate__price"><dt>Prices are on the gate on matchday.</dt></div>'; return; }
    el.innerHTML = p.map(function (x) {
      return '<div class="kl-gate__price"><dt>' + esc(x.label) + (x.note ? '<small>' + esc(x.note) + '</small>' : '') + '</dt><dd>' + esc(x.price) + '</dd></div>';
    }).join('');
    if (a.sub) { var s = $('kl-gate-sub'); if (s) s.textContent = a.sub + '. Tithe Farm, 151 Rayners Lane, HA2 0XH — Rayners Lane station is a short walk.'; }
  }

  // ── ⑥ squad ──────────────────────────────────────────────────────────────
  function squad(sq) {
    var el = $('kl-squad'); if (!el) return;
    var list = ((sq && (sq.players || sq.squad)) || []).filter(function (p) { return p && p.name && p.photo; });
    if (!list.length) { el.innerHTML = '<li class="kl-squad__item"><a href="squad.html"><span class="kl-squad__name">Meet the squad</span></a></li>'; return; }
    list.sort(function (a, b) { return (a.no || 99) - (b.no || 99); });
    el.innerHTML = list.map(function (p) {
      var thumb = String(p.photo).replace(/\.(webp|jpg)$/i, '-thumb.$1');
      return '<li class="kl-squad__item"><a href="player.html?id=' + encodeURIComponent(p.id || '') + '">' +
        '<span class="kl-squad__ph"><img src="' + esc(thumb) + '" alt="' + esc(p.name) + '" width="400" height="533" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=\'' + esc(p.photo) + '\'">' +
        (p.no ? '<span class="kl-squad__no" aria-hidden="true">' + esc(p.no) + '</span>' : '') + '</span>' +
        '<span class="kl-squad__name">' + esc(p.name) + '</span><span class="kl-squad__pos">' + esc(p.role || p.pos || '') + (p.no ? ' &middot; No. ' + esc(p.no) : '') + '</span></a></li>';
    }).join('');
  }

  // ── hero video: only where it costs nothing to the visitor ───────────────
  function video() {
    var v = document.querySelector('.kl-hero__video'); if (!v) return;
    var reduce = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.documentElement.classList.contains('a11y-reduce-motion');
    var saver = navigator.connection && (navigator.connection.saveData || /2g/.test(navigator.connection.effectiveType || ''));
    if (reduce || saver) return;
    v.src = innerWidth < 700 ? v.getAttribute('data-src-mobile') : v.getAttribute('data-src');
    v.addEventListener('playing', function () { v.classList.add('is-on'); }, { once: true });
    var p = v.play(); if (p && p.catch) p.catch(function () {});
  }

  function getJSON(u) { return fetch(u + (u.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }

  ready(function () {
    video();
    var F = window.RLFCFootball;
    if (F) {
      F.summary().then(bug);
      F.table().then(table);
      Promise.all([F.fixtures(), F.results()]).then(function (r) { run(r[0], r[1]); });
    } else { bug(null); run(null, null); }
    getJSON('data/config.json').then(prices);
    getJSON('data/squad.json').then(squad);
  });
})();
