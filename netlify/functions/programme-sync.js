// GATE 6 — generate, and publish when the teams are out.
//
// Runs on a schedule. Two jobs:
//   1. Make sure every eligible future home fixture has a private draft.
//   2. On matchday, publish the moment Football Web Pages confirms both elevens.
//
// Nobody presses anything. The committee's only involvement is optional
// editorial they may add if they want to.
'use strict';

const adminOk = require('./lib/pin');
const S = require('./lib/football/store');
const READ = require('./lib/football/read');
const RULES = require('./lib/programme/publish-rules');
const GEN = require('./lib/programme/generate');
const F = require('./lib/fwp');
const CRESTS = require('./lib/football/crests');
const LEGAL = require('./lib/programme/legal');
const LC = require('./lib/programme/lifecycle');
const MT = require('../../js/match-time');

const SEASON = process.env.FWP_SEASON || '2026-2027';
const SITE = process.env.SITE_ORIGIN || 'https://raynerslanefc.co.uk';

function resp(code, obj) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(obj, null, 1),
  };
}

function slugFor(f) {
  const s = (x) => String(x || '').toLowerCase().replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const d = f.scheduled_kickoff_at ? String(f.scheduled_kickoff_at).slice(0, 10) : '';
  return [d, s(f._homeName), 'v', s(f._awayName)].filter(Boolean).join('-');
}

/**
 * A club data file.
 *
 * THE .json WAS MISSING. This fetched /data/committee — no extension — which
 * 404s. So committee and sponsors were ALWAYS null, staffGroups and
 * sponsorTiers were ALWAYS empty, both are MANDATORY sections, and
 * mandatory_content_valid could therefore never be true.
 *
 * The programme engine has never been able to publish a single edition since it
 * was written. Not Wallingford, not anything. It reported "waiting for
 * matchday" and looked patient rather than broken, because a 404 here returns
 * null and an empty section is indistinguishable from one not filled in yet.
 *
 * The name is normalised so a caller cannot reintroduce it, and a failure is
 * now returned rather than swallowed, so the reason reaches the portal.
 */
async function loadJson(name) {
  const file = String(name).replace(/\.json$/i, '') + '.json';
  try {
    const r = await fetch(SITE + '/data/' + file + '?t=' + Date.now(), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) { console.error('programme: /data/' + file + ' returned ' + r.status); return null; }
    return await r.json();
  } catch (e) {
    console.error('programme: /data/' + file + ' failed: ' + (e && e.message));
    return null;
  }
}

