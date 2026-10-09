// ════════════════════════════════════════════════════════════════════════════
// TWO WAYS THE REGISTRY WENT QUIETLY WRONG (October 2026).
//
// 1. A RE-ARRANGED FIXTURE FROZE. Holyport v Rayners Lane was postponed on
//    5 Sep ("P - P") and the league re-arranged it for Sat 10 Oct. A month
//    later the registry still had it on 5 Sep, 'scheduled', with
//    last_synced_at stuck on the day it was called off — so on 9 Oct the site
//    had no idea the club was playing tomorrow. The season sync only ever wrote
//    provider fixtures it could reconcile against data/fixtures.json, a
//    committed file that had been stale since 31 Aug (it still had North Leigh
//    at home on 10 Oct). A re-arranged fixture is the one least likely to
//    reconcile, and once it stopped reconciling nothing wrote it again.
//
// 2. RESULTS HAD NO SCORES. Bedfont 2-2, Harefield 0-5, Easington 0-2 were all
//    'played' in the registry with the provider's cell "(1) 2 - 2 (1)" stored,
//    but the read layer took scores ONLY from match_state (the live scoreboard,
//    which was switched off) — so every one came back hasScore:false and the
//    form guide stopped at 31 Aug.
//
// No network: fetch is stubbed. The provider list is the real captured embed,
// edited to what Football Web Pages showed on 9 Oct 2026.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';
process.env.FWP_SYNC_ENABLED = 'true';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FX = path.join(__dirname, 'fixtures', 'fwp');
const SEASON_SYNC = require('../netlify/functions/football-sync-season');
const READ = require('../netlify/functions/lib/football/read');
const PF = require('../netlify/functions/lib/fwp/parse-fixtures');

const CLUB_FILE = fs.readFileSync(path.join(ROOT, 'data', 'fixtures.json'), 'utf8');
const NOW_9_OCT = Date.parse('2026-10-09T12:00:00Z');

const HT = (h, a, hh, ha) =>
  '<span class="d-none d-sm-inline half-time-score">(' + hh + ')</span>' + h + ' - ' + a +
  '<span class="d-none d-sm-inline half-time-score">(' + ha + ')</span>';

/** The captured embed, with one row's date / kick-off cell / id rewritten. */
function providerList(edits) {
  let html = fs.readFileSync(path.join(FX, 'fixtures-results.html'), 'utf8');
  edits.forEach((e) => {
    html = html.replace(new RegExp('<tr[^>]*/' + e.id + '"[\\s\\S]*?</tr>'), (row) => {
      if (e.date) row = row.replace(/(class="date" data-export=")[^"]+"/, '$1' + e.date + '"');
      if (e.ko != null) row = row.replace(/(class="ko-score">)[\s\S]*?(<\/td>)/, '$1' + e.ko + '$2');
      if (e.newId) row = row.split('/' + e.id + '"').join('/' + e.newId + '"');
      return row;
    });
  });
  return html;
}

/** What Football Web Pages showed for Rayners Lane on 9 Oct 2026. */
const OCT_9 = [
  { id: '578325', date: '26/9/2026', ko: HT(2, 2, 1, 1) },     // Bedfont 2-2
  { id: '578264', date: '29/9/2026', ko: HT(0, 5, 0, 1) },     // Harefield 0-5 (we won)
  { id: '578338', date: '3/10/2026', ko: HT(0, 2, 0, 0) },     // Easington 0-2 (we won)
  { id: '578349', date: '10/4/2027', ko: '3pm' },              // North Leigh moved to April
];

function reply(status, body, ctype) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300, status,
    headers: { get: (k) => (String(k).toLowerCase() === 'content-type' ? (ctype || 'application/json') : null) },
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}

/**
 * Run the real season sync handler against a stubbed provider, club file and
 * Supabase. Returns the rows it upserted into football_fixtures.
 */
