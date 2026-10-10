// A registry-shaped football-data response for the public journeys, in the
// exact shape /.netlify/functions/football-data returns (lib/football/read.js
// shapeFixture). TEST DATA ONLY — dates around 9 Oct 2026, mirroring the
// corrected production order (next match Holyport away, next home Thatcham
// Town). `postponeNextHome` turns the Thatcham fixture into a postponement.
'use strict';

const NOW = '2026-10-09T10:00:00+01:00';
function f(id, kickoffAt, isHome, opponent, status, extra = {}) {
  return {
    id, externalId: id.replace('fwp-', ''), season: '2026-2027', kickoffAt, clubTimezone: 'Europe/London',
    homeTeam: isHome ? 'Rayners Lane' : opponent, awayTeam: isHome ? opponent : 'Rayners Lane',
    homeCrest: null, awayCrest: null, isHome, opponent,
    competition: 'Combined Counties Premier North', competitionType: 'league', venue: isHome ? 'Tithe Farm Sports & Social Club' : 'Away ground',
    status, programmeEligible: isHome, ...extra,
  };
}

function fixtures({ postponeNextHome = false } = {}) {
  return [
    f('fwp-t1', '2026-09-19T14:00:00Z', true, 'Wokingham', 'postponed'),
    f('fwp-t2', '2026-10-03T14:00:00Z', false, 'Easington Sports', 'played', { kickoffTimeConfirmed: false }),
    f('fwp-t3', '2026-10-10T14:00:00Z', false, 'Holyport', 'scheduled'),
    f('fwp-t4', '2026-10-17T14:00:00Z', false, 'Reading City', 'scheduled'),
    f('fwp-t5', '2026-10-24T14:00:00Z', false, 'Penn & Tylers Green', 'scheduled'),
    f('fwp-t6', '2026-10-31T15:00:00Z', true, 'Thatcham Town', postponeNextHome ? 'postponed' : 'scheduled'),
    f('fwp-t7', '2026-11-07T15:00:00Z', true, 'Abingdon United', 'scheduled'),
    f('fwp-t8', '2026-11-14T15:00:00Z', false, 'Kidlington', 'scheduled'),
  ];
}

/** Route the football-data function for a Playwright page. */
async function routeRegistry(page, opts = {}) {
  const list = fixtures(opts);
  await page.route('**/.netlify/functions/football-data**', (route) => {
    const what = new URL(route.request().url()).searchParams.get('what') || 'summary';
    if (opts.down) return route.fulfill({ status: 503, json: { ok: false } });
    if (what === 'fixtures') return route.fulfill({ json: { ok: true, season: '2026-2027', fixtures: list } });
    if (what === 'results') return route.fulfill({ json: { ok: true, results: [], form: [] } });
    if (what === 'table') return route.fulfill({ json: { ok: false } });
    const next = list.filter((x) => x.status === 'scheduled' && Date.parse(x.kickoffAt) > Date.parse(NOW))[0] || null;
    return route.fulfill({ json: { ok: true, season: '2026-2027', next, current: null, previous: null } });
  });
}

module.exports = { NOW, fixtures, routeRegistry };
