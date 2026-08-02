// GATE 4 — the one league-table sync service.
//
// The table on fixtures.html has been coming from WIKIPEDIA
// (netlify/functions/fetch-table.js). It happens to be accurate today, and the
// two sources were compared before this was written — both had Rayners Lane
// 10th on 1 point after the 3-3. But a community-edited encyclopaedia is not
// the competition's own record, and nothing was validating season or division.
//
// This service takes the table from the same provider that supplies the match
// data, validates it, maps rows onto real teams, and stores it as a SNAPSHOT so
// an archived programme keeps the standings that existed on its matchday.
//
// It will never replace a good table with a bad one: a rejected or empty
// response leaves the last confirmed snapshot exactly where it is.
'use strict';

const adminOk = require('./lib/pin');
const F = require('./lib/fwp');
const S = require('./lib/football/store');

const SEASON = process.env.FWP_SEASON || '2026-2027';
const TEAM_SLUG = process.env.FWP_TEAM_SLUG || 'rayners-lane';

function resp(code, obj) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(obj, null, 1),
  };
}

/** A stable fingerprint of the standings, so an unchanged table is not restored. */
function tableHash(rows) {
  return rows.map((r) => [r.position, r.teamKey, r.played, r.points, r.goalDifference].join(':')).join('|');
}

exports.handler = async function (event) {
  const q = (event && event.queryStringParameters) || {};
  let body = {};
  try { body = JSON.parse((event && event.body) || '{}'); } catch (e) { /* GET */ }
  if ((q.apply === '1' || body.apply === true) && !adminOk(body.pin || q.pin)) {
    return resp(401, { ok: false, error: 'Applying requires sign-in' });
  }
  if (!F.isEnabled()) return resp(200, { ok: true, enabled: false, reason: 'FWP_SYNC_ENABLED is not true' });
  if (!S.configured()) return resp(200, { ok: false, error: 'supabase not configured' });

  const run = await S.startRun('table', false, null);
  try {
    const r = await F.request(F.embedUrl(TEAM_SLUG + '/league-table', {}));
    if (!r.ok || !r.body) {
      // Reaching the provider failed. The last confirmed snapshot stands.
      await S.finishRun(run && run.id, { status: 'failed', final_error: r.error || 'no body', error_count: 1 });
      return resp(200, { ok: false, error: r.error || 'could not reach the provider', keptPrevious: true });
    }
    const parsed = F.parseLeagueTable(r.body);
    const valid = F.validateLeagueTable(parsed, { minTeams: 16 });
    if (!valid.ok) {
      // A wrong division, a missing club, malformed rows or a challenge page.
      // Refusing is the point: an empty table must never erase a good one.
      await S.finishRun(run && run.id, { status: 'failed', final_error: valid.errors.join('; '), error_count: 1 });
      return resp(200, { ok: false, error: 'rejected: ' + valid.errors.join('; '), keptPrevious: true });
    }

    const competition = await S.findOne('football_competitions',
      'competition_type=eq.league&season=eq.' + encodeURIComponent(SEASON));
    const compId = competition ? competition.id : null;

    // Skip an identical table rather than stacking a duplicate snapshot.
    const latest = await S.rest('football_league_tables?snapshot_type=eq.current&select=id&order=created_at.desc&limit=1');
    const latestId = latest && latest[0] ? latest[0].id : null;
    let previousRows = [];
    if (latestId) {
      previousRows = await S.rest('football_league_table_rows?table_id=eq.' + latestId +
        '&select=position,provider_team_name,played,points,goal_difference&order=position.asc') || [];
    }
    const prevHash = previousRows.map((r) => [r.position, F.clubKey(r.provider_team_name), r.played, r.points, r.goal_difference].join(':')).join('|');
    const nextHash = tableHash(parsed.rows);
    if (prevHash && prevHash === nextHash) {
      await S.finishRun(run && run.id, { status: 'ok', request_count: 1, no_change_response_count: 1 });
      return resp(200, {
        ok: true, changed: false, snapshotId: latestId,
        teams: parsed.rows.length,
        ourRow: parsed.ourRow,
        note: 'the provider table is unchanged — no new snapshot',
      });
    }

    // Map provider rows onto real teams. An unmatched row is recorded, not
    // guessed: a wrong team on a league table is a wrong league table.
    const aliases = await S.rest('football_team_aliases?select=team_id,normalised') || [];
    const byKey = {};
    aliases.forEach((a) => { byKey[a.normalised] = a.team_id; });

    const snap = await S.upsert('football_league_tables', {
      competition_id: compId, season: SEASON, snapshot_type: 'current',
      source_updated_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    });
    if (!snap) throw new Error('could not create a table snapshot');

    const unresolved = [];
    const rows = parsed.rows.map((row) => {
      const teamId = byKey[row.teamKey] || null;
      if (!teamId) unresolved.push(row.providerTeamName);
      return {
        table_id: snap.id, team_id: teamId,
        provider_team_name: row.providerTeamName,
        position: row.position, played: row.played, won: row.won,
        drawn: row.drawn, lost: row.lost,
        goals_for: row.goalsFor, goals_against: row.goalsAgainst,
        goal_difference: row.goalDifference, points: row.points,
      };
    });
    await S.rest('football_league_table_rows', {
      method: 'POST', body: rows, headers: { Prefer: 'return=minimal' },
    });

    for (const name of unresolved) {
      await S.recordConflict({
        entity_type: 'table', entity_ref: String(snap.id), field_name: 'team',
        internal_value: null, provider_value: name, severity: 'review',
      });
    }

    await S.finishRun(run && run.id, {
      status: 'ok', request_count: 1, changed_response_count: 1,
      records_created: rows.length, warning_count: unresolved.length,
    });

    return resp(200, {
      ok: true, changed: true, snapshotId: snap.id,
      season: SEASON, teams: rows.length,
      ourRow: parsed.ourRow,
      unresolvedTeams: unresolved,
    });
  } catch (e) {
    await S.finishRun(run && run.id, { status: 'failed', final_error: String(e && e.message || e), error_count: 1 });
    return resp(200, { ok: false, error: String(e && e.message || e), keptPrevious: true });
  }
};

exports._internal = { tableHash };
