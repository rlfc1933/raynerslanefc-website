// The match-day sync. Runs server-side on a schedule; no browser ever calls
// Football Web Pages.
//
// What it does, once per invocation:
//   1. refuses to run at all unless FWP_SYNC_ENABLED is true (permission gate)
//   2. works out which fixtures are in their match window right now
//   3. polls each one using the provider's own cursor protocol
//   4. parses to OUR shape, validates it is really our match
//   5. writes only genuine changes, with optimistic locking
//   6. appends only genuinely new events
//   7. stops once full time is confirmed
//
// It never commits to GitHub and never triggers a Netlify build. The old
// scoreboard fired a build hook on every score push; a goal is data, not a
// deploy.

'use strict';

const adapter = require('./lib/fwp-adapter');
const client = require('./lib/fwp-client');
const store = require('./lib/match-store');

const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://raynerslanefc.co.uk';

// Match window. Discovery starts before kick-off so the fixture is confirmed
// and the crest/opponent are checked while there is still time to notice a
// mismatch; polling stops a few hours after so a forgotten fixture cannot poll
// the provider forever.
const PRE_KICKOFF_MIN = 30;
const POST_KICKOFF_MAX_MIN = 240;

function resp(code, obj) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(obj),
  };
}

// Kick-off as a real instant, in UK wall-clock terms. Copied in spirit from
// _ukEpoch() in js/main.js — a fixture at 3pm is 3pm in Harrow whatever the
// server's timezone happens to be.
function ukEpoch(dateStr, timeStr) {
  if (!dateStr) return NaN;
  const t = String(timeStr || '15:00').slice(0, 5);
  const asUTC = new Date(dateStr + 'T' + t + ':00Z').getTime();
  if (isNaN(asUTC)) return NaN;
  const lon = new Date(asUTC).toLocaleString('en-US', { timeZone: 'Europe/London' });
  const utc = new Date(asUTC).toLocaleString('en-US', { timeZone: 'UTC' });
  return asUTC - (new Date(lon).getTime() - new Date(utc).getTime());
}

async function loadFixtures() {
  const urls = [
    'https://raw.githubusercontent.com/rlfc1933/raynerslanefc-website/main/data/fixtures.json',
    SITE_ORIGIN + '/data/fixtures.json?t=' + Date.now(),
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const j = await r.json();
      if (j && j.fixtures && j.fixtures.length) return j.fixtures;
    } catch (e) { /* try the next source */ }
  }
  return [];
}

/**
 * The external id lives inside our own fixture id ('fwp-578225'), which the
 * Football Web Pages import already stamps. Anything else is unmatched and is
 * NOT guessed — a wrong fixture silently attached is worse than no live score.
 */
function externalIdOf(fixture) {
  const m = String(fixture.id || '').match(/^fwp-(\d+)$/);
  return m ? m[1] : null;
}

function inWindow(fixture, now) {
  const ko = ukEpoch(fixture.date, fixture.kickoff);
  if (isNaN(ko)) return false;
  return now >= ko - PRE_KICKOFF_MIN * 60000 && now <= ko + POST_KICKOFF_MAX_MIN * 60000;
}

function candidates(fixtures, now) {
  return fixtures.filter((f) => externalIdOf(f) && inWindow(f, now));
}

function pathFor(fixture, extId, parsed) {
  // The provider resolves on the numeric id; the descriptive segments only need
  // to be well-formed. Using the parsed names when we have them keeps the URL
  // honest, and the fixture's own values before the first successful parse.
  const home = parsed ? parsed.home.name : (fixture.isHome ? adapter.OUR_CLUB : fixture.opponent);
  const away = parsed ? parsed.away.name : (fixture.isHome ? fixture.opponent : adapter.OUR_CLUB);
  return client.matchPath({
    season: (fixture.season && /^\d{4}-\d{4}$/.test(fixture.season)) ? fixture.season
      : (process.env.FWP_SEASON || '2026-2027'),
    competitionSlug: client.slug(fixture.competition || 'league'),
    homeSlug: client.slug(home),
    awaySlug: client.slug(away),
    externalFixtureId: extId,
  });
}

