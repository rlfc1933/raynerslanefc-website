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
    // Whole bar links to the Match Centre — the full-detail destination. The
    // old bar was a dead end: it showed a score and offered nowhere to go.
    bar.innerHTML =
      '<a class="livebar__in" href="match-centre.html">' +
        '<span class="livebar__badge"><span class="d"></span>' + (m._stale ? 'Delayed' : 'Live') + '</span>' +
        '<span class="livebar__teams">' +
          '<span class="livebar__t">' + homeTeam + '</span>' +
          '<span class="livebar__sc">' + hs + '</span>' +
          '<span class="livebar__sc">' + as + '</span>' +
          '<span class="livebar__t">' + awayTeam + '</span>' +
        '</span>' +
        (m.status ? '<span class="livebar__status">' + m.status + '</span>' : '') +
        (m.scorers ? '<span class="livebar__scorers"><i class="ico ico-football"></i> ' + m.scorers + '</span>' : '') +
      '</a>';
    bar.className = 'livebar' + (m._stale ? ' livebar--stale' : '');
    bar.style.display = 'block';
  } catch (e) {}
}

// Real-time score source (Fix A part 2): read the live_match row from Supabase
// (updated instantly by the admin via live-score.js — no rebuild). Falls back to
// data/matchday.json so the bar behaves exactly as before until Supabase is set
// up. Returns the normalised { isLive, isHome, opponent, homeScore, awayScore,
// status, scorers } shape liveScoreboard() expects.
// Epoch ms for a wall-clock kick-off in Europe/London (auto BST/GMT) — so a
// game's kick-off is judged in UK time no matter where the viewer is.
// Kept as a name because several callers use it; the maths now lives in ONE
// place (js/match-time.js) so there is no second, slightly different parser.
function _ukEpoch(dateStr, timeStr) {
  return MatchTime.parseLondonKickoff(dateStr, timeStr);
}

// The automatic Football Web Pages feed, mapped onto the shape every existing
// caller already expects. Putting the switch HERE means the homepage live bar
// and the Club Now panel both change source together and can never disagree —
// they are the two surfaces that used to be wired separately.
//
// Returns null when the new source has nothing, so the caller falls through to
// the manual path below. Controlled by js/live-config.js → useV2.
async function readLiveMatchV2() {
  if (!window.RLFCLive || !RLFCLive.enabled()) return null;
  var rows = await RLFCLive.currentMatches();
  var row = RLFCLive.primary(rows);
  if (!row) return null;
  var a = RLFCLive.assess(row);
  var view = RLFCLive.ourView(row);
  // 'live' here means "live AND fresh". A score we can no longer confirm is
  // handed back as not-live rather than sitting under a pulsing red dot.
  var live = (a.state === 'live' || a.state === 'manual');
  var state = live ? 'live'
    : (row.is_final ? 'ft'
      : (row.period === 'postponed' || row.period === 'cancelled' || row.period === 'delayed' || row.period === 'abandoned')
        ? row.period : (a.state === 'delayed_updates' ? 'live' : 'off'));
  return {
    isLive: live, _state: state, _v2: true, _row: row,
    isHome: row.is_home !== false,
    opponent: view.opponent || '',
    homeScore: row.home_score || 0,
    awayScore: row.away_score || 0,
    // The club's own clock, e.g. "Second Half · 67'" — this is what the manual
    // system could never show, because nothing was measuring it.
    status: RLFCLive.clockLabel(row) || (live ? 'Live' : ''),
    scorers: '',
    stateReason: a.state === 'delayed_updates' ? (a.note || 'Updates delayed') : '',
    date: row.scheduled_kickoff ? String(row.scheduled_kickoff).slice(0, 10) : '',
    kickoff: '',
    _stale: a.state === 'delayed_updates',
  };
}

