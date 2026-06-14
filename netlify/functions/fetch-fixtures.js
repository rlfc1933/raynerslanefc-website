// Rayners Lane FC — live fixtures & results.
// Primary source: TheSportsDB (free, open, no key, not bot-blocked) — team
// id 148927. Returns the next fixture (once the league publishes them) plus
// recent results, so the home page / fixtures page update themselves.
//
// Optional upgrade: set FWP_API_KEY + FWP_TEAM_ID (Football Web Pages API) for
// the league's official data — but TheSportsDB works with zero setup.
//
// Returns: { next: {opponent,date,kickoff,isHome,competition} | null,
//            results: [{date,opponent,isHome,us,them,competition}],
//            badge, fetchedAt }

const SDB = 'https://www.thesportsdb.com/api/v1/json/3';
const TEAM = process.env.SDB_TEAM_ID || '148927';
const RLFC = /rayners\s*lane/i;

function resp(code, obj) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(obj),
  };
}

function mapEvent(e) {
  if (!e) return null;
  const home = e.strHomeTeam || '', away = e.strAwayTeam || '';
  const isHome = RLFC.test(home);
  const opponent = (isHome ? away : home) || 'TBC';
  const time = (e.strTime || '15:00:00').slice(0, 5);
  const hs = e.intHomeScore, as = e.intAwayScore;
  const played = hs !== null && hs !== undefined && hs !== '';
  return {
    opponent: opponent,
    date: e.dateEvent || '',
    kickoff: time,
    isHome: isHome,
    competition: e.strLeague || '',
    us: played ? Number(isHome ? hs : as) : null,
    them: played ? Number(isHome ? as : hs) : null,
  };
}

exports.handler = async function () {
  try {
    const opts = { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'RaynersLaneFC/1.0' } };
    const [nextRes, lastRes, teamRes] = await Promise.all([
      fetch(SDB + '/eventsnext.php?id=' + TEAM, opts).then(r => r.ok ? r.json() : {}).catch(() => ({})),
      fetch(SDB + '/eventslast.php?id=' + TEAM, opts).then(r => r.ok ? r.json() : {}).catch(() => ({})),
      fetch(SDB + '/lookupteam.php?id=' + TEAM, opts).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]);

    const now = Date.now();
    const upcoming = (nextRes.events || [])
      .map(mapEvent).filter(Boolean)
      .filter(m => m.date && new Date(m.date + 'T' + m.kickoff + ':00').getTime() > now - 6 * 3600000)
      .sort((a, b) => a.date.localeCompare(b.date));
    const next = upcoming[0] || null;

    const results = (lastRes.results || [])
      .map(mapEvent).filter(m => m && m.us !== null)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6);

    const badge = (teamRes.teams && teamRes.teams[0] && teamRes.teams[0].strBadge) || '';

    return resp(200, { source: 'TheSportsDB', next: next, results: results, badge: badge, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return resp(200, { source: 'TheSportsDB', next: null, results: [], error: e.message });
  }
};
