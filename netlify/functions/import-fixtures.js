// Rayners Lane FC — one-tap fixture import from Football Web Pages.
//
// FWP publishes the club's official fixtures/results as a free embed (no API
// key). embed.js renders it as a cross-origin iframe in the browser, but the
// embed HTML is also fetchable SERVER-SIDE with the same query params + a
// matching Referer — so this function pulls it, parses the fixture rows and
// returns them normalised to our fixtures.json schema. It does NOT write
// anything: the admin panel previews the result and only the merge-safe
// commitDomain save (which preserves staff-entered scores) writes to GitHub.
//
// SAFETY — never fabricate, never import the wrong season:
//   • Every row's season is read from FWP's own data-href (…/match/2026-2027/…)
//     and must equal EXPECTED_SEASON. A single mismatch fails the whole import
//     (this is exactly the guard that stops the old "2024-25 Isthmian" bug).
//   • Dates come from FWP's data-export attribute (D/M/YYYY) — no year-guessing.
//   • Only SCHEDULE is imported (date, opponent, H/A, competition, kick-off).
//     Scores/scorers are never touched here — staff own those on match day.
//
// Config (Netlify env, all optional):
//   FWP_TEAM_SLUG    default 'rayners-lane'
//   FWP_SEASON       default '2026-2027'  (FWP's YYYY-YYYY format)
//   SITE_ORIGIN      default 'https://raynerslanefc.co.uk'

const TEAM_SLUG = process.env.FWP_TEAM_SLUG || 'rayners-lane';
const EXPECTED_SEASON = process.env.FWP_SEASON || '2026-2027';
const ORIGIN = process.env.SITE_ORIGIN || 'https://raynerslanefc.co.uk';

// Club-name matcher. FWP's spelling won't always match ours ("Punjab Utd FC"
// vs "Punjab United"), so compare on a normalised key rather than raw text.
function normClub(s) {
  return String(s || '').toLowerCase()
    .replace(/\bf\.?c\.?\b/g, '').replace(/\butd\b/g, 'united')
    .replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
}

// The venue table, read from GitHub raw so it's current the moment staff save it
// (the deployed copy lags a rebuild). Falls back to the site, then to {} — a
// failed lookup must leave venue blank, never guess.
async function loadVenues() {
  var urls = [
    'https://raw.githubusercontent.com/rlfc1933/raynerslanefc-website/main/data/venues.json',
    ORIGIN + '/data/venues.json?t=' + Date.now(),
  ];
  for (var i = 0; i < urls.length; i++) {
    try {
      var r = await fetch(urls[i], { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      var j = await r.json();
      var map = {};
      (j.venues || []).forEach(function (v) { if (v && v.club) map[normClub(v.club)] = v; });
      if (Object.keys(map).length) return map;
    } catch (e) { /* try the next source */ }
  }
  return {};
}

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(obj),
  };
}

function strip(h) {
  return String(h).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

// "3pm" / "7.45pm" / "2:00pm" → "15:00" (24h). Returns null if not a time.
function parseKickoff(s) {
  var m = String(s).match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)/i);
  if (!m) return null;
  var h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return String(h).padStart(2, '0') + ':' + (m[2] || '00');
}

// "8/8/2026" (D/M/YYYY) → "2026-08-08". Returns '' if unparseable.
function toISODate(dexp) {
  var p = String(dexp).split('/');
  if (p.length !== 3) return '';
  var d = p[0].padStart(2, '0'), m = p[1].padStart(2, '0'), y = p[2];
  if (!/^\d{4}$/.test(y)) return '';
  return y + '-' + m + '-' + d;
}