async function runSeasonSync(opts) {
  const o = opts || {};
  const realFetch = global.fetch;
  let upserted = null;
  let nextId = 1000;
  global.fetch = async (url, init) => {
    const u = String(url);
    const method = (init && init.method) || 'GET';
    const body = init && init.body ? JSON.parse(init.body) : null;
    if (u.includes('footballwebpages.co.uk')) return reply(200, o.html, 'text/html');
    if (u.includes('fixtures.json')) return reply(200, o.clubFile || CLUB_FILE);
    if (!u.includes('/rest/v1/')) return reply(404, 'not stubbed');
    if (u.includes('football_fixtures?on_conflict') && method === 'POST') { upserted = body; return reply(201, ''); }
    if (u.includes('football_fixtures') && method === 'GET') return reply(200, o.existing || []);
    if (method === 'POST' && Array.isArray(body)) {
      return reply(201, body.map((r) => Object.assign({ id: nextId++ }, r)));
    }
    if (method === 'GET') return reply(200, []);
    return reply(200, [{ id: 1 }]);
  };
  try {
    const out = await SEASON_SYNC.handler({ queryStringParameters: {}, body: '' });
    const parsed = JSON.parse(out.body);
    assert.strictEqual(parsed.ok, true, 'season sync failed: ' + parsed.error);
    return { rows: upserted || [], result: parsed };
  } finally {
    global.fetch = realFetch;
  }
}

const row = (rows, ext) => rows.filter((r) => r.external_fixture_id === ext)[0];

/** The registry, as the read layer would shape it. */
function shaped(rows) {
  const teams = {};
  let n = 1;
  const teamId = (name) => {
    const hit = Object.keys(teams).filter((k) => teams[k].canonical_name === name)[0];
    if (hit) return Number(hit);
    teams[n] = { canonical_name: name };
    return n++;
  };
  return rows.map((r) => {
    const p = r._provider;
    return READ.shapeFixture(Object.assign({}, r, {
      home_team_id: teamId(p.homeTeam), away_team_id: teamId(p.awayTeam),
    }), teams);
  });
}

// ── 1 · THE RE-ARRANGED FIXTURE ────────────────────────────────────────────

test('re-arranged under the SAME provider id: the row moves to the new date even when the club file cannot vouch for it', async () => {
  // The club file holds fwp-578296 on 5 Sep. If it holds it twice — the
  // original and a re-arranged copy, which is how a hand edit records a new
  // date — reconciliation rightly refuses to pick one. That refusal used to
  // stop the provider's own fixture being written at all.
  const club = JSON.parse(CLUB_FILE);
  const holyport = club.fixtures.filter((f) => f.id === 'fwp-578296')[0];
  club.fixtures.push(Object.assign({}, holyport, { date: '2026-10-10' }));

  const { rows, result } = await runSeasonSync({
    html: providerList(OCT_9.concat([{ id: '578296', date: '10/10/2026', ko: '3pm' }])),
    clubFile: JSON.stringify(club),
    existing: [{ external_fixture_id: '578296', scheduled_kickoff_at: '2026-09-05T14:00:00.000Z',
      venue: 'Summerleaze Village', internal_fixture_id: 'fwp-578296' }],
  });

  const r = row(rows, '578296');
  assert.ok(r, 'Holyport must be written — it was frozen on 5 Sep');
  assert.strictEqual(r.original_provider_date, '2026-10-10');
  assert.strictEqual(r.scheduled_kickoff_at, '2026-10-10T14:00:00.000Z', '3pm BST on Sat 10 Oct');
  assert.strictEqual(r.fixture_status, 'scheduled');
  assert.strictEqual(r.original_provider_time, '3pm');
  assert.ok(Date.parse(r.last_synced_at) > Date.parse('2026-09-05T23:59:59Z'));
  // The link the registry already had for this provider id is kept…
  assert.strictEqual(r.internal_fixture_id, 'fwp-578296');
  // …but it is not silently promoted: a human still has to look.
  assert.strictEqual(r.source_confidence, 'rejected');
  assert.ok(result.unmatchedProvider.some((u) => u.id === '578296'), 'still reported for review');
  assert.strictEqual(rows.length, 40, 'every provider fixture is written');
});

