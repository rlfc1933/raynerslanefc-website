// GATE 2 — season fixture registry, in shadow.
//
// Reads the club's season from Football Web Pages, reconciles it against
// data/fixtures.json, and writes the result into the football_* registry.
//
// SHADOW BY DEFAULT. It populates the registry and records disagreements; it
// changes nothing the public site reads. The live scoreboard, the homepage and
// data/fixtures.json are untouched. Pass ?apply=1 with the PIN once shadow
// output has been reviewed — and even then it only writes the registry, never
// the committed JSON.
//
// Nothing in here decides to overwrite a fact. Where the provider and the club
// disagree, it records a conflict for a human. Silently accepting the provider
// is how a wrong score becomes the club's permanent record.

'use strict';

const adminOk = require('./lib/pin');
const F = require('./lib/fwp');
const R = require('./lib/football/reconcile');
const S = require('./lib/football/store');
const MT = require('../../js/match-time');

const SEASON = process.env.FWP_SEASON || '2026-2027';
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://raynerslanefc.co.uk';

function resp(code, obj) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(obj, null, 1),
  };
}

async function loadInternalFixtures() {
  const urls = [
    'https://raw.githubusercontent.com/rlfc1933/raynerslanefc-website/main/data/fixtures.json',
    SITE_ORIGIN + '/data/fixtures.json?t=' + Date.now(),
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(9000) });
      if (!r.ok) continue;
      const j = await r.json();
      if (j && j.fixtures && j.fixtures.length) return j.fixtures;
    } catch (e) { /* next */ }
  }
  return [];
}

/** Our season label ('2026-27') from the provider's ('2026-2027'). */
function clubSeason(providerSeason) {
  const m = String(providerSeason).match(/^(\d{4})-(\d{4})$/);
  return m ? m[1] + '-' + m[2].slice(2) : providerSeason;
}

function competitionType(name) {
  const c = String(name || '');
  if (/friendly/i.test(c)) return 'friendly';
  if (/\bfa (cup|vase|trophy)\b/i.test(c)) return 'fa_competition';
  if (/county|middlesex/i.test(c)) return 'county_cup';
  if (/\bcup\b|\bvase\b|\btrophy\b|\bshield\b/i.test(c)) return 'league_cup';
  return 'league';
}

// ── caches ──────────────────────────────────────────────────────────────────
// The first version did two team lookups, a competition lookup and a write PER
// FIXTURE — roughly 160 sequential round-trips for a 40-match season. It ran in
// 26.1 seconds against a 26-second ceiling, which is not a margin, it is a coin
// toss. Everything is now loaded once and written in one batch.
async function loadCaches() {
  const [teams, aliases, comps] = await Promise.all([
    S.rest('football_teams?select=id,canonical_name,external_team_id'),
    S.rest('football_team_aliases?select=team_id,normalised'),
    S.rest('football_competitions?select=id,external_competition_id,season'),
  ]);
  const teamByKey = {};
  (aliases || []).forEach((a) => { teamByKey[a.normalised] = a.team_id; });
  const compByKey = {};
  (comps || []).forEach((c) => { compByKey[c.external_competition_id + '|' + c.season] = c.id; });
  return { teamByKey, compByKey, teamCount: (teams || []).length };
}

