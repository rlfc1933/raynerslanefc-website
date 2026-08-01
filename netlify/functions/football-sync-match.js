// GATE 3 — match state, events and line-ups into the registry, in shadow.
//
// Writes LINE-UPS and PLAYERS for real: nothing in production stores them, so
// there is nothing to conflict with.
//
// Does NOT write a second match state or a second event log. Those already
// exist, work, and carried a live match today. It builds what it would have
// written and reports the difference, so parity is proved before any consumer
// moves. Two systems writing a score on a Saturday is precisely the failure
// this architecture exists to prevent.

'use strict';

const adminOk = require('./lib/pin');
const F = require('./lib/fwp');
const R = require('./lib/football/reconcile');
const S = require('./lib/football/store');
const I = require('./lib/football/match-ingest');
const liveStore = require('./lib/match-store');

const SEASON = process.env.FWP_SEASON || '2026-2027';

function resp(code, obj) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(obj, null, 1),
  };
}

async function fixtureFromRegistry(ref) {
  if (!ref) {
    // Default to the most recent fixture the provider has actually played.
    const rows = await S.rest('football_fixtures?fixture_status=eq.played&select=*&order=scheduled_kickoff_at.desc&limit=1');
    return (rows && rows[0]) || null;
  }
  const byInternal = await S.findOne('football_fixtures', 'internal_fixture_id=eq.' + encodeURIComponent(ref));
  if (byInternal) return byInternal;
  return await S.findOne('football_fixtures', 'external_fixture_id=eq.' + encodeURIComponent(ref));
}

/** Index existing players by team + name key, for identity resolution. */
async function playerIndex() {
  const [players, aliases] = await Promise.all([
    S.rest('football_players?select=id,canonical_name,current_team_id'),
    S.rest('football_player_aliases?select=player_id,normalised,team_id'),
  ]);
  const byId = {};
  (players || []).forEach((p) => { byId[p.id] = p; });
  const idx = {};
  (players || []).forEach((p) => {
    idx[p.current_team_id + '|' + F.playerKey(p.canonical_name)] = p;
  });
  (aliases || []).forEach((a) => {
    if (byId[a.player_id]) idx[a.team_id + '|' + a.normalised] = byId[a.player_id];
  });
  return idx;
}

/** Create the players a line-up introduced, in one batch, as provisional. */
async function createPlayers(unresolved) {
  const wanted = [];
  const seen = {};
  for (const u of unresolved) {
    const k = u.teamId + '|' + u.key;
    if (seen[k] || !u.key) continue;
    seen[k] = true;
    wanted.push(u);
  }
  if (!wanted.length) return [];
  const saved = await S.rest('football_players', {
    method: 'POST',
    body: wanted.map((u) => ({
      canonical_name: u.name, display_name: u.name, slug: F.slug(u.name),
      external_provider: 'fwp', provider_name: u.name,
      current_team_id: u.teamId,
      // Never 'confirmed' from a provider string alone. A human decides.
      identity_status: u.status === 'name_used_at_another_club' ? 'needs_review' : 'provisional',
      active: true,
    })),
    headers: { Prefer: 'return=representation' },
  }) || [];
  const aliasRows = saved.map((p) => ({
    player_id: p.id, alias: p.canonical_name,
    normalised: F.playerKey(p.canonical_name), team_id: p.current_team_id,
    source: 'fwp', confidence: 'needs_review',
  }));
  if (aliasRows.length) {
    await S.rest('football_player_aliases', {
      method: 'POST', body: aliasRows, headers: { Prefer: 'return=minimal' },
    });
  }
  return saved;
}

async function writeLineup(fixtureId, teamId, rows, sourceUpdatedAt) {
  const lineup = await S.upsert('football_lineups', {
    fixture_id: fixtureId, team_id: teamId,
    status: rows.length ? 'confirmed' : 'awaiting',
    source_updated_at: sourceUpdatedAt,
    confirmed_at: rows.length ? new Date().toISOString() : null,
  }, 'fixture_id,team_id');
  if (!lineup) return 0;
  // Replace rather than accumulate: a corrected line-up must not leave the old
  // one behind alongside it.
  await S.rest('football_lineup_players?lineup_id=eq.' + lineup.id, {
    method: 'DELETE', headers: { Prefer: 'return=minimal' },
  });
  if (!rows.length) return 0;
  await S.rest('football_lineup_players', {
    method: 'POST',
    body: rows.map((r) => ({
      lineup_id: lineup.id, player_id: r.player_id,
      provider_player_name: r.provider_player_name,
      shirt_number: r.shirt_number, lineup_role: r.lineup_role,
      entered_minute: r.entered_minute, exited_minute: r.exited_minute,
      is_captain: r.is_captain, is_goalkeeper: r.is_goalkeeper, sort_order: r.sort_order,
    })),
    headers: { Prefer: 'return=minimal' },
  });
  return rows.length;
}

