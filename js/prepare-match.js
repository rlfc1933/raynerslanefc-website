/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — NEXT MATCH & PREPARE MATCH

   THE PROBLEM THIS SOLVES. A volunteer opening the portal on a Tuesday could
   see thirty-one tools and no football. Preparing Saturday's home game meant
   knowing that the programme lives in one panel, the squad in another, the
   sponsors in a third and the matchday ops in a fourth — knowledge the portal
   never gave anyone, so people learned it or avoided it.

   This puts the fixture first and gathers everything that fixture needs into
   one workspace, in the order a matchday actually happens: before, during,
   after. Staff should never have to know which panel owns a feature.

   IT OWNS NO FOOTBALL TRUTH, AND NO PERMISSION.
   The fixture comes from data/fixtures.json. Live state comes from the block
   that already owns it, never from comparing a kick-off time to the clock.
   Every action opens an EXISTING panel through openPanel(), so the server-side
   authorisation that has always guarded those tools still guards them. This
   file can make a button appear; it cannot make an action allowed.

   MISSING WORK IS "TO DO", NOT AN ERROR.
   A programme nobody has started yet is the normal state on a Tuesday. It gets
   a quiet grey "To do", not a red failure box. The portal should never tell a
   volunteer they have broken something by not having done it yet.

   IT CANNOT BREAK THE DASHBOARD. Every path is wrapped; a failure renders
   nothing at all and the rest of the portal is untouched.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var S = { fixture: null, state: 'none', prep: null, pal: null, ident: null, loaded: false };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function j(url) {
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  // ── FIXTURE SELECTION ────────────────────────────────────────────────────

  function kickoffMs(f) {
    try {
      if (global.MatchTime && MatchTime.kickoffEpoch) {
        var ms = MatchTime.kickoffEpoch(f);
        if (isFinite(ms)) return ms;
      }
    } catch (e) {}
    var d = Date.parse((f && f.date ? f.date : '') + 'T' + ((f && f.kickoff) || '15:00') + ':00');
    return isFinite(d) ? d : NaN;
  }

  /**
   * Live is READ, never derived.
   * A kick-off time that has passed means the game may have started; it does
   * not mean it is live, and it certainly does not mean we know the score.
   */
  function liveFixtureId() {
    try {
      var l = global.__rlfcLive;
      if (l && l.isLive && l.fixtureId != null) return String(l.fixtureId);
      var el = document.getElementById('club-now');
      if (el && el.getAttribute('data-match-state') === 'live') {
        return el.getAttribute('data-fixture-id') || null;
      }
    } catch (e) {}
    return null;
  }

  function pick(list) {
    var now = Date.now();
    var liveId = liveFixtureId();
    if (liveId) {
      var lf = list.filter(function (f) { return String(f.id) === liveId; })[0];
      if (lf) return { fixture: lf, state: 'live' };
    }
    // Not yet played, soonest first.
    //
    // POSTPONED FIXTURES ARE SKIPPED, and that is a deliberate difference from
    // the public fixture list. A postponed match is not the match you prepare —
    // there is no programme to build and no squad to pick for a game that is
    // not happening. Including them also put this card and the homepage's Club
    // Now block on DIFFERENT fixtures, which is precisely the confusion this
    // screen exists to remove. Communicating a postponement is an attention
    // item, and portal-home already owns those.
    var playable = function (f) {
      var st = String(f.status || '').toLowerCase();
      return st !== 'postponed' && st !== 'cancelled' && st !== 'abandoned';
    };
    var future = list.filter(function (f) {
      var ms = kickoffMs(f);
      return isFinite(ms) && ms > now - 2.5 * 3600000 && f.us == null && playable(f);
    }).sort(function (a, b) { return kickoffMs(a) - kickoffMs(b); });
    if (future.length) return { fixture: future[0], state: 'upcoming' };
    // Nothing ahead: the most recent completed game, which is what staff still
    // have work outstanding on (result, MOTM, report, attendance).
    var done = list.filter(function (f) { return f.us != null && f.them != null; })
      .sort(function (a, b) { return kickoffMs(b) - kickoffMs(a); });
    if (done.length) return { fixture: done[0], state: 'finished' };
    return { fixture: null, state: 'none' };
  }

  // ── PREPARATION STATUS ───────────────────────────────────────────────────

  function filled(v) { return !!(v && String(v).trim()); }

  /**
   * What still needs doing for THIS fixture.
   *
   * Every item is derived from data that already exists. Nothing is invented,
   * and where this file genuinely cannot tell, it says "To do" rather than
   * guessing "Ready" — a false green here would send someone to a match with
   * no programme.
   */
  function prepFor(fixture, prog) {
    var sameMatch = !!(prog && fixture && prog.opponent && fixture.opponent &&
      String(prog.opponent).toLowerCase() === String(fixture.opponent).toLowerCase() &&
      String(prog.date || '') === String(fixture.date || ''));

    var progState = 'notstarted', progNote = 'Not started';
    if (sameMatch) {
      var core = ['managerNotes', 'welcomeNotes', 'oppSummary', 'storylines'];
      var have = core.filter(function (k) { return filled(prog[k]); }).length;
      if (prog.published) { progState = 'ready'; progNote = 'Published'; }
      else if (have >= 3) { progState = 'ready'; progNote = 'Draft ready'; }
      else if (have > 0) { progState = 'todo'; progNote = have + ' of ' + core.length + ' sections'; }
      else { progState = 'todo'; progNote = 'Started, empty'; }
    }

    var home = fixture && fixture.isHome !== false;
    var items = [
      { key: 'programme', label: 'Programme', state: home ? progState : 'na',
        note: home ? progNote : 'Away — no programme', panel: 'programme', act: 'Continue programme' },
      { key: 'creative', label: 'Matchday creative', state: 'todo', note: 'To do',
        panel: 'poststudio', act: 'Make graphics' },
      { key: 'squad', label: 'Squad', state: 'todo', note: 'To do', panel: 'squad', act: 'Pick squad' },
      { key: 'sponsors', label: 'Sponsors', state: filled(prog && prog.matchSponsor) ? 'ready' : 'todo',
        note: filled(prog && prog.matchSponsor) ? esc(prog.matchSponsor) : 'To do',
        panel: 'sponsors', act: 'Match sponsor' },
      { key: 'info', label: 'Match info', state: filled(fixture && fixture.venue) ? 'ready' : 'todo',
        note: filled(fixture && fixture.venue) ? 'Venue set' : 'To do', panel: 'fixtures', act: 'Match info' }
    ];
    return items;
  }

  // ── CAMPAIGN ─────────────────────────────────────────────────────────────

  function resolveCampaign(f) {
    var pal = null, ident = null;
    try {
      if (global.BrandPalette) {
        var p = global.BrandPalette.resolve(f.opponent);
        if (p && p.usable) pal = p;
      }
    } catch (e) {}
    try { if (global.CompetitionBrand) ident = global.CompetitionBrand.identity(f); } catch (e) {}
    return { pal: pal, ident: ident };
  }

  // ── RENDER: THE DASHBOARD CARD ───────────────────────────────────────────

  function crest(src, name) {
    if (src) return '<img class="pm__crest" src="' + esc(src) + '" alt="">';
    var ini = String(name || '?').replace(/\b(fc|afc|united|town|city)\b/gi, '')
      .trim().split(/\s+/).map(function (w) { return w[0] || ''; }).join('').slice(0, 3).toUpperCase();
    return '<span class="pm__crest pm__crest--ini">' + esc(ini) + '</span>';
  }

  function when(f) {
    var ms = kickoffMs(f);
    if (!isFinite(ms)) return 'Date to be confirmed';
    var d = new Date(ms);
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) +
      ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function chip(it) {
    var cls = 'pm__chip pm__chip--' + it.state;
    return '<span class="' + cls + '"><b>' + esc(it.label) + '</b>' +
      '<i>' + esc(it.note) + '</i></span>';
  }

  function cardHTML() {
    var f = S.fixture;
    if (!f) return '';
    var home = f.isHome !== false;
    var us = { name: 'Rayners Lane', crest: 'img/badge.png' };
    var them = { name: f.opponent || 'TBC', crest: f.oppCrest || '' };
    var L = home ? us : them, R = home ? them : us;
    var comp = (S.ident && S.ident.label) || f.competition || '';
    var round = (S.ident && S.ident.round) || '';
    var oppCol = S.pal ? S.pal.primary : '';
    var live = S.state === 'live';

    var head = live
      ? '<span class="pm__live"><i></i>Match live</span>'
      : '<span class="pm__kicker">' + (S.state === 'finished' ? 'Last match' : 'Next match') + '</span>';

    var mid = (f.us != null && f.them != null)
      ? '<span class="pm__score">' + esc(home ? f.us : f.them) + '–' + esc(home ? f.them : f.us) + '</span>'
      : '<span class="pm__v">v</span>';

    return '<section class="pm-card' + (oppCol ? ' pm-card--tinted' : '') + ' pm-card--' + esc(S.state) + '"' +
        (oppCol ? ' style="--pm-opp:' + esc(oppCol) + '"' : '') + '>' +
      '<div class="pm-card__top">' + head +
        (comp ? '<span class="pm__comp">' + esc(comp) + (round ? ' · ' + esc(round) : '') + '</span>' : '') +
      '</div>' +
      '<div class="pm-card__lock">' +
        '<div class="pm__side">' + crest(L.crest, L.name) + '<span class="pm__team">' + esc(L.name) + '</span></div>' +
        mid +
        '<div class="pm__side">' + crest(R.crest, R.name) + '<span class="pm__team">' + esc(R.name) + '</span></div>' +
      '</div>' +
      '<p class="pm-card__when">' + esc(when(f)) + ' · ' + (home ? 'Home' : 'Away') +
        (f.venue ? ' · ' + esc(f.venue) : '') +
        (S.state === 'postponed' ? ' · <b class="pm__off">Postponed</b>' : '') + '</p>' +
      (S.prep && S.prep.length
        ? '<div class="pm-card__chips">' + S.prep.filter(function (i) { return i.state !== 'na'; })
            .map(chip).join('') + '</div>'
        : '') +
      '<div class="pm-card__acts">' +
        (live
          ? '<button class="pm__btn pm__btn--go" onclick="PrepareMatch.open(\'live\')">Open live content</button>'
          : '<button class="pm__btn pm__btn--go" onclick="PrepareMatch.open()">Prepare match</button>') +
      '</div>' +
    '</section>';
  }

  // ── RENDER: THE HUB ──────────────────────────────────────────────────────

  var PHASES = [
    { key: 'before', title: 'Before the match', items: [
      { label: 'Matchday creative', desc: 'Graphics for this fixture', panel: 'poststudio' },
      { label: 'Programme',         desc: 'Build and preview the programme', panel: 'programme' },
      { label: 'Squad',             desc: 'Who is available', panel: 'squad' },
      { label: 'Sponsors',          desc: 'Match and ball sponsors', panel: 'sponsors' },
      { label: 'Match info',        desc: 'Venue, kick-off, officials', panel: 'fixtures' }
    ]},
    { key: 'live', title: 'During the match', items: [
      { label: 'Live content',  desc: 'Turn events into posts', panel: 'poststudio', live: true },
      { label: 'Starting XI',   desc: 'Publish the line-up', panel: 'mdops' },
      { label: 'Score',         desc: 'Keep the score updated', panel: 'mdops' },
      { label: 'Events',        desc: 'Goals, cards, subs', panel: 'mdops' },
      { label: 'Photos',        desc: 'Upload matchday photos', panel: 'social' }
    ]},
    { key: 'after', title: 'After the match', items: [
      { label: 'Result',      desc: 'Confirm the final score', panel: 'mdops' },
      { label: 'Man of the match', desc: 'Record the MOTM', panel: 'motm' },
      { label: 'Match report', desc: 'Write it up', panel: 'news' },
      { label: 'Attendance',  desc: 'Record the gate', panel: 'fanclub' },
      { label: 'Recap',       desc: 'Full-time graphics', panel: 'poststudio' }
    ]}
  ];

  function hubHTML() {
    var f = S.fixture;
    if (!f) {
      return '<div class="pm-hub"><p class="pm-hub__none">There is no upcoming fixture in the ' +
        'calendar yet. Once one is added it will appear here with everything it needs.</p></div>';
    }
    var home = f.isHome !== false;
    var comp = (S.ident && S.ident.label) || f.competition || '';
    var oppCol = S.pal ? S.pal.primary : '';

    return '<div class="pm-hub' + (oppCol ? ' pm-hub--tinted' : '') + '"' +
        (oppCol ? ' style="--pm-opp:' + esc(oppCol) + '"' : '') + '>' +
      '<header class="pm-hub__hd">' +
        '<span class="pm__kicker">' + (S.state === 'live' ? 'Match live' : 'Preparing') + '</span>' +
        '<h3>' + esc(home ? 'Rayners Lane v ' + (f.opponent || 'TBC')
                          : (f.opponent || 'TBC') + ' v Rayners Lane') + '</h3>' +
        '<p>' + esc(when(f)) + (comp ? ' · ' + esc(comp) : '') + '</p>' +
      '</header>' +
      PHASES.map(function (ph) {
        return '<section class="pm-ph pm-ph--' + ph.key + (S.state === ph.key ? ' pm-ph--now' : '') + '">' +
          '<h4>' + esc(ph.title) + '</h4>' +
          '<div class="pm-ph__grid">' + ph.items.map(function (it) {
            var st = (S.prep || []).filter(function (p) {
              return p.label.toLowerCase() === it.label.toLowerCase();
            })[0];
            return '<button class="pm-tile" onclick="PrepareMatch.go(\'' + esc(it.panel) + '\')">' +
              '<span class="pm-tile__l">' + esc(it.label) + '</span>' +
              '<span class="pm-tile__d">' + esc(it.desc) + '</span>' +
              (st && st.state !== 'na'
                ? '<span class="pm-tile__s pm-tile__s--' + st.state + '">' + esc(st.note) + '</span>' : '') +
            '</button>';
          }).join('') + '</div>' +
        '</section>';
      }).join('') +
    '</div>';
  }

  // ── WIRING ───────────────────────────────────────────────────────────────

  /** Every action goes through the portal's own panel opener, so the existing
      permission checks and panel initialisers run exactly as they always do. */
  function go(panel) {
    try { if (typeof global.openPanel === 'function') global.openPanel(panel); } catch (e) {}
  }

  function open(which) {
    go('preparematch');
    if (which === 'live') {
      try {
        if (global.LiveContentDesk && S.fixture) {
          global.LiveContentDesk.start(S.fixture.id, campaignShape());
        }
      } catch (e) {}
    }
  }

  /** The shape LiveContentDesk expects, built from what we already resolved. */
  function campaignShape() {
    var f = S.fixture; if (!f) return null;
    var home = f.isHome !== false;
    return {
      id: 'fx-' + f.id, fixtureId: f.id, isHome: home,
      home: { name: home ? 'Rayners Lane' : (f.opponent || 'TBC') },
      away: { name: home ? (f.opponent || 'TBC') : 'Rayners Lane' }
    };
  }

  function paint() {
    var card = $('pm-next');
    if (card) card.innerHTML = cardHTML();
    var hub = $('pm-hub');
    if (hub) hub.innerHTML = hubHTML();
  }

  function load() {
    if (S.loaded) return Promise.resolve(S);
    return Promise.all([j('data/fixtures.json'), j('data/programme.json')])
      .then(function (r) {
        var list = (r[0] && r[0].fixtures) || [];
        var got = pick(list);
        S.fixture = got.fixture; S.state = got.state;
        if (S.fixture) {
          var c = resolveCampaign(S.fixture);
          S.pal = c.pal; S.ident = c.ident;
          S.prep = prepFor(S.fixture, r[1]);
        }
        S.loaded = true;
        return S;
      })
      .catch(function () { S.loaded = true; return S; });
  }

  function init() {
    return load().then(function () { paint(); return S; }).catch(function () {});
  }

  global.PrepareMatch = {
    init: init, load: load, paint: paint, go: go, open: open,
    cardHTML: cardHTML, hubHTML: hubHTML,
    _state: S, _pick: pick, _prepFor: prepFor, _kickoffMs: kickoffMs
  };
}(typeof window !== 'undefined' ? window : globalThis));
