// GATE 8 — is the football system actually working?
//
// Every part of this reports its own success. What nobody could see until now
// is the thing that matters most: whether anything has QUIETLY STOPPED. A timer
// that fails silently looks exactly like a timer with nothing to do, and the
// difference is invisible until a Saturday when the score does not move.
//
// So this answers one question per subsystem, in plain words, with the age of
// the last success — because "it ran" and "it ran recently" are different
// facts, and only the second one is reassuring.
//
// PIN-gated: it reports error text, run counts and provider state. That is the
// club's business, not the public's.
'use strict';

const adminOk = require('./lib/pin');
const S = require('./lib/football/store');
const CRESTS = require('./lib/football/crests');

const SEASON = process.env.FWP_SEASON || '2026-2027';

function resp(code, obj) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(obj, null, 1),
  };
}

function ageMinutes(iso) {
  const t = Date.parse(iso);
  if (!isFinite(t)) return null;
  return Math.round((Date.now() - t) / 60000);
}

/** How long ago, said the way a person would say it. */
function howLongAgo(mins) {
  if (mins == null) return 'never';
  if (mins < 2) return 'just now';
  if (mins < 60) return mins + ' minutes ago';
  const h = Math.round(mins / 60);
  if (h < 36) return h + ' hour' + (h === 1 ? '' : 's') + ' ago';
  return Math.round(h / 24) + ' days ago';
}

/**
 * One subsystem's verdict.
 * ok      — working, and recently
 * waiting — working, but nothing has happened yet (a legitimate state)
 * stale   — it succeeded once and has not since
 * failing — its last attempt failed
 */
function verdict(lastOkMins, expectedEveryMins, lastStatus) {
  if (lastStatus === 'failed') return 'failing';
  if (lastOkMins == null) return 'waiting';
  return lastOkMins > expectedEveryMins * 3 ? 'stale' : 'ok';
}

