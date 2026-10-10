/* ════════════════════════════════════════════════════════════════════════
   THE LANE 100 — page behaviour (lane-100.html).
   · The counter is the REAL count from the club database
     (/.netlify/functions/lane-100). Zero reads "be one of the first". If the
     count can't be read, no number is shown at all.
   · Joining posts to submit-form (type 'lane100'). The supporter number shown
     afterwards is the one the database assigned to that sign-up, nothing else.
   · The wall lists only supporters who asked to be on it.
   Also exposes window.Lane100.count() for the homepage teaser.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var EP = '/.netlify/functions/lane-100';
  var CLUB = 'info@raynerslanefc.co.uk';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function load() {
    return fetch(EP, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && d.ok === true && typeof d.count === 'number' ? d : null; })
      .catch(function () { return null; });
  }

  /** Counter markup shared by this page and the homepage. */
  function counter(el, d) {
    if (!el) return;
    if (!d) {
      el.setAttribute('data-state', 'unavailable');
      el.innerHTML = '<p class="l100c__msg">The live count isn&rsquo;t available right now. You can still join below.</p>';
      return;
    }
    var target = d.target || 100, n = Math.min(d.count, target), left = Math.max(0, target - n);
    el.setAttribute('data-state', n === 0 ? 'zero' : n >= target ? 'full' : 'open');
    el.setAttribute('data-count', String(n));
    var msg = n === 0 ? 'Nobody has a number yet. Be one of the first.'
      : n >= target ? 'All 100 founding numbers have been taken.'
      : (n === 1 ? 'One supporter has joined' : n + ' supporters have joined') + '. ' + left + ' founding number' + (left === 1 ? '' : 's') + ' left.';
    el.innerHTML =
      '<p class="l100c__n" aria-hidden="true"><span class="l100c__now">' + n + '</span><span class="l100c__of">/' + target + '</span></p>' +
      '<div class="l100c__bar" aria-hidden="true"><i style="transform:scaleX(' + (n / target) + ')"></i></div>' +
      '<p class="l100c__msg">' + esc(msg) + '</p>' +
      '<p class="sr-only" role="status">' + n + ' of ' + target + ' founding supporters. ' + esc(msg) + '</p>';
  }

  function wall(el, d) {
    if (!el) return;
    if (!d) { el.innerHTML = '<li class="l100w__empty">The wall can&rsquo;t be loaded right now.</li>'; return; }
    if (!d.wall.length) {
      el.innerHTML = '<li class="l100w__empty">Nobody is on the wall yet. Tick the box when you join and the first name here could be yours.</li>';
      return;
    }
    el.innerHTML = d.wall.map(function (m) {
      return '<li><span class="l100w__no">' + esc(m.no) + '</span><span class="l100w__name">' + esc(m.name) + '</span>' +
        (m.town ? '<span class="l100w__town">' + esc(m.town) + '</span>' : '') + '</li>';
    }).join('');
  }

  var ERR = {
    'already-joined': 'That email is already one of The Lane 100. If you&rsquo;ve lost your number, email <a href="mailto:' + CLUB + '">' + CLUB + '</a>.',
    'full': 'All 100 founding numbers have now been taken. The free <a href="fan-zone.html">Lane Card</a> is still open to everyone.',
    'consent-required': 'Please tick the box to say the club may keep your details for The Lane 100.',
    'email-required': 'Please add your email so the club can recognise you.',
    'rate': 'Too many tries from this connection. Please wait a minute and try again.',
  };

  function join(form) {
    if (!form.checkValidity()) { form.reportValidity(); return; }
    var btn = form.querySelector('button[type=submit]'), label = btn.innerHTML;
    var err = form.querySelector('.l100f__err');
    btn.disabled = true; btn.innerHTML = 'Joining&hellip;'; err.hidden = true;
    var p = { type: 'lane100', source_page: location.pathname, _elapsed: Date.now() - (window.laneFormStart || Date.now()) };
    new FormData(form).forEach(function (v, k) { p[k] = v; });
    fetch('/.netlify/functions/submit-form', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (d) {
        if (d && d.ok && d.number) return done(form, p, d.number);
        if (d && d.ok) return done(form, p, null);   // accepted, but no number came back: say nothing we don't know
        fail(d && ERR[d.error]);
      })
      .catch(function () { fail(); });
    function fail(html) {
      btn.disabled = false; btn.innerHTML = label;
      err.innerHTML = html || 'Sorry, that didn&rsquo;t go through and nothing was saved. Please try again, or email <a href="mailto:' + CLUB + '">' + CLUB + '</a>.';
      err.hidden = false;
    }
  }

  function done(form, p, no) {
    var first = String(p.name || '').trim().split(' ')[0];
    var box = document.createElement('div');
    box.className = 'l100f__done'; box.setAttribute('role', 'status'); box.tabIndex = -1;
    box.innerHTML = no
      ? '<p class="l100f__you">You&rsquo;re in' + (first ? ', ' + esc(first) : '') + '.</p>' +
        '<p class="l100f__no">No. <span data-l100-number>' + esc(no) + '</span></p>' +
        '<p class="l100f__p">That&rsquo;s your Lane 100 supporter number, in the order people joined. Keep it. ' +
        (p.show_on_wall ? 'Your first name and initial will appear on the wall below.' : 'You chose not to appear on the public wall, and you won&rsquo;t.') + '</p>' +
        '<p class="l100f__p">Next: <a href="matchday.html">plan a visit to Tithe Farm</a> and bring someone with you.</p>'
      : '<p class="l100f__you">Thanks' + (first ? ', ' + esc(first) : '') + '.</p><p class="l100f__p">The club has your details.</p>';
    form.replaceWith(box);
    box.focus();
    load().then(function (d) { counter($('l100-count'), d); wall($('l100-wall'), d); });
  }

  window.Lane100 = { load: load, counter: counter };

  function boot() {
    var form = $('l100-form');
    if (!form && !$('l100-count')) return;
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); join(form); });
    load().then(function (d) { counter($('l100-count'), d); wall($('l100-wall'), d); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
