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
    sponsorshipOptions: [
      { name: 'Match sponsorship' }, { name: 'Programme sponsorship' },
      { name: 'Pitch-side advertising' }, { name: 'Player sponsorship' },
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

exports.handler = async function (event) {
  const q = (event && event.queryStringParameters) || {};
  let body = {};
  try { body = JSON.parse((event && event.body) || '{}'); } catch (e) { /* GET */ }
  if ((q.apply === '1' || body.apply === true) && !adminOk(body.pin || q.pin)) {
    return resp(401, { ok: false, error: 'Applying requires sign-in' });
  }
  if (!S.configured()) return resp(200, { ok: false, error: 'supabase not configured' });

  const now = Date.now();
  const run = await S.startRun('programme', false, null);
  try {
    const [teamsRows, compsRows, fixtures, ourTeamRows] = await Promise.all([
      S.rest('football_teams?select=*'),
      S.rest('football_competitions?select=*'),
      S.rest('football_fixtures?season=eq.' + encodeURIComponent(SEASON) + '&select=*&order=scheduled_kickoff_at.asc'),
      S.rest('football_teams?is_rayners_lane=eq.true&select=id&limit=1'),
    ]);
    const teams = {}; (teamsRows || []).forEach((t) => { teams[t.id] = t; });
    const comps = {}; (compsRows || []).forEach((c) => { comps[c.id] = c; });
    const ourTeamId = ourTeamRows && ourTeamRows[0] ? ourTeamRows[0].id : null;
    if (!ourTeamId) throw new Error('Rayners Lane is not in the team registry');

    // Only home fixtures that have not finished long ago.
    const eligible = (fixtures || []).filter((f) =>
      String(f.home_team_id) === String(ourTeamId) &&
      f.programme_eligible &&
      f.scheduled_kickoff_at &&
      Date.parse(f.scheduled_kickoff_at) > now - 7 * 86400000);

    const outcomes = [];
    for (const fx of eligible) {
      fx._homeName = (teams[fx.home_team_id] || {}).canonical_name;
      fx._awayName = (teams[fx.away_team_id] || {}).canonical_name;

      let edition = await S.findOne('programme_editions', 'fixture_id=eq.' + fx.id);
      if (!edition) {
        edition = await S.upsert('programme_editions', {
          fixture_id: fx.id,
          internal_fixture_id: fx.internal_fixture_id,
          external_fixture_id: fx.external_fixture_id,
          season: fx.season,
          home_team_id: fx.home_team_id, away_team_id: fx.away_team_id,
          competition_id: fx.competition_id,
          scheduled_kickoff_at: fx.scheduled_kickoff_at,
          venue: fx.venue, slug: slugFor(fx),
          state: RULES.STATES.DRAFT_HIDDEN,
        }, 'fixture_id');
      }
      if (!edition) { outcomes.push({ fixture: fx.internal_fixture_id, outcome: 'could not create edition' }); continue; }

      // Regenerate the draft. Idempotent — the same inputs give the same payload.
      const ctx = await buildContext(fx, teams, comps);
      const lineups = await lineupsFor(fx.id, fx);
      ctx.lineups = { confirmed: false, home: lineups.home, away: lineups.away };
      const gate = RULES.validateLineupGate(lineups.home, lineups.away, fx);
      if (gate.ok) ctx.lineups.confirmed = true;
      const built = GEN.build(ctx);

      // The real match state. isFinal was hardcoded false, so an edition could
      // never be enriched with the result it was published alongside.
      const ref = fx.internal_fixture_id || ('fwp-' + fx.external_fixture_id);
      let state = null, events = [];
      try {
        const st = await S.rest('match_state?fixture_id=eq.' + encodeURIComponent(ref) + '&select=*');
        state = (st && st[0]) || null;
        if (state && state.is_final) {
          events = await S.rest('match_events?fixture_id=eq.' + encodeURIComponent(ref) +
            '&retracted_at=is.null&select=event_type,side,player,assistant,minute,stoppage_minute,own_goal' +
            '&order=minute.asc,stoppage_minute.asc') || [];
        }
      } catch (e) { /* no result yet — the edition simply has no Full Time section */ }

      /* The content validity from THIS run, not the last one.
         decide() reads edition.mandatory_content_valid, and `edition` is the
         row as it was BEFORE this run — so a programme that had just become
         complete was judged on the previous run's answer and withheld, then
         published an hour later when the stale flag finally caught up.
         Publication was permanently one run behind, and on matchday an hour is
         the difference between a programme and no programme. */
      const editionNow = Object.assign({}, edition, {
        mandatory_content_valid: built.validation.ok,
        lineup_gate_valid: gate.ok,
      });

      const decision = RULES.decide({
        fixture: fx, edition: editionNow, ourTeamId, now,
        homeLineup: lineups.home, awayLineup: lineups.away,
        isFinal: !!(state && state.is_final),
      });

      /* The permanent record of the match, in the club's own words. Captured
         INTO the edition rather than resolved when somebody reads it, because
         an archived programme that reached for the current score would rewrite
         the past the moment the next match kicked off. */
      const finalMatch = (state && state.is_final) ? {
        homeTeam: ctx.homeTeam, awayTeam: ctx.awayTeam,
        homeScore: state.home_score, awayScore: state.away_score,
        status: 'FULL TIME',
        referee: state.referee || null,
        venue: fx.venue || null,
        events: events.map((e) => ({
          type: e.own_goal ? 'own_goal' : e.event_type,
          // An own goal counts on the scoreline it counts on, and belongs to
          // the player who scored it. It is never a goal FOR him.
          player: e.player, related: e.assistant,
          side: e.side, minute: e.minute, stoppage: e.stoppage_minute || 0,
        })),
        capturedAt: new Date().toISOString(),
      } : null;

      const patch = {
        mandatory_content_valid: built.validation.ok,
        lineup_gate_valid: gate.ok,
        generated_at: new Date().toISOString(),
        state: decision.canPublish ? decision.state : decision.state,
        withheld_reason: decision.state === RULES.STATES.WITHHELD
          ? decision.reasons.concat(built.validation.missing.length
              ? ['missing sections: ' + built.validation.missing.join(', ')] : []).join('; ')
          : null,
      };

      if (decision.canPublish && !edition.published_at) {
        const version = (edition.current_version || 0) + 1;
        await S.rest('programme_versions', {
          method: 'POST',
          body: [{
            edition_id: edition.id, version,
            payload: built,
            lineup_snapshot: ctx.lineups,
            table_snapshot: ctx.table || null,
            sponsor_snapshot: { tiers: ctx.sponsorTiers },
            staff_snapshot: { groups: ctx.staffGroups },
            final_match_snapshot: finalMatch,
            legal_version: 'v1',
            generated_at: new Date().toISOString(),
            // ALWAYS now. Backdating this to the fixture would be the system
            // claiming supporters had a programme on the day when they did not.
            published_at: new Date().toISOString(),
          }],
          headers: { Prefer: 'return=minimal' },
        });
        patch.current_version = version;
        patch.published_at = new Date().toISOString();
        patch.state = decision.recovery
          ? RULES.STATES.PUBLISHED_RECOVERY
          : (decision.late ? RULES.STATES.PUBLISHED_LATE : RULES.STATES.PUBLISHED_MATCHDAY);
        if (decision.recovery) {
          // publication_source_detail, NOT publication_source. The original
          // column allows only automatic|emergency_teamsheet|manual, so writing
          // 'recovery' to it violated a check constraint and the whole run
          // failed with a Postgres 23514 — silently, from a supporter's point
          // of view, because the edition simply stayed unpublished.
          patch.publication_source_detail = decision.retrospective ? 'retrospective' : 'recovery';
          // Why the normal moment was missed, kept with the edition.
          patch.recovery_reason = decision.reasons.join('; ');
          patch.published_after_full_time = !!decision.afterFullTime;
        }
        if (finalMatch) patch.fulltime_enriched_at = new Date().toISOString();
      } else if (decision.canPublish === false && edition.published_at && finalMatch
                 && !edition.fulltime_enriched_at) {
        // Published before the whistle: add the result to the edition that is
        // already out, as a new immutable version rather than an edit.
        const version = (edition.current_version || 0) + 1;
        await S.rest('programme_versions', {
          method: 'POST',
          body: [{
            edition_id: edition.id, version, payload: built,
            lineup_snapshot: ctx.lineups, table_snapshot: ctx.table || null,
            sponsor_snapshot: { tiers: ctx.sponsorTiers },
            staff_snapshot: { groups: ctx.staffGroups },
            final_match_snapshot: finalMatch,
            legal_version: 'v1',
            generated_at: new Date().toISOString(),
            published_at: new Date().toISOString(),
          }],
          headers: { Prefer: 'return=minimal' },
        });
        patch.current_version = version;
        patch.fulltime_enriched_at = new Date().toISOString();
        patch.state = RULES.STATES.FULL_TIME_CURRENT;
      }

      await S.rest('programme_editions?id=eq.' + edition.id, {
        method: 'PATCH', body: patch, headers: { Prefer: 'return=minimal' },
      });

      outcomes.push({
        fixture: fx.internal_fixture_id, opponent: fx._awayName,
        kickoff: fx.scheduled_kickoff_at,
        state: patch.state, published: !!patch.published_at,
        contentValid: built.validation.ok,
        missing: built.validation.missing,
        lineups: gate.ok ? 'confirmed' : 'awaiting',
        recovery: !!decision.recovery,
        fullTime: !!finalMatch,
        reasons: decision.reasons,
      });
    }

    await S.finishRun(run && run.id, { status: 'ok', records_updated: outcomes.length });
    return resp(200, { ok: true, season: SEASON, editions: outcomes.length, outcomes });
  } catch (e) {
    await S.finishRun(run && run.id, { status: 'failed', final_error: String(e && e.message || e), error_count: 1 });
    return resp(200, { ok: false, error: String(e && e.message || e) });
  }
};

exports._internal = { slugFor };