test('re-arranged under a NEW provider id: the registry gains the match on its new date', async () => {
  // The stale club file has North Leigh on 10 Oct and Holyport on 5 Sep, so a
  // new id for Holyport on 10 Oct reconciles with nothing.
  const { rows } = await runSeasonSync({
    html: providerList(OCT_9.concat([{ id: '578296', date: '10/10/2026', ko: '3pm', newId: '599001' }])),
  });
  const r = row(rows, '599001');
  assert.ok(r, 'the re-arranged Holyport fixture must reach the registry');
  assert.strictEqual(r.scheduled_kickoff_at, '2026-10-10T14:00:00.000Z');
  assert.strictEqual(r.fixture_status, 'scheduled');
  assert.strictEqual(r.is_home_fixture, false);
  assert.strictEqual(r.internal_fixture_id, null, 'no NEW link to one of our fixtures without a human');
  assert.strictEqual(r.source_confidence, 'needs_review');
});

test('"P - P" is written as postponed, not as a match that is still on', async () => {
  const { rows } = await runSeasonSync({
    html: providerList([{ id: '578296', ko: 'P - P' }]),
  });
  const r = row(rows, '578296');
  assert.strictEqual(r.original_provider_time, 'P - P');
  assert.strictEqual(r.fixture_status, 'postponed');
  // The original date is kept as the record of when it was called off.
  assert.strictEqual(r.scheduled_kickoff_at, '2026-09-05T14:00:00.000Z');
});

test('the parser says postponed only for "P - P"', () => {
  assert.strictEqual(PF.parseFixtureList(providerList([{ id: '578296', ko: 'P - P' }]))
    .fixtures.filter((f) => f.externalFixtureId === '578296')[0].postponed, true);
  assert.strictEqual(PF.parseFixtureList(providerList([{ id: '578296', ko: 'P-P' }]))
    .fixtures.filter((f) => f.externalFixtureId === '578296')[0].postponed, true);
  const plain = PF.parseFixtureList(providerList([])).fixtures;
  assert.ok(plain.every((f) => f.postponed === false), 'a time or a score is never a postponement');
});

test('matched fixtures are written exactly as before, and North Leigh follows the provider to April', async () => {
  const { rows } = await runSeasonSync({ html: providerList(OCT_9) });
  assert.strictEqual(rows.length, 40);
  const nl = row(rows, '578349');
  assert.strictEqual(nl.original_provider_date, '2027-04-10');
  assert.strictEqual(nl.internal_fixture_id, 'fwp-578349');
  assert.strictEqual(nl.source_confidence, 'exact_id');
  const wall = row(rows, '578225');
  assert.strictEqual(wall.fixture_status, 'played');
  assert.strictEqual(wall.source_confidence, 'exact_id');
  assert.ok(rows.every((r) => r.source_confidence === 'exact_id' || r.source_confidence === 'strong'));
});

test('an unmatched row never takes a link another row holds in the same batch', () => {
  const B = SEASON_SYNC._internal.buildFixtureRows;
  const p = (id, date) => ({ externalFixtureId: id, date: date, kickoff: '15:00', opponent: 'Holyport',
    isHome: false, competition: 'Combined Counties Prem N', competitionSlug: 'ccl', providerKoCell: '3pm' });
  const out = B([
    { provider: p('1', '2026-10-10'), internal: { id: 'fwp-578296', kickoff: '15:00' }, confidence: 'strong' },
    { provider: p('2', '2026-10-17'), internal: null, confidence: 'needs_review', unmatched: true },
  ], { teamByKey: {}, compByKey: {} },
  [{ external_fixture_id: '2', internal_fixture_id: 'fwp-578296' }], '2026-10-09T12:00:00.000Z');
  assert.strictEqual(out.rows[0].internal_fixture_id, 'fwp-578296');
  assert.strictEqual(out.rows[1].internal_fixture_id, null,
    'internal_fixture_id is UNIQUE — a duplicate would fail the whole upsert');
});