exports.handler = async function () {
  var id = '00000000-0000-4000-8000-000000000000';
  var url = 'https://www.footballwebpages.co.uk/embed/' + TEAM_SLUG +
    '/fixtures-results?id=' + id + '&origin=' + encodeURIComponent(ORIGIN) + '&width=0';

  var html;
  try {
    var r = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: {
        'Referer': ORIGIN + '/',
        'User-Agent': 'RaynersLaneFC/1.0 (raynerslanefc.co.uk)',
        'Accept': 'text/html',
      },
    });
    if (!r.ok) return resp(200, { ok: false, error: 'Football Web Pages returned ' + r.status });
    html = await r.text();
  } catch (e) {
    return resp(200, { ok: false, error: 'Could not reach Football Web Pages: ' + e.message });
  }

  // Only match rows for real fixtures — they carry a data-href to the match page.
  var rows = html.match(/<tr[^>]*data-href=[\s\S]*?<\/tr>/g) || [];
  var fixtures = [];
  var seasons = {};

  rows.forEach(function (row) {
    var href = (row.match(/data-href="([^"]+)"/) || [])[1] || '';
    var seg = href.split('/');                       // match/2026-2027/<comp>/<a>/<b>/<id>
    var season = seg[1] || '';
    var fwpId = seg[seg.length - 1] || '';
    if (season) seasons[season] = (seasons[season] || 0) + 1;

    var dexp = (row.match(/class="date"[^>]*data-export="([^"]+)"/) || [])[1] || '';
    var date = toISODate(dexp);

    var venueCell = (row.match(/class="[^"]*venue[^"]*"[^>]*>([^<]*)</) || [])[1] || '';
    var isHome = /^h$/i.test(strip(venueCell));

    var opponent = (row.match(/class="opponent"[^>]*data-export="([^"]+)"/) || [])[1] || '';
    opponent = strip(opponent);

    var competition = strip((row.match(/class="[^"]*competition[^"]*"[^>]*>([\s\S]*?)<\/td>/) || [])[1] || '');
    var koRaw = strip((row.match(/class="ko-score"[^>]*>([\s\S]*?)<\/td>/) || [])[1] || '');
    var kickoff = parseKickoff(koRaw) || '15:00';

    if (!date || !opponent) return; // skip anything we couldn't read cleanly

    fixtures.push({
      fwpId: fwpId, season: season, date: date, kickoff: kickoff,
      opponent: opponent, isHome: isHome, competition: competition,
    });
  });

  // Season validation — the guard that prevents importing the wrong league/year.
  var seenSeasons = Object.keys(seasons);
  var wrong = seenSeasons.filter(function (s) { return s !== EXPECTED_SEASON; });
  if (wrong.length) {
    return resp(200, {
      ok: false,
      error: 'Season mismatch — Football Web Pages returned ' + seenSeasons.join(', ') +
        ' but we expected ' + EXPECTED_SEASON + '. Nothing imported (this guard stops the wrong season being written).',
      seasonsSeen: seenSeasons,
    });
  }
  // Belt-and-braces: every date must be in the expected calendar window.
  var expYear = Number(EXPECTED_SEASON.slice(0, 4));
  var badDate = fixtures.filter(function (f) {
    var y = Number(f.date.slice(0, 4));
    return y < expYear || y > expYear + 1;
  });
  if (badDate.length) {
    return resp(200, { ok: false, error: 'A fixture date fell outside the ' + EXPECTED_SEASON + ' season — nothing imported.' });
  }

  fixtures.sort(function (a, b) { return (a.date + a.kickoff).localeCompare(b.date + b.kickoff); });

  // Auto-attach the ground from the venue table. FWP gives us the opponent, never
  // their ground — so without this every away game imports with venue:"" and the
  // directions buttons are dead. The venue is the HOME club's ground; isHome is a
  // designation, not a location, so we look up the home club by name and take
  // whatever the table says (Broadfields' "home" games are at Tithe Farm).
  // Only VERIFIED entries are attached — an unverified guess is worse than blank.
  var venues = await loadVenues();
  var needGround = [];
  fixtures.forEach(function (f) {
    var homeClub = f.isHome ? 'Rayners Lane' : f.opponent;
    var v = venues[normClub(homeClub)];
    if (v && v.verified && v.ground) { f.venue = v.ground; f.venueClub = v.club; }
    else { f.venue = ''; needGround.push(f.opponent); }
  });

  return resp(200, {
    ok: true,
    season: EXPECTED_SEASON,
    count: fixtures.length,
    fixtures: fixtures,
    venuesAttached: fixtures.filter(function (f) { return !!f.venue; }).length,
    needGround: needGround.filter(function (c, i, a) { return a.indexOf(c) === i; }),
    source: 'Football Web Pages',
    note: fixtures.length
      ? 'Schedule only — scores stay yours to enter on match day.'
      : 'Football Web Pages has no fixtures published for this team yet.',
    fetchedAt: new Date().toISOString(),
  });
};
