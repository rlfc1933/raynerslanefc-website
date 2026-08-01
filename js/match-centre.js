/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — Match Centre renderer

   Takes NORMALISED club data (js/live-match.js → Supabase) and builds the page
   out of Rayners Lane components. No provider markup is ever inserted into the
   DOM: the adapter parsed it away server-side, and everything below is built
   from plain values with our own words, our own crests and our own type.

   Crests come from data/crests.json — the club's own artwork — never from the
   data provider's image server.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var root = document.getElementById('match-centre');
  if (!root) return;

  var crests = {};
  var verified = {};   // crest files confirmed to load
  var stop = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/\bf\.?c\.?\b/g, '').replace(/\butd\b/g, 'united')
      .replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  }

  function loadCrests() {
    return fetch('data/crests.json?t=' + Date.now())
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        ((d && d.crests) || []).forEach(function (c) { crests[norm(c.name)] = c.file; });
      })
      .catch(function () {});
  }

  /* Initials, never a broken image — the same rule the fixtures page uses. */
  function initials(name) {
    return String(name || '').replace(/\b(fc|afc|utd|united|town|city)\b/gi, '')
      .trim().split(/\s+/).map(function (w) { return w[0] || ''; }).join('').slice(0, 3).toUpperCase() || '?';
  }
  function crestHTML(name) {
    var file = crests[norm(name)];
    // `verified` is only ever populated with images that actually decoded, so
    // by the time we render there is nothing left to go wrong and no error
    // handler to race. An earlier version swapped crests out on a document-level
    // error listener and threw away images that had loaded perfectly well.
    if (!file || !verified[file]) {
      return '<span class="mc-crest mc-crest--ini">' + esc(initials(name)) + '</span>';
    }
    return '<img class="mc-crest" src="' + esc(file) + '" alt="' + esc(name) + ' crest">';
  }

  /* Load each crest once and remember which ones are real. A missing crest is
     completely normal for a new opponent, so this is an expected path, not an
     error path. */
  function verifyCrests() {
    var files = Object.keys(crests).map(function (k) { return crests[k]; });
    var uniq = files.filter(function (f, i) { return f && files.indexOf(f) === i; });
    return Promise.all(uniq.map(function (f) {
      return new Promise(function (res) {
        var img = new Image();
        img.onload = function () { verified[f] = true; res(); };
        img.onerror = function () { res(); };
        img.src = f;
      });
    }));
  }

  /* ── the club's own words for what happened ───────────────────────────────
     Deliberately NOT the provider's phrasing ("cautioned", "sent off"). This is
     how a Rayners Lane supporter would say it. */
  var EVENT_WORDS = {
    goal:          { what: 'Goal',        icon: '<i class="ico ico-football" aria-hidden="true"></i>', cls: 'goal' },
    own_goal:      { what: 'Own Goal',    icon: '<i class="ico ico-football" aria-hidden="true"></i>', cls: 'goal' },
    penalty_goal:  { what: 'Penalty',     icon: '<i class="ico ico-football" aria-hidden="true"></i>', cls: 'goal' },
    penalty_missed:{ what: 'Penalty Missed', icon: '<i class="ico ico-football" aria-hidden="true"></i>', cls: '' },
    yellow_card:   { what: 'Booked',      icon: '<span class="mc-card mc-card--y" aria-hidden="true"></span>', cls: 'yellow' },
    red_card:      { what: 'Sent Off',    icon: '<span class="mc-card mc-card--r" aria-hidden="true"></span>', cls: 'red' },
    substitution:  { what: 'Substitution', icon: '<i class="ico ico-arrow-up" aria-hidden="true"></i>', cls: '' },
    half_time:     { what: 'Half Time',   icon: '', cls: '' },
    second_half:   { what: 'Second Half', icon: '', cls: '' },
    full_time:     { what: 'Full Time',   icon: '', cls: '' },
    info:          { what: '',            icon: '', cls: '' },
  };

  function minuteLabel(e) {
    if (e.minute == null) return '';
    return e.minute + (e.stoppage_minute ? '+' + e.stoppage_minute : '') + "'";
  }

  function renderEvent(e, row) {
    var w = EVENT_WORDS[e.event_type] || EVENT_WORDS.info;
    if (!w.what) return '';
    var usSide = row.is_home !== false ? 'home' : 'away';
    var ours = e.side === usSide;
    var teamName = e.team || '';
    // A substitution is two people; showing only the one coming on tells half
    // the story. A half-time/full-time marker is nobody, so it gets no name.
    var who = esc(e.player || '');
    var what = esc(w.what);
    if (e.event_type === 'substitution' && e.assistant) {
      what = 'On for ' + esc(e.assistant);
    }
    if (!e.player) { who = what; what = ''; }
    return '<li class="mc-ev mc-ev--' + (ours ? 'us' : 'them') + (w.cls ? ' mc-ev--' + w.cls : '') + '">' +
      '<span class="mc-ev__min">' + esc(minuteLabel(e)) + '</span>' +
      '<span class="mc-ev__icon">' + w.icon + '</span>' +
      '<span><span class="mc-ev__who">' + who + '</span>' +
        (what ? '<span class="mc-ev__what">' + what + '</span>' : '') + '</span>' +
      '<span class="mc-ev__team">' + esc(teamName) + '</span>' +
    '</li>';
  }

  function statusBand(row) {
    var a = RLFCLive.assess(row);
    var cls = 'mc-status--off', dot = '';
    if (a.state === 'live' || a.state === 'manual') { cls = 'mc-status--live'; dot = '<span class="mc-dot"></span>'; }
    else if (a.state === 'delayed_updates' || a.state === 'delayed') { cls = 'mc-status--delayed'; dot = '<span class="mc-dot"></span>'; }
    else if (a.state === 'full_time') cls = 'mc-status--ft';

    var note = '';
    if (a.note) note = a.note;
    else if (row.last_synced_at) note = 'Updated ' + RLFCLive.ago(Date.now() - Date.parse(row.last_synced_at));

    return '<div class="mc-status ' + cls + '" role="status">' + dot +
      '<span>' + esc(a.label || 'Match Centre') + '</span>' +
      (note ? '<span class="mc-status__note">' + esc(note) + '</span>' : '') +
    '</div>';
  }

  function board(row) {
    var home = { name: row.home_team || 'Home', score: row.home_score };
    var away = { name: row.away_team || 'Away', score: row.away_score };
    var weAreHome = row.is_home !== false;
    var started = row.home_score != null && row.away_score != null;
    var a = RLFCLive.assess(row);
    var clock = RLFCLive.clockLabel(row);

    function team(t, isUs) {
      return '<div class="mc-team' + (isUs ? ' mc-team--us' : '') + '">' +
        crestHTML(t.name) +
        '<span class="mc-name">' + esc(t.name) + '</span>' +
        (isUs ? '<span class="mc-ha">' + (weAreHome ? 'Home' : 'Away') + '</span>' : '') +
      '</div>';
    }

    var mid = started
      ? '<span class="mc-score">' + esc(home.score) + '<span aria-hidden="true"> – </span>' + esc(away.score) + '</span>'
      : '<span class="mc-vs">VS</span>';

    var meta = [];
    if (row.venue) meta.push(row.venue);
    if (row.referee) meta.push('Referee: ' + row.referee);

    return '<section class="mc-board">' +
      (row.competition ? '<div class="mc-comp">' + esc(row.competition) + '</div>' : '') +
      '<div class="mc-lock">' +
        team(home, weAreHome) +
        '<div class="mc-mid">' + mid + '</div>' +
        team(away, !weAreHome) +
      '</div>' +
      (clock ? '<div class="mc-clock' + (a.state === 'live' ? ' mc-clock--live' : '') + '">' + esc(clock) + '</div>' : '') +
      (meta.length ? '<div class="mc-meta">' + esc(meta.join(' · ')) + '</div>' : '') +
    '</section>';
  }

  function renderMatch(row, evs) {
    var shown = (evs || []).map(function (e) { return renderEvent(e, row); }).filter(Boolean);
    return statusBand(row) + board(row) +
      (shown.length
        ? '<h2 class="mc-h">Match Events</h2><ul class="mc-events">' + shown.join('') + '</ul>'
        : '') +
      '<p class="mc-credit">' + esc((window.RLFC_LIVE && window.RLFC_LIVE.attribution) || '') + '</p>';
  }

  /* Two DIFFERENT empty states, because they mean different things and only one
     of them is entitled to make a claim about the football.

     When live coverage is switched off this page has checked nothing, so it must
     not say "no match in progress" — it said exactly that during a real game once,
     which is how this distinction came to exist. */
  function empty(reason) {
    if (reason === 'off') {
      return '<div class="mc-empty">' +
        '<div class="mc-empty__h">Live coverage is coming soon</div>' +
        '<p class="mc-empty__p">Automatic live scores are being switched on. Until then, follow the score on the fixtures page.</p>' +
        '<a class="btn btn-primary" href="fixtures.html">Fixtures &amp; Results</a>' +
      '</div>';
    }
    return '<div class="mc-empty">' +
      '<div class="mc-empty__h">No match in progress</div>' +
      '<p class="mc-empty__p">When The Lane are playing, the live score, the clock and every goal appear here automatically.</p>' +
      '<a class="btn btn-primary" href="fixtures.html">Fixtures &amp; Results</a>' +
    '</div>';
  }

  function paint(rows) {
    if (!RLFCLive.enabled()) { root.innerHTML = empty('off'); return; }
    var row = RLFCLive.primary(rows);
    // NO rows at all means the sync has never written anything — which is not
    // the same as "there is no match today", and we must not claim it is. Only
    // once we can see the sync has been working may this page say there is no
    // match on. Getting this wrong once put "NO MATCH IN PROGRESS" on the site
    // while the team was playing.
    if (!row) { root.innerHTML = empty(rows && rows.length ? 'none' : 'off'); return; }
    RLFCLive.eventsFor(row.fixture_id).then(function (evs) {
      root.innerHTML = renderMatch(row, evs);
    });
  }

  loadCrests().then(verifyCrests).then(function () {
    if (!RLFCLive.enabled()) { root.innerHTML = empty('off'); return; }
    stop = RLFCLive.subscribe(function (rows, unchangedOnly) {
      if (unchangedOnly) {
        // Only the "updated N ago" line needs to move; repainting the whole
        // board every 15 seconds would fight a supporter trying to read it.
        var row = RLFCLive.primary(rows);
        var band = root.querySelector('.mc-status');
        if (row && band) {
          var tmp = document.createElement('div');
          tmp.innerHTML = statusBand(row);
          band.replaceWith(tmp.firstChild);
        }
        return;
      }
      paint(rows);
    });
  });

  window.addEventListener('beforeunload', function () { if (stop) stop(); });
})();
