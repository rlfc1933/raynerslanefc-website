// The REAL programme-sync handler, run end to end against an in-memory
// database seeded from the verified 2026/27 facts. This is the reconciliation
// and the two-stage lifecycle working through the actual code path the
// scheduler runs — not a model of it.
'use strict';
process.env.SUPABASE_URL = 'https://fake-supabase.local';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SITE_ORIGIN = 'https://site.local';

const test = require('node:test');
const assert = require('node:assert');
const FAKE = require('./helpers/programme-fake-db');
const SEASON = require('./fixtures/programme/season-2026-27');

function fresh() {
  for (const k of Object.keys(require.cache)) if (/netlify[\\/]functions/.test(k)) delete require.cache[k];
  return require('../netlify/functions/programme-sync');
}

/** Production as it stood on 9 Oct 2026: three published editions. */
function seeded(opts) {
  const db = FAKE.makeDb({}, opts);
  FAKE.seedRegistry(db, SEASON.corrected());
  const rowFor = (ext) => db.football_fixtures.filter((f) => f.external_fixture_id === ext)[0];
  [['578225', 'full_time_current', 2], ['571413', 'published_matchday', 1], ['578278', 'full_time_current', 2]]
    .forEach(([ext, state, v], i) => {
      const f = rowFor(ext);
      db.programme_editions.push({ id: i + 1, fixture_id: f.id, internal_fixture_id: f.internal_fixture_id,
        external_fixture_id: ext, season: '2026-2027', home_team_id: f.home_team_id, away_team_id: f.away_team_id,
        scheduled_kickoff_at: f.scheduled_kickoff_at, state, published_at: '2026-08-30T10:00:00Z', current_version: v,
        slug: 'seed-' + ext, edition_kind: 'matchday', teams_status: 'confirmed' });
      for (let n = 1; n <= v; n++) {
        db.programme_versions.push({ id: 100 + i * 10 + n, edition_id: i + 1, version: n, payload: { sections: {} },
          published_at: '2026-08-30T10:00:00Z' });
      }
    });
  return db;
}

async function run(sync, nowMs) {
  const out = await sync.handler({ httpMethod: 'POST', body: '{}', queryStringParameters: {}, _now: nowMs });
  return JSON.parse(out.body);
}
const ed = (db, ext) => db.programme_editions.filter((e) => e.external_fixture_id === ext)[0];

function lineupRows(db, fixtureRowId, teamId, prefix) {
  const id = db.football_lineups.length + 1;
  db.football_lineups.push({ id, fixture_id: fixtureRowId, team_id: teamId, status: 'confirmed',
    source_updated_at: '2026-10-31T14:05:00Z' });
  for (let i = 1; i <= 16; i++) {
    db.football_lineup_players.push({ id: id * 100 + i, lineup_id: id, provider_player_name: prefix + ' Player ' + i,
      shirt_number: String(i), lineup_role: i <= 11 ? 'starter' : 'substitute', sort_order: i, is_captain: i === 5 });
  }
}

test('a season run creates ONE record per eligible home fixture, across competitions, and repairs the null id', async () => {
  const db = seeded();
  const restore = FAKE.install(db);
  try {
    const out = await run(fresh(), SEASON.NOW);
    assert.strictEqual(out.ok, true, JSON.stringify(out).slice(0, 400));
    assert.strictEqual(out.schema, 'publishing-system');
    // every official home fixture in the corrected season (11 of them)
    const homeExt = SEASON.corrected().filter((f) => f.isHome).map((f) => f.externalId).sort();
    assert.deepStrictEqual(db.programme_editions.map((e) => e.external_fixture_id).sort(), homeExt);
    // the rearranged Hilltop match has a usable id, not null
    assert.strictEqual(ed(db, '590749').internal_fixture_id, 'fwp-590749');
    assert.strictEqual(ed(db, '590749').state, 'retrospective_candidate', 'a proposal for a person, not a publication');
    // called-off fixtures are paused, with no fictional edition
    assert.strictEqual(ed(db, '578321').state, 'postponed');
    assert.strictEqual(ed(db, '578241').state, 'postponed');
    assert.strictEqual(ed(db, '578321').current_version || 0, 0);
    // the three published editions were not touched
    assert.strictEqual(ed(db, '578225').state, 'full_time_current');
    assert.strictEqual(db.programme_versions.length, 5);
    // the next home match waits for a person's approval
    assert.strictEqual(ed(db, '578384').state, 'ready_for_review');
    // Broadfields (H, 28 Nov) at the shared ground is ours; 4 Aug (A) is not.
    assert.ok(ed(db, '578415'));
    assert.ok(!ed(db, '578227'));
  } finally { restore(); }
});

test('running twice (a retried job) creates nothing new', async () => {
  const db = seeded();
  const restore = FAKE.install(db);
  try {
    const sync = fresh();
    await run(sync, SEASON.NOW);
    const counts = [db.programme_editions.length, db.programme_versions.length, db.programme_publication_events.length];
    await run(sync, SEASON.NOW + 60000);
    assert.deepStrictEqual([db.programme_editions.length, db.programme_versions.length,
      db.programme_publication_events.length], counts);
  } finally { restore(); }
});