async function readLiveMatch() {
  try {
    var v2 = await readLiveMatchV2();
    if (v2) return v2;
  } catch (e) { /* fall through to the manual path — never break the scoreboard */ }
  var sb = window.RLFC_SUPABASE || {};
  var md = null, row = null;
  try { md = await (await fetch('data/matchday.json?t=' + Date.now())).json(); } catch (e) {}
  md = md || {};
  if (sb.url && sb.anonKey) {
    try {
      var opt = { headers: { apikey: sb.anonKey } };
      if (window.AbortSignal && AbortSignal.timeout) opt.signal = AbortSignal.timeout(4000);
      var r = await fetch(sb.url + '/rest/v1/live_match?id=eq.1&select=*', opt);
      if (r.ok) { var rows = await r.json(); if (Array.isArray(rows) && rows.length) row = rows[0]; }
    } catch (e) {}
  }
  // Effective state (data/matchday.json is the authority for the STATE).
  var st = md.state || (md.isLive ? 'live' : (/full|ft|final/i.test(md.status || '') ? 'ft' : 'off'));
  var ko = _ukEpoch(md.date, md.kickoff);
  if (st === 'armed' && !isNaN(ko) && Date.now() >= ko && Date.now() < ko + 150 * 60000) st = 'live';
  // Supabase is_live vs matchday state can disagree two opposite ways:
  //   • instant go-live: Supabase just went live, matchday.json lags → show live
  //   • take-down: staff just set state 'off'/postponed, Supabase row is stale → hide
  // Resolve by RECENCY — whichever staff touched most recently wins. This is what
  // makes "Take Scoreboard Down" actually remove the bar even if the Supabase row
  // still says is_live.
  if (row && row.is_live) {
    var sbTime = row.updated_at ? Date.parse(row.updated_at) : 0;
    var mdTime = md.updatedAt ? Date.parse(md.updatedAt) : 0;
    var mdSaysOff = md.state && md.state !== 'live' && md.state !== 'armed';
    if (st === 'live' || st === 'armed' || !(mdSaysOff && mdTime >= sbTime)) st = 'live';
  }
  var live = (st === 'live');
  // Only trust the Supabase row's SCORE/status while it's actually driving a live
  // game (is_live). A stale row (e.g. a mistaken 'Full Time') must not bleed onto
  // an armed auto-live game — that shows 0-0 · Kick Off from matchday.json.
  var useRow = !!(row && row.is_live);
  // Take home/away + opponent from the SAME source as the score. When Supabase is
  // driving the live game, its is_home/opponent must win — mixing it with a lagging
  // matchday.json inverted the teams (showed the opponent at home with our score).
  return {
    isLive: live, _state: st,
    isHome: useRow ? (row.is_home !== false) : (md.isHome != null ? md.isHome : (row ? row.is_home !== false : true)),
    opponent: useRow ? (row.opponent || md.opponent || '') : (md.opponent || (row ? row.opponent : '')),
    homeScore: useRow ? (row.home_score || 0) : (md.homeScore || 0),
    awayScore: useRow ? (row.away_score || 0) : (md.awayScore || 0),
    status: useRow ? (row.status || 'Kick Off') : (md.status || (live ? 'Kick Off' : '')),
    scorers: useRow ? (row.scorers || '') : (md.scorers || ''),
    stateReason: md.stateReason || '', date: md.date, kickoff: md.kickoff
  };
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

  // Countdown — but ONLY when nothing trustworthy says the match is under way.
  // A live source always outranks the clock: showing "starts in..." (or a stuck
  // "KICK OFF") while the game is being played is the defect this release fixed.
  var _t = MatchTime.temporalState({ date: m.date }, m._row || (m.isLive ? { is_live: true, period: 'in_play' } : null));
  if (_t.showCountdown) {
    startCountdown(m.date);
  } else {
    var _cd = document.getElementById('countdown');
    if (_cd) _cd.style.display = 'none';
  }

  // Live results from the feed (TheSportsDB)
  renderHomeFixtures(window._rlfcFixtures);

  // SEO / AEO: emit the next fixture as schema.org SportsEvent so search + AI
  // answer engines can answer "Rayners Lane next match".
  if (m.opponent && m.opponent !== 'TBC' && m.date) {
    try {
      var ev = {
        '@context': 'https://schema.org', '@type': 'SportsEvent',
        'name': m.homeTeam + ' vs ' + m.awayTeam,
        // Absolute, with an offset. An offset-less startDate is as ambiguous to
        // a search engine as it was to the browser.
        'startDate': (function () {
          var ms = MatchTime.kickoffEpoch({ date: m.date });
          return isFinite(ms) ? new Date(ms).toISOString() : m.date;
        })(),
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
    var koMs = MatchTime.kickoffEpoch(fx.next);
    var ds = isFinite(koMs) ? MatchTime.formatDateClub(koMs) : '';
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
  function dt(f) { return MatchTime.fixtureSortKey(f); }
  var sorted = list.slice().sort(function (a, b) { return dt(a) - dt(b); });
  var played = sorted.filter(function (f) { return f.us != null && f.them != null; });
  var upcoming = sorted.filter(function (f) { return !(f.us != null && f.them != null); });
  // Not-yet-kicked-off, or kicked off within the last 6h (a game in progress is
  // still "next" — it shouldn't vanish from the homepage at 15:01).
  var live = upcoming.filter(function (f) { return dt(f) > now - 6 * 3600000; });
  // Staff can pin a game in admin → Next Match to force it to the front, for
  // when a friendly is arranged late and the date logic would pick another.
  // No pin (the normal case) = soonest wins.
  var next = live.filter(function (f) { return f.pinned; })[0] || live[0] || upcoming[0] || null;
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
  // Was `new Date(dateStr)`. dateStr is "2026-08-01T15:00:00" with no offset,
  // which every browser reads in ITS OWN timezone — the homepage told Los
  // Angeles the match started in seven hours while it was in the second half.
  var targetMs = MatchTime.kickoffEpoch({ date: dateStr });
  var target = new Date(targetMs);
  if (isNaN(targetMs)) {
    el.innerHTML = '<span style="font-family:var(--font-c);font-size:12px;color:var(--grey);letter-spacing:.08em">Fixtures releasing soon</span>';
    return;
  }
  function tick() {
    var diff = targetMs - Date.now();
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