// A cheap fingerprint of everything a supporter would notice. If this is
// unchanged there is nothing to write, even if the provider re-sent the page.
function fingerprint(p) {
  return [
    p.homeScore, p.awayScore, p.period, p.matchMinute, p.stoppageMinute,
    p.events.map((e) => adapter.eventKey('', e)).join(';'),
  ].join('|');
}

function eventRow(fixtureId, p, e) {
  let type = e.type;
  if (type === 'goal' && e.ownGoal) type = 'own_goal';
  if (type === 'goal' && e.penalty) type = 'penalty_goal';
  return {
    fixture_id: fixtureId,
    external_provider: 'fwp',
    event_type: type,
    side: e.side || null,
    team: e.team || null,
    player: e.player || null,
    assistant: e.assistant || null,
    player_side: e.playerSide || null,
    minute: e.minute,
    stoppage_minute: e.stoppage || 0,
    card_colour: type === 'yellow_card' ? 'yellow' : (type === 'red_card' ? 'red' : null),
    own_goal: !!e.ownGoal,
    penalty: !!e.penalty,
    score_home_after: null,   // provider gives no running score per event
    score_away_after: null,
    dedupe_key: adapter.eventKey(fixtureId, e),
    source: 'fwp',
    occurred_at: null,
  };
}


/**
 * Write the final score onto the fixture, once, when the match finishes.
 *
 * Without this the club's own fixtures.json never learns the result: the
 * fixtures page keeps saying "result to follow", the homepage decides the
 * season has not started, and the hero offers the match that has just been
 * played back as the "next match". A volunteer then retypes a score the system
 * already knows.
 *
 * Uses save-data's MERGE mode, which re-reads the file from GitHub, applies
 * only this fixture and retries on conflict — so it cannot clobber a
 * simultaneous edit in the portal. One commit per match, at full time only.
 */
async function writeResultToFixture(fixture, parsed) {
  if (!process.env.GITHUB_TOKEN || !process.env.ADMIN_PIN) return { ok: false, error: 'not configured' };
  const view = adapter.ourView(parsed);
  if (view.us == null || view.them == null) return { ok: false, error: 'no score' };

  // Our scorers, in order, as the fixtures page already formats them.
  const usSide = view.isHome ? 'home' : 'away';
  const scorers = parsed.events
    .filter((e) => e.type === 'goal' && e.side === usSide && e.minute != null)
    .map((e) => e.player + " " + e.minute + (e.stoppage ? '+' + e.stoppage : '') + "'")
    .join(', ');

  const upsert = {
    id: fixture.id,
    us: view.us, them: view.them,
    status: 'played',
    scorers: scorers || fixture.scorers || '',
  };
  try {
    const saveData = require('./save-data');
    const res = await saveData.handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        pin: process.env.ADMIN_PIN,
        merge: true, domain: 'fixtures', key: 'fixtures', idField: 'id',
        upserts: [upsert], deletedIds: [],
      }),
    });
    let body = {};
    try { body = JSON.parse(res.body || '{}'); } catch (e) { /* non-JSON */ }
    return { ok: res.statusCode === 200 && body.ok !== false, detail: body.error || '' };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

