// Asset Studio test harness: a football-registry answer shaped exactly like
// /.netlify/functions/football-data, and the REAL studio-assets function
// running over the in-memory Supabase. TEST DATA ONLY — the fixtures below are
// shaped from the club's 2026-27 season (North Leigh at home on Saturday
// 10 October; the away defeats recorded in lib/football/read.js) so the
// templates are exercised with realistic names and dates. Relative to "now"
// so the journeys never go stale.
'use strict';
process.env.SUPABASE_URL = 'https://fake-supabase.local';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
const { makeDb, install } = require('./fake-supabase');

const DAY = 864e5;
/** A London 3pm (or other) kick-off N days from today, as the registry stores it (UTC instant). */
function kickoff(daysFromNow, hhmm) {
  const d = new Date(Date.now() + daysFromNow * DAY);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);
  const [h, m] = (hhmm || '15:00').split(':').map(Number);
  // Europe/London offset on that date
  const probe = new Date(ymd + 'T12:00:00Z');
  const lh = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false }).format(probe);
  const off = lh - 12;
  return new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10), h - off, m)).toISOString();
}

function registry() {
  const CCL = 'Combined Counties League Premier Division North';
  const f = (id, opp, crest, isHome, ko, status, extra) => Object.assign({
    id, externalId: id.replace('rl-', ''), season: '2026-2027', kickoffAt: ko, clubTimezone: 'Europe/London',
    homeTeam: isHome ? 'Rayners Lane' : opp, awayTeam: isHome ? opp : 'Rayners Lane',
    homeCrest: isHome ? null : crest, awayCrest: isHome ? crest : null, isHome, opponent: opp,
    competition: CCL, competitionType: 'league', venue: isHome ? 'Tithe Farm Social Club' : null, status, programmeEligible: isHome,
  }, extra || {});
  const fixtures = [
    f('rl-burnham', 'Burnham', 'img/crests/burnham.png', false, kickoff(-26), 'played'),
    f('rl-harefield', 'Harefield United', 'img/crests/harefield-united.png', false, kickoff(-19), 'played'),
    f('rl-easington', 'Easington Sports', 'img/crests/easington-sports.png', false, kickoff(-12), 'played'),
    f('rl-north-leigh', 'North Leigh', 'img/crests/north-leigh.png', true, kickoff(1), 'scheduled'),
    f('rl-ardley', 'Ardley United', 'img/crests/ardley-united.png', false, kickoff(8), 'scheduled'),
    f('rl-wallingford', 'Wallingford & Crowmarsh', 'img/crests/wallingford-and-crowmarsh.png', true, kickoff(15, '19:45'), 'scheduled'),
  ];
  const results = [
    Object.assign({}, fixtures[0], { us: 0, them: 1, hasScore: true }),
    Object.assign({}, fixtures[1], { us: 0, them: 5, hasScore: true }),
    Object.assign({}, fixtures[2], { us: 0, them: 2, hasScore: true }),
  ];
  return { fixtures, results, next: fixtures[3], previous: results[2], nextProgramme: fixtures[3] };
}

async function wire(page, opts = {}) {
  const reg = opts.registry || registry();
  const db = makeDb({
    studio_assets: [], studio_sponsor_logos: [], studio_compositions: [], studio_revisions: [], studio_exports: [], studio_publications: [],
  });
  if (opts.noTables) for (const t of Object.keys(db)) if (t.startsWith('studio_')) delete db[t];
  const restore = install(db);
  for (const k of Object.keys(require.cache)) if (/netlify[\\/]functions|js[\\/]studio/.test(k)) delete require.cache[k];
  const fn = require('../../../netlify/functions/studio-assets');
  await page.route('**/.netlify/functions/admin-pin', (r) => r.fulfill({ json: { ok: JSON.parse(r.request().postData() || '{}').pin === '1933' } }));
  await page.route('**/.netlify/functions/football-data**', (r) => {
    if (opts.registryDown) return r.fulfill({ status: 503, json: { ok: false } });
    const what = new URL(r.request().url()).searchParams.get('what') || 'summary';
    if (what === 'fixtures') return r.fulfill({ json: { ok: true, season: '2026-2027', fixtures: reg.fixtures } });
    if (what === 'results') return r.fulfill({ json: { ok: true, results: reg.results } });
    if (what === 'fixture') {
      const id = new URL(r.request().url()).searchParams.get('id');
      const fx = reg.fixtures.find((x) => x.id === id);
      return r.fulfill({ json: { ok: true, fixture: Object.assign({}, fx, { events: [], lineups: { home: null, away: null, confirmed: false } }) } });
    }
    return r.fulfill({ json: { ok: true, season: '2026-2027', next: reg.next, previous: reg.previous, nextProgramme: reg.nextProgramme, current: null } });
  });
  if (!opts.noServer) {
    await page.route('**/.netlify/functions/studio-assets', async (route) => {
      const res = await fn.handler({ httpMethod: 'POST', body: route.request().postData() });
      await route.fulfill({ status: res.statusCode, headers: res.headers, body: res.body });
    });
  }
  return { db, restore, reg };
}

module.exports = { wire, registry, kickoff };