test('on 9 Oct the site knows the next match is Holyport away, tomorrow at 3pm', async () => {
  const html = providerList(OCT_9.concat([{ id: '578296', date: '10/10/2026', ko: '3pm', newId: '599001' }]));
  const { rows } = await runSeasonSync({ html });
  const byId = {};
  PF.parseFixtureList(html).fixtures.forEach((f) => { byId[f.externalFixtureId] = f; });
  const list = shaped(rows.map((r) => Object.assign({ _provider: byId[r.external_fixture_id] }, r)));
  const next = READ.nextFrom(list, NOW_9_OCT);
  assert.ok(next, 'there is a next match');
  assert.strictEqual(next.opponent, 'Holyport');
  assert.strictEqual(next.isHome, false);
  assert.strictEqual(next.kickoffAt, '2026-10-10T14:00:00.000Z');
});

// ── 2 · RESULTS IN THE "(ht) ft - ft (ht)" FORM ─────────────────────────────

test('parseScore reads the half-time form with and without spaces, and the plain form', () => {
  assert.deepStrictEqual(PF.parseScore('(0)0 - 5(1)'), { home: 0, away: 5, htHome: 0, htAway: 1 });
  assert.deepStrictEqual(PF.parseScore('(1)2 - 2(1)'), { home: 2, away: 2, htHome: 1, htAway: 1 });
  assert.deepStrictEqual(PF.parseScore('(1) 2 - 2 (1)'), { home: 2, away: 2, htHome: 1, htAway: 1 });
  assert.deepStrictEqual(PF.parseScore('3 - 3'), { home: 3, away: 3, htHome: null, htAway: null });
  assert.strictEqual(PF.parseScore('3pm'), null);
  assert.strictEqual(PF.parseScore('P - P'), null);
});

test('the season sync stores the full-time cell for each played October fixture', async () => {
  const { rows } = await runSeasonSync({ html: providerList(OCT_9) });
  const expect = { 578325: [2, 2], 578264: [0, 5], 578338: [0, 2] };
  Object.keys(expect).forEach((id) => {
    const r = row(rows, id);
    assert.strictEqual(r.fixture_status, 'played', id);
    const s = READ.providerScore(r.original_provider_time);
    assert.deepStrictEqual([s.home, s.away], expect[id], id + ' stored as ' + r.original_provider_time);
  });
});

/** Registry rows as PostgREST would return them, for READ.results(). */
const T = { 1: { id: 1, canonical_name: 'Rayners Lane' }, 2: { id: 2, canonical_name: 'Bedfont' },
  3: { id: 3, canonical_name: 'Harefield United' }, 4: { id: 4, canonical_name: 'Easington Sports' },
  5: { id: 5, canonical_name: 'Wallingford & Crowmarsh' }, 6: { id: 6, canonical_name: 'North Greenford United' } };
const REGISTRY = [
  { internal_fixture_id: 'fwp-578225', external_fixture_id: '578225', home_team_id: 1, away_team_id: 5,
    is_home_fixture: true, fixture_status: 'played', scheduled_kickoff_at: '2026-08-01T14:00:00Z',
    original_provider_time: '(2) 3 - 3 (1)' },
  { internal_fixture_id: 'fwp-578283', external_fixture_id: '578283', home_team_id: 6, away_team_id: 1,
    is_home_fixture: false, fixture_status: 'played', scheduled_kickoff_at: '2026-08-31T10:30:00Z',
    original_provider_time: '4 - 1' },
  { internal_fixture_id: 'fwp-578325', external_fixture_id: '578325', home_team_id: 2, away_team_id: 1,
    is_home_fixture: false, fixture_status: 'played', scheduled_kickoff_at: '2026-09-26T14:00:00Z',
    original_provider_time: '(1) 2 - 2 (1)' },
  { internal_fixture_id: 'fwp-578264', external_fixture_id: '578264', home_team_id: 3, away_team_id: 1,
    is_home_fixture: false, fixture_status: 'played', scheduled_kickoff_at: '2026-09-29T18:45:00Z',
    original_provider_time: '(0)0 - 5(1)' },
  { internal_fixture_id: 'fwp-578338', external_fixture_id: '578338', home_team_id: 4, away_team_id: 1,
    is_home_fixture: false, fixture_status: 'played', scheduled_kickoff_at: '2026-10-03T14:00:00Z',
    original_provider_time: '(0) 0 - 2 (0)' },
];
// The live scoreboard only ever carried the August matches.
const MATCH_STATE = [
  { fixture_id: 'fwp-578225', home_score: 3, away_score: 3, is_final: true },
  { fixture_id: 'fwp-578283', home_score: 4, away_score: 1, is_final: true },
];

