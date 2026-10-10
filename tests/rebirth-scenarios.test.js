// THE REBIRTH DIRECTIVE — acceptance scenarios 1, 2, 5, 6, 8 and 10, run
// through the REAL club-os function against an in-memory database (no
// production rows, nothing sent). Each scenario checks the completed outcome
// AND the realistic thing that goes wrong.
'use strict';
process.env.SUPABASE_URL = 'https://fake-supabase.local';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.NODE_ENV = 'test';
process.env.MD_ALLOW_DEV_SECRET = '1';
process.env.FWP_SEASON = '2026-2027';

const test = require('node:test');
const assert = require('node:assert');
const { makeDb, install } = require('../quality/tests/support/fake-supabase');

const DAY = 864e5;
const iso = (days, hour = 14) => { const d = new Date(Date.now() + days * DAY); d.setUTCHours(hour, 0, 0, 0); return d.toISOString(); };
function registrySeed() {
  return {
    football_teams: [{ id: 1, canonical_name: 'Rayners Lane', is_rayners_lane: true }, { id: 2, canonical_name: 'Thatcham Town' }, { id: 3, canonical_name: 'Away Opponent' },
      { id: 4, canonical_name: 'Later Visitors' }, { id: 5, canonical_name: 'Earlier Visitors' }],
    football_competitions: [],
    football_fixtures: [
      { internal_fixture_id: 'fwp-900', season: '2026-2027', home_team_id: 1, away_team_id: 2, is_home_fixture: true, fixture_status: 'scheduled', scheduled_kickoff_at: iso(10), first_team: true, sync_status: 'idle' },
      { internal_fixture_id: 'fwp-901', season: '2026-2027', home_team_id: 3, away_team_id: 1, is_home_fixture: false, fixture_status: 'scheduled', scheduled_kickoff_at: iso(5), first_team: true, sync_status: 'idle' },
      { internal_fixture_id: 'fwp-902', season: '2026-2027', home_team_id: 1, away_team_id: 4, is_home_fixture: true, fixture_status: 'scheduled', scheduled_kickoff_at: iso(24), first_team: true, sync_status: 'idle' },
      { internal_fixture_id: 'fwp-800', season: '2026-2027', home_team_id: 1, away_team_id: 5, is_home_fixture: true, fixture_status: 'played', scheduled_kickoff_at: iso(-7), first_team: true, sync_status: 'idle' },
      { internal_fixture_id: 'fwp-801', season: '2026-2027', home_team_id: 1, away_team_id: 4, is_home_fixture: true, fixture_status: 'played', scheduled_kickoff_at: iso(-21), first_team: true, sync_status: 'idle' },
      { internal_fixture_id: 'fwp-802', season: '2026-2027', home_team_id: 1, away_team_id: 2, is_home_fixture: true, fixture_status: 'played', scheduled_kickoff_at: iso(-35), first_team: true, sync_status: 'idle' },
    ],
  };
}
function fresh(seed = {}) {
  const db = makeDb(Object.assign(registrySeed(), seed));
  const restore = install(db);
  for (const k of Object.keys(require.cache)) if (/netlify[\\/]functions/.test(k)) delete require.cache[k];
  const fn = require('../netlify/functions/club-os');
  const call = async (actor, body, headers) => JSON.parse((await fn.handler({ httpMethod: 'POST', headers: headers || {}, body: JSON.stringify(Object.assign({ pin: '1933', actor }, body)) })).body);
  return { db, restore, call, fn };
}
const fx = (db, id) => db.football_fixtures.find((f) => f.internal_fixture_id === id);

