// Rayners Lane FC — automatic fixtures from the Football Web Pages API
// (the data source Combined Counties publishes results through).
//
// Activates when these Netlify environment variables are set:
//   FWP_API_KEY   – a free RapidAPI key for the "Football Web Pages" API
//   FWP_TEAM_ID   – Rayners Lane's team id on Football Web Pages
//
// Until then it returns {configured:false} and the site falls back to the
// fixture the staff set manually in the admin Match Day tab. Nothing breaks.
//
// Returns: { configured, next: {opponent,date,kickoff,isHome,competition},
//            results: [...], fetchedAt }

const HOST = 'football-web-pages1.p.rapidapi.com';
const RLFC = /rayners\s*lane/i;

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=600',     // cache 10 min
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(obj),
  };
}

exports.handler = async function () {
  const key = process.env.FWP_API_KEY;
  const team = process.env.FWP_TEAM_ID;
  if (!key || !team) {
    return resp(200, { configured: false, reason: 'Set FWP_API_KEY and FWP_TEAM_ID in Netlify to auto-pull fixtures.' });
  }

  try {
    const r = await fetch('https://' + HOST + '/fixtures-results.json?team=' + encodeURIComponent(team), {
      headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': HOST },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return resp(200, { configured: true, error: 'FWP API ' + r.status });
    const data = await r.json();

    // The API returns fixtures-results.matches[] with home/away teams + status.
    const matches = (data['fixtures-results'] && data['fixtures-results'].matches) || data.matches || [];
    const now = Date.now();
    let next = null;
    const results = [];

    matches.forEach(function (m) {
      const home = (m['home-team'] && m['home-team'].name) || m.home || '';
      const away = (m['away-team'] && m['away-team'].name) || m.away || '';
      const date = m.date || (m.kickoff && m.kickoff.slice(0, 10)) || '';
      const time = (m.time || (m.kickoff && m.kickoff.slice(11, 16)) || '15:00');
      const isHome = RLFC.test(home);
      const opponent = isHome ? away : home;
      const status = (m.status && (m.status.full || m.status)) || '';
      const ts = date ? new Date(date + 'T' + time + ':00').getTime() : 0;

      const hs = m['home-team'] && m['home-team'].score;
      const as = m['away-team'] && m['away-team'].score;
      const played = (hs !== undefined && hs !== null && hs !== '') || /ft|full/i.test(String(status));

      if (played) {
        results.push({ opponent, isHome, date, homeScore: hs, awayScore: as, competition: m.competition || '' });
      } else if (ts && ts > now && (!next || ts < next._ts)) {
        next = { opponent: opponent, date: date, kickoff: time, isHome: isHome, competition: m.competition || '', _ts: ts };
      }
    });

    if (next) delete next._ts;
    return resp(200, { configured: true, next: next, results: results.slice(-5).reverse(), fetchedAt: new Date().toISOString() });
  } catch (e) {
    return resp(200, { configured: true, error: 'Could not reach fixtures API: ' + e.message });
  }
};
