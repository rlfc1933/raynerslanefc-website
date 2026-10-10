/* ════════════════════════════════════════════════════════════════════════
   LANE HQ — the shell: one navigation, the Command Centre, matchday
   preparation and the notification centre.

   It replaces five competing ways in (Quick actions, My recent work, My club
   work, All club tools accordions, the classic tile list) with ONE structure,
   drawn twice: a persistent side navigation on wide screens and a bottom bar
   plus menu sheet on phones. Every destination is an existing panel opened
   through openPanel(), so the server keeps deciding what each person may do.

   The Command Centre answers, before anything else:
     1. what absolutely needs doing (grouped, de-duplicated, by fixture),
     2. where money can come in,
     3. how the supporter base is growing,
   then the next match, programmes, my work and recent activity.

   FIXTURES COME FROM THE FOOTBALL REGISTRY (js/football-data.js), never from
   data/fixtures.json, and every date is calculated in Europe/London.

   Nothing is invented. A source that cannot be read says so in place; an
   empty list says it is empty.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var M = global.HQModel, T = global.HQTime;
  // Captured before PortalRecent wraps fetch: reading matchday records is not
  // "work saved", and must not appear in anybody's recent work.
  var rawFetch = global.fetch;
  var API = '/.netlify/functions/club-os';
  var NOTIF_KEY = 'hq_notif_v1';
  var S = {
    where: 'home', data: null, loading: false, groups: [], notes: null, open: {},
    match: { fixtureId: null }, navOpen: {}, query: ''
  };

  // ── small helpers ───────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sess() { try { return JSON.parse(sessionStorage.getItem('rlfc_staff') || 'null'); } catch (e) { return null; } }
  function role() { var s = sess(); return (s && (s.role || s.username)) || 'Committee'; }
  function isChair() { var s = sess(); return !!(s && s.isChairman); }
  function actor() { try { return localStorage.getItem('rlfc_actor') || ''; } catch (e) { return ''; } }
  function personName() { var s = sess(); return (s && s.name) || actor() || ''; }
  function ls(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function now() { return Date.now(); }
  function reduced() { return (global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.documentElement.classList.contains('a11y-reduce-motion'); }

  /** Functional motion only: the row that changed settles into place. */
  var _motion = null;
  function settle(el) {
    if (!el || reduced()) return;
    (_motion = _motion || import('/js/vendor/motion-mini-13.4.3.mjs')).then(function (m) {
      m.animate(el, { opacity: [0.4, 1], transform: ['translateY(4px)', 'translateY(0)'] }, { duration: 0.22, ease: [0.22, 1, 0.36, 1] });
    }).catch(function () {});
  }

  function cos(action, body) {
    var b = Object.assign({ action: action, pin: global.PIN || '', actor: actor() }, body || {});
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Unreadable answer (' + r.status + ')' }; }); })
      .catch(function () { return { ok: false, error: 'No connection', offline: true }; });
  }
  function askName() {
    var cur = actor();
    var n = global.prompt ? global.prompt('Your name — every change in HQ is signed (e.g. "Pete Singh").', cur || personName() || '') : '';
    n = String(n || '').trim().slice(0, 80);
    if (n) { try { localStorage.setItem('rlfc_actor', n); } catch (e) {} }
    try { document.querySelectorAll('[data-cos-actor]').forEach(function (el) { el.textContent = n || 'Set your name'; }); } catch (e) {}
    return n;
  }
  function write(action, body) {
    if (!actor() && !askName()) return Promise.resolve({ ok: false, error: 'Add your name first — every change is signed.' });
    return cos(action, body);
  }
  function tool(id) { return global.PortalTools ? global.PortalTools.byId(id) : null; }
  function canSee(id) {
    var t = tool(id);
    if (!t) return false;
    return global.PortalTools.canSee(t, role(), isChair());
  }
  function go(id) {
    closeSheet();
    if (id === 'home') return home();
    var t = tool(id);
    if (t && t.href) { location.href = t.href; return; }
    if (typeof global.openPanel === 'function') global.openPanel(id);
  }

  // ── NAVIGATION ──────────────────────────────────────────────────────────
  var SECTION_ICON = { overview: 'ico-house', football: 'ico-football', community: 'ico-users', commercial: 'ico-handshake', media: 'ico-image', admin: 'ico-settings' };

  function navModel() {
    return M.navFor(canSee, function (id) { return !!tool(id); });
  }
  function navHTML(prefix) {
    var q = S.query.trim().toLowerCase();
    var cur = M.sectionOf(S.where);
    var out = '<div class="hq-nav__search"><label class="hq-sr" for="' + prefix + '-q">Find a tool</label>' +
      '<input id="' + prefix + '-q" class="hq-input" type="search" placeholder="Find a tool" autocomplete="off" value="' + h(S.query) + '" data-hq-q></div>';
    var any = false;
    navModel().forEach(function (sec) {
      var items = sec.items.filter(function (it) {
        if (!q) return true;
        var t = tool(it.id);
        return (it.label + ' ' + (t ? t.name + ' ' + t.desc : '')).toLowerCase().indexOf(q) > -1;
      });
      if (!items.length) return;
      any = true;
      // A search opens everything it matched; otherwise the person's own
      // choice, else Overview plus the section they are working in.
      var expanded = q ? true : (S.navOpen[sec.key] != null ? !!S.navOpen[sec.key]
        : (sec.key === 'overview' || !!(cur && cur.key === sec.key)));
      out += '<div class="hq-nav__sec' + (expanded ? ' is-open' : '') + '">' +
        '<button type="button" class="hq-nav__head" aria-expanded="' + expanded + '" data-hq-sec="' + sec.key + '">' +
        '<i class="ico ' + SECTION_ICON[sec.key] + '" aria-hidden="true"></i><span>' + h(sec.name) + '</span>' +
        '<span class="hq-nav__chev" aria-hidden="true"></span></button>' +
        '<ul class="hq-nav__list"' + (expanded ? '' : ' hidden') + '>' + items.map(function (it) {
          var here = S.where === it.id;
          return '<li><a href="#' + (it.id === 'home' ? '' : h(it.id)) + '" class="hq-nav__item' + (here ? ' is-here' : '') + '"' +
            (here ? ' aria-current="page"' : '') + ' data-hq-go="' + h(it.id) + '">' + h(it.label) + '</a></li>';
        }).join('') + '</ul></div>';
    });
    if (!any) out += '<p class="hq-nav__none">No tool matches “' + h(S.query) + '”.</p>';
    return out;
  }
  function paintNav() {
    var side = $('hq-nav');
    if (side) {
      var hadFocus = document.activeElement && document.activeElement.id === 'hq-nav-q';
      var pos = hadFocus ? document.activeElement.selectionStart : 0;
      side.innerHTML = navHTML('hq-nav');
      if (hadFocus) { var i = $('hq-nav-q'); i.focus(); try { i.setSelectionRange(pos, pos); } catch (e) {} }
    }
    var sheet = $('hq-sheet-body');
    if (sheet && $('hq-sheet').classList.contains('on')) {
      var hf = document.activeElement && document.activeElement.id === 'hq-sheet-q';
      var p2 = hf ? document.activeElement.selectionStart : 0;
      sheet.innerHTML = navHTML('hq-sheet');
      if (hf) { var j = $('hq-sheet-q'); j.focus(); try { j.setSelectionRange(p2, p2); } catch (e) {} }
    }
    paintTabbar();
  }
  function paintTabbar() {
    var tb = $('hq-tabbar'); if (!tb) return;
    var tabs = [{ id: 'home', label: 'Overview', ico: 'ico-house' }, { id: 'preparematch', label: 'Matchday', ico: 'ico-football' },
      { id: 'clubtasks', label: 'Tasks', ico: 'ico-clipboard-list' }];
    tb.innerHTML = tabs.filter(function (t) { return t.id === 'home' || canSee(t.id); }).map(function (t) {
      var here = S.where === t.id;
      return '<button type="button" class="hq-tab' + (here ? ' is-here' : '') + '"' + (here ? ' aria-current="page"' : '') + ' data-hq-go="' + t.id + '">' +
        '<i class="ico ' + t.ico + '" aria-hidden="true"></i><span>' + t.label + '</span></button>';
    }).join('') +
      '<button type="button" class="hq-tab" data-hq-sheet aria-haspopup="dialog" aria-controls="hq-sheet">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span>Menu</span></button>';
  }
  function openSheet() {
    var sh = $('hq-sheet'); if (!sh) return;
    sh.classList.add('on'); sh.removeAttribute('hidden');
    $('hq-sheet-body').innerHTML = navHTML('hq-sheet');
    document.body.classList.add('hq-locked');
    var f = sh.querySelector('.hq-sheet__close'); if (f) f.focus();
  }
  function closeSheet() {
    var sh = $('hq-sheet'); if (!sh || !sh.classList.contains('on')) return;
    sh.classList.remove('on'); sh.setAttribute('hidden', '');
    document.body.classList.remove('hq-locked');
  }

  /** Called by openPanel()/showDash() so the header and nav always agree. */
  function onNavigate(id) {
    S.where = id || 'home';
    var title = id === 'home' ? 'Command centre' : (M.labelOf(id) || (tool(id) && tool(id).name) || id);
    var w = $('hq-where'); if (w) w.textContent = title;
    var sec = M.sectionOf(S.where);
    if (sec) S.navOpen[sec.key] = true;
    paintNav();
    var home = $('hq-home'); if (home) home.hidden = id !== 'home';
    if (id === 'preparematch') renderMatch();
    try { document.title = title + ' · Lane HQ'; } catch (e) {}
  }
  function home() {
    if (typeof global.back === 'function' && history.state && history.state.panel) { global.back(); return; }
    if (typeof global.showDash === 'function') global.showDash(); else onNavigate('home');
  }

  // ── DATA ────────────────────────────────────────────────────────────────
  function mdopsRows() {
    var tok; try { tok = sessionStorage.getItem('rlfc_md_token'); } catch (e) { tok = null; }
    if (!tok) return Promise.resolve({ rows: null, why: 'no-session' });
    return rawFetch.call(global, '/.netlify/functions/matchday-ops', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: global.PIN, token: tok, action: 'list' }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { return j && j.ok ? { rows: j.rows || [] } : { rows: null, why: (j && j.error) || 'error' }; })
      .catch(function () { return { rows: null, why: 'offline' }; });
  }
  function members() {
    if (typeof global.loadMembers !== 'function') return Promise.resolve(null);
    return global.loadMembers().catch(function () { return null; });
  }
  function submissions() {
    return fetch('/.netlify/functions/list-submissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: global.PIN }) })
      .then(function (r) { return r.json(); }).then(function (d) { return d && d.ok ? d.submissions || [] : null; }).catch(function () { return null; });
  }
  function dataFile(name) {
    return new Promise(function (res) {
      if (typeof global.fetchJSON === 'function') global.fetchJSON(name, function (d) { res(d || null); });
      else fetch('data/' + name + '.json').then(function (r) { return r.ok ? r.json() : null; }).then(res).catch(function () { res(null); });
    });
  }
  var KINDS = ['task', 'enquiry', 'comms', 'outreach', 'invoice', 'opportunity', 'grant'];

  function load() {
    if (S.loading) return S.loading;
    var F = global.RLFCFootball;
    if (F && F.refresh) F.refresh();
    var jobs = [
      F ? F.fixtures() : Promise.resolve(null),
      F ? F.results() : Promise.resolve(null),
      cos('summary'),
      // Tasks include finished ones: a matchday checklist shows what is done, not only what is left.
      Promise.all(KINDS.map(function (k) { return cos('list', k === 'task' ? { kind: k } : { kind: k, open: true }); })),
      cos('history', { limit: 12 }),
      mdopsRows(), members(), submissions(), dataFile('programme')
    ];
    S.loading = Promise.all(jobs).then(function (r) {
      var lists = {}, listErr = null;
      KINDS.forEach(function (k, i) { var x = r[3][i]; if (x && x.ok) lists[k] = x.items || []; else listErr = listErr || (x && x.error); });
      S.data = {
        at: now(),
        fixtures: r[0] && r[0].fixtures ? r[0].fixtures : null,
        results: r[1] && r[1].results ? r[1].results : null,
        summary: r[2] && r[2].ok ? r[2] : null, summaryErr: r[2] && !r[2].ok ? r[2].error : null,
        items: lists, listErr: listErr,
        history: r[4] && r[4].ok ? r[4].audit || [] : null,
        md: r[5], members: r[6], subs: r[7], programme: r[8]
      };
      compute();
      S.loading = false;
      return S.data;
    }).catch(function () { S.loading = false; return S.data; });
    return S.loading;
  }

  function compute() {
    var d = S.data; if (!d) return;
    S.groups = M.buildPriorities({
      now: now(), fixtures: d.fixtures || [], results: d.results || [],
      mdopsRows: d.md && d.md.rows ? d.md.rows : [],
      scoreboardOn: !!global.isLive,
      cos: { attention: d.summary ? d.summary.attention : null, items: d.items }
    });
    var n = M.notifications(S.groups, ls(NOTIF_KEY), now());
    ls(NOTIF_KEY, n.state);
    S.notes = n;
  }

  // ── COMMAND CENTRE ──────────────────────────────────────────────────────
  function sevLabel(s) { return s === 'critical' ? 'Critical' : s === 'high' ? 'Urgent' : s === 'normal' ? 'Soon' : 'Later'; }

  function renderHome() {
    var el = $('hq-home'); if (!el) return;
    var d = S.data;
    var today = T.longDate(now());
    var nx = d && d.fixtures ? M.nextFixture(d.fixtures, now(), d.results) : null;
    var sub = today + (nx && nx.fixture ? ' · next match ' + M.relDay(nx.fixture.kickoffAt, now()) : '');
    el.innerHTML =
      '<header class="hq-page">' +
        '<div><h1 class="hq-page__h">Command centre</h1><p class="hq-page__sub">' + h(sub) + '</p></div>' +
        '<button type="button" class="hq-btn hq-btn--ghost hq-btn--sm" data-hq-refresh>' + (d ? 'Refresh' : 'Loading…') + '</button>' +
      '</header>' +
      (d ? matchStrip(nx) : '<div class="hq-skel" aria-hidden="true"></div>') +
      '<div class="hq-cols">' +
        '<div class="hq-cols__main">' +
          section('hq-s-work', 'Needs doing', d ? workList() : loadingLine(), 'hq-sec--work') +
          section('hq-s-mine', 'My work', d ? myWork() : loadingLine()) +
        '</div>' +
        '<div class="hq-cols__side">' +
          section('hq-s-money', 'Money in', d ? moneyRows() : loadingLine()) +
          section('hq-s-fans', 'Supporters', d ? fanRows(nx) : loadingLine()) +
          section('hq-s-prog', 'Programmes', d ? programmeRows() : loadingLine()) +
        '</div>' +
      '</div>' +
      section('hq-s-act', 'Recent activity', d ? activity() : loadingLine(), 'hq-sec--act') +
      installHint();
  }
  function section(id, title, body, cls) {
    return '<section class="hq-sec ' + (cls || '') + '" aria-labelledby="' + id + '"><h2 class="hq-sec__h" id="' + id + '">' + h(title) + '</h2>' + body + '</section>';
  }
  function loadingLine() { return '<p class="hq-muted">Loading…</p>'; }

  function crest(src, name) {
    if (src) return '<img class="hq-crest" src="' + h(src) + '" alt="" width="28" height="28" loading="lazy">';
    var ini = String(name || '?').split(/\s+/).map(function (w) { return w[0] || ''; }).join('').slice(0, 2).toUpperCase();
    return '<span class="hq-crest hq-crest--ini" aria-hidden="true">' + h(ini) + '</span>';
  }
  function matchLine(f) {
    return f.isHome === false ? (f.opponent || 'TBC') + ' v Rayners Lane' : 'Rayners Lane v ' + (f.opponent || 'TBC');
  }
  function oppCrest(f) { return f.isHome === false ? f.homeCrest : f.awayCrest; }

  function matchStrip(nx) {
    var d = S.data;
    if (!d.fixtures) {
      return '<section class="hq-match hq-match--none" aria-label="Next match"><p><b>The fixture list could not be read.</b> ' +
        'Fixtures come from the football registry; nothing is shown rather than an out-of-date list. Try Refresh.</p></section>';
    }
    if (!nx || !nx.fixture) {
      return '<section class="hq-match hq-match--none" aria-label="Next match"><p>No upcoming fixture in the registry.</p></section>';
    }
    var f = nx.fixture;
    var tasks = M.tasksForFixture(d.items.task, f.id);
    var done = tasks.filter(function (t) { return M.CLOSED[t.stage]; }).length;
    var nh = M.nextHome(d.fixtures, now());
    var prog = tasks.length
      ? '<span class="hq-prog" role="img" aria-label="' + done + ' of ' + tasks.length + ' matchday jobs done"><span style="width:' + Math.round(done / tasks.length * 100) + '%"></span></span>' +
        '<span class="hq-match__jobs">' + done + ' of ' + tasks.length + ' jobs done</span>'
      : '<span class="hq-match__jobs">No checklist yet</span>';
    return '<section class="hq-match" aria-labelledby="hq-match-h">' +
      '<div class="hq-match__id">' + crest(oppCrest(f), f.opponent) +
        '<div><p class="hq-match__k">' + (nx.state === 'live' ? '<span class="hq-live">Live now</span>' : 'Next match') + '</p>' +
        '<h2 class="hq-match__h" id="hq-match-h">' + h(matchLine(f)) + '</h2>' +
        '<p class="hq-match__m">' + h(T.kickoffLabel(f, now())) + ' · ' + (f.isHome === false ? 'Away' : 'Home') +
          (f.competition ? ' · ' + h(f.competition) : '') + (f.venue ? ' · ' + h(f.venue) : '') + '</p></div></div>' +
      '<div class="hq-match__prep">' + prog + '</div>' +
      '<div class="hq-match__go"><button type="button" class="hq-btn hq-btn--primary" data-hq-go="preparematch" data-hq-fx="' + h(f.id) + '">Matchday preparation</button></div>' +
      (nh && nh.id !== f.id ? '<p class="hq-match__home">Next home match: <b>' + h(nh.opponent) + '</b>, ' + h(T.kickoffLabel(nh, now())) + '</p>' : '') +
    '</section>';
  }

  function workList() {
    var d = S.data;
    var warn = [];
    if (!d.summary) warn.push('Club office records could not be loaded' + (d.summaryErr ? ' (' + d.summaryErr + ')' : '') + ', so sponsorship, tasks and approvals are not included.');
    if (!d.fixtures) warn.push('The fixture registry could not be read, so fixture checks are not included.');
    if (d.md && d.md.rows == null) warn.push('Attendance and takings records need a personal staff sign-in to check; open Attendance and takings to see them.');
    var groups = S.groups;
    var out = '';
    if (!groups.length) {
      out += '<p class="hq-empty"><b>Nothing needs doing right now.</b> Every check below found nothing outstanding.</p>';
    } else {
      out += '<ul class="hq-pri" role="list">' + groups.map(groupRow).join('') + '</ul>';
    }
    if (warn.length) out += '<ul class="hq-notes" role="list">' + warn.map(function (w) { return '<li>' + h(w) + '</li>'; }).join('') + '</ul>';
    return out;
  }
  function groupRow(g) {
    var open = !!S.open[g.id];
    var did = 'hq-g-' + g.id.replace(/[^a-z0-9-]/gi, '-');
    var items = g.items.length ? '<ul class="hq-pri__items" role="list">' + g.items.map(function (i) {
      return '<li class="hq-pri__item' + (i.historic ? ' is-old' : '') + '"><div><span class="hq-pri__it">' + h(i.title) + '</span>' +
        (i.meta ? '<span class="hq-pri__im">' + h(i.meta) + '</span>' : '') + '</div>' +
        '<button type="button" class="hq-link" data-hq-go="' + h(i.panel || g.panel) + '"' + (g.fixtureId ? ' data-hq-fx="' + h(g.fixtureId) + '"' : '') + '>Open</button></li>';
    }).join('') + '</ul>' : '';
    var dest = M.labelOf(g.panel) || (tool(g.panel) && tool(g.panel).name) || 'Open';
    return '<li class="hq-pri__row hq-sev--' + g.severity + (open ? ' is-open' : '') + '" data-hq-group="' + h(g.id) + '">' +
      '<button type="button" class="hq-pri__btn" aria-expanded="' + open + '" aria-controls="' + did + '">' +
        '<span class="hq-pri__sev"><span class="hq-dot" aria-hidden="true"></span>' + sevLabel(g.severity) + '</span>' +
        '<span class="hq-pri__t">' + h(g.title) + '</span>' +
        '<span class="hq-pri__n">' + (g.items.length > 1 ? g.items.length : '') + '</span>' +
        '<span class="hq-pri__chev" aria-hidden="true"></span>' +
      '</button>' +
      '<div class="hq-pri__detail" id="' + did + '"' + (open ? '' : ' hidden') + '>' +
        (g.detail ? '<p class="hq-pri__d">' + h(g.detail) + '</p>' : '') + items +
        '<button type="button" class="hq-btn hq-btn--sm" data-hq-go="' + h(g.panel) + '"' + (g.fixtureId ? ' data-hq-fx="' + h(g.fixtureId) + '"' : '') + '>Go to ' + h(dest.charAt(0).toLowerCase() + dest.slice(1)) + '</button>' +
      '</div></li>';
  }

  function row(label, value, panel, note) {
    var v = '<span class="hq-row__v">' + value + '</span>';
    var inner = '<span class="hq-row__l">' + h(label) + (note ? '<span class="hq-row__n">' + h(note) + '</span>' : '') + '</span>' + v;
    return panel && canSee(panel)
      ? '<li><button type="button" class="hq-row" data-hq-go="' + h(panel) + '">' + inner + '</button></li>'
      : '<li><div class="hq-row">' + inner + '</div></li>';
  }
  function count(list, test) { return (list || []).filter(test).length; }

  function moneyRows() {
    var d = S.data, it = d.items, m = d.summary && d.summary.money;
    if (!d.summary && !Object.keys(it).length) {
      return '<p class="hq-empty">Sponsorship records could not be loaded' + (d.summaryErr ? ': ' + h(d.summaryErr) : '') + '.</p>';
    }
    var enq = count(it.enquiry, function (i) { return i.stage === 'new' || i.stage === 'acknowledged'; });
    var props = count(it.opportunity, function (i) { return i.stage === 'proposal' || i.stage === 'negotiation'; });
    var live = count(it.opportunity, function (i) { return ['qualified', 'contact_approved', 'contacted', 'responded', 'meeting'].indexOf(i.stage) > -1; });
    var grants = count(it.grant, function (i) { return ['eligible', 'preparing', 'awaiting_approval'].indexOf(i.stage) > -1; });
    var approve = count(it.outreach, function (i) { return i.stage === 'draft'; });
    var rows = [
      row('New sponsorship enquiries', String(enq), 'commercial', enq ? 'Reply within 48 hours' : null),
      row('Proposals awaiting a decision', String(props), 'commercial'),
      row('Conversations in progress', String(live), 'commercial'),
      row('Owed on issued invoices', m ? M.pounds(m.owed_pence) : '—', 'commercial'),
      row('Agreed this season', m ? M.pounds(m.contracted_pence) : '—', 'commercial', m && m.in_kind_estimate_pence ? '+ ' + M.pounds(m.in_kind_estimate_pence) + ' in kind' : null),
      row('Grants worth pursuing', String(grants), 'funding'),
      row('Business approaches to approve', String(approve), 'outreach')
    ];
    var empty = !enq && !props && !live && !grants && !approve && !(m && (m.owed_pence || m.contracted_pence));
    return '<ul class="hq-rows" role="list">' + rows.join('') + '</ul>' +
      (empty ? '<p class="hq-muted">No sponsorship activity recorded yet. Enquiries from the website arrive here automatically; prospects are added in Business outreach.</p>' : '');
  }

  function fanRows(nx) {
    var d = S.data, out = [];
    var mem = d.members;
    if (mem && mem.configured) {
      var list = mem.members || [];
      var since = now() - 30 * 86400000;
      var recent = list.filter(function (x) { var t = Date.parse(x.created || x.created_at || ''); return isFinite(t) && t >= since; }).length;
      out.push(row('Fan Zone members', String(list.length), 'supporters', recent ? recent + ' joined in the last 30 days' : 'None joined in the last 30 days'));
    } else {
      out.push(row('Fan Zone members', '—', 'supporters', 'Member list not connected'));
    }
    if (d.subs) {
      var unread = d.subs.filter(function (s) { return !s.read_at; }).length;
      out.push(row('Unread website enquiries', String(unread), 'records', 'Trials, volunteers, contact'));
    } else {
      out.push(row('Unread website enquiries', '—', 'records', 'Could not be read'));
    }
    var att = lastAttendance();
    out.push(row('Last home attendance', att ? String(att.n) : '—', 'mdops', att ? att.label : 'Recorded in Attendance and takings'));
    var nh = d.fixtures ? M.nextHome(d.fixtures, now()) : null;
    if (nh) out.push(row('Promote the next home match', '', 'poststudio', nh.opponent + ', ' + T.kickoffLabel(nh, now()) + ' — make the matchday graphic'));
    return '<ul class="hq-rows" role="list">' + out.join('') + '</ul>';
  }
  function lastAttendance() {
    var d = S.data; if (!d.md || !d.md.rows) return null;
    var done = d.md.rows.filter(function (r) { return r.record && (r.record.attendance_calculated != null); })
      .sort(function (a, b) { return String(b.fixture.date).localeCompare(String(a.fixture.date)); })[0];
    return done ? { n: done.record.attendance_calculated, label: done.fixture.opponent + ', ' + T.shortDate(done.fixture.date) } : null;
  }

  function programmeFor(fx) {
    var p = S.data.programme;
    if (!fx) return { state: 'none' };
    if (!p || !p.opponent) return { state: 'notstarted' };
    var same = String(p.opponent).toLowerCase() === String(fx.opponent || '').toLowerCase();
    if (!same) return { state: 'other', p: p };
    var core = ['managerNotes', 'welcomeNotes', 'oppSummary', 'storylines'];
    var have = core.filter(function (k) { return p[k] && String(p[k]).trim(); }).length;
    var dayNow = T.londonDate(fx.kickoffAt);
    var pDay = String(p.date || '').slice(0, 10);
    return { state: p.published ? 'published' : have ? 'draft' : 'started', have: have, of: core.length,
      dateMismatch: pDay && pDay !== dayNow ? pDay : null, p: p };
  }
  function programmeRows() {
    var d = S.data;
    if (!d.fixtures) return '<p class="hq-muted">Needs the fixture registry.</p>';
    var nh = M.nextHome(d.fixtures, now());
    if (!nh) return '<p class="hq-muted">No home match in the registry, so no programme is due.</p>';
    var st = programmeFor(nh);
    var label = { notstarted: 'Not started', other: 'Not started', started: 'Started, no sections written', draft: 'Draft · ' + st.have + ' of ' + st.of + ' sections', published: 'Published' }[st.state];
    var out = row(nh.opponent + ' · ' + T.shortDate(nh.kickoffAt), h(label), 'programme');
    var notes = '';
    if (st.state === 'other') notes += '<p class="hq-flag">The programme being edited is for <b>' + h(st.p.opponent) + '</b>' + (st.p.date ? ' (' + h(T.shortDate(st.p.date)) + ')' : '') + ', not this fixture.</p>';
    if (st.dateMismatch) notes += '<p class="hq-flag">The programme draft is dated ' + h(T.shortDate(st.dateMismatch)) + '; the fixture is now ' + h(T.shortDate(nh.kickoffAt)) + '. Check the date before it is printed.</p>';
    return '<ul class="hq-rows" role="list">' + out + '</ul>' + notes;
  }

  function myWork() {
    var me = actor() || personName();
    var d = S.data;
    if (!me) return '<p class="hq-muted">Set your name to see the work assigned to you.</p><button type="button" class="hq-btn hq-btn--sm" data-hq-name>Set your name</button>';
    var first = me.split(/\s+/)[0].toLowerCase();
    var all = [];
    KINDS.forEach(function (k) { (d.items[k] || []).forEach(function (i) { all.push(i); }); });
    var mine = all.filter(function (i) {
      var o = String(i.owner || '').toLowerCase();
      return o && !M.CLOSED[i.stage] && (o === me.toLowerCase() || o.split(/\s+/)[0] === first);
    }).sort(function (a, b) { return String(a.due_date || '9').localeCompare(String(b.due_date || '9')); });
    var recent = global.PortalRecent ? global.PortalRecent.list().slice(0, 3) : [];
    var out = '';
    if (mine.length) {
      out += '<ul class="hq-rows" role="list">' + mine.slice(0, 6).map(function (i) {
        var due = i.due_date ? (i.due_date < T.londonDate(now()) ? 'Overdue · ' : '') + T.shortDate(i.due_date) : 'No date';
        return row(i.title, h(due), M.KIND_PANEL[i.kind] || 'command');
      }).join('') + '</ul>' + (mine.length > 6 ? '<p class="hq-muted">' + (mine.length - 6) + ' more in Tasks and approvals.</p>' : '');
    } else {
      out += '<p class="hq-muted">Nothing is assigned to ' + h(me) + ' in the club office.</p>';
    }
    if (recent.length) {
      out += '<h3 class="hq-sub">Saved from this device</h3><ul class="hq-rows" role="list">' + recent.map(function (r) {
        return row(r.tool.name, h(global.PortalRecent.ago(r.at)), r.tool.id);
      }).join('') + '</ul>';
    }
    return out;
  }

  var VERB = { create: 'created', update: 'updated', move: 'moved', pay: 'recorded a payment on', seed: 'loaded starting records', saveOrg: 'updated', suppress: 'added a do-not-contact entry', redeem: 'redeemed a reward' };
  function activity() {
    var a = S.data.history;
    if (a == null) return '<p class="hq-muted">Activity could not be loaded.</p>';
    if (!a.length) return '<p class="hq-muted">No changes recorded in the club office yet.</p>';
    return '<ol class="hq-act" role="list">' + a.slice(0, 8).map(function (x) {
      var after = x.after || {};
      var what = after.title || (x.entity === 'org' ? 'an organisation' : 'a record');
      var verb = VERB[x.action] || x.action;
      if (x.action === 'move' && after.stage) verb = 'moved to ' + String(after.stage).replace(/_/g, ' ');
      return '<li><span class="hq-act__who">' + h(x.actor || 'Someone') + '</span> ' + h(verb) +
        (x.action === 'seed' ? '' : ' <span class="hq-act__what">' + h(what) + '</span>') +
        '<time class="hq-act__t" datetime="' + h(x.at) + '">' + h(T.ago(x.at, now())) + '</time></li>';
    }).join('') + '</ol>';
  }

  function installHint() {
    var P = global.HQPwa;
    if (!P || P.installMode() !== 'prompt') return '';
    if (ls('hq_install_hint') === 'dismissed') return '';
    if (!global.matchMedia || !matchMedia('(max-width: 820px)').matches) return '';
    return '<aside class="hq-hint" aria-label="Install Lane HQ"><p>Lane HQ can open from your home screen like an app.</p>' +
      '<div><button type="button" class="hq-btn hq-btn--sm" data-hq-install>Install</button>' +
      '<button type="button" class="hq-link" data-hq-hint-x>No thanks</button></div></aside>';
  }

  // ── MATCHDAY PREPARATION ───────────────────────────────────────────────
  // The same jobs (and the same idempotency keys) as Club Tasks' checklist,
  // so creating it from either place can never make a second set.
  var HOME_TASKS = ['Confirm fixture, kick-off and officials', 'Pitch and facilities ready', 'Stewards and volunteers confirmed', 'Turnstile float and card reader ready',
    'First aid cover confirmed', 'Programme printed / published', 'Sponsor obligations for this match (boards, hospitality, announcements)', 'Hospitality set up',
    'Kit, balls and equipment', 'Matchday announcements approved', 'After the match: attendance and takings reconciled in Match Day Ops', 'After the match: result entered and report drafted'];
  var AWAY_TASKS = ['Confirm fixture, kick-off and venue', 'Squad and travel confirmed', 'Kit, balls and equipment', 'Matchday announcements approved', 'After the match: result checked and report drafted'];

  function selectedFixture() {
    var d = S.data; if (!d || !d.fixtures) return null;
    var id = S.match.fixtureId;
    var f = id ? d.fixtures.filter(function (x) { return String(x.id) === String(id); })[0] : null;
    if (!f) { var nx = M.nextFixture(d.fixtures, now(), d.results); f = nx.fixture; }
    return f || null;
  }
  function renderMatch() {
    var el = $('hq-match'); if (!el) return;
    if (!S.data) { el.innerHTML = '<p class="hq-muted">Loading the fixture…</p>'; load().then(renderMatch); return; }
    var d = S.data;
    if (!d.fixtures) { el.innerHTML = '<p class="hq-empty"><b>The fixture registry could not be read.</b> Nothing is shown rather than an out-of-date fixture list.</p>'; return; }
    var f = selectedFixture();
    if (!f) { el.innerHTML = '<p class="hq-empty">There is no upcoming fixture in the registry.</p>'; return; }
    var home = f.isHome !== false;
    var tasks = M.tasksForFixture(d.items.task, f.id).sort(function (a, b) { return String(a.idempotency_key || a.title).localeCompare(String(b.idempotency_key || b.title), undefined, { numeric: true }); });
    var moved = M.movedTasks(d.items.task, f);
    var done = tasks.filter(function (t) { return M.CLOSED[t.stage]; }).length;
    var up = d.fixtures.filter(function (x) { var k = Date.parse(x.kickoffAt); return isFinite(k) && k > now() - 3 * 3600000 && !/postponed|cancelled|abandoned|superseded/.test(String(x.status)); })
      .sort(function (a, b) { return Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt); }).slice(0, 6);
    var prog = home ? programmeFor(f) : null;

    var head = '<header class="hq-mp__hd">' +
      '<div class="hq-match__id">' + crest(oppCrest(f), f.opponent) + '<div>' +
      '<h3 class="hq-mp__h">' + h(matchLine(f)) + '</h3>' +
      '<p class="hq-match__m">' + h(T.kickoffLabel(f, now())) + ' · ' + (home ? 'Home' : 'Away') + (f.competition ? ' · ' + h(f.competition) : '') + (f.venue ? ' · ' + h(f.venue) : '') + '</p>' +
      '</div></div>' +
      '<label class="hq-mp__pick"><span>Fixture</span><select class="hq-input" data-hq-pickfx>' + up.map(function (x) {
        return '<option value="' + h(x.id) + '"' + (String(x.id) === String(f.id) ? ' selected' : '') + '>' + h(T.shortDate(x.kickoffAt) + ' · ' + x.opponent + (x.isHome === false ? ' (A)' : ' (H)')) + '</option>';
      }).join('') + '</select></label></header>';

    var warn = moved.length
      ? '<div class="hq-flag hq-flag--act" role="status"><p><b>This fixture has moved to ' + h(T.shortDate(f.kickoffAt)) + '.</b> ' +
        M.plural(moved.length, 'job') + ' still ' + (moved.length === 1 ? 'carries' : 'carry') + ' the old date (' + h(T.shortDate((moved[0].data || {}).fixture_date)) + ').</p>' +
        '<button type="button" class="hq-btn hq-btn--sm" data-hq-move-dates>Move ' + (moved.length === 1 ? 'it' : 'them') + ' to the new date</button></div>'
      : '';
    if (prog && prog.dateMismatch) warn += '<div class="hq-flag" role="status"><p>The programme draft is dated ' + h(T.shortDate(prog.dateMismatch)) + ', not ' + h(T.shortDate(f.kickoffAt)) + '. Open Programmes to correct it; a published edition is revised there, never overwritten from here.</p></div>';

    var list;
    if (!d.summary && !d.items.task) {
      list = '<p class="hq-empty">Club tasks could not be loaded' + (d.listErr ? ': ' + h(d.listErr) : '') + '.</p>';
    } else if (!tasks.length) {
      list = '<div class="hq-empty"><p><b>No matchday checklist for this fixture yet.</b> ' +
        (home ? 'Twelve jobs, from officials to the takings sheet' : 'Five jobs for an away fixture') +
        ', each with an owner and a date. Creating it twice makes nothing new.</p>' +
        '<button type="button" class="hq-btn hq-btn--primary" data-hq-make-list>Create the checklist</button></div>';
    } else {
      list = '<div class="hq-prog-row"><span class="hq-prog"><span style="width:' + Math.round(done / tasks.length * 100) + '%"></span></span><span>' + done + ' of ' + tasks.length + ' done</span></div>' +
        '<table class="hq-table"><caption class="hq-sr">Matchday jobs for ' + h(matchLine(f)) + '</caption>' +
        '<thead><tr><th scope="col">Job</th><th scope="col">Owner</th><th scope="col">Due</th><th scope="col"><span class="hq-sr">Actions</span></th></tr></thead><tbody>' +
        tasks.map(function (t) {
          var closed = !!M.CLOSED[t.stage];
          var due = t.due_date ? T.shortDate(t.due_date) : '—';
          var late = !closed && t.due_date && t.due_date < T.londonDate(now());
          return '<tr class="hq-tr' + (closed ? ' is-done' : '') + '" data-hq-task="' + h(t.id) + '">' +
            '<td data-label="Job"><span class="hq-td-t">' + h(String(t.title).replace(/ — v .*$/, '')) + '</span>' + (closed ? ' <span class="hq-tag hq-tag--ok">Done</span>' : '') + '</td>' +
            '<td data-label="Owner">' + (t.owner ? h(t.owner) : '<span class="hq-muted">No owner</span>') + '</td>' +
            '<td data-label="Due"' + (late ? ' class="hq-late"' : '') + '>' + h(late ? 'Overdue · ' + due : due) + '</td>' +
            '<td class="hq-td-acts">' +
              '<button type="button" class="hq-btn hq-btn--sm hq-btn--ghost" data-hq-assign="' + h(t.id) + '">' + (t.owner ? 'Reassign' : 'Assign') + '</button>' +
              '<button type="button" class="hq-btn hq-btn--sm" data-hq-toggle="' + h(t.id) + '" data-hq-to="' + (closed ? 'open' : 'done') + '">' + (closed ? 'Reopen' : 'Mark done') + '</button>' +
            '</td></tr>';
        }).join('') + '</tbody></table>';
    }

    var links = [];
    if (home) links.push(linkRow('Programme', prog ? ({ notstarted: 'Not started', other: 'Not started for this fixture', started: 'Started', draft: 'Draft · ' + prog.have + ' of ' + prog.of + ' sections', published: 'Published' }[prog.state]) : '', 'programme'));
    links.push(linkRow('Matchday graphics', 'Make the graphics for this fixture', 'poststudio'));
    links.push(linkRow('Squad', 'Who is available', 'squad'));
    if (home) links.push(linkRow('Attendance and takings', 'Private record for this home match', 'mdops'));
    links.push(linkRow('Live scoreboard', 'On the day', 'matchday'));
    links.push(linkRow('Result and report', 'After full time', 'matchreport'));

    el.innerHTML = head + warn +
      '<div class="hq-mp__cols"><section aria-labelledby="hq-mp-jobs"><h3 class="hq-sec__h" id="hq-mp-jobs">Matchday jobs</h3>' + list + '</section>' +
      '<section aria-labelledby="hq-mp-rel"><h3 class="hq-sec__h" id="hq-mp-rel">Related work</h3><ul class="hq-rows" role="list">' + links.filter(Boolean).join('') + '</ul></section></div>' +
      '<p class="hq-err" role="alert" data-hq-err></p>';
  }
  function linkRow(label, note, panel) { return canSee(panel) ? row(label, '', panel, note) : ''; }

  function matchError(msg) { var e = document.querySelector('[data-hq-err]'); if (e) e.textContent = msg || ''; }
  function afterWrite(taskId) {
    return load().then(function () {
      renderMatch(); renderHome(); paintBell();
      if (taskId) settle(document.querySelector('[data-hq-task="' + taskId + '"]'));
    });
  }
  function makeList() {
    var f = selectedFixture(); if (!f) return;
    var home = f.isHome !== false, list = home ? HOME_TASKS : AWAY_TASKS, day = T.londonDate(f.kickoffAt);
    var after = T.londonDate(Date.parse(f.kickoffAt) + 2 * 86400000);
    var btn = document.querySelector('[data-hq-make-list]'); if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
    var opp = f.opponent || 'opponent';
    var jobs = list.map(function (title, i) {
      return write('create', { kind: 'task', title: title + ' — v ' + opp, due_date: /^After the match/.test(title) ? after : day,
        idempotency_key: (home ? 'matchday:' : 'awayday:') + f.id + ':' + i, source: 'fixture:' + f.id,
        data: { area: 'Matchday', fixture: String(f.id), fixture_date: day } });
    });
    // Sequential would be gentler on the API, but the server is idempotent per
    // key, so a retry after a dropped connection creates nothing twice.
    Promise.all(jobs).then(function (rs) {
      var bad = rs.filter(function (r) { return !r.ok; });
      if (bad.length) matchError('Not every job was created: ' + bad[0].error + ' Try again — nothing will be duplicated.');
      return afterWrite();
    });
  }
  function toggleTask(id, to) {
    var b = document.querySelector('[data-hq-toggle="' + id + '"]'); if (b) { b.disabled = true; b.textContent = 'Saving…'; }
    write('move', { id: id, to: to }).then(function (r) {
      if (!r.ok) { matchError(r.error); if (b) { b.disabled = false; b.textContent = to === 'done' ? 'Mark done' : 'Reopen'; } return; }
      matchError('');
      afterWrite(id);
    });
  }
  function assignTask(id) {
    var n = global.prompt ? global.prompt('Who owns this job? (their name)', '') : '';
    n = String(n || '').trim(); if (!n) return;
    write('update', { id: id, owner: n }).then(function (r) { if (!r.ok) return matchError(r.error); afterWrite(id); });
  }
  function moveDates() {
    var f = selectedFixture(); if (!f) return;
    var day = T.londonDate(f.kickoffAt);
    // Finished jobs move too: a "done" row still dated for the old fixture is
    // exactly the contradictory date this exists to remove.
    var moved = M.tasksForFixture(S.data.items.task, f.id).filter(function (t) { var w = (t.data || {}).fixture_date; return w && w !== day; });
    var after = T.londonDate(Date.parse(f.kickoffAt) + 2 * 86400000);
    var b = document.querySelector('[data-hq-move-dates]'); if (b) { b.disabled = true; b.textContent = 'Moving…'; }
    Promise.all(moved.map(function (t) {
      var aft = /^After the match/.test(t.title || '');
      return write('update', { id: t.id, due_date: aft ? after : day, data: { fixture_date: day }, note: 'Fixture moved to ' + day });
    })).then(function (rs) {
      var bad = rs.filter(function (r) { return !r.ok; });
      if (bad.length) matchError(bad[0].error);
      return afterWrite();
    });
  }

  // ── NOTIFICATIONS ───────────────────────────────────────────────────────
  var CAT = { action: 'Action', approval: 'Approval', deadline: 'Deadline', conflict: 'Data check', system: 'System' };
  function paintBell() {
    var b = $('bell-badge'), btn = $('bell-btn');
    var n = S.notes ? S.notes.unread : 0;
    if (b) { b.textContent = n ? String(n) : ''; b.style.display = n ? 'flex' : 'none'; }
    if (btn) btn.setAttribute('aria-label', n ? 'Notifications, ' + n + ' unread' : 'Notifications');
    var p = $('notif-panel'); if (p && p.classList.contains('on')) paintNotes();
  }
  function paintNotes() {
    var el = $('notif-list'); if (!el) return;
    if (!S.notes) { el.innerHTML = '<p class="hq-muted hq-pad">Loading…</p>'; return; }
    var list = S.notes.list.slice().sort(function (a, b) { return (a.read - b.read) || 0; });
    var html = '';
    if (!list.length) html += '<p class="hq-empty hq-pad"><b>You are up to date.</b> Nothing needs a person right now.</p>';
    else html += '<ul class="hq-notes-list" role="list">' + list.map(function (n) {
      return '<li class="hq-note' + (n.read ? ' is-read' : '') + ' hq-sev--' + n.severity + '">' +
        '<div class="hq-note__meta"><span class="hq-dot" aria-hidden="true"></span>' + h(CAT[n.category] || 'Update') + ' · ' + h(T.ago(n.since, now())) + (n.read ? '' : ' · <b>Unread</b>') + '</div>' +
        '<p class="hq-note__t">' + h(n.title) + '</p>' + (n.detail ? '<p class="hq-note__d">' + h(n.detail) + '</p>' : '') +
        '<div class="hq-note__acts"><button type="button" class="hq-btn hq-btn--sm" data-hq-note-open="' + h(n.key) + '" data-hq-go="' + h(n.panel) + '">Open</button>' +
        '<button type="button" class="hq-link" data-hq-note-read="' + h(n.key) + '">' + (n.read ? 'Mark unread' : 'Mark as read') + '</button></div></li>';
    }).join('') + '</ul>';
    if (S.notes.resolved.length) {
      html += '<h3 class="hq-sub hq-pad">Resolved this week</h3><ul class="hq-notes-list" role="list">' + S.notes.resolved.slice(0, 6).map(function (r) {
        return '<li class="hq-note is-resolved"><div class="hq-note__meta"><span class="hq-tag hq-tag--ok">Resolved</span> ' + h(T.ago(r.at, now())) + '</div><p class="hq-note__t">' + h(r.title) + '</p></li>';
      }).join('') + '</ul>';
    }
    html += '<p class="hq-muted hq-pad">A notification is resolved when the records change, not when it is read. Read marks are kept on this device.</p>';
    el.innerHTML = html;
    var all = $('hq-notes-all'); if (all) all.hidden = !S.notes.unread;
  }
  function markRead(key, read) {
    var st = ls(NOTIF_KEY) || { read: {}, known: {}, resolved: [] };
    st.read = st.read || {};
    if (read === false) delete st.read[key]; else st.read[key] = now();
    ls(NOTIF_KEY, st);
    S.notes = M.notifications(S.groups, st, now());
    ls(NOTIF_KEY, S.notes.state);
    paintBell(); paintNotes();
  }
  function markAll() { (S.notes ? S.notes.list : []).forEach(function (n) { if (!n.read) markRead(n.key, true); }); }
  function toggleNotes(force) {
    var p = $('notif-panel'); if (!p) return;
    var on = force == null ? !p.classList.contains('on') : force;
    p.classList.toggle('on', on);
    var b = $('bell-btn'); if (b) b.setAttribute('aria-expanded', String(on));
    if (on) { paintNotes(); var f = p.querySelector('button'); if (f) f.focus(); }
  }

  // ── ACCOUNT MENU ────────────────────────────────────────────────────────
  function paintAccount() {
    var s = sess(), me = personName();
    var btn = $('hq-account-btn');
    if (btn) {
      var ini = (me || role()).split(/\s+/).map(function (w) { return w[0] || ''; }).join('').slice(0, 2).toUpperCase();
      btn.innerHTML = '<span class="hq-avatar" aria-hidden="true">' + h(ini) + '</span><span class="hq-account__name">' + h(me || 'Signed in') + '</span>';
      btn.setAttribute('aria-label', 'Account: ' + (me || 'signed in') + ', ' + ((global.PortalTools && global.PortalTools.profileFor(role()).title) || role()));
    }
    var m = $('hq-account-menu'); if (!m) return;
    var prof = global.PortalTools ? global.PortalTools.profileFor(role()).title : role();
    var P = global.HQPwa, mode = P ? P.installMode() : null;
    m.innerHTML = '<div class="hq-menu__who"><b>' + h(me || 'Signed in') + '</b><span>' + h(prof) + (s ? '' : ' · committee access') + '</span></div>' +
      '<button type="button" class="hq-menu__item" role="menuitem" data-hq-name>Changes are signed as: ' + h(actor() || 'not set') + '</button>' +
      (mode === 'prompt' ? '<button type="button" class="hq-menu__item" role="menuitem" data-hq-install>Install Lane HQ on this device</button>' : '') +
      (mode === 'ios' ? '<p class="hq-menu__note">To install: tap Share, then Add to Home Screen.</p>' : '') +
      '<button type="button" class="hq-menu__item" role="menuitem" data-hq-go="siteguide">Help and guides</button>' +
      '<a class="hq-menu__item" role="menuitem" href="index.html">View the public website</a>' +
      '<button type="button" class="hq-menu__item hq-menu__item--lock" role="menuitem" data-hq-lock>Lock HQ</button>';
  }
  function toggleAccount(force) {
    var m = $('hq-account-menu'), b = $('hq-account-btn'); if (!m || !b) return;
    var on = force == null ? m.hidden : force;
    if (on) paintAccount();
    m.hidden = !on; b.setAttribute('aria-expanded', String(on));
    if (on) { var f = m.querySelector('.hq-menu__item'); if (f) f.focus(); }
  }

  // ── EVENTS ──────────────────────────────────────────────────────────────
  function closest(el, sel) { while (el && el.nodeType === 1) { if (el.matches(sel)) return el; el = el.parentElement; } return null; }
  function onClick(e) {
    var t = e.target;
    var x;
    if ((x = closest(t, '[data-hq-sec]'))) {
      var k = x.getAttribute('data-hq-sec'); var open = x.getAttribute('aria-expanded') !== 'true';
      S.navOpen[k] = open; paintNav(); return;
    }
    if ((x = closest(t, '[data-hq-note-read]'))) { var key = x.getAttribute('data-hq-note-read'); var n = (S.notes.list.filter(function (q) { return q.key === key; })[0]); markRead(key, !(n && n.read)); return; }
    if ((x = closest(t, '[data-hq-note-open]'))) { markRead(x.getAttribute('data-hq-note-open'), true); toggleNotes(false); }
    if ((x = closest(t, '[data-hq-go]'))) {
      e.preventDefault();
      var fx = x.getAttribute('data-hq-fx'); if (fx) S.match.fixtureId = fx;
      toggleAccount(false);
      go(x.getAttribute('data-hq-go'));
      return;
    }
    if ((x = closest(t, '.hq-pri__btn'))) {
      var li = closest(x, '[data-hq-group]'); var id = li.getAttribute('data-hq-group');
      S.open[id] = !S.open[id];
      x.setAttribute('aria-expanded', String(S.open[id]));
      li.classList.toggle('is-open', S.open[id]);
      var det = li.querySelector('.hq-pri__detail'); det.hidden = !S.open[id];
      if (S.open[id]) settle(det);
      return;
    }
    if (closest(t, '[data-hq-sheet]')) { openSheet(); return; }
    if (closest(t, '.hq-sheet__close') || t.id === 'hq-sheet') { closeSheet(); return; }
    if (closest(t, '[data-hq-refresh]')) { var r = closest(t, '[data-hq-refresh]'); r.textContent = 'Refreshing…'; load().then(function () { renderHome(); paintBell(); }); return; }
    if (closest(t, '#bell-btn')) { toggleAccount(false); toggleNotes(); return; }
    if (closest(t, '[data-hq-notes-close]')) { toggleNotes(false); var bb = $('bell-btn'); if (bb) bb.focus(); return; }
    if (closest(t, '#hq-notes-all')) { markAll(); return; }
    if (closest(t, '#hq-account-btn')) { toggleNotes(false); toggleAccount(); return; }
    if (closest(t, '[data-hq-lock]')) { if (typeof global.lock === 'function') global.lock(); return; }
    if (closest(t, '[data-hq-name]')) { askName(); paintAccount(); renderHome(); return; }
    if (closest(t, '[data-hq-install]')) { if (global.HQPwa) global.HQPwa.install().then(function () { paintAccount(); renderHome(); }); return; }
    if (closest(t, '[data-hq-hint-x]')) { ls('hq_install_hint', 'dismissed'); var hint = closest(t, '.hq-hint'); if (hint) hint.remove(); return; }
    if (closest(t, '[data-hq-make-list]')) { makeList(); return; }
    if ((x = closest(t, '[data-hq-toggle]'))) { toggleTask(x.getAttribute('data-hq-toggle'), x.getAttribute('data-hq-to')); return; }
    if ((x = closest(t, '[data-hq-assign]'))) { assignTask(x.getAttribute('data-hq-assign')); return; }
    if (closest(t, '[data-hq-move-dates]')) { moveDates(); return; }
    // Click outside closes the menus.
    if (!closest(t, '#hq-account-menu')) toggleAccount(false);
    if (!closest(t, '#notif-panel')) toggleNotes(false);
  }
  function onInput(e) {
    if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-hq-q')) { S.query = e.target.value; paintNav(); }
    if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-hq-pickfx')) { S.match.fixtureId = e.target.value; renderMatch(); }
  }
  function onKey(e) {
    if (e.key !== 'Escape') return;
    if ($('hq-sheet') && $('hq-sheet').classList.contains('on')) { closeSheet(); return; }
    var m = $('hq-account-menu'); if (m && !m.hidden) { toggleAccount(false); $('hq-account-btn').focus(); return; }
    var p = $('notif-panel'); if (p && p.classList.contains('on')) { toggleNotes(false); var b = $('bell-btn'); if (b) b.focus(); }
  }

  var _wired = false;
  function init() {
    M = global.HQModel; T = global.HQTime;
    if (!_wired) {
      _wired = true;
      document.addEventListener('click', onClick);
      document.addEventListener('input', onInput);
      document.addEventListener('change', onInput);
      document.addEventListener('keydown', onKey);
      if (global.HQPwa) global.HQPwa.on(function (kind) { if (kind === 'install') { paintAccount(); renderHome(); } });
      // Keep "today" honest if HQ is left open overnight or over a weekend.
      setInterval(function () { if (!document.hidden && S.data) load().then(function () { if (S.where === 'home') renderHome(); paintBell(); }); }, 5 * 60000);
    }
    paintAccount();
    onNavigate(S.where);
    renderHome();
    return load().then(function () { renderHome(); paintBell(); if (S.where === 'preparematch') renderMatch(); });
  }

  global.HQShell = {
    init: init, onNavigate: onNavigate, refresh: function () { return load().then(function () { renderHome(); paintBell(); }); },
    refreshNotifications: function () { if (S.data) { compute(); paintBell(); } },
    toggleNotifications: toggleNotes, openMenu: openSheet, renderMatch: renderMatch, _state: S
  };
}(window));
