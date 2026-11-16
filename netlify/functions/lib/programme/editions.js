// ONE FIXTURE → ONE EDITION. The single code path that finds a fixture in the
// football registry and resolves or creates its programme record.
//
// The scheduled run (programme-sync) and the HQ publish/preflight actions
// (programme-admin) both come through here, so "is this fixture eligible" and
// "make its record" are decided in exactly one place. Creation is an upsert on
// the unique fixture_id, so two callers racing can never make two editions.
'use strict';

const S = require('../football/store');
const RULES = require('./publish-rules');
const LC = require('./lifecycle');

const SEASON = process.env.FWP_SEASON || '2026-2027';

function slugFor(f) {
  const s = (x) => String(x || '').toLowerCase().replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const d = f.scheduled_kickoff_at ? String(f.scheduled_kickoff_at).slice(0, 10) : '';
  return [d, s(f._homeName), 'v', s(f._awayName)].filter(Boolean).join('-');
}

/** The fixture id every surface uses — the read layer's own rule. */
function keyFor(fx) {
  return fx.internal_fixture_id || ('fwp-' + fx.external_fixture_id);
}

/** Is this registry row one the sync makes a programme for? Same rule as the season loop. */
function isEligible(fx, ourTeamId) {
  return !!fx && String(fx.home_team_id) === String(ourTeamId) && !!fx.programme_eligible;
}

/**
 * Find one fixture in the registry, and say plainly why it cannot have a
 * programme if it cannot. Read-only.
 * @returns {{ok:boolean, fx?:Object, ourTeamId?:any, teams?:Object, comps?:Object, reason?:string, code?:string}}
 */
async function resolveFixture(fixtureId) {
  if (!fixtureId) return { ok: false, code: 'no_fixture', reason: 'No fixture was chosen.' };
  const id = String(fixtureId);
  const [fixtures, teamsRows, compsRows] = await Promise.all([
    S.rest('football_fixtures?season=eq.' + encodeURIComponent(SEASON) + '&select=*&order=scheduled_kickoff_at.asc'),
    S.rest('football_teams?select=*'),
    S.rest('football_competitions?select=*'),
  ]);
  const teams = {}; (teamsRows || []).forEach((t) => { teams[t.id] = t; });
  const comps = {}; (compsRows || []).forEach((c) => { comps[c.id] = c; });
  const ours = (teamsRows || []).filter((t) => t.is_rayners_lane === true)[0];
  if (!ours) return { ok: false, code: 'no_club', reason: 'Rayners Lane is not in the team registry.' };
  const fx = (fixtures || []).filter((f) => keyFor(f) === id)[0];
  if (!fx) {
    return { ok: false, code: 'not_in_registry',
      reason: 'That fixture (' + id + ') is not in the ' + SEASON + ' football registry the programme system uses.' };
  }
  fx._homeName = (teams[fx.home_team_id] || {}).canonical_name;
  fx._awayName = (teams[fx.away_team_id] || {}).canonical_name;
  const base = { fx, ourTeamId: ours.id, teams, comps };
  if (String(fx.home_team_id) !== String(ours.id)) {
    return Object.assign(base, { ok: false, code: 'away', reason: 'That is an away fixture; programmes are made for home matches only.' });
  }
  if (!fx.programme_eligible) {
    return Object.assign(base, { ok: false, code: 'not_eligible', reason: 'The registry marks that fixture as not programme-eligible.' });
  }
  if (LC.isCalledOff(fx)) {
    return Object.assign(base, { ok: false, code: 'called_off',
      reason: 'That fixture is ' + (fx.sync_status === 'superseded' ? 'superseded by a rearranged fixture' : fx.fixture_status) +
        ' — no programme is published for it.' });
  }
  return Object.assign(base, { ok: true });
}

async function findEdition(fx) {
  return S.findOne('programme_editions', 'fixture_id=eq.' + fx.id + '&select=*');
}

/**
 * Resolve or create the edition for one registry fixture. Idempotent: the
 * lookup is by fixture_id and the insert is an upsert on it.
 * @param {Object} fx registry row (with _homeName/_awayName for the slug)
 * @param {{logEvent?:Function}} [opts]
 * @returns {Promise<{edition:Object|null, created:boolean}>}
 */
async function ensureEdition(fx, opts) {
  const o = opts || {};
  let edition = await findEdition(fx);
  if (edition) return { edition, created: false };
  edition = await S.upsert('programme_editions', {
    fixture_id: fx.id,
    internal_fixture_id: keyFor(fx),
    external_fixture_id: fx.external_fixture_id,
    season: fx.season,
    home_team_id: fx.home_team_id, away_team_id: fx.away_team_id,
    competition_id: fx.competition_id,
    scheduled_kickoff_at: fx.scheduled_kickoff_at,
    venue: fx.venue, slug: slugFor(fx),
    state: RULES.STATES.DRAFT_HIDDEN,
  }, 'fixture_id');
  if (edition && o.logEvent) {
    await o.logEvent(edition, 'record_created', { to: RULES.STATES.DRAFT_HIDDEN, key: 'created:' + fx.id, actor: o.actor });
  }
  return { edition, created: !!edition };
}

module.exports = { slugFor, keyFor, isEligible, resolveFixture, findEdition, ensureEdition };
