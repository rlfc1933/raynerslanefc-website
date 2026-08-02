// GATE 8 — the registry keeps itself up to date.
//
// Until now the registry had no timer of its own: somebody had to press a
// button for the season list, the league table, the line-ups and the player
// records. That works exactly as long as somebody remembers, which is another
// way of saying it does not work.
//
// SCHEDULED. Netlify refuses HTTP to a scheduled function, so the human-pressed
// version lives in football-registry-sync-now.js. Do not add a button pointing
// at this file — it will return 403 and look like it worked.
//
// Ordering is deliberate and each step is allowed to fail on its own:
//
//   1. the season list, so a postponement or a new cup tie exists as a fixture
//   2. the league table, which changes only after results
//   3. line-ups for fixtures that have been played and have none, which is
//      what the whole player record is built from
//   4. the player records themselves, recomputed from the matches
//
// Nothing here decides anything about identity. It writes provisional records
// and leaves them for a human, exactly as Gate 7 requires.
'use strict';

const S = require('./lib/football/store');
const F = require('./lib/fwp');
const STATS = require('./lib/football/player-stats');

const SEASON = process.env.FWP_SEASON || '2026-2027';

function resp(code, obj) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(obj),
  };
}

/** Run one step, and never let it take the others down with it. */
async function step(name, fn) {
  try {
    const out = await fn();
    return { step: name, ok: true, result: out };
  } catch (e) {
    return { step: name, ok: false, error: String((e && e.message) || e) };
  }
}

/**
 * Call another function's handler directly rather than over HTTP.
 *
 * The PIN is passed because those handlers require one to APPLY rather than
 * shadow, and knowing it is what distinguishes a server-side caller from a
 * stranger with a URL. It never leaves this process and is never logged.
 */
async function invoke(mod, query) {
  const out = await mod.handler({
    httpMethod: 'POST',
    queryStringParameters: Object.assign({ apply: '1' }, query || {}),
    body: JSON.stringify({ apply: true, pin: process.env.ADMIN_PIN || '' }),
  });
  let parsed;
  try { parsed = JSON.parse(out.body || '{}'); } catch (e) { parsed = null; }
  // These handlers answer 200 with {ok:false} rather than throwing — that is
  // right for an HTTP caller and wrong for this one. Left alone, a run where
  // nothing worked would report four green steps, which is the precise kind of
  // false reassurance the health view exists to remove.
  if (!parsed || parsed.ok === false) {
    throw new Error((parsed && parsed.error) || 'the underlying sync reported failure');
  }
  return parsed;
}

/**
 * Played fixtures whose line-ups were never ingested.
 *
 * Bounded to a handful per run on purpose: each one is a provider request and a
 * parse, and a scheduled function that tries to catch up on a whole season in
 * one go is a function that times out and never catches up at all.
 */
async function fixturesNeedingLineups(limit) {
  const played = await S.rest('football_fixtures?season=eq.' + encodeURIComponent(SEASON) +
    '&fixture_status=eq.played&select=id,internal_fixture_id,external_fixture_id,' +
    'scheduled_kickoff_at&order=scheduled_kickoff_at.desc&limit=60') || [];
  if (!played.length) return [];
  const have = await S.rest('football_lineups?fixture_id=in.(' +
    played.map((f) => f.id).join(',') + ')&select=fixture_id,status') || [];
  const byFixture = {};
  have.forEach((l) => {
    byFixture[l.fixture_id] = (byFixture[l.fixture_id] || 0) + (l.status === 'confirmed' ? 1 : 0);
  });
  // Both sides confirmed, or it is not done.
  return played.filter((f) => (byFixture[f.id] || 0) < 2).slice(0, limit || 3);
}

exports.handler = async function () {
  if (!F.isEnabled()) return resp(200, { ok: true, enabled: false, reason: 'FWP_SYNC_ENABLED is not true' });
  if (!S.configured()) return resp(200, { ok: false, error: 'supabase not configured' });

  const startedAt = Date.now();
  const steps = [];

  steps.push(await step('season', async () => {
    const season = require('./football-sync-season');
    const out = await invoke(season);
    return { fixtures: out.fixturesWritten, conflicts: (out.conflicts || []).length };
  }));

  steps.push(await step('table', async () => {
    const table = require('./football-sync-table');
    const out = await invoke(table);
    return { rows: out.rows || out.written || null };
  }));

  steps.push(await step('lineups', async () => {
    const match = require('./football-sync-match');
    const wanted = await fixturesNeedingLineups(3);
    const done = [];
    for (const f of wanted) {
      // Time budget: a scheduled function that overruns is killed mid-write.
      if (Date.now() - startedAt > 18000) break;
      // One fixture failing must not abandon the others.
      let out = null, err = null;
      try { out = await invoke(match, { fixture: f.internal_fixture_id || f.external_fixture_id }); }
      catch (e) { err = String((e && e.message) || e); }
      done.push({ fixture: f.internal_fixture_id, ok: !!out, lineups: out ? out.lineups : null, error: err });
    }
    return { attempted: done.length, outstanding: wanted.length - done.length, done };
  }));

  steps.push(await step('players', async () => {
    // Cheap when nothing has changed — it recomputes from rows already stored,
    // makes no provider requests, and produces the same answer every time.
    return await STATS.recompute({ season: SEASON });
  }));

  const failed = steps.filter((s) => !s.ok);
  return resp(200, {
    ok: failed.length === 0,
    season: SEASON,
    ms: Date.now() - startedAt,
    steps: steps,
    // Said plainly: a partial run is not a failed run, and the next one retries.
    note: failed.length ? failed.length + ' of ' + steps.length + ' steps failed; the rest completed' : null,
  });
};