/** Create any team we have not seen before, in ONE round-trip for the season. */
async function ensureTeams(names, cache) {
  const missing = [];
  const seen = {};
  for (const n of names) {
    const key = F.clubKey(n.name);
    if (cache.teamByKey[key] || seen[key]) continue;
    seen[key] = true;
    missing.push({ name: n.name, key: key, providerSlug: n.providerSlug });
  }
  if (!missing.length) return 0;

  const rows = missing.map((m) => ({
    canonical_name: m.name, display_name: m.name, slug: F.slug(m.name),
    external_provider: 'fwp', external_team_id: m.providerSlug || F.slug(m.name),
    provider_name: m.name,
    is_rayners_lane: F.sameClub(m.name, R.CLUB), active: true,
  }));
  const saved = await S.rest('football_teams?on_conflict=external_provider,external_team_id', {
    method: 'POST', body: rows,
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  }) || [];

  const aliasRows = [];
  saved.forEach((t) => {
    const m = missing.filter((x) => (x.providerSlug || F.slug(x.name)) === t.external_team_id)[0];
    const key = m ? m.key : F.clubKey(t.canonical_name);
    cache.teamByKey[key] = t.id;
    aliasRows.push({ team_id: t.id, alias: t.canonical_name, normalised: key, source: 'fwp', confidence: 'confirmed' });
  });
  if (aliasRows.length) {
    await S.rest('football_team_aliases?on_conflict=normalised', {
      method: 'POST', body: aliasRows,
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
  }
  return saved.length;
}

async function ensureCompetitions(list, cache) {
  const missing = [];
  const seen = {};
  for (const c of list) {
    if (!c.name) continue;
    const ext = c.providerSlug || F.slug(c.name);
    const key = ext + '|' + SEASON;
    if (cache.compByKey[key] || seen[key]) continue;
    seen[key] = true;
    missing.push({ name: c.name, ext: ext, key: key });
  }
  if (!missing.length) return 0;
  const saved = await S.rest('football_competitions?on_conflict=external_provider,external_competition_id,season', {
    method: 'POST',
    body: missing.map((m) => ({
      external_provider: 'fwp', external_competition_id: m.ext,
      canonical_name: m.name, provider_name: m.name, display_name: m.name,
      slug: F.slug(m.name), season: SEASON,
      competition_type: competitionType(m.name), active: true,
    })),
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  }) || [];
  saved.forEach((c) => { cache.compByKey[c.external_competition_id + '|' + c.season] = c.id; });
  return saved.length;
}

exports.handler = async function (event) {
  const q = (event && event.queryStringParameters) || {};
  let body = {};
  try { body = JSON.parse((event && event.body) || '{}'); } catch (e) { /* GET */ }

  // Applying requires the PIN. Shadow does not: it writes only to registry
  // tables nothing reads yet, and being able to inspect it freely is the point.
  const apply = q.apply === '1' || body.apply === true;
  if (apply && !adminOk(body.pin || q.pin)) {
    return resp(401, { ok: false, error: 'Applying requires sign-in' });
  }
  if (!F.isEnabled()) {
    return resp(200, { ok: true, enabled: false, reason: 'FWP_SYNC_ENABLED is not true' });
  }
  if (!S.configured()) return resp(200, { ok: false, error: 'supabase not configured' });

  const run = await S.startRun('season', !apply, null);
  const counters = { request_count: 1, records_created: 0, records_updated: 0, warning_count: 0, error_count: 0 };

  try {
    const listRes = await F.fetchFixtureList();
    if (!listRes.ok) {
      await S.finishRun(run && run.id, { status: 'failed', final_error: listRes.error || 'fetch failed', error_count: 1 });
      return resp(200, { ok: false, error: listRes.error || 'could not reach the provider' });
    }
    const parsed = F.parseFixtureList(listRes.body);
    const valid = F.validateFixtureList(parsed, SEASON);
    if (!valid.ok) {
      // The season guard. Importing the wrong year over the right one is the
      // single most destructive thing this function could do.
      await S.finishRun(run && run.id, { status: 'failed', final_error: valid.errors.join('; '), error_count: 1 });
      return resp(200, { ok: false, error: 'rejected: ' + valid.errors.join('; ') });
    }

    const internal = await loadInternalFixtures();
    const rec = R.reconcileSeason(parsed.fixtures, internal);

    // One pass to collect identities, one batch to write them.
    const teamNames = [];
    const comps = [];
    for (const m of rec.matched) {
      const p = m.provider;
      teamNames.push({ name: p.isHome ? R.CLUB : p.opponent, providerSlug: p.homeSlug });
      teamNames.push({ name: p.isHome ? p.opponent : R.CLUB, providerSlug: p.awaySlug });
      comps.push({ name: p.competition, providerSlug: p.competitionSlug });
    }
    const cache = await loadCaches();
    counters.records_created += await ensureTeams(teamNames, cache);
    counters.records_created += await ensureCompetitions(comps, cache);

    const fixtureRows = rec.matched.map((m) => {
      const p = m.provider;
      const homeName = p.isHome ? R.CLUB : p.opponent;
      const awayName = p.isHome ? p.opponent : R.CLUB;
      // A played fixture reports no kick-off time, so fall back to the club's
      // own record rather than inventing 15:00.
      const koTime = p.kickoff || (m.internal && m.internal.kickoff) || null;
      const koEpoch = koTime ? MT.parseLondonKickoff(p.date, koTime) : NaN;
      return {
        internal_fixture_id: m.internal ? m.internal.id : null,
        external_provider: 'fwp',
        external_fixture_id: p.externalFixtureId,
        season: SEASON,
        competition_id: cache.compByKey[(p.competitionSlug || F.slug(p.competition)) + '|' + SEASON] || null,
        home_team_id: cache.teamByKey[F.clubKey(homeName)] || null,
        away_team_id: cache.teamByKey[F.clubKey(awayName)] || null,
        scheduled_kickoff_at: isFinite(koEpoch) ? new Date(koEpoch).toISOString() : null,
        club_timezone: 'Europe/London',
        original_provider_date: p.date,
        original_provider_time: p.providerKoCell || null,
        venue: (m.internal && m.internal.venue) || null,
        fixture_status: p.played ? 'played' : 'scheduled',
        is_home_fixture: p.isHome,
        first_team: true,
        programme_eligible: R.programmeEligible(p),
        source_updated_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        sync_status: 'ok',
        source_confidence: m.confidence,
      };
    });
    // ── never overwrite a known fact with a blank ──────────────────────────
    // This upsert replaces the whole row. That was tolerable while a person
    // pressed a button occasionally; now that it runs every twenty minutes, a
    // single provider response that omits a kick-off time or a venue would
    // quietly erase one — and the next run would erase it again, so nobody
    // would ever catch it in the act.
    //
    // A provider that says nothing is not a provider that says "nothing".
    const existing = await S.rest('football_fixtures?season=eq.' + encodeURIComponent(SEASON) +
      '&select=external_fixture_id,scheduled_kickoff_at,venue,internal_fixture_id') || [];
    const known = {};
    existing.forEach((e) => { known[e.external_fixture_id] = e; });
    const KEEP = ['scheduled_kickoff_at', 'venue', 'internal_fixture_id'];
    let preserved = 0;
    fixtureRows.forEach((row) => {
      const prev = known[row.external_fixture_id];
      if (!prev) return;
      KEEP.forEach((f) => {
        if (row[f] == null && prev[f] != null) { row[f] = prev[f]; preserved++; }
      });
    });

    const savedFixtures = await S.rest('football_fixtures?on_conflict=external_provider,external_fixture_id,season', {
      method: 'POST', body: fixtureRows,
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, timeout: 15000,
    });
    counters.warning_count += 0;
    counters.records_updated += fixtureRows.length;
    const written = fixtureRows.map((f) => f.external_fixture_id);

    // Disagreements go to a human, never to an automatic overwrite.
    for (const c of rec.conflicts) {
      await S.recordConflict({
        entity_type: 'fixture', entity_ref: c.fixtureId, field_name: c.field,
        internal_value: String(c.internal), provider_value: String(c.provider),
        severity: c.severity,
      });
      if (c.severity === 'critical') counters.warning_count++;
    }
    for (const u of rec.unmatchedProvider) {
      await S.recordConflict({
        entity_type: 'fixture', entity_ref: 'fwp:' + u.provider.externalFixtureId,
        field_name: 'match', internal_value: null,
        provider_value: u.provider.date + ' v ' + u.provider.opponent,
        severity: u.confidence === 'rejected' ? 'critical' : 'review',
      });
      counters.warning_count++;
    }

    await S.finishRun(run && run.id, Object.assign({ status: 'ok' }, counters));

    return resp(200, {
      ok: true,
      shadow: !apply,
      season: SEASON,
      summary: rec.summary,
      fixturesWritten: written.length,
      // Said out loud: how many facts this run declined to erase.
      fieldsPreserved: preserved,
      unmatchedProvider: rec.unmatchedProvider.map((u) => ({
        date: u.provider.date, opponent: u.provider.opponent,
        id: u.provider.externalFixtureId, confidence: u.confidence, reasons: u.reasons,
      })),
      unmatchedInternal: rec.unmatchedInternal.map((f) => ({ id: f.id, date: f.date, opponent: f.opponent })),
      conflicts: rec.conflicts,
    });
  } catch (e) {
    await S.finishRun(run && run.id, { status: 'failed', final_error: String(e && e.message || e), error_count: 1 });
    return resp(200, { ok: false, error: String(e && e.message || e) });
  }
};

exports._internal = { clubSeason, competitionType };
