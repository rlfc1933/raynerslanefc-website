/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — "CLUB NOW" command centre (renderer)

   The homepage heartbeat. Wires together data + engines that ALREADY exist —
   it builds nothing parallel:
     • next match + results  ← rlfcFixturesShape(data/fixtures.json)   [js/main.js]
     • live score            ← readLiveMatch() (Supabase live_match / matchday.json)
     • directions            ← data/venues.json lat/lng → Google Maps / Waze
     • add to calendar        ← /.netlify/functions/fixtures-ics
     • crest fallbacks        ← initials (same rule as the fixtures page)

   States: LIVE takeover · next match + live countdown · league position /
   last result / last-5 form · honest pre-season empty states (never a fake 0).
   Auto-updates: countdown ticks every 1s; live polls every 12s; data cache-
   busted. Reduced-motion + AA handled in css/club-now.css.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  var root = document.getElementById('club-now');
  if (!root) return;
  var elPrimary = document.getElementById('cn-primary');
  var elStrip   = document.getElementById('cn-strip');
  var elStatus  = document.getElementById('cn-status');

  var venues = {};
  var raw = [];            // raw fixtures (carry competition for league-start)
  var shaped = null;       // { next, results }
  var live = null;         // { isLive, isHome, opponent, homeScore, awayScore, status, scorers }
  var cdTimer = null, lastSig = '';

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/\bf\.?c\.?\b/g, '').replace(/\butd\b/g, 'united')
      .replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  }

  // ── crest (img, falling back to initials — never a broken image) ──
  function iniHTML(name) {
    var ini = String(name || '').replace(/\b(fc|afc|utd|united|town|city)\b/gi, '')
      .trim().split(/\s+/).map(function (w) { return w[0] || ''; }).join('').slice(0, 3).toUpperCase() || '?';
    return '<span class="cn__crest cn__crest--ini">' + esc(ini) + '</span>';
  }
  window.__cnIni = iniHTML;
  function crestHTML(crest, name) {
    if (crest) return '<img src="' + esc(crest) + '" alt="' + esc(name) + ' crest" class="cn__crest" ' +
      'data-nm="' + esc(name) + '" onerror="this.outerHTML=window.__cnIni(this.getAttribute(\'data-nm\'))">';
    return iniHTML(name);
  }

  // ── data loads (all cache-busted so a published change shows immediately) ──
  function loadVenues() {
    return fetch('data/venues.json?t=' + Date.now()).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) { ((v && v.venues) || []).forEach(function (x) { venues[norm(x.club)] = x; }); })
      .catch(function () {});
  }
  function shapeLocal(list) {   // fallback if main.js's shaper isn't present
    var now = Date.now();
    function dt(f) { return MatchTime.fixtureSortKey(f); }
    var sorted = list.slice().sort(function (a, b) { return dt(a) - dt(b); });
    var played = sorted.filter(function (f) { return f.us != null && f.them != null; });
    var up = sorted.filter(function (f) { return !(f.us != null && f.them != null); });
    var soon = up.filter(function (f) { return dt(f) > now - 6 * 3600000; });
    var next = soon.filter(function (f) { return f.pinned; })[0] || soon[0] || up[0] || null;
    return {
      next: next ? { opponent: next.opponent, date: next.date, kickoff: next.kickoff, isHome: next.isHome, competition: next.competition, venue: next.venue, oppCrest: next.oppCrest || '' } : null,
      results: played.slice().reverse().map(function (r) { return { opponent: r.opponent, date: r.date, isHome: r.isHome, us: r.us, them: r.them }; })
    };
  }
  function loadFixtures() {
    return fetch('data/fixtures.json?t=' + Date.now()).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        raw = (d && d.fixtures) || [];
        shaped = (typeof rlfcFixturesShape === 'function') ? rlfcFixturesShape(raw) : shapeLocal(raw);
      }).catch(function () { shaped = { next: null, results: [] }; });
  }
  // Single source of truth: readLiveMatch() (js/main.js) resolves the effective
  // state — including AUTO-LIVE (an armed game flips to live by itself at kick-off,
  // UK time) and the instant Supabase score — so the command centre and the top
  // live bar always agree. Falls back to a plain matchday.json read if main.js
  // isn't present. state: off | armed | live | delayed | postponed | cancelled | ft
  function readLive() {
    if (typeof readLiveMatch === 'function') return readLiveMatch();
    return fetch('data/matchday.json?t=' + Date.now())
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (md) {
        md = md || {};
        var st = md.state || (md.isLive ? 'live' : (/full|ft|final/i.test(md.status || '') ? 'ft' : 'off'));
        var ko = ukEpoch(md.date, md.kickoff);
        if (st === 'armed' && !isNaN(ko) && Date.now() >= ko && Date.now() < ko + 150 * 60000) st = 'live';
        md._state = st; md.isLive = (st === 'live');
        return md;
      });
  }

  // ── directions (only when the venue is VERIFIED with coordinates) ──
  function venueFor(m) { var club = (m.isHome !== false) ? 'Rayners Lane' : (m.opponent || ''); return venues[norm(club)] || null; }
  function dirBtn(m) {
    var v = venueFor(m);
    if (!v || !v.verified || v.lat == null || v.lng == null) return '';
    var ll = v.lat + ',' + v.lng;
    return '<a class="cn__btn cn__btn--y" href="https://www.google.com/maps/dir/?api=1&destination=' + ll +
      '&travelmode=driving" target="_blank" rel="noopener"><i class="ico ico-map-pin" aria-hidden="true"></i> Directions</a>';
  }
  function icsBtn() {
    return '<a class="cn__btn" href="/.netlify/functions/fixtures-ics"><i class="ico ico-calendar" aria-hidden="true"></i> Add to calendar</a>';
  }

  // ── formatting ──
  // Epoch ms for a wall-clock kick-off in Europe/London (auto-handles BST/GMT),
  // correct no matter what timezone the viewer's device is in. Fixes kick-offs
  // reading ~7h out when the site is opened from outside the UK.
  // One parser for the whole site — see js/match-time.js.
  function ukEpoch(dateStr, timeStr) { return MatchTime.parseLondonKickoff(dateStr, timeStr); }

  function fmtDate(dateStr) {
    var d = new Date((String(dateStr).length === 10 ? dateStr + 'T12:00:00' : dateStr));
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function fmtKO(ko) {
    if (!ko) return '';
    var p = ko.split(':'), h = +p[0]; return (h % 12 || 12) + (p[1] === '00' ? '' : '.' + p[1]) + (h >= 12 ? 'pm' : 'am');
  }
  function venueLabel(m) { var v = venueFor(m); return m.venue || (v && v.ground) || (m.isHome !== false ? 'Tithe Farm, Harrow' : ''); }

  // Opponent crest for the live/state views — matched from the real fixture by
  // name, so the crest shows during the game too (not just on "next match").
  function liveOppCrest() {
    var opp = norm(live && live.opponent);
    if (!opp) return '';
    if (shaped && shaped.next && norm(shaped.next.opponent) === opp && shaped.next.oppCrest) return shaped.next.oppCrest;
    var hit = (raw || []).filter(function (f) { return norm(f.opponent) === opp && f.oppCrest; })[0];
    return hit ? hit.oppCrest : '';
  }

  // ── LIVE primary ──
  function renderLive() {
    var opp = live.opponent || 'Opposition', home = live.isHome !== false, oc = liveOppCrest();
    var L = home ? { n: 'Rayners Lane', c: 'img/badge.png' } : { n: opp, c: oc };
    var R = home ? { n: opp, c: oc } : { n: 'Rayners Lane', c: 'img/badge.png' };
    var hs = live.homeScore || 0, as = live.awayScore || 0;
    elStatus.textContent = 'Live';
    elPrimary.innerHTML =
      '<div class="cn__eyebrow cn__eyebrow--live"><span class="cn__dot"></span> Live' + (live.status ? ' · ' + esc(live.status) : '') + '</div>' +
      '<div class="cn__lock">' +
        '<div class="cn__team">' + crestHTML(L.c, L.n) + '<span class="cn__nm">' + esc(L.n.toUpperCase()) + '</span></div>' +
        '<div class="cn__mid"><span class="cn__score">' + hs + ' – ' + as + '</span></div>' +
        '<div class="cn__team">' + crestHTML(R.c, R.n) + '<span class="cn__nm">' + esc(R.n.toUpperCase()) + '</span></div>' +
      '</div>' +
      (live.scorers ? '<div class="cn__scorers"><i class="ico ico-football" aria-hidden="true"></i> ' + esc(live.scorers) + '</div>' : '') +
      '<div class="cn__cta"><a class="cn__btn cn__btn--y" href="match-centre.html"><i class="ico ico-activity" aria-hidden="true"></i> Match Centre</a></div>';
  }

  // ── FULL TIME primary ──────────────────────────────────────────────────
  // For 24 hours after the whistle the result leads the hero, with the next
  // fixture counting down underneath it. Before this, the whole block simply
  // vanished at full time and supporters lost the score they came for.
  function renderResult() {
    var opp = live.opponent || 'Opposition', home = live.isHome !== false, oc = liveOppCrest();
    var L = home ? { n: 'Rayners Lane', c: 'img/badge.png' } : { n: opp, c: oc };
    var R = home ? { n: opp, c: oc } : { n: 'Rayners Lane', c: 'img/badge.png' };
    var hs = live.homeScore || 0, as = live.awayScore || 0;
    var us = home ? hs : as, them = home ? as : hs;
    var verdict = us > them ? 'Won' : (us === them ? 'Drew' : 'Lost');
    elStatus.textContent = 'Full Time';

    // The fixture we have just played still has no score in data/fixtures.json,
    // so the shaper happily offers it back as the "next match" — the hero ended
    // up counting down to the game that had only just finished. Take the first
    // fixture that kicks off AFTER this one instead.
    var playedAt = MatchTime.kickoffEpoch(
      (live._row && live._row.scheduled_kickoff) ? { scheduled_kickoff: live._row.scheduled_kickoff }
                                                 : { date: live.date, kickoff: live.kickoff });
    var n = shaped && shaped.next;
    if (n && isFinite(playedAt)) {
      var later = (raw || []).filter(function (f) {
        var k = MatchTime.kickoffEpoch(f);
        return isFinite(k) && k > playedAt && !(f.us != null && f.them != null);
      }).sort(function (a, b) { return MatchTime.kickoffEpoch(a) - MatchTime.kickoffEpoch(b); })[0];
      n = later ? {
        opponent: later.opponent, date: later.date, kickoff: later.kickoff,
        isHome: later.isHome, competition: later.competition,
      } : null;
    }
    var nextBlock = '';
    if (n && n.opponent) {
      nextBlock =
        '<div class="cn__after">' +
          '<div class="cn__after-lbl">Next up · ' + esc(n.isHome !== false ? 'Home' : 'Away') +
            ' v ' + esc(n.opponent) + '</div>' +
          '<div class="cn__countdown" id="cn-countdown"></div>' +
        '</div>';
    }

    elPrimary.innerHTML =
      '<div class="cn__eyebrow cn__eyebrow--ft">Full Time' + (live.competition ? ' · ' + esc(live.competition) : '') + '</div>' +
      '<div class="cn__lock">' +
        '<div class="cn__team">' + crestHTML(L.c, L.n) + '<span class="cn__nm">' + esc(L.n.toUpperCase()) + '</span></div>' +
        '<div class="cn__mid"><span class="cn__score">' + hs + ' – ' + as + '</span></div>' +
        '<div class="cn__team">' + crestHTML(R.c, R.n) + '<span class="cn__nm">' + esc(R.n.toUpperCase()) + '</span></div>' +
      '</div>' +
      '<div class="cn__verdict">' + esc(verdict) + '</div>' +
      (live.scorers ? '<div class="cn__scorers"><i class="ico ico-football" aria-hidden="true"></i> ' + esc(live.scorers) + '</div>' : '') +
      '<div class="cn__cta"><a class="cn__btn cn__btn--y" href="match-centre.html"><i class="ico ico-activity" aria-hidden="true"></i> Match Centre</a>' +
        '<a class="cn__btn cn__btn--ghost" href="fixtures.html">Fixtures &amp; Results</a></div>' +
      nextBlock;

    if (n && n.opponent) startCountdown(n.date, n.kickoff);
  }

  // ── NEXT MATCH primary ──
  function renderNext() {
    var n = shaped && shaped.next;
    if (!n || !n.opponent) {
      elStatus.textContent = 'The Lane';
      elPrimary.innerHTML =
        '<div class="cn__eyebrow">Next match</div>' +
        '<div class="cn__meta">Fixtures releasing soon — check back for the next Lane game.</div>' +
        '<div class="cn__cta"><a class="cn__btn cn__btn--y" href="fixtures.html">Fixtures &amp; Results</a></div>';
      return;
    }
    var home = n.isHome !== false, opp = n.opponent;
    var L = home ? { n: 'Rayners Lane', c: 'img/badge.png', us: true } : { n: opp, c: n.oppCrest, us: false };
    var R = home ? { n: opp, c: n.oppCrest, us: false } : { n: 'Rayners Lane', c: 'img/badge.png', us: true };
    var comp = n.competition || '';
    elStatus.textContent = /friendly|pre-?season/i.test(comp) ? 'Pre-Season' : (comp || 'Next Up');
    function team(t) {
      return '<div class="cn__team">' + crestHTML(t.c, t.n) + '<span class="cn__nm">' + esc(t.n.toUpperCase()) + '</span>' +
        (t.us ? '<span class="cn__ha ' + (home ? 'cn__ha--home' : '') + '">' + (home ? 'Home' : 'Away') + '</span>' : '') + '</div>';
    }
    var metaBits = [fmtDate(n.date), fmtKO(n.kickoff), venueLabel(n)].filter(Boolean).join(' · ');
    elPrimary.innerHTML =
      '<div class="cn__eyebrow"><i class="ico ico-football" aria-hidden="true"></i> Next Match' + (comp ? ' · ' + esc(comp) : '') + '</div>' +
      '<div class="cn__lock">' + team(L) + '<div class="cn__mid"><span class="cn__vs">VS</span></div>' + team(R) + '</div>' +
      '<div class="cn__countdown" id="cn-countdown"></div>' +
      '<div class="cn__meta"><i class="ico ico-map-pin" aria-hidden="true"></i> ' + esc(metaBits) + '</div>' +
      '<div class="cn__cta">' + dirBtn(n) + icsBtn() +
        '<a class="cn__btn cn__btn--ghost" href="match-centre.html">Match Centre</a></div>';
    startCountdown(n.date, n.kickoff);
  }

  // ── countdown (own 1s tick; cleared on each rebuild) — UK-time anchored ──
  function startCountdown(dateStr, timeStr) {
    if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
    var el = document.getElementById('cn-countdown'); if (!el) return;
    var targetMs = ukEpoch(dateStr, timeStr || '15:00');
    if (isNaN(targetMs)) { el.innerHTML = '<span class="cn__meta">Kick-off time to be confirmed</span>'; return; }
    function tick() {
      var el2 = document.getElementById('cn-countdown'); if (!el2) { clearInterval(cdTimer); return; }
      var diff = targetMs - Date.now();
      if (diff <= 0) {
        if (diff > -3 * 3600000) el2.innerHTML = '<span class="cn__ko">KICK OFF</span>';
        else el2.innerHTML = '';
        clearInterval(cdTimer); return;
      }
      var d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000),
          m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
      var labels = ['Days', 'Hrs', 'Min', 'Sec'];
      el2.innerHTML = [d, h, m, s].map(function (v, i) {
        return '<div class="cn__cd-unit"><div class="cn__cd-num">' + String(v).padStart(2, '0') + '</div>' +
          '<div class="cn__cd-lbl">' + labels[i] + '</div></div>';
      }).join('');
    }
    tick(); cdTimer = setInterval(tick, 1000);
  }

  // ── STRIP: position / last result / last-5 form — or pre-season states ──
  function wdl(r) { return r.us > r.them ? 'w' : (r.us === r.them ? 'd' : 'l'); }
  function chip(c) { return '<span class="cn__wdl cn__wdl--' + c + '">' + c.toUpperCase() + '</span>'; }

  /** What to call the match we have just played, from its own competition. */
  function lastLabel(m) {
    var c = String((m && m.competition) || '');
    if (/friendly|pre-?season|testimonial/i.test(c)) return 'Last friendly';
    if (/cup|vase|trophy|shield/i.test(c)) return 'Last cup tie';
    return 'Last result';
  }

  function completedMatchday() {         // a finished match held in matchday.json
    if (!live || live.isLive) return null;
    // When staff have taken the scoreboard down (state 'off'), show NO result —
    // fall through to the next match. A result only shows for a genuine full-time.
    if (live._state === 'off') return null;
    var hs = live.homeScore, as = live.awayScore;
    var done = /full|ft|final|result/i.test(live.status || '');
    if (!done || hs == null || as == null || !live.opponent) return null;
    // Guard against a mid-match "Full Time" misclick posting a fake historical
    // result: only treat it as finished once the game has actually had time to
    // end (kick-off + ~100 min, UK time). Before that, show nothing rather than
    // a wrong 0-0. If we have no kick-off to check, fall through (legacy safe).
    var ko = ukEpoch(live.date, live.kickoff);
    if (!isNaN(ko) && Date.now() < ko + 100 * 60000) return null;
    var home = live.isHome !== false;
    return { opponent: live.opponent, isHome: live.isHome, us: home ? hs : as, them: home ? as : hs,
             competition: live.competition || '' };
  }

  function positionData() {
    // The tile reads window._rlfcTable, which NOTHING in the codebase ever
    // assigned — so the league position has never once appeared on the
    // homepage. It is now filled from the club's own football registry
    // (js/football-data.js) as soon as that answers, and the tile still hides
    // itself rather than showing a fake 0 if it does not.
    var t = window._rlfcTable;
    if (t && (t.position || t.pos)) return { pos: t.position || t.pos, played: t.played };
    return null;
  }

  /* Fill it from the registry, then repaint. Failure is silent and harmless:
     the tile simply stays hidden, exactly as it does today. */
  function loadPosition() {
    if (!global_RLFCFootball()) return Promise.resolve();
    return window.RLFCFootball.summary().then(function (d) {
      if (d && d.table && d.table.position) {
        window._rlfcTable = { position: d.table.position, played: d.table.played };
      }
    }).catch(function () {});
  }
  function global_RLFCFootball() { return !!(window.RLFCFootball && window.RLFCFootball.summary); }

  function resultTile(r, label) {
    return '<div class="cn__tile">' +
      '<div class="cn__tile-num">' + chip(wdl(r)) + ' <span class="cn__result-score">' + r.us + '–' + r.them + '</span></div>' +
      '<div class="cn__tile-lbl">' + esc(label || ('v ' + (r.opponent || ''))) + '</div></div>';
  }

  function renderStrip() {
    var results = (shaped && shaped.results) || [];
    var pos = positionData();

    if (results.length) {
      var last = results[0];
      var form = results.slice(0, 5).map(function (r) { return chip(wdl(r)); }).join('');
      var tiles = '';
      if (pos) tiles += '<div class="cn__tile"><div class="cn__tile-num">' + esc(String(pos.pos)) + '<small>' + ord(pos.pos) + '</small></div><div class="cn__tile-lbl">Position</div></div>';
      tiles += resultTile(last, 'Last · v ' + (last.opponent || ''));
      tiles += '<div class="cn__tile"><div class="cn__chips">' + form + '</div><div class="cn__tile-lbl">Last ' + Math.min(5, results.length) + '</div></div>';
      elStrip.style.gridTemplateColumns = 'repeat(' + (pos ? 3 : 2) + ',1fr)';
      elStrip.innerHTML = tiles;
      return;
    }

    // ── pre-season: no league results yet ──
    var start = leagueStart();
    var cmd = completedMatchday();
    var half = '';
    half += '<div class="cn__tile' + (cmd ? '' : ' cn__tile--full') + '">' +
      '<div class="cn__tile-num">' + (start ? esc(start.label) : 'Soon') + '</div>' +
      '<div class="cn__tile-lbl">' + (start ? 'Season kicks off' : 'New season loading') + '</div></div>';
    // This said "Last friendly" no matter what, because it was written when the
    // only results were pre-season friendlies. It then described the opening
    // Combined Counties league fixture as a friendly. Ask the competition.
    if (cmd) half += resultTile(cmd, lastLabel(cmd) + ' · v ' + (cmd.opponent || ''));
    elStrip.style.gridTemplateColumns = cmd ? 'repeat(2,1fr)' : '1fr';
    elStrip.innerHTML = half;
  }
  function ord(n) { n = +n; var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return (s[(v - 20) % 10] || s[v] || s[0]); }
  function leagueStart() {
    // earliest upcoming COMPETITIVE (non-friendly) fixture → the real season start
    var now = Date.now();
    var comp = raw.filter(function (f) {
      var c = f.competition || '';
      return !/friendly|pre-?season|testimonial/i.test(c) && MatchTime.fixtureSortKey(f) > now - 864e5;
    }).sort(function (a, b) { return MatchTime.fixtureSortKey(a) - MatchTime.fixtureSortKey(b); });
    if (!comp.length) return null;
    var d = new Date(comp[0].date + 'T12:00:00');
    return { label: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) };
  }

  // ── Delayed / Postponed / Cancelled banner ──
  function renderState(st) {
    if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
    var opp = live.opponent || 'Opposition', home = live.isHome !== false;
    var oc = liveOppCrest();
    var L = home ? { n: 'Rayners Lane', c: 'img/badge.png' } : { n: opp, c: oc };
    var R = home ? { n: opp, c: oc } : { n: 'Rayners Lane', c: 'img/badge.png' };
    var label = st === 'delayed' ? 'Kick-off Delayed' : (st === 'postponed' ? 'Postponed' : 'Cancelled');
    elStatus.textContent = label;
    elPrimary.innerHTML =
      '<div class="cn__eyebrow cn__eyebrow--live"><span class="cn__dot"></span> ' + esc(label) + '</div>' +
      '<div class="cn__lock">' +
        '<div class="cn__team">' + crestHTML(L.c, L.n) + '<span class="cn__nm">' + esc(L.n.toUpperCase()) + '</span></div>' +
        '<div class="cn__mid"><span class="cn__vs">VS</span></div>' +
        '<div class="cn__team">' + crestHTML(R.c, R.n) + '<span class="cn__nm">' + esc(R.n.toUpperCase()) + '</span></div>' +
      '</div>' +
      (live.stateReason ? '<div class="cn__meta">' + esc(live.stateReason) + '</div>' : '') +
      '<div class="cn__cta"><a class="cn__btn cn__btn--ghost" href="fixtures.html">Fixtures &amp; Results</a></div>';
  }

  // ── orchestration ──
  function renderPrimary() {
    var st = live && live._state;
    if (st === 'delayed' || st === 'postponed' || st === 'cancelled') { renderState(st); return; }
    if (live && live.isLive) { if (cdTimer) { clearInterval(cdTimer); cdTimer = null; } renderLive(); return; }
    // A result that is still today's news leads; once the hold expires this
    // falls through and the next fixture takes the hero back.
    if (live && live._result) { renderResult(); return; }
    renderNext();
  }
  function sig() {
    var st = (live && live._state) || 'off';
    if (live && live.isLive) return 'L|' + live.homeScore + '-' + live.awayScore + '|' + live.status;
    if (live && live._result) return 'FT|' + live.homeScore + '-' + live.awayScore + '|' + (shaped && shaped.next && shaped.next.opponent);
    if (st === 'delayed' || st === 'postponed' || st === 'cancelled') return st + '|' + (live.stateReason || '');
    return 'N|' + (shaped && shaped.next && shaped.next.opponent);
  }
  function build() { renderPrimary(); renderStrip(); lastSig = sig(); }

  function refreshLive() {
    readLive().then(function (m) { live = m; if (sig() !== lastSig) { build(); } });
  }
  function refreshData() {
    loadFixtures().then(function () { if (sig() !== lastSig) build(); });
  }

  // initial paint — venues + fixtures + live in parallel, then build once
  Promise.all([loadVenues(), loadFixtures(), loadPosition(), readLive().then(function (m) { live = m; })]).then(build);
  setInterval(refreshLive, 12000);   // live score / matchday state
  setInterval(refreshData, 60000);   // fixtures / results (rarely changes mid-visit)
})();