test('SCENARIO 1 — a local business offers £100 and becomes a matchday sponsor', async () => {
  const { db, restore, call, fn } = fresh();
  try {
    // The website enquiry reaches HQ (same path submit-form.js uses).
    const intake = await fn.intakeEnquiry({ id: 'sub-1', name: 'Sam Baker', email: 'sam@harrowbakery.co.uk', message: 'We would like to sponsor a home match for £100.', fields: { company: 'Harrow Bakery Ltd', budget: '£100' } });
    assert.equal(intake.ok, true);
    const enq = db.hq_items.find((i) => i.kind === 'enquiry');
    // It is on the chairman's money list.
    let p = await call('Pete', { action: 'priorities' });
    assert.ok(p.money.find((g) => g.key === 'enquiries').items.some((i) => i.id === enq.id));
    assert.equal(p.supporters.nextHomeFixture.opponent, 'Thatcham Town');

    // Convert → deal at "responded", owned; the enquiry is assigned with a reply task.
    const conv = await call('Pete', { action: 'convertEnquiry', id: enq.id, owner: 'Pete', package: 'match' });
    assert.equal(conv.ok, true); const opp = conv.item; assert.equal(opp.stage, 'responded');
    assert.equal((await call('Pete', { action: 'convertEnquiry', id: enq.id, owner: 'Pete' })).duplicate, true, 'double click makes one deal');
    assert.ok(db.hq_items.some((i) => i.kind === 'task' && /^Reply to:/.test(i.title)));

    // Cannot be won before a person approves the package AND a real home fixture is booked.
    await call('Pete', { action: 'move', id: opp.id, to: 'proposal' });
    assert.match((await call('Pete', { action: 'move', id: opp.id, to: 'won' })).error, /approve the package/);
    assert.match((await call('Pete', { action: 'approvePackage', id: opp.id, package: 'board', price: 100 })).error, /not the club’s to sell/);
    assert.equal((await call('Pete', { action: 'approvePackage', id: opp.id, package: 'match', price: '100' })).ok, true);
    assert.match((await call('Pete', { action: 'move', id: opp.id, to: 'won' })).error, /Book a home fixture/);

    // Availability: only HOME, scheduled, future fixtures; the away game is not sellable.
    const av = await call('Pete', { action: 'availability' });
    assert.deepEqual(av.fixtures.map((f) => f.fixture_id), ['fwp-900', 'fwp-902']);
    assert.match((await call('Pete', { action: 'book', opportunity_id: opp.id, fixture_id: 'fwp-901' })).error, /Away fixture/);
    assert.match((await call('Pete', { action: 'book', opportunity_id: opp.id, fixture_id: 'fwp-800' })).error, /played|kicked off/);
    assert.equal((await call('Pete', { action: 'book', opportunity_id: opp.id, fixture_id: 'fwp-900' })).ok, true);

    // No overselling: a second business cannot take the same matchday slot.
    const org2 = (await call('Pete', { action: 'saveOrg', name: 'Pinner Florist Ltd', relationship: 'prospect' })).org;
    const opp2 = (await call('Pete', { action: 'create', kind: 'opportunity', title: 'Pinner Florist — matchday', org_id: org2.id })).item;
    await call('Pete', { action: 'approvePackage', id: opp2.id, package: 'match', price: 100 });
    assert.match((await call('Pete', { action: 'book', opportunity_id: opp2.id, fixture_id: 'fwp-900' })).error, /already taken/);
    assert.equal(db.hq_fixture_slots.length, 1);

    // Won → package-specific fulfilment, a £100 invoice draft, a renewal task dated after the match.
    const won = await call('Pete', { action: 'move', id: opp.id, to: 'won' });
    assert.equal(won.ok, true, won.error);
    const kids = db.hq_items.filter((i) => i.parent_id === opp.id);
    const ful = kids.filter((k) => k.kind === 'fulfilment').map((k) => k.title);
    assert.ok(ful.some((t) => /Booking confirmed/.test(t)) && ful.every((t) => !/board|hospitality/i.test(t)), 'only what the package promises');
    const inv = kids.find((k) => k.kind === 'invoice'); assert.equal(inv.value_pence, 10000);
    const renewal = kids.find((k) => k.kind === 'task'); assert.ok(renewal.due_date > new Date().toISOString().slice(0, 10));
    assert.equal(db.hq_fixture_slots[0].status, 'confirmed');

    // Invoice: approval by a named person → issued with a number → paid only with bank evidence.
    await call('Jenny', { action: 'move', id: inv.id, to: 'approved' });
    const iss = await call('Jenny', { action: 'move', id: inv.id, to: 'issued' }); assert.equal(iss.ok, true, iss.error);
    assert.match((await call('Jenny', { action: 'pay', id: inv.id, amount: 100 })).error, /how you know/);
    const paid = await call('Jenny', { action: 'pay', id: inv.id, amount: 100, evidence: 'Bank ref HB100, 12 Oct' });
    assert.equal(paid.ok, true, paid.error); assert.equal(paid.item.stage, 'paid');

    // Fulfilment ticked; the scorecard shows real contracted and collected money — and the
    // unrelated researched prospect is not a sponsor.
    for (const f of db.hq_items.filter((i) => i.parent_id === opp.id && i.kind === 'fulfilment')) await call('Jenny', { action: 'move', id: f.id, to: 'done' });
    const sc = await call('Pete', { action: 'scorecard' });
    const m = (k) => sc.funding.find((x) => x.key === k);
    assert.equal(m('contracted').value, 10000); assert.equal(m('collected').value, 10000); assert.equal(m('paying').value, 1);
    assert.equal(sc.interest.find((x) => x.key === 'prospects').value, 1, 'Pinner Florist is a researched prospect, reported separately');
    assert.equal(m('gap').restricted, true, 'the funding gap is confidential without finance sign-in');
  } finally { restore(); }
});

