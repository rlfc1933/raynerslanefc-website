/* ─────────────────────────────────────────
   RAYNERS LANE FC — Homepage & Global JS
   ───────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function() {
  loadMatchDay();
  initBgCrossfade();
  liveScoreboard();
  setInterval(liveScoreboard, 20000); // auto-refresh the live score every 20s
});

// ── LIVE SCOREBOARD ──────────────────────────
// Reads data/matchday.json (set from the admin's score buttons). Shows a red
// live bar at the top of the home page whenever a match is live, and quietly
// refreshes itself every 20s — fans never reload, staff just tap +.
async function liveScoreboard() {
  var bar = document.getElementById('rlfc-livebar');
  if (!bar) return;
  try {
    var m = await (await fetch('data/matchday.json?t=' + Date.now())).json();
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
        (m.scorers ? '<span class="livebar__scorers">&#9917; ' + m.scorers + '</span>' : '') +
      '</div>';
    bar.style.display = 'block';
  } catch (e) {}
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

  // AUTO-FIXTURES: if the Football Web Pages feed is configured, let the real
  // league fixture set the next match + countdown automatically (overrides the
  // manual one). A live match the staff have toggled always takes priority.
  if (!m.isLive) {
    try {
      var fx = await (await fetch('/.netlify/functions/fetch-fixtures')).json();
      if (fx && fx.configured && fx.next && fx.next.opponent) {
        m.opponent = fx.next.opponent;
        m.isHome = fx.next.isHome;
        m.competition = fx.next.competition || m.competition;
        m.date = (fx.next.date || '') + 'T' + (fx.next.kickoff || '15:00') + ':00';
      }
    } catch (e) {}
  }

  // The admin panel saves `opponent` + `isHome`. Build the fixture from those
  // (home team is always listed first) so the saved match shows on the site.
  var RLFC = 'Rayners Lane FC';
  if (m.opponent) {
    if (m.isHome === false) { m.homeTeam = m.opponent; m.awayTeam = RLFC; }
    else                    { m.homeTeam = RLFC;       m.awayTeam = m.opponent; }
  }

  // Live scoreboard
  var liveBar = document.getElementById('live-bar');
  var isLive = m.isLive || new URLSearchParams(window.location.search).get('live')==='1';
  if (liveBar) liveBar.style.display = isLive ? 'flex' : 'none';
  if (isLive) {
    var homeScoreEl = document.getElementById('home-score');
    var awayScoreEl = document.getElementById('away-score');
    var liveOpp     = document.getElementById('live-opp');
    if (homeScoreEl) homeScoreEl.textContent = m.homeScore || 0;
    if (awayScoreEl) awayScoreEl.textContent = m.awayScore || 0;
    if (liveOpp) liveOpp.textContent = m.opponent || 'Opposition';
  }

  // Next match badge
  var teamsEl = document.getElementById('match-teams');
  var metaEl  = document.getElementById('match-meta');
  if (teamsEl) teamsEl.textContent = m.homeTeam + ' vs ' + m.awayTeam;
  if (metaEl)  metaEl.textContent  = m.competition + ' · ' + m.venue;

  // Countdown
  startCountdown(m.date);
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
