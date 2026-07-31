/* ═══════════════════════════════════════════════════════════════════════════
   MATCH DAY OPERATIONS — the portal UI.

   Loaded by admin.html. Talks only to /.netlify/functions/matchday-ops, which
   is the single writer. This file NEVER decides anything that matters: it does
   not compute the figures that get stored, it does not decide permissions, and
   it does not choose a record's status. It shows what the server says and
   sends what the volunteer taps. Every number it draws is recalculated
   server-side before it is written.

   The tally screen is built to the standard of scan.html, because that is the
   part used outdoors, on a phone, with a queue waiting.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var MDC = global.MatchdayCore;
  var FN = '/.netlify/functions/matchday-ops';
  var SESSION_FN = '/.netlify/functions/md-session';
  var DRAFT_PREFIX = 'rlfc_md_draft_';
  var TOKEN_KEY = 'rlfc_md_token';

  var S = {
    season: '', rows: [], orphans: [], caps: [], canMoney: false,
    view: 'home', filter: 'all',
    fixtureId: null, record: null, fixture: null, priceList: null, audit: [],
    tab: 'prepare',
    saveState: 'idle', saveMsg: '', lastSavedAt: null,
    pending: null, timer: null, inflight: false, loadErr: ''
  };

  // ── helpers ──────────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(p) { return MDC.fmtGBP(p || 0); }
  function has(cap) { return S.caps.indexOf(cap) > -1; }
  function isOnline() { return navigator.onLine !== false; }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function fmtWhen(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    if (isNaN(d)) return '—';
    var mins = Math.round((Date.now() - d) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    if (mins < 1440) return Math.round(mins / 60) + 'h ago';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  var STATUS_LABEL = {
    upcoming: 'Upcoming', ready: 'Ready', in_progress: 'In progress',
    awaiting_reconciliation: 'Awaiting reconciliation', completed: 'Completed',
    locked: 'Locked', cancelled: 'Cancelled', postponed: 'Postponed', abandoned: 'Abandoned'
  };
  function pill(status, extra) {
    return '<span class="md-pill md-pill--' + esc(status) + '">' + esc(STATUS_LABEL[status] || status) + '</span>' +
      (extra ? ' <span class="md-pill md-pill--legacy">Legacy</span>' : '');
  }

  // ── SESSION ──────────────────────────────────────────────────────────────
  // The token is minted at staff-login time (admin.html → submitRoleLogin) so
  // Match Day Ops opens in ONE TAP with no second password. If it is missing
  // (an older session, or the mint failed) we say so plainly and offer the
  // sign-in again, rather than silently failing to save later.
  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function loadCaps() {
    try { S.caps = JSON.parse(sessionStorage.getItem(TOKEN_KEY + '_caps') || '[]'); } catch (e) { S.caps = []; }
  }

  /** Called by admin.html after a successful role login. Best-effort. */
  function mintSession(pin, username, password) {
    return fetch(SESSION_FN, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pin, username: username, password: password })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ok && j.token) {
        try {
          sessionStorage.setItem(TOKEN_KEY, j.token);
          sessionStorage.setItem(TOKEN_KEY + '_caps', JSON.stringify(j.capabilities || []));
          sessionStorage.setItem(TOKEN_KEY + '_auth', j.auth || 'shared');
        } catch (e) {}
      }
      return j;
    }).catch(function () { return null; });
  }

  function api(action, body) {
    var payload = Object.assign({ pin: global.PIN, token: token(), action: action }, body || {});
    return fetch(FN, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'Bad response from the server' }; })
        .then(function (j) {
          j._status = r.status;
          // A REJECTED token is not a retryable error — retrying sends the same
          // dead token and fails identically, forever. This happened for real:
          // the signing secret was rotated, every existing session became
          // invalid, and the panel showed "session expired" with a Try again
          // button that could never succeed and NO fixtures to click. Drop the
          // dead token so the very next render offers the sign-in route out.
          if (j.reauth || (r.status === 401 && !j.misconfigured)) dropToken();
          return j;
        });
    });
  }

  /** Forget a token the server has rejected. */
  function dropToken() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY + '_caps');
      sessionStorage.removeItem(TOKEN_KEY + '_auth');
    } catch (e) {}
    S.caps = [];
  }

  // ── ENTRY ────────────────────────────────────────────────────────────────
  function init() {
    loadCaps();
    S.view = 'home';
    render();
    if (!token()) return;                  // render() already explains
    load();
  }

  function load() {
    S.loadErr = '';
    api('list', { season: S.season || undefined }).then(function (j) {
      if (!j.ok) { S.loadErr = j.error || 'Could not load the season.'; render(); return; }
      S.season = j.season; S.rows = j.rows || []; S.orphans = j.orphans || [];
      S.canMoney = !!j.canMoney;
      render();
    }).catch(function () {
      S.loadErr = 'No connection. The season list needs the internet, but anything you have already counted is saved on this phone.';
      render();
    });
  }

  // ── ROOT RENDER ──────────────────────────────────────────────────────────
  function render() {
    var el = $('mdops-body');
    if (!el) return;
    if (!token()) { el.innerHTML = needSignIn(); return; }
    if (S.view === 'home')     el.innerHTML = viewHome();
    else if (S.view === 'fixture') el.innerHTML = viewFixture();
    else if (S.view === 'reports') el.innerHTML = viewReports();
    else if (S.view === 'archive') el.innerHTML = viewArchive();
    else if (S.view === 'prices')  el.innerHTML = viewPrices();
    wire();
  }

  function needSignIn() {
    return '<div class="md-error"><b>Sign in again to open Match Day Ops</b>' +
      'Match Day Ops needs a signed staff session so every figure is recorded against a person. ' +
      'Yours has expired, or it was ended when the club\'s security key was changed. ' +
      'Nothing has been lost &mdash; sign in again and your fixtures come straight back.' +
      '<div style="margin-top:12px"><button class="save" onclick="MDOps.reauth()">Sign in again</button></div></div>';
  }

  /**
   * Send the user back to the role sign-in, which re-mints the token. This is
   * the ONLY escape from a rejected session, so it must always be offered — a
   * "Try again" that replays the same dead token is a trap, not a recovery.
   */
  function reauth() {
    dropToken();
    S.loadErr = '';
    try { sessionStorage.removeItem('rlfc_staff'); } catch (e) {}
    if (typeof global.showRoleLogin === 'function') global.showRoleLogin();
    else location.reload();
  }

  // ── HOME ─────────────────────────────────────────────────────────────────
  function counts() {
    var c = { attention: 0, upcoming: 0, awaiting: 0, completed: 0 };
    var today = new Date().toISOString().slice(0, 10);
    S.rows.forEach(function (r) {
      var st = r.recordStatus;
      if (st === 'completed' || st === 'locked') { c.completed++; return; }
      if (st === 'awaiting_reconciliation') { c.awaiting++; c.attention++; return; }
      if (st === 'in_progress') { c.attention++; return; }
      // A home fixture that has been played but never counted.
      if ((r.fixture.played || r.fixture.date < today) && (st === 'upcoming' || st === 'ready')) { c.attention++; return; }
      if (r.fixture.date >= today) c.upcoming++;
    });
    return c;
  }

  function matchesFilter(r) {
    var today = new Date().toISOString().slice(0, 10);
    var st = r.recordStatus;
    switch (S.filter) {
      case 'attention':
        return st === 'in_progress' || st === 'awaiting_reconciliation' ||
          ((r.fixture.played || r.fixture.date < today) && (st === 'upcoming' || st === 'ready'));
      case 'upcoming':  return r.fixture.date >= today && st !== 'completed' && st !== 'locked';
      case 'awaiting':  return st === 'awaiting_reconciliation';
      case 'completed': return st === 'completed' || st === 'locked';
      default: return true;
    }
  }

  function viewHome() {
    // Always offer the sign-in route as well as a retry. A retry alone is a
    // dead end whenever the cause is the session rather than the network.
    if (S.loadErr) return '<div class="md-error"><b>Could not load Match Day Ops</b>' + esc(S.loadErr) +
      '<div style="margin-top:12px"><button class="save sec" onclick="MDOps.load()">Try again</button>' +
      '<button class="save sec" style="margin-top:8px" onclick="MDOps.reauth()">Sign in again</button></div></div>';
    if (!S.rows.length) {
      return '<div class="md-empty"><b>No home fixtures for ' + esc(S.season) + ' yet</b>' +
        'Match Day Ops lists every home fixture from your season schedule. Add fixtures in the ' +
        '<b style="display:inline">Fixtures</b> tab and they appear here automatically — you never enter a fixture twice.</div>';
    }
    var c = counts();
    var today = new Date().toISOString().slice(0, 10);
    var todayRow = S.rows.filter(function (r) { return r.fixture.date === today; })[0];

    var h = '';
    if (todayRow) {
      h += '<div class="md-today">' +
        '<div class="md-today__eyebrow">Today at The Lane</div>' +
        '<div class="md-today__opp">' + esc(todayRow.fixture.opponent) + '</div>' +
        '<div class="md-today__meta">' + esc(todayRow.fixture.kickoff) + ' · ' + esc(todayRow.fixture.competition) +
          ' · ' + pill(todayRow.recordStatus) + '</div>' +
        '<button class="save" style="margin-top:12px" onclick="MDOps.open(\'' + esc(todayRow.fixture.id) + '\')">' +
          (todayRow.record ? 'Open the match-day record' : 'Prepare this match') + '</button>' +
        '</div>';
    }

    h += '<div class="md-summary">' +
      stat('attention', c.attention, 'Needs attention', '#EF4444') +
      stat('upcoming', c.upcoming, 'Upcoming home', '#38BDF8') +
      stat('awaiting', c.awaiting, 'Awaiting reconciliation', '#F59E0B') +
      stat('completed', c.completed, 'Completed', '#34D399') +
      '</div>';

    h += '<div class="md-tabs" role="tablist">' +
      tabBtn('all', 'All') + tabBtn('attention', 'Needs attention') +
      tabBtn('upcoming', 'Upcoming') + tabBtn('awaiting', 'Awaiting') + tabBtn('completed', 'Completed') +
      '</div>';

    var rows = S.rows.filter(matchesFilter);
    h += rows.length ? seasonTable(rows)
      : '<div class="md-empty">Nothing in this list right now.</div>';

    if (S.orphans.length) {
      h += '<div class="md-var md-var--warn" style="margin-top:14px"><b>' + S.orphans.length +
        ' record(s) point at a fixture that is no longer in the schedule.</b><br>' +
        'They are still counted in reports and the archive — nothing has been lost — but the fixture was renamed or removed. ' +
        S.orphans.map(function (o) {
          return esc((o.fixture_snapshot || {}).date || '') + ' ' + esc((o.fixture_snapshot || {}).opponent || o.fixture_id);
        }).join(', ') + '</div>';
    }

    h += '<div class="div"></div>';
    // Season-wide reporting is the restricted view; recording a match is not.
    if (has('can_matchday_finance')) {
      h += '<button class="save sec" onclick="MDOps.go(\'reports\')"><i class="ico ico-chart-column"></i> Reports</button>' +
        '<button class="save sec" style="margin-top:8px" onclick="MDOps.go(\'archive\')"><i class="ico ico-archive"></i> Archive</button>';
    }
    // Deliberately NO price-management screen. Season admission prices are site
    // content, edited once on the main site, and read from there.
    h += '<div style="font-family:var(--fb);font-size:12px;color:var(--gr);line-height:1.55;margin-top:12px">' +
      'Admission prices come from your published gate prices (Settings &rarr; site config). ' +
      'Change them there and every match here follows — there is nothing to keep in step.</div>';
    return h;
  }

  function stat(key, n, label, accent) {
    return '<button class="md-stat" style="--accent:' + accent + '" aria-pressed="' + (S.filter === key) +
      '" onclick="MDOps.filter(\'' + key + '\')"><span class="md-stat__num">' + n +
      '</span><span class="md-stat__lbl">' + esc(label) + '</span></button>';
  }
  function tabBtn(key, label) {
    return '<button role="tab" aria-selected="' + (S.filter === key) + '" onclick="MDOps.filter(\'' + key + '\')">' + esc(label) + '</button>';
  }

  function seasonTable(rows) {
    var head = '<thead><tr><th>Date</th><th>KO</th><th>Opposition</th><th>Competition</th>' +
      '<th>Fixture</th><th>Record</th><th class="md-num">Attendance</th>' +
      (S.canMoney ? '<th class="md-num">Gate receipts</th>' : '') +
      '<th>Completed by</th><th>Updated</th><th></th></tr></thead>';
    var body = rows.map(function (r) {
      var f = r.fixture, rec = r.record;
      var att = rec ? (rec.attendance_official != null ? rec.attendance_official : rec.attendance_calculated) : null;
      return '<tr>' +
        td('Date', esc(fmtDate(f.date))) +
        td('Kick-off', esc(f.kickoff)) +
        td('Opposition', '<b>' + esc(f.opponent) + '</b>') +
        td('Competition', esc(f.competition)) +
        td('Fixture', esc(STATUS_LABEL[f.status] || f.status)) +
        td('Record', pill(r.recordStatus, rec && rec.is_legacy_import)) +
        td('Attendance', att == null ? '—' : att, 'md-num') +
        (S.canMoney ? td('Gate receipts', rec && rec.declared_pence != null ? money(rec.declared_pence) : '—', 'md-num') : '') +
        td('Completed by', esc((rec && rec.completed_by) || '—')) +
        td('Updated', esc(rec ? fmtWhen(rec.updated_at) : '—')) +
        '<td class="md-cell-action"><button class="save sec" style="margin:0;width:100%" onclick="MDOps.open(\'' +
          esc(f.id) + '\')">' + (rec ? 'Open' : 'Prepare') + '</button></td>' +
        '</tr>';
    }).join('');
    return '<div class="md-tablewrap"><table class="md-table">' + head + '<tbody>' + body + '</tbody></table></div>';
  }
  function td(label, val, cls) {
    return '<td data-label="' + esc(label) + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + val + '</td>';
  }

  // ── FIXTURE DETAIL ───────────────────────────────────────────────────────
  function open(fixtureId) {
    S.fixtureId = fixtureId; S.view = 'fixture'; S.record = null; S.fixture = null;
    S.tab = 'prepare'; S.loadErr = '';
    render();
    api('get', { fixture_id: fixtureId }).then(function (j) {
      if (!j.ok) { S.loadErr = j.error; render(); return; }
      S.fixture = j.fixture; S.record = j.record; S.priceList = j.priceList; S.audit = j.audit || [];
      if (j.capabilities) S.caps = j.capabilities;
      restoreDraft();
      S.tab = S.record ? defaultTab(S.record.status) : 'prepare';
      render();
    }).catch(function () {
      S.loadErr = 'No connection.';
      restoreDraft();
      render();
    });
  }
  function defaultTab(status) {
    if (status === 'in_progress' || status === 'ready') return 'tally';
    if (status === 'awaiting_reconciliation') return 'reconcile';
    if (status === 'completed' || status === 'locked') return 'review';
    return 'prepare';
  }

  function viewFixture() {
    if (S.loadErr && !S.record) {
      return backBar() + '<div class="md-error"><b>Could not open that fixture</b>' + esc(S.loadErr) + '</div>';
    }
    if (!S.fixture) return backBar() + '<div class="md-loading">Loading…</div>';
    var f = S.fixture, rec = S.record;

    var h = backBar();
    h += '<div class="md-today" style="background:none;border-color:var(--br)">' +
      '<div class="md-today__eyebrow">' + esc(f.competition) + '</div>' +
      '<div class="md-today__opp">' + esc(f.opponent) + '</div>' +
      '<div class="md-today__meta">' + esc(fmtDate(f.date)) + ' · ' + esc(f.kickoff || '15:00') +
        ' · ' + esc(f.venue || 'Tithe Farm') + '<br>' +
        (rec ? pill(rec.status, rec.is_legacy_import) : pill('upcoming')) + '</div>' +
      '</div>';

    if (!rec) {
      h += '<div class="md-empty"><b>No match-day record yet</b>' +
        'Preparing creates the record for this fixture — it does not create a fixture, and it starts at zero ' +
        'attendance and zero receipts. Nothing is carried over from any previous match.</div>';
      h += has('can_matchday_record')
        ? '<button class="save" onclick="MDOps.prepare()">Prepare this match</button>'
        : '<div class="md-denied"><b>You do not have permission to prepare a record.</b></div>';
      return h;
    }

    h += saveBar();
    h += '<div class="md-tabs" role="tablist">' +
      dTab('prepare', 'Prepare') + dTab('tally', 'Tally') +
      dTab('reconcile', 'Reconcile') + dTab('review', 'Review') + '</div>';

    if (rec.status === 'locked') {
      h += '<div class="md-var md-var--ok"><b>This record is locked.</b> ' +
        'It was approved by ' + esc(rec.approved_by || 'a senior officer') + ' and can no longer be edited. ' +
        (has('can_matchday_reopen')
          ? 'Reopening it is recorded in the audit history and needs a reason.'
          : 'Only the chairman or vice chairman can reopen it.') + '</div>';
    }

    if (S.tab === 'prepare')   h += tabPrepare(rec);
    if (S.tab === 'tally')     h += tabTally(rec);
    if (S.tab === 'reconcile') h += tabReconcile(rec);
    if (S.tab === 'review')    h += tabReview(rec);
    return h;
  }
  function backBar() {
    return '<button class="save sec" style="margin:0 0 12px" onclick="MDOps.go(\'home\')">&#8592; All home fixtures</button>';
  }
  function dTab(key, label) {
    return '<button role="tab" aria-selected="' + (S.tab === key) + '" onclick="MDOps.tab(\'' + key + '\')">' + esc(label) + '</button>';
  }

  function saveBar() {
    var st = S.saveState, msg = S.saveMsg;
    if (!isOnline() && st !== 'saving') { st = 'offline'; msg = msg || 'Offline — saved on this phone'; }
    var txt = { idle: 'All saved', saving: 'Saving…', dirty: 'Unsaved changes', offline: 'Offline', error: 'Not saved' }[st] || 'Saved';
    return '<div class="md-savebar" data-state="' + st + '" role="status" aria-live="polite">' +
      '<span class="md-savebar__dot"></span><span class="md-savebar__txt">' + esc(txt) + '</span>' +
      '<span class="md-savebar__sub">' + esc(msg || (S.lastSavedAt ? 'Last saved ' + fmtWhen(S.lastSavedAt) : '')) + '</span></div>';
  }

  // ── TAB: PREPARE ─────────────────────────────────────────────────────────
  function tabPrepare(rec) {
    var cats = (rec.price_snapshot && rec.price_snapshot.categories) || (S.priceList && S.priceList.categories) || [];
    var ro = rec.status === 'locked';
    var h = '<div class="slbl">Before the match</div>';
    h += field('Assigned match-day operator', 'md-operator', rec.operator || '', 'Who is running the gate?', ro);
    h += field('Weather', 'md-weather', rec.weather || '', 'Dry and cold, heavy rain…', ro);
    if (S.canMoney) {
      h += field('Opening cash float (£)', 'md-float-open', pounds(rec.float_open_pence), '50.00', ro, 'number');
    }

    h += '<div class="div"></div><div class="slbl">Prices for this match</div>';
    var src = (rec.price_snapshot && rec.price_snapshot.source) || (S.priceList && S.priceList.source) || '';
    var isOverride = /override/i.test(src);
    h += '<div class="md-var ' + (isOverride ? 'md-var--warn' : 'md-var--ok') + '">' +
      (isOverride
        ? '<b>Fixture-specific prices are in force for this match.</b><br>' + esc(src)
        : '<b>Standard season admission prices.</b><br>Taken from your published gate prices on the website, so they are the same numbers a supporter sees before they travel.') +
      '</div>';
    h += priceTable(cats);
    h += '<div style="font-family:var(--fb);font-size:12.5px;color:var(--gr);line-height:1.55;margin-bottom:12px">' +
      'These prices are frozen onto the record when it is submitted, so a later change can never rewrite what this ' +
      'match was expected to take.' +
      (has('can_matchday_prices') && !ro
        ? ' If <b style="color:var(--w)">this one fixture</b> is genuinely priced differently — a cup instruction, a charity match, a promotion — you can override it below. The season prices on the website are not affected.'
        : '') + '</div>';
    if (has('can_matchday_prices') && !ro) {
      h += '<button class="save sec" onclick="MDOps.go(\'prices\')"><i class="ico ico-ticket"></i> ' +
        (isOverride ? 'Review this fixture&rsquo;s prices' : 'Price this fixture differently (rare)') + '</button>';
    }

    if (S.canMoney) {
      h += '<div class="div"></div><div class="slbl">Stock on hand</div>';
      h += row2(
        field('Programmes available', 'md-prog-qty', qtyOf(rec, 'programmes'), '0', ro, 'number'),
        field('Programme price (£)', 'md-prog-price', unitOf(rec, 'programmes'), '2.00', ro, 'number'));
      h += row2(
        field('Pin badges available', 'md-badge-qty', qtyOf(rec, 'badges'), '0', ro, 'number'),
        field('Badge price (£)', 'md-badge-price', unitOf(rec, 'badges'), '3.00', ro, 'number'));
    }
    if (!ro) h += '<button class="save" onclick="MDOps.savePrepare()">Save preparation</button>';
    if (!ro && rec.status === 'ready') {
      h += '<button class="save sec" style="margin-top:8px" onclick="MDOps.tab(\'tally\')">Start counting &#8594;</button>';
    }
    h += '<button class="save sec" style="margin-top:8px" onclick="window.print()"><i class="ico ico-printer"></i> Print the match-day sheet</button>';
    h += printSheet(rec, cats);
    return h;
  }

  // Paid and non-paid are shown as two separate groups everywhere. A volunteer
  // must be able to see at a glance that the guest list costs nothing — and a
  // treasurer must never read a long guest list as missing money.
  function isPaid(c) { return c.paid !== false && c.revenue; }
  function splitCats(cats) {
    var live = (cats || []).filter(function (c) { return c.enabled !== false; })
      .sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
    return { paid: live.filter(isPaid), free: live.filter(function (c) { return !isPaid(c); }), all: live };
  }

  function priceTable(cats) {
    var g = splitCats(cats);
    var h = '<div class="md-sum">';
    h += '<div class="md-sum__row md-sum__row--total"><span>Paid admission</span><span></span></div>';
    g.paid.forEach(function (c) {
      h += '<div class="md-sum__row"><span>' + esc(c.label) + (c.hint ? ' <em class="md-hint">' + esc(c.hint) + '</em>' : '') +
        '</span><span class="md-money">' + money(c.price_pence) + '</span></div>';
    });
    h += '<div class="md-sum__row md-sum__row--total"><span>Free admission &mdash; counts as attendance, no gate money</span><span></span></div>';
    g.free.forEach(function (c) {
      h += '<div class="md-sum__row"><span>' + esc(c.label) + (c.hint ? ' <em class="md-hint">' + esc(c.hint) + '</em>' : '') +
        '</span><span class="md-money">Free</span></div>';
    });
    return h + '</div>';
  }

  function qtyOf(rec, k) { var l = (rec.sales || {})[k]; return l && l.qty ? l.qty : ''; }
  function unitOf(rec, k) { var l = (rec.sales || {})[k]; return l && l.unit_pence ? pounds(l.unit_pence) : ''; }
  function pounds(p) { return p == null || p === '' ? '' : (Number(p) / 100).toFixed(2); }
  function toP(v) { var n = MDC.toPence(v); return n == null ? 0 : n; }

  function field(label, id, val, ph, ro, type) {
    return '<div class="field"><label class="fl" for="' + id + '">' + esc(label) + '</label>' +
      '<input id="' + id + '" type="' + (type || 'text') + '"' + (type === 'number' ? ' inputmode="decimal" step="0.01" min="0"' : '') +
      ' value="' + esc(val) + '" placeholder="' + esc(ph || '') + '"' + (ro ? ' disabled' : '') + '></div>';
  }
  function area(label, id, val, ph, ro) {
    return '<div class="field"><label class="fl" for="' + id + '">' + esc(label) + '</label>' +
      '<textarea id="' + id + '" rows="2" placeholder="' + esc(ph || '') + '"' + (ro ? ' disabled' : '') + '>' + esc(val) + '</textarea></div>';
  }
  function row2(a, b) { return '<div class="row2">' + a + b + '</div>'; }

  // ── TAB: TALLY ───────────────────────────────────────────────────────────
  function tabTally(rec) {
    if (rec.status === 'locked') return '<div class="md-denied">This record is locked. Reopen it to change the count.</div>';
    if (!has('can_matchday_record')) return '<div class="md-denied"><b>You do not have permission to record.</b></div>';

    var cats = (rec.price_snapshot && rec.price_snapshot.categories) || S.priceList.categories || [];
    var g = splitCats(cats);
    var t = draft().attendance || {};

    // ── WHO IS ON THE GATE ─────────────────────────────────────────────────
    // One box, at the very top, every match day. If a figure is ever queried
    // weeks later, the club can say who counted it — and the person counting
    // knows their name is against it.
    var h = '<div class="md-operator' + (rec.operator ? '' : ' md-operator--empty') + '">' +
      '<label class="md-operator__lbl" for="md-operator-live">Who is on the turnstile today?</label>' +
      '<input id="md-operator-live" type="text" autocomplete="name" value="' + esc(rec.operator || '') +
        '" placeholder="Your name" onchange="MDOps.setOperator(this.value)">' +
      '<div class="md-operator__hint">' +
        (rec.operator
          ? 'This match is being counted by <b>' + esc(rec.operator) + '</b>.'
          : 'Put your name in before you start counting — every figure on this record is recorded against it.') +
      '</div></div>';

    h += '<div style="font-family:var(--fb);font-size:12.5px;color:var(--gr);line-height:1.55;margin:12px 0">' +
      'Tap as people come through. Every tap is saved on this phone straight away and synced when there is signal — ' +
      'you cannot lose the count by locking the screen or losing reception.</div>';

    function rows(list, primary) {
      return list.map(function (c, i) {
        var n = Number(t[c.key] || 0);
        return '<div class="md-tally__row' + (primary && i < 2 ? ' md-tally__row--primary' : '') +
          (c.paid === false ? ' md-tally__row--free' : '') + '">' +
          '<div><div class="md-tally__label">' + esc(c.label) + '</div>' +
          '<div class="md-tally__price">' + (isPaid(c) ? money(c.price_pence) : 'Free &mdash; counts, no money') +
            (c.hint ? ' · ' + esc(c.hint) : '') + '</div></div>' +
          '<div class="md-tally__ctrls">' +
          '<button class="md-tally__btn" aria-label="One fewer ' + esc(c.label) + '" onclick="MDOps.bump(\'' + esc(c.key) + '\',-1)"' + (n <= 0 ? ' disabled' : '') + '>&minus;</button>' +
          '<div class="md-tally__count"><input type="number" inputmode="numeric" min="0" aria-label="' + esc(c.label) + ' count" value="' + n + '" onchange="MDOps.setCount(\'' + esc(c.key) + '\',this.value)"></div>' +
          '<button class="md-tally__btn md-tally__btn--plus" aria-label="One more ' + esc(c.label) + '" onclick="MDOps.bump(\'' + esc(c.key) + '\',1)">+</button>' +
          '</div></div>';
      }).join('');
    }

    h += '<div class="md-grouphdr">Paying at the gate</div>';
    h += '<div class="md-tally">' + rows(g.paid, true) + '</div>';
    h += '<div class="md-grouphdr md-grouphdr--free">Admitted free ' +
      '<span>counts towards attendance &middot; no gate money expected</span></div>';
    h += '<div class="md-tally">' + rows(g.free, false) + '</div>';

    var counted = MDC.calcAttendance(cats, t);
    var expected = MDC.calcExpectedPence(cats, t);
    var freeCount = g.free.reduce(function (a, c) { return a + Number(t[c.key] || 0); }, 0);
    h += '<div class="md-running">' +
      '<div class="md-running__cell"><div class="md-running__num">' + counted + '</div>' +
        '<div class="md-running__lbl">Through the gate' + (freeCount ? ' &middot; ' + freeCount + ' free' : '') + '</div></div>' +
      (S.canMoney
        ? '<div class="md-running__cell"><div class="md-running__num">' + money(expected) + '</div><div class="md-running__lbl">Expected gate</div></div>'
        : '<div class="md-running__cell"><div class="md-running__num">&mdash;</div><div class="md-running__lbl">Gate hidden</div></div>') +
      '</div>';

    h += '<button class="save sec" style="margin-top:14px" onclick="MDOps.tab(\'reconcile\')">Finish and reconcile &#8594;</button>';
    h += '<button class="save" style="margin-top:8px;background:var(--c2);color:var(--gr)" onclick="MDOps.resetTally()">Reset the count</button>';
    return h;
  }

  // ── TAB: RECONCILE ───────────────────────────────────────────────────────
  function tabReconcile(rec) {
    var ro = rec.status === 'locked';
    var d = draft();
    var cats = (rec.price_snapshot && rec.price_snapshot.categories) || S.priceList.categories || [];
    var merged = Object.assign({}, rec, d, { price_snapshot: { categories: cats } });
    var calc = MDC.derive(merged);

    var g = splitCats(cats);
    var att = d.attendance || {};
    var nOf = function (c) { return Number(att[c.key] || 0); };
    var paidHeads = g.paid.reduce(function (a, c) { return a + nOf(c); }, 0);
    var freeHeads = g.free.reduce(function (a, c) { return a + nOf(c); }, 0);

    var h = '<div class="slbl">Attendance</div>';
    h += '<div class="md-sum">';
    h += '<div class="md-sum__row md-sum__row--total"><span>Paid admission</span><span></span></div>';
    g.paid.filter(nOf).forEach(function (c) {
      var n = nOf(c);
      h += '<div class="md-sum__row"><span>' + esc(c.label) + ' × ' + n + ' @ ' + money(c.price_pence) +
        '</span><span class="md-money">' + money(n * c.price_pence) + '</span></div>';
    });
    if (!paidHeads) h += '<div class="md-sum__row"><span>None counted</span><span>—</span></div>';
    h += '<div class="md-sum__row"><span><b>Paid subtotal</b></span><span><b>' + paidHeads + '</b></span></div>';

    // Free admissions are shown as their OWN block with their own subtotal.
    // Never folded into "other", never hidden — a treasurer reading this must
    // see immediately why 40 more people came through than money suggests.
    h += '<div class="md-sum__row md-sum__row--total"><span>Admitted free</span><span></span></div>';
    g.free.filter(nOf).forEach(function (c) {
      h += '<div class="md-sum__row"><span>' + esc(c.label) + ' × ' + nOf(c) +
        '</span><span class="md-money">£0.00</span></div>';
    });
    if (!freeHeads) h += '<div class="md-sum__row"><span>None</span><span>—</span></div>';
    h += '<div class="md-sum__row"><span><b>Free subtotal</b></span><span><b>' + freeHeads + '</b></span></div>';

    h += '<div class="md-sum__row md-sum__row--total"><span>Counted through the gate</span><span>' + calc.attendance_calculated + '</span></div>';
    if (S.canMoney) h += '<div class="md-sum__row md-sum__row--total"><span>Expected gate revenue <em class="md-hint">(paid admissions only)</em></span><span class="md-money">' + money(calc.expected_gate_pence) + '</span></div>';
    h += '</div>';
    if (freeHeads) {
      h += '<div class="md-var md-var--ok"><b>' + freeHeads + ' free admission(s)</b> are counted in the attendance figure and ' +
        'correctly produce <b>no</b> expected gate money. This is not a shortfall.</div>';
    }

    h += field('Declared official attendance', 'md-att-official',
      rec.attendance_official != null ? rec.attendance_official : '', String(calc.attendance_calculated), ro, 'number');
    h += varBox(calc.attendance_variance == null ? null : calc.attendance_variance,
      'Official matches the ' + calc.attendance_calculated + ' counted through the gate.',
      function (v) {
        return 'The official figure is <b>' + Math.abs(v) + '</b> ' + (v > 0 ? 'higher' : 'lower') +
          ' than the ' + calc.attendance_calculated + ' counted at the gate. Explain the difference before submitting.';
      });
    h += area('Why the difference?', 'md-att-note', rec.attendance_variance_note || '',
      'e.g. a group came in during the delay and was not clicked through', ro);

    if (S.canMoney) {
      h += '<div class="div"></div><div class="slbl">Sales</div>';
      h += row2(field('Programmes sold', 'md-prog-qty', qtyOf(rec, 'programmes'), '0', ro, 'number'),
                field('Unit price (£)', 'md-prog-price', unitOf(rec, 'programmes'), '2.00', ro, 'number'));
      h += row2(field('Pin badges sold', 'md-badge-qty', qtyOf(rec, 'badges'), '0', ro, 'number'),
                field('Unit price (£)', 'md-badge-price', unitOf(rec, 'badges'), '3.00', ro, 'number'));
      h += row2(field('Merchandise sold', 'md-merch-qty', qtyOf(rec, 'merch'), '0', ro, 'number'),
                field('Unit price (£)', 'md-merch-price', unitOf(rec, 'merch'), '', ro, 'number'));
      h += row2(field('Hospitality income (£)', 'md-hosp', pounds((rec.sales || {}).hospitality_pence), '0.00', ro, 'number'),
                field('Match sponsorship (£)', 'md-spons', pounds((rec.sales || {}).sponsorship_pence), '0.00', ro, 'number'));

      h += '<div class="div"></div><div class="slbl">Gate reconciliation</div>';
      h += row2(field('Cash counted (£)', 'md-cash', pounds((rec.receipts || {}).cash_pence), '0.00', ro, 'number'),
                field('Card takings (£)', 'md-card', pounds((rec.receipts || {}).card_pence), '0.00', ro, 'number'));
      h += row2(field('Online / advance (£)', 'md-online', pounds((rec.receipts || {}).online_pence), '0.00', ro, 'number'),
                field('Other receipts (£)', 'md-other', pounds((rec.receipts || {}).other_pence), '0.00', ro, 'number'));
      h += row2(field('Opening float (£)', 'md-float-open', pounds(rec.float_open_pence), '0.00', ro, 'number'),
                field('Closing float (£)', 'md-float-close', pounds(rec.float_close_pence), '0.00', ro, 'number'));

      h += '<div class="md-sum">' +
        '<div class="md-sum__row"><span>Expected gate revenue</span><span class="md-money">' + money(calc.expected_gate_pence) + '</span></div>' +
        '<div class="md-sum__row"><span>Sales (programmes, badges, merch, hospitality, sponsorship)</span><span class="md-money">' + money(calc.sales_pence) + '</span></div>' +
        '<div class="md-sum__row md-sum__row--total"><span>Total expected</span><span class="md-money">' + money(calc.expected_pence) + '</span></div>' +
        '<div class="md-sum__row"><span>Declared receipts (cash + card + online + other)</span><span class="md-money">' + money(calc.declared_pence) + '</span></div>' +
        '<div class="md-sum__row" style="color:var(--gr)"><span>Float is working capital and is excluded</span><span class="md-money">' + money(calc.float_open_pence) + ' out, ' + money(calc.float_close_pence) + ' back</span></div>' +
        '</div>';
      h += varBox(calc.financial_variance_pence,
        'Declared receipts match the ' + money(calc.expected_pence) + ' expected exactly.',
        function (v) {
          return 'Declared receipts are <b>' + money(Math.abs(v)) + '</b> ' + (v > 0 ? 'more' : 'less') +
            ' than the ' + money(calc.expected_pence) + ' the prices and sales predict. Explain the difference before submitting.';
        });
      h += area('Reconciliation notes', 'md-recon-note', rec.reconciliation_note || '',
        'e.g. the card reader dropped out for 20 minutes and four people paid cash', ro);
    }

    h += '<div class="div"></div><div class="slbl">Operational notes</div>';
    var n = rec.notes || {};
    h += area('Match-day incidents', 'md-note-incidents', n.incidents || '', 'Anything that happened that the committee should know', ro);
    h += area('Turnstile issues', 'md-note-turnstile', n.turnstile || '', 'Queues, a broken clicker, a gate that would not open', ro);
    if (S.canMoney) h += area('Cash discrepancies', 'md-note-cash', n.cash || '', 'Anything unusual about the money itself', ro);
    h += area('General comments', 'md-note-general', n.general || '', '', ro);
    h += field('Completed by', 'md-completed-by', rec.completed_by || '', 'Your name', ro);

    if (!ro) {
      h += '<button class="save" onclick="MDOps.saveReconcile()">Save draft</button>';
      h += '<button class="save sec" style="margin-top:8px" onclick="MDOps.submit()"><i class="ico ico-check"></i> Submit for review</button>';
    }
    return h;
  }

  function varBox(v, okMsg, badMsg) {
    if (v == null) return '<div class="md-var md-var--warn">Not declared yet.</div>';
    if (v === 0) return '<div class="md-var md-var--ok">' + okMsg + '</div>';
    return '<div class="md-var md-var--bad">' + badMsg(v) + '</div>';
  }

  // ── TAB: REVIEW ──────────────────────────────────────────────────────────
  function tabReview(rec) {
    var h = '<div class="slbl">Record</div><div class="md-sum">' +
      sumRow('Status', STATUS_LABEL[rec.status] || rec.status) +
      sumRow('Counted through the gate', rec.attendance_calculated) +
      sumRow('Declared official attendance', rec.attendance_official == null ? '—' : rec.attendance_official) +
      sumRow('Attendance discrepancy', rec.attendance_variance == null ? '—' : (rec.attendance_variance > 0 ? '+' : '') + rec.attendance_variance) +
      (S.canMoney ? sumRow('Expected', money(rec.expected_pence)) : '') +
      (S.canMoney ? sumRow('Declared', money(rec.declared_pence)) : '') +
      (S.canMoney ? sumRow('Discrepancy', (rec.financial_variance_pence > 0 ? '+' : '') + money(rec.financial_variance_pence)) : '') +
      sumRow('Completed by', rec.completed_by || '—') +
      sumRow('Submitted', rec.submitted_by ? esc(rec.submitted_by) + ' · ' + fmtWhen(rec.submitted_at) : '—') +
      sumRow('Approved', rec.approved_by ? esc(rec.approved_by) + ' · ' + fmtWhen(rec.approved_at) : '—') +
      (rec.reopen_count ? sumRow('Reopened', rec.reopen_count + ' time(s)') : '') +
      '</div>';

    if (rec.status === 'awaiting_reconciliation') {
      h += has('can_matchday_approve')
        ? '<button class="save" onclick="MDOps.approve()"><i class="ico ico-check"></i> Approve this record</button>'
        : '<div class="md-denied"><b>Awaiting review.</b> A senior officer with approval rights needs to check and approve this record. ' +
          'If that is you, sign in with your own staff password rather than the shared committee one.</div>';
    }
    if (rec.status === 'completed') {
      h += has('can_matchday_approve')
        ? '<button class="save" onclick="MDOps.lock()"><i class="ico ico-lock"></i> Lock this record</button>'
        : '<div class="md-denied">Approved, awaiting lock by a senior officer.</div>';
    }
    if (rec.status === 'locked' && has('can_matchday_reopen')) {
      h += '<button class="save" style="background:var(--c2);color:var(--gr);margin-top:8px" onclick="MDOps.reopen()">Reopen this record</button>';
    }

    h += '<div class="div"></div><div class="slbl">Audit history</div>';
    if (!S.audit.length) {
      h += '<div class="md-empty">' + 'Nothing recorded yet.' + '</div>';
    } else {
      h += '<div class="md-audit">' + S.audit.map(function (a) {
        return '<div class="md-audit__item"><b>' + esc(a.action) + '</b> — ' + esc(a.actor) +
          (a.actor_role ? ' <span class="md-hint">(' + esc(a.actor_role) + ')</span>' : '') +
          '<div class="md-audit__when">' + esc(new Date(a.at).toLocaleString('en-GB')) + '</div>' +
          (a.reason ? '<div style="margin-top:3px">“' + esc(a.reason) + '”</div>' : '') + '</div>';
      }).join('') + '</div>';
    }
    return h;
  }
  function sumRow(k, v) { return '<div class="md-sum__row"><span>' + esc(k) + '</span><span>' + v + '</span></div>'; }

  // ── PRINT SHEET ──────────────────────────────────────────────────────────
  function printSheet(rec, cats) {
    var f = rec.fixture_snapshot || S.fixture || {};
    var pg = splitCats(cats);
    var rowsFor = function (list, priced) {
      return list.map(function (c) {
        return '<tr><td>' + esc(c.label) + '</td><td>' + (priced ? money(c.price_pence) : 'Free') +
          '</td><td class="md-print__rule"></td><td class="md-print__rule"></td></tr>';
      }).join('');
    };
    var rows = '<tr><th colspan="4">Paying at the gate</th></tr>' + rowsFor(pg.paid, true) +
               '<tr><th colspan="4">Admitted free \u2014 counts as attendance, no money</th></tr>' + rowsFor(pg.free, false);
    return '<div id="md-print"><h1>Rayners Lane FC — Match Day Sheet</h1>' +
      '<p><b>' + esc(f.opponent || '') + '</b> · ' + esc(f.date || '') + ' · ' + esc(f.kickoff || '') +
      ' · ' + esc(f.competition || '') + '</p>' +
      '<p><b>On the turnstile:</b> ' + esc(rec.operator || '________________________') +
      '　　Weather: ________________</p>' +
      '<h2>Admissions</h2><table><thead><tr><th>Category</th><th>Price</th><th>Count</th><th>Value</th></tr></thead><tbody>' +
      rows + '</tbody></table>' +
      '<h2>Sales</h2><table><tbody>' +
      '<tr><td>Programmes</td><td class="md-print__rule"></td><td>Pin badges</td><td class="md-print__rule"></td></tr>' +
      '<tr><td>Merchandise</td><td class="md-print__rule"></td><td>Hospitality</td><td class="md-print__rule"></td></tr>' +
      '</tbody></table>' +
      '<h2>Reconciliation</h2><table><tbody>' +
      '<tr><td>Opening float</td><td class="md-print__rule"></td><td>Closing float</td><td class="md-print__rule"></td></tr>' +
      '<tr><td>Cash</td><td class="md-print__rule"></td><td>Card</td><td class="md-print__rule"></td></tr>' +
      '<tr><td>Online / advance</td><td class="md-print__rule"></td><td>Other</td><td class="md-print__rule"></td></tr>' +
      '<tr><td><b>Official attendance</b></td><td class="md-print__rule"></td><td><b>Total declared</b></td><td class="md-print__rule"></td></tr>' +
      '</tbody></table>' +
      '<h2>Notes</h2><p style="border:1px solid #999;height:30mm"></p>' +
      '<p>Completed by ________________________　Signature ________________________</p></div>';
  }

  // ── DRAFT (offline-first) ────────────────────────────────────────────────
  // Every tap lands in localStorage FIRST. The server sync is debounced and can
  // fail all it likes: the count on the phone is the thing that must not be
  // lost, and it survives a reload, a backgrounded tab and a flat signal.
  function draftKey() { return DRAFT_PREFIX + S.fixtureId; }
  function draft() {
    try {
      var d = JSON.parse(localStorage.getItem(draftKey()) || 'null');
      if (d) return d;
    } catch (e) {}
    return seedDraft();
  }
  function seedDraft() {
    var rec = S.record || {};
    return { attendance: Object.assign({}, rec.attendance || {}) };
  }
  function setDraft(d) {
    try { localStorage.setItem(draftKey(), JSON.stringify(d)); } catch (e) {}
  }
  function restoreDraft() {
    var local = null;
    try { local = JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch (e) {}
    if (!local) { setDraft(seedDraft()); return; }
    // A local draft that is ahead of the server is kept — losing a volunteer's
    // count to a stale server copy is the one failure this must never have.
    var localTotal = sumVals(local.attendance);
    var serverTotal = sumVals((S.record || {}).attendance);
    if (serverTotal > localTotal) setDraft(seedDraft());
  }
  function sumVals(o) {
    return Object.keys(o || {}).reduce(function (a, k) { return a + (Number(o[k]) || 0); }, 0);
  }
  function clearDraft() { try { localStorage.removeItem(draftKey()); } catch (e) {} }

  function bump(key, by) {
    var d = draft();
    d.attendance = d.attendance || {};
    var n = Number(d.attendance[key] || 0) + by;
    if (n < 0) n = 0;                       // a negative count is not a thing
    d.attendance[key] = n;
    setDraft(d);
    S.saveState = 'dirty';
    render();
    queueSync();
  }
  function setCount(key, val) {
    var n = parseInt(val, 10);
    if (!isFinite(n) || n < 0) n = 0;
    var d = draft();
    d.attendance = d.attendance || {};
    d.attendance[key] = n;
    setDraft(d);
    S.saveState = 'dirty';
    render();
    queueSync();
  }
  /** The turnstile accountability box. Saves immediately — not on a debounce. */
  function setOperator(name) {
    var v = String(name || '').trim().slice(0, 120);
    if (!S.record) return;
    S.saveState = 'saving'; render();
    api('save', { fixture_id: S.fixtureId, version: S.record.version, patch: { operator: v } })
      .then(function (j) {
        if (j.ok) {
          S.record = j.record; S.saveState = 'idle'; S.lastSavedAt = Date.now();
          if (typeof global.toast === 'function' && v) global.toast('Turnstile: ' + v);
        } else {
          S.saveState = 'error'; S.saveMsg = j.error;
          if (j.conflict && j.current) S.record = j.current;
        }
        render();
      })
      .catch(function () { S.saveState = 'offline'; S.saveMsg = 'Saved on this phone'; render(); });
  }

  function resetTally() {
    if (!confirm('Reset the count for this match back to zero?\n\nThis clears every category on this phone. It cannot be undone.')) return;
    setDraft({ attendance: {} });
    S.saveState = 'dirty';
    render();
    queueSync();
  }

  function queueSync() {
    if (S.timer) clearTimeout(S.timer);
    S.timer = setTimeout(syncNow, 1200);   // debounced: a burst of taps is one write
  }

  function syncNow() {
    if (S.inflight || !S.record) return;
    if (!isOnline()) { S.saveState = 'offline'; S.saveMsg = 'Saved on this phone — will sync when signal returns'; render(); return; }
    S.inflight = true; S.saveState = 'saving'; S.saveMsg = ''; render();
    var d = draft();
    api('save', {
      fixture_id: S.fixtureId,
      version: S.record.version,
      patch: { attendance: d.attendance }
    }).then(function (j) {
      S.inflight = false;
      if (j.ok) {
        S.record = j.record;
        S.saveState = 'idle'; S.lastSavedAt = Date.now(); S.saveMsg = '';
      } else if (j.conflict && j.current) {
        // Another device got there first. We do NOT overwrite it and we do NOT
        // throw this phone's count away — both are shown and the volunteer
        // decides. Silent loss of a gate count is unacceptable.
        S.record = j.current;
        S.saveState = 'error';
        S.saveMsg = 'Another device also saved — check the numbers';
        alert('Someone else saved this record while you were counting.\n\n' +
              'Your count on this phone: ' + sumVals(draft().attendance) + '\n' +
              'Now on the server: ' + (j.current.attendance_calculated || 0) + '\n\n' +
              'Nothing has been thrown away. Check the categories and re-enter anything missing, then save again.');
      } else {
        S.saveState = 'error';
        S.saveMsg = j.error || 'Not saved';
      }
      render();
    }).catch(function () {
      S.inflight = false; S.saveState = 'offline';
      S.saveMsg = 'Saved on this phone — will sync when signal returns';
      render();
    });
  }

  // ── SAVE ACTIONS ─────────────────────────────────────────────────────────
  function val(id) { var e = $(id); return e ? e.value : ''; }

  function prepare() {
    api('prepare', { fixture_id: S.fixtureId, operator: val('md-operator') }).then(function (j) {
      if (!j.ok) { alert(j.error); return; }
      S.record = j.record; S.tab = 'prepare';
      setDraft(seedDraft());
      render();
      if (typeof global.toast === 'function') global.toast('Match-day record created — starting at zero');
    });
  }

  function savePrepare() {
    var patch = {
      operator: val('md-operator'), weather: val('md-weather'),
    };
    if (S.canMoney) {
      patch.float_open_pence = toP(val('md-float-open'));
      patch.sales = Object.assign({}, S.record.sales || {}, {
        programmes: { qty: parseInt(val('md-prog-qty'), 10) || 0, unit_pence: toP(val('md-prog-price')) },
        badges: { qty: parseInt(val('md-badge-qty'), 10) || 0, unit_pence: toP(val('md-badge-price')) }
      });
    }
    push(patch, 'Preparation saved');
  }

  function saveReconcile() { push(reconcilePatch(), 'Draft saved'); }

  function reconcilePatch() {
    var d = draft();
    var patch = {
      attendance: d.attendance,
      attendance_official: val('md-att-official') === '' ? null : parseInt(val('md-att-official'), 10),
      attendance_variance_note: val('md-att-note'),
      completed_by: val('md-completed-by'),
      notes: {
        incidents: val('md-note-incidents'), turnstile: val('md-note-turnstile'),
        cash: val('md-note-cash'), general: val('md-note-general')
      }
    };
    if (S.canMoney) {
      patch.sales = {
        programmes: { qty: parseInt(val('md-prog-qty'), 10) || 0, unit_pence: toP(val('md-prog-price')) },
        badges: { qty: parseInt(val('md-badge-qty'), 10) || 0, unit_pence: toP(val('md-badge-price')) },
        merch: { qty: parseInt(val('md-merch-qty'), 10) || 0, unit_pence: toP(val('md-merch-price')) },
        hospitality_pence: toP(val('md-hosp')), sponsorship_pence: toP(val('md-spons'))
      };
      patch.receipts = {
        cash_pence: toP(val('md-cash')), card_pence: toP(val('md-card')),
        online_pence: toP(val('md-online')), other_pence: toP(val('md-other'))
      };
      patch.float_open_pence = toP(val('md-float-open'));
      patch.float_close_pence = toP(val('md-float-close'));
      patch.reconciliation_note = val('md-recon-note');
    }
    return patch;
  }

  function push(patch, okMsg) {
    S.saveState = 'saving'; render();
    api('save', { fixture_id: S.fixtureId, version: S.record.version, patch: patch }).then(function (j) {
      if (j.ok) {
        S.record = j.record; S.saveState = 'idle'; S.lastSavedAt = Date.now();
        if (typeof global.toast === 'function') global.toast(okMsg);
      } else {
        S.saveState = 'error'; S.saveMsg = j.error;
        if (j.conflict && j.current) S.record = j.current;
        alert(j.error);
      }
      render();
    });
  }

  function submit() {
    // Push the latest values first so the server validates what is on screen.
    S.saveState = 'saving'; render();
    api('save', { fixture_id: S.fixtureId, version: S.record.version, patch: reconcilePatch() }).then(function (j) {
      if (!j.ok) { S.saveState = 'error'; S.saveMsg = j.error; render(); alert(j.error); return; }
      S.record = j.record;
      var key = 'submit-' + S.fixtureId + '-' + S.record.version;   // replay-safe
      return api('submit', { fixture_id: S.fixtureId, version: S.record.version, idempotency_key: key });
    }).then(function (j) {
      if (!j) return;
      if (!j.ok) {
        S.saveState = 'error'; S.saveMsg = j.error; render();
        alert(j.error);
        if (j.needs === 'attendance_variance_note') { S.tab = 'reconcile'; render(); var e = $('md-att-note'); if (e) e.focus(); }
        if (j.needs === 'reconciliation_note') { S.tab = 'reconcile'; render(); var r = $('md-recon-note'); if (r) r.focus(); }
        return;
      }
      S.record = j.record; S.saveState = 'idle'; S.tab = 'review';
      clearDraft();
      render();
      if (typeof global.toast === 'function') {
        global.toast(j.duplicate ? 'Already submitted' : 'Submitted for review');
      }
    }).catch(function () { S.saveState = 'error'; S.saveMsg = 'Network error'; render(); });
  }

  function approve() {
    if (!confirm('Approve this record?\n\nIt becomes the club\'s official figure for this match.')) return;
    act('approve', {}, 'Approved');
  }
  function lock() {
    if (!confirm('Lock this record?\n\nIt can then only be changed by reopening it, which needs a reason and is audited.')) return;
    act('lock', {}, 'Locked');
  }
  function reopen() {
    var reason = prompt('Why does this locked record need reopening?\n\nThis is recorded permanently in the audit history, with your name and the time.');
    if (reason == null) return;
    if (reason.trim().length < 10) { alert('Please give a fuller reason — at least 10 characters.'); return; }
    act('reopen', { reason: reason.trim() }, 'Reopened');
  }
  function act(action, extra, okMsg) {
    api(action, Object.assign({ fixture_id: S.fixtureId, version: S.record.version }, extra)).then(function (j) {
      if (!j.ok) { alert(j.error); return; }
      S.record = j.record;
      if (typeof global.toast === 'function') global.toast(okMsg);
      api('audit', { fixture_id: S.fixtureId }).then(function (a) {
        if (a.ok) S.audit = a.audit || [];
        render();
      });
      render();
    });
  }

  // ── REPORTS ──────────────────────────────────────────────────────────────
  var reportData = null;
  function viewReports() {
    var h = backBar();
    if (!has('can_matchday_finance')) {
      return h + '<div class="md-denied"><b>Reports need financial permission.</b><br>' +
        'Sign in with your own staff password rather than the shared committee one, or ask the chairman to set you one in Manage Users.</div>';
    }
    if (!reportData) { loadReports(); return h + '<div class="md-loading">Building the reports…</div>'; }
    var r = reportData;
    h += '<div class="slbl">' + esc(r.season) + ' — ' + r.matches + ' completed home match(es)</div>';
    h += '<div class="md-summary">' +
      statPlain(r.attendance.total, 'Total attendance') +
      statPlain(r.attendance.average, 'Average') +
      statPlain(r.attendance.highest, 'Highest') +
      statPlain(r.attendance.lowest, 'Lowest') + '</div>';
    h += '<div class="md-summary">' +
      statPlain(money(r.money.total_receipts_pence), 'Total receipts') +
      statPlain(money(r.money.average_per_attendee_pence), 'Per attendee') +
      statPlain(money(r.money.cash_pence), 'Cash') +
      statPlain(money(r.money.card_pence), 'Card') + '</div>';

    h += '<div class="div"></div><div class="slbl">By competition</div><div class="md-sum">';
    r.byCompetition.forEach(function (c) {
      h += '<div class="md-sum__row"><span>' + esc(c.label) + ' (' + c.matches + ')</span><span class="md-money">' +
        c.attendance + ' · ' + money(c.receipts_pence) + '</span></div>';
    });
    if (!r.byCompetition.length) h += '<div class="md-sum__row"><span>No completed records yet</span><span></span></div>';
    h += '</div>';

    h += '<div class="slbl">Attendance make-up</div><div class="md-sum">' +
      sumRow('Paid admissions', r.attendance.paid) +
      sumRow('Admitted free', r.attendance.free) +
      sumRow('&nbsp;&nbsp;of which Guest List / Complimentary', r.attendance.guestList) +
      sumRow('&nbsp;&nbsp;of which season ticket', r.attendance.seasonTicket) + '</div>';

    h += '<div class="slbl">Ticket categories</div><div class="md-sum">';
    var lastFree = null;
    r.ticketCategories.forEach(function (c) {
      if (c.free !== lastFree) {
        h += '<div class="md-sum__row md-sum__row--total"><span>' +
          (c.free ? 'Admitted free — counts as attendance, no gate money' : 'Paying at the gate') + '</span><span></span></div>';
        lastFree = c.free;
      }
      h += '<div class="md-sum__row"><span>' + esc(c.label || c.key) + '</span><span>' + c.total + '</span></div>';
    });
    if (!r.ticketCategories.length) h += '<div class="md-sum__row"><span>Nothing counted yet</span><span></span></div>';
    h += '</div>';

    h += '<div class="slbl">Sales</div><div class="md-sum">' +
      sumRow('Programmes', r.sales.programmes) +
      sumRow('Pin badges', r.sales.badges) +
      sumRow('Merchandise', r.sales.merch) +
      sumRow('Sales income', money(r.sales.sales_pence)) + '</div>';

    h += '<div class="div"></div><div class="slbl">Needs attention</div>';
    h += exceptionList('Home fixtures with no completed record', r.exceptions.missingRecords,
      function (x) { return esc(x.date) + ' · ' + esc(x.opponent) + ' (' + esc(x.recordStatus) + ')'; });
    h += exceptionList('Unreconciled', r.exceptions.unreconciled,
      function (x) { return esc(x.opponent || x.fixture_id) + ' — ' + esc(x.status); });
    h += exceptionList('Attendance discrepancies', r.exceptions.attendanceDiscrepancies,
      function (x) { return esc(x.opponent || x.fixture_id) + ': ' + (x.variance > 0 ? '+' : '') + x.variance + (x.note ? ' — ' + esc(x.note) : ''); });
    h += exceptionList('Financial discrepancies', r.exceptions.financialDiscrepancies,
      function (x) { return esc(x.opponent || x.fixture_id) + ': ' + (x.variance_pence > 0 ? '+' : '') + money(x.variance_pence) + (x.note ? ' — ' + esc(x.note) : ''); });

    h += '<div class="div"></div><button class="save sec" onclick="MDOps.exportCsv()"><i class="ico ico-download"></i> Export CSV</button>';
    return h;
  }
  function statPlain(n, label) {
    return '<div class="md-stat" style="--accent:var(--gr);cursor:default"><span class="md-stat__num">' + n +
      '</span><span class="md-stat__lbl">' + esc(label) + '</span></div>';
  }
  function exceptionList(title, list, fmt) {
    if (!list || !list.length) return '<div class="md-var md-var--ok"><b>' + esc(title) + ':</b> none.</div>';
    return '<div class="md-var md-var--warn"><b>' + esc(title) + ' (' + list.length + ')</b><ul style="margin:6px 0 0 16px">' +
      list.map(function (x) { return '<li>' + fmt(x) + '</li>'; }).join('') + '</ul></div>';
  }
  function loadReports() {
    api('reports', { season: S.season }).then(function (j) {
      if (j.ok) { reportData = j; render(); }
      else { S.loadErr = j.error; render(); }
    });
  }
  function exportCsv() {
    api('export', { season: S.season }).then(function (j) {
      if (!j.ok) { alert(j.error); return; }
      var blob = new Blob([j.csv], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'rayners-lane-matchday-' + j.season + '.csv';
      a.click();
      if (typeof global.toast === 'function') global.toast(j.count + ' record(s) exported');
    });
  }

  // ── ARCHIVE ──────────────────────────────────────────────────────────────
  var archiveData = null, archOpen = {};
  function viewArchive() {
    var h = backBar();
    if (!has('can_matchday_finance')) {
      return h + '<div class="md-denied"><b>The archive needs financial permission.</b></div>';
    }
    if (!archiveData) { loadArchive(); return h + '<div class="md-loading">Loading the archive…</div>'; }
    if (!archiveData.length) return h + '<div class="md-empty"><b>Nothing archived yet</b>Completed match-day records appear here, by season and competition.</div>';
    h += '<div style="font-family:var(--fb);font-size:12.5px;color:var(--gr);line-height:1.55;margin-bottom:12px">' +
      'Season, then competition, then fixture. Each record shows the opponent, competition and prices as they were on the day.</div>';
    archiveData.forEach(function (s) {
      var sOpen = archOpen['s:' + s.season];
      h += '<div class="md-arch__season"><button class="md-arch__head" aria-expanded="' + !!sOpen +
        '" onclick="MDOps.arch(\'s:' + esc(s.season) + '\')"><span class="md-arch__ttl">' + esc(s.season) +
        '</span><span class="md-arch__meta">' + s.matches + ' matches · ' + s.attendance + ' · ' + money(s.receipts_pence) + '</span></button>';
      if (sOpen) {
        h += '<div class="md-arch__body">';
        s.competitions.forEach(function (c) {
          var cKey = 'c:' + s.season + ':' + c.key, cOpen = archOpen[cKey];
          h += '<div class="md-arch__comp"><button class="md-arch__head" aria-expanded="' + !!cOpen +
            '" onclick="MDOps.arch(\'' + esc(cKey) + '\')"><span class="md-arch__ttl">' + esc(c.label) +
            '</span><span class="md-arch__meta">' + c.matches + ' · ' + money(c.receipts_pence) + '</span></button>';
          if (cOpen) {
            h += '<div class="md-arch__body"><table class="md-table"><tbody>' + c.fixtures.map(function (f) {
              return '<tr>' + td('Date', esc(fmtDate(f.date))) + td('Opposition', '<b>' + esc(f.opponent) + '</b>') +
                td('Attendance', f.attendance, 'md-num') + td('Receipts', money(f.receipts_pence), 'md-num') +
                td('Status', pill(f.status, f.is_legacy_import)) +
                '<td class="md-cell-action"><button class="save sec" style="margin:0;width:100%" onclick="MDOps.open(\'' +
                esc(f.fixture_id) + '\')">Open</button></td></tr>';
            }).join('') + '</tbody></table></div>';
          }
          h += '</div>';
        });
        h += '</div>';
      }
      h += '</div>';
    });
    return h;
  }
  function loadArchive() {
    api('archive', {}).then(function (j) {
      if (j.ok) { archiveData = j.seasons || []; render(); }
      else { S.loadErr = j.error; render(); }
    });
  }
  function arch(key) { archOpen[key] = !archOpen[key]; render(); }

  // ── PRICING (view + the RARE single-fixture exception) ───────────────────
  // There is no season price editor here on purpose. The season prices are the
  // ones published on the website; this screen shows them, and lets a chairman
  // price ONE fixture differently when the competition genuinely requires it.
  var priceData = null;
  function viewPrices() {
    var h = '<button class="save sec" style="margin:0 0 12px" onclick="MDOps.go(\'fixture\')">&#8592; Back to the match</button>';
    if (!priceData) { loadPrices(); return h + '<div class="md-loading">Loading prices…</div>'; }

    var p = priceData.pricing || {};
    var cats = p.categories || [];
    h += '<div class="slbl">Prices for this fixture</div>';
    h += '<div class="md-var ' + (p.isOverride ? 'md-var--warn' : 'md-var--ok') + '">' +
      (p.isOverride
        ? '<b>This fixture is priced differently.</b><br>' + esc(p.source)
        : '<b>Standard season admission.</b><br>' + esc(p.source)) + '</div>';
    h += priceTable(cats);

    h += '<div class="md-var md-var--ok"><b>Where these come from</b><br>' +
      'Season admission prices are website content — the same block that shows on the fixtures and contact pages. ' +
      'They are fixed for the season and edited once, on the site. Match Day Ops reads them, so there is nothing ' +
      'to keep in step and no second price list to drift.' +
      (priceData.seasonPrices
        ? '<div style="margin-top:8px">' + priceData.seasonPrices.map(function (r) {
            return esc(r.label) + ' ' + esc(r.price); }).join(' &middot; ') + '</div>'
        : '') + '</div>';

    if (!has('can_matchday_prices')) {
      h += '<div class="md-denied">Pricing a fixture differently needs chairman or vice-chairman permission, ' +
        'and a personal staff password rather than the shared committee one.</div>';
      return h;
    }

    h += '<div class="div"></div><div class="slbl">Price this one fixture differently</div>';
    h += '<div style="font-family:var(--fb);font-size:12.5px;color:var(--gr);line-height:1.55;margin-bottom:10px">' +
      'Only for a fixture that genuinely is different — a cup instruction, a charity match, a promotion or a special ' +
      'event. It applies to <b style="color:var(--w)">this fixture alone</b>, is recorded against your name with your ' +
      'reason, and does <b style="color:var(--w)">not</b> change the season prices on the website.</div>';

    var g = splitCats(cats);
    h += '<div class="md-sum">';
    g.paid.forEach(function (c) {
      h += '<div class="md-sum__row"><span><label for="ov-' + esc(c.key) + '">' + esc(c.label) + '</label></span>' +
        '<span><input id="ov-' + esc(c.key) + '" type="number" inputmode="decimal" step="0.01" min="0" ' +
        'style="width:96px;text-align:right" value="' + pounds(c.price_pence) + '"></span></div>';
    });
    h += '<div class="md-sum__row"><span style="color:var(--gr)">Free categories (Guest List, season tickets, officials, scouts…) always stay at £0 and cannot be priced.</span><span></span></div>';
    h += '</div>';
    h += area('Why is this fixture priced differently?', 'ov-reason', (p.isOverride && priceData.overrideReason) || '',
      'e.g. Middlesex FA instruction: £12 / £8 for the Senior Cup quarter-final', false);
    h += '<button class="save" onclick="MDOps.saveOverride()">Apply to this fixture only</button>';
    if (p.isOverride) {
      h += '<button class="save sec" style="margin-top:8px" onclick="MDOps.clearOverride()">Remove the override &mdash; go back to season prices</button>';
    }
    return h;
  }
  function loadPrices() {
    api('prices-get', { fixture_id: S.fixtureId }).then(function (j) {
      if (j.ok) {
        priceData = j;
        priceData.overrideReason = (j.pricing && /override — (.*)$/.exec(j.pricing.source || '') || [])[1] || '';
        render();
      } else { S.loadErr = j.error; render(); }
    });
  }
  function saveOverride() {
    var cats = ((priceData.pricing || {}).categories || []).map(function (c) {
      if (!isPaid(c) && c.price_pence === 0 && c.paid === false) return c;
      var el = $('ov-' + c.key);
      if (!el) return c;
      var p = toP(el.value);
      return Object.assign({}, c, { price_pence: p, revenue: p > 0, paid: true });
    });
    var reason = val('ov-reason');
    if (reason.trim().length < 10) { alert('Please give a fuller reason — at least 10 characters. It goes into the audit history.'); return; }
    api('price-override', { fixture_id: S.fixtureId, categories: cats, reason: reason.trim() }).then(function (j) {
      if (!j.ok) { alert(j.error); return; }
      priceData = null;
      if (typeof global.toast === 'function') global.toast('Prices set for this fixture only');
      open(S.fixtureId);
    });
  }
  function clearOverride() {
    if (!confirm('Remove this fixture\'s special prices and go back to the season prices from the website?')) return;
    api('price-override-clear', { fixture_id: S.fixtureId }).then(function (j) {
      if (!j.ok) { alert(j.error); return; }
      priceData = null;
      if (typeof global.toast === 'function') global.toast('Back to season prices');
      open(S.fixtureId);
    });
  }

  // ── NAV ──────────────────────────────────────────────────────────────────
  function go(view) {
    S.view = view;
    if (view === 'home') { S.fixtureId = null; S.record = null; load(); }
    if (view === 'reports') reportData = null;
    if (view === 'archive') archiveData = null;
    if (view === 'prices') priceData = null;
    if (view === 'fixture' && S.fixtureId) { render(); return; }
    render();
  }
  function filter(k) { S.filter = k; render(); }
  function tab(k) { S.tab = k; render(); }

  function wire() {
    // Keep focus usable after a re-render on the tally screen.
    if (S.view === 'fixture' && S.tab === 'tally' && S._focusKey) {
      var e = document.querySelector('[aria-label="' + S._focusKey + ' count"]');
      if (e) e.focus();
      S._focusKey = null;
    }
  }

  // Sync whatever is pending as soon as signal returns.
  global.addEventListener('online', function () {
    if (S.record && S.saveState !== 'idle') syncNow();
    else render();
  });
  global.addEventListener('offline', render);
  // A backgrounded tab must not lose anything: the draft is already in
  // localStorage, and we take the chance to flush.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && S.record && S.saveState === 'dirty') syncNow();
  });

  global.MDOps = {
    init: init, load: load, go: go, filter: filter, tab: tab, open: open, arch: arch,
    prepare: prepare, savePrepare: savePrepare, saveReconcile: saveReconcile,
    submit: submit, approve: approve, lock: lock, reopen: reopen,
    bump: bump, setCount: setCount, resetTally: resetTally, setOperator: setOperator,
    saveOverride: saveOverride, clearOverride: clearOverride,
    exportCsv: exportCsv, reauth: reauth, mintSession: mintSession,
    // True while a record is open with work that is not safely on the server.
    // The portal's update bar checks this so a deploy never reloads the page
    // out from under a volunteer who is mid-count.
    isBusy: function () {
      return S.view === 'fixture' && !!S.record &&
        ['dirty', 'saving', 'offline', 'error'].indexOf(S.saveState) > -1;
    },
    _state: S
  };
}(window));