test('SCENARIO 7 (sponsor side) — a postponed or rearranged fixture frees the slot and flags the deal for re-booking', async () => {
  const { db, restore, call } = fresh();
  try {
    const opp = (await call('Pete', { action: 'create', kind: 'opportunity', title: 'Rayners Café — match ball' })).item;
    await call('Pete', { action: 'approvePackage', id: opp.id, package: 'matchball', price: 50 });
    assert.equal((await call('Pete', { action: 'book', opportunity_id: opp.id, fixture_id: 'fwp-900' })).ok, true);
    fx(db, 'fwp-900').sync_status = 'superseded';        // the sync rearranged it under a new FWP id
    const av = await call('Pete', { action: 'availability' });
    assert.equal(av.freed.length, 1); assert.equal(db.hq_fixture_slots.length, 0);
    assert.equal(db.hq_items.find((i) => i.id === opp.id).data.rebook_needed, true);
    assert.ok(!av.fixtures.some((f) => f.fixture_id === 'fwp-900'));
    const p = await call('Pete', { action: 'priorities' });
    assert.ok(p.mustDo.find((g) => g.key === 'approvals').items.some((i) => i.id === opp.id && /re-book/i.test(i.why)));
    // Re-book on the next real home fixture; the flag clears.
    assert.equal((await call('Pete', { action: 'book', opportunity_id: opp.id, fixture_id: 'fwp-902' })).ok, true);
    assert.equal(db.hq_items.find((i) => i.id === opp.id).data.rebook_needed, false);
    // A postponement does the same.
    fx(db, 'fwp-902').fixture_status = 'postponed';
    await call('Pete', { action: 'availability' });
    assert.equal(db.hq_fixture_slots.length, 0);
  } finally { restore(); }
});