exports.handler = async function (event) {
  const q = (event && event.queryStringParameters) || {};
  let body = {};
  try { body = JSON.parse((event && event.body) || '{}'); } catch (e) { /* GET */ }

  const apply = q.apply === '1' || body.apply === true;
  if (apply && !adminOk(body.pin || q.pin)) {
    return resp(401, { ok: false, error: 'Applying requires sign-in' });
  }
  if (!F.isEnabled()) return resp(200, { ok: true, enabled: false, reason: 'FWP_SYNC_ENABLED is not true' });
  if (!S.configured()) return resp(200, { ok: false, error: 'supabase not configured' });

  const run = await S.startRun('match', !apply, q.fixture || body.fixture || null);
  try {
    const fixture = await fixtureFromRegistry(q.fixture || body.fixture);
    if (!fixture) {
      await S.finishRun(run && run.id, { status: 'skipped', final_error: 'no fixture' });
      return resp(200, { ok: false, error: 'no fixture found — run football-sync-season first' });
    }

    // Ask for the whole page: a finished match returns 204 to a cursored poll,
    // and there is nothing to parse from an empty body.
    const path = F.matchPath({
      season: SEASON,
      competitionSlug: 'x', homeSlug: 'x', awaySlug: 'x',
      externalFixtureId: fixture.external_fixture_id,
    });
    const r = await F.fetchMatch(path, null);
    if (!r.ok || !r.html) {
      await S.finishRun(run && run.id, { status: 'failed', final_error: r.error || 'no body', error_count: 1 });
      return resp(200, { ok: false, error: r.error || 'provider returned nothing to parse' });
    }

    const parsed = F.parseMatch(r.html);
    const check = F.validateMatch(parsed, null);
    if (!check.ok) {
      await S.finishRun(run && run.id, { status: 'failed', final_error: check.errors.join('; '), error_count: 1 });
      return resp(200, { ok: false, error: 'rejected: ' + check.errors.join('; ') });
    }

    // ── line-ups and players: genuinely new, so written for real ────────────
    const idx = await playerIndex();
    const home = I.lineupRows(parsed, 'home', fixture.home_team_id, idx);
    const away = I.lineupRows(parsed, 'away', fixture.away_team_id, idx);
    const created = await createPlayers(home.unresolved.concat(away.unresolved));

    // Re-index so the rows just created can be attached.
    const idx2 = await playerIndex();
    const home2 = I.lineupRows(parsed, 'home', fixture.home_team_id, idx2);
    const away2 = I.lineupRows(parsed, 'away', fixture.away_team_id, idx2);
    const now = new Date().toISOString();
    const wroteHome = await writeLineup(fixture.id, fixture.home_team_id, home2.rows, now);
    const wroteAway = await writeLineup(fixture.id, fixture.away_team_id, away2.rows, now);

    // ── state and events: compared, NOT written ─────────────────────────────
    const shadowState = I.stateRow(parsed);
    const shadowEvents = I.eventRows(fixture.internal_fixture_id || fixture.external_fixture_id, parsed, F.eventKey);
    let liveState = null, liveEvents = [];
    if (fixture.internal_fixture_id) {
      liveState = await liveStore.getState(fixture.internal_fixture_id);
      liveEvents = await liveStore.listEvents(fixture.internal_fixture_id);
    }
    const stateDiffs = I.compareState(liveState, shadowState);
    const eventCmp = I.compareEvents(liveEvents, shadowEvents);

    for (const d of stateDiffs) {
      await S.recordConflict({
        entity_type: 'match', entity_ref: String(fixture.internal_fixture_id || fixture.external_fixture_id),
        field_name: d.field, internal_value: String(d.live), provider_value: String(d.shadow),
        severity: 'review',
      });
    }

    await S.finishRun(run && run.id, {
      status: 'ok', request_count: 1,
      records_created: created.length,
      records_updated: wroteHome + wroteAway,
      warning_count: stateDiffs.length + eventCmp.onlyLive.length + eventCmp.onlyShadow.length,
    });

    return resp(200, {
      ok: true,
      shadow: true,
      fixture: {
        internal: fixture.internal_fixture_id, external: fixture.external_fixture_id,
        status: fixture.fixture_status,
      },
      lineups: {
        home: wroteHome, away: wroteAway,
        playersCreated: created.length,
        unresolved: home2.unresolved.concat(away2.unresolved).map((u) => ({ name: u.name, status: u.status })),
      },
      parity: {
        state: { identical: stateDiffs.length === 0, diffs: stateDiffs },
        events: eventCmp,
      },
      shadowState,
    });
  } catch (e) {
    await S.finishRun(run && run.id, { status: 'failed', final_error: String(e && e.message || e), error_count: 1 });
    return resp(200, { ok: false, error: String(e && e.message || e) });
  }
};
