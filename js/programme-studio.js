/* ════════════════════════════════════════════════════════════════════════
   PROGRAMME STUDIO — choose match → edit pages → check → download PDF.
   One page model, one renderer: the preview, the check spreads and the PDF
   are all drawn by renderPage(), so what you check is what prints.
   Never invents copy: empty text shows as a marked gap and blocks "ready".
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var KEY = 'rlfc-programme-studio-v1';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; };
  // Paragraphs from plain text: blank line = new paragraph. No HTML accepted.
  var paras = function (t) { return String(t || '').split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join(''); };
  // Pictures come from drafts, which can be opened from a file — so they are
  // untrusted. Only an embedded image or a same-site path ever reaches the page.
  var img = function (src) { src = String(src || ''); return (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(src) || /^\/?img\/[\w\/.-]+$/.test(src)) ? src : ''; };
  var gap = function (label) { return '<span class="pg-gap">' + esc(label) + ' — to be written</span>'; };
  var ukDate = function (d) { var x = new Date(d + 'T12:00:00Z'); return isNaN(x) ? (d || '') : x.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }); };

  var DATA = { fixtures: [], squad: [], admission: null };
  var ed = null;       // the edition being edited
  var cur = 0;         // selected page index
  var dirty = false, saveTimer = null;

  /* ── PAGE TYPES: plain-language fields + a renderer ───────────────────── */
  var T = {
    cover: { name: 'Front cover', fields: [['headline', 'Cover headline', 'line'], ['sponsor', 'Presented by (sponsor name, optional)', 'line'], ['photo', 'Cover photograph', 'image']],
      render: function (p, e) { var f = e.fixture; return '<div class="pg pg--cover"' + bg(p.photo) + '><div class="pg-cover__top">Official Matchday Programme' + (p.sponsor ? '<small>presented by ' + esc(p.sponsor) + '</small>' : '') + '</div>' +
        '<div class="pg-cover__h">' + (p.headline ? esc(p.headline) : 'Matchday') + '</div>' +
        '<div class="pg-cover__vs"><img src="img/badge-512.png" alt=""><b>v</b>' + (img(f.oppCrest) ? '<img src="' + img(f.oppCrest) + '" alt="">' : '') + '</div>' +
        '<div class="pg-cover__match"><strong>Rayners Lane FC v ' + esc(f.opponent) + '</strong><span>' + esc(ukDate(f.date)) + ' · ' + esc(f.kickoff || '') + '</span><span>' + esc(f.competition || '') + '</span><span>Tithe Farm, 151 Rayners Lane, Harrow HA2 0XH</span></div></div>'; } },
    contents: { name: 'Contents and match details', fields: [],
      render: function (p, e) { var f = e.fixture, rows = e.pages.map(function (q, i) { return q.hidden || i === 0 || q.type === 'contents' || q.type === 'back' ? '' : '<li><span>' + esc(q.label || T[q.type].name) + '</span><b>' + (visNo(e, i)) + '</b></li>'; }).join('');
        return '<div class="pg"><h2 class="pg-h">In this issue</h2><ul class="pg-toc">' + rows + '</ul><div class="pg-box"><h3>Today\'s match</h3><p><strong>Rayners Lane FC v ' + esc(f.opponent) + '</strong><br>' + esc(ukDate(f.date)) + ', kick-off ' + esc(f.kickoff || 'TBC') + '<br>' + esc(f.competition || '') + '<br>' + esc(f.venue || '') + '</p></div></div>'; } },
    notes: { name: 'Notes', fields: [['label', 'Page name (e.g. Chairman\'s notes)', 'line'], ['author', 'Written by (name and role)', 'line'], ['body', 'Text', 'text'], ['photo', 'Photograph (optional)', 'image']],
      render: function (p) { return '<div class="pg"><h2 class="pg-h">' + esc(p.label || 'Notes') + '</h2>' + (p.photo ? '<img class="pg-portrait" src="' + img(p.photo) + '" alt="">' : '') + '<div class="pg-body">' + (p.body ? paras(p.body) : gap(p.label || 'Notes')) + '</div>' + (p.author ? '<p class="pg-by">' + esc(p.author) + '</p>' : '') + '</div>'; } },
    article: { name: 'Article', fields: [['label', 'Page name (for contents)', 'line'], ['headline', 'Headline', 'line'], ['body', 'Text', 'text'], ['photo', 'Photograph (optional)', 'image'], ['caption', 'Photo caption', 'line']],
      render: function (p) { return '<div class="pg"><div class="pg-kick">' + esc(p.label || '') + '</div><h2 class="pg-h">' + (p.headline ? esc(p.headline) : gap('Headline')) + '</h2>' + (p.photo ? '<figure class="pg-fig"><img src="' + img(p.photo) + '" alt=""><figcaption>' + esc(p.caption || '') + '</figcaption></figure>' : '') + '<div class="pg-body">' + (p.body ? paras(p.body) : gap('Article')) + '</div></div>'; } },
    opposition: { name: 'The opposition', fields: [['body', 'About today\'s visitors', 'text'], ['source', 'Where the facts came from', 'line']],
      render: function (p, e) { var f = e.fixture; return '<div class="pg"><div class="pg-kick">Today\'s visitors</div><h2 class="pg-h">' + esc(f.opponent) + '</h2>' + (img(f.oppCrest) ? '<img class="pg-crest" src="' + img(f.oppCrest) + '" alt="">' : '') + '<div class="pg-body">' + (p.body ? paras(p.body) : gap('Opposition profile')) + '</div>' + (p.source ? '<p class="pg-src">Source: ' + esc(p.source) + '</p>' : '') + '</div>'; } },
    squad: { name: 'Squad portraits', fields: [['part', 'Which players (1 = first half, 2 = second half)', 'line']],
      render: function (p, e) { var s = e.squad, h = Math.ceil(s.length / 2), list = p.part === '2' ? s.slice(h) : s.slice(0, h);
        return '<div class="pg pg--green"><h2 class="pg-h">The Squad' + (p.part === '2' ? ' (continued)' : '') + '</h2><div class="pg-squad">' + list.map(function (x) { return '<div><span class="pg-face"' + (img(x.photo) ? ' style="background-image:url(\'' + img(x.photo) + '\')"' : '') + '></span><b>' + esc(x.name) + '</b><small>' + esc(x.pos || '') + '</small></div>'; }).join('') + '</div><p class="pg-note">Club squad — subject to selection. Not today\'s team sheet.</p></div>'; } },
    teams: { name: 'Squads for today', fields: [['away', 'Visitors\' squad (one name per line, if supplied)', 'text']],
      render: function (p, e) { var away = String(p.away || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        return '<div class="pg"><h2 class="pg-h">Squads</h2><p class="pg-note">Squads subject to selection. The official team sheet is announced at the ground.</p><div class="pg-cols"><div><h3>Rayners Lane FC</h3><ol>' + e.squad.map(function (x) { return '<li>' + esc(x.name) + '</li>'; }).join('') + '</ol></div><div><h3>' + esc(e.fixture.opponent) + '</h3>' + (away.length ? '<ol>' + away.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' : gap('Visitors\' squad')) + '</div></div></div>'; } },
    results: { name: 'Results this season', fields: [],
      render: function (p, e) { var r = DATA.fixtures.filter(function (x) { return x.season === e.fixture.season && x.us != null && x.them != null && x.date < e.fixture.date; });
        return '<div class="pg"><h2 class="pg-h">Results</h2>' + (r.length ? '<table class="pg-tab"><tbody>' + r.map(function (x) { return '<tr><td>' + esc(new Date(x.date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })) + '</td><td>' + (x.isHome ? 'H' : 'A') + '</td><td>' + esc(x.opponent) + '</td><td><b>' + x.us + '–' + x.them + '</b></td></tr>'; }).join('') + '</tbody></table>' : '<p class="pg-note">No results recorded yet this season.</p>') + '</div>'; } },
    fixtures: { name: 'Forthcoming fixtures', fields: [],
      render: function (p, e) { var r = DATA.fixtures.filter(function (x) { return x.date > e.fixture.date && x.status !== 'played'; }).slice(0, 14);
        return '<div class="pg"><h2 class="pg-h">Coming up</h2><table class="pg-tab"><tbody>' + r.map(function (x) { return '<tr><td>' + esc(new Date(x.date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })) + '</td><td>' + (x.isHome ? 'H' : 'A') + '</td><td>' + esc(x.opponent) + '</td><td>' + esc(x.kickoff || '') + '</td></tr>'; }).join('') + '</tbody></table><p class="pg-note">Fixtures can change — check raynerslanefc.co.uk.</p></div>'; } },
    info: { name: 'Supporter information', fields: [['body', 'Extra notes for supporters (optional)', 'text']],
      render: function (p) { var a = DATA.admission;
        return '<div class="pg"><h2 class="pg-h">At the Lane</h2>' + (a ? '<div class="pg-box"><h3>' + esc(a.heading || 'Admission') + '</h3><table class="pg-tab"><tbody>' + a.prices.map(function (x) { return '<tr><td>' + esc(x.label) + (x.note ? ' <small>(' + esc(x.note) + ')</small>' : '') + '</td><td><b>' + esc(x.price) + '</b></td></tr>'; }).join('') + '</tbody></table></div>' : '') + '<div class="pg-body">' + paras(p.body) + '<p>Tithe Farm Sports &amp; Social Club, 151 Rayners Lane, Harrow HA2 0XH.<br>raynerslanefc.co.uk</p></div></div>'; } },
    advert: { name: 'Advert', fields: [['label', 'Advertiser name', 'line'], ['photo', 'Advert artwork (image)', 'image'], ['size', 'Size: full, half or quarter', 'line']],
      render: function (p) { return '<div class="pg pg--ad">' + (p.photo ? '<img class="pg-ad pg-ad--' + esc(p.size || 'full') + '" src="' + img(p.photo) + '" alt="">' : '<div class="pg-adgap">Advert space<br><small>' + esc(p.label || 'No artwork uploaded yet') + '</small></div>') + '</div>'; } },
    back: { name: 'Back cover', fields: [['body', 'Back cover message', 'text'], ['photo', 'Back cover image (optional)', 'image']],
      render: function (p) { return '<div class="pg pg--cover"' + bg(p.photo) + '><img class="pg-back__badge" src="img/badge-512.png" alt=""><div class="pg-body pg-back__body">' + paras(p.body) + '</div><div class="pg-back__foot">Rayners Lane FC · Est. 1933 · raynerslanefc.co.uk</div></div>'; } }
  };
  function bg(src) { src = img(src); return src ? ' style="background-image:linear-gradient(rgba(6,40,20,.35),rgba(6,40,20,.85)),url(\'' + src + '\')"' : ''; }
  function visNo(e, i) { var n = 0; for (var k = 0; k <= i; k++) if (!e.pages[k].hidden) n++; return n; }

  // Suggested 24-page running order. A template, not copy: every text field starts empty.
  function template() {
    var P = function (type, label, extra) { return Object.assign({ id: Math.random().toString(36).slice(2), type: type, label: label || '' }, extra || {}); };
    return [P('cover', 'Front cover'), P('advert', 'Inside front cover'), P('contents', 'Contents'), P('article', 'Club directory'),
      P('notes', 'Chairman\'s notes'), P('notes', 'Manager\'s notes'), P('article', 'Match preview'), P('opposition', 'The opposition'),
      P('squad', 'The squad', { part: '1' }), P('squad', 'The squad (continued)', { part: '2' }), P('teams', 'Squads for today'),
      P('advert', 'Advert'), P('advert', 'Advert'), P('article', 'Story of the Lane'), P('article', 'Story of the Lane (continued)'),
      P('article', 'Last match report'), P('results', 'Results'), P('fixtures', 'Coming up'), P('article', 'Community and academy'),
      P('article', 'Player sponsors'), P('article', 'Feature'), P('info', 'Supporter information'), P('advert', 'Inside back cover'), P('back', 'Back cover')];
  }

  /* ── STORAGE: autosave to this browser; draft files move between computers ── */
  function all() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function save(reason) {
    if (!ed) return;
    try { var a = all(); ed.savedAt = new Date().toISOString(); a[ed.fixture.id] = ed; localStorage.setItem(KEY, JSON.stringify(a)); dirty = false;
      status('Saved at ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }), 'ok');
    } catch (e) { status('Could not save in this browser (it may be full — large photos use space). Use "Save draft file" now so nothing is lost.', 'bad'); }
  }
  function touch() { dirty = true; status('Saving…'); clearTimeout(saveTimer); saveTimer = setTimeout(save, 800); renderPreview(); renderThumbs(); }
  function status(t, k) { var s = $('ps-status'); s.textContent = t; s.dataset.k = k || ''; }
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ── STEP 1 ─────────────────────────────────────────────────────────── */
  function show(id) { ['step-start', 'step-edit', 'step-check'].forEach(function (s) { $(s).hidden = s !== id; }); window.scrollTo(0, 0); }
  function startScreen() {
    var today = new Date().toISOString().slice(0, 10);
    var home = DATA.fixtures.filter(function (f) { return f.isHome && f.date >= today && f.status !== 'postponed' && f.status !== 'played'; });
    $('fx-pick').innerHTML = home.map(function (f) { return '<option value="' + esc(f.id) + '">' + esc(ukDate(f.date)) + ' — ' + esc(f.opponent) + ' (' + esc(f.competition || '') + ')</option>'; }).join('');
    $('fx-hint').textContent = home.length ? home.length + ' home matches to come. You can prepare any of them, not just the next one.' : 'No upcoming home matches are in the fixture list yet. Add the match on the Fixtures page first.';
    $('btn-new').disabled = !home.length;
    var d = all(), keys = Object.keys(d);
    $('drafts-card').hidden = !keys.length;
    $('drafts').innerHTML = keys.map(function (k) { var x = d[k]; return '<li><button class="ps-btn ps-btn--plain" data-open="' + esc(k) + '" type="button">' + esc(ukDate(x.fixture.date)) + ' — ' + esc(x.fixture.opponent) + '</button><span class="ps-hint">Last saved ' + esc(new Date(x.savedAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })) + '</span></li>'; }).join('');
    show('step-start');
  }
  function open(e) { ed = e; ed.squad = DATA.squad.length ? DATA.squad : (ed.squad || []); cur = 0; $('ed-title').textContent = 'v ' + ed.fixture.opponent + ' · ' + ukDate(ed.fixture.date); renderAll(); show('step-edit'); status(ed.savedAt ? 'Saved' : 'Not saved yet'); }

  /* ── STEP 2: thumbnails, form, preview ───────────────────────────────── */
  function renderAll() { renderThumbs(); renderForm(); renderPreview(); }
  function renderThumbs() {
    $('thumbs').innerHTML = ed.pages.map(function (p, i) {
      var tag = p.hidden ? 'Hidden' : (i === firstVis() ? 'Front cover' : (i === lastVis() ? 'Back cover' : 'Page ' + visNo(ed, i)));
      return '<button type="button" class="ps-thumb' + (i === cur ? ' is-on' : '') + (p.hidden ? ' is-hidden' : '') + '" data-i="' + i + '" aria-current="' + (i === cur) + '"><b>' + tag + '</b><span>' + esc(p.label || T[p.type].name) + '</span></button>';
    }).join('') + '<div class="ps-add"><label class="ps-label" for="add-type">Add a page</label><select id="add-type" class="ps-input">' + Object.keys(T).map(function (k) { return '<option value="' + k + '">' + T[k].name + '</option>'; }).join('') + '</select><button class="ps-btn ps-btn--plain" id="btn-add" type="button">Add after this page</button></div>';
  }
  function firstVis() { for (var i = 0; i < ed.pages.length; i++) if (!ed.pages[i].hidden) return i; }
  function lastVis() { for (var i = ed.pages.length - 1; i >= 0; i--) if (!ed.pages[i].hidden) return i; }
  function renderForm() {
    var p = ed.pages[cur], t = T[p.type];
    var h = '<h2>' + esc(p.label || t.name) + ' <small>(' + t.name + ')</small></h2>';
    h += '<div class="ps-row"><button class="ps-btn ps-btn--plain" data-act="up" type="button">Move up</button><button class="ps-btn ps-btn--plain" data-act="down" type="button">Move down</button><button class="ps-btn ps-btn--plain" data-act="dup" type="button">Duplicate</button><button class="ps-btn ps-btn--plain" data-act="hide" type="button">' + (p.hidden ? 'Show page' : 'Hide page') + '</button><button class="ps-btn ps-btn--danger" data-act="del" type="button">Remove page</button></div>';
    if (!t.fields.length) h += '<p class="ps-hint">This page fills itself from the club\'s fixtures, squad and prices. Nothing to type.</p>';
    t.fields.forEach(function (f) {
      var k = f[0], lab = f[1], kind = f[2], id = 'f-' + k;
      h += '<label class="ps-label" for="' + id + '">' + esc(lab) + '</label>';
      if (kind === 'text') h += '<textarea id="' + id + '" class="ps-input ps-text" data-k="' + k + '" rows="10">' + esc(p[k] || '') + '</textarea><p class="ps-hint">Leave a blank line between paragraphs.</p>';
      else if (kind === 'image') h += (p[k] ? '<img class="ps-thumbimg" src="' + img(p[k]) + '" alt=""><button class="ps-btn ps-btn--plain" data-clear="' + k + '" type="button">Remove image</button>' : '') + '<input id="' + id + '" type="file" accept="image/jpeg,image/png,image/webp" data-img="' + k + '" class="ps-input"><p class="ps-hint" id="w-' + k + '"></p>';
      else h += '<input id="' + id + '" class="ps-input" data-k="' + k + '" value="' + esc(p[k] || '') + '">';
    });
    $('form').innerHTML = h;
  }
  function renderPreview() {
    var p = ed.pages[cur];
    $('pv-label').textContent = p.hidden ? 'Hidden — will not print' : (cur === firstVis() ? 'Front cover' : cur === lastVis() ? 'Back cover' : 'Page ' + visNo(ed, cur) + (visNo(ed, cur) % 2 ? ' (right-hand page)' : ' (left-hand page)'));
    $('preview').innerHTML = renderPage(cur);
  }
  function renderPage(i) { var p = ed.pages[i]; return '<div class="pg-sheet">' + T[p.type].render(p, ed) + (i !== firstVis() && i !== lastVis() ? '<div class="pg-no">' + visNo(ed, i) + '</div>' : '') + '</div>'; }

  /* Images: resized in the browser so drafts stay small; resolution checked at A5 size. */
  function readImage(file, k) {
    var r = new FileReader();
    r.onload = function () { var im = new Image(); im.onload = function () {
      var max = 2000, s = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      var p = ed.pages[cur]; p[k] = c.toDataURL('image/jpeg', 0.86);
      // A full A5 page at 300ppi needs about 1748 × 2480 pixels.
      p[k + 'Px'] = im.width + '×' + im.height;
      renderForm(); touch();
      var w = $('w-' + k); if (w) w.textContent = im.width < 1200 ? 'This picture is ' + im.width + ' pixels wide. It may look soft when printed large — ask for a bigger original if you can.' : 'Picture size is good for print.';
    }; im.onerror = function () { alert('That file could not be opened as a picture. Please use a JPG or PNG.'); }; im.src = r.result; };
    r.readAsDataURL(file);
  }

  /* ── STEP 3: checks and spreads ───────────────────────────────────────── */
  function checks() {
    var out = [], vis = ed.pages.filter(function (p) { return !p.hidden; });
    if (vis.length % 4) out.push(['bad', 'The booklet has ' + vis.length + ' pages. A stapled booklet needs a multiple of 4 (' + (Math.ceil(vis.length / 4) * 4) + ' would work). Add or hide pages.', null]);
    ed.pages.forEach(function (p, i) { if (p.hidden) return; var t = T[p.type];
      // One message per page: articles need a headline and text; notes and the opposition need text.
      var need = { article: ['headline', 'body'], notes: ['body'], opposition: ['body'] }[p.type] || [];
      var missing = need.filter(function (k) { return !p[k]; });
      if (missing.length) out.push(['warn', (p.label || t.name) + ': ' + (missing.length > 1 ? 'headline and text' : missing[0] === 'body' ? 'text' : 'headline') + ' still to be written.', i]);
      if (p.type === 'advert' && !p.photo) out.push(['warn', (p.label || 'Advert') + ': no artwork uploaded — prints as an empty advert space.', i]);
      if (p.photoPx && parseInt(p.photoPx, 10) < 1200) out.push(['warn', (p.label || t.name) + ': picture is only ' + p.photoPx + ' pixels and may print soft.', i]);
    });
    if (!ed.fixture.oppCrest) out.push(['warn', 'No crest for ' + ed.fixture.opponent + ' in the club\'s crest library.', null]);
    $('checks').innerHTML = '<h2>Before you download</h2>' + (out.length ? '<ul class="ps-checks">' + out.map(function (c) { return '<li class="is-' + c[0] + '"><b>' + (c[0] === 'bad' ? 'Must fix' : 'Check') + ':</b> ' + esc(c[1]) + (c[2] != null ? ' <button class="ps-btn ps-btn--plain" data-go="' + c[2] + '" type="button">Open page</button>' : '') + '</li>'; }).join('') + '</ul>' : '<p class="ps-ok">Everything looks complete.</p>') + '<p class="ps-hint">You can still download a proof with gaps — marked gaps print in yellow so nobody mistakes the proof for the final copy.</p>';
    // Spreads: front cover alone on the right, then pairs, back cover alone.
    var idx = ed.pages.map(function (p, i) { return p.hidden ? -1 : i; }).filter(function (i) { return i > -1; });
    var h = '<div class="ps-spread"><div class="ps-blank"></div>' + renderPage(idx[0]) + '</div>';
    for (var k = 1; k < idx.length - 1; k += 2) h += '<div class="ps-spread">' + renderPage(idx[k]) + (idx[k + 1] != null && k + 1 < idx.length - 1 ? renderPage(idx[k + 1]) : '<div class="ps-blank"></div>') + '</div>';
    if (idx.length > 1) h += '<div class="ps-spread">' + renderPage(idx[idx.length - 1]) + '<div class="ps-blank"></div></div>';
    $('spreads').innerHTML = h;
  }

  /* ── STEP 4: the PDF — same renderer, drawn at A5 + 3mm bleed ─────────── */
  async function pdf() {
    var btn = $('btn-pdf'); btn.disabled = true;
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      var jsPDF = window.jspdf.jsPDF, W = 154, H = 216; // mm incl. 3mm bleed each side
      var doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'portrait', compress: true });
      var idx = ed.pages.map(function (p, i) { return p.hidden ? -1 : i; }).filter(function (i) { return i > -1; });
      var stage = $('ps-stage');
      for (var n = 0; n < idx.length; n++) {
        btn.textContent = 'Making page ' + (n + 1) + ' of ' + idx.length + '…';
        stage.innerHTML = '<div class="pg-bleed">' + renderPage(idx[n]) + '</div>';
        await Promise.all([].map.call(stage.querySelectorAll('img'), function (im) { return im.complete ? 0 : new Promise(function (r) { im.onload = im.onerror = r; }); }));
        var cv = await html2canvas(stage.firstChild, { scale: 2.6, backgroundColor: '#ffffff', useCORS: true, logging: false });
        if (n) doc.addPage([W, H], 'portrait');
        doc.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, W, H);
      }
      stage.innerHTML = '';
      doc.setProperties({ title: 'Rayners Lane FC v ' + ed.fixture.opponent + ' — matchday programme (proof)', subject: 'A5 148x210mm, 3mm bleed, RGB proof', creator: 'Rayners Lane FC Programme Studio' });
      ed.exports = (ed.exports || 0) + 1; save();
      var slug = ed.fixture.opponent.replace(/&/g, 'and').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
      doc.save('RLFC-v-' + slug + '-' + ed.fixture.date + '-print-proof-v' + ed.exports + '.pdf');
      status('PDF downloaded (' + idx.length + ' pages). Nothing has been published.', 'ok');
    } catch (e) {
      status('The PDF could not be made. Your work is saved — please try again. If it keeps failing, remove very large pictures and retry.', 'bad');
    } finally { btn.disabled = false; btn.textContent = 'Download PDF for printer'; }
  }

  /* ── EVENTS ───────────────────────────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button,[data-open]'); if (!t) return;
    if (t.id === 'btn-new') { var f = DATA.fixtures.find(function (x) { return x.id === $('fx-pick').value; }); var ex = all()[f.id];
      if (ex && !confirm('There is already a draft for this match. Open it? (Cancel starts a fresh one and replaces it.)')) ex = null;
      open(ex || { fixture: f, pages: template(), created: new Date().toISOString() }); if (!ex) save(); }
    else if (t.dataset.open) open(all()[t.dataset.open]);
    else if (t.id === 'btn-back') { if (dirty) save(); startScreen(); }
    else if (t.id === 'btn-save') save();
    else if (t.id === 'btn-check') { save(); checks(); show('step-check'); }
    else if (t.id === 'btn-back-edit') show('step-edit');
    else if (t.id === 'btn-pdf') pdf();
    else if (t.id === 'btn-export-draft') { var b = new Blob([JSON.stringify(ed)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'RLFC-programme-draft-' + ed.fixture.date + '.json'; a.click(); }
    else if (t.id === 'btn-add') { var ty = $('add-type').value; ed.pages.splice(cur + 1, 0, { id: Math.random().toString(36).slice(2), type: ty, label: T[ty].name }); cur++; renderAll(); touch(); }
    else if (t.dataset.i != null) { cur = +t.dataset.i; renderAll(); }
    else if (t.dataset.go != null) { cur = +t.dataset.go; renderAll(); show('step-edit'); }
    else if (t.dataset.clear) { delete ed.pages[cur][t.dataset.clear]; delete ed.pages[cur][t.dataset.clear + 'Px']; renderForm(); touch(); }
    else if (t.dataset.act) { var P = ed.pages, a2 = t.dataset.act;
      if (a2 === 'up' && cur > 0) { P.splice(cur - 1, 0, P.splice(cur, 1)[0]); cur--; }
      else if (a2 === 'down' && cur < P.length - 1) { P.splice(cur + 1, 0, P.splice(cur, 1)[0]); cur++; }
      else if (a2 === 'dup') { P.splice(cur + 1, 0, Object.assign({}, P[cur], { id: Math.random().toString(36).slice(2) })); cur++; }
      else if (a2 === 'hide') P[cur].hidden = !P[cur].hidden;
      else if (a2 === 'del') { if (!confirm('Remove this page? You can add a new one afterwards.')) return; P.splice(cur, 1); cur = Math.min(cur, P.length - 1); }
      renderAll(); touch(); }
  });
  document.addEventListener('input', function (e) { var k = e.target.dataset && e.target.dataset.k; if (k && ed) { ed.pages[cur][k] = e.target.value; if (k === 'label') renderThumbs(); touch(); } });
  document.addEventListener('change', function (e) {
    if (e.target.dataset && e.target.dataset.img && e.target.files[0]) readImage(e.target.files[0], e.target.dataset.img);
    if (e.target.id === 'open-file' && e.target.files[0]) { var r = new FileReader(); r.onload = function () { try { var d = JSON.parse(r.result); if (!d.fixture || !Array.isArray(d.pages) || !d.pages.every(function (q) { return q && T.hasOwnProperty(q.type); })) throw 0; open(d); save(); } catch (x) { alert('That file is not a Programme Studio draft.'); } }; r.readAsText(e.target.files[0]); }
  });

  /* ── BOOT: the site's own data files ──────────────────────────────────── */
  Promise.all(['data/fixtures.json', 'data/squad.json', 'data/config.json'].map(function (u) { return fetch(u + '?t=' + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }))
    .then(function (r) {
      DATA.fixtures = ((r[0] && r[0].fixtures) || []).slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
      DATA.squad = ((r[1] && r[1].players) || []).slice().sort(function (a, b) { return (a.no || 99) - (b.no || 99) || a.name.localeCompare(b.name); });
      DATA.admission = r[2] && r[2].admission;
      if (!r[0]) status('The fixture list could not be loaded. Check your connection and refresh.', 'bad');
      startScreen();
    });
})();
