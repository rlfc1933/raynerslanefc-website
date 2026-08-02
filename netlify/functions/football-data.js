// GATE 4 — the public football data endpoint.
//
// One URL every surface reads: homepage, fixtures page, Match Centre, programme
// and portal. They stop working things out for themselves, which is how the
// site came to offer the match it had just played as the next fixture.
//
// Read-only. Serves the registry, never the provider — no browser has ever
// called Football Web Pages and none will.
'use strict';

const READ = require('./lib/football/read');
const RP = require('./lib/football/read-players');
const S = require('./lib/football/store');

const SEASON = process.env.FWP_SEASON || '2026-2027';

function resp(code, obj, seconds) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      // Short cache: fixtures change rarely, but a result must not sit stale
      // behind a CDN on a Saturday evening.
      'Cache-Control': 'public, max-age=' + (seconds || 30) + ', stale-while-revalidate=120',
    },
    body: JSON.stringify(obj),
  };
}

exports.handler = async function (event) {
  const q = (event && event.queryStringParameters) || {};
  const what = (q.what || 'summary').toLowerCase();
  if (!S.configured()) return resp(200, { ok: false, error: 'not configured' });

  try {
    if (what === 'table') {
      const t = await READ.leagueTable();
      return resp(200, { ok: true, table: t }, 120);
    }

    // GATE 7 — the squad's computed record, keyed by the club's own roster id.
    // The roster itself is data/players.json and stays the club's; this adds
    // only what the matches say, and only for identities a human has confirmed.
    if (what === 'squad' || what === 'playerstats') {
      const stats = await RP.statsByClubPlayer(q.season || SEASON, q.scope || 'all');
      return resp(200, { ok: true, season: q.season || SEASON, scope: q.scope || 'all', players: stats }, 300);
    }

    if (what === 'player') {
      // A provisional identity has no page. Asking for one by slug or by id
      // returns nothing, because there is nothing the club has stood behind.
      const d = await RP.playerDetail(q.p || q.slug, q.season || SEASON);
      if (!d) return resp(404, { ok: false, error: 'no such player page' });
      return resp(200, { ok: true, player: d }, 300);
    }

    if (what === 'fixture') {
      const d = await READ.fixtureDetail(q.id);
      if (!d) return resp(404, { ok: false, error: 'no such fixture' });
      return resp(200, { ok: true, fixture: d }, d.isLive ? 10 : 120);
    }

    const list = await READ.season(SEASON);
    if (what === 'fixtures') return resp(200, { ok: true, season: SEASON, fixtures: list }, 120);

    if (what === 'results') {
      const r = await READ.results(SEASON);
      return resp(200, { ok: true, season: SEASON, results: r, form: READ.formFrom(r, { limit: 5 }) }, 60);
    }

    // summary — what the homepage needs, in one request
    const [res, table] = await Promise.all([READ.results(SEASON), READ.leagueTable()]);
    const next = READ.nextFrom(list);
    const current = READ.currentFrom(list);
    const previous = READ.previousFrom(list);
    const prevWithScore = previous ? res.filter((r) => r.id === previous.id)[0] || previous : null;
    return resp(200, {
      ok: true,
      season: SEASON,
      next,
      current,
      previous: prevWithScore,
      nextProgramme: READ.nextProgrammeFrom(list),
      form: READ.formFrom(res, { limit: 5 }),
      leagueForm: READ.formFrom(res, { limit: 5, leagueOnly: true }),
      table: table ? {
        position: (table.rows.filter((r) => r.isUs)[0] || {}).position || null,
        played: (table.rows.filter((r) => r.isUs)[0] || {}).played || null,
        points: (table.rows.filter((r) => r.isUs)[0] || {}).points || null,
        lastSyncedAt: table.lastSyncedAt,
        teams: table.rows.length,
      } : null,
      counts: { fixtures: list.length, played: res.length },
    }, 30);
  } catch (e) {
    return resp(200, { ok: false, error: String(e && e.message || e) });
  }
};
