/* ─────────────────────────────────────────
   RAYNERS LANE FC — Homepage & Global JS
   ───────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function() {
  loadMatchDay();
  initBgCrossfade();
  liveScoreboard();
  setInterval(liveScoreboard, 12000); // auto-refresh the live score every 12s (real-time feel)
});

// ── LIVE SCOREBOARD ──────────────────────────
// Reads data/matchday.json (set from the admin's score buttons). Shows a red
// live bar at the top of the home page whenever a match is live, and quietly
// refreshes itself every 20s — fans never reload, staff just tap +.
async function liveScoreboard() {
  var bar = document.getElementById('rlfc-livebar');
  if (!bar) return;
  try {
    var m = await readLiveMatch();
    if (!m) { bar.style.display = 'none'; return; }
    var live = m.isLive || new URLSearchParams(location.search).get('live') === '1';
    if (!live) { bar.style.display = 'none'; return; }
    var RLFC = 'Rayners Lane', opp = m.opponent || 'Opposition';
    var homeTeam = m.isHome === false ? opp : RLFC;
    var awayTeam = m.isHome === false ? RLFC : opp;
    var hs = m.homeScore || 0, as = m.awayScore || 0;
    bar.innerHTML =
      '<div class="livebar__in">' +
        '<span class="livebar__badge"><span class="d"></span>Live</span>' +
        '<span class="livebar__teams">' +
          '<span class="livebar__t">' + homeTeam + '</span>' +
          '<span class="livebar__sc">' + hs + '</span>' +
          '<span class="livebar__sc">' + as + '</span>' +
          '<span class="livebar__t">' + awayTeam + '</span>' +
        '</span>' +
        (m.status ? '<span class="livebar__status">' + m.status + '</span>' : '') +
        (m.scorers ? '<span class="livebar__scorers"><i class="ico ico-football"></i> ' + m.scorers + '</span>' : '') +
      '</div>';
    bar.style.display = 'block';
  } catch (e) {}
}

// Real-time score source (Fix A part 2): read the live_match row from Supabase
// (updated instantly by the admin via live-score.js — no rebuild). Falls back to
// data/matchday.json so the bar behaves exactly as before until Supabase is set
// up. Returns the normalised { isLive, isHome, opponent, homeScore, awayScore,
// status, scorers } shape liveScoreboard() expects.
async function readLiveMatch() {
  var sb = window.RLFC_SUPABASE || {};
  if (sb.url && sb.anonKey) {
    try {
      var opt = { headers: { apikey: sb.anonKey } };
      if (window.AbortSignal && AbortSignal.timeout) opt.signal = AbortSignal.timeout(4000);
      var r = await fetch(sb.url + '/rest/v1/live_match?id=eq.1&select=*', opt);
      if (r.ok) {
        var rows = await r.json();
        if (Array.isArray(rows) && rows.length) {
          var x = rows[0];
          return { isLive: !!x.is_live, isHome: x.is_home, opponent: x.opponent, homeScore: x.home_score, awayScore: x.away_score, status: x.status, scorers: x.scorers };
        }
      }
    } catch (e) {}
  }
  try { return await (await fetch('data/matchday.json?t=' + Date.now())).json(); } catch (e) { return null; }
}

async function loadMatchDay() {
  var matchday = null;
  try {
    var r = await fetch('data/matchday.json?t=' + Date.now());
    if (r.ok) matchday = await r.json();
  } catch(e) {}

  var defaults = {
    homeTeam:'Rayners Lane FC',
    awayTeam:'TBC — Fixtures Releasing Soon',
    date:'2026-08-01T15:00:00',
    competition:'Combined Counties Premier Div North',
    venue:'Tithe Farm Social Club',
    isHome:true,
    isLive:false,
    homeScore:0,
    awayScore:0,
  };

  var m = Object.assign({}, defaults, matchday || {});

  // AUTO-FIXTURES: the live feed (TheSportsDB) sets the next match + countdown
  // automatically the moment the league publishes fixtures. A live match the
  // staff have toggled always takes priority; manual matchday.json is fallback.
  if (!m.isLive) {
    var usedLocal = false;
    // PRIMARY: the club's own season schedule (admin → Fixtures).
    try {
      var lr = await fetch('data/fixtures.json?t=' + Date.now());
      if (lr.ok) {
        var ld = await lr.json();
        var list = (ld && ld.fixtures) || [];
        if (list.length) {
          var shaped = rlfcFixturesShape(list);
          window._rlfcFixtures = shaped;
          usedLocal = true;
          if (shaped.next && shaped.next.opponent) {
            m.opponent = shaped.next.opponent;
            m.isHome = shaped.next.isHome;
            m.competition = shaped.next.competition || m.competition;
            m.date = (shaped.next.date || '') + 'T' + (shaped.next.kickoff || '15:00') + ':00';
            if (shaped.next.venue) m.venue = shaped.next.venue;
            m.oppCrest = shaped.next.oppCrest || '';
          }
        }
      }
    } catch (e) {}
    // FALLBACK: live feed (TheSportsDB) while the club schedule is still empty.
    if (!usedLocal) {
      try {
        var fx = await (await fetch('/.netlify/functions/fetch-fixtures')).json();
        window._rlfcFixtures = fx; // share with the results renderer
        if (fx && fx.next && fx.next.opponent && fx.next.opponent !== 'TBC') {
          m.opponent = fx.next.opponent;
          m.isHome = fx.next.isHome;
          m.competition = fx.next.competition || m.competition;
          m.date = (fx.next.date || '') + 'T' + (fx.next.kickoff || '15:00') + ':00';
        }
      } catch (e) {}
    }
  }

  // The admin panel saves `opponent` + `isHome`. Build the fixture from those
  // (home team is always listed first) so the saved match shows on the site.
  var RLFC = 'Rayners Lane FC';
  if (m.opponent) {
    if (m.isHome === false) { m.homeTeam = m.opponent; m.awayTeam = RLFC; }
    else                    { m.homeTeam = RLFC;       m.awayTeam = m.opponent; }
  }

  // (Fix A) The live scoreboard is driven solely by liveScoreboard() →
  // #rlfc-livebar. The old block here updated #live-bar / #home-score /
  // #away-score / #live-opp — none of which exist in index.html — so it was dead
  // code. Removed to leave ONE live-bar implementation.

  // Next match badge
  var teamsEl = document.getElementById('match-teams');
  var metaEl  = document.getElementById('match-meta');
  if (teamsEl) teamsEl.textContent = m.homeTeam + ' vs ' + m.awayTeam;
  if (metaEl)  metaEl.textContent  = m.competition + ' · ' + m.venue;

  // Opponent crest next to the fixture. Falls back to their initials rather
  // than a broken image — some opponents haven't supplied artwork.
  var crestEl = document.getElementById('match-crest');
  if (crestEl) {
    crestEl.innerHTML = '';
    if (m.opponent && m.opponent !== 'TBC') {
      if (m.oppCrest) {
        var im = document.createElement('img');
        im.src = m.oppCrest;
        im.alt = m.opponent;
        im.className = 'hero__badge-crest';
        im.addEventListener('error', function () { crestEl.innerHTML = ''; crestEl.appendChild(crestInitials(m.opponent)); });
        crestEl.appendChild(im);
      } else {
        crestEl.appendChild(crestInitials(m.opponent));
      }
    }
  }

  // Countdown
  startCountdown(m.date);

  // Live results from the feed (TheSportsDB)
  renderHomeFixtures(window._rlfcFixtures);

  // SEO / AEO: emit the next fixture as schema.org SportsEvent so search + AI
  // answer engines can answer "Rayners Lane next match".
  if (m.opponent && m.opponent !== 'TBC' && m.date) {
    try {
      var ev = {
        '@context': 'https://schema.org', '@type': 'SportsEvent',
        'name': m.homeTeam + ' vs ' + m.awayTeam,
        'startDate': m.date,
        'eventStatus': 'https://schema.org/EventScheduled',
        'sport': 'Association football',
        'homeTeam': { '@type': 'SportsTeam', 'name': m.homeTeam },
        'awayTeam': { '@type': 'SportsTeam', 'name': m.awayTeam },
        'location': { '@type': 'Place', 'name': m.venue || 'Tithe Farm Social Club' },
        'organizer': { '@type': 'SportsOrganization', 'name': m.competition }
      };
      var tag = document.getElementById('next-event-schema');
      if (!tag) { tag = document.createElement('script'); tag.type = 'application/ld+json'; tag.id = 'next-event-schema'; document.head.appendChild(tag); }
      tag.textContent = JSON.stringify(ev);
    } catch (e) {}
  }
}

// Render the next fixture + recent results from the live feed into the home
// fixtures block. Falls back to the static "coming soon" markup if no data.
function renderHomeFixtures(fx) {
  var el = document.getElementById('home-fixtures');
  if (!el || !fx) return;
  var rows = '';
  if (fx.next && fx.next.opponent && fx.next.opponent !== 'TBC') {
    var d = fx.next.date ? new Date(fx.next.date + 'T' + (fx.next.kickoff || '15:00') + ':00') : null;
    var ds = d ? d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
    rows += '<div class="fixture-row" style="grid-template-columns:1fr auto;align-items:center">' +
      '<div><div style="font-family:var(--font-c);font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--yellow);margin-bottom:4px">Next Match</div>' +
      '<div style="font-family:var(--font-d);font-size:22px;letter-spacing:.04em;color:#fff">Rayners Lane ' + (fx.next.isHome ? 'vs ' : '@ ') + fix_esc(fx.next.opponent) + '</div></div>' +
      '<div style="font-family:var(--font-c);font-size:13px;color:var(--grey);text-align:right">' + ds + '<br>' + (fx.next.kickoff || '15:00') + '</div></div>';
  }
  if (fx.results && fx.results.length) {
    rows += '<div style="font-family:var(--font-c);font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--grey);padding:14px 0 6px">Recent Results</div>';
    rows += fx.results.slice(0, 4).map(function (r) {
      var win = r.us > r.them, draw = r.us === r.them;
      var col = win ? '#22C55E' : (draw ? '#FBBF24' : '#EF4444');
      var rd = r.date ? new Date((String(r.date).length === 10 ? r.date + 'T12:00:00' : r.date)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
      return '<div class="fixture-row" style="grid-template-columns:1fr auto;align-items:center">' +
        '<div style="font-family:var(--font-c);font-size:14px;color:#fff;letter-spacing:.03em">Rayners Lane ' + (r.isHome ? 'vs ' : '@ ') + fix_esc(r.opponent) +
        ' <span style="color:var(--grey);font-size:11px">&middot; ' + rd + '</span></div>' +
        '<div style="font-family:var(--font-d);font-size:20px;color:' + col + ';letter-spacing:.06em">' + r.us + '–' + r.them + '</div></div>';
    }).join('');
    rows += '<div style="font-family:var(--font-c);font-size:10px;color:var(--grey);letter-spacing:.04em;padding-top:8px">' + (fx.source === 'club' ? 'Official club results' : 'Results via TheSportsDB') + '</div>';
  }
  if (rows) el.innerHTML = rows;
}
function fix_esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Shape the club's season schedule (data/fixtures.json) into the { next, results }
// form the home + fixtures renderers already expect.
function rlfcFixturesShape(list) {
  var now = Date.now();
  function dt(f) { return new Date(f.date + 'T' + (f.kickoff || '15:00') + ':00').getTime(); }
  var sorted = list.slice().sort(function (a, b) { return dt(a) - dt(b); });
  var played = sorted.filter(function (f) { return f.us != null && f.them != null; });
  var upcoming = sorted.filter(function (f) { return !(f.us != null && f.them != null); });
  var next = upcoming.filter(function (f) { return dt(f) > now - 6 * 3600000; })[0] || upcoming[0] || null;
  return {
    source: 'club',
    next: next ? { opponent: next.opponent, date: next.date, kickoff: next.kickoff, isHome: next.isHome, competition: next.competition, venue: next.venue, oppCrest: next.oppCrest || '' } : null,
    results: played.slice().reverse().map(function (r) { return { opponent: r.opponent, date: r.date, isHome: r.isHome, us: r.us, them: r.them }; })
  };
}

// Their initials in a circle — the same fallback the fixtures page uses, so a
// club with no crest still reads as a club rather than a broken image icon.
function crestInitials(name) {
  var ini = String(name || '').replace(/\b(fc|afc|utd|united|town|city)\b/gi, '')
    .trim().split(/\s+/).map(function (w) { return w[0] || ''; }).join('').slice(0, 3).toUpperCase();
  var d = document.createElement('div');
  d.className = 'hero__badge-crest hero__badge-crest--ini';
  d.textContent = ini || '?';
  return d;
}

function startCountdown(dateStr) {
  var el = document.getElementById('countdown');
  if (!el) return;
  // Validate date
  if (!dateStr) {
    el.innerHTML = '<span style="font-family:var(--font-c);font-size:12px;color:var(--grey);letter-spacing:.08em">Fixtures releasing soon</span>';
    return;
  }
  var target = new Date(dateStr);
  if (isNaN(target.getTime())) {
    el.innerHTML = '<span style="font-family:var(--font-c);font-size:12px;color:var(--grey);letter-spacing:.08em">Fixtures releasing soon</span>';
    return;
  }
  function tick() {
    var diff = target - new Date();
    if (diff <= 0) {
      el.innerHTML = '<span style="font-family:var(--font-d);color:var(--yellow);font-size:20px;letter-spacing:.04em">KICK OFF</span>';
      return;
    }
    var d = Math.floor(diff/86400000);
    var h = Math.floor((diff%86400000)/3600000);
    var m = Math.floor((diff%3600000)/60000);
    var s = Math.floor((diff%60000)/1000);
    el.style.display = 'flex';
    el.innerHTML = [d,h,m,s].map(function(v,i) {
      var labels = ['DAYS','HRS','MIN','SEC'];
      return '<div style="text-align:center;margin-right:12px">' +
        '<div style="font-family:var(--font-d);font-size:clamp(24px,4vw,40px);letter-spacing:.04em;color:var(--yellow);line-height:1">' + String(v).padStart(2,'0') + '</div>' +
        '<div style="font-family:var(--font-c);font-size:9px;font-weight:700;letter-spacing:.14em;color:var(--grey);margin-top:2px">' + labels[i] + '</div>' +
        '</div>';
    }).join('');
  }
  tick();
  setInterval(tick, 1000);
}

function initBgCrossfade() {
  var imgs = document.querySelectorAll('.bg-img');
  if (!imgs.length) return;
  var cur = 0;
  imgs[0].classList.add('visible');
  setInterval(function() {
    imgs[cur].classList.remove('visible');
    cur = (cur + 1) % imgs.length;
    imgs[cur].classList.add('visible');
  }, 7000);
}