/** Everything the generator needs, gathered from what the club already holds. */
async function buildContext(fx, teams, comps) {
  const home = teams[fx.home_team_id] || {};
  const away = teams[fx.away_team_id] || {};

  /* ── artwork, captured WITH the edition ─────────────────────────────────
     A programme version is immutable, so its crests must be baked in at
     publication. The reader deliberately does not resolve anything at read
     time — an archived edition reaching for a current asset would rewrite the
     past — which means an edition published while crest_asset_path was still
     null would show two grey letters on its cover for ever.

     So the artwork is resolved here, and written back to the registry, before
     anything is generated. Never overwrites a crest the registry already has. */
  try {
    const lib = await CRESTS.library();
    for (const t of [home, away]) {
      if (!t || !t.id) continue;
      if (CRESTS.patchFor(t.crest_asset_path, t.canonical_name).keep) continue;
      const file = CRESTS.forName(lib, t.canonical_name);
      if (!file) continue;
      t.crest_asset_path = file;
      await S.rest('football_teams?id=eq.' + t.id, {
        method: 'PATCH', body: { crest_asset_path: file },
        headers: { Prefer: 'return=minimal' },
      }).catch(() => null);
    }
  } catch (e) { /* the cover falls back to its designed shield */ }

  const comp = comps[fx.competition_id] || {};
  const [committee, sponsors, table, results, seasonList] = await Promise.all([
    loadJson('committee'), loadJson('sponsors'),
    READ.leagueTable(), READ.results(SEASON), READ.season(SEASON),
  ]);

  const oppName = fx.is_home_fixture ? away.canonical_name : home.canonical_name;
  const oppRow = table && table.rows
    ? table.rows.filter((r) => F.sameClub(r.team, oppName))[0] || null : null;

  // Staff, grouped, using only what the club already publishes.
  const people = (committee && (committee.committee || committee.members)) || [];
  const groups = [];
  if (people.length) {
    const football = people.filter((p) => /manager|coach|physio|kit|analyst/i.test(p.role || ''));
    const cmte = people.filter((p) => football.indexOf(p) === -1);
    if (cmte.length) groups.push({ title: 'Club Committee', people: cmte.map(shapePerson) });
    if (football.length) groups.push({ title: 'Football Staff', people: football.map(shapePerson) });
  }
  function shapePerson(p) {
    // Never a private phone number or personal email in a public programme.
    return { role: p.role || '', name: p.name || '', photo: p.photo || null };
  }

  const active = ((sponsors && sponsors.sponsors) || []).filter((s) => s.active !== false);
  const tierOrder = ['Presenting Partner', 'Official Kit Partner', 'Match Partner', 'Principal Partner', 'Supporting Partner', 'Community Partner'];
  const tiers = [];
  tierOrder.forEach((t) => {
    const inTier = active.filter((s) => (s.tier || s.category || '') === t);
    if (inTier.length) tiers.push({ tier: t, sponsors: inTier });
  });
  const untiered = active.filter((s) => tierOrder.indexOf(s.tier || s.category || '') === -1);
  if (untiered.length) tiers.push({ tier: 'Our Partners', sponsors: untiered });

  const upcoming = seasonList
    .filter((f) => f.status === 'scheduled' && Date.parse(f.kickoffAt) > Date.parse(fx.scheduled_kickoff_at))
    .slice(0, 4);

  return {
    homeTeam: home.canonical_name, awayTeam: away.canonical_name,
    homeCrest: home.crest_asset_path, awayCrest: away.crest_asset_path,
    opponent: oppName, opponentCrest: (fx.is_home_fixture ? away : home).crest_asset_path,
    competition: comp.canonical_name, competitionType: comp.competition_type,
    kickoffAt: fx.scheduled_kickoff_at, venue: fx.venue, season: fx.season,
    table, oppositionRow: oppRow,
    opponentKey: (name) => F.sameClub(name, oppName),
    staffGroups: groups, sponsorTiers: tiers,
    recentResults: results.slice(-4).reverse(),
    upcomingFixtures: upcoming,
    clubHistory: { founded: 1933, body: 'Rayners Lane Football Club has played in Harrow since 1933.' },
    // Only what the club can actually offer. Tithe Farm is shared and not the
    // club's, so pitch-side boards and venue advertising are never listed.
    sponsorshipOptions: [
      { name: 'Match sponsorship' }, { name: 'Match-ball sponsorship' },
      { name: 'Programme advertising' }, { name: 'Player sponsorship' },
    ],
    sponsorshipContact: 'info@raynerslanefc.co.uk',
  };
}

async function lineupsFor(fixtureRowId, fx) {
  const rows = await S.rest('football_lineups?select=*,football_lineup_players(*)&fixture_id=eq.' + fixtureRowId) || [];
  const out = { home: null, away: null };
  rows.forEach((l) => {
    const players = (l.football_lineup_players || [])
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((p) => ({ name: p.provider_player_name, number: p.shirt_number, role: p.lineup_role, isCaptain: p.is_captain }));
    const side = {
      status: l.status, fixtureId: l.fixture_id, teamId: l.team_id,
      sourceUpdatedAt: l.source_updated_at, players,
      starters: players.filter((p) => p.role === 'starter'),
      substitutes: players.filter((p) => p.role === 'substitute' || p.role === 'unused'),
    };
    if (String(l.team_id) === String(fx.home_team_id)) out.home = side; else out.away = side;
  });
  return out;
}


/**
 * The version number this run should write, and whether it is repairing one.
 *
 * A publication is two writes: insert the immutable version, then point the
 * edition at it. They are not in a transaction. When the second write failed —
 * as it did on a check constraint — the version row existed while the edition
 * still said current_version = 0, so the next run computed the same number
 * again and collided with a unique index (23505). The edition could never
 * publish, and each attempt failed a little further along than the last.
 *
 * So the versions table is the source of truth for the number, and a version
 * that exists beyond what the edition has acknowledged is REUSED rather than
 * duplicated. That makes a repeated run a repair instead of a collision.
 */