async function syncOne(fixture, now) {
  const started = Date.now();
  const fixtureId = fixture.id;
  const extId = externalIdOf(fixture);
  const ko = ukEpoch(fixture.date, fixture.kickoff);

  const seed = {
    external_provider: 'fwp',
    external_fixture_id: extId,
    is_home: fixture.isHome !== false,
    competition: fixture.competition || null,
    venue: fixture.venue || null,
    scheduled_kickoff: isNaN(ko) ? null : new Date(ko).toISOString(),
    sync_status: 'ready',
  };
  let state = await store.ensureState(fixtureId, seed);
  if (!state) return { fixtureId, outcome: 'error', detail: 'could not create state row' };

  // A human is deliberately driving this scoreboard. Record what the provider
  // says for the audit trail, change nothing. This is the guarantee that an
  // emergency correction is never silently undone by a poll.
  if (state.manual_override) {
    const expired = state.manual_override_expires_at &&
      Date.parse(state.manual_override_expires_at) < now;
    if (!expired) {
      await store.log({ fixture_id: fixtureId, outcome: 'skipped_override', detail: 'manual override active' });
      return { fixtureId, outcome: 'skipped_override' };
    }
    await store.updateState(fixtureId, { manual_override: false, manual_override_reason: null }, null);
    state = await store.getState(fixtureId);
  }

  // Full time already confirmed — nothing more to poll for.
  if (state.is_final) return { fixtureId, outcome: 'complete' };

  // If the fixture still owes us a result, ask for the WHOLE page rather than a
  // delta. Once a match ends the provider stops changing, so every cursored
  // poll comes back 204 with no body — and 204 returns before anything is
  // parsed, so the score could never be written. Dropping the cursor forces a
  // full response we can actually read.
  const owesResult = fixture.us == null || fixture.them == null;
  const cursor = (state.is_final && owesResult) ? null : state.sync_cursor;
  const r = await client.fetchMatch(pathFor(fixture, extId, null), cursor);

  if (r.outcome === 'no_change') {
    await store.updateState(fixtureId, {
      last_synced_at: new Date().toISOString(),
      sync_status: 'ok', sync_error: null,
      sync_cursor: r.cursor || state.sync_cursor,
    }, null);
    await store.log({ fixture_id: fixtureId, outcome: 'no_change', http_status: 204, duration_ms: r.durationMs });
    return { fixtureId, outcome: 'no_change' };
  }

  if (!r.ok) {
    await store.updateState(fixtureId, {
      last_synced_at: new Date().toISOString(),
      sync_status: 'failing', sync_error: String(r.error || 'unknown').slice(0, 300),
    }, null);
    await store.log({ fixture_id: fixtureId, outcome: r.outcome || 'error', http_status: r.status, detail: String(r.error || '').slice(0, 300), duration_ms: r.durationMs });
    return { fixtureId, outcome: r.outcome || 'error', detail: r.error };
  }

  const parsed = adapter.parseMatch(r.html);
  const check = adapter.validateMatch(parsed, { opponent: fixture.opponent, isHome: fixture.isHome !== false });
  if (!check.ok) {
    // Refuse rather than write. A mismatched fixture on the public scoreboard is
    // the single worst failure this system can have.
    await store.updateState(fixtureId, {
      last_synced_at: new Date().toISOString(),
      sync_status: 'failing', sync_error: 'rejected: ' + check.errors.join('; '),
    }, null);
    await store.log({ fixture_id: fixtureId, outcome: 'rejected', http_status: r.status, detail: check.errors.join('; ').slice(0, 300), duration_ms: r.durationMs });
    return { fixtureId, outcome: 'rejected', detail: check.errors };
  }

  // Put the final score on the fixture. This MUST happen before the
  // unchanged-payload shortcut below: once a match is over the provider stops
  // changing, so every later poll is a no-change and an early return meant the
  // result was never written at all. Condition is "final AND the fixture has no
  // score yet", which is idempotent by construction and also backfills a match
  // that finished before this code shipped.
  if (parsed.isFinal && (fixture.us == null || fixture.them == null)) {
    const w = await writeResultToFixture(fixture, parsed);
    await store.log({
      fixture_id: fixtureId, outcome: w.ok ? 'result_written' : 'result_write_failed',
      detail: (w.error || w.detail || '') + ' ' + parsed.homeScore + '-' + parsed.awayScore,
    });
  }

  const hash = fingerprint(parsed);
  const nowIso = new Date().toISOString();

  if (hash === state.payload_hash) {
    await store.updateState(fixtureId, {
      last_synced_at: nowIso, sync_status: 'ok', sync_error: null,
      sync_cursor: r.cursor || state.sync_cursor,
    }, null);
    await store.log({ fixture_id: fixtureId, outcome: 'no_change', http_status: r.status, duration_ms: r.durationMs });
    return { fixtureId, outcome: 'no_change' };
  }

  const view = adapter.ourView(parsed);
  const patch = {
    external_fixture_id: extId,
    home_team: parsed.home.name, away_team: parsed.away.name,
    home_score: parsed.homeScore, away_score: parsed.awayScore,
    is_home: view.isHome,
    period: parsed.period, match_minute: parsed.matchMinute, stoppage_minute: parsed.stoppageMinute,
    competition: parsed.competition || state.competition,
    venue: parsed.venue || state.venue,
    referee: parsed.referee || null,
    is_live: parsed.isLive, is_final: parsed.isFinal,
    actual_kickoff: state.actual_kickoff || (parsed.isLive ? nowIso : null),
    source_updated_at: nowIso, last_synced_at: nowIso,
    sync_status: 'ok', sync_error: null,
    sync_cursor: r.cursor || state.sync_cursor,
    payload_hash: hash,
  };

  const upd = await store.updateState(fixtureId, patch, state.version);
  if (!upd.ok && upd.conflict) {
    // Someone else wrote first. Back off; the next poll 30s later will pick up
    // whatever the truth is by then.
    await store.log({ fixture_id: fixtureId, outcome: 'conflict', detail: 'version moved', duration_ms: r.durationMs });
    return { fixtureId, outcome: 'conflict' };
  }

  // Events: insert what is new, retract what the provider has withdrawn.
  const existing = await store.listEvents(fixtureId);
  const seen = {};
  existing.forEach((row) => { seen[row.dedupe_key] = row; });
  const incoming = parsed.events.map((e) => eventRow(fixtureId, parsed, e));
  const fresh = incoming.filter((row) => !seen[row.dedupe_key]);
  if (fresh.length) await store.insertEvents(fresh);

  const incomingKeys = {};
  incoming.forEach((row) => { incomingKeys[row.dedupe_key] = true; });
  const gone = existing
    .filter((row) => row.source === 'fwp' && !row.retracted_at && !incomingKeys[row.dedupe_key])
    .map((row) => row.dedupe_key);
  if (gone.length) await store.retractEvents(fixtureId, gone);

  await store.log({
    fixture_id: fixtureId, outcome: 'ok', http_status: r.status,
    parsed_score: parsed.homeScore + '-' + parsed.awayScore,
    parsed_period: parsed.period,
    detail: (fresh.length ? fresh.length + ' new event(s)' : '') + (gone.length ? ' ' + gone.length + ' retracted' : '') ,
    duration_ms: Date.now() - started,
  });

  return {
    fixtureId, outcome: 'ok',
    score: parsed.homeScore + '-' + parsed.awayScore,
    period: parsed.period, minute: parsed.matchMinute,
    newEvents: fresh.length, retracted: gone.length,
  };
}

