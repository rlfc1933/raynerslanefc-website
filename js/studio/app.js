/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — ASSET STUDIO (workspace)

   A production tool, not a gallery. Three areas, one job each:
     • templates  — what are you making (a list, grouped by purpose)
     • the stage  — the real render at the real size, per format
     • inspector  — the facts it was made from, the few fields a person may
                    change, the checks, and the one next action for its state
   plus the Library (assets with rights and approval) and Graphics (every
   saved composition and where it is in its life: draft → ready for review →
   approved → exported → published).

   Everything the stage shows is drawn by js/studio/render.js from the scene
   js/studio/core.js composed — the same path that writes the exported file.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var Core = global.StudioCore, R = global.StudioRender, D = global.StudioData, Pack = global.StudioPack;

  var S = {
    mounted: false, open: false, view: 'create',
    lib: null, regLoaded: false,
    doc: null, title: '', comp: null, revs: [], exports: [], pubs: [], approvedDoc: null, baseRev: null,
    format: 'square', guides: false, dirty: false, busy: false,
    scene: null, issues: [], factChanges: [], list: null, libTab: 'assets', libFilter: 'all', recovery: null, renderSeq: 0
  };

  // ── helpers ─────────────────────────────────────────────────────────────
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function kb(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleString('en-GB', { timeZone: Core.TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function ctx() { return S.lib ? { assets: S.lib.assets, sponsors: S.lib.sponsors, logos: S.lib.logos } : { assets: [], sponsors: [], logos: {} }; }
  function say(msg, kind) {
    var el = $('#studio-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'studio-status' + (kind ? ' studio-status--' + kind : '');
    settle(el);
  }
  /** Functional motion only: the thing that changed settles into place. Nothing under reduced motion. */
  function settle(el) {
    if (!el || !el.animate) return;
    if (global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.animate([{ opacity: 0.4, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2,0,0,1)' });
  }
  function ensureActor() {
    var a = D.actor();
    if (a) return a;
    var n = (global.prompt ? prompt('Your name — every change in the Studio is recorded with it (e.g. "Pete Singh").', '') : '') || '';
    n = n.trim().slice(0, 80);
    if (n) { D.setActor(n); paintHeader(); }
    return n;
  }
  var STATE_TONE = { draft: 'muted', review: 'attn', approved: 'ok', exported: 'ok', published: 'ok', archived: 'muted' };
  function stateChip(s) { return '<span class="studio-chip studio-chip--' + (STATE_TONE[s] || 'muted') + '">' + h((Core.STATES[s] || { label: s }).label) + '</span>'; }

  // ── mount ───────────────────────────────────────────────────────────────
  function mount() {
    if (S.mounted) return;
    var root = document.createElement('section');
    root.id = 'studio-root';
    root.className = 'studio';
    root.setAttribute('aria-label', 'Asset Studio');
    root.hidden = true;
    root.innerHTML =
      '<header class="studio-top">' +
        '<button type="button" class="studio-btn studio-btn--ghost" data-act="close">&larr; Back to HQ</button>' +
        '<h2 class="studio-title" tabindex="-1">Asset Studio</h2>' +
        '<nav class="studio-tabs" aria-label="Studio sections">' +
          '<button type="button" class="studio-tab" data-view="create">Create</button>' +
          '<button type="button" class="studio-tab" data-view="graphics">Graphics</button>' +
          '<button type="button" class="studio-tab" data-view="library">Library</button>' +
        '</nav>' +
        '<div class="studio-who"><span id="studio-mode" class="studio-mode"></span>' +
        '<button type="button" class="studio-btn studio-btn--ghost" data-act="actor" id="studio-actor"></button></div>' +
      '</header>' +
      '<div id="studio-recovery"></div>' +
      '<p id="studio-status" class="studio-status" role="status" aria-live="polite"></p>' +
      '<div id="studio-view"></div>';
    document.body.appendChild(root);
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    document.addEventListener('studio:mode', paintHeader);
    global.addEventListener('beforeunload', function (e) { if (S.open && S.dirty) { e.preventDefault(); e.returnValue = ''; } });
    S.mounted = true;
  }

  function paintHeader() {
    var a = $('#studio-actor'); if (a) a.textContent = D.actor() ? 'Working as ' + D.actor() : 'Set your name';
    var m = $('#studio-mode');
    if (m) {
      if (D.mode.where === 'device') { m.textContent = 'Saved on this device only'; m.title = D.mode.reason; m.className = 'studio-mode studio-mode--warn'; }
      else if (D.mode.where === 'server') { m.textContent = 'Club library'; m.title = 'Saved to the club library'; m.className = 'studio-mode'; }
      else { m.textContent = ''; }
    }
    document.querySelectorAll('#studio-root .studio-tab').forEach(function (b) {
      var on = b.getAttribute('data-view') === S.view;
      b.classList.toggle('is-on', on); b.setAttribute('aria-current', on ? 'page' : 'false');
    });
  }

  function open(opts) {
    mount();
    var root = $('#studio-root');
    root.hidden = false; S.open = true;
    document.documentElement.classList.add('studio-open');
    paintHeader();
    var first = !S.lib;
    say(first ? 'Loading the library and the football registry…' : '');
    var ready = first ? Promise.all([
      D.call('library').then(function (r) { S.lib = r && r.ok ? r.library : null; }),
      D.loadRegistry().then(function () { S.regLoaded = true; })
    ]).then(function () {
      paintHeader();
      if (!S.lib) return D.seed().then(function (s) { S.lib = { assets: s.assets, sponsors: s.sponsors, logos: s.sponsorLogos }; });
    }) : Promise.resolve();
    return ready.then(function () {
      say(D.registry.error ? D.registry.error : '', D.registry.error ? 'warn' : null);
      checkRecovery();
      if (opts && opts.template) startNew(opts.template);
      else if (!S.doc) startNew('next-match');
      else renderView();
      var t = $('#studio-root .studio-title'); if (t) t.focus();
    });
  }
  function close() {
    var root = $('#studio-root'); if (root) root.hidden = true;
    S.open = false;
    document.documentElement.classList.remove('studio-open');
  }

  // ── recovery (scenario F) ───────────────────────────────────────────────
  function checkRecovery() {
    var rec = D.recovered();
    var host = $('#studio-recovery');
    S.recovery = rec && rec.dirty ? rec : null;
    if (!host) return;
    if (!S.recovery || (S.doc && S.dirty)) { host.innerHTML = ''; return; }
    var t = Core.template(rec.doc && rec.doc.template);
    host.innerHTML = '<div class="studio-banner" role="region" aria-label="Recovered work">' +
      '<p><strong>Unsaved work found.</strong> ' + h(rec.title || (t ? t.label : 'A graphic')) + ', last edited ' + h(when(rec.savedAt)) +
      (rec.compId ? ' (changes to a saved graphic, based on revision ' + h(rec.base_rev) + ')' : ' (never saved)') + '.</p>' +
      '<div class="studio-row"><button type="button" class="studio-btn studio-btn--primary" data-act="recover">Restore it</button>' +
      '<button type="button" class="studio-btn" data-act="discard-recovery">Discard</button></div></div>';
  }
  function recover() {
    var rec = S.recovery; if (!rec) return;
    var done = function () {
      S.doc = rec.doc; S.title = rec.title || S.title; S.dirty = true;
      S.format = Core.template(S.doc.template).formats.indexOf(S.format) > -1 ? S.format : Core.template(S.doc.template).formats[0];
      $('#studio-recovery').innerHTML = '';
      S.view = 'create'; paintHeader(); renderView();
      say('Restored. Save it to keep it in the library.', 'ok');
    };
    if (rec.compId) loadComposition(rec.compId, true).then(function () { S.baseRev = rec.base_rev; done(); });
    else { S.comp = null; S.revs = []; S.exports = []; S.approvedDoc = null; S.baseRev = null; done(); }
  }

  // ── creating ────────────────────────────────────────────────────────────
  function autoTitle(doc) {
    var t = Core.template(doc.template), f = doc.facts && doc.facts.fixture;
    var bits = [t.label];
    if (f && f.opponent) bits.push(f.opponent + (f.kickoffAt ? ' (' + Core.shortDate(f.kickoffAt) + ')' : ''));
    else if (doc.refs && doc.refs.sponsorKey) { var sp = (S.lib.sponsors || []).filter(function (s) { return s.key === doc.refs.sponsorKey; })[0]; if (sp) bits.push(sp.name); }
    else if (doc.fields && doc.fields.headline) bits.push(doc.fields.headline);
    return bits.join(' — ').slice(0, 120);
  }
  function startNew(tid) {
    var t = Core.template(tid); if (!t) return;
    var doc = { template: tid, fields: {}, formats: {}, variant: t.defaultVariant || (t.variants || ['night'])[0], refs: {}, facts: {} };
    if (tid === 'statement') doc.issuedAt = new Date().toISOString();
    // Start from approved club photography where the template uses it — a real
    // photograph of Tithe Farm, never a stock or generated image. The A4
    // programme cover starts without one: no photograph in the library is
    // large enough for a 300 dpi page, and the checks would say so.
    var pf = t.fields.filter(function (f) { return f.kind === 'photo'; })[0];
    if (pf && tid !== 'programme-cover' && pf.categories.indexOf('ground') > -1) {
      var g = (S.lib.assets || []).filter(function (a) { return a.category === 'ground' && a.approval === 'approved'; });
      var pick = g.filter(function (a) { return /goalmouth/.test(a.src); })[0] || g[0];
      if (pick) doc.fields.photo = pick.id;
    }
    S.comp = null; S.revs = []; S.exports = []; S.pubs = []; S.approvedDoc = null; S.baseRev = null; S.factChanges = [];
    S.doc = doc; S.dirty = false; S.format = t.formats[0]; S.view = 'create';
    var p = Promise.resolve();
    if (t.needs && /fixture/.test(t.needs)) {
      var f = D.defaultFixture(t.fixturePick);
      if (f) p = setFixture(f.id, true);
    }
    return p.then(function () { S.title = autoTitle(S.doc); paintHeader(); renderView(); });
  }
  function setFixture(id, quiet) {
    var f = D.fixtureById(id);
    if (!f) { delete S.doc.facts.fixture; return Promise.resolve(); }
    S.doc.facts.fixture = clone(f);
    delete S.doc.facts.lineup; delete S.doc.facts.scorers;
    var t = Core.template(S.doc.template);
    if (!quiet) touch();
    if (t.needsLineup || t.id === 'result') {
      return D.fixtureDetail(id).then(function (d) {
        if (t.needsLineup && d.lineup) S.doc.facts.lineup = d.lineup;
        if (t.id === 'result') S.doc.facts.scorers = d.scorers || [];
      });
    }
    return Promise.resolve();
  }

  function touch() {
    S.dirty = true;
    D.autosave({ compId: S.comp ? S.comp.id : null, base_rev: S.comp ? S.comp.head_rev : null, doc: S.doc, title: S.title, dirty: true });
    paintHead(); paintActions();
    scheduleRender();
  }

  // ── rendering the stage ─────────────────────────────────────────────────
  var timer = null;
  function scheduleRender() { clearTimeout(timer); timer = setTimeout(drawStage, 90); }
  function drawStage() {
    var canvas = $('#studio-canvas'); if (!canvas || !S.doc) return;
    var seq = ++S.renderSeq;
    var doc = S.doc, fmt = S.format;
    return R.prepare(doc, fmt, ctx()).then(function (scene) {
      if (seq !== S.renderSeq) return;
      R.draw(scene, canvas, { guides: S.guides });
      canvas.setAttribute('data-w', scene.w); canvas.setAttribute('data-h', scene.h);
      canvas.setAttribute('aria-label', Core.template(doc.template).label + ' — ' + Core.FORMATS[fmt].label + ' preview, ' + scene.w + ' by ' + scene.h + ' pixels');
      S.scene = scene;
      S.issues = Core.qc(scene, doc, ctx());
      paintChecks();
      paintActions();
    }).catch(function (e) { say('Preview failed: ' + e.message, 'err'); });
  }

  // ── views ───────────────────────────────────────────────────────────────
  function renderView() {
    var host = $('#studio-view'); if (!host) return;
    paintHeader();
    if (S.view === 'library') { host.innerHTML = libraryView(); return; }
    if (S.view === 'graphics') { host.innerHTML = '<div class="studio-pane"><p class="studio-muted">Loading graphics…</p></div>'; loadList(); return; }
    host.innerHTML = createView();
    paintChecks(); paintActions();
    drawStage();
  }

  function templateList() {
    return Core.CATEGORIES.map(function (c) {
      var items = Core.TEMPLATES.filter(function (t) { return t.category === c.id; });
      return '<div class="studio-tgroup"><h3 class="studio-h3">' + h(c.label) + '</h3><ul class="studio-tlist">' + items.map(function (t) {
        var on = S.doc && S.doc.template === t.id;
        return '<li><button type="button" class="studio-titem' + (on ? ' is-on' : '') + '" data-act="template" data-id="' + t.id + '"' + (on ? ' aria-current="true"' : '') + '>' +
          '<span>' + h(t.label) + '</span><span class="studio-titem__m">' + h(t.formats.map(function (f) { return Core.FORMATS[f].label; }).join(' · ')) + '</span></button></li>';
      }).join('') + '</ul></div>';
    }).join('');
  }
  function templateSelect() {
    return '<label class="studio-f studio-tselect"><span class="studio-fl">Template</span><select data-act="template-select">' +
      Core.CATEGORIES.map(function (c) {
        return '<optgroup label="' + h(c.label) + '">' + Core.TEMPLATES.filter(function (t) { return t.category === c.id; }).map(function (t) {
          return '<option value="' + t.id + '"' + (S.doc && S.doc.template === t.id ? ' selected' : '') + '>' + h(t.label) + '</option>';
        }).join('') + '</optgroup>';
      }).join('') + '</select></label>';
  }

  function createView() {
    var t = Core.template(S.doc.template);
    var fmts = t.formats.map(function (f) {
      var F = Core.FORMATS[f], on = f === S.format;
      return '<button type="button" class="studio-seg' + (on ? ' is-on' : '') + '" data-act="format" data-id="' + f + '" aria-pressed="' + on + '">' + h(F.label) + ' <small>' + F.w + '×' + F.h + '</small></button>';
    }).join('');
    var F0 = Core.FORMATS[S.format];
    return '<div class="studio-create">' +
      '<aside class="studio-rail" aria-label="Templates">' + templateList() + '</aside>' +
      '<div class="studio-main">' +
        templateSelect() +
        '<div class="studio-stagebar"><div class="studio-segs" role="group" aria-label="Format">' + fmts + '</div>' +
        '<label class="studio-check"><input type="checkbox" data-act="guides"' + (S.guides ? ' checked' : '') + '> Safe area</label></div>' +
        '<div class="studio-stage"><canvas id="studio-canvas" width="' + F0.w + '" height="' + F0.h + '" role="img"></canvas></div>' +
        '<p class="studio-muted studio-stage__cap">' + h(F0.label) + ' · ' + F0.w + '×' + F0.h + ' px · ' + h(F0.use) + (F0.id === 'story' ? ' · Each format is laid out separately, not cropped.' : '') + '</p>' +
        cropControls() +
      '</div>' +
      '<aside class="studio-inspector" aria-label="Inspector">' + inspector() + '</aside>' +
    '</div>';
  }

  function cropControls() {
    var t = Core.template(S.doc.template);
    if (!S.doc.fields.photo) return '';
    if (t.id === 'starting-xi' && ['square', 'portrait', 'a4'].indexOf(S.format) > -1) return '<p class="studio-muted">The photograph is used in Story and Landscape only.</p>';
    var c = S.doc.formats[S.format] || {}, f = c.focus || { x: 0.5, y: 0.5 }, z = c.zoom || 1;
    return '<fieldset class="studio-crop"><legend class="studio-fl">Photo crop for ' + h(Core.FORMATS[S.format].label) + ' <span class="studio-muted">(kept separately for each format)</span></legend>' +
      '<label class="studio-range">Across<input type="range" min="0" max="100" value="' + Math.round(f.x * 100) + '" data-crop="x"></label>' +
      '<label class="studio-range">Up / down<input type="range" min="0" max="100" value="' + Math.round(f.y * 100) + '" data-crop="y"></label>' +
      '<label class="studio-range">Zoom<input type="range" min="100" max="250" value="' + Math.round(z * 100) + '" data-crop="zoom"></label>' +
      '<button type="button" class="studio-btn studio-btn--ghost" data-act="crop-reset">Reset crop</button></fieldset>';
  }

  function section(title, body, id) { return '<section class="studio-sec"' + (id ? ' id="' + id + '"' : '') + '><h3 class="studio-h3">' + h(title) + '</h3>' + body + '</section>'; }

  /** Status, revision and the "approved stays approved" promise — repainted on every edit without touching the inputs. */
  function headState() {
    var ver = S.comp ? 'Revision ' + S.comp.head_rev + (S.dirty ? ' + unsaved changes' : '') + (S.comp.approved_rev ? ' · approved: revision ' + S.comp.approved_rev : '') : (S.dirty ? 'Not saved yet' : 'New');
    return '<p class="studio-meta">' + (S.comp ? stateChip(S.comp.state) + ' ' : '') + '<span>' + h(ver) + '</span></p>' +
      (S.comp && S.comp.approved_rev && S.dirty ? '<p class="studio-note">Saving creates revision ' + (S.comp.head_rev + 1) + '. Approved revision ' + S.comp.approved_rev + ' stays approved and is what final exports use.</p>' : '');
  }
  function paintHead() { var el = $('#studio-headstate'); if (el) el.innerHTML = headState(); }

  function inspector() {
    var t = Core.template(S.doc.template);
    var out = '';
    out += '<div class="studio-sec studio-sec--head"><label class="studio-f"><span class="studio-fl">Graphic name</span><input type="text" maxlength="120" data-act="title" value="' + h(S.title) + '"></label>' +
      '<div id="studio-headstate">' + headState() + '</div></div>';
    if (t.needs && /fixture/.test(t.needs)) out += section('Fixture', fixtureBlock(t));
    if (t.needsLineup) out += section('Line-up', lineupBlock());
    var sf = t.fields.filter(function (f) { return f.kind === 'sponsor'; })[0];
    if (sf) out += section(sf.label, sponsorBlock(sf));
    var plain = t.fields.filter(function (f) { return f.kind === 'text' || f.kind === 'textarea'; });
    if (plain.length) out += section('Words', plain.map(fieldInput).join(''));
    var pf = t.fields.filter(function (f) { return f.kind === 'photo'; })[0];
    if (pf) out += section('Photograph', photoBlock(pf));
    var vs = t.variants || ['night', 'green', 'paper'];
    out += section('Colour', '<div class="studio-segs" role="radiogroup" aria-label="Colour">' + vs.map(function (v) {
      var V = Core.VARIANTS[v], on = Core.variantFor(t, S.doc).id === v;
      return '<button type="button" role="radio" aria-checked="' + on + '" class="studio-seg' + (on ? ' is-on' : '') + '" data-act="variant" data-id="' + v + '"><span class="studio-sw" data-brand style="background:' + V.bg + ';border-color:' + V.accent + '"></span>' + h(V.label) + '</button>';
    }).join('') + '</div><p class="studio-muted">Approved club colourways only.</p>');
    out += section('Checks', '<ul id="studio-checks" class="studio-checks"></ul>');
    out += section('Next step', '<div id="studio-actions"></div>');
    if (S.comp) out += section('History', historyBlock());
    return out;
  }

  function fixtureBlock(t) {
    if (D.registry.error) return '<p class="studio-empty">' + h(D.registry.error) + '</p>';
    var list = (D.registry.fixtures || []).slice();
    if (t.fixturePick === 'played') list = list.filter(function (f) { return f.homeScore != null; }).reverse();
    else if (t.fixturePick !== 'postponed') list = list.filter(function (f) { return f.kickoffAt && Date.parse(f.kickoffAt) > Date.now() - 864e5 * 2; });
    var cur = S.doc.facts.fixture;
    if (cur && !list.some(function (f) { return f.id === cur.id; })) list.unshift(cur);
    if (!list.length) return '<p class="studio-empty">The registry has no ' + (t.fixturePick === 'played' ? 'results with a score' : 'upcoming fixtures') + ' yet.</p>';
    var sel = '<label class="studio-f"><span class="studio-fl">Fixture</span><select data-act="fixture"><option value="">Choose…</option>' + list.map(function (f) {
      return '<option value="' + h(f.id) + '"' + (cur && cur.id === f.id ? ' selected' : '') + '>' + h(Core.shortDate(f.kickoffAt) + ' · ' + f.opponent + ' (' + (f.isHome ? 'H' : 'A') + ')' + (f.homeScore != null ? ' ' + f.homeScore + '–' + f.awayScore : '') + (f.status && f.status !== 'scheduled' && f.status !== 'played' ? ' · ' + f.status : '')) + '</option>';
    }).join('') + '</select></label>';
    if (!cur) return sel;
    var p = cur.kickoffAt ? Core.londonParts(cur.kickoffAt) : null;
    var rows = [
      ['Opponent', cur.opponent + (cur.opponentCrest ? '' : ' — no crest on file')], ['Home or away', cur.isHome ? 'Home' : 'Away'],
      ['Date', p ? Core.dateLine(cur.kickoffAt) : '—'], ['Kick-off', p ? p.time + ' (UK time)' : '—'],
      ['Venue', cur.venue || (cur.isHome ? 'Tithe Farm Social Club' : '—')], ['Competition', cur.competition || '—'], ['Status', cur.status || '—']
    ];
    if (cur.homeScore != null) rows.push(['Score', cur.homeScore + '–' + cur.awayScore + ' (home–away)']);
    var diff = S.factChanges.length ? '<div class="studio-banner studio-banner--warn"><p><strong>The registry has changed since this graphic was made.</strong></p><ul>' +
      S.factChanges.map(function (c) { return '<li>' + h(c.label) + ': ' + h(c.was || '—') + ' → ' + h(c.now || '—') + '</li>'; }).join('') +
      '</ul><div class="studio-row"><button type="button" class="studio-btn studio-btn--primary" data-act="apply-facts">Use the registry facts</button>' +
      '<button type="button" class="studio-btn" data-act="keep-facts">Keep as made</button></div></div>' : '';
    return sel + diff + '<dl class="studio-facts">' + rows.map(function (r) { return '<div><dt>' + h(r[0]) + '</dt><dd>' + h(r[1]) + '</dd></div>'; }).join('') + '</dl>' +
      '<p class="studio-muted">From the football registry. Not editable here — correct the fixture in Fixtures &amp; Results and the Studio will offer the change.</p>';
  }

  function lineupBlock() {
    var lu = S.doc.facts.lineup;
    if (lu && lu.source === 'registry') {
      return '<ol class="studio-xi">' + lu.starters.map(function (p) { return '<li>' + h((p.number ? p.number + '. ' : '') + p.name + (p.captain ? ' (c)' : '')) + '</li>'; }).join('') + '</ol>' +
        '<p class="studio-muted">From the registry line-up (' + h(lu.status || 'recorded') + ').</p>';
    }
    var squad = D.registry.squad || [];
    var chosen = (lu && lu.starters) || [];
    var subs = (lu && lu.subs) || [];
    var opts = function (cur) { return '<option value="">—</option>' + squad.map(function (p) { return '<option' + (cur === p.name ? ' selected' : '') + '>' + h(p.name) + '</option>'; }).join(''); };
    var out = '<p class="studio-note">No line-up in the registry for this fixture yet. Choose from the squad list — names only, nothing typed.</p><div class="studio-xi-pick">';
    for (var i = 0; i < 11; i++) out += '<label class="studio-f studio-f--row"><span class="studio-fl">' + (i + 1) + '</span><select data-xi="' + i + '">' + opts(chosen[i] && chosen[i].name) + '</select></label>';
    out += '</div><div class="studio-xi-pick">';
    for (var j = 0; j < 5; j++) out += '<label class="studio-f studio-f--row"><span class="studio-fl">Sub ' + (j + 1) + '</span><select data-sub="' + j + '">' + opts(subs[j] && subs[j].name) + '</select></label>';
    return out + '</div>';
  }

  function sponsorBlock(sf) {
    var key = S.doc.refs.sponsorKey;
    var sel = '<label class="studio-f"><span class="studio-fl">' + h(sf.label) + (sf.optional ? ' (optional)' : '') + '</span><select data-act="sponsor"><option value="">' + (sf.optional ? 'None' : 'Choose…') + '</option>' +
      (S.lib.sponsors || []).map(function (s) { return '<option value="' + h(s.key) + '"' + (key === s.key ? ' selected' : '') + '>' + h(s.name) + '</option>'; }).join('') + '</select></label>';
    if (!key) return sel;
    var sp = Core.resolveSponsor(S.doc, ctx()), cur = Core.currentLogo(ctx(), key);
    var info = !sp || !sp.logo ? '<p class="studio-empty">No approved logo on file for this sponsor. Add one in Library → Sponsor logos.</p>' :
      '<p class="studio-meta"><img class="studio-logo-thumb' + (sp.logo.ground === 'dark' ? ' studio-logo-thumb--dark' : '') + '" alt="" src="' + h(sp.logo.colour) + '"> Logo version ' + sp.logo.version + (cur && cur.version === sp.logo.version ? ' (current)' : '') + '</p>';
    if (sp && sp.logo && cur && cur.version !== sp.logo.version) info += '<p class="studio-note">A newer approved logo (version ' + cur.version + ') exists. <button type="button" class="studio-btn studio-btn--ghost" data-act="logo-current">Use version ' + cur.version + '</button></p>';
    return sel + info;
  }

  function fieldInput(f) {
    var v = S.doc.fields[f.id];
    var shown = v == null ? (f.default || '') : v;
    var count = '<span class="studio-count" data-count="' + f.id + '">' + String(shown).length + ' / ' + f.max + '</span>';
    var label = '<span class="studio-fl">' + h(f.label) + (f.required ? '' : ' <span class="studio-muted">(optional)</span>') + ' ' + count + '</span>';
    var help = f.help ? '<span class="studio-help">' + h(f.help) + '</span>' : '';
    var ctl = f.kind === 'textarea'
      ? '<textarea data-field="' + f.id + '" maxlength="' + f.max + '" rows="' + (f.max > 400 ? 8 : 3) + '">' + h(shown) + '</textarea>'
      : '<input type="text" data-field="' + f.id + '" maxlength="' + f.max + '" value="' + h(shown) + '">';
    return '<label class="studio-f">' + label + ctl + help + '</label>';
  }

  function photoBlock(pf) {
    var cur = S.doc.fields.photo || '';
    var assets = (S.lib.assets || []).filter(function (a) { return pf.categories.indexOf(a.category) > -1; });
    var groups = {};
    assets.forEach(function (a) { (groups[a.category] = groups[a.category] || []).push(a); });
    var NAMES = { ground: 'Ground', player: 'Players', matchday: 'Matchday', team: 'Club people' };
    var sel = '<label class="studio-f"><span class="studio-fl">Photograph <span class="studio-muted">(optional)</span></span><select data-act="photo"><option value="">No photograph</option>' +
      Object.keys(groups).map(function (g) {
        return '<optgroup label="' + h(NAMES[g] || g) + '">' + groups[g].map(function (a) {
          var ok = a.approval === 'approved';
          return '<option value="' + h(a.id) + '"' + (cur === a.id ? ' selected' : '') + (ok ? '' : ' disabled') + '>' + h(a.title + ' · ' + a.w + '×' + a.h + (ok ? '' : ' · needs review')) + '</option>';
        }).join('') + '</optgroup>';
      }).join('') + '</select></label>';
    var a = assets.filter(function (x) { return x.id === cur; })[0];
    return sel + '<p class="studio-help">' + h(pf.help) + '</p>' + (a ? '<p class="studio-meta"><span>' + h(a.rights_holder) + ' · ' + h(a.licence) + '</span></p>' : '');
  }

  function historyBlock() {
    if (!S.revs.length) return '<p class="studio-muted">No saved revisions.</p>';
    var rows = S.revs.slice().reverse().map(function (r) {
      return '<li><span><strong>Revision ' + r.rev + '</strong>' + (r.state === 'approved' ? ' · approved by ' + h(r.approved_by) : '') + '<br><span class="studio-muted">' + h(r.created_by) + ', ' + h(when(r.created_at)) + '</span></span>' +
        (r.rev !== S.comp.head_rev || S.dirty ? '<button type="button" class="studio-btn studio-btn--ghost" data-act="restore-rev" data-id="' + r.rev + '">Restore as new draft</button>' : '') + '</li>';
    }).join('');
    var ex = S.exports.length ? '<h4 class="studio-h4">Files</h4><ul class="studio-files">' + S.exports.slice(0, 12).map(function (e) {
      return '<li><span>' + h(e.filename) + '</span><span class="studio-muted">' + (e.proof ? 'Proof · ' : '') + (e.w ? e.w + '×' + e.h + ' · ' : '') + kb(e.bytes) + ' · rev ' + e.rev + ' · ' + h(e.exported_by) + ', ' + h(when(e.exported_at)) + '</span></li>';
    }).join('') + '</ul>' : '';
    var pubs = S.pubs.length ? '<h4 class="studio-h4">Published</h4><ul class="studio-files">' + S.pubs.map(function (p) {
      return '<li><span>' + h(p.channel) + '</span><a class="studio-link" href="' + h(p.url) + '" target="_blank" rel="noopener">' + h(p.url) + '</a><span class="studio-muted">' + h(p.recorded_by) + ', ' + h(when(p.recorded_at)) + '</span></li>';
    }).join('') + '</ul>' : '';
    return '<ul class="studio-revs">' + rows + '</ul>' + ex + pubs +
      '<button type="button" class="studio-btn studio-btn--ghost" data-act="duplicate">Duplicate as a new graphic</button>';
  }

  function paintChecks() {
    var el = $('#studio-checks'); if (!el) return;
    if (!S.issues.length) { el.innerHTML = '<li class="studio-check studio-check--ok">All checks pass for ' + h(Core.FORMATS[S.format].label) + '.</li>'; return; }
    var W = { block: 'Must fix', warn: 'Check', info: 'Note' };
    var order = { block: 0, warn: 1, info: 2 };
    el.innerHTML = S.issues.slice().sort(function (a, b) { return order[a.severity] - order[b.severity]; }).map(function (i) {
      return '<li class="studio-check studio-check--' + i.severity + '"><span class="studio-check__k">' + W[i.severity] + '</span> ' + h(i.message) + '</li>';
    }).join('');
  }

  /** The actions that make sense in this state — and only those. */
  function paintActions() {
    var el = $('#studio-actions'); if (!el || !S.doc) return;
    var t = Core.template(S.doc.template);
    var state = S.comp ? S.comp.state : 'draft';
    var blocks = Core.blocking(S.issues).length;
    var out = '';
    var savedClean = S.comp && !S.dirty;
    if (!S.comp || S.dirty) {
      out += '<button type="button" class="studio-btn studio-btn--primary" data-act="save">' + (S.comp ? 'Save revision ' + (S.comp.head_rev + 1) : 'Save draft') + '</button>';
    }
    if (savedClean && state === 'draft') out += '<button type="button" class="studio-btn studio-btn--primary" data-act="move" data-id="review"' + (blocks ? ' disabled' : '') + '>Ready for review</button>';
    if (savedClean && state === 'review') {
      out += '<button type="button" class="studio-btn studio-btn--primary" data-act="move" data-id="approved"' + (blocks ? ' disabled' : '') + '>Approve revision ' + S.comp.head_rev + '</button>' +
        '<button type="button" class="studio-btn" data-act="move" data-id="draft">Send back to draft</button>';
    }
    if (blocks && (state === 'draft' || state === 'review')) out += '<p class="studio-note">' + blocks + ' check' + (blocks > 1 ? 's' : '') + ' must be fixed before review and approval.</p>';
    var hasApproved = S.comp && S.comp.approved_rev && S.approvedDoc;
    if (hasApproved) {
      out += '<h4 class="studio-h4">Final files · approved revision ' + S.comp.approved_rev + '</h4><div class="studio-exports">' +
        t.formats.map(function (f) {
          var F = Core.FORMATS[f];
          return '<div class="studio-exrow"><span>' + h(F.label) + ' <span class="studio-muted">' + F.w + '×' + F.h + '</span></span><span class="studio-row">' +
            (f === 'a4' ? '<button type="button" class="studio-btn" data-act="export" data-kind="pdf" data-id="a4">PDF</button>' : '') +
            '<button type="button" class="studio-btn" data-act="export" data-kind="png" data-id="' + f + '">PNG</button>' +
            '<button type="button" class="studio-btn" data-act="export" data-kind="jpeg" data-id="' + f + '">JPEG</button></span></div>';
        }).join('') + '</div>' +
        '<button type="button" class="studio-btn studio-btn--primary" data-act="zip">Download every format (ZIP)</button>' +
        '<p class="studio-muted">Downloading a file does not publish it anywhere.</p>';
      if (state === 'exported' || state === 'published') {
        out += '<h4 class="studio-h4">Record where it was published</h4><div class="studio-pubform">' +
          '<label class="studio-f"><span class="studio-fl">Channel</span><select id="studio-pub-channel"><option>Instagram</option><option>Facebook</option><option>X</option><option>Website</option><option>WhatsApp</option><option>Print</option><option>Other</option></select></label>' +
          '<label class="studio-f"><span class="studio-fl">Link to the live post</span><input type="url" id="studio-pub-url" placeholder="https://"></label>' +
          '<button type="button" class="studio-btn" data-act="publish">Record publication</button></div>';
      }
    } else {
      out += '<h4 class="studio-h4">Proof</h4><button type="button" class="studio-btn" data-act="proof">Download proof (PNG, ' + h(Core.FORMATS[S.format].label) + ')</button>' +
        '<p class="studio-muted">Proofs carry a "not approved" band. Final files unlock when a revision is approved.</p>';
    }
    el.innerHTML = out;
  }

  // ── server actions ──────────────────────────────────────────────────────
  function busy(on) { S.busy = on; document.querySelectorAll('#studio-root [data-act]').forEach(function (b) { if (b.tagName === 'BUTTON') b.setAttribute('aria-busy', on ? 'true' : 'false'); }); }

  function save() {
    if (!ensureActor()) { say('Add your name first — every change is recorded with it.', 'err'); return Promise.resolve(); }
    busy(true); say('Saving…');
    var body = { doc: S.doc, title: S.title };
    if (S.comp) { body.id = S.comp.id; body.base_rev = S.baseRev != null ? S.baseRev : S.comp.head_rev; }
    return D.call('save', body).then(function (r) {
      busy(false);
      if (!r || !r.ok) { say((r && r.error) || 'Not saved.', 'err'); return; }
      D.autosave(null); S.dirty = false; S.recovery = null;
      var kept = r.keptApproved ? ' Approved revision ' + r.keptApproved + ' is unchanged.' : '';
      return loadComposition(r.composition.id).then(function () { say('Saved as revision ' + S.comp.head_rev + '.' + kept, 'ok'); });
    });
  }
  function move(to) {
    if (!ensureActor()) return;
    var body = { id: S.comp.id, to: to, layout_blocking: Core.blocking(S.issues).length };
    if (to === 'published') {
      body.channel = ($('#studio-pub-channel') || {}).value; body.url = ($('#studio-pub-url') || {}).value;
    }
    busy(true);
    return D.call('move', body).then(function (r) {
      busy(false);
      if (!r || !r.ok) { say((r && r.error) || 'Not changed.', 'err'); return; }
      return loadComposition(S.comp.id).then(function () { say('Now: ' + Core.STATES[S.comp.state].label + '.', 'ok'); });
    });
  }
  function loadComposition(id, keepDoc) {
    return D.call('get', { id: id }).then(function (r) {
      if (!r || !r.ok) { say((r && r.error) || 'Could not open that graphic.', 'err'); return; }
      S.comp = r.composition; S.revs = r.revisions; S.exports = r.exports; S.pubs = r.publications || [];
      var head = r.revisions.filter(function (x) { return x.rev === r.composition.head_rev; })[0];
      var appr = r.revisions.filter(function (x) { return x.rev === r.composition.approved_rev; })[0];
      S.approvedDoc = appr ? appr.doc : null;
      S.baseRev = r.composition.head_rev;
      if (!keepDoc) { S.doc = clone(head.doc); S.title = r.composition.title; S.dirty = false; }
      var t = Core.template(S.doc.template);
      if (t.formats.indexOf(S.format) === -1) S.format = t.formats[0];
      var snap = S.doc.facts && S.doc.facts.fixture;
      S.factChanges = snap && D.fixtureById(snap.id) ? Core.factDiff(snap, D.fixtureById(snap.id)) : [];
      S.view = 'create';
      renderView();
    });
  }
  function loadList() {
    D.call('list', {}).then(function (r) {
      S.list = r && r.ok ? r.compositions : [];
      var host = $('#studio-view'); if (!host || S.view !== 'graphics') return;
      host.innerHTML = graphicsView();
    });
  }

  function exportOne(kind, formatId) {
    var final = !!(S.comp && S.comp.approved_rev && S.approvedDoc);
    var doc = final ? S.approvedDoc : S.doc;
    var rev = final ? S.comp.approved_rev : (S.comp ? S.comp.head_rev : 0);
    say('Rendering ' + Core.FORMATS[formatId].label + ' ' + kind.toUpperCase() + '…');
    return R.exportFile(doc, formatId, ctx(), kind, { proof: !final }).then(function (file) {
      if (final) {
        var issues = Core.qc(file.scene, doc, ctx());
        if (Core.blocking(issues).length) throw new Error('This format fails a check: ' + Core.blocking(issues)[0].message);
      }
      R.download(file.name, file.bytes, file.mime);
      global.__studioLastExport = { name: file.name, bytes: file.bytes.length, w: file.w, h: file.h, kind: kind, sha256: file.sha256 };
      if (!S.comp) { say('Proof downloaded: ' + file.name + ' (' + file.w + '×' + file.h + ', ' + kb(file.bytes.length) + '). Not recorded — save the graphic first.', 'ok'); return file; }
      return D.call('recordExport', { id: S.comp.id, rev: rev, format: formatId, kind: kind, w: file.w, h: file.h, bytes: file.bytes.length, sha256: file.sha256,
        filename: file.name, proof: !final, thumb: R.thumbnail(file.canvas) }).then(function (r) {
        if (!r || !r.ok) { say('File downloaded, but the library did not record it: ' + ((r && r.error) || 'no answer'), 'err'); return file; }
        return loadComposition(S.comp.id, true).then(function () {
          say((final ? 'Exported ' : 'Proof downloaded: ') + file.name + ' — ' + file.w + '×' + file.h + ', ' + kb(file.bytes.length) + '. Recorded in the library.', 'ok');
          return file;
        });
      });
    }).catch(function (e) { say('Export failed: ' + e.message + ' No file was produced.', 'err'); });
  }
  function exportZip() {
    var t = Core.template(S.approvedDoc.template), files = [];
    say('Rendering every format…');
    var chain = Promise.resolve();
    t.formats.forEach(function (f) {
      chain = chain.then(function () {
        return R.exportFile(S.approvedDoc, f, ctx(), f === 'a4' ? 'pdf' : 'png').then(function (file) {
          var issues = Core.qc(file.scene, S.approvedDoc, ctx());
          if (Core.blocking(issues).length) throw new Error(Core.FORMATS[f].label + ': ' + Core.blocking(issues)[0].message);
          files.push(file);
        });
      });
    });
    return chain.then(function () {
      var zipBytes = Pack.zip(files.map(function (f) { return { name: f.name, bytes: f.bytes }; }));
      var name = Core.fileName(S.approvedDoc, t.formats[0], 'zip').replace('-' + t.formats[0] + '-' + Core.FORMATS[t.formats[0]].w + 'x' + Core.FORMATS[t.formats[0]].h, '-all-formats');
      R.download(name, zipBytes, 'application/zip');
      global.__studioLastExport = { name: name, bytes: zipBytes.length, kind: 'zip', files: files.map(function (f) { return f.name; }) };
      return R.sha256(zipBytes).then(function (hash) {
        return D.call('recordExport', { id: S.comp.id, rev: S.comp.approved_rev, format: 'batch', kind: 'zip', bytes: zipBytes.length, sha256: hash, filename: name, proof: false, thumb: R.thumbnail(files[0].canvas) });
      }).then(function (r) {
        return loadComposition(S.comp.id, true).then(function () {
          say(r && r.ok ? 'Downloaded ' + name + ' — ' + files.length + ' files, ' + kb(zipBytes.length) + '. Recorded in the library.' : 'ZIP downloaded, but not recorded: ' + ((r && r.error) || ''), r && r.ok ? 'ok' : 'err');
        });
      });
    }).catch(function (e) { say('Batch export stopped: ' + e.message + ' No ZIP was produced.', 'err'); });
  }

  // ── library & graphics views ────────────────────────────────────────────
  function graphicsView() {
    var list = S.list || [];
    if (!list.length) return '<div class="studio-pane"><div class="studio-empty"><strong>No saved graphics yet.</strong> Make one in Create and save it — it will be listed here with its status, revisions and files.</div></div>';
    return '<div class="studio-pane"><table class="studio-table"><caption class="studio-sr">Saved graphics</caption><thead><tr><th scope="col">Graphic</th><th scope="col">Template</th><th scope="col">Status</th><th scope="col">Revision</th><th scope="col">Last change</th><th scope="col"><span class="studio-sr">Open</span></th></tr></thead><tbody>' +
      list.map(function (c) {
        var t = Core.template(c.template);
        return '<tr><th scope="row">' + h(c.title) + '</th><td>' + h(t ? t.label : c.template) + '</td><td>' + stateChip(c.state) + '</td><td>' + c.head_rev + (c.approved_rev ? ' <span class="studio-muted">(approved ' + c.approved_rev + ')</span>' : '') + '</td><td>' + h(c.updated_by || c.created_by) + ', ' + h(when(c.updated_at)) + '</td>' +
          '<td><button type="button" class="studio-btn" data-act="open-comp" data-id="' + h(c.id) + '">Open</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  var CAT_LABEL = { identity: 'Club identity', player: 'Player photographs', team: 'Club people', matchday: 'Matchday photography', crest: 'Opponent crests', sponsor: 'Sponsor logos', ground: 'Ground photography', heritage: 'Heritage archive', template: 'Approved templates', publication: 'Completed publications' };
  function libraryView() {
    var tabs = '<div class="studio-segs" role="group" aria-label="Library section">' +
      '<button type="button" class="studio-seg' + (S.libTab === 'assets' ? ' is-on' : '') + '" data-act="libtab" data-id="assets" aria-pressed="' + (S.libTab === 'assets') + '">Images</button>' +
      '<button type="button" class="studio-seg' + (S.libTab === 'logos' ? ' is-on' : '') + '" data-act="libtab" data-id="logos" aria-pressed="' + (S.libTab === 'logos') + '">Sponsor logos</button></div>';
    return '<div class="studio-pane">' + tabs + (S.libTab === 'logos' ? logosView() : assetsView()) + '</div>';
  }
  function assetsView() {
    var all = S.lib.assets || [];
    var cats = Object.keys(CAT_LABEL).filter(function (c) { return all.some(function (a) { return a.category === c; }); });
    var list = S.libFilter === 'all' ? all : all.filter(function (a) { return a.category === S.libFilter; });
    var filter = '<label class="studio-f studio-f--inline"><span class="studio-fl">Show</span><select data-act="libfilter"><option value="all">Everything (' + all.length + ')</option>' +
      cats.map(function (c) { return '<option value="' + c + '"' + (S.libFilter === c ? ' selected' : '') + '>' + h(CAT_LABEL[c]) + ' (' + all.filter(function (a) { return a.category === c; }).length + ')</option>'; }).join('') + '</select></label>';
    return filter + '<table class="studio-table studio-table--assets"><caption class="studio-sr">Library images</caption><thead><tr><th scope="col"><span class="studio-sr">Preview</span></th><th scope="col">Asset</th><th scope="col">Size</th><th scope="col">Rights</th><th scope="col">Status</th></tr></thead><tbody>' +
      list.map(function (a) {
        var st = a.approval === 'approved' ? '<span class="studio-chip studio-chip--ok">Approved</span>' : '<span class="studio-chip studio-chip--attn">Needs review</span>';
        return '<tr><td><img class="studio-thumb" loading="lazy" alt="" src="' + h(a.src) + '" width="56" height="56"></td><th scope="row">' + h(a.title) + '<br><span class="studio-muted">' + h(CAT_LABEL[a.category] || a.category) + ' · ' + h(a.source === 'repository' ? 'Club website files' : 'Uploaded') + '</span></th>' +
          '<td>' + a.w + '×' + a.h + (a.w < 1080 && a.category !== 'crest' ? '<br><span class="studio-muted">Small for print</span>' : '') + '</td><td>' + h(a.rights_holder || '—') + '<br><span class="studio-muted">' + h(a.licence || 'No licence recorded') + '</span></td><td>' + st + (a.usage ? '<br><span class="studio-muted">' + h(a.usage) + '</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function logosView() {
    var sp = S.lib.sponsors || [];
    return '<p class="studio-muted">A new logo is a new version. Graphics already made keep the version they were made with; new graphics use the current approved version.</p>' +
      '<table class="studio-table"><caption class="studio-sr">Sponsor logo versions</caption><thead><tr><th scope="col">Sponsor</th><th scope="col">Versions</th><th scope="col">Add a new version</th></tr></thead><tbody>' +
      sp.map(function (s) {
        var vs = Core.logoVersions(ctx(), s.key);
        var cells = vs.length ? vs.map(function (v) {
          var tag = v.current && v.approval === 'approved' ? '<span class="studio-chip studio-chip--ok">Current</span>' : v.approval === 'approved' ? '<span class="studio-chip studio-chip--muted">Superseded</span>' : '<span class="studio-chip studio-chip--attn">Needs approval</span>';
          return '<div class="studio-lv"><img class="studio-logo-thumb' + (v.ground === 'dark' ? ' studio-logo-thumb--dark' : '') + '" alt="' + h(s.name) + ' logo version ' + v.version + '" src="' + h(v.colour) + '"><span>v' + v.version + ' · ' + v.w + '×' + v.h + ' ' + tag + '</span>' +
            (v.approval !== 'approved' ? '<button type="button" class="studio-btn" data-act="approve-logo" data-key="' + h(s.key) + '" data-id="' + v.version + '">Approve as current</button>' : '') + '</div>';
        }).join('') : '<span class="studio-muted">No logo on file</span>';
        return '<tr><th scope="row">' + h(s.name) + '<br><span class="studio-muted">' + h(s.role || '') + '</span></th><td>' + cells + '</td>' +
          '<td><label class="studio-f"><span class="studio-fl">Logo drawn for</span><select data-ground="' + h(s.key) + '"><option value="light">A light background</option><option value="dark">A dark background</option></select></label>' +
          '<label class="studio-upload"><span class="studio-btn">Upload logo</span><input type="file" accept="image/png,image/jpeg,image/webp" data-act="upload-logo" data-key="' + h(s.key) + '" class="studio-sr" aria-label="Upload a new ' + h(s.name) + ' logo"></label></td></tr>';
      }).join('') + '</tbody></table>';
  }
  function reloadLibrary() {
    return D.call('library').then(function (r) { if (r && r.ok) S.lib = r.library; });
  }
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () { resolve({ url: fr.result, w: img.naturalWidth, h: img.naturalHeight }); };
        img.onerror = function () { reject(new Error('That file is not a readable image.')); };
        img.src = fr.result;
      };
      fr.onerror = function () { reject(new Error('Could not read the file.')); };
      fr.readAsDataURL(file);
    });
  }

  // ── events ──────────────────────────────────────────────────────────────
  function onClick(e) {
    var b = e.target.closest('[data-act],[data-view]'); if (!b || b.disabled) return;
    if (b.hasAttribute('data-view')) { S.view = b.getAttribute('data-view'); renderView(); return; }
    var act = b.getAttribute('data-act'), id = b.getAttribute('data-id');
    if (S.busy && ['save', 'move', 'export', 'zip', 'proof', 'publish'].indexOf(act) > -1) return;
    switch (act) {
      case 'close': close(); break;
      case 'actor': var n = prompt('Your name — every change in the Studio is recorded with it.', D.actor()); if (n && n.trim()) { D.setActor(n.trim().slice(0, 80)); paintHeader(); } break;
      case 'template': startNew(id); break;
      case 'format': S.format = id; renderView(); break;
      case 'variant': S.doc.variant = id; touch(); refreshInspector(); break;
      case 'save': save(); break;
      case 'move': move(id); break;
      case 'publish': move('published'); break;
      case 'proof': exportOne('png', S.format); break;
      case 'export': exportOne(b.getAttribute('data-kind'), id); break;
      case 'zip': exportZip(); break;
      case 'crop-reset': delete S.doc.formats[S.format]; touch(); renderView(); break;
      case 'logo-current': var cur = Core.currentLogo(ctx(), S.doc.refs.sponsorKey); if (cur) { S.doc.refs.logoVersion = cur.version; touch(); refreshInspector(); } break;
      case 'apply-facts':
        var live = D.fixtureById(S.doc.facts.fixture.id);
        if (live) { setFixture(live.id).then(function () { S.factChanges = []; touch(); renderView(); say('Registry facts applied. Save to keep them.', 'ok'); }); }
        break;
      case 'keep-facts': S.factChanges = []; refreshInspector(); break;
      case 'restore-rev':
        var r = S.revs.filter(function (x) { return x.rev === +id; })[0];
        if (r) { S.doc = clone(r.doc); touch(); renderView(); say('Revision ' + id + ' loaded as a new draft. Saving creates revision ' + (S.comp.head_rev + 1) + '; nothing earlier is changed.', 'ok'); }
        break;
      case 'duplicate':
        var d = clone(S.doc); S.comp = null; S.revs = []; S.exports = []; S.pubs = []; S.approvedDoc = null; S.baseRev = null;
        S.doc = d; S.title = 'Copy of ' + S.title; touch(); renderView(); say('Duplicated. This is a new, unsaved graphic.', 'ok');
        break;
      case 'open-comp': loadComposition(id); break;
      case 'libtab': S.libTab = id; renderView(); break;
      case 'approve-logo':
        if (!ensureActor()) return;
        D.call('approveLogo', { sponsor_key: b.getAttribute('data-key'), version: +id }).then(function (r) {
          if (!r || !r.ok) { say((r && r.error) || 'Not approved.', 'err'); return; }
          reloadLibrary().then(function () { renderView(); say('Logo version ' + id + ' is now current. Existing graphics keep the version they were made with.', 'ok'); });
        });
        break;
      case 'recover': recover(); break;
      case 'discard-recovery': D.autosave(null); S.recovery = null; $('#studio-recovery').innerHTML = ''; say('Discarded.'); break;
    }
  }
  function refreshInspector() {
    var ins = $('#studio-root .studio-inspector'); if (ins) { ins.innerHTML = inspector(); paintChecks(); paintActions(); }
  }
  function onInput(e) {
    var el = e.target;
    if (el.hasAttribute('data-field')) {
      S.doc.fields[el.getAttribute('data-field')] = el.value;
      var c = $('[data-count="' + el.getAttribute('data-field') + '"]');
      if (c) c.textContent = el.value.length + ' / ' + el.getAttribute('maxlength');
      touch(); return;
    }
    if (el.getAttribute('data-act') === 'title') { S.title = el.value; S.dirty = true; D.autosave({ compId: S.comp ? S.comp.id : null, base_rev: S.comp ? S.comp.head_rev : null, doc: S.doc, title: S.title, dirty: true }); paintActions(); return; }
    if (el.hasAttribute('data-crop')) {
      var k = el.getAttribute('data-crop');
      var cr = S.doc.formats[S.format] = S.doc.formats[S.format] || { focus: { x: 0.5, y: 0.5 }, zoom: 1 };
      cr.focus = cr.focus || { x: 0.5, y: 0.5 };
      if (k === 'zoom') cr.zoom = +el.value / 100; else cr.focus[k] = +el.value / 100;
      touch();
    }
  }
  function onChange(e) {
    var el = e.target, act = el.getAttribute('data-act');
    if (act === 'guides') { S.guides = el.checked; drawStage(); return; }
    if (act === 'template-select') { startNew(el.value); return; }
    if (act === 'fixture') { setFixture(el.value).then(function () { S.factChanges = []; if (!S.comp) S.title = autoTitle(S.doc); touch(); refreshInspector(); }); return; }
    if (act === 'sponsor') {
      if (!el.value) { delete S.doc.refs.sponsorKey; delete S.doc.refs.logoVersion; }
      else { var cur = Core.currentLogo(ctx(), el.value); S.doc.refs.sponsorKey = el.value; S.doc.refs.logoVersion = cur ? cur.version : null; }
      if (!S.comp) S.title = autoTitle(S.doc);
      touch(); refreshInspector(); return;
    }
    if (act === 'photo') { if (el.value) S.doc.fields.photo = el.value; else delete S.doc.fields.photo; touch(); renderView(); return; }
    if (act === 'libfilter') { S.libFilter = el.value; renderView(); return; }
    if (el.hasAttribute('data-xi') || el.hasAttribute('data-sub')) {
      var lu = S.doc.facts.lineup = S.doc.facts.lineup && S.doc.facts.lineup.source === 'squad' ? S.doc.facts.lineup : { source: 'squad', starters: [], subs: [] };
      var picks = function (sel) { return Array.prototype.map.call(document.querySelectorAll('#studio-root ' + sel), function (s) { return s.value; }).filter(Boolean).map(function (n) { return { name: n, number: '' }; }); };
      lu.starters = picks('[data-xi]'); lu.subs = picks('[data-sub]');
      touch(); return;
    }
    if (act === 'upload-logo' && el.files && el.files[0]) {
      if (!ensureActor()) return;
      var key = el.getAttribute('data-key');
      readFile(el.files[0]).then(function (img) {
        var g = document.querySelector('#studio-root [data-ground="' + key + '"]');
        return D.call('uploadLogo', { sponsor_key: key, colour: img.url, w: img.w, h: img.h, ground: g ? g.value : 'light' });
      }).then(function (r) {
        if (!r || !r.ok) { say((r && r.error) || 'Not uploaded.', 'err'); return; }
        return reloadLibrary().then(function () { renderView(); say('Uploaded as version ' + r.logo.version + '. It is used only after someone approves it as current.', 'ok'); });
      }).catch(function (err) { say(err.message, 'err'); });
    }
  }

  global.StudioApp = { open: open, close: close, startNew: startNew, _state: S };
}(typeof window !== 'undefined' ? window : globalThis));
