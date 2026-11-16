// Commercial workflow links: enquiry → organisation → agreed deal → fixture
// booking → approved artwork → programme sponsor → fulfilment.
// Run through the REAL club-os function against the in-memory database.
'use strict';
process.env.SUPABASE_URL = 'https://fake-supabase.local';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.NODE_ENV = 'test';
process.env.MD_ALLOW_DEV_SECRET = '1';
process.env.FWP_SEASON = '2026-2027';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeDb, install } = require('../quality/tests/support/fake-supabase');
const CM = require('../netlify/functions/lib/rebirth/commercial');

const iso = (days) => { const d = new Date(Date.now() + days * 864e5); d.setUTCHours(14, 0, 0, 0); return d.toISOString(); };
function fresh(seed = {}) {
  const db = makeDb(Object.assign({
    football_teams: [{ id: 1, canonical_name: 'Rayners Lane', is_rayners_lane: true }, { id: 2, canonical_name: 'Thatcham Town' }],
    football_competitions: [],
    football_fixtures: [{ internal_fixture_id: 'fwp-900', season: '2026-2027', home_team_id: 1, away_team_id: 2, is_home_fixture: true, fixture_status: 'scheduled', scheduled_kickoff_at: iso(10), first_team: true, sync_status: 'idle' }],
  }, seed));
  const restore = install(db);
  for (const k of Object.keys(require.cache)) if (/netlify[\\/]functions/.test(k)) delete require.cache[k];
  const fn = require('../netlify/functions/club-os');
  const call = async (actor, body) => JSON.parse((await fn.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(Object.assign({ pin: '1933', actor }, body)) })).body);
  return { db, restore, call };
}

test('pure rules: confirmed means won/agreed only; org matching ignores case, spacing and suffixes', () => {
  assert.equal(CM.isConfirmed({ kind: 'opportunity', stage: 'won' }), true);
  assert.equal(CM.isConfirmed({ kind: 'opportunity', stage: 'agreed' }), true);
  ['proposal', 'negotiation', 'responded', 'lost'].forEach((s) => assert.equal(CM.isConfirmed({ kind: 'opportunity', stage: s }), false, s));
  const orgs = [{ id: 'a', name: 'Hanlon Dry Lining Ltd' }, { id: 'b', name: 'Other', website_host: 'bakery.co.uk' }];
  assert.deepEqual(CM.orgMatches({ name: '  hanlon   DRY lining ' }, orgs).map((m) => m.id), ['a']);
  assert.deepEqual(CM.orgMatches({ name: 'Nope', contact_email: 'sam@bakery.co.uk' }, orgs).map((m) => m.id), ['b']);
  assert.deepEqual(CM.orgMatches({ name: 'Nope', contact_email: 'sam@gmail.com' }, [{ id: 'c', name: 'X', contact_email: 'jo@gmail.com' }]), [], 'free mail is not a company domain');
  assert.equal(CM.artworkState({}), 'missing');
  assert.equal(CM.artworkState({ artwork_path: 'img/a.png' }), 'awaiting_approval');
  assert.equal(CM.artworkState({ artwork_path: 'img/a.png', artwork_status: 'approved' }), 'awaiting_approval', 'approved needs a named approver');
  assert.equal(CM.artworkState({ artwork_path: 'img/a.png', artwork_status: 'approved', artwork_approved_by: 'Pete' }), 'approved');
});

test('fixtureSponsors offers only confirmed deals, lists proposals as not confirmed, flags conflicts', () => {
  const slots = [{ fixture_id: 'f1', slot: 'matchday', opportunity_id: 'o1', status: 'confirmed' }, { fixture_id: 'f1', slot: 'matchball', opportunity_id: 'o2', status: 'held' }];
  const opps = [{ id: 'o1', stage: 'won', org_id: 'g1', title: 'Hanlon — sponsorship', data: { artwork_path: 'img/h.png', artwork_status: 'approved', artwork_approved_by: 'Pete' } },
    { id: 'o2', stage: 'proposal', title: 'Bakery — sponsorship', data: {} }, { id: 'o3', stage: 'won', title: 'Ghost', data: { fixture_id: 'f1' } }];
  const r = CM.fixtureSponsors('f1', slots, opps, [{ id: 'g1', name: 'Hanlon' }]);
  assert.deepEqual(r.offers.map((o) => [o.sponsor, o.artwork_path]), [['Hanlon', 'img/h.png']]);
  assert.equal(r.notConfirmed[0].sponsor, 'Bakery'); assert.match(r.notConfirmed[0].why, /not agreed/);
  assert.equal(r.conflicts.length, 1); assert.deepEqual(r.conflicts[0].opportunity_ids, ['o3']);
});