async function nextVersion(editionId, edition) {
  const rows = await S.rest('programme_versions?edition_id=eq.' + editionId +
    '&select=version&order=version.desc&limit=1') || [];
  const highest = rows.length ? Number(rows[0].version) : 0;
  const acknowledged = Number(edition.current_version || 0);
  if (highest > acknowledged) {
    // A previous run wrote this and never got to record it. Finish that job.
    return { version: highest, repairing: true };
  }
  return { version: highest + 1, repairing: false };
}

/* The club's legal identity, from the club's own published data. Never
   invented: Rule 2.15 requires the legal FORM as well as the name, and the
   club has not published one, so the footer says so rather than guessing. */
async function loadClubLegal() {
  const j = await loadJson('club-legal').catch(() => null);
  return {
    legalName: (j && j.legalName) || 'Rayners Lane Football Club',
    legalForm: (j && j.legalForm) || '',
    identifier: (j && j.identifier) || '',
  };
}

/* ── the publishing-system schema (20261009150000) ─────────────────────────
   The new columns and tables arrive with a migration that has to be applied
   by a person. Until it is, the engine must keep working exactly as before
   rather than failing every run on a missing column — so it looks once per
   run and writes the new fields only when they exist. */
async function hasPublishingSchema() {
  try {
    await S.rest('programme_versions?select=content_hash,stage&limit=1');
    await S.rest('programme_publication_events?select=id&limit=1');
    return true;
  } catch (e) { return false; }
}

/* States added by 20261009150000. Before that migration is applied the old
   CHECK constraint would reject them (a 23514 fails the whole PATCH), so they
   are written as their nearest legacy equivalent — both non-public. */
const LEGACY_STATE = { postponed: 'withheld', cancelled: 'withheld', ready_for_review: 'waiting_for_matchday',
  approved: 'waiting_for_matchday', publication_error: 'withheld', not_required: 'withheld',
  awaiting_fixture_confirmation: 'draft_hidden' };
function storableState(state, v2) { return v2 ? state : (LEGACY_STATE[state] || state); }

/** The fixture id every surface uses — the read layer's own rule. */
function keyFor(fx) {
  return fx.internal_fixture_id || ('fwp-' + fx.external_fixture_id);
}

/** An audited transition. Idempotent: a retried job writes the same key. */
async function logEvent(v2, edition, type, extra) {
  if (!v2 || !edition) return;
  const e = extra || {};
  await S.rest('programme_publication_events?on_conflict=idempotency_key', {
    method: 'POST',
    body: [{ edition_id: edition.id, event_type: type, from_state: e.from || null, to_state: e.to || null,
      version: e.version || null, actor: e.actor || 'programme-sync', reason: e.reason || null,
      detail: e.detail || null, idempotency_key: e.key || null }],
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
  }).catch(() => null);
}

/**
 * The ONE place a version is written. Every path — first publication, the
 * team-sheet revision, full-time enrichment, the retrospective Archive
 * Edition — comes through here, so the repair-not-collide rule and the
 * same-content-is-the-same-revision rule apply to all of them.
 */
async function writeVersion(edition, row, opts) {
  const o = opts || {};
  const hash = LC.contentHash({ payload: row.payload, lineups: row.lineup_snapshot,
    final: row.final_match_snapshot, stage: o.stage || null });
  if (o.v2) {
    const same = await S.rest('programme_versions?edition_id=eq.' + edition.id +
      '&content_hash=eq.' + hash + '&select=version&limit=1').catch(() => []);
    if (same && same[0]) return { version: Number(same[0].version), duplicate: true };
  }
  const v = await nextVersion(edition.id, edition);
  const body = Object.assign({ edition_id: edition.id, version: v.version }, row);
  if (o.v2) Object.assign(body, { stage: o.stage || null, content_hash: hash, revision_reason: o.reason || null });
  await S.rest('programme_versions?on_conflict=edition_id,version', {
    method: 'POST', body: [body],
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  });
  return { version: v.version, repairing: v.repairing };
}

