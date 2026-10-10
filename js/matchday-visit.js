/* ════════════════════════════════════════════════════════════════════════
   YOUR FIRST VISIT (matchday.html)
   · Next home match: football registry → js/next-home.js (same rule as the
     homepage, so a postponement reads the same on both).
   · Admission: data/config.json (the same list the homepage gate uses).
   · "Bring a friend": adds up the published prices for the group. Only rows
     with a plain £ price (or "Free") are counted; anything else is shown as
     "ask on the gate" rather than guessed.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pence(p) { var s = String(p || '').trim(); if (/^free$/i.test(s)) return 0; var m = s.match(/^£\s?(\d+(?:\.\d{1,2})?)$/); return m ? Math.round(parseFloat(m[1]) * 100) : null; }
  function money(p) { return p % 100 ? '£' + (p / 100).toFixed(2) : '£' + p / 100; }

  function prices(cfg) {
    var el = $('fv-prices'), rows = $('fv-calc-rows');
    var a = cfg && (cfg.admission || cfg.gate), list = (a && a.prices) || [];
    if (a && a.sub && $('fv-gate-sub')) $('fv-gate-sub').textContent = a.sub + '.';
    if (!list.length) {
      el.innerHTML = '<div class="fv-price"><dt>Prices are shown on the gate on matchday.</dt></div>';
      if (rows) rows.innerHTML = '<p class="fv-muted">Prices are shown on the gate on matchday.</p>';
      return;
    }
    el.innerHTML = list.map(function (x) {
      return '<div class="fv-price"><dt>' + esc(x.label) + (x.note ? '<small>' + esc(x.note) + '</small>' : '') + '</dt><dd>' + esc(x.price) + '</dd></div>';
    }).join('');
    if (!rows) return;
    rows.innerHTML = list.map(function (x, i) {
      var id = 'fv-n' + i;
      return '<div class="fv-calc__row"><label for="' + id + '">' + esc(x.label) + ' <span>' + esc(x.price) + '</span></label>' +
        '<div class="fv-step"><button type="button" data-step="-1" data-for="' + id + '" aria-label="One fewer ' + esc(x.label) + '">&minus;</button>' +
        '<input id="' + id + '" type="number" inputmode="numeric" min="0" max="50" value="' + (i === 0 ? 5 : 0) + '" data-pence="' + (pence(x.price) == null ? '' : pence(x.price)) + '">' +
        '<button type="button" data-step="1" data-for="' + id + '" aria-label="One more ' + esc(x.label) + '">+</button></div></div>';
    }).join('');
    rows.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-step]'); if (!b) return;
      var inp = $(b.getAttribute('data-for'));
      inp.value = Math.max(0, Math.min(50, (parseInt(inp.value, 10) || 0) + Number(b.getAttribute('data-step'))));
      total();
    });
    rows.addEventListener('input', total);
    total();
  }

  function total() {
    var sum = 0, people = 0, unknown = false;
    document.querySelectorAll('#fv-calc-rows input').forEach(function (i) {
      var n = Math.max(0, parseInt(i.value, 10) || 0); people += n;
      if (!n) return;
      if (i.getAttribute('data-pence') === '') unknown = true; else sum += n * Number(i.getAttribute('data-pence'));
    });
    var out = $('fv-calc-total');
    if (!people) { out.innerHTML = 'Add who&rsquo;s coming.'; return; }
    out.innerHTML = '<span>' + people + (people === 1 ? ' person' : ' people') + ' on the gate</span><b>' + money(sum) + (unknown ? ' +' : '') + '</b>' +
      (unknown ? '<small>Plus anyone whose price is shown on the gate.</small>' : '');
  }

  function getJSON(u) { return fetch(u + '?t=' + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }

  function boot() {
    var F = window.RLFCFootball, NH = window.LaneNextHome;
    if (F && NH) F.fixtures().then(function (fx) { NH.render($('fv-next'), fx); });
    else if (NH) NH.render($('fv-next'), null);
    getJSON('data/config.json').then(prices);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