test('SCENARIO 2 — an existing sponsor is serviced and renewed (not double-counted, not contacted after objecting)', async () => {
  const { db, restore, call } = fresh();
  try {
    const org = (await call('Pete', { action: 'saveOrg', name: 'Lane Builders Ltd', relationship: 'sponsor', legal_form: 'limited_company', contact_email: 'office@lanebuilders.co.uk', permission: 'existing_relationship' })).org;
    const opp = (await call('Pete', { action: 'create', kind: 'opportunity', title: 'Lane Builders — programme', org_id: org.id, owner: 'Pete', data: { package: 'programme', season: '2026/27' } })).item;
    db.hq_items.find((i) => i.id === opp.id).stage = 'proposal';
    assert.equal((await call('Pete', { action: 'move', id: opp.id, to: 'won', value: 250 })).ok, true);
    assert.equal(db.hq_items.filter((i) => i.parent_id === opp.id && i.kind === 'fulfilment').length, 12, 'season package uses the full checklist');
    assert.match((await call('Pete', { action: 'renew', id: db.hq_items.find((i) => i.kind === 'invoice').id })).error, /won deal/);
    const r = await call('Pete', { action: 'renew', id: opp.id, season: '2027/28' });
    assert.equal(r.ok, true); assert.equal(r.item.stage, 'responded'); assert.equal(r.item.data.renewal_of, opp.id);
    assert.equal((await call('Pete', { action: 'renew', id: opp.id })).duplicate, true);
    db.hq_items.find((i) => i.id === r.item.id).stage = 'proposal';
    assert.equal((await call('Pete', { action: 'move', id: r.item.id, to: 'won', value: 250 })).ok, true);
    const sc = await call('Pete', { action: 'scorecard' });
    assert.equal(sc.funding.find((x) => x.key === 'renewals').value, 1);
    assert.equal(sc.funding.find((x) => x.key === 'recurring').value, 25000);
    assert.equal(sc.funding.find((x) => x.key === 'collected').value, null, 'nothing paid yet → no cash claimed');
    // If they object, no renewal approach is possible.
    await call('Pete', { action: 'suppress', value: 'office@lanebuilders.co.uk', reason: 'asked not to be contacted (test)' });
    assert.match((await call('Pete', { action: 'renew', id: r.item.id })).error, /won deal|not to be contacted/);
  } finally { restore(); }
});

test('SCENARIO 5 — a volunteer offers help, the club approves the role, they are assigned, deliver and are recognised', async () => {
  const { db, restore, call } = fresh({ submissions: [{ id: 'v-1', type: 'volunteer', name: 'Alex Green', email: 'alex@example.org', payload: { role: 'Programme Seller', message: 'Free most Saturdays' }, created_at: new Date().toISOString() }] });
  try {
    const c = await call('Jenny', { action: 'collectVolunteerOffers' });
    assert.equal(c.collected, 1);
    assert.equal((await call('Jenny', { action: 'collectVolunteerOffers' })).collected, 0, 'running it twice collects nothing new');
    const offer = db.hq_items.find((i) => i.kind === 'volunteer_offer');
    let p = await call('Pete', { action: 'priorities' });
    assert.ok(p.mustDo.find((g) => g.key === 'approvals').items.some((i) => i.id === offer.id));

    // A role with money needs protections before approval.
    const role = (await call('Jenny', { action: 'create', kind: 'volunteer_role', title: 'Merchandise table — Thatcham', data: { what: 'Sell scarves', when: 'Sat 2pm–4pm', where: 'Clubhouse', commitment: '2 hours', coordinator: 'Jenny', sg_money: true } })).item;
    assert.match((await call('Pete', { action: 'move', id: role.id, to: 'approved' })).error, /protections/);
    await call('Jenny', { action: 'update', id: role.id, data: { checks: 'Two people count and sign for cash' } });
    assert.match((await call('Pete', { action: 'move', id: role.id, to: 'approved' })).error, /who confirmed/);
    assert.equal((await call('Pete', { action: 'move', id: role.id, to: 'approved', protections_confirmed_by: 'Pete' })).ok, true);

    // Offer → approved → assigned (needs the role + checks confirmed) → instructions task.
    assert.equal((await call('Pete', { action: 'move', id: offer.id, to: 'approved' })).ok, true);
    assert.match((await call('Pete', { action: 'move', id: offer.id, to: 'assigned' })).error, /approved role/);
    assert.match((await call('Pete', { action: 'move', id: offer.id, to: 'assigned', role_id: role.id })).error, /checks/);
    assert.equal((await call('Pete', { action: 'move', id: offer.id, to: 'assigned', role_id: role.id, checks_confirmed_by: 'Jenny' })).ok, true);
    const instr = db.hq_items.find((i) => i.kind === 'task' && /^Send instructions to Alex/.test(i.title));
    assert.ok(instr && /When: Sat 2pm–4pm/.test(instr.data.instructions));
    const ins = await call('Pete', { action: 'volunteerInstructions', id: offer.id });
    assert.match(ins.text, /Your contact on the day: Jenny/);

    assert.equal((await call('Pete', { action: 'move', id: offer.id, to: 'delivered', hours: 2 })).ok, true);
    assert.match((await call('Pete', { action: 'move', id: offer.id, to: 'recognised' })).error, /recognised/);
    assert.equal((await call('Pete', { action: 'move', id: offer.id, to: 'recognised', reason: 'Thanked in the programme' })).ok, true);
    const sc = await call('Pete', { action: 'scorecard' });
    assert.equal(sc.interest.find((x) => x.key === 'volunteers').value, 1);
    assert.equal(sc.interest.find((x) => x.key === 'volunteer_hours').value, 2);
  } finally { restore(); }
});

