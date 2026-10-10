// Programme HQ actions, through the real programme-admin + programme-sync +
// programme-data functions, on an in-memory database.
'use strict';
process.env.SUPABASE_URL = 'https://fake-supabase.local';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SITE_ORIGIN = 'https://site.local';

const test = require('node:test');
const assert = require('node:assert');
const FAKE = require('./helpers/programme-fake-db');
const SEASON = require('./fixtures/programme/season-2026-27');

function load() {
  for (const k of Object.keys(require.cache)) if (/netlify[\\/]functions/.test(k)) delete require.cache[k];
  return {
    admin: require('../netlify/functions/programme-admin'),
    sync: require('../netlify/functions/programme-sync'),
    data: require('../netlify/functions/programme-data'),
  };
}
async function call(fn, body) {
  const r = await fn.handler({ httpMethod: 'POST', body: JSON.stringify(Object.assign({ pin: '1933' }, body)) });
  return Object.assign({ status: r.statusCode }, JSON.parse(r.body));
}
async function setup() {
  const db = FAKE.makeDb();
  FAKE.seedRegistry(db, SEASON.corrected());
  const restore = FAKE.install(db);
  const F = load();
  await F.sync.handler({ httpMethod: 'POST', body: '{}', _now: SEASON.NOW });
  return { db, restore, F };
}
const ed = (db, ext) => db.programme_editions.filter((e) => e.external_fixture_id === ext)[0];

test('HQ refuses without the committee password, and every decision needs a name', async () => {
  const { restore, F } = await setup();
  try {
    const r = await F.admin.handler({ httpMethod: 'POST', body: JSON.stringify({ action: 'status' }) });
    assert.strictEqual(r.statusCode, 401);
    const n = await call(F.admin, { action: 'approve_editorial', fixtureId: 'fwp-578384' });
    assert.strictEqual(n.status, 400);
    assert.match(n.error, /your name/);
  } finally { restore(); }
});

test('status gives the reconciliation table and the next home fixture with what is missing', async () => {
  const { restore, F } = await setup();
  try {
    const s = await call(F.admin, { action: 'status' });
    assert.strictEqual(s.ok, true);
    assert.strictEqual(s.reconciliation.summary.eligiblePlayedHome, 4);
    // On an empty database every played home match now HAS a record, waiting
    // for a person to authorise its Archive Edition — none is silently missing.
    assert.deepStrictEqual(s.reconciliation.summary.historicalMissing, []);
    assert.deepStrictEqual(s.reconciliation.rows.filter((r) => r.status === 'Awaiting approval' && r.matchStatus === 'played')
      .map((r) => r.fixtureId).sort(), ['favase-1q-new-bradwell-20260815', 'fwp-578225', 'fwp-578278', 'fwp-590749']);
    assert.strictEqual(s.next.fixture.fixtureId, 'fwp-578384');
    assert.ok(s.next.missing.includes('editorial approval'));
    assert.match(s.sources.fwpApi, /not connected/);
  } finally { restore(); }
});