test('fulfilment guard: never for drafts, previews, approvals that have not published, or unconfirmed deals', () => {
  const won = { kind: 'opportunity', stage: 'won' };
  assert.match(CM.fulfilmentGuard(won, {}), /No published edition/);
  assert.match(CM.fulfilmentGuard(won, { editionId: 'e1', published: false }), /not published/);
  assert.match(CM.fulfilmentGuard({ kind: 'opportunity', stage: 'proposal' }, { editionId: 'e1', published: true }), /confirmed/);
  assert.equal(CM.fulfilmentGuard(won, { editionId: 'e1', published: true }), null);
});

test('SCENARIO — enquiry reuses the existing organisation (confirmed), books, conflicts, artwork, fulfilment', async () => {
  const { db, restore, call } = fresh({ hq_orgs: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Hanlon Dry Lining', relationship: 'prospect' }] });
  try {
    const enq = (await call('Pete', { action: 'create', kind: 'enquiry', title: 'Sponsorship enquiry — hanlon  dry LINING ltd' })).item;
    // Deny: a role without the committee PIN is refused.
    const fn = require('../netlify/functions/club-os');
    assert.equal((await fn.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ action: 'convertEnquiry', id: enq.id, actor: 'X' }) })).statusCode, 401);
    const first = await call('Pete', { action: 'convertEnquiry', id: enq.id, owner: 'Pete', package: 'match' });
    assert.equal(first.ok, false); assert.equal(first.needsConfirm, true);
    assert.deepEqual(first.org_matches.map((m) => m.name), ['Hanlon Dry Lining']);
    assert.equal(db.hq_orgs.length, 1, 'no duplicate organisation is created');
    assert.match((await call('Pete', { action: 'convertEnquiry', id: enq.id, owner: 'Pete', use_org_id: '22222222-2222-4222-8222-222222222222' })).error, /does not match/);
    const conv = await call('Pete', { action: 'convertEnquiry', id: enq.id, owner: 'Pete', package: 'match', use_org_id: db.hq_orgs[0].id });
    assert.equal(conv.ok, true); assert.equal(conv.item.org_id, db.hq_orgs[0].id); assert.equal(db.hq_orgs.length, 1);
    const opp = conv.item;
    await call('Pete', { action: 'move', id: opp.id, to: 'proposal' });
    await call('Pete', { action: 'approvePackage', id: opp.id, package: 'match', price: '100' });
    const bk = await call('Pete', { action: 'book', opportunity_id: opp.id, fixture_id: 'fwp-900' });
    assert.equal(bk.ok, true); assert.equal(bk.item.data.booking_org_id, db.hq_orgs[0].id);
    assert.ok(db.hq_audit.some((a) => a.action === 'book-slot' && a.after.org_id === db.hq_orgs[0].id), 'booking audited with org');

    // A second deal for the same slot is refused and shown the conflict.
    const o2 = (await call('Jo', { action: 'create', kind: 'opportunity', title: 'Rival — sponsorship' })).item;
    db.hq_items.find((i) => i.id === o2.id).data = { package: 'match', package_approved_by: 'Jo' };
    const clash = await call('Jo', { action: 'book', opportunity_id: o2.id, fixture_id: 'fwp-900' });
    assert.equal(clash.ok, false); assert.match(clash.error, /already taken by “Hanlon Dry Lining — sponsorship”/);
    assert.equal(clash.conflict.opportunity_id, opp.id);

    // Not yet won → offered as not confirmed.
    let fsx = await call('Pete', { action: 'fixtureSponsors', fixture_id: 'fwp-900' });
    assert.equal(fsx.offers.length, 0); assert.equal(fsx.notConfirmed.length, 1);
    assert.match((await call('Pete', { action: 'recordFulfilment', opportunity_id: opp.id, edition_id: 'e1', published: true })).error, /confirmed sponsorship/);

    // Artwork: approval needs a file and a named person.
    assert.match((await call('Pete', { action: 'approveArtwork', opportunity_id: opp.id })).error, /no artwork/);
    assert.match((await call('Pete', { action: 'submitArtwork', opportunity_id: opp.id, artwork_path: '../etc/passwd' })).error, /file path/);
    assert.equal((await call('Pete', { action: 'submitArtwork', opportunity_id: opp.id, artwork_path: 'img/sponsors/hanlon.png' })).artwork, 'awaiting_approval');
    assert.equal((await call('Pete', { action: 'approveArtwork', opportunity_id: opp.id })).artwork, 'approved');
    assert.equal((await call('Pete', { action: 'move', id: opp.id, to: 'won' })).ok, true);
    fsx = await call('Pete', { action: 'fixtureSponsors', fixture_id: 'fwp-900' });
    assert.deepEqual(fsx.offers.map((o) => [o.sponsor, o.artwork, o.artwork_path]), [['Hanlon Dry Lining', 'approved', 'img/sponsors/hanlon.png']]);

    // Fulfilment: refused without a published edition; recorded once with one; re-read is canonical.
    assert.match((await call('Pete', { action: 'recordFulfilment', opportunity_id: opp.id, edition_id: 'e1' })).error, /not published/);
    const ful = await call('Pete', { action: 'recordFulfilment', opportunity_id: opp.id, edition_id: 'e1', published: true });
    assert.equal(ful.ok, true);
    const reread = await call('Pete', { action: 'get', id: opp.id });
    assert.equal(reread.item.data.fulfilled_edition, 'e1'); assert.ok(reread.item.data.fulfilled_at);
    assert.ok(db.hq_audit.some((a) => a.action === 'update' && a.entity_id === opp.id && /edition e1/.test(a.note || '')));
    assert.equal((await call('Pete', { action: 'recordFulfilment', opportunity_id: opp.id, edition_id: 'e1', published: true })).duplicate, true);
  } finally { restore(); }
});

