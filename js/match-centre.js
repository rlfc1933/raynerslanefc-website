/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — Match Centre

   ONE permanent page per fixture. The same URL carries a match from "not played
   yet" through kick-off, the ninety minutes and full time, and then stays as
   the club's permanent record of it:

     match-centre.html?id=fwp-578225

   Upcoming, live and finished are three STATES of one page, not three pages.
   With no id it shows whatever is happening now, or the most recent result.

   Everything comes from the club's own registry (js/football-data.js). No
   provider markup ever reaches this DOM — the adapter parsed it away
   server-side and every word below is ours. Crests come from data/crests.json,
   the club's own artwork.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var root = document.getElementById('match-centre');
  if (!root) return;

  var crests = {}, verified = {}, poll = null, cdTimer = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/\bf\.?c\.?\b/g, '').replace(/\butd\b/g, 'united')
      .replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  }
  function qs(k) {
    try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; }
  }

  /* ── crests verified once, so rendering has nothing left to race ───────── */
  function loadCrests() {
    return fetch('data/crests.json?t=' + Date.now())
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { ((d && d.crests) || []).forEach(function (c) { crests[norm(c.name)] = c.file; }); })
      .catch(function () {});
  }
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
  function initials(name) {
    return String(name || '').replace(/\b(fc|afc|utd|united|town|city)\b/gi, '')
      .trim().split(/\s+/).map(function (w) { return w[0] || ''; }).join('').slice(0, 3).toUpperCase() || '?';
  }
  function crestHTML(name) {
    var file = crests[norm(name)];
    if (!file || !verified[file]) return '<span class="mc-crest mc-crest--ini">' + esc(initials(name)) + '</span>';
    return '<img class="mc-crest" src="' + esc(file) + '" alt="' + esc(name) + ' crest">';
  }

  /* ── our words, never the provider's ───────────────────────────────────── */
  var EVENT_WORDS = {
    goal:           { what: 'Goal',           icon: '<i class="ico ico-football" aria-hidden="true"></i>', cls: 'goal' },
    own_goal:       { what: 'Own Goal',       icon: '<i class="ico ico-football" aria-hidden="true"></i>', cls: 'goal' },
    penalty_goal:   { what: 'Penalty',        icon: '<i class="ico ico-football" aria-hidden="true"></i>', cls: 'goal' },
    penalty_missed: { what: 'Penalty Missed', icon: '<i class="ico ico-football" aria-hidden="true"></i>', cls: '' },
    yellow_card:    { what: 'Booked',         icon: '<span class="mc-card mc-card--y" aria-hidden="true"></span>', cls: 'yellow' },
    red_card:       { what: 'Sent Off',       icon: '<span class="mc-card mc-card--r" aria-hidden="true"></span>', cls: 'red' },
    substitution:   { what: 'Substitution',   icon: '<i class="ico ico-arrow-up" aria-hidden="true"></i>', cls: '' },
    half_time:      { what: 'Half Time',      icon: '', cls: '' },
    second_half:    { what: 'Second Half',    icon: '', cls: '' },
    full_time:      { what: 'Full Time',      icon: '', cls: '' },
    info:           { what: '',               icon: '', cls: '' },
  };
  var PERIOD = {
    first_half: 'First Half', half_time: 'Half Time', second_half: 'Second Half',
    extra_time: 'Extra Time', penalties: 'Penalties', full_time: 'Full Time',
    in_play: 'In Play', postponed: 'Postponed', cancelled: 'Cancelled',
    abandoned: 'Abandoned', delayed: 'Delayed',
  };

  function ago(ms) {
    if (!isFinite(ms) || ms < 0) return '';
    var s = Math.round(ms / 1000);
    if (s < 10) return 'just now';
    if (s < 60) return s + ' seconds ago';
    var m = Math.round(s / 60);
    if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
    var h = Math.round(m / 60);
    return h + (h === 1 ? ' hour ago' : ' hours ago');
  }
  function clubTime(iso) {
    if (!iso || !window.MatchTime) return '';
    var ms = Date.parse(iso);
    return isFinite(ms) ? MatchTime.formatKickoffClub(ms) : '';
  }
  function clubDate(iso) {
    if (!iso || !window.MatchTime) return '';
    var ms = Date.parse(iso);
    return isFinite(ms) ? MatchTime.formatDateClub(ms) : '';
  }

  /* ── the single decision about what this page is showing ───────────────── */
  function temporal(f) {
    var now = Date.now();
    var ko = f.kickoffAt ? Date.parse(f.kickoffAt) : NaN;
    if (f.status === 'postponed' || f.status === 'cancelled' || f.status === 'abandoned') {
      return { state: f.status, label: PERIOD[f.status] || f.status };
    }
    if (f.isFinal || f.period === 'full_time') return { state: 'full_time', label: 'Full Time' };
    if (f.isLive) {
      var age = f.lastSyncedAt ? now - Date.parse(f.lastSyncedAt) : Infinity;
      if (age > 180000) return { state: 'delayed', label: 'Updates delayed', note: 'Waiting for the latest from the ground' };
      return { state: 'live', label: 'Live' };
    }
    // Kicked off but nothing reported. Say that, rather than inventing a match
    // or leaving a countdown running past zero.
    if (isFinite(ko) && now >= ko) return { state: 'awaiting', label: 'Awaiting live update' };
    return { state: 'upcoming', label: 'Upcoming' };
  }

  function statusBand(f, t) {
    var cls = 'mc-status--off', dot = '';
    if (t.state === 'live') { cls = 'mc-status--live'; dot = '<span class="mc-dot"></span>'; }
    else if (t.state === 'delayed' || t.state === 'awaiting') { cls = 'mc-status--delayed'; dot = '<span class="mc-dot"></span>'; }
    else if (t.state === 'full_time') cls = 'mc-status--ft';

    var note = t.note || '';
    if (!note && f.lastSyncedAt && (t.state === 'live' || t.state === 'full_time')) {
      note = 'Updated ' + ago(Date.now() - Date.parse(f.lastSyncedAt));
    }
    if (!note && t.state === 'upcoming' && f.kickoffAt) {
      note = clubDate(f.kickoffAt) + ' · ' + clubTime(f.kickoffAt) + ' UK';
    }
    return '<div class="mc-status ' + cls + '" role="status">' + dot +
      '<span>' + esc(t.label) + '</span>' +
      (note ? '<span class="mc-status__note">' + esc(note) + '</span>' : '') + '</div>';
  }

  function board(f, t) {
    var started = f.homeScore != null && f.awayScore != null;
    var clock = '';
    if (t.state === 'live') {
      clock = PERIOD[f.period] || '';
      if (f.matchMinute != null) {
        clock += (clock ? ' · ' : '') + f.matchMinute + (f.stoppageMinute ? '+' + f.stoppageMinute : '') + "'";
      }
    } else if (t.state === 'full_time') clock = 'Full Time';

    function team(name, isUs) {
      return '<div class="mc-team' + (isUs ? ' mc-team--us' : '') + '">' +
        crestHTML(name) + '<span class="mc-name">' + esc(name || '') + '</span>' +
        (isUs ? '<span class="mc-ha">' + (f.isHome ? 'Home' : 'Away') + '</span>' : '') + '</div>';
    }
    var mid = started
      ? '<span class="mc-score">' + esc(f.homeScore) + '<span aria-hidden="true"> – </span>' + esc(f.awayScore) + '</span>'
      : '<span class="mc-vs">VS</span>';

    var meta = [];
    if (t.state === 'upcoming' && f.kickoffAt) meta.push('Kick-off ' + clubTime(f.kickoffAt) + ' UK time');
    if (f.venue) meta.push(f.venue);
    if (f.referee) meta.push('Referee: ' + f.referee);

    return '<section class="mc-board">' +
      (f.competition ? '<div class="mc-comp">' + esc(f.competition) + '</div>' : '') +
      '<div class="mc-lock">' + team(f.homeTeam, f.isHome) +
        '<div class="mc-mid">' + mid + '</div>' + team(f.awayTeam, !f.isHome) + '</div>' +
      (clock ? '<div class="mc-clock' + (t.state === 'live' ? ' mc-clock--live' : '') + '">' + esc(clock) + '</div>' : '') +
      (t.state === 'upcoming' ? '<div class="mc-countdown" id="mc-countdown"></div>' : '') +
      (meta.length ? '<div class="mc-meta">' + esc(meta.join(' · ')) + '</div>' : '') +
    '</section>';
  }

  function renderEvent(e, f) {
    var w = EVENT_WORDS[e.type] || EVENT_WORDS.info;
    if (!w.what) return '';
    var usSide = f.isHome ? 'home' : 'away';
    var ours = e.side === usSide;
    var who = esc(e.player || ''), what = esc(w.what);
    if (e.type === 'substitution' && e.assistant) what = 'On for ' + esc(e.assistant);
    if (!e.player) { who = what; what = ''; }
    var min = e.minute == null ? '' : e.minute + (e.stoppage ? '+' + e.stoppage : '') + "'";
    return '<li class="mc-ev mc-ev--' + (ours ? 'us' : 'them') + (w.cls ? ' mc-ev--' + w.cls : '') + '">' +
      '<span class="mc-ev__min">' + esc(min) + '</span>' +
      '<span class="mc-ev__icon">' + w.icon + '</span>' +
      '<span><span class="mc-ev__who">' + who + '</span>' +
        (what ? '<span class="mc-ev__what">' + what + '</span>' : '') + '</span>' +
      '<span class="mc-ev__team">' + esc(e.team || '') + '</span></li>';
  }

  function lineupSide(side, name) {
    if (!side || !side.players || !side.players.length) return '';
    function row(p) {
      return '<li class="mc-xi__row">' +
        '<span class="mc-xi__no">' + esc(p.number || '') + '</span>' +
        '<span>' + esc(p.name) + (p.isCaptain ? ' <span class="mc-xi__mark mc-xi__mark--c">(C)</span>' : '') + '</span>' +
        (p.exitedMinute != null ? '<span class="mc-xi__mark">↓ ' + p.exitedMinute + "'</span>" : '') +
        (p.enteredMinute != null ? '<span class="mc-xi__mark">↑ ' + p.enteredMinute + "'</span>" : '') +
      '</li>';
    }
    var used = (side.substitutes || []).filter(function (p) { return p.role === 'substitute'; });
    return '<div class="mc-xi">' +
      '<div class="mc-xi__h">' + esc(name) + '</div>' +
      '<ul>' + side.starters.map(row).join('') + '</ul>' +
      (used.length ? '<div class="mc-xi__h" style="margin-top:14px">Substitutes used</div><ul>' +
        used.map(row).join('') + '</ul>' : '') + '</div>';
  }

  function navigation(f) {
    var l = f.previous
      ? '<a href="match-centre.html?id=' + encodeURIComponent(f.previous.id) + '">← ' + esc(f.previous.opponent || 'Previous') + '</a>'
      : '<span></span>';
    var r = f.next
      ? '<a href="match-centre.html?id=' + encodeURIComponent(f.next.id) + '">' + esc(f.next.opponent || 'Next') + ' →</a>'
      : '<span></span>';
    return '<nav class="mc-nav" aria-label="Fixture navigation">' + l +
      '<a href="fixtures.html">All fixtures</a>' + r + '</nav>';
  }

  /* The programme belongs to home fixtures, and only once it is published.
     Gate 6 builds the programme; this is its permanent home on the match page.
     Deliberately no button before publication — a control that leads nowhere is
     worse than a sentence explaining why. */
  function programmeBlock(f, t) {
    if (!f.isHome || !f.programmeEligible) return '';
    if (f.programmePublished) {
      return '<div class="mc-prog"><a class="cn__btn cn__btn--y" href="programme.html?id=' +
        encodeURIComponent(f.id) + '">' +
        (t.state === 'full_time' ? 'Read the matchday programme' : 'Read today’s programme') + '</a></div>';
    }
    if (t.state === 'upcoming' || t.state === 'awaiting') {
      // "today's" is only true ON matchday. Said days ahead it reads as though
      // the programme is late rather than simply not due yet.
      var ko = f.kickoffAt ? Date.parse(f.kickoffAt) : NaN;
      var isToday = false;
      if (isFinite(ko)) {
        var day = function (ms) {
          try {
            var p = {};
            new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
              .formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
            return p.year + '-' + p.month + '-' + p.day;
          } catch (e) { return null; }
        };
        isToday = day(Date.now()) === day(ko);
      }
      return '<p class="mc-prog__wait">' + (isToday
        ? 'Digital programme available once today’s official teams are confirmed.'
        : 'A digital matchday programme will be available here once the official teams are confirmed.') +
        '</p>';
    }
    return '';
  }

  function countdown(f) {
    if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
    if (!window.MatchTime || !f.kickoffAt) return;
    var target = Date.parse(f.kickoffAt);
    function tick() {
      var el = document.getElementById('mc-countdown');
      if (!el) { clearInterval(cdTimer); return; }
      var cd = MatchTime.formatCountdown(target, Date.now());
      if (!cd) { el.innerHTML = '<span class="mc-ko">KICK OFF</span>'; clearInterval(cdTimer); return; }
      el.innerHTML = [[cd.days, 'Days'], [cd.hours, 'Hrs'], [cd.minutes, 'Min'], [cd.seconds, 'Sec']]
        .map(function (p) {
          return '<div class="mc-cd-unit"><div class="mc-cd-num">' + String(p[0]).padStart(2, '0') +
            '</div><div class="mc-cd-lbl">' + p[1] + '</div></div>';
        }).join('');
    }
    tick();
    cdTimer = setInterval(tick, 1000);
  }

  function render(f) {
    var t = temporal(f);
    var events = (f.events || []).map(function (e) { return renderEvent(e, f); }).filter(Boolean);
    var lu = f.lineups || {};
    var lineups = (lu.home || lu.away)
      ? '<h2 class="mc-h">Line-ups</h2><div class="mc-lineups">' +
        lineupSide(lu.home, f.homeTeam) + lineupSide(lu.away, f.awayTeam) + '</div>' : '';

    root.innerHTML =
      statusBand(f, t) + board(f, t) + programmeBlock(f, t) +
      (events.length ? '<h2 class="mc-h">Match Events</h2><ul class="mc-events">' + events.join('') + '</ul>' : '') +
      lineups + navigation(f) +
      '<p class="mc-credit">' + esc((window.RLFC_LIVE && window.RLFC_LIVE.attribution) || '') + '</p>';

    if (t.state === 'upcoming') countdown(f);
    if (f.homeTeam && f.awayTeam) {
      document.title = f.homeTeam + ' v ' + f.awayTeam + ' | Match Centre | Rayners Lane FC';
    }
    return t;
  }

  function empty(msg, help) {
    root.innerHTML = '<div class="mc-empty">' +
      '<div class="mc-empty__h">' + esc(msg) + '</div>' +
      '<p class="mc-empty__p">' + esc(help ||
        'When The Lane are playing, the live score, the clock and every goal appear here automatically.') + '</p>' +
      '<a class="btn btn-primary" href="fixtures.html">Fixtures &amp; Results</a></div>';
  }

  function fetchFixture(id) {
    return fetch('/.netlify/functions/football-data?what=fixture&id=' + encodeURIComponent(id))
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  var lastState = null;
  function load() {
    var id = qs('id');
    if (id) {
      return fetchFixture(id).then(function (d) {
        if (!d || !d.ok) { empty('That match could not be found', 'It may have been rescheduled. The full season is on the fixtures page.'); return; }
        lastState = render(d.fixture);
      });
    }
    if (!window.RLFCFootball) { empty('Match Centre is warming up'); return Promise.resolve(); }
    // No id: whatever is happening now, else the most recent result, else next.
    return window.RLFCFootball.summary().then(function (s) {
      if (!s) { empty('Match information is temporarily unavailable'); return; }
      var pick = s.current || s.previous || s.next;
      if (!pick) { empty('No match to show'); return; }
      return fetchFixture(pick.id).then(function (d) {
        if (!d || !d.ok) { empty('No match to show'); return; }
        lastState = render(d.fixture);
      });
    }).catch(function () { empty('Match information is temporarily unavailable'); });
  }

  loadCrests().then(verifyCrests).then(load).then(function () {
    // Only a live or stalled match needs re-reading. A finished match is
    // finished — repolling it forever is noise.
    poll = setInterval(function () {
      if (lastState && (lastState.state === 'live' || lastState.state === 'delayed' || lastState.state === 'awaiting')) load();
    }, 15000);
  });

  window.addEventListener('beforeunload', function () {
    if (poll) clearInterval(poll);
    if (cdTimer) clearInterval(cdTimer);
  });
})();