test('approve → matchday publish → the archive lists it; unpublish keeps it; restore brings it back', async () => {
  const { db, restore, F } = await setup();
  try {
    const a = await call(F.admin, { action: 'approve_editorial', fixtureId: 'fwp-578384', by: 'Jenny' });
    assert.strictEqual(a.ok, true, a.error);
    await F.sync.handler({ httpMethod: 'POST', body: '{}', _now: Date.parse('2026-10-31T09:00:00Z') });
    assert.strictEqual(ed(db, '578384').state, 'published_matchday');

    let list = JSON.parse((await F.data.handler({ queryStringParameters: {} })).body);
    assert.ok(list.editions.some((e) => e.fixtureId === 'fwp-578384'));

    const u = await call(F.admin, { action: 'unpublish', fixtureId: 'fwp-578384', by: 'Pete', reason: 'wrong date on cover' });
    assert.strictEqual(u.ok, true);
    list = JSON.parse((await F.data.handler({ queryStringParameters: {} })).body);
    assert.ok(!list.editions.some((e) => e.fixtureId === 'fwp-578384'), 'no longer public');
    assert.strictEqual(db.programme_versions.filter((v) => v.edition_id === ed(db, '578384').id).length, 1, 'nothing deleted');
    // the timer does not undo a person's decision
    await F.sync.handler({ httpMethod: 'POST', body: '{}', _now: Date.parse('2026-10-31T10:00:00Z') });
    assert.strictEqual(ed(db, '578384').state, 'withheld');

    const r = await call(F.admin, { action: 'restore', fixtureId: 'fwp-578384', by: 'Pete' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(ed(db, '578384').state, 'published_matchday');
    assert.ok(db.programme_publication_events.some((e) => e.event_type === 'unpublished' && e.actor === 'Pete'));
  } finally { restore(); }
});

test('authorising the Hilltop Archive Edition publishes it and the ledger says "Archive edition"', async () => {
  const { db, restore, F } = await setup();
  try {
    const r = await call(F.admin, { action: 'authorise_retrospective', fixtureId: 'fwp-590749', by: 'Pete Singh',
      reason: 'complete the 2026/27 archive' });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(ed(db, '590749').edition_kind, 'retrospective');
    const list = JSON.parse((await F.data.handler({ queryStringParameters: {} })).body);
    const row = list.ledger.filter((x) => x.fixtureId === 'fwp-590749')[0];
    assert.strictEqual(row.label, 'Archive edition');
    assert.strictEqual(list.ledger.filter((x) => x.fixtureId === 'fwp-578321')[0].label, 'Postponed');
    const card = list.editions.filter((e) => e.fixtureId === 'fwp-590749')[0];
    assert.strictEqual(card.editionKind, 'retrospective');
  } finally { restore(); }
});

test('rollback and name correction are new versions; history is kept', async () => {
  const { db, restore, F } = await setup();
  try {
    await call(F.admin, { action: 'approve_editorial', fixtureId: 'fwp-578384', by: 'Jenny' });
    await F.sync.handler({ httpMethod: 'POST', body: '{}', _now: Date.parse('2026-10-31T09:00:00Z') });
    const e = ed(db, '578384');
    const fx = db.football_fixtures.filter((f) => f.external_fixture_id === '578384')[0];
    [fx.home_team_id, fx.away_team_id].forEach((team, s) => {
      const id = db.football_lineups.length + 1;
      db.football_lineups.push({ id, fixture_id: fx.id, team_id: team, status: 'confirmed', source_updated_at: '2026-10-31T14:00:00Z' });
      for (let i = 1; i <= 14; i++) db.football_lineup_players.push({ lineup_id: id, provider_player_name: (s ? 'Away ' : 'Home ') + i,
        shirt_number: String(i), lineup_role: i <= 11 ? 'starter' : 'substitute', sort_order: i });
    });
    await F.sync.handler({ httpMethod: 'POST', body: '{}', _now: Date.parse('2026-10-31T14:10:00Z') });
    assert.strictEqual(e.current_version, 2);

    const c = await call(F.admin, { action: 'correct_player', fixtureId: 'fwp-578384', by: 'Jenny', side: 'home',
      from: 'Home 7', to: 'Home Seven' });
    assert.strictEqual(c.ok, true, c.error);
    assert.strictEqual(e.current_version, 3);
    // a later provider refresh keeps the correction
    db.football_lineup_players.filter((p) => p.provider_player_name === 'Away 12')[0].lineup_role = 'starter';
    db.football_lineup_players.filter((p) => p.provider_player_name === 'Away 11')[0].lineup_role = 'substitute';
    await F.sync.handler({ httpMethod: 'POST', body: '{}', _now: Date.parse('2026-10-31T17:30:00Z') });

    const rb = await call(F.admin, { action: 'rollback', fixtureId: 'fwp-578384', by: 'Pete', toVersion: 1, reason: 'test' });
    assert.strictEqual(rb.ok, true, rb.error);
    const vs = db.programme_versions.filter((v) => v.edition_id === e.id);
    assert.ok(vs.length >= 4, 'every version kept');
    assert.strictEqual(vs.filter((v) => v.stage === 'rollback')[0].restored_from_version, 1);
    const h = await call(F.admin, { action: 'history', fixtureId: 'fwp-578384' });
    assert.ok(h.events.some((x) => x.event_type === 'team_sheet_corrected'));
  } finally { restore(); }
});

test('a sponsor saved without an agreed deal is a proposal and never renders', async () => {
  const { db, restore, F } = await setup();
  try {
    await call(F.admin, { action: 'add_placement', fixtureId: 'fwp-578384', by: 'Jenny', kind: 'match_ball',
      sponsorName: 'Prospect Bakery', approve: true /* but confirmAgreed missing */ });
    assert.strictEqual(db.programme_sponsor_placements[0].approval_status, 'proposed');
    await call(F.admin, { action: 'approve_editorial', fixtureId: 'fwp-578384', by: 'Jenny' });
    await F.sync.handler({ httpMethod: 'POST', body: '{}', _now: Date.parse('2026-10-31T09:00:00Z') });
    const v = db.programme_versions.filter((x) => x.edition_id === ed(db, '578384').id)[0];
    assert.ok(!JSON.stringify(v.payload).includes('Prospect Bakery'));
  } finally { restore(); }
});

test('chairman\'s notes need a named byline before they can be approved', async () => {
  const { restore, F } = await setup();
  try {
    const r = await call(F.admin, { action: 'save_section', fixtureId: 'fwp-578384', by: 'Jenny',
      sectionKey: 'chairNotes', body: 'Welcome', approve: true });
    assert.strictEqual(r.status, 400);
    const ok = await call(F.admin, { action: 'save_section', fixtureId: 'fwp-578384', by: 'Jenny',
      sectionKey: 'preview', body: 'A preview Jenny wrote', approve: false });
    assert.match(ok.message, /draft/);
  } finally { restore(); }
});
