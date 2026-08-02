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
const CRESTS = require('./lib/football/crests');

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
 * How long since a given sync last SUCCEEDED, in minutes.
 *
 * The timer fires every twenty minutes because line-ups and player records
 * need it. The fixture list and the league table do not — the list changes
 * when the league reschedules something and the table changes after results.
 * Asking a provider for them seventy-two times a day would be neither
 * necessary nor courteous, and this club errs on the lighter side by policy.
 */
async function minutesSinceOk(syncType) {
  const rows = await S.rest('football_sync_runs?sync_type=eq.' + encodeURIComponent(syncType) +
    '&status=eq.ok&select=completed_at,started_at&order=started_at.desc&limit=1') || [];
  const r = rows[0];
  if (!r) return Infinity;
  const t = Date.parse(r.completed_at || r.started_at);
  return isFinite(t) ? (Date.now() - t) / 60000 : Infinity;
}

/** Is a match on today, at the ground's own reckoning of "today"? */
async function isMatchday() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const rows = await S.rest('football_fixtures?season=eq.' + encodeURIComponent(SEASON) +
    '&select=scheduled_kickoff_at') || [];
  return rows.some((f) => {
    if (!f.scheduled_kickoff_at) return false;
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London',
      year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(f.scheduled_kickoff_at));
    return d === today;
  });
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

  // On a matchday the league moves things and results land, so both are worth
  // asking for hourly. On a Wednesday in February they are not.
  const matchday = await isMatchday().catch(() => true);
  const EVERY = matchday ? 55 : 355;   // minutes: hourly, or six-hourly

  steps.push(await step('season', async () => {
    const age = await minutesSinceOk('season');
    if (age < EVERY) return { skipped: true, lastSuccessMinutes: Math.round(age), matchday };
    const season = require('./football-sync-season');
    const out = await invoke(season);
    return { fixtures: out.fixturesWritten, preserved: out.fieldsPreserved,
      conflicts: (out.conflicts || []).length };
  }));

  steps.push(await step('table', async () => {
    const age = await minutesSinceOk('table');
    if (age < EVERY) return { skipped: true, lastSuccessMinutes: Math.round(age), matchday };
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

  // ── crests ────────────────────────────────────────────────────────────
  // NOT rate-limited, because it makes no provider request: it reads the club's
  // own published crest library. It was originally folded into the season step,
  // which IS rate-limited for the provider's sake — so restoring a missing badge
  // would have waited hours behind a courtesy limit that did not apply to it.
  //
  // Only ever fills a blank. A crest the club has approved is never touched.
  steps.push(await step('crests', async () => {
    const teams = await S.rest('football_teams?select=id,canonical_name,crest_asset_path') || [];
    const patches = await CRESTS.backfill(teams);
    for (let i = 0; i < patches.length; i += 50) {
      await Promise.all(patches.slice(i, i + 50).map((row) =>
        S.rest('football_teams?id=eq.' + row.id, {
          method: 'PATCH', body: { crest_asset_path: row.crest_asset_path },
          headers: { Prefer: 'return=minimal' },
        })));
    }
    const lib = await CRESTS.library();
    const stillMissing = CRESTS.missing(
      teams.filter((t) => !patches.some((p) => p.id === t.id)), lib);
    return {
      teams: teams.length, restored: patches.length,
      withoutArtwork: stillMissing.map((t) => t.canonical_name),
    };
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
    matchday: matchday,
    // Said plainly: a partial run is not a failed run, and the next one retries.
    note: failed.length ? failed.length + ' of ' + steps.length + ' steps failed; the rest completed' : null,
  });
};
