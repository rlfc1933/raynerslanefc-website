/* ════════════════════════════════════════════════════════════════════════
   PROGRAMME STUDIO — choose match → edit pages → check → download → publish.

   One page model, one renderer: the preview, the check spreads and the PDF
   are all drawn by renderPage(), so what you check is what prints.

   "Saved" means saved on the club's server (netlify/functions/programme-
   studio.js). Every change is also kept on this computer until the server has
   it, so a dropped connection never loses work. A save based on an old
   version is refused by the server and shown as a choice, never overwritten.

   Never invents copy: empty text shows as a marked gap.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var EP = '/.netlify/functions/programme-studio';
  var TOKEN_KEY = 'rlfc-studio-session';
  var BACKUP = 'rlfc-studio-unsaved:';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; };
  var paras = function (t) { return String(t || '').split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join(''); };
  var gap = function (label) { return '<span class="pg-gap">' + esc(label) + ' — to be written</span>'; };
  var ukDate = function (d) { var x = new Date(d + 'T12:00:00Z'); return isNaN(x) ? (d || '') : x.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }); };
  var ukTime = function (iso) { var x = new Date(iso); return isNaN(x) ? '' : x.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }); };
  var ukWhen = function (iso) { var x = new Date(iso); return isNaN(x) ? '' : x.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }); };
  var rid = function () { return Math.random().toString(36).slice(2, 12); };

  var DATA = { fixtures: [], squad: [], squadAsOf: '', admission: null };
  var S = { token: null, user: null, role: null, canPublish: false, production: true };
  var ed = null;        // { fixtureId, revision, status, savedAt, savedBy, doc }
  var cur = 0;          // selected page index
  var dirty = false, saving = null, saveTimer = null, retryTimer = null, editSeq = 0;
  var undo = [], redo = [], lastSnapAt = 0;
  var profile = null;

  /* ── PICTURES: stored privately, shown from local object URLs ─────────── */
  var ASSET = {};   // sha → object URL | 'loading' | 'missing'
  function img(src) {
    src = String(src || '');
    var a = /^asset:([a-f0-9]{64})$/.exec(src);
    if (a) { var u = ASSET[a[1]]; if (u && u !== 'loading' && u !== 'missing') return u; if (!u) loadAsset(a[1]); return ''; }
    return /^\/?img\/[\w\/.-]+$/.test(src) ? src : '';
  }
  function loadAsset(sha) {
    ASSET[sha] = 'loading';
    return fetch(EP + '?asset=' + sha, { headers: { Authorization: 'Bearer ' + S.token } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then(function (b) { ASSET[sha] = URL.createObjectURL(b); if (ed) { renderPreview(); renderForm(true); } })
      .catch(function () { ASSET[sha] = 'missing'; });
  }
  function allAssetsLoaded() {
    var shas = [];
    JSON.stringify(ed.doc).replace(/asset:([a-f0-9]{64})/g, function (_, s) { shas.push(s); });
    return Promise.all(shas.map(function (s) { var u = ASSET[s]; return (u && u !== 'loading' && u !== 'missing') ? null : loadAsset(s); }));
  }

  /* ── PAGE TYPES: plain-language fields + a renderer ───────────────────
     The field lists are checked against the server's (lib/programme/studio-doc.js)
     by tests/programme-studio.test.js. */
  var T = {
    cover: { name: 'Front cover', fields: [['headline', 'Cover headline', 'line'], ['sponsor', 'Presented by (sponsor name, optional)', 'line'], ['photo', 'Cover photograph', 'image']],
      render: function (p, e) { var f = e.fixture; return '<div class="pg pg--cover"' + bg(p.photo) + '><div class="pg-cover__top">Official Matchday Programme' + (p.sponsor ? '<small>presented by ' + esc(p.sponsor) + '</small>' : '') + '</div>' +
        '<div class="pg-cover__h">' + (p.headline ? esc(p.headline) : 'Matchday') + '</div>' +
        '<div class="pg-cover__vs"><img src="img/badge-512.png" alt="">' + '<b>v</b>' + (img(f.oppCrest) ? '<img src="' + img(f.oppCrest) + '" alt="">' : '') + '</div>' +
        '<div class="pg-cover__match"><strong>Rayners Lane FC v ' + esc(f.opponent) + '</strong><span>' + esc(ukDate(f.date)) + ' · ' + esc(f.kickoff || '') + '</span><span>' + esc(f.competition || '') + '</span><span>Tithe Farm, 151 Rayners Lane, Harrow HA2 0XH</span></div></div>'; } },
    contents: { name: 'Contents and match details', fields: [],
      render: function (p, e) { var rows = e.pages.map(function (q, i) { return q.hidden || i === firstVis() || q.type === 'contents' || q.type === 'back' || q.type === 'advert' ? '' : '<li><span>' + esc(q.label || T[q.type].name) + '</span><b>' + visNo(i) + '</b></li>'; }).join(''); var f = e.fixture;
        return '<div class="pg"><h2 class="pg-h">In this issue</h2><ul class="pg-toc">' + rows + '</ul><div class="pg-box"><h3>Today\'s match</h3><p><strong>Rayners Lane FC v ' + esc(f.opponent) + '</strong><br>' + esc(ukDate(f.date)) + ', kick-off ' + esc(f.kickoff || 'TBC') + '<br>' + esc(f.competition || '') + '<br>' + esc(f.venue || '') + '</p></div></div>'; } },
    notes: { name: 'Notes', fields: [['label', 'Page name (e.g. Chairman\'s notes)', 'line'], ['author', 'Written by (name and role)', 'line'], ['body', 'Text', 'text'], ['photo', 'Photograph (optional)', 'image']],
      render: function (p) { return '<div class="pg"><h2 class="pg-h">' + esc(p.label || 'Notes') + '</h2>' + (img(p.photo) ? '<img class="pg-portrait" src="' + img(p.photo) + '" alt="">' : '') + '<div class="pg-body">' + (p.body ? paras(p.body) : gap(p.label || 'Notes')) + '</div>' + (p.author ? '<p class="pg-by">' + esc(p.author) + '</p>' : '') + '</div>'; } },
    article: { name: 'Article', fields: [['label', 'Page name (for contents)', 'line'], ['headline', 'Headline', 'line'], ['body', 'Text', 'text'], ['photo', 'Photograph (optional)', 'image'], ['caption', 'Photo caption', 'line']],
      render: function (p) { return '<div class="pg"><div class="pg-kick">' + esc(p.label || '') + '</div><h2 class="pg-h">' + (p.headline ? esc(p.headline) : gap('Headline')) + '</h2>' + (img(p.photo) ? '<figure class="pg-fig"><img src="' + img(p.photo) + '" alt=""><figcaption>' + esc(p.caption || '') + '</figcaption></figure>' : '') + '<div class="pg-body">' + (p.body ? paras(p.body) : gap('Article')) + '</div></div>'; } },
    opposition: { name: 'The opposition', fields: [['body', 'About today\'s visitors', 'text'], ['source', 'Where the facts came from', 'line']],
      render: function (p, e) { var f = e.fixture; return '<div class="pg"><div class="pg-kick">Today\'s visitors</div><h2 class="pg-h">' + esc(f.opponent) + '</h2>' + (img(f.oppCrest) ? '<img class="pg-crest" src="' + img(f.oppCrest) + '" alt="">' : '') + '<div class="pg-body">' + (p.body ? paras(p.body) : gap('Opposition profile')) + '</div>' + (p.source ? '<p class="pg-src">Source: ' + esc(p.source) + '</p>' : '') + '</div>'; } },
    squad: { name: 'Squad portraits', fields: [['part', 'Which players (1 = first half, 2 = second half)', 'line']],
      render: function (p, e) { var s = e.squad || [], h = Math.ceil(s.length / 2), list = p.part === '2' ? s.slice(h) : s.slice(0, h);
        return '<div class="pg pg--green"><h2 class="pg-h">The Squad' + (p.part === '2' ? ' (continued)' : '') + '</h2><div class="pg-squad">' + list.map(function (x) { var u = img(x.photo); return '<div><span class="pg-face"' + (u ? ' style="background-image:url(\'' + u + '\')"' : '') + '></span><b>' + esc(x.name) + '</b><small>' + esc(x.pos || '') + '</small></div>'; }).join('') + '</div><p class="pg-note">Club squad — subject to selection. Not today\'s team sheet.</p></div>'; } },
    teams: { name: 'Squads for today', fields: [['away', 'Visitors\' squad (one name per line, if supplied)', 'text']],
      render: function (p, e) { var away = String(p.away || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        return '<div class="pg"><h2 class="pg-h">Squads</h2><p class="pg-note">Squads subject to selection. The official team sheet is announced at the ground.</p><div class="pg-cols"><div><h3>Rayners Lane FC</h3><ol>' + (e.squad || []).map(function (x) { return '<li>' + esc(x.name) + '</li>'; }).join('') + '</ol></div><div><h3>' + esc(e.fixture.opponent) + '</h3>' + (away.length ? '<ol>' + away.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' : gap('Visitors\' squad')) + '</div></div></div>'; } },
    results: { name: 'Results this season', fields: [],
      render: function (p, e) { var r = DATA.fixtures.filter(function (x) { return x.season === e.fixture.season && x.us != null && x.them != null && x.date < e.fixture.date; });
        return '<div class="pg"><h2 class="pg-h">Results</h2>' + (r.length ? '<table class="pg-tab"><tbody>' + r.map(function (x) { return '<tr><td>' + esc(new Date(x.date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })) + '</td><td>' + (x.isHome ? 'H' : 'A') + '</td><td>' + esc(x.opponent) + '</td><td><b>' + esc(x.us) + '–' + esc(x.them) + '</b></td></tr>'; }).join('') + '</tbody></table>' : '<p class="pg-note">No results recorded yet this season.</p>') + '</div>'; } },
    fixtures: { name: 'Forthcoming fixtures', fields: [],
      render: function (p, e) { var r = DATA.fixtures.filter(function (x) { return x.date > e.fixture.date && x.status !== 'played'; }).slice(0, 14);
        return '<div class="pg"><h2 class="pg-h">Coming up</h2><table class="pg-tab"><tbody>' + r.map(function (x) { return '<tr><td>' + esc(new Date(x.date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })) + '</td><td>' + (x.isHome ? 'H' : 'A') + '</td><td>' + esc(x.opponent) + '</td><td>' + esc(x.kickoff || '') + '</td></tr>'; }).join('') + '</tbody></table><p class="pg-note">Fixtures can change — check raynerslanefc.co.uk.</p></div>'; } },
    info: { name: 'Supporter information', fields: [['body', 'Extra notes for supporters (optional)', 'text']],
      render: function (p) { var a = DATA.admission;
        return '<div class="pg"><h2 class="pg-h">At the Lane</h2>' + (a ? '<div class="pg-box"><h3>' + esc(a.heading || 'Admission') + '</h3><table class="pg-tab"><tbody>' + a.prices.map(function (x) { return '<tr><td>' + esc(x.label) + (x.note ? ' <small>(' + esc(x.note) + ')</small>' : '') + '</td><td><b>' + esc(x.price) + '</b></td></tr>'; }).join('') + '</tbody></table></div>' : '') + '<div class="pg-body">' + paras(p.body) + '<p>Tithe Farm Sports &amp; Social Club, 151 Rayners Lane, Harrow HA2 0XH.<br>raynerslanefc.co.uk</p></div></div>'; } },
    advert: { name: 'Advert', fields: [['label', 'Advertiser name', 'line'], ['photo', 'Advert artwork (picture, or a page from a PDF)', 'image'], ['size', 'Size: full, half or quarter', 'line']],
      render: function (p) { var u = img(p.photo); var size = /^(full|half|quarter)$/.test(p.size || '') ? p.size : 'full'; return '<div class="pg pg--ad">' + (u ? '<img class="pg-ad pg-ad--' + size + '" src="' + u + '" alt="">' : '<div class="pg-adgap">Advert space<br><small>' + esc(p.label || 'No artwork uploaded yet') + '</small></div>') + '</div>'; } },
    back: { name: 'Back cover', fields: [['body', 'Back cover message', 'text'], ['photo', 'Back cover image (optional)', 'image']],
      render: function (p) { return '<div class="pg pg--cover"' + bg(p.photo) + '><img class="pg-back__badge" src="img/badge-512.png" alt=""><div class="pg-body pg-back__body">' + paras(p.body) + '</div><div class="pg-back__foot">Rayners Lane FC · Est. 1933 · raynerslanefc.co.uk</div></div>'; } }
  };
  function bg(src) { var u = img(src); return u ? ' style="background-image:linear-gradient(rgba(6,40,20,.35),rgba(6,40,20,.85)),url(\'' + u + '\')"' : ''; }
  function firstVis() { for (var i = 0; i < ed.doc.pages.length; i++) if (!ed.doc.pages[i].hidden) return i; return -1; }
  function lastVis() { for (var i = ed.doc.pages.length - 1; i >= 0; i--) if (!ed.doc.pages[i].hidden) return i; return -1; }
  function visNo(i) { var n = 0; for (var k = 0; k <= i; k++) if (!ed.doc.pages[k].hidden) n++; return n; }

  // Suggested 24-page running order: a template, not copy — every text field starts empty.
  function template() {
    var P = function (type, label, role, extra) { return Object.assign({ id: rid(), type: type, label: label || '' }, role ? { role: role } : {}, extra || {}); };
    return [P('cover', 'Front cover'), P('advert', 'Inside front cover'), P('contents', 'Contents'), P('article', 'Club directory', 'directory'),
      P('notes', 'Chairman\'s notes', 'chair'), P('notes', 'Manager\'s notes', 'manager'), P('article', 'Match preview', 'preview'), P('opposition', 'The opposition', 'opposition'),
      P('squad', 'The squad', null, { part: '1' }), P('squad', 'The squad (continued)', null, { part: '2' }), P('teams', 'Squads for today'),
      P('advert', 'Advert'), P('advert', 'Advert'), P('article', 'Story of the Lane', 'history'), P('article', 'Story of the Lane (continued)', 'history2'),
      P('article', 'Last match report', 'report'), P('results', 'Results'), P('fixtures', 'Coming up'), P('article', 'Community and academy', 'community'),
      P('article', 'Player sponsors', 'sponsors'), P('article', 'Feature', 'feature'), P('info', 'Supporter information'), P('advert', 'Inside back cover'), P('back', 'Back cover')];
  }
  function squadSnapshot() { return DATA.squad.map(function (x) { return { id: x.id, name: x.name, pos: x.pos || '', no: x.no || null, photo: x.photo || '' }; }); }

  /* ── SERVER ──────────────────────────────────────────────────────────── */
  function api(body) {
    return fetch(EP, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.token }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'The club\'s server sent an unexpected reply.' }; }).then(function (j) { j.http = r.status; if (r.status === 401) sessionExpired(); return j; }); })
      .catch(function () { return { ok: false, network: true, error: 'No connection to the club\'s server.' }; });
  }
  function status(t, k) { var s = $('ps-status'); s.textContent = t; s.dataset.k = k || ''; }

  /* ── SIGN IN ─────────────────────────────────────────────────────────── */
  function restoreSession() {
    try { var s = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null'); if (s && s.token && s.expires > Date.now() + 60000) { S.token = s.token; return true; } } catch (e) {}
    return false;
  }
  function signIn(username, password) {
    return fetch('/.netlify/functions/md-session', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personal: true, username: username, password: password }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) {
          var why = { 'wrong-password': 'That name and password do not match. Check them and try again.', 'account-disabled': 'This account has been switched off. Please speak to the Chairman.',
            'no-personal-password': 'You do not have a personal password yet. Ask the Chairman to set one up for you in Staff HQ.' }[j.error];
          throw new Error(why || 'Signing in did not work just now. Please try again in a minute.');
        }
        S.token = j.token;
        try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: j.token, expires: Date.now() + (j.expiresInMs || 3600000) })); } catch (e) {}
        return whoami();
      });
  }
  function whoami() {
    return api({ action: 'whoami' }).then(function (r) {
      if (!r.ok) { if (r.http === 403) throw new Error('Your account does not have permission to prepare the programme. Ask the Chairman to give your role "Edit programme".'); throw new Error(r.error || 'Could not check your account.'); }
      S.user = r.username; S.role = r.role; S.canPublish = !!r.canPublish; S.production = !!r.production;
      $('ps-who').textContent = r.username + ' · ' + r.role + (r.canPublish ? ' · can publish' : '');
      $('ps-who').hidden = false; $('btn-signout').hidden = false;
      if (!S.production) document.body.classList.add('is-preview');
    });
  }
  function sessionExpired() {
    S.token = null;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
    status('Signed out — sign in again to save', 'bad');
    dialog('Please sign in again', '<p>For safety, sessions end after a while. Your changes are still here and kept on this computer.</p>' +
      '<form id="re-form"><label class="ps-label" for="re-user">Your staff name</label><input class="ps-input" id="re-user" autocomplete="username" required value="' + esc(S.user || '') + '">' +
      '<label class="ps-label" for="re-pass">Your password</label><input class="ps-input" id="re-pass" type="password" autocomplete="current-password" required>' +
      '<p class="ps-error" id="re-err" role="alert" hidden></p><button class="ps-btn ps-btn--main" type="submit">Sign in and carry on</button></form>');
    $('re-form').addEventListener('submit', function (e) {
      e.preventDefault();
      signIn($('re-user').value.trim(), $('re-pass').value).then(function () { closeDialog(); if (dirty) save(); })
        .catch(function (x) { $('re-err').textContent = x.message; $('re-err').hidden = false; });
    });
  }

  /* ── DIALOG ──────────────────────────────────────────────────────────── */
  var lastFocus = null;
  function dialog(title, html) {
    lastFocus = document.activeElement;
    $('dialog-h').textContent = title; $('dialog-body').innerHTML = html + '<p><button class="ps-btn ps-btn--plain" type="button" data-close>Close</button></p>';
    $('dialog').hidden = false;
    var f = $('dialog').querySelector('input,button,select,textarea'); if (f) f.focus();
  }
  function closeDialog() { $('dialog').hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }

  /* ── STEPS ───────────────────────────────────────────────────────────── */
  function show(id) {
    ['step-signin', 'step-start', 'step-edit', 'step-check'].forEach(function (s) { $(s).hidden = s !== id; });
    $('ps-h1').hidden = !(id === 'step-signin' || id === 'step-start');
    window.scrollTo(0, 0);
  }
  var STATUS_LABEL = { draft: 'Draft', review: 'Ready for review', approved: 'Approved' };
  function startScreen() {
    var today = new Date().toISOString().slice(0, 10);
    var home = DATA.fixtures.filter(function (f) { return f.isHome && f.date >= today && !/postponed|cancel|abandon|played/i.test(f.status || ''); });
    $('fx-pick').innerHTML = home.map(function (f) { return '<option value="' + esc(f.id) + '">' + esc(ukDate(f.date)) + ' — ' + esc(f.opponent) + ' (' + esc(f.competition || '') + ')</option>'; }).join('');
    $('fx-hint').textContent = home.length ? home.length + ' home matches to come. You can prepare any of them, not just the next one.' : 'There are no upcoming home matches in the fixture list. Add the match on the Fixtures page first.';
    $('btn-new').disabled = !home.length;
    show('step-start');
    api({ action: 'list' }).then(function (r) {
      if (!r.ok) { $('drafts').innerHTML = '<li class="ps-error">' + esc(r.error || 'Could not load programmes.') + ' <button class="ps-btn ps-btn--plain" type="button" data-retry-list>Try again</button></li>'; return; }
      $('drafts').innerHTML = r.drafts.length ? r.drafts.map(function (d) {
        return '<li><button class="ps-btn ps-btn--plain" data-open="' + esc(d.fixtureId) + '" type="button">' + esc(ukDate(d.date)) + ' — ' + esc(d.opponent) + '</button>' +
          '<span class="ps-pill ps-pill--' + esc(d.status) + '">' + esc(STATUS_LABEL[d.status] || d.status) + '</span>' +
          '<span class="ps-hint">Version ' + esc(d.revision) + ', saved by ' + esc(d.savedBy) + ', ' + esc(ukWhen(d.savedAt)) + '</span></li>';
      }).join('') : '<li class="ps-hint">No programmes started yet.</li>';
    });
    loadProfile();
  }

  /* ── PRINTER PROFILE (set once) ──────────────────────────────────────── */
  function loadProfile() {
    return api({ action: 'get_profile' }).then(function (r) { if (r.ok) { profile = r.profile; renderProfile(); } });
  }
  function profileReady(p) { return !!(p && p.confirmed && p.colour === 'rgb' && p.standard === 'none'); }
  function renderProfile() {
    var p = profile; if (!p) return;
    var h = '<h2>Printer settings</h2>' + (p.confirmed
      ? '<p>Confirmed with ' + esc(p.printer || 'the printer') + ' by ' + esc(p.confirmedBy || '') + ' on ' + esc(ukWhen(p.confirmedAt)) + '.</p>'
      : '<p class="ps-warn">Not yet confirmed with the printer. Until it is, every PDF is labelled a <strong>proof</strong>.</p>') +
      '<ul class="ps-facts"><li>Size: ' + (p.trim === 'A4' ? 'A4 (210 × 297 mm)' : 'A5 (148 × 210 mm)') + '</li><li>Bleed: ' + esc(p.bleedMm) + ' mm on every side</li>' +
      '<li>Colour the printer accepts: ' + ({ rgb: 'RGB (screen colour) is accepted', cmyk: 'CMYK required — this tool cannot make it', unknown: 'not yet asked' }[p.colour] || 'not yet asked') + '</li></ul>';
    if (S.canPublish) h += '<button class="ps-btn ps-btn--plain" type="button" id="btn-profile">Change printer settings</button>';
    $('profile-card').innerHTML = h;
  }
  function editProfile() {
    var p = profile;
    dialog('Printer settings', '<form id="pf-form">' +
      '<label class="ps-label" for="pf-printer">Printer\'s name</label><input class="ps-input" id="pf-printer" value="' + esc(p.printer) + '">' +
      '<label class="ps-label" for="pf-trim">Booklet size</label><select class="ps-input" id="pf-trim"><option value="A5"' + (p.trim === 'A5' ? ' selected' : '') + '>A5 (148 × 210 mm)</option><option value="A4"' + (p.trim === 'A4' ? ' selected' : '') + '>A4 (210 × 297 mm)</option></select>' +
      '<label class="ps-label" for="pf-bleed">Bleed in millimetres (usually 3)</label><input class="ps-input" id="pf-bleed" inputmode="decimal" value="' + esc(p.bleedMm) + '">' +
      '<label class="ps-label" for="pf-colour">Colour the printer accepts</label><select class="ps-input" id="pf-colour"><option value="unknown">Not yet asked</option><option value="rgb"' + (p.colour === 'rgb' ? ' selected' : '') + '>RGB is fine</option><option value="cmyk"' + (p.colour === 'cmyk' ? ' selected' : '') + '>CMYK only</option></select>' +
      '<label class="ps-label" for="pf-std">PDF standard the printer requires</label><select class="ps-input" id="pf-std"><option value="none">None</option><option value="pdfx1a"' + (p.standard === 'pdfx1a' ? ' selected' : '') + '>PDF/X-1a</option><option value="pdfx4"' + (p.standard === 'pdfx4' ? ' selected' : '') + '>PDF/X-4</option></select>' +
      '<label class="ps-check"><input type="checkbox" id="pf-ok"' + (p.confirmed ? ' checked' : '') + '> I have confirmed these settings with the printer</label>' +
      '<p class="ps-hint">If the printer requires CMYK or PDF/X, this tool can only make proofs; the printer (or a designer) must convert the file.</p>' +
      '<button class="ps-btn ps-btn--main" type="submit">Save printer settings</button></form>');
    $('pf-form').addEventListener('submit', function (e) {
      e.preventDefault();
      api({ action: 'set_profile', profile: { printer: $('pf-printer').value, trim: $('pf-trim').value, bleedMm: $('pf-bleed').value,
        colour: $('pf-colour').value, standard: $('pf-std').value, confirmed: $('pf-ok').checked } })
        .then(function (r) { if (r.ok) { profile = r.profile; renderProfile(); closeDialog(); } else alert(r.error || 'Not saved.'); });
    });
  }

  /* ── OPEN / CREATE ───────────────────────────────────────────────────── */
  function startNew(fixtureId) {
    var f = DATA.fixtures.filter(function (x) { return x.id === fixtureId; })[0];
    api({ action: 'get', fixtureId: fixtureId }).then(function (r) {
      if (r.ok && r.draft) { dialog('There is already a programme for this match', '<p>Version ' + esc(r.draft.revision) + ' was saved by ' + esc(r.draft.savedBy) + ' on ' + esc(ukWhen(r.draft.savedAt)) + '.</p><button class="ps-btn ps-btn--main" type="button" data-open="' + esc(fixtureId) + '">Open it</button>'); return; }
      if (!r.ok) { status(r.error || 'Could not reach the club\'s server.', 'bad'); return; }
      var doc = { fixture: { id: f.id, date: f.date, kickoff: f.kickoff, opponent: f.opponent, oppCrest: f.oppCrest || '', competition: f.competition || '', venue: f.venue || '', season: f.season || '' },
        pages: template(), status: 'draft', printDeadline: '', squad: squadSnapshot(), squadAsOf: DATA.squadAsOf };
      open({ fixtureId: f.id, revision: 0, status: 'draft', doc: doc });
      dirty = true; save();
    });
  }
  function openFromServer(fixtureId) {
    status('Opening…');
    api({ action: 'get', fixtureId: fixtureId }).then(function (r) {
      if (!r.ok || !r.draft) { status(r.error || 'Could not open that programme.', 'bad'); return; }
      open(r.draft);
      offerLocalRecovery();
    });
  }
  function open(d) {
    ed = { fixtureId: d.fixtureId, revision: d.revision || 0, status: d.status || (d.doc && d.doc.status) || 'draft', savedAt: d.savedAt, savedBy: d.savedBy, doc: d.doc };
    cur = 0; undo = []; redo = []; dirty = false; $('notice').innerHTML = ''; $('notice').hidden = true;
    $('ed-title').textContent = 'v ' + ed.doc.fixture.opponent + ' · ' + ukDate(ed.doc.fixture.date);
    renderAll(); show('step-edit');
    status(ed.revision ? 'Saved on the club\'s server (version ' + ed.revision + ')' : 'Not saved yet', ed.revision ? 'ok' : '');
    notices();
  }

  /* ── NOTICES: unsaved work, squad updates, changed match details ─────── */
  function backupKey() { return BACKUP + ed.fixtureId; }
  function writeBackup() { try { localStorage.setItem(backupKey(), JSON.stringify({ baseRevision: ed.revision, at: new Date().toISOString(), doc: ed.doc })); } catch (e) {} }
  function clearBackup() { try { localStorage.removeItem(backupKey()); } catch (e) {} }
  function offerLocalRecovery() {
    var b; try { b = JSON.parse(localStorage.getItem(backupKey()) || 'null'); } catch (e) { b = null; }
    if (!b || !b.doc || JSON.stringify(b.doc.pages) === JSON.stringify(ed.doc.pages)) { clearBackup(); return; }
    var older = b.baseRevision < ed.revision;
    notice('<strong>This computer has changes that did not reach the server</strong> (made ' + esc(ukWhen(b.at)) + ').' +
      (older ? ' Someone has saved a newer version since, so recovering them would replace theirs — the newer version stays in Versions.' : '') +
      ' <button class="ps-btn ps-btn--plain" type="button" data-recover>Recover my changes</button> <button class="ps-btn ps-btn--plain" type="button" data-discard>Discard them</button>', 'warn', 'recover');
  }
  function notices() {
    var f = DATA.fixtures.filter(function (x) { return x.id === ed.fixtureId; })[0];
    var bits = [];
    if (f) {
      if (/postponed|cancel|abandon/i.test(f.status || '')) bits.push(['bad', 'This match is now marked <strong>' + esc(f.status) + '</strong> in the fixture list. Do not send this programme to the printer until the new date is known.']);
      var diff = ['date', 'kickoff', 'venue', 'competition'].filter(function (k) { return (f[k] || '') !== (ed.doc.fixture[k] || ''); });
      if (diff.length) bits.push(['warn', 'The match details have changed in the fixture list (' + esc(diff.join(', ')) + '). <button class="ps-btn ps-btn--plain" type="button" data-fixture-update>Use the new details</button>']);
    } else bits.push(['warn', 'This match is no longer in the fixture list. Check with the fixtures secretary before printing.']);
    if (DATA.squadAsOf && ed.doc.squadAsOf !== DATA.squadAsOf) bits.push(['warn', '<strong>Squad updates available.</strong> The club squad has changed since this programme was started. <button class="ps-btn ps-btn--plain" type="button" data-squad-compare>See the changes</button>']);
    if (bits.length) notice(bits.map(function (b) { return '<p class="ps-n ps-n--' + b[0] + '">' + b[1] + '</p>'; }).join(''), 'info', 'data');
  }
  function notice(html, kind, tag) {
    var n = $('notice');
    var old = n.querySelector('[data-tag="' + tag + '"]'); if (old) old.remove();
    var div = document.createElement('div'); div.dataset.tag = tag; div.className = 'ps-notice__item ps-notice__item--' + kind; div.innerHTML = html;
    n.appendChild(div); n.hidden = false;
  }
  function dropNotice(tag) { var n = $('notice'), old = n.querySelector('[data-tag="' + tag + '"]'); if (old) old.remove(); n.hidden = !n.children.length; }
  function squadCompare() {
    var was = {}, now = {};
    (ed.doc.squad || []).forEach(function (x) { was[x.id || x.name] = x; });
    squadSnapshot().forEach(function (x) { now[x.id || x.name] = x; });
    var added = Object.keys(now).filter(function (k) { return !was[k]; }).map(function (k) { return now[k].name; });
    var left = Object.keys(was).filter(function (k) { return !now[k]; }).map(function (k) { return was[k].name; });
    var upd = Object.keys(now).filter(function (k) { return was[k] && (was[k].name !== now[k].name || was[k].photo !== now[k].photo || was[k].pos !== now[k].pos); }).map(function (k) { return now[k].name; });
    dialog('Squad changes since this programme was started', '<p>Nothing changes until you choose. A PDF already made is never altered.</p>' +
      '<h3>New to the squad</h3><p>' + (added.length ? added.map(esc).join(', ') : 'None') + '</p>' +
      '<h3>No longer in the current squad</h3><p>' + (left.length ? left.map(esc).join(', ') : 'None') + '</p>' +
      '<h3>Name, position or photo updated</h3><p>' + (upd.length ? upd.map(esc).join(', ') : 'None') + '</p>' +
      '<button class="ps-btn ps-btn--main" type="button" data-squad-apply>Use the updated squad</button> <button class="ps-btn ps-btn--plain" type="button" data-squad-keep>Keep the squad as it is</button>');
  }

  /* ── EDITING, UNDO, SAVE ─────────────────────────────────────────────── */
  function snapshot() { return JSON.stringify({ pages: ed.doc.pages, fixture: ed.doc.fixture, squad: ed.doc.squad, squadAsOf: ed.doc.squadAsOf, printDeadline: ed.doc.printDeadline, cur: cur }); }
  function beforeChange(typing) {
    var now = Date.now();
    if (typing && now - lastSnapAt < 1500) { lastSnapAt = now; return; }   // one undo step per burst of typing
    lastSnapAt = now; undo.push(snapshot()); if (undo.length > 60) undo.shift(); redo = [];
  }
  function applySnap(s) { var x = JSON.parse(s); ed.doc.pages = x.pages; ed.doc.fixture = x.fixture; ed.doc.squad = x.squad; ed.doc.squadAsOf = x.squadAsOf; ed.doc.printDeadline = x.printDeadline; cur = Math.max(0, Math.min(x.cur, ed.doc.pages.length - 1)); }
  function doUndo() { if (!undo.length) return; redo.push(snapshot()); applySnap(undo.pop()); renderAll(); changed(); }
  function doRedo() { if (!redo.length) return; undo.push(snapshot()); applySnap(redo.pop()); renderAll(); changed(); }
  function changed() {
    dirty = true; editSeq++; writeBackup();
    if (ed.status === 'approved') { ed.status = 'review'; renderFlow(); }
    status('Changes not saved yet…');
    clearTimeout(saveTimer); saveTimer = setTimeout(save, 2000);
    renderPreview(); renderThumbs(); updateUndoButtons();
  }
  function updateUndoButtons() { $('btn-undo').disabled = !undo.length; $('btn-redo').disabled = !redo.length; }

  function save() {
    if (!ed) return Promise.resolve();
    if (saving) return saving.then(function () { return dirty ? save() : { ok: true }; });
    clearTimeout(saveTimer); clearTimeout(retryTimer);
    var seq = editSeq;
    var doc = Object.assign({}, ed.doc, { status: ed.status });
    status('Saving…');
    saving = api({ action: 'save', fixtureId: ed.fixtureId, baseRevision: ed.revision, doc: doc }).then(function (r) {
      saving = null;
      if (r.ok) {
        ed.revision = r.revision; ed.savedAt = r.savedAt; ed.savedBy = r.savedBy; ed.status = r.draftStatus || ed.status; ed.doc.status = ed.status;
        if (seq === editSeq) { dirty = false; clearBackup(); }
        status('Saved on the club\'s server at ' + ukTime(r.savedAt) + ' (version ' + r.revision + ')', 'ok');
        renderFlow(); dropNotice('save');
        return r;
      }
      if (r.conflict) { conflict(r.current); return r; }
      if (r.http === 401) return r;
      status('Not saved — ' + (r.network ? 'no connection to the club\'s server' : (r.error || 'the server refused it')) + '. Your changes are kept on this computer.', 'bad');
      notice('Your latest changes are <strong>not yet saved</strong> on the club\'s server. They are kept on this computer. <button class="ps-btn ps-btn--plain" type="button" data-retry-save>Try saving again</button>', 'bad', 'save');
      retryTimer = setTimeout(save, 30000);
      return r;
    });
    return saving;
  }
  function conflict(theirs) {
    clearTimeout(retryTimer); clearTimeout(saveTimer);
    status('Someone else saved this programme — please choose', 'bad');
    var mine = ed.doc;
    // Compare what a person would notice: the words, pictures, order and visibility.
    var norm = function (p) { var o = { type: p.type, label: p.label || '', hidden: !!p.hidden }; T[p.type].fields.forEach(function (f) { o[f[0]] = p[f[0]] || ''; }); return JSON.stringify(o); };
    var theirPages = theirs && theirs.doc ? theirs.doc.pages : [];
    var diff = theirPages.map(function (p, i) {
      var m = mine.pages.filter(function (q) { return q.id === p.id; })[0];
      return (!m || norm(m) !== norm(p) || mine.pages.indexOf(m) !== i) ? (p.label || T[p.type].name) : null;
    }).filter(Boolean).concat(mine.pages.filter(function (m) { return !theirPages.some(function (p) { return p.id === m.id; }); }).map(function (m) { return (m.label || T[m.type].name) + ' (only in yours)'; }));
    ed._theirs = theirs;
    dialog('Someone else saved this programme', '<p><strong>' + esc(theirs ? theirs.savedBy : 'Another editor') + '</strong> saved version ' + esc(theirs ? theirs.revision : '?') + ' at ' + esc(theirs ? ukWhen(theirs.savedAt) : '') + ', while you were editing.</p>' +
      (diff.length ? '<p>Pages that differ: ' + diff.map(esc).join(', ') + '.</p>' : '') +
      '<p>Nothing has been overwritten. Choose what to do:</p>' +
      '<button class="ps-btn ps-btn--main" type="button" data-conflict="theirs">Use their version</button> ' +
      '<button class="ps-btn ps-btn--plain" type="button" data-conflict="mine">Keep my changes (theirs stays in Versions)</button>' +
      '<p class="ps-hint">Using their version keeps your changes on this computer, so you can recover them afterwards.</p>');
  }

  /* ── RENDER ──────────────────────────────────────────────────────────── */
  function renderAll() { renderFlow(); renderThumbs(); renderForm(); renderPreview(); updateUndoButtons(); }
  function renderFlow() {
    var steps = [['draft', 'Draft'], ['review', 'Ready for review'], ['approved', 'Approved']];
    var at = ['draft', 'review', 'approved'].indexOf(ed.status);
    var h = '<ol class="ps-flow__steps">' + steps.map(function (s, i) { return '<li class="' + (i < at ? 'is-done' : i === at ? 'is-now' : '') + '"' + (i === at ? ' aria-current="step"' : '') + '>' + s[1] + '</li>'; }).join('') + '</ol>';
    h += '<label class="ps-flow__deadline">Printer deadline <input type="date" id="deadline" value="' + esc(ed.doc.printDeadline || '') + '"></label>';
    if (ed.doc.printDeadline) { var days = Math.round((Date.parse(ed.doc.printDeadline + 'T12:00:00Z') - Date.now()) / 864e5); h += '<span class="ps-flow__days">' + (days < 0 ? 'Deadline passed' : days === 0 ? 'Due today' : days + ' day' + (days === 1 ? '' : 's') + ' to go') + '</span>'; }
    if (ed.status === 'draft') h += '<button class="ps-btn ps-btn--plain" type="button" data-flow="review">Mark ready for review</button>';
    if (ed.status !== 'approved' && S.canPublish) h += '<button class="ps-btn ps-btn--plain" type="button" data-flow="approve">Approve this version</button>';
    $('flow').innerHTML = h;
  }
  function renderThumbs() {
    $('thumbs').innerHTML = ed.doc.pages.map(function (p, i) {
      var tag = p.hidden ? 'Hidden' : (i === firstVis() ? 'Front cover' : (i === lastVis() ? 'Back cover' : 'Page ' + visNo(i)));
      return '<button type="button" class="ps-thumb' + (i === cur ? ' is-on' : '') + (p.hidden ? ' is-hidden' : '') + '" data-i="' + i + '" aria-current="' + (i === cur) + '"><b>' + tag + '</b><span>' + esc(p.label || T[p.type].name) + '</span></button>';
    }).join('') + '<div class="ps-add"><label class="ps-label" for="add-type">Add a page</label><select id="add-type" class="ps-input">' + Object.keys(T).map(function (k) { return '<option value="' + k + '">' + T[k].name + '</option>'; }).join('') + '</select><button class="ps-btn ps-btn--plain" id="btn-add" type="button">Add after this page</button></div>';
  }
  function renderForm(imagesOnly) {
    var p = ed.doc.pages[cur], t = T[p.type];
    if (imagesOnly) { [].forEach.call(document.querySelectorAll('#form img[data-ref]'), function (im) { var u = img(im.dataset.ref); if (u) im.src = u; }); return; }
    var h = '<h2>' + esc(p.label || t.name) + ' <small>(' + t.name + ')</small></h2>';
    h += '<div class="ps-row"><button class="ps-btn ps-btn--plain" data-act="up" type="button">Move up</button><button class="ps-btn ps-btn--plain" data-act="down" type="button">Move down</button><button class="ps-btn ps-btn--plain" data-act="dup" type="button">Duplicate</button><button class="ps-btn ps-btn--plain" data-act="hide" type="button">' + (p.hidden ? 'Show page' : 'Hide page') + '</button><button class="ps-btn ps-btn--danger" data-act="del" type="button">Remove page</button></div>';
    if (p.role === 'chair') h += '<p class="ps-hint">These are the Chairman\'s own words. They appear on the website only with his name in "Written by", and only once approved.</p>';
    if (!t.fields.length) h += '<p class="ps-hint">This page fills itself from the club\'s fixtures, squad and prices. Nothing to type.</p>';
    t.fields.forEach(function (f) {
      var k = f[0], lab = f[1], kind = f[2], id = 'f-' + k;
      h += '<label class="ps-label" for="' + id + '">' + esc(lab) + '</label>';
      if (kind === 'text') h += '<textarea id="' + id + '" class="ps-input ps-text" data-k="' + k + '" rows="10">' + esc(p[k] || '') + '</textarea><p class="ps-hint">Leave a blank line between paragraphs.</p>';
      else if (kind === 'image') {
        if (p[k]) h += '<img class="ps-thumbimg" data-ref="' + esc(p[k]) + '" src="' + img(p[k]) + '" alt="Current picture"><button class="ps-btn ps-btn--plain" data-clear="' + k + '" type="button">Remove picture</button>';
        h += '<input id="' + id + '" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif' + (p.type === 'advert' ? ',application/pdf' : '') + '" data-img="' + k + '" class="ps-input">' +
          '<p class="ps-hint" id="w-' + k + '">' + (p[k + 'Px'] ? 'Picture: ' + esc(p[k + 'Px']) + ' pixels.' : (p.type === 'advert' ? 'A JPG or PNG picture, or a PDF from the advertiser.' : 'A JPG or PNG picture from your phone or computer.')) + '</p>';
      } else h += '<input id="' + id + '" class="ps-input" data-k="' + k + '" value="' + esc(p[k] || '') + '">';
    });
    $('form').innerHTML = h;
  }
  function renderPreview() {
    var p = ed.doc.pages[cur];
    $('pv-label').textContent = p.hidden ? 'Hidden — will not print' : (cur === firstVis() ? 'Front cover' : cur === lastVis() ? 'Back cover' : 'Page ' + visNo(cur) + (visNo(cur) % 2 ? ' (right-hand page)' : ' (left-hand page)'));
    $('preview').innerHTML = renderPage(cur);
  }
  function renderPage(i) { var p = ed.doc.pages[i]; return '<div class="pg-sheet">' + T[p.type].render(p, ed.doc) + (i !== firstVis() && i !== lastVis() ? '<div class="pg-no">' + visNo(i) + '</div>' : '') + '</div>'; }

  /* ── PICTURES IN: resize, strip metadata, upload ─────────────────────── */
  function readImage(file, k) {
    var w = $('w-' + k);
    var say = function (t, bad) { if (w) { w.textContent = t; w.className = 'ps-hint' + (bad ? ' ps-error' : ''); } };
    if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
      say('This is an iPhone HEIC photo, which printers and browsers cannot use. On the iPhone, set Settings › Camera › Formats › Most Compatible, or share the photo by email as "Actual size" from Photos on a Mac — then upload that JPEG copy.', true); return;
    }
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) { importPdfAdvert(file, k); return; }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { say('Please choose a JPG, PNG or WebP picture.', true); return; }
    if (file.size > 25 * 1024 * 1024) { say('That picture is larger than 25 MB. Please use a smaller copy.', true); return; }
    say('Preparing the picture…');
    var url = URL.createObjectURL(file), im = new Image();
    // Browsers apply the phone's rotation (EXIF orientation) when drawing; re-encoding
    // through a canvas also removes location and camera details from the file.
    im.onload = function () { URL.revokeObjectURL(url); upload(im, k, file.name); };
    im.onerror = function () { URL.revokeObjectURL(url); say('That file could not be opened as a picture. Please use a JPG or PNG.', true); };
    im.src = url;
  }
  function upload(im, k, source, then) {
    var max = 2600, s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
    var c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
    var cx = c.getContext('2d');
    cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, c.width, c.height);   // transparent areas print white, never black
    cx.drawImage(im, 0, 0, c.width, c.height);
    var dataUrl = c.toDataURL('image/jpeg', 0.9);
    var w = $('w-' + k);
    if (w) w.textContent = 'Uploading…';
    var page = ed.doc.pages[cur];
    api({ action: 'asset_put', dataUrl: dataUrl, meta: { width: c.width, height: c.height, source: String(source || '').slice(0, 100) } }).then(function (r) {
      if (!r.ok) { if (w) { w.textContent = r.error || 'The picture could not be uploaded. Nothing changed — please try again.'; w.className = 'ps-hint ps-error'; } return; }
      var sha = r.ref.slice(6); ASSET[sha] = URL.createObjectURL(dataUrlToBlob(dataUrl));
      beforeChange();
      page[k] = r.ref; page[k + 'Px'] = im.naturalWidth + '×' + im.naturalHeight;
      if (then) then(page);
      renderForm(); changed();
      var w2 = $('w-' + k);
      if (w2) w2.textContent = im.naturalWidth < 1200 ? 'Uploaded. This picture is only ' + im.naturalWidth + ' pixels wide, so it may look soft when printed large — ask for a bigger original if you can.' : 'Uploaded. Picture size is good for print.';
    });
  }
  function dataUrlToBlob(d) { var p = d.split(','), b = atob(p[1]), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return new Blob([a], { type: 'image/jpeg' }); }

  /* Advert supplied as a PDF: choose the page, render it at 300 ppi for the
     page size, check its shape, and keep it as artwork. pdf.js is loaded only
     when needed, from a pinned version with integrity checks. */
  var PDFJS = { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', sri: 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e',
    worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js', workerSri: 'sha384-SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2' };
  var pdfjsReady = null;
  function loadPdfjs() {
    if (pdfjsReady) return pdfjsReady;
    pdfjsReady = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = PDFJS.src; s.integrity = PDFJS.sri; s.crossOrigin = 'anonymous';
      s.onload = function () {
        fetch(PDFJS.worker, { integrity: PDFJS.workerSri, mode: 'cors' }).then(function (r) { return r.blob(); }).then(function (b) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(b); res(window.pdfjsLib);
        }).catch(rej);
      };
      s.onerror = rej; document.head.appendChild(s);
    }).catch(function (e) { pdfjsReady = null; throw e; });
    return pdfjsReady;
  }
  function importPdfAdvert(file, k) {
    var w = $('w-' + k);
    var say = function (t, bad) { if (w) { w.textContent = t; w.className = 'ps-hint' + (bad ? ' ps-error' : ''); } };
    if (file.size > 40 * 1024 * 1024) { say('That PDF is larger than 40 MB. Ask the advertiser for a smaller copy.', true); return; }
    say('Opening the PDF…');
    var meta = {};
    Promise.all([loadPdfjs(), file.arrayBuffer()]).then(function (x) {
      return x[0].getDocument({ data: new Uint8Array(x[1]), isEvalSupported: false }).promise;
    }).then(function (pdf) {
      var choose = pdf.numPages === 1 ? Promise.resolve(1) : new Promise(function (res) {
        dialog('Which page is the advert?', '<p>This PDF has ' + pdf.numPages + ' pages.</p><label class="ps-label" for="pdf-pg">Page number</label><input class="ps-input" id="pdf-pg" type="number" min="1" max="' + pdf.numPages + '" value="1"><button class="ps-btn ps-btn--main" type="button" id="pdf-go">Use this page</button>');
        $('pdf-go').addEventListener('click', function () { var n = Math.min(pdf.numPages, Math.max(1, parseInt($('pdf-pg').value, 10) || 1)); closeDialog(); res(n); });
      });
      return choose.then(function (n) { return pdf.getPage(n); });
    }).then(function (page) {
      var vp1 = page.getViewport({ scale: 1 });   // points
      var size = /^(full|half|quarter)$/.test(ed.doc.pages[cur].size || '') ? ed.doc.pages[cur].size : 'full';
      var targetMm = { full: [148, 210], half: [148, 105], quarter: [74, 105] }[size];
      meta.ratio = vp1.width / vp1.height; meta.want = targetMm[0] / targetMm[1]; meta.size = size; meta.mm = [Math.round(vp1.width / 72 * 25.4), Math.round(vp1.height / 72 * 25.4)]; meta.target = targetMm;
      var scale = Math.min((targetMm[0] / 25.4 * 300) / vp1.width, 6);   // 300 ppi across the printed width
      var vp = page.getViewport({ scale: scale });
      var c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      var ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
        var im = new Image();
        im.onload = function () {
          upload(im, k, file.name + ' (PDF)', function (pg) { pg.source = 'pdf'; });
          if (Math.abs(meta.ratio - meta.want) / meta.want > 0.04) setTimeout(function () { say('Imported. This advert is not the same shape as a ' + meta.size + ' page (it is ' + meta.mm[0] + ' × ' + meta.mm[1] + ' mm), so it will have white space around it. Ask the advertiser for ' + meta.target[0] + ' × ' + meta.target[1] + ' mm artwork if you can.'); }, 400);
        };
        im.src = c.toDataURL('image/jpeg', 0.92);
      });
    }).catch(function () { say('That PDF could not be read. It may be damaged or password-protected — ask the advertiser for a JPG or a fresh PDF.', true); });
  }

  /* ── CHECKS, SPREADS ─────────────────────────────────────────────────── */
  function checks() {
    var out = [], vis = ed.doc.pages.filter(function (p) { return !p.hidden; });
    if (vis.length % 4) out.push(['bad', 'The booklet has ' + vis.length + ' pages. A stapled booklet needs a multiple of 4 (' + (Math.ceil(vis.length / 4) * 4) + ' would work). Add or hide pages.', null]);
    var f = DATA.fixtures.filter(function (x) { return x.id === ed.fixtureId; })[0];
    if (f && /postponed|cancel|abandon/i.test(f.status || '')) out.push(['bad', 'This match is marked ' + f.status + ' in the fixture list.', null]);
    if (ed.doc.printDeadline && Date.parse(ed.doc.printDeadline + 'T23:59:00Z') < Date.now()) out.push(['warn', 'The printer deadline has passed.', null]);
    ed.doc.pages.forEach(function (p, i) { if (p.hidden) return; var t = T[p.type];
      var need = { article: ['headline', 'body'], notes: ['body'], opposition: ['body'] }[p.type] || [];
      var missing = need.filter(function (k) { return !p[k]; });
      if (missing.length) out.push(['warn', (p.label || t.name) + ': ' + (missing.length > 1 ? 'headline and text' : missing[0] === 'body' ? 'text' : 'headline') + ' still to be written.', i]);
      if (p.role === 'chair' && p.body && !p.author) out.push(['bad', 'Chairman\'s notes: add the name in "Written by" — they are never printed or published unsigned.', i]);
      if (p.type === 'advert' && !p.photo) out.push(['warn', (p.label || 'Advert') + ': no artwork uploaded — prints as an empty advert space.', i]);
      if (p.photoPx && parseInt(p.photoPx, 10) < 1200) out.push(['warn', (p.label || t.name) + ': picture is only ' + p.photoPx + ' pixels and may print soft.', i]);
      if (p.photo && /^asset:/.test(p.photo) && ASSET[p.photo.slice(6)] === 'missing') out.push(['bad', (p.label || t.name) + ': its picture could not be loaded from the server.', i]);
    });
    if (!ed.doc.fixture.oppCrest) out.push(['warn', 'No crest for ' + ed.doc.fixture.opponent + ' in the club\'s crest library.', null]);
    if (!(ed.doc.squad || []).length) out.push(['warn', 'The squad pages are empty — the club squad could not be loaded.', null]);
    // Text that runs off its page, measured on the real rendered page.
    var stage = $('ps-stage');
    ed.doc.pages.forEach(function (p, i) {
      if (p.hidden) return;
      stage.innerHTML = renderPage(i);
      var pg = stage.querySelector('.pg');
      if (pg && pg.scrollHeight > pg.clientHeight + 2) out.push(['bad', (p.label || T[p.type].name) + ': the text is too long and runs off the page. Shorten it or split it over two pages.', i]);
    });
    stage.innerHTML = '';
    out.sort(function (a, b) { return (a[0] === 'bad' ? 0 : 1) - (b[0] === 'bad' ? 0 : 1); });   // must-fix first
    var mustFix = out.filter(function (c) { return c[0] === 'bad'; }).length;
    $('checks').innerHTML = '<h2>Before you download</h2>' + (out.length ? '<ul class="ps-checks">' + out.map(function (c) { return '<li class="is-' + c[0] + '"><b>' + (c[0] === 'bad' ? 'Must fix' : 'Check') + ':</b> ' + esc(c[1]) + (c[2] != null ? ' <button class="ps-btn ps-btn--plain" data-go="' + c[2] + '" type="button">Open page</button>' : '') + '</li>'; }).join('') + '</ul>' : '<p class="ps-ok">Everything looks complete.</p>') +
      '<p class="ps-hint">' + (mustFix ? 'You can still download a proof to look at, but fix the "Must fix" items before it goes to the printer.' : 'Marked gaps print in yellow so nobody mistakes a proof for the final copy.') + '</p>';
    var idx = ed.doc.pages.map(function (p, i) { return p.hidden ? -1 : i; }).filter(function (i) { return i > -1; });
    var h = '<div class="ps-spread"><div class="ps-blank"></div>' + renderPage(idx[0]) + '</div>';
    for (var k = 1; k < idx.length - 1; k += 2) h += '<div class="ps-spread">' + renderPage(idx[k]) + (idx[k + 1] != null && k + 1 < idx.length - 1 ? renderPage(idx[k + 1]) : '<div class="ps-blank"></div>') + '</div>';
    if (idx.length > 1) h += '<div class="ps-spread">' + renderPage(idx[idx.length - 1]) + '<div class="ps-blank"></div></div>';
    $('spreads').innerHTML = h;
    renderDownload(); renderPublish();
  }

  /* ── DOWNLOAD ────────────────────────────────────────────────────────── */
  function outputKind() {
    if (dirty) return { kind: 'proof', why: 'there are unsaved changes' };
    if (ed.status !== 'approved') return { kind: 'proof', why: 'this version is not approved yet' };
    if (!profileReady(profile)) return { kind: 'proof', why: profile && profile.colour === 'cmyk' ? 'the printer requires CMYK, which this tool cannot make' : 'the printer settings are not confirmed' };
    return { kind: 'print', why: '' };
  }
  function renderDownload() {
    var o = outputKind(), p = profile || { trim: 'A5', bleedMm: 3 };
    $('download-card').innerHTML = '<h2>Download for the printer</h2>' +
      '<p>' + (o.kind === 'print' ? '<strong>Printer file.</strong> Approved version ' + ed.revision + ', made to the confirmed printer settings.' : '<strong>Proof</strong> — because ' + esc(o.why) + '. Fine for checking; not yet for the printer.') + '</p>' +
      '<ul class="ps-facts"><li>' + (p.trim === 'A4' ? 'A4' : 'A5') + ' pages in reading order, front cover first</li><li>' + esc(p.bleedMm) + ' mm bleed, trim and bleed marked in the file</li><li>Real text in the club\'s fonts; colour in RGB</li></ul>' +
      '<button class="ps-btn ps-btn--main" type="button" id="btn-pdf">' + (o.kind === 'print' ? 'Download printer PDF' : 'Download proof PDF') + '</button> ' +
      '<button class="ps-btn ps-btn--plain" type="button" id="btn-pdf-screen">Download a copy for supporters (no bleed)</button>' +
      '<p class="ps-hint">Downloading does not publish anything. The PDF is made from the saved version; to change it, edit here and download again.</p>' +
      '<div id="exports"></div>';
    api({ action: 'history', fixtureId: ed.fixtureId }).then(function (r) {
      var ex = $('exports');
      if (ex && r.ok && r.exports && r.exports.length) ex.innerHTML = '<h3>PDFs made so far</h3><ul class="ps-facts">' + r.exports.slice(0, 8).map(function (x) { return '<li>' + esc(x.filename) + ' — version ' + esc(x.revision) + ', ' + esc(x.kind) + ', by ' + esc(x.by) + ', ' + esc(ukWhen(x.at)) + '</li>'; }).join('') + '</ul>';
    });
  }
  function pdfName(kind, screen) {
    var slug = ed.doc.fixture.opponent.replace(/&/g, 'and').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return 'RLFC-v-' + slug + '-' + ed.doc.fixture.date + '-' + (screen ? 'screen' : kind) + '-v' + ed.revision + '.pdf';
  }
  function makePdf(screen) {
    var btn = $(screen ? 'btn-pdf-screen' : 'btn-pdf'), label = btn.textContent;
    var go = function () {
      btn.disabled = true;
      var o = outputKind(), p = profile || { trim: 'A5', bleedMm: 3 };
      var trim = p.trim === 'A4' ? [210, 297] : [148, 210], bleed = screen ? 0 : (parseFloat(p.bleedMm) || 0);
      var idx = ed.doc.pages.map(function (q, i) { return q.hidden ? -1 : i; }).filter(function (i) { return i > -1; });
      var stage = $('ps-stage');
      stage.style.setProperty('--bleed', bleed + 'mm');
      return allAssetsLoaded().then(function () { return document.fonts && document.fonts.ready; }).then(function () {
        return window.StudioPDF.render({ trimW: trim[0], trimH: trim[1], bleed: bleed, count: idx.length,
          progress: function (n, of) { btn.textContent = 'Making page ' + n + ' of ' + of + '…'; },
          page: function (n) {
            stage.innerHTML = '<div class="pg-bleed' + (p.trim === 'A4' ? ' is-a4' : '') + '">' + renderPage(idx[n]) + '</div>';
            var ims = stage.querySelectorAll('img');
            return Promise.all([].map.call(ims, function (im) { return im.complete ? 0 : new Promise(function (r) { im.onload = im.onerror = r; }); }))
              .then(function () { return stage.querySelector('.pg-sheet'); });
          },
          meta: { title: 'Rayners Lane FC v ' + ed.doc.fixture.opponent + ' — matchday programme, version ' + ed.revision + (o.kind === 'print' && !screen ? '' : ' (proof)'),
            subject: (p.trim || 'A5') + ', ' + bleed + 'mm bleed, RGB' + (o.kind === 'print' && !screen ? ', printer settings confirmed' : ', proof'), creator: 'Rayners Lane FC Programme Studio', author: S.user || '' } });
      }).then(function (res) {
        stage.innerHTML = '';
        var name = pdfName(o.kind, screen);
        var a = document.createElement('a'); a.href = URL.createObjectURL(res.blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
        api({ action: 'record_export', fixtureId: ed.fixtureId, revision: ed.revision, kind: screen ? 'proof' : o.kind, filename: name, sha256: res.sha256, pages: res.pageCount,
          profile: (p.trim || 'A5') + ' ' + bleed + 'mm ' + (p.colour || 'unknown') + (p.confirmed ? ' confirmed' : ' unconfirmed') });
        var soft = res.lowRes.map(function (v, i) { return v ? 'page ' + (i + 1) + ' (' + v + ' ppi)' : null; }).filter(Boolean);
        status('PDF downloaded: ' + res.pageCount + ' pages, version ' + ed.revision + '. Nothing has been published.', 'ok');
        if (soft.length) notice('Some pictures are below 200 ppi at their printed size and may look soft: ' + esc(soft.join(', ')) + '. Bigger originals would print better.', 'warn', 'lowres');
        renderDownload();
      }).catch(function () {
        stage.innerHTML = '';
        status('The PDF could not be made. Your work is saved — please try again.', 'bad');
        dialog('The PDF could not be made', '<p>Your work is safe. You can try again, or make a picture-based proof instead (lower quality, but it always works).</p><button class="ps-btn ps-btn--main" type="button" data-raster>Make a picture-based proof</button>');
      }).then(function () { var b = $(screen ? 'btn-pdf-screen' : 'btn-pdf'); if (b) { b.disabled = false; b.textContent = label; } });
    };
    if (dirty) { save().then(function (r) { if (r && r.ok) go(); else status('Save your changes before downloading.', 'bad'); }); } else go();
  }
  // Fallback only: every page as a picture (html2canvas). Always labelled a proof.
  function rasterProof() {
    var jsPDF = window.jspdf.jsPDF, W = 154, H = 216, stage = $('ps-stage');
    var doc = new jsPDF({ unit: 'mm', format: [W, H], compress: true });
    var idx = ed.doc.pages.map(function (q, i) { return q.hidden ? -1 : i; }).filter(function (i) { return i > -1; });
    stage.style.setProperty('--bleed', '3mm');
    var chain = allAssetsLoaded();
    idx.forEach(function (pi, n) {
      chain = chain.then(function () { stage.innerHTML = '<div class="pg-bleed">' + renderPage(pi) + '</div>'; return html2canvas(stage.firstChild, { scale: 2.6, backgroundColor: '#ffffff', logging: false }); })
        .then(function (cv) { if (n) doc.addPage([W, H]); doc.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, W, H); });
    });
    chain.then(function () { stage.innerHTML = ''; doc.save(pdfName('picture-proof')); closeDialog(); status('Picture-based proof downloaded.', 'ok'); });
  }

  /* ── PUBLISH ─────────────────────────────────────────────────────────── */
  function renderPublish() {
    var c = $('publish-card'), h = '<h2>Publish on the website</h2>';
    if (!S.production) h += '<p class="ps-warn">This is a <strong>test copy</strong> of the website. Publishing here shows the programme only on this test copy — never on raynerslanefc.co.uk.</p>';
    if (!S.canPublish) {
      h += '<p>Publishing needs the Chairman or another committee member with publishing rights. When the programme is ready, press "Mark ready for review" and let them know.</p>';
    } else if (ed.status !== 'approved' || dirty) {
      h += '<p>Approve this version first' + (dirty ? ' (save your changes)' : '') + '. Approving does not publish it.</p><button class="ps-btn ps-btn--plain" type="button" data-flow="approve">Approve this version</button>';
    } else {
      h += '<p>Version ' + ed.revision + ' is approved. Only the written pages (notes, preview, articles) appear on the website; the website adds the teams and the table itself.</p>' +
        '<fieldset class="ps-when"><legend>When should it appear?</legend>' +
        '<label class="ps-check"><input type="radio" name="when" value="now" checked> Now</label>' +
        '<label class="ps-check"><input type="radio" name="when" value="at"> At a time I choose</label> <input class="ps-input ps-input--inline" type="datetime-local" id="when-at" aria-label="Date and time to publish">' +
        '<label class="ps-check"><input type="radio" name="when" value="matchday"> On matchday morning</label></fieldset>' +
        '<button class="ps-btn ps-btn--main" type="button" id="btn-publish">Publish online</button>';
    }
    h += '<div id="pub-result" role="status"></div>';
    c.innerHTML = h;
  }
  function publish() {
    var btn = $('btn-publish'); if (!btn) return;
    var choice = (document.querySelector('input[name="when"]:checked') || {}).value;
    if (choice === 'at' && !$('when-at').value) { $('pub-result').innerHTML = '<p class="ps-error">Choose the date and time.</p>'; return; }
    var when = choice === 'at' ? new Date($('when-at').value).toISOString() : choice;
    btn.disabled = true; btn.textContent = 'Publishing…';
    api({ action: 'publish', fixtureId: ed.fixtureId, baseRevision: ed.revision, when: when }).then(function (r) {
      btn.disabled = false; btn.textContent = 'Publish online';
      var out = $('pub-result');
      if (r.conflict) { conflict(r.current); return; }
      if (!r.ok) { out.innerHTML = '<p class="ps-error">' + esc(r.error || 'Publishing did not work. Nothing has changed.') + '</p>'; return; }
      if (r.state === 'published') out.innerHTML = '<p class="ps-ok">' + (r.correction ? 'Published as a correction' : r.unchanged ? 'Already published — nothing needed changing' : 'Published') + ' — version ' + esc(r.revision) + ', checked on the website at ' + esc(ukTime(r.publishedAt || new Date().toISOString())) + '.</p><a class="ps-btn ps-btn--plain" href="' + esc(r.viewUrl) + '" target="_blank" rel="noopener">View the published programme</a>';
      else if (r.state === 'scheduled') out.innerHTML = '<p class="ps-ok">' + esc(r.message) + '</p>';
      else if (r.state === 'updating') out.innerHTML = '<p class="ps-warn">' + esc(r.message) + '</p><button class="ps-btn ps-btn--plain" type="button" id="btn-publish-check">Check again</button>';
      else out.innerHTML = '<p class="ps-error">' + esc(r.error || 'Publishing did not complete. Nothing was marked as published.') + '</p>';
      status(r.state === 'published' ? 'Published on the website' : r.state === 'scheduled' ? 'Approved and scheduled' : 'Publishing not confirmed yet', r.state === 'published' || r.state === 'scheduled' ? 'ok' : 'bad');
    });
  }

  /* ── HISTORY ─────────────────────────────────────────────────────────── */
  function history() {
    api({ action: 'history', fixtureId: ed.fixtureId }).then(function (r) {
      if (!r.ok) { dialog('Versions', '<p class="ps-error">' + esc(r.error || 'Could not load the versions.') + '</p>'); return; }
      dialog('Versions of this programme', '<p>Every save is kept. Restoring an older version saves it as a new version — nothing is deleted.</p><ul class="ps-versions">' + r.history.map(function (v) {
        return '<li><b>Version ' + esc(v.revision) + '</b> — ' + esc(STATUS_LABEL[v.status] || v.status) + ', saved by ' + esc(v.savedBy) + ', ' + esc(ukWhen(v.savedAt)) + (v.note ? ' (' + esc(v.note) + ')' : '') +
          (v.revision !== ed.revision ? ' <button class="ps-btn ps-btn--plain ps-btn--sm" type="button" data-restore="' + esc(v.revision) + '">Restore this version</button>' : ' <em>(current)</em>') + '</li>';
      }).join('') + '</ul>');
    });
  }

  /* ── EVENTS ──────────────────────────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button,[data-open]'); if (!t) return;
    if (t.hasAttribute('data-close')) return closeDialog();
    if (t.id === 'btn-signout') { if (dirty && !confirm('You have unsaved changes. Sign out anyway? They stay on this computer.')) return; try { sessionStorage.removeItem(TOKEN_KEY); } catch (x) {} dirty = false; location.reload(); return; }
    if (t.id === 'btn-new') return startNew($('fx-pick').value);
    if (t.dataset.open) { closeDialog(); return openFromServer(t.dataset.open); }
    if (t.hasAttribute('data-retry-list')) return startScreen();
    if (t.id === 'btn-profile') return editProfile();
    if (t.id === 'btn-back') { (dirty ? save() : Promise.resolve()).then(startScreen); return; }
    if (t.id === 'btn-save' || t.hasAttribute('data-retry-save')) return save();
    if (t.id === 'btn-undo') return doUndo();
    if (t.id === 'btn-redo') return doRedo();
    if (t.id === 'btn-history') return history();
    if (t.id === 'btn-check') { (dirty ? save() : Promise.resolve()).then(function () { checks(); show('step-check'); }); return; }
    if (t.id === 'btn-back-edit') return show('step-edit');
    if (t.id === 'btn-pdf') return makePdf(false);
    if (t.id === 'btn-pdf-screen') return makePdf(true);
    if (t.hasAttribute('data-raster')) return rasterProof();
    if (t.id === 'btn-publish' || t.id === 'btn-publish-check') return publish();
    if (t.dataset.restore) {
      api({ action: 'restore', fixtureId: ed.fixtureId, revision: +t.dataset.restore, baseRevision: ed.revision }).then(function (r) {
        if (r.conflict) return conflict(r.current);
        if (!r.ok) return status(r.error || 'Not restored.', 'bad');
        closeDialog(); beforeChange(); ed.doc = r.doc; ed.revision = r.revision; ed.status = 'draft'; dirty = false; cur = 0; renderAll();
        status('Restored as version ' + r.revision, 'ok');
      }); return;
    }
    if (t.dataset.flow === 'review') { ed.status = 'review'; ed.doc.status = 'review'; dirty = true; save().then(renderFlow); return; }
    if (t.dataset.flow === 'approve') {
      (dirty ? save() : Promise.resolve({ ok: true })).then(function (s) {
        if (!s || !s.ok) return;
        api({ action: 'approve', fixtureId: ed.fixtureId, baseRevision: ed.revision }).then(function (r) {
          if (r.conflict) return conflict(r.current);
          if (!r.ok) return status(r.error || 'Not approved.', 'bad');
          ed.revision = r.revision; ed.status = 'approved'; ed.doc.status = 'approved'; renderFlow();
          status('Version ' + r.revision + ' approved by ' + S.user, 'ok');
          if (!$('step-check').hidden) checks();
        });
      }); return;
    }
    if (t.dataset.conflict === 'theirs') { closeDialog(); writeBackup(); open(ed._theirs); notice('Your own changes are kept on this computer. <button class="ps-btn ps-btn--plain" type="button" data-recover>Recover my changes</button>', 'warn', 'recover'); return; }
    if (t.dataset.conflict === 'mine') { closeDialog(); ed.revision = ed._theirs.revision; dirty = true; save(); return; }
    if (t.hasAttribute('data-recover')) { var b; try { b = JSON.parse(localStorage.getItem(backupKey())); } catch (x) { b = null; } if (b) { beforeChange(); ed.doc = b.doc; cur = 0; renderAll(); changed(); } dropNotice('recover'); return; }
    if (t.hasAttribute('data-discard')) { clearBackup(); dropNotice('recover'); return; }
    if (t.hasAttribute('data-squad-compare')) return squadCompare();
    if (t.hasAttribute('data-squad-apply')) { closeDialog(); beforeChange(); ed.doc.squad = squadSnapshot(); ed.doc.squadAsOf = DATA.squadAsOf; changed(); dropNotice('data'); notices(); return; }
    if (t.hasAttribute('data-squad-keep')) { closeDialog(); beforeChange(); ed.doc.squadAsOf = DATA.squadAsOf; changed(); dropNotice('data'); notices(); return; }
    if (t.hasAttribute('data-fixture-update')) { var fx = DATA.fixtures.filter(function (x) { return x.id === ed.fixtureId; })[0]; if (fx) { beforeChange(); ['date', 'kickoff', 'venue', 'competition'].forEach(function (k) { ed.doc.fixture[k] = fx[k] || ''; }); changed(); dropNotice('data'); notices(); $('ed-title').textContent = 'v ' + ed.doc.fixture.opponent + ' · ' + ukDate(ed.doc.fixture.date); } return; }
    if (t.id === 'btn-add') { var ty = $('add-type').value; beforeChange(); ed.doc.pages.splice(cur + 1, 0, { id: rid(), type: ty, label: T[ty].name }); cur++; renderAll(); changed(); return; }
    if (t.dataset.i != null) { cur = +t.dataset.i; renderForm(); renderPreview(); renderThumbs(); var th = document.querySelector('[data-i="' + cur + '"]'); if (th) th.focus(); return; }
    if (t.dataset.go != null) { cur = +t.dataset.go; renderAll(); show('step-edit'); return; }
    if (t.dataset.clear) { beforeChange(); delete ed.doc.pages[cur][t.dataset.clear]; delete ed.doc.pages[cur][t.dataset.clear + 'Px']; renderForm(); changed(); return; }
    if (t.dataset.act) {
      var P = ed.doc.pages, a2 = t.dataset.act;
      if (a2 === 'del' && !confirm('Remove this page? You can bring it back with Undo.')) return;
      beforeChange();
      if (a2 === 'up' && cur > 0) { P.splice(cur - 1, 0, P.splice(cur, 1)[0]); cur--; }
      else if (a2 === 'down' && cur < P.length - 1) { P.splice(cur + 1, 0, P.splice(cur, 1)[0]); cur++; }
      else if (a2 === 'dup') { var copy = Object.assign({}, P[cur], { id: rid() }); delete copy.role; P.splice(cur + 1, 0, copy); cur++; }
      else if (a2 === 'hide') P[cur].hidden = !P[cur].hidden;
      else if (a2 === 'del') { P.splice(cur, 1); cur = Math.min(cur, P.length - 1); }
      renderAll(); changed();
      var again = document.querySelector('[data-act="' + a2 + '"]'); if (again) again.focus();
    }
  });
  document.addEventListener('input', function (e) {
    var k = e.target.dataset && e.target.dataset.k;
    if (k && ed) { beforeChange(true); ed.doc.pages[cur][k] = e.target.value; changed(); }
    if (e.target.id === 'deadline' && ed) { beforeChange(); ed.doc.printDeadline = e.target.value; changed(); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.dataset && e.target.dataset.img && e.target.files[0]) readImage(e.target.files[0], e.target.dataset.img);
    if (e.target.id === 'deadline' && ed) renderFlow();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('dialog').hidden) { closeDialog(); return; }
    if (!ed || $('step-edit').hidden) return;
    var mod = e.metaKey || e.ctrlKey, key = (e.key || '').toLowerCase();
    var inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (mod && key === 's') { e.preventDefault(); save(); }
    else if (mod && key === 'z' && !e.shiftKey && !inField) { e.preventDefault(); doUndo(); }
    else if (mod && (key === 'y' || (key === 'z' && e.shiftKey)) && !inField) { e.preventDefault(); doRedo(); }
  });
  window.addEventListener('beforeunload', function (e) { if (dirty || saving) { e.preventDefault(); e.returnValue = ''; } });
  $('signin-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('si-error'); err.hidden = true;
    signIn($('si-user').value.trim(), $('si-pass').value).then(function () { $('si-pass').value = ''; status('Signed in', 'ok'); startScreen(); })
      .catch(function (x) { err.textContent = x.message; err.hidden = false; });
  });

  /* ── BOOT ────────────────────────────────────────────────────────────── */
  Promise.all(['data/fixtures.json', 'data/squad.json', 'data/config.json'].map(function (u) { return fetch(u + '?t=' + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }))
    .then(function (r) {
      DATA.fixtures = ((r[0] && r[0].fixtures) || []).slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
      DATA.squad = ((r[1] && r[1].players) || []).filter(function (p) { return !p.status || /active|loan/i.test(p.status); })
        .slice().sort(function (a, b) { return (a.no || 99) - (b.no || 99) || a.name.localeCompare(b.name); });
      DATA.squadAsOf = (r[1] && r[1].updatedAt) || '';
      DATA.admission = r[2] && r[2].admission;
      if (!r[0]) status('The fixture list could not be loaded. Check your connection and refresh.', 'bad');
      if (restoreSession()) whoami().then(startScreen).catch(function () { show('step-signin'); });
      else show('step-signin');
    });
})();