test('SCENARIO 6 — the chairman reviews the financial position (authorised users only, cash ≠ pledged ≠ in-kind)', async () => {
  const { restore, call } = fresh();
  try {
    const AUTH = require('../netlify/functions/lib/md-auth');
    const chair = AUTH.issue({ username: 'Pete', role: 'Chairman', isChairman: true, auth: 'custom' });
    const shared = AUTH.issue({ username: 'Committee', role: 'Committee', auth: 'shared' });
    const H = (t) => ({ authorization: 'Bearer ' + t });
    assert.equal((await call('Pete', { action: 'finance' })).restricted, true, 'committee password alone cannot see finances');
    assert.equal((await call('x', { action: 'finance' }, H(shared))).restricted, true, 'a shared login cannot either');
    assert.equal((await call('x', { action: 'saveFinanceLine', kind: 'cost', category: 'pitch_and_venue', label: 'Pitch', amount: 100, frequency: 'monthly', basis: 'budget' })).restricted, true);

    const empty = await call('x', { action: 'finance' }, H(chair));
    assert.equal(empty.model.empty, true, 'no figures → an honest empty model');
    const add = (b) => call('x', Object.assign({ action: 'saveFinanceLine' }, b), H(chair));
    assert.match((await add({ kind: 'cost', category: 'pitch_and_venue', label: 'Pitch hire', amount: 600, frequency: 'monthly', basis: 'actual' })).error, /where the figure comes from/);
    assert.equal((await add({ kind: 'cost', category: 'pitch_and_venue', label: 'Pitch hire', amount: 600, frequency: 'monthly', basis: 'actual', fixed: true, evidence: 'Agreement, Aug 2026' })).ok, true);
    assert.equal((await add({ kind: 'cost', category: 'officials_and_match', label: 'Match officials', amount: 100, frequency: 'per_home_match', basis: 'budget' })).ok, true);
    assert.equal((await add({ kind: 'income', category: 'gate', label: 'Gate receipts', amount: 150, frequency: 'per_home_match', basis: 'budget', receipt: 'cash', repeatable: true })).ok, true);
    assert.equal((await add({ kind: 'income', category: 'sponsorship', label: 'Promised season deal', amount: 1200, frequency: 'annual', basis: 'budget', receipt: 'pledged' })).ok, true);
    assert.equal((await add({ kind: 'income', category: 'other_income', label: 'Printing donated', amount: 300, frequency: 'annual', basis: 'estimate', receipt: 'in_kind' })).ok, true);
    const f = await call('x', { action: 'finance' }, H(chair));
    const m = f.model; const hpm = m.homeMatchesPerMonth;
    assert.equal(m.monthlyCostPence, 60000 + Math.round(10000 * hpm));
    assert.equal(m.monthlyCashIncomePence, Math.round(15000 * hpm), 'pledges and in-kind are not cash');
    assert.equal(m.pledgedMonthlyPence, 10000); assert.equal(m.inKindMonthlyPence, 2500);
    assert.equal(m.position, 'shortfall');
    assert.equal(m.sponsorshipNeededMonthlyPence, m.monthlyCostPence - m.monthlyCashIncomePence);
    assert.equal(m.fixedCostPence, 60000);
    assert.equal(m.includesEstimates, true);
    assert.match(f.signedAs, /Pete/);
    const sc = await call('x', { action: 'scorecard' }, H(chair));
    assert.equal(sc.funding.find((x) => x.key === 'gap').value, m.sponsorshipNeededMonthlyPence);
  } finally { restore(); }
});