/** Approved editorial sections and approved sponsor placements, if the tables exist. */
async function loadEditorial(v2, edition, season) {
  if (!v2) return { sections: [], placements: [] };
  const [sections, placements] = await Promise.all([
    S.rest('programme_sections?or=(edition_id.eq.' + edition.id + ',edition_id.is.null)&select=*').catch(() => []),
    S.rest('programme_sponsor_placements?or=(edition_id.eq.' + edition.id + ',season.eq.' +
      encodeURIComponent(season) + ')&approval_status=eq.approved&select=*').catch(() => []),
  ]);
  return { sections: sections || [], placements: placements || [] };
}

function clubDateLong(iso) {
  const ms = Date.parse(iso);
  if (!isFinite(ms)) return null;
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric',
    month: 'long', year: 'numeric' }).format(new Date(ms));
}

/**
 * Build and publish a retrospective Archive Edition for one played fixture.
 * Exported so the HQ action and the scheduled run share one implementation.
 */
async function publishRetrospective(ctx) {
  const { fx, edition, teams, comps, result, v2, clubLegal, nowIso, reasons } = ctx;
  const ko = Date.parse(fx.scheduled_kickoff_at);
  const home = teams[fx.home_team_id] || {}, away = teams[fx.away_team_id] || {};
  const comp = comps[fx.competition_id] || {};
  const confirmedTime = fx.kickoff_time_confirmed !== false;
  const lineups = await lineupsFor(fx.id, fx);
  const ts = LC.teamSheets(lineups.home, lineups.away, fx);
  const built = LC.retrospectiveEdition({
    homeTeam: home.canonical_name, awayTeam: away.canonical_name,
    homeCrest: home.crest_asset_path, awayCrest: away.crest_asset_path,
    competition: comp.canonical_name, season: fx.season, venue: fx.venue || null,
    dateLong: clubDateLong(fx.scheduled_kickoff_at),
    // A time the registry does not know is never printed.
    kickoff: confirmedTime && isFinite(ko) ? MT.formatKickoffClub(ko) : null,
    kickoffTimeConfirmed: confirmedTime, result, teams: ts,
    sources: [{ label: 'Football Web Pages match record', ref: 'FWP ' + fx.external_fixture_id }],
    clubHistory: { founded: 1933, body: 'Rayners Lane Football Club has played in Harrow since 1933.' },
  });
  const finalMatch = { homeTeam: home.canonical_name, awayTeam: away.canonical_name,
    homeScore: result.home, awayScore: result.away, status: 'FULL TIME', venue: fx.venue || null,
    events: [], capturedAt: nowIso };
  const w = await writeVersion(edition, {
    payload: built, lineup_snapshot: { status: ts.status }, table_snapshot: null,
    sponsor_snapshot: null, staff_snapshot: null, final_match_snapshot: finalMatch,
    legal_version: LEGAL.VERSION, legal_footer: LEGAL.build(clubLegal),
    generated_at: nowIso,
    // ALWAYS now. The Archive Edition is dated when it was made.
    published_at: new Date().toISOString(), created_by: edition.retrospective_authorised_by,
  }, { v2, stage: 'retrospective', reason: reasons.join('; ') });
  const patch = { current_version: w.version, published_at: new Date().toISOString(),
    state: RULES.STATES.PUBLISHED_RECOVERY, mandatory_content_valid: true,
    publication_source_detail: 'retrospective', published_after_full_time: true,
    recovery_reason: reasons.join('; '), fulltime_enriched_at: nowIso };
  if (v2) Object.assign(patch, { edition_kind: 'retrospective', teams_status: ts.status === 'pending' ? 'not_applicable' : ts.status });
  await S.rest('programme_editions?id=eq.' + edition.id, { method: 'PATCH', body: patch,
    headers: { Prefer: 'return=minimal' } });
  await logEvent(v2, edition, 'retrospective_published', { from: edition.state, to: patch.state,
    version: w.version, actor: edition.retrospective_authorised_by, key: 'retro:' + edition.id });
  return { version: w.version, state: patch.state };
}