// ── programme editor: pure functions loaded in a sandbox ─────────────────
function loadEditor() {
  const els = {};
  const win = { document: { getElementById: (id) => els[id] || null, querySelectorAll: () => [] }, localStorage: { getItem: () => null }, fetch: () => Promise.reject() };
  win.window = win;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js/programme-editor.js'), 'utf8'), Object.assign(win, { Event: function () {} }));
  return { PRE: win.PRE, win, els };
}
const FS = { offers: [{ opportunity_id: 'o1', slot: 'matchday', sponsor: 'Hanlon', artwork: 'approved', artwork_path: 'img/h.png' },
  { opportunity_id: 'o2', slot: 'matchball', sponsor: 'Bakery', artwork: 'missing', artwork_path: null }],
  notConfirmed: [{ opportunity_id: 'o3', slot: 'matchday', sponsor: 'Maybe Ltd', why: 'deal not agreed (proposal)' }], conflicts: [] };

test('programme editor offers ONLY confirmed bookings for the slot, and only approved artwork', () => {
  const { PRE } = loadEditor();
  assert.deepEqual(PRE.sponsorOffers(FS, 'pr-matchsponsor').map((o) => o.sponsor), ['Hanlon']);
  assert.deepEqual(PRE.sponsorOffers(FS, 'pr-ballsponsor').map((o) => o.sponsor), ['Bakery']);
  PRE.fxSponsors = FS;
  assert.equal(PRE.artFor('pr-matchsponsor', ' hanlon '), 'img/h.png');
  assert.equal(PRE.artFor('pr-ballsponsor', 'Bakery'), '', 'missing artwork is never printed');
  assert.equal(PRE.artFor('pr-matchsponsor', 'Maybe Ltd'), '', 'proposals are not offered');
});