test('SCENARIO 8 — a legitimate funding opportunity is assessed eligibility-first and appears as eligible funding', async () => {
  const { db, restore, call } = fresh();
  try {
    await call('Pete', { action: 'seed' });
    const fsif = db.hq_items.find((i) => /Stadia Improvement/.test(i.title));
    assert.equal(fsif.stage, 'eligibility_review');
    assert.equal(db.hq_items.find((i) => /Movement Fund/.test(i.title)).stage, 'ineligible', 'ineligible routes rejected early');
    assert.match((await call('Pete', { action: 'move', id: fsif.id, to: 'submitted' })).error, /cannot go/);
    db.hq_items.find((i) => i.id === fsif.id).data.eligibility_note = null;
    assert.match((await call('Pete', { action: 'move', id: fsif.id, to: 'eligible' })).error, /why it is eligible/);
    assert.equal((await call('Pete', { action: 'move', id: fsif.id, to: 'eligible', eligibility_note: 'NLS Step 5; no company-structure bar; ground-grading project; chairman may apply.' })).ok, true);
    const p = await call('Pete', { action: 'priorities' });
    assert.ok(p.money.find((g) => g.key === 'funding').items.some((i) => i.id === fsif.id));
    const sc = await call('Pete', { action: 'scorecard' });
    assert.equal(sc.funding.find((x) => x.key === 'grants').value, 1);
    assert.match((await call('Pete', { action: 'move', id: fsif.id, to: 'preparing' })).error, /owner/);
  } finally { restore(); }
});