exports.handler = async function (event) {
  // The permission gate. Until Football Web Pages confirm that polling their
  // match embed at their own 30-second cadence is acceptable, this function
  // does nothing in production. Everything downstream is built and tested; only
  // the network call is withheld.
  if (!client.isEnabled()) {
    return resp(200, {
      ok: true, enabled: false,
      reason: 'FWP_SYNC_ENABLED is not true — awaiting provider permission',
    });
  }
  if (!store.configured()) return resp(200, { ok: false, error: 'supabase not configured' });

  const now = Date.now();
  const fixtures = await loadFixtures();
  if (!fixtures.length) return resp(200, { ok: false, error: 'no fixtures available' });

  const due = candidates(fixtures, now);
  if (!due.length) return resp(200, { ok: true, polled: 0, note: 'no fixture in its match window' });

  // Every Rayners Lane fixture in its window is synced — the architecture is
  // fixture-scoped precisely so two teams playing at once both work.
  const results = [];
  for (const f of due) {
    try {
      results.push(await syncOne(f, now));
    } catch (e) {
      results.push({ fixtureId: f.id, outcome: 'error', detail: String(e && e.message || e) });
      await store.log({ fixture_id: f.id, outcome: 'error', detail: String(e && e.message || e).slice(0, 300) });
    }
  }
  return resp(200, { ok: true, polled: results.length, results: results });
};

// Exported for tests — the pure decision logic, no network.
exports._internal = { ukEpoch, externalIdOf, inWindow, candidates, fingerprint, eventRow, pathFor };