async function withRegistry(fn) {
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/rest/v1/football_teams')) return reply(200, Object.keys(T).map((k) => T[k]));
    if (u.includes('/rest/v1/football_competitions')) return reply(200, []);
    if (u.includes('/rest/v1/football_fixtures')) return reply(200, REGISTRY);
    if (u.includes('/rest/v1/match_state')) return reply(200, MATCH_STATE);
    return reply(404, 'not stubbed');
  };
  try { return await fn(); } finally { global.fetch = realFetch; }
}

test('played fixtures with no live match state still carry their full-time score', async () => {
  const res = await withRegistry(() => READ.results('2026-2027'));
  const by = {};
  res.forEach((r) => { by[r.id] = r; });
  // Ours first: every one of these was away.
  assert.deepStrictEqual([by['fwp-578325'].us, by['fwp-578325'].them, by['fwp-578325'].hasScore], [2, 2, true]);
  assert.deepStrictEqual([by['fwp-578264'].us, by['fwp-578264'].them, by['fwp-578264'].hasScore], [5, 0, true],
    'Harefield 0-5 Rayners Lane is a 5-0 win');
  assert.deepStrictEqual([by['fwp-578338'].us, by['fwp-578338'].them, by['fwp-578338'].hasScore], [2, 0, true]);
});

test('the live match state still wins where it exists — the "3 - 3" form is unchanged', async () => {
  const res = await withRegistry(() => READ.results('2026-2027'));
  const wall = res.filter((r) => r.id === 'fwp-578225')[0];
  assert.deepStrictEqual([wall.us, wall.them, wall.hasScore], [3, 3, true]);
  const ng = res.filter((r) => r.id === 'fwp-578283')[0];
  assert.deepStrictEqual([ng.us, ng.them], [1, 4], 'away 4-1 defeat, from match_state');
});

test('the form guide no longer stops at 31 August', async () => {
  const res = await withRegistry(() => READ.results('2026-2027'));
  const form = READ.formFrom(res, { limit: 5 });
  assert.deepStrictEqual(form.map((f) => f.opponent + ' ' + f.outcome), [
    'Easington Sports W', 'Harefield United W', 'Bedfont D',
    'North Greenford United L', 'Wallingford & Crowmarsh D',
  ]);
  const prev = READ.previousFrom(res, NOW_9_OCT);
  assert.strictEqual(prev.opponent, 'Easington Sports');
  assert.strictEqual(prev.hasScore, true);
});

test('a scheduled fixture never borrows a score from its kick-off cell', () => {
  const f = READ.shapeFixture({ internal_fixture_id: 'x', fixture_status: 'scheduled',
    original_provider_time: '3pm', home_team_id: 1, away_team_id: 2, is_home_fixture: true }, T);
  assert.strictEqual(f._providerScore, null);
  const pp = READ.shapeFixture({ internal_fixture_id: 'y', fixture_status: 'postponed',
    original_provider_time: 'P - P', home_team_id: 1, away_team_id: 2, is_home_fixture: true }, T);
  assert.strictEqual(pp._providerScore, null);
});