test('SCENARIO 10 — the administrator clears important work from one priorities list, deduplicated', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const old = new Date(Date.now() - 4 * DAY).toISOString();
  const { db, restore, call } = fresh({
    attendance: [{ lane_no: '101', match_date: new Date(Date.parse(iso(-35))).toISOString().slice(0, 10), home: true }, { lane_no: '101', match_date: new Date(Date.parse(iso(-7))).toISOString().slice(0, 10), home: true }, { lane_no: '102', match_date: new Date(Date.parse(iso(-7))).toISOString().slice(0, 10), home: true }],
  });
  try {
    await call('Jenny', { action: 'create', kind: 'task', title: 'Pitch and facilities ready', due_date: today, source: 'fixture:fwp-900', data: { area: 'Matchday' } });
    const enq = (await call('Jenny', { action: 'create', kind: 'enquiry', title: 'Sponsorship enquiry — Old Lead' })).item;
    db.hq_items.find((i) => i.id === enq.id).created_at = old;   // waiting 4 days
    const p = await call('Jenny', { action: 'priorities' });
    const ids = [].concat(...p.mustDo.map((g) => g.items.map((i) => i.id)), ...p.money.map((g) => g.items.map((i) => i.id)));
    assert.equal(ids.length, new Set(ids).size, 'every item appears once');
    assert.ok(p.mustDo.find((g) => g.key === 'enquiries').items.some((i) => i.id === enq.id), 'late enquiry is a must-do, not just a lead');
    assert.ok(!(p.money.find((g) => g.key === 'enquiries') || { items: [] }).items.some((i) => i.id === enq.id));
    assert.ok(p.mustDo.find((g) => g.key === 'matchday').items.length === 1);
    assert.equal(p.supporters.nextFixture.opponent, 'Away Opponent'); assert.equal(p.supporters.nextHomeFixture.opponent, 'Thatcham Town');
    assert.equal(p.supporters.laneCard.lastHomeCheckins.checkins, 2);
    assert.equal(p.supporters.laneCard.lastHomeCheckins.firstTime, 1);
    // Three played home matches with no figure → a "record attendance" job each.
    assert.equal(p.mustDo.find((g) => g.key === 'deadlines').items.filter((i) => i.kind === 'attendance').length, 3);

    // Record (Jenny) → cannot self-verify → Pete confirms → counts as verified.
    assert.match((await call('Jenny', { action: 'recordAttendance', fixture_id: 'fwp-900', headcount: 40, method: 'manual headcount' })).error, /not been played/);
    const rec = await call('Jenny', { action: 'recordAttendance', fixture_id: 'fwp-800', headcount: 41, method: 'clicker count' });
    assert.equal(rec.ok, true);
    assert.match((await call('Jenny', { action: 'verifyAttendance', id: rec.record.id })).error, /other than/);
    assert.match((await call('Pete', { action: 'recordAttendance', fixture_id: 'fwp-800', headcount: 50, method: 'clicker count' })).error, /confirm it instead/);
    assert.equal((await call('Pete', { action: 'verifyAttendance', id: rec.record.id })).ok, true);
    const a = await call('Pete', { action: 'attendance' });
    assert.equal(a.progress.verifiedMatches, 1); assert.equal(a.progress.baselineReady, false);
    assert.equal(a.progress.kind, 'aspiration');
    assert.equal(a.checkins.matches[0].firstTime, 1); assert.equal(a.checkins.matches[0].returning, 1);
    const sc = await call('Pete', { action: 'scorecard' });
    assert.equal(sc.fans.find((x) => x.key === 'avg_attendance').value, 41);
    assert.ok(sc.rules.some((r) => /page views are never/i.test(r)));
  } finally { restore(); }
});

