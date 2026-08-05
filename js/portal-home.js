/**
 * THE PORTAL HOME — an attention-led front door.
 *
 * WHAT THIS REPLACES
 * The dashboard was 31 equally-weighted tiles, 22 of them below the fold, three
 * screens of scrolling on a desktop and nearly six on a phone. It answered
 * "what exists". A volunteer opening it on a Tuesday could not see that
 * Saturday's home game needed preparing.
 *
 * WHAT THIS DOES
 * Answers three questions, in order, before showing any inventory:
 *   1. What needs doing?      → Today at the club · Needs attention
 *   2. What do I normally use? → My club work (by role)
 *   3. Where is everything else? → Club areas · View all club tools
 *
 * WHAT THIS DOES NOT TOUCH
 * No panel id, no openPanel(), no URL hash, no save function, no API call, no
 * data path. Every existing tool is reachable exactly as before; this is a
 * layer in front of them. If this file failed to load the old dashboard would
 * still work.
 *
 * ATTENTION ITEMS ARE DERIVED FROM DATA THAT ALREADY EXISTS. Nothing is
 * fabricated and no record is created to populate the screen.
 */
(function (global) {
  'use strict';

  var T = null;                      // PortalTools, resolved lazily
  var S = { attention: [], today: null, loaded: false, showAll: false };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function sess() {
    try { return JSON.parse(sessionStorage.getItem('rlfc_staff') || 'null'); }
    catch (e) { return null; }
  }
  function role() {
    var s = sess();
    return (s && (s.role || s.username)) || 'Committee';
  }
  function isChairman() {
    var s = sess();
    return !!(s && s.isChairman);
  }
  /**
   * The name to greet somebody by.
   *
   * Only a real name is used. If the account has none — an older login, or one
   * created before names were recorded — the portal says "Welcome back" and
   * stops. Guessing a first name from a username produces "Hello, Vchairman",
   * which is worse than not trying.
   */
  function firstName() {
    var s = sess();
    var n = (s && s.name && String(s.name).trim()) || '';
    if (!n) return '';
    return n.split(/\s+/)[0];
  }
  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function daysUntil(iso) {
    return Math.round((new Date(iso + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 86400000);
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  // ── DATA GATHERING ───────────────────────────────────────────────────────
  // Read-only. Uses the same fetchJSON the rest of the portal uses, so it
  // benefits from the existing cache-busting and never writes anything.
  function getJSON(name) {
    return new Promise(function (res) {
      try { global.fetchJSON(name, function (d) { res(d || null); }); }
      catch (e) { res(null); }
    });
  }

  function load() {
    S.loaded = false;
    render();
    Promise.all([getJSON('fixtures'), getJSON('matchday'), getJSON('news')])
      .then(function (r) { build(r[0], r[1], r[2]); })
      .catch(function () { build(null, null, null); });
  }

  function build(fxd, md, newsd) {
    var fixtures = (fxd && fxd.fixtures) || [];
    var t = today();
    var attention = [];

    var played = function (f) { return f.us != null && f.them != null; };
    var home = fixtures.filter(function (f) { return f.isHome !== false; });

    // ── TODAY ──
    var todayFx = fixtures.filter(function (f) { return f.date === t; })[0] || null;
    var nextHome = home.filter(function (f) { return f.date >= t; })
      .sort(function (a, b) { return a.date.localeCompare(b.date); })[0] || null;
    var lastResult = fixtures.filter(played)
      .sort(function (a, b) { return b.date.localeCompare(a.date); })[0] || null;
    var live = md && (md.isLive || md.state === 'live');

    S.today = { todayFx: todayFx, nextHome: nextHome, lastResult: lastResult, live: !!live, mdState: (md && md.state) || 'off' };

    // ── ATTENTION: a played fixture with no score ──
    fixtures.filter(function (f) {
      return !played(f) && f.date < t && daysUntil(f.date) > -60;
    }).forEach(function (f) {
      attention.push({
        level: 'red', icon: 'ico-calendar',
        title: 'No result recorded for ' + f.opponent,
        why: 'Played on ' + fmtDate(f.date) + ' — supporters still see this as upcoming.',
        when: f.date, action: 'Add the result', panel: 'fixtures'
      });
    });

    // ── ATTENTION: home game within 7 days ──
    if (nextHome && daysUntil(nextHome.date) <= 7 && daysUntil(nextHome.date) >= 0) {
      var d = daysUntil(nextHome.date);
      attention.push({
        level: d <= 2 ? 'red' : 'amber', icon: 'ico-ticket',
        title: (d === 0 ? 'Today’s' : d === 1 ? 'Tomorrow’s' : fmtDate(nextHome.date) + ' ') + ' home match needs preparing',
        why: 'Set who is on the turnstile and check the prices before kick-off.',
        when: nextHome.date, action: 'Prepare match day', panel: 'mdops'
      });
    }

    // ── ATTENTION: scoreboard left on ──
    if (live) {
      attention.push({
        level: 'red', icon: 'ico-radio',
        title: 'The live scoreboard is still switched on',
        why: 'Supporters see a live score on the home page. Turn it off when the game has finished.',
        when: t, action: 'Open the scoreboard', panel: 'matchday'
      });
    }

    // ── ATTENTION: unreviewed drafted stories (count only, no fabrication) ──
    try {
      var drafts = (global.soDraftCount && global.soDraftCount()) || 0;
      if (drafts > 0) {
        attention.push({
          level: 'amber', icon: 'ico-megaphone',
          title: drafts + (drafts === 1 ? ' drafted story is' : ' drafted stories are') + ' waiting to be checked',
          why: 'Nothing is published until someone approves it.',
          when: t, action: 'Review drafted stories', panel: 'signoff'
        });
      }
    } catch (e) {}

    // Soonest / most severe first.
    attention.sort(function (a, b) {
      if (a.level !== b.level) return a.level === 'red' ? -1 : 1;
      return String(a.when).localeCompare(String(b.when));
    });

    S.attention = attention;
    S.loaded = true;
    render();
    badge();
  }

  /** Match Day Ops attention needs a signed session; ask only if we have one. */
  function mdopsAttention() {
    var tok;
    try { tok = sessionStorage.getItem('rlfc_md_token'); } catch (e) { tok = null; }
    if (!tok || !global.PIN) return;
    fetch('/.netlify/functions/matchday-ops', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: global.PIN, token: tok, action: 'list' })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok || !j.rows) return;
      var t = today(), add = [];
      j.rows.forEach(function (row) {
        var st = row.recordStatus, f = row.fixture;
        if (st === 'awaiting_reconciliation') {
          add.push({ level: 'amber', icon: 'ico-check', when: f.date,
            title: f.opponent + ' is waiting to be checked and approved',
            why: 'The attendance and takings have been submitted.',
            action: 'Open the record', panel: 'mdops' });
        } else if ((f.played || f.date < t) && (st === 'upcoming' || st === 'ready' || st === 'in_progress')) {
          add.push({ level: 'red', icon: 'ico-ticket', when: f.date,
            title: 'No completed match-day record for ' + f.opponent,
            why: 'Played on ' + fmtDate(f.date) + '. The attendance and takings sheet is unfinished.',
            action: 'Finish the record', panel: 'mdops' });
        }
      });
      if (add.length) {
        S.attention = S.attention.concat(add).sort(function (a, b) {
          if (a.level !== b.level) return a.level === 'red' ? -1 : 1;
          return String(a.when).localeCompare(String(b.when));
        });
        render(); badge();
      }
    }).catch(function () {});
  }

  function badge() {
    var el = $('ph-att-count');
    if (el) el.textContent = S.attention.length ? String(S.attention.length) : '';
  }

  // ── RENDER ───────────────────────────────────────────────────────────────
  function render() {
    var el = $('portal-home');
    if (!el) return;
    T = global.PortalTools;
    if (!T) { el.innerHTML = ''; return; }
    // The order answers, in sequence: who am I · what is wrong · what do I do
    // now · what was I doing · what else is mine · where is everything else ·
    // who do I ask. A volunteer should be able to stop reading at any point
    // and still have got what they came for.
    el.innerHTML = viewMyPortal() + viewAttention() + viewQuick() + viewRecent() +
                   viewMyWork() + viewAreas() + viewHelp();
    var dash = $('dash-home');
    if (dash) dash.style.display = S.showAll ? 'block' : 'none';
  }

  /** MY PORTAL — who you are, what your job is, and what today looks like. */
  function viewMyPortal() {
    var p = T.profileFor(role());
    var n = firstName();
    var hello = n ? greeting() + ', ' + esc(n) : 'Welcome back';
    var guide = T.guideFor(role());
    return '<section class="ph-me" aria-labelledby="ph-me-h">' +
      '<div class="ph-me__row">' +
        '<div>' +
          '<h2 class="ph-h ph-h--big" id="ph-me-h">' + hello + '</h2>' +
          '<p class="ph-me__role">' + esc(p.title) + '</p>' +
          '<p class="ph-me__blurb">' + esc(p.blurb) + '</p>' +
        '</div>' +
        (guide
          ? '<a class="ph-guide" href="guide.html#' + esc(guide) + '">My guide</a>'
          : '<a class="ph-guide" href="guide.html#how-the-club-portal-works">Portal guide</a>') +
      '</div>' + viewToday() + '</section>';
  }

  function viewToday() {
    var d = S.today;
    var body;
    if (!S.loaded) {
      body = '<div class="ph-today__line">Loading the club diary…</div>';
    } else if (d && d.todayFx) {
      body = '<div class="ph-today__big">' + esc(d.todayFx.opponent) + '</div>' +
        '<div class="ph-today__line">' + (d.todayFx.isHome !== false ? 'At home' : 'Away') +
        ' · ' + esc(d.todayFx.kickoff || '15:00') + ' · ' + esc(d.todayFx.competition || '') + '</div>';
    } else if (d && d.nextHome) {
      body = '<div class="ph-today__line">Nothing is scheduled today.</div>' +
        '<div class="ph-today__big">' + esc(d.nextHome.opponent) + '</div>' +
        '<div class="ph-today__line">Next home match &middot; ' + esc(fmtDate(d.nextHome.date)) +
        ' at ' + esc(d.nextHome.kickoff || '15:00') + '</div>';
    } else {
      body = '<div class="ph-today__line">Nothing is scheduled today, and there is no home match in the diary yet.</div>';
    }
    var live = d && d.live
      ? '<span class="ph-chip ph-chip--live"><span class="ph-dot"></span> Scoreboard is ON</span>'
      : '<span class="ph-chip">Scoreboard off</span>';
    var last = d && d.lastResult
      ? '<span class="ph-chip">Last result &middot; ' + esc(d.lastResult.opponent) + ' ' +
        esc(d.lastResult.us) + '&ndash;' + esc(d.lastResult.them) + '</span>' : '';
    return '<div class="ph-today" aria-labelledby="ph-today-h">' +
      '<h3 class="ph-h ph-h--sm" id="ph-today-h">Today at the club</h3>' + body +
      '<div class="ph-chips">' + live + last + '</div></div>';
  }

  function viewAttention() {
    var h = '<section class="ph-sec" aria-labelledby="ph-att-h">' +
      '<h2 class="ph-h" id="ph-att-h">Needs attention</h2>';
    if (!S.loaded) return h + '<div class="ph-empty">Checking…</div></section>';
    if (!S.attention.length) {
      return h + '<div class="ph-empty ph-empty--good"><b>Nothing needs your attention.</b>' +
        'Everything is up to date. Have a look at <em>My club work</em> below when you are ready.</div></section>';
    }
    var limit = window.innerWidth < 700 ? 3 : 5;
    var shown = S.attention.slice(0, limit);
    h += '<div class="ph-atts">' + shown.map(function (a) {
      return '<div class="ph-att ph-att--' + a.level + '">' +
        '<div class="ph-att__body">' +
          '<div class="ph-att__title">' + esc(a.title) + '</div>' +
          '<div class="ph-att__why">' + esc(a.why) + '</div>' +
        '</div>' +
        '<button class="ph-att__go" onclick="PortalHome.go(\'' + esc(a.panel) + '\')">' +
          esc(a.action) + '</button>' +
      '</div>';
    }).join('') + '</div>';
    if (S.attention.length > limit) {
      h += '<button class="ph-more" onclick="PortalHome.showAllAttention()">View all ' +
        S.attention.length + ' items</button>';
    }
    return h + '</section>';
  }

  /**
   * QUICK ACTIONS — the three or four jobs this person does weekly.
   *
   * Chosen by their profile, not by their name, and not by watching them. A
   * "most used" list learned from behaviour would be empty on somebody's first
   * day, which is exactly the day they need it most.
   */
  function viewQuick() {
    var acts = T.quickFor(role()).filter(function (q) {
      var t = T.byId(q.panel);
      return t && (!t.chairman || isChairman());
    });
    if (!acts.length) return '';
    return '<section class="ph-sec" aria-labelledby="ph-q-h">' +
      '<h2 class="ph-h" id="ph-q-h">Quick actions</h2>' +
      '<div class="ph-quick">' + acts.map(function (q) {
        var t = T.byId(q.panel);
        var pub = t.effect === 'public';
        return '<button class="ph-qbtn" onclick="PortalHome.go(\'' + esc(q.panel) + '\')">' +
          '<span class="ph-qbtn__lbl">' + esc(q.label) + '</span>' +
          '<span class="ph-qbtn__eff' + (pub ? ' is-public' : '') + '">' +
            esc(T.EFFECT_LABEL[t.effect] || '') + '</span></button>';
      }).join('') + '</div></section>';
  }

  /**
   * MY RECENT WORK — only saves the server confirmed, on this device.
   *
   * Empty is a real and common answer. It says so rather than filling the
   * space with something that looks like history.
   */
  function viewRecent() {
    var R = global.PortalRecent;
    var rows = R ? R.list() : [];
    var h = '<section class="ph-sec" aria-labelledby="ph-r-h" id="ph-recent">' +
      '<h2 class="ph-h" id="ph-r-h">My recent work</h2>';
    if (!rows.length) {
      return h + '<div class="ph-empty">' +
        '<b>Nothing saved yet from this device.</b>' +
        'When you save something, it will appear here so you can pick up where you left off. ' +
        'This list is kept on this device only — it is not a record the club can see.' +
        '</div></section>';
    }
    return h + '<div class="ph-recent">' + rows.map(function (r) {
      return '<button class="ph-rrow" onclick="PortalHome.go(\'' + esc(r.tool.id) + '\')">' +
        '<span class="ph-rrow__name">' + esc(r.tool.name) + '</span>' +
        '<span class="ph-rrow__when">' + esc(r.verb) + ' ' + esc(R.ago(r.at)) + '</span>' +
        '</button>';
    }).join('') + '</div></section>';
  }

  /** Repaint just this section after a save, without rebuilding the page. */
  function paintRecent() {
    var box = $('ph-recent');
    // A save can land before the home has ever painted — the volunteer opened
    // a panel straight from a bookmark. There is nothing to repaint then.
    if (!box || !T) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = viewRecent();
    var fresh = tmp.firstChild;
    if (fresh) box.parentNode.replaceChild(fresh, box);
  }

  function toolCard(t) {
    var badge = t.effect === 'public'
      ? '<span class="ph-badge ph-badge--public">Changes the website</span>'
      : t.effect === 'internal' ? '<span class="ph-badge">Internal only</span>'
      : t.effect === 'download' ? '<span class="ph-badge">Makes a file</span>'
      : '<span class="ph-badge">Information</span>';
    var open = t.href
      ? 'onclick="location.href=\'' + esc(t.href) + '\'"'
      : 'onclick="PortalHome.go(\'' + esc(t.id) + '\')"';
    return '<button class="ph-tool" ' + open + '>' +
      '<span class="ph-tool__name">' + esc(t.name) + '</span>' +
      '<span class="ph-tool__desc">' + esc(t.desc) + '</span>' +
      '<span class="ph-tool__foot">' + badge + '<span class="ph-tool__open">Open</span></span>' +
      '</button>';
  }

  function viewMyWork() {
    var p = T.profileFor(role());
    var tools = T.homeFor(role()).filter(function (t) { return !t.chairman || isChairman(); });
    return '<section class="ph-sec" aria-labelledby="ph-my-h">' +
      '<h2 class="ph-h" id="ph-my-h">My club work</h2>' +
      '<p class="ph-sub">The tools a <b>' + esc(p.title) + '</b> normally uses. ' +
      'Nothing is hidden from you — everything else is under <em>All club tools</em> below.</p>' +
      '<div class="ph-tools">' + tools.map(toolCard).join('') + '</div></section>';
  }

  function viewAreas() {
    var chair = isChairman();
    // COMPACT BY DEFAULT. Previously every area rendered its full grid of tool
    // cards, which made the mobile home over four screens tall. An area is now
    // a single readable row — the club question, the job people usually want,
    // and a count — and the tools appear only when it is opened. Nothing is
    // hidden: everything is one tap away, and the desktop layout is unchanged
    // in substance, just tighter.
    var h = '<section class="ph-sec" aria-labelledby="ph-areas-h">' +
      '<h2 class="ph-h" id="ph-areas-h">All club tools</h2>' +
      '<p class="ph-sub">Everything the portal can do, grouped the way the club works. ' +
      'You can open any of it — if you are covering for somebody, their tools are here. ' +
      'Tap a group to see what is inside.</p>' +
      '<div class="ph-areas">';
    T.AREAS.forEach(function (a) {
      var tools = T.byArea(a.key).filter(function (t) { return !t.chairman || chair; });
      if (!tools.length) return;
      var danger = a.key === 'system';
      h += '<details class="ph-area' + (danger ? ' ph-area--care' : '') + '">' +
        '<summary class="ph-area__head">' +
          '<span class="ph-area__txt">' +
            '<span class="ph-area__name">' + esc(a.name) + '</span>' +
            '<span class="ph-area__ask">' + esc(a.ask) + '</span>' +
          '</span>' +
          '<span class="ph-area__count">' + tools.length + '</span>' +
          '<span class="ph-area__chev" aria-hidden="true">&#9662;</span>' +
        '</summary>' +
        '<p class="ph-area__blurb">' + esc(a.likely) + '</p>' +
        '<div class="ph-tools">' + tools.map(toolCard).join('') + '</div></details>';
    });
    return h + '</div></section>';
  }

  /**
   * HELP — the last section, because it is where somebody goes when the rest
   * of the page has not answered them.
   *
   * It leads with the reassurance, not with a contact address. The commonest
   * reason a volunteer stops using the portal is fear of breaking the website,
   * and that fear is answerable in one sentence.
   */
  function viewHelp() {
    var guide = T.guideFor(role());
    return '<section class="ph-sec ph-help" aria-labelledby="ph-help-h">' +
      '<h2 class="ph-h" id="ph-help-h">Help</h2>' +
      '<p class="ph-sub"><b>You cannot break the website from here.</b> The portal is only ' +
      'allowed to change the club’s information and pictures — never the site itself. ' +
      'The worst that can happen is wrong words on a page until you correct them.</p>' +
      '<div class="ph-helprow">' +
        (guide ? '<a class="ph-hbtn" href="guide.html#' + esc(guide) + '">My guide</a>' : '') +
        '<a class="ph-hbtn" href="guide.html#how-the-club-portal-works">How the portal works</a>' +
        '<button class="ph-hbtn" onclick="PortalHome.go(\'siteguide\')">Handbook</button>' +
        '<a class="ph-hbtn" href="mailto:info@raynerslanefc.co.uk">Email the club</a>' +
      '</div>' +
      '<button class="ph-allbtn" onclick="PortalHome.toggleAll()" aria-expanded="' + S.showAll + '">' +
      (S.showAll ? 'Hide the classic tile list' : 'Show the classic tile list') + '</button>' +
      '<p class="ph-sub ph-sub--center">' + (S.showAll
        ? 'The original list, exactly as it was.'
        : 'If you learned the portal on the old screen, it is still here.') + '</p></section>';
  }

  // ── ACTIONS ──────────────────────────────────────────────────────────────
  function go(panel) {
    if (typeof global.openPanel === 'function') global.openPanel(panel);
  }
  function toggleAll() {
    S.showAll = !S.showAll;
    render();
    if (S.showAll) {
      var d = $('dash-home');
      if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  function showAllAttention() {
    var el = $('portal-home');
    if (!el) return;
    var box = el.querySelector('.ph-atts');
    if (!box) return;
    box.innerHTML = S.attention.map(function (a) {
      return '<div class="ph-att ph-att--' + a.level + '">' +
        '<div class="ph-att__body"><div class="ph-att__title">' + esc(a.title) + '</div>' +
        '<div class="ph-att__why">' + esc(a.why) + '</div></div>' +
        '<button class="ph-att__go" onclick="PortalHome.go(\'' + esc(a.panel) + '\')">' + esc(a.action) + '</button></div>';
    }).join('');
    var more = el.querySelector('.ph-more');
    if (more) more.remove();
  }

  function init() {
    // Watch for confirmed saves BEFORE the first paint, so a save made in the
    // first few seconds is recorded like any other.
    try { if (global.PortalRecent) global.PortalRecent.watch(); } catch (e) {}
    render();
    load();
    setTimeout(mdopsAttention, 1200);
  }

  global.PortalHome = {
    init: init, go: go, toggleAll: toggleAll, showAllAttention: showAllAttention,
    paintRecent: paintRecent, refresh: load, _state: S
  };
}(window));