test('programme checks: unconfirmed sponsor, missing artwork, conflicts, unfulfilled placement, unknown bookings', () => {
  const { PRE } = loadEditor();
  const c = PRE.commercialChecks({ matchSponsor: 'Maybe Ltd', ballSponsor: 'Bakery' }, Object.assign({}, FS, { conflicts: [{ slot: 'matchday', why: 'two bookings for the same slot' }] }));
  const t = c.map((x) => x.level + ':' + x.text).join('\n');
  assert.ok(c.every((x) => x.kind === 'Club'));
  assert.match(t, /must:Conflicting sponsor bookings/);
  assert.match(t, /must:Match sponsor “Maybe Ltd” is not a confirmed booking.*not confirmed/);
  assert.match(t, /must:Match ball sponsor “Bakery”: artwork missing/);
  assert.match(t, /warn:Hanlon has a confirmed matchday booking.*unfulfilled/);
  assert.equal(PRE.commercialChecks({ matchSponsor: 'Hanlon' }, null)[0].level, 'warn', 'unknown bookings are not "no problem"');
  assert.match(PRE.commercialChecks({ matchSponsor: 'Hanlon' }, { error: 'down' })[0].text, /could not be read/);
  assert.deepEqual(PRE.commercialChecks({ matchSponsor: 'Hanlon' }, FS.offers.length ? { offers: [FS.offers[0]], notConfirmed: [], conflicts: [] } : null), []);
});

test('fulfilment is recorded only after a published edition, never for a draft or approval', async () => {
  const { PRE, win } = loadEditor();
  const calls = [];
  win.ClubOS = { write: (a, b) => { calls.push([a, b]); return Promise.resolve({ ok: true }); } };
  PRE.fxSponsors = FS;
  const doc = { fixtureId: 'fwp-900', matchSponsor: 'Hanlon' };
  assert.equal((await win.prRecordFulfilment(doc, { editionId: 'e1', published: false })).skipped, true);
  assert.equal((await win.prRecordFulfilment(doc, {})).skipped, true);
  assert.equal(calls.length, 0);
  assert.equal((await win.prRecordFulfilment(doc, { editionId: 'e1', published: true })).recorded, 1);
  assert.deepEqual(calls[0], ['recordFulfilment', { opportunity_id: 'o1', edition_id: 'e1', published: true, fixture_id: 'fwp-900' }]);
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/programme-editor.js'), 'utf8');
  assert.match(src, /prRecordFulfilment\(doc, \{ editionId: r\.j && r\.j\.editionId/, 'hooked after the publish call succeeded');
  assert.doesNotMatch(src.slice(src.indexOf('global.prPrintEdition'), src.indexOf('global.prPreviewEdition')), /Fulfilment/, 'preview never records');
});

test('fulfilment is recorded by the programme sync when an edition goes public, once, for confirmed deals only', async () => {
  const W = '11111111-1111-4111-8111-111111111111', P = '22222222-2222-4222-8222-222222222222';
  const { db, restore } = fresh({
    hq_items: [{ id: W, kind: 'opportunity', stage: 'won', title: 'Won deal', data: { fixture_id: 'fwp-900' } },
      { id: P, kind: 'opportunity', stage: 'proposal', title: 'Proposed deal', data: {} }],
    hq_fixture_slots: [{ fixture_id: 'fwp-900', slot: 'matchday', opportunity_id: W }, { fixture_id: 'fwp-900', slot: 'matchball', opportunity_id: P }],
    hq_audit: [],
  });
  try {
    const os = require('../netlify/functions/club-os');
    const r1 = await os.recordProgrammeFulfilment(['uuid-of-registry', 'fwp-900'], 'edition-1');
    assert.equal(r1.ok, true);
    assert.equal(r1.recorded, 1, 'only the confirmed deal is fulfilled');
    assert.equal(db.hq_items.find((i) => i.id === W).data.fulfilled_edition, 'edition-1');
    assert.ok(!db.hq_items.find((i) => i.id === P).data.fulfilled_edition, 'a proposal is never marked delivered');
    const r2 = await os.recordProgrammeFulfilment(['fwp-900'], 'edition-1');
    assert.equal(r2.recorded, 0, 'running the sync again records nothing twice');
  } finally { restore(); }
  const sync = fs.readFileSync(path.join(__dirname, '..', 'netlify/functions/programme-sync.js'), 'utf8');
  assert.match(sync, /if \(patch\.published_at && !edition\.published_at\) \{\s*try \{ fulfilment = await require\('\.\/club-os'\)\.recordProgrammeFulfilment/, 'recorded only at the moment of first publication');
});