test('PROSPECT IMPORT — preview, validate, stage as research-only; nothing contacted; the same file stages once', async () => {
  const { db, restore, call } = fresh();
  try {
    await call('Pete', { action: 'saveOrg', name: 'Existing Garage Ltd' });
    const csv = 'Business,Website,Email,Town,Legal form\n' +
      'Rayners Lane Dental Ltd,raynerslanedental.example,info@raynerslanedental.example,Rayners Lane,Ltd\n' +
      'Pinner Window Cleaning,,pinnerwc@gmail.com,Pinner,sole trader\n' +
      'Existing Garage Ltd,,,Harrow,Ltd\n' +
      ',,,Harrow,\n' +
      'Rayners Lane Dental Ltd,,,Rayners Lane,\n' +
      'Bad Email Shop,,not-an-email,Ruislip,\n';
    assert.match((await call('Pete', { action: 'importStage', csv })).error, /where this list came from/);
    const pv = await call('Pete', { action: 'importPreview', csv, source: 'Local research list (test)' });
    assert.equal(pv.ok, true);
    assert.deepEqual(pv.rows.map((r) => r.status), ['warn', 'warn', 'duplicate', 'error', 'duplicate', 'error']);
    assert.ok(pv.rows[1].issues.some((i) => /Personal mailbox/.test(i)));
    assert.equal(db.hq_orgs.length, 1, 'preview writes nothing');
    const st = await call('Pete', { action: 'importStage', csv, source: 'Local research list (test)', filename: 'test.csv' });
    assert.equal(st.batch.rows_staged, 2); assert.equal(st.batch.rows_skipped, 4);
    const staged = db.hq_orgs.filter((o) => o.import_batch_id);
    assert.ok(staged.every((o) => o.permission === 'research_only' && o.relationship === 'prospect' && o.source_label && !o.email_checked_at));
    assert.equal(db.hq_items.length, 0, 'nothing contacted, no outreach created');
    assert.equal((await call('Pete', { action: 'importStage', csv, source: 'Local research list (test)' })).duplicate, true);

    // Drafting in the chairman's voice works; sending is still refused until the email is checked and a basis exists.
    const dental = staged.find((o) => /Dental/.test(o.name));
    await call('Pete', { action: 'saveOrg', id: dental.id, permission: 'corporate_lawful_basis', legal_form: 'limited_company' });
    const dr = await call('Pete', { action: 'draftOutreach', org_ids: [dental.id] });
    assert.equal(dr.drafts[0].sendable, false); assert.match(dr.drafts[0].why, /not re-checked/);
    const out = db.hq_items.find((i) => i.kind === 'outreach');
    assert.match(out.data.body, /Pete Singh/); assert.ok(!/desperate|struggl|surviv|board|hospitality|£/i.test(out.data.body));
    assert.match((await call('Pete', { action: 'move', id: out.id, to: 'approved' })).error, /other than/);
    await call('Jenny', { action: 'move', id: out.id, to: 'approved' });
    assert.match((await call('Jenny', { action: 'move', id: out.id, to: 'sent' })).error, /not re-checked/);
    assert.equal((await call('Jenny', { action: 'checkEmail', id: dental.id, note: 'On their website contact page' })).ok, true);
    assert.equal((await call('Jenny', { action: 'move', id: out.id, to: 'sent', channel: 'club mailbox' })).ok, true, 'a person sent it from the club mailbox; HQ only logs it');
    assert.match((await call('Pete', { action: 'draftOutreach', org_ids: Array(11).fill(dental.id) })).error, /at most 10/);
  } finally { restore(); }
});

test('PROPOSALS + FUTURE OF THE LANE — private records, decided by a named person, never launched', async () => {
  const { db, restore, call } = fresh();
  try {
    const s = await call('Pete', { action: 'seedRebirth' });
    assert.deepEqual([s.loaded.proposals, s.loaded.research], [2, 3]);
    assert.equal((await call('Pete', { action: 'seedRebirth' })).loaded.proposals, 0, 'safe to re-run');
    const club = db.hq_items.find((i) => /Lane Business Club/.test(i.title));
    assert.ok(!/launch/.test(Object.keys(require('../netlify/functions/lib/club-os').FLOW.proposal).join()), 'there is no launch stage');
    await call('Pete', { action: 'move', id: club.id, to: 'review' });
    assert.match((await call('Pete', { action: 'move', id: club.id, to: 'approved' })).error, /Record the decision/);
    assert.equal((await call('Pete', { action: 'move', id: club.id, to: 'approved', reason: 'Pursue informally; no fee; Jenny to run the directory' })).ok, true);
    const tiers = db.hq_items.find((i) => /seasonal local business packages/.test(i.title));
    assert.match(tiers.data.conditions, /INDICATIVE/); assert.match(tiers.data.benefits, /Never pitch-side boards/);
    const fa = db.hq_items.find((i) => i.kind === 'research' && /accreditation/.test(i.title));
    assert.equal(fa.data.source_url, 'https://www.thefa.com/get-involved/player/ground-grading');
    assert.equal(fa.data.external_contact, 'none — research only');
    // Volunteer role templates are drafts with no coordinator until the club fills them in.
    assert.ok(db.hq_items.filter((i) => i.kind === 'volunteer_role').every((r) => r.stage === 'draft' && !r.data.coordinator));
  } finally { restore(); }
});