exports.handler = async function (event) {
  let body = {};
  try { body = JSON.parse((event && event.body) || '{}'); } catch (e) { /* GET */ }
  const q = (event && event.queryStringParameters) || {};
  if (!adminOk(body.pin || q.pin)) return resp(401, { ok: false, error: 'Sign in to see system health' });
  if (!S.configured()) return resp(200, { ok: false, error: 'supabase not configured' });

  try {
    const [runs, conflicts, fixtures, lineups, players, table, editions, live, teams, tableRows, crestLib] = await Promise.all([
      S.rest('football_sync_runs?select=sync_type,status,started_at,completed_at,error_count,final_error&order=started_at.desc&limit=120'),
      S.rest('football_source_conflicts?resolution_status=eq.open&select=entity_type,severity'),
      S.rest('football_fixtures?season=eq.' + encodeURIComponent(SEASON) +
        '&select=id,fixture_status,internal_fixture_id,home_team_id,away_team_id'),
      S.rest('football_lineups?select=fixture_id,status'),
      S.rest('football_players?select=identity_status,merged_into_id,current_team_id'),
      S.rest('football_league_tables?snapshot_type=eq.current&select=last_synced_at,source_updated_at&order=created_at.desc&limit=1'),
      S.rest('programme_editions?select=state').catch(() => []),
      S.rest('match_state?select=fixture_id,is_live,is_final,last_synced_at&order=last_synced_at.desc&limit=5').catch(() => []),
      S.rest('football_teams?select=id,canonical_name,crest_asset_path,active').catch(() => []),
      S.rest('football_league_table_rows?select=team_id,provider_team_name').catch(() => []),
      CRESTS.library().catch(() => ({})),
    ]);

    // ── the timers ──────────────────────────────────────────────────────────
    const byType = {};
    (runs || []).forEach((r) => {
      const t = byType[r.sync_type] || (byType[r.sync_type] = { last: null, lastOk: null, failures: 0 });
      if (!t.last) t.last = r;
      if (!t.lastOk && r.status === 'ok') t.lastOk = r;
      if (r.status === 'failed') t.failures++;
    });

    const EXPECTED = { match: 1, season: 20, table: 20, programme: 60 };
    const subsystems = Object.keys(EXPECTED).map((type) => {
      const t = byType[type] || {};
      const mins = t.lastOk ? ageMinutes(t.lastOk.completed_at || t.lastOk.started_at) : null;
      return {
        name: type,
        state: verdict(mins, EXPECTED[type], t.last && t.last.status),
        lastSuccess: howLongAgo(mins),
        lastSuccessMinutes: mins,
        expectedEveryMinutes: EXPECTED[type],
        recentFailures: t.failures || 0,
        // The provider's own words, not a paraphrase — a paraphrased error is
        // an error nobody can act on.
        lastError: (t.last && t.last.status === 'failed') ? t.last.final_error : null,
      };
    });

    // ── the data ────────────────────────────────────────────────────────────
    const played = (fixtures || []).filter((f) => f.fixture_status === 'played');
    const confirmedLineups = {};
    (lineups || []).forEach((l) => {
      if (l.status === 'confirmed') confirmedLineups[l.fixture_id] = (confirmedLineups[l.fixture_id] || 0) + 1;
    });
    const missingLineups = played.filter((f) => (confirmedLineups[f.id] || 0) < 2);

    const live1 = (players || []).filter((p) => !p.merged_into_id);
    const identity = {
      confirmed: live1.filter((p) => p.identity_status === 'confirmed').length,
      awaitingDecision: live1.filter((p) => p.identity_status !== 'confirmed').length,
      merged: (players || []).length - live1.length,
    };

    const tableAge = table && table[0] ? ageMinutes(table[0].last_synced_at) : null;
    const openConflicts = {
      total: (conflicts || []).length,
      critical: (conflicts || []).filter((c) => c.severity === 'critical').length,
    };

    /* ── CREST HEALTH ────────────────────────────────────────────────────
       Added after every opponent badge disappeared from the home page and
       this view reported everything green. It could not see the problem
       because it never looked: a club with no artwork renders a designed
       initials shield, which is correct for a club we genuinely have none
       for and indistinguishable from a club whose crest we lost.

       A team is ACTIVE if a fixture or a league-table row uses it. Those are
       the clubs the site will draw. A club nobody plays is not a problem. */
    const activeTeamIds = new Set();
    (fixtures || []).forEach((f) => {
      if (f.home_team_id) activeTeamIds.add(String(f.home_team_id));
      if (f.away_team_id) activeTeamIds.add(String(f.away_team_id));
    });
    (tableRows || []).forEach((r) => { if (r.team_id) activeTeamIds.add(String(r.team_id)); });

    const activeTeams = (teams || []).filter((t) => activeTeamIds.has(String(t.id)));
    const crestState = { healthy: [], fallback: [], stored: 0, fromLibrary: 0 };
    activeTeams.forEach((t) => {
      const stored = t.crest_asset_path && String(t.crest_asset_path).trim();
      const fromLib = CRESTS.forName(crestLib || {}, t.canonical_name);
      if (stored) { crestState.stored++; crestState.healthy.push(t.canonical_name); }
      else if (fromLib) { crestState.fromLibrary++; crestState.healthy.push(t.canonical_name); }
      else crestState.fallback.push(t.canonical_name);
    });

    const crests = {
      activeTeams: activeTeams.length,
      withStoredCrest: crestState.stored,
      // Resolvable by the browser even though the registry has not stored it.
      // Not a failure, but not finished either — it is named so it gets fixed.
      resolvableFromLibrary: crestState.fromLibrary,
      // The ones that will render as two grey letters.
      usingInitialsFallback: crestState.fallback.length,
      clubsWithoutCrest: crestState.fallback.sort(),
      state: crestState.fallback.length ? 'missing'
        : (crestState.fromLibrary ? 'library_only' : 'ok'),
    };

    // A subsystem in its own right, so it shows in the list rather than being
    // a footnote under a green heading.
    subsystems.push({
      name: 'crests',
      state: crests.state === 'missing' ? 'failing'
        : (crests.state === 'library_only' ? 'stale' : 'ok'),
      lastSuccess: crests.state === 'ok' ? 'current' : 'incomplete',
      lastSuccessMinutes: null,
      expectedEveryMinutes: null,
      recentFailures: crests.usingInitialsFallback,
      lastError: crests.usingInitialsFallback
        ? crests.usingInitialsFallback + ' active club(s) have no crest: ' +
          crests.clubsWithoutCrest.slice(0, 6).join(', ')
        : (crests.resolvableFromLibrary
          ? crests.resolvableFromLibrary + ' club(s) resolve only in the browser — the registry has not stored their crest'
          : null),
    });

    /* Player identities are ADVISORY, never a failure.
       An unconfirmed name stops nothing — fixtures, live scores, programmes and
       Match Centre pages all work without it, and the system is DESIGNED not to
       guess. Reporting "football system failed" because a committee has not yet
       reviewed a squad would be crying wolf, and the next real failure would be
       ignored. It becomes a genuine fault only if a public profile or statistic
       is actually misleading — which cannot happen while nothing is confirmed. */
    const identityAdvisory = identity.awaitingDecision > 0 ? {
      state: 'advisory',
      headline: 'Player records awaiting club review',
      detail: identity.awaitingDecision + ' match name' +
        (identity.awaitingDecision === 1 ? '' : 's') + ' waiting to be confirmed. ' +
        'Nothing is blocked by this.',
    } : null;

    // THE INVARIANT: this view must never say everything is fine while a club
    // the site is about to draw has no visual identity.
    const worst = ['failing', 'stale', 'waiting', 'ok']
      .filter((s) => subsystems.some((x) => x.state === s))[0] || 'ok';

    return resp(200, {
      ok: true,
      season: SEASON,
      overall: worst,
      // The sentence a committee member should be able to read and act on.
      summary: crests.state === 'missing'
        ? crests.usingInitialsFallback + ' club(s) on the fixture list have no crest.'
        : worst === 'ok'
        ? 'Everything is running.'
        : worst === 'failing' ? 'Something is failing — see which, below.'
        : worst === 'stale' ? 'Something has quietly stopped updating.'
        : 'Running, but nothing has happened yet.',
      subsystems: subsystems,
      fixtures: {
        total: (fixtures || []).length,
        played: played.length,
        missingLineups: missingLineups.length,
        // Named, not just counted: "3 missing" is a number, and a number is not
        // something anybody can go and fix.
        missingLineupFixtures: missingLineups.slice(0, 8).map((f) => f.internal_fixture_id),
      },
      identity: identity,
      identityAdvisory,
      leagueTable: {
        lastSynced: howLongAgo(tableAge),
        lastSyncedMinutes: tableAge,
        present: !!(table && table[0]),
      },
      conflicts: openConflicts,
      crests,
      programmes: (editions || []).reduce((m, e) => {
        m[e.state] = (m[e.state] || 0) + 1; return m;
      }, {}),
      liveMatches: (live || []).filter((s) => s.is_live).map((s) => s.fixture_id),
    });
  } catch (e) {
    return resp(200, { ok: false, error: String((e && e.message) || e) });
  }
};