test('an authorised retrospective Archive Edition publishes from the verified record, labelled, never with 12:00', async () => {
  const db = seeded();
  const restore = FAKE.install(db);
  try {
    const sync = fresh();
    await run(sync, SEASON.NOW);
    Object.assign(ed(db, '590749'), { retrospective_authorised_by: 'Pete Singh', retrospective_authorised_at: '2026-10-09T12:00:00Z' });
    await run(sync, SEASON.NOW + 3600000);
    const e = ed(db, '590749');
    assert.strictEqual(e.state, 'published_recovery');
    assert.strictEqual(e.edition_kind, 'retrospective');
    assert.strictEqual(e.publication_source_detail, 'retrospective');
    const v = db.programme_versions.filter((x) => x.edition_id === e.id)[0];
    const text = JSON.stringify(v.payload);
    assert.match(text, /Archive Edition — Reconstructed from verified match records/);
    assert.match(text, /Rayners Lane 0–1 Hilltop/);
    assert.ok(!/12:00|13:00/.test(text), 'the unconfirmed placeholder time must not print');
    assert.strictEqual(v.stage, 'retrospective');
    assert.ok(Date.parse(v.published_at) > Date.parse('2026-09-09'), 'dated when made, never backdated');
    assert.ok(db.programme_publication_events.some((x) => x.event_type === 'retrospective_published' && x.actor === 'Pete Singh'));
    // and Wokingham, postponed, never became a completed-match programme
    assert.strictEqual(ed(db, '578321').state, 'postponed');
  } finally { restore(); }
});

test('two stages: approved editorial edition on matchday morning, then the team sheets as a revision', async () => {
  const db = seeded();
  const restore = FAKE.install(db);
  try {
    const sync = fresh();
    await run(sync, SEASON.NOW);
    const t = ed(db, '578384');
    Object.assign(t, { editorial_approved_at: '2026-10-30T18:00:00Z', editorial_approved_by: 'Jenny' });
    // Sat 31 Oct, 09:00 GMT — matchday morning in London.
    const morning = Date.parse('2026-10-31T09:00:00Z');
    await run(sync, morning);
    assert.strictEqual(t.state, 'published_matchday');
    assert.strictEqual(t.teams_status, 'pending');
    let vs = db.programme_versions.filter((x) => x.edition_id === t.id);
    assert.strictEqual(vs.length, 1);
    assert.strictEqual(vs[0].stage, 'editorial');
    assert.strictEqual(vs[0].payload.sections.squads.note, 'Confirmed teams will appear here when available.');

    // Only the home XI arrives: partial revision, visitors still a placeholder.
    const fx = db.football_fixtures.filter((f) => f.external_fixture_id === '578384')[0];
    lineupRows(db, fx.id, fx.home_team_id, 'Lane');
    await run(sync, Date.parse('2026-10-31T14:10:00Z'));
    vs = db.programme_versions.filter((x) => x.edition_id === t.id);
    assert.strictEqual(t.teams_status, 'partial');
    assert.strictEqual(vs.length, 2);
    const sq = vs[1].payload.sections.squads;
    assert.strictEqual(sq.home.confirmed, true);
    assert.strictEqual(sq.away.note, 'Confirmed teams will appear here when available.');
    assert.strictEqual(sq.source, 'Football Web Pages');

    lineupRows(db, fx.id, fx.away_team_id, 'Thatcham');
    await run(sync, Date.parse('2026-10-31T14:20:00Z'));
    vs = db.programme_versions.filter((x) => x.edition_id === t.id);
    assert.strictEqual(t.teams_status, 'confirmed');
    assert.strictEqual(vs.length, 3);
    assert.strictEqual(vs[2].stage, 'teams_confirmed');
    // editorial content preserved across the revision
    assert.deepStrictEqual(vs[2].payload.sections.welcome, vs[0].payload.sections.welcome);
    // the same sheet again: no fourth version
    await run(sync, Date.parse('2026-10-31T14:30:00Z'));
    assert.strictEqual(db.programme_versions.filter((x) => x.edition_id === t.id).length, 3);
  } finally { restore(); }
});

test('postponed AFTER publication: the edition is preserved, marked, and stays readable', async () => {
  const db = seeded();
  const restore = FAKE.install(db);
  try {
    const sync = fresh();
    await run(sync, SEASON.NOW);
    const t = ed(db, '578384');
    Object.assign(t, { editorial_approved_at: '2026-10-30T18:00:00Z', editorial_approved_by: 'Jenny' });
    await run(sync, Date.parse('2026-10-31T09:00:00Z'));
    db.football_fixtures.filter((f) => f.external_fixture_id === '578384')[0].fixture_status = 'postponed';
    await run(sync, Date.parse('2026-10-31T11:00:00Z'));
    assert.strictEqual(t.state, 'published_matchday', 'still public');
    assert.ok(t.fixture_postponed_at, 'and marked postponed');
    assert.strictEqual(db.programme_versions.filter((x) => x.edition_id === t.id).length, 1, 'nothing deleted or rebuilt');
  } finally { restore(); }
});

test('before the migration is applied the engine still runs, on legacy states only', async () => {
  const db = seeded({ schemaV2: false });
  const restore = FAKE.install(db);
  try {
    const out = await run(fresh(), SEASON.NOW);
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.schema, 'legacy');
    assert.strictEqual(out.failed, 0, JSON.stringify(out.outcomes.filter((o) => o.error)));
    const legal = ['draft_hidden', 'waiting_for_matchday', 'waiting_for_lineups', 'ready_to_publish', 'published_matchday',
      'published_late', 'full_time_current', 'archived', 'withheld', 'published_recovery', 'retrospective_candidate'];
    db.programme_editions.forEach((e) => assert.ok(legal.includes(e.state), 'illegal legacy state ' + e.state));
    db.programme_editions.forEach((e) => assert.ok(!('teams_status' in e) || e.id <= 3, 'v2 column written on legacy schema'));
  } finally { restore(); }
});