exports.handler = async function (event) {
  const q = (event && event.queryStringParameters) || {};
  let body = {};
  try { body = JSON.parse((event && event.body) || '{}'); } catch (e) { /* GET */ }
  if ((q.apply === '1' || body.apply === true) && !adminOk(body.pin || q.pin)) {
    return resp(401, { ok: false, error: 'Applying requires sign-in' });
  }
  if (!S.configured()) return resp(200, { ok: false, error: 'supabase not configured' });

  // event._now exists only when a test invokes the handler in-process; an HTTP
  // request cannot set it. Publication timestamps never use it — always the clock.
  const now = event && event._now ? Number(event._now) : Date.now();
  const nowIso = new Date(now).toISOString();
  const run = await S.startRun('programme', false, null);
  try {
    const [teamsRows, compsRows, fixtures, ourTeamRows, v2] = await Promise.all([
      S.rest('football_teams?select=*'),
      S.rest('football_competitions?select=*'),
      S.rest('football_fixtures?season=eq.' + encodeURIComponent(SEASON) + '&select=*&order=scheduled_kickoff_at.asc'),
      S.rest('football_teams?is_rayners_lane=eq.true&select=id&limit=1'),
      hasPublishingSchema(),
    ]);
    const teams = {}; (teamsRows || []).forEach((t) => { teams[t.id] = t; });
    const comps = {}; (compsRows || []).forEach((c) => { comps[c.id] = c; });
    const ourTeamId = ourTeamRows && ourTeamRows[0] ? ourTeamRows[0].id : null;
    if (!ourTeamId) throw new Error('Rayners Lane is not in the team registry');

    /* EVERY official home fixture of the season, in every competition.

       This used to be "home fixtures that kicked off in the last seven days,
       with a kick-off time". So a home match that passed without an edition
       never had a record at all, and the rearranged Hilltop match (590749,
       date known, time not) was dropped before anyone looked at it. Records
       are now created for the whole season; only the expensive regeneration is
       limited to fixtures that can still change. Home status is the official
       designation (home_team_id), never the venue. */
    const eligible = (fixtures || []).filter((f) =>
      String(f.home_team_id) === String(ourTeamId) && f.programme_eligible);

    const clubLegal = await loadClubLegal();

    const outcomes = [];
    for (const fx of eligible) {
      fx._homeName = (teams[fx.home_team_id] || {}).canonical_name;
      fx._awayName = (teams[fx.away_team_id] || {}).canonical_name;
      const key = keyFor(fx);
      const ko = Date.parse(fx.scheduled_kickoff_at);

      try {
        let edition = await S.findOne('programme_editions', 'fixture_id=eq.' + fx.id);
        if (!edition) {
          edition = await S.upsert('programme_editions', {
            fixture_id: fx.id,
            internal_fixture_id: key,
            external_fixture_id: fx.external_fixture_id,
            season: fx.season,
            home_team_id: fx.home_team_id, away_team_id: fx.away_team_id,
            competition_id: fx.competition_id,
            scheduled_kickoff_at: fx.scheduled_kickoff_at,
            venue: fx.venue, slug: slugFor(fx),
            state: RULES.STATES.DRAFT_HIDDEN,
          }, 'fixture_id');
          await logEvent(v2, edition, 'record_created', { to: RULES.STATES.DRAFT_HIDDEN, key: 'created:' + fx.id });
        }
        if (!edition) { outcomes.push({ fixture: key, outcome: 'could not create edition' }); continue; }

        // An edition written with a null id could never be opened by URL.
        // Repair it to the id every other surface uses. A rescheduled fixture
        // moves its unpublished edition; it never gets a second one.
        const fix = {};
        if (!edition.internal_fixture_id) fix.internal_fixture_id = key;
        if (!edition.published_at && fx.scheduled_kickoff_at && edition.scheduled_kickoff_at !== fx.scheduled_kickoff_at) {
          fix.scheduled_kickoff_at = fx.scheduled_kickoff_at;
        }
        if (Object.keys(fix).length) {
          await S.rest('programme_editions?id=eq.' + edition.id, { method: 'PATCH', body: fix,
            headers: { Prefer: 'return=minimal' } });
          Object.assign(edition, fix);
        }

        // ── called off: pause, preserve, record ─────────────────────────────
        if (LC.isCalledOff(fx)) {
          const d = LC.decideStage({ fixture: fx, edition, ourTeamId, now });
          if (d.action === 'mark_called_off') {
            const p = edition.published_at
              ? (v2 ? { fixture_postponed_at: nowIso } : {})
              : { state: storableState(d.state, v2), withheld_reason: d.reasons.join('; ') };
            if (Object.keys(p).length) {
              await S.rest('programme_editions?id=eq.' + edition.id, { method: 'PATCH', body: p,
                headers: { Prefer: 'return=minimal' } });
            }
            await logEvent(v2, edition, 'fixture_called_off', { from: edition.state, to: p.state || edition.state,
              reason: d.reasons.join('; '), key: 'calledoff:' + fx.id + ':' + fx.fixture_status });
          }
          outcomes.push({ fixture: key, opponent: fx._awayName, state: d.state, calledOff: fx.fixture_status, reasons: d.reasons });
          continue;
        }

        // ── long past and already published: immutable, nothing to do ───────
        const longPast = isFinite(ko) ? ko < now - 7 * 86400000 : fx.fixture_status === 'played';
        if (longPast && edition.published_at) {
          outcomes.push({ fixture: key, opponent: fx._awayName, state: edition.state, published: true, untouched: true });
          continue;
        }

        // ── the result, as the registry holds it ────────────────────────────
        let state = null, events = [];
        try {
          const st = await S.rest('match_state?fixture_id=eq.' + encodeURIComponent(key) + '&select=*');
          state = (st && st[0]) || null;
          if (state && state.is_final) {
            events = await S.rest('match_events?fixture_id=eq.' + encodeURIComponent(key) +
              '&retracted_at=is.null&select=event_type,side,player,assistant,minute,stoppage_minute,own_goal' +
              '&order=minute.asc,stoppage_minute.asc') || [];
          }
        } catch (e) { /* no result yet — the edition simply has no Full Time section */ }
        // FWP's club list writes OUR goals first; for a home fixture that is
        // home-away order already (read.js providerScore does the orienting).
        const providerScore = fx.fixture_status === 'played' ? READ.providerScore(fx.original_provider_time, true) : null;
        const result = (state && state.home_score != null && state.away_score != null)
          ? { home: state.home_score, away: state.away_score } : providerScore;

        // ── long past, never published: an Archive Edition, by authorisation ─
        if (longPast) {
          const d = LC.decideStage({ fixture: fx, edition: Object.assign({ mandatory_content_valid: true }, edition),
            ourTeamId, now, result, isFinal: !!(state && state.is_final) || !!result });
          if (d.action === 'retrospective' && result) {
            const r = await publishRetrospective({ fx, edition, teams, comps, result, v2, clubLegal, nowIso, reasons: d.reasons });
            outcomes.push({ fixture: key, opponent: fx._awayName, state: r.state, published: true, retrospective: true });
          } else {
            if (edition.state !== storableState(d.state, v2)) {
              await S.rest('programme_editions?id=eq.' + edition.id, { method: 'PATCH',
                body: { state: storableState(d.state, v2) }, headers: { Prefer: 'return=minimal' } });
            }
            outcomes.push({ fixture: key, opponent: fx._awayName, state: d.state, published: false, reasons: d.reasons });
          }
          continue;
        }

        // ── the live window: regenerate, decide the stage, publish/revise ───
        // Regenerate the draft. Idempotent — the same inputs give the same payload.
        const ctx = await buildContext(fx, teams, comps);
        if (fx.kickoff_time_confirmed === false) ctx.kickoffTimeConfirmed = false;
        const lineups = await lineupsFor(fx.id, fx);
        const ts = LC.teamSheets(lineups.home, lineups.away, fx);
        ctx.lineups = { confirmed: ts.status === 'confirmed', home: lineups.home, away: lineups.away };
        const gate = RULES.validateLineupGate(lineups.home, lineups.away, fx);
        const generated = GEN.build(ctx);
        // The official line-up gate still decides what is shown as confirmed:
        // a side appears only once its own team sheet validates.
        generated.sections.squads = LC.squadsSection(ts, ctx);
        if (edition.published_at && edition.current_version) {
          // A person's "correct a name" survives every later refresh.
          const cur = await S.rest('programme_versions?edition_id=eq.' + edition.id + '&version=eq.' +
            edition.current_version + '&select=payload&limit=1').catch(() => []);
          const prev = cur && cur[0] && cur[0].payload && cur[0].payload.sections && cur[0].payload.sections.squads;
          if (prev && prev.corrections) generated.sections.squads = LC.reapplyCorrections(generated.sections.squads, prev.corrections);
        }
        const editorial = await loadEditorial(v2, edition, fx.season);
        const sponsors = LC.sponsorPlacements(editorial.placements,
          { editionId: edition.id, season: fx.season, date: String(fx.scheduled_kickoff_at || '').slice(0, 10) });
        const built = LC.applySections(generated, editorial.sections);
        if (sponsors.placements.length) built.sections.placements = sponsors.placements;
        built.validation = generated.validation;
        const editorialHash = LC.contentHash({ sections: editorial.sections.map((s) => [s.section_key, s.body, s.title]),
          placements: sponsors.placements });

        /* The content validity from THIS run, not the last one.
           decide() reads edition.mandatory_content_valid, and `edition` is the
           row as it was BEFORE this run — so a programme that had just become
           complete was judged on the previous run's answer and withheld, then
           published an hour later when the stale flag finally caught up. */
        const editionNow = Object.assign({}, edition, {
          mandatory_content_valid: built.validation.ok,
          lineup_gate_valid: gate.ok,
        });

        const base = RULES.decide({ fixture: fx, edition: editionNow, ourTeamId, now,
          homeLineup: lineups.home, awayLineup: lineups.away, isFinal: !!(state && state.is_final) });
        const stage = LC.decideStage({
          fixture: fx, edition: editionNow, ourTeamId, now,
          homeLineup: lineups.home, awayLineup: lineups.away, teams: ts,
          isFinal: !!(state && state.is_final), contentValid: built.validation.ok,
          editorialHash, result,
        });
        // The engine's decision, with publication decided by the stage model.
        const decision = Object.assign({}, base, { state: stage.state || base.state,
          canPublish: stage.action === 'publish', reasons: stage.reasons || base.reasons,
          retrospective: !!base.retrospective, afterFullTime: !!(stage.afterFullTime || base.afterFullTime) });

        /* The permanent record of the match, in the club's own words. Captured
           INTO the edition rather than resolved when somebody reads it. */
        const finalMatch = (state && state.is_final) ? {
          homeTeam: ctx.homeTeam, awayTeam: ctx.awayTeam,
          homeScore: state.home_score, awayScore: state.away_score,
          status: 'FULL TIME',
          referee: state.referee || null,
          venue: fx.venue || null,
          events: events.map((e) => ({
            type: e.own_goal ? 'own_goal' : e.event_type,
            player: e.player, related: e.assistant,
            side: e.side, minute: e.minute, stoppage: e.stoppage_minute || 0,
          })),
          capturedAt: nowIso,
        } : null;

        const patch = {
          mandatory_content_valid: built.validation.ok,
          lineup_gate_valid: gate.ok,
          generated_at: nowIso,
          state: storableState(decision.state, v2),
          withheld_reason: decision.state === RULES.STATES.WITHHELD
            ? decision.reasons.concat(built.validation.missing.length
                ? ['missing sections: ' + built.validation.missing.join(', ')] : []).join('; ')
            : null,
        };
        if (v2 && sponsors.issues.length) {
          patch.last_error = 'sponsor placements need attention: ' +
            sponsors.issues.map((i) => i.sponsor + ' (' + i.issue + ')').join('; ');
          patch.last_error_at = nowIso;
        }
        const versionRow = {
          payload: built,
          lineup_snapshot: Object.assign({ status: ts.status }, ctx.lineups),
          table_snapshot: ctx.table || null,
          sponsor_snapshot: { tiers: ctx.sponsorTiers, placements: sponsors.placements },
          staff_snapshot: { groups: ctx.staffGroups },
          final_match_snapshot: finalMatch,
          legal_version: LEGAL.VERSION,
          legal_footer: LEGAL.build(clubLegal),
          generated_at: nowIso,
          // ALWAYS now. Backdating this to the fixture would be the system
          // claiming supporters had a programme on the day when they did not.
          published_at: new Date().toISOString(),
        };

        if (decision.canPublish && !edition.published_at) {
          const w = await writeVersion(edition, versionRow, { v2, stage: stage.stage, reason: decision.reasons.join('; ') });
          patch.current_version = w.version;
          patch.published_at = new Date().toISOString();
          patch.state = stage.recovery
            ? RULES.STATES.PUBLISHED_RECOVERY
            : (stage.late ? RULES.STATES.PUBLISHED_LATE : RULES.STATES.PUBLISHED_MATCHDAY);
          if (stage.recovery) {
            // publication_source_detail, NOT publication_source: the original
            // column allows only automatic|emergency_teamsheet|manual, and a
            // 23514 here once failed the whole run silently.
            patch.publication_source_detail = decision.retrospective ? 'retrospective' : 'recovery';
            // Why the normal moment was missed, kept with the edition.
            patch.recovery_reason = decision.reasons.join('; ');
            patch.published_after_full_time = !!decision.afterFullTime;
          }
          if (v2) {
            patch.teams_status = ts.status;
            if (ts.status === 'confirmed') patch.teams_confirmed_at = nowIso;
          }
          if (finalMatch) patch.fulltime_enriched_at = nowIso;
          await logEvent(v2, edition, 'published', { from: edition.state, to: patch.state, version: w.version,
            reason: stage.stage + ': ' + decision.reasons.join('; '), key: 'publish:' + edition.id });
        } else if (stage.action === 'revise' && edition.published_at && v2) {
          // Stage B: ONLY the team sheet changed. A new immutable version, the
          // editorial untouched, no supporter notification.
          const w = await writeVersion(edition, versionRow, { v2, stage: stage.stage, reason: stage.reasons.join('; ') });
          patch.current_version = w.version;
          patch.state = edition.state;
          patch.teams_status = ts.status;
          if (ts.status === 'confirmed') patch.teams_confirmed_at = nowIso;
          await logEvent(v2, edition, 'teams_updated', { from: edition.teams_status, to: ts.status, version: w.version,
            reason: 'Team sheet updated from Football Web Pages', key: 'teams:' + edition.id + ':' + ts.status });
        } else if (edition.published_at && finalMatch && !edition.fulltime_enriched_at) {
          // Published before the whistle: add the result as a new version.
          const w = await writeVersion(edition, versionRow, { v2, stage: 'full_time', reason: 'full time' });
          patch.current_version = w.version;
          patch.fulltime_enriched_at = nowIso;
          patch.state = RULES.STATES.FULL_TIME_CURRENT;
          await logEvent(v2, edition, 'full_time', { version: w.version, key: 'ft:' + edition.id });
        } else if (edition.published_at) {
          // Published and nothing new: never move it back out of public view.
          patch.state = edition.state;
          delete patch.withheld_reason;
        }

        await S.rest('programme_editions?id=eq.' + edition.id, {
          method: 'PATCH', body: patch, headers: { Prefer: 'return=minimal' },
        });

        outcomes.push({
          fixture: key, opponent: fx._awayName,
          kickoff: fx.scheduled_kickoff_at,
          state: patch.state, published: !!(patch.published_at || edition.published_at),
          stage: stage.stage, action: stage.action,
          contentValid: built.validation.ok,
          missing: built.validation.missing,
          lineups: ts.status,
          sponsorIssues: sponsors.issues,
          recovery: !!stage.recovery,
          fullTime: !!finalMatch,
          reasons: decision.reasons,
        });
      } catch (err) {
        // One bad fixture never stops the rest of the season. The error is
        // recorded on the edition so HQ can show it and offer a retry.
        outcomes.push({ fixture: key, error: String(err && err.message || err) });
        if (v2) {
          await S.rest('programme_editions?fixture_id=eq.' + fx.id, { method: 'PATCH',
            body: { last_error: String(err && err.message || err).slice(0, 500), last_error_at: nowIso },
            headers: { Prefer: 'return=minimal' } }).catch(() => null);
        }
      }
    }

    const failed = outcomes.filter((o) => o.error).length;
    await S.finishRun(run && run.id, { status: failed ? 'partial' : 'ok', records_updated: outcomes.length,
      error_count: failed });
    return resp(200, { ok: true, season: SEASON, schema: v2 ? 'publishing-system' : 'legacy',
      editions: outcomes.length, failed, outcomes });
  } catch (e) {
    await S.finishRun(run && run.id, { status: 'failed', final_error: String(e && e.message || e), error_count: 1 });
    return resp(200, { ok: false, error: String(e && e.message || e) });
  }
};

exports._internal = { slugFor, keyFor, writeVersion, hasPublishingSchema, publishRetrospective, lineupsFor, loadClubLegal };
