// Back the Lane / Run the Lane — the pure rules (lib/rebirth/*).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const IMP = require('../netlify/functions/lib/rebirth/prospect-import');
const SJ = require('../netlify/functions/lib/rebirth/sponsor-journey');
const ATT = require('../netlify/functions/lib/rebirth/attendance');
const VOL = require('../netlify/functions/lib/rebirth/volunteers');
const FIN = require('../netlify/functions/lib/rebirth/finance');
const SC = require('../netlify/functions/lib/rebirth/scorecard');
const OS = require('../netlify/functions/lib/club-os');

test('CSV: quotes, embedded commas and newlines, CRLF and BOM', () => {
  const g = IMP.parseCsv('﻿Name,Notes\r\n"Smith, Jones & Co","line one\nline two"\r\n"Say ""hi""",x\r\n\r\n');
  assert.deepEqual(g, [['Name', 'Notes'], ['Smith, Jones & Co', 'line one\nline two'], ['Say "hi"', 'x']]);
});
test('IMPORT: header synonyms, legal forms, priority areas; nothing contactable', () => {
  assert.deepEqual(Object.keys(IMP.mapHeaders(['Business Name', 'E-mail', 'Area', 'Company No']).map).sort(), ['companies_house_no', 'contact_email', 'name', 'town']);
  assert.equal(IMP.normLegalForm('XYZ Ltd'), 'limited_company'); assert.equal(IMP.normLegalForm('Sole Trader'), 'sole_trader'); assert.equal(IMP.normLegalForm(''), 'unknown');
  assert.equal(IMP.priorityArea('South Harrow'), 'South Harrow'); assert.equal(IMP.priorityArea('Croydon'), null);
  assert.match(IMP.preview('Website\nx.com').error, /business name/);
  const big = 'Name\n' + Array.from({ length: IMP.MAX_ROWS + 1 }, (_, i) => 'B' + i).join('\n');
  assert.match(IMP.preview(big, [], { source: 's' }).error, /limit/);
  const o = IMP.stagedOrg({ name: 'A', permission: 'express_consent', priority_area: 'Pinner' }, 'batch', 'Pete');
  assert.equal(o.permission, 'research_only', 'an imported "consent" column is never trusted');
  assert.equal(o.email_checked_at, null);
});
test('PECR: an imported address is unusable until re-checked', () => {
  const org = { contact_email: 'a@b.co.uk', permission: 'corporate_lawful_basis', legal_form: 'limited_company', import_batch_id: 'x' };
  assert.match(OS.sendPermission(org).why, /re-checked/);
  assert.equal(OS.sendPermission(Object.assign({}, org, { email_checked_at: '2026-10-09' })).ok, true);
});
test('INVENTORY: rights the club does not own are not for sale', () => {
  assert.match(OS.inventoryClash('board', '2026/27', []), /cannot sell/);
  assert.match(OS.inventoryClash('hospitality', '2026/27', []), /cannot sell/);
  assert.match(SJ.wonGuard({ data: { package: 'board' } }), /not the club’s/);
});
test('FIXTURE SLOTS: home, scheduled, future, not superseded', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  const f = { id: 'a', isHome: true, status: 'scheduled', kickoffAt: '2026-10-31T15:00:00Z', syncStatus: 'idle' };
  assert.equal(SJ.slotEligible(f, now).ok, true);
  assert.match(SJ.slotEligible({ ...f, isHome: false }, now).why, /Away/);
  assert.match(SJ.slotEligible({ ...f, syncStatus: 'superseded' }, now).why, /rearranged/);
  assert.match(SJ.slotEligible({ ...f, status: 'postponed' }, now).why, /postponed/);
  assert.match(SJ.slotEligible({ ...f, kickoffAt: '2026-10-01T15:00:00Z' }, now).why, /kicked off/);
  const grid = SJ.availability([f, { ...f, id: 'b', status: 'postponed' }, { ...f, id: 'c', status: 'played', kickoffAt: '2026-10-01T15:00:00Z' }],
    [{ fixture_id: 'a', slot: 'matchball', opportunity_id: 'o1' }, { fixture_id: 'b', slot: 'matchday', opportunity_id: 'o2' }, { fixture_id: 'c', slot: 'matchday', opportunity_id: 'o3' }], now);
  assert.deepEqual(grid.fixtures.map((x) => [x.fixture_id, x.slots.matchball.free, x.slots.matchday.free]), [['a', false, true]]);
  assert.deepEqual(grid.stranded.map((s) => s.opportunity_id), ['o2'], 'a played fixture was delivered, not stranded');
  assert.equal(SJ.londonDate('2026-10-31T23:30:00Z'), '2026-10-31'); assert.equal(SJ.londonDate('2026-07-31T23:30:00Z'), '2026-08-01', 'BST');
  assert.equal(SJ.renewalDate({ data: {} }, { kickoffAt: '2026-10-31T15:00:00Z' }), '2026-11-07');
});
test('OUTREACH DRAFT: chairman’s voice, nothing needy, no prices, no rights the club lacks', () => {
  const d = SJ.draftIntro({ name: 'Pinner Dental Ltd', contact_name: 'Asha Patel', town: 'Pinner' });
  assert.equal(d.clean, true); assert.match(d.body, /^Dear Asha,/); assert.match(d.body, /since 1933/); assert.match(d.body, /Pete Singh/);
  assert.ok(!/£/.test(d.body)); assert.ok(SJ.NEVER_SAY.test('we are desperate')); assert.ok(SJ.NEVER_SAY.test('pitch-side board'));
});
test('ATTENDANCE: second-person verification, aspirations not forecasts, card check-ins labelled', () => {
  assert.match(ATT.verifyGuard({ recorded_by: 'Jenny' }, ' jenny '), /other than/);
  assert.equal(ATT.verifyGuard({ recorded_by: 'Jenny' }, 'Pete'), null);
  assert.match(ATT.recordGuard({ isHome: true, status: 'scheduled', kickoffAt: '2099-01-01T15:00:00Z' }, 30), /not been played/);
  assert.match(ATT.recordGuard({ isHome: true, status: 'played', kickoffAt: '2026-01-01T15:00:00Z' }, 3.5), /whole number/);
  const figs = ATT.verifiedFigures(
    [{ match_date: '2026-09-05', headcount: 31, method: 'clicker count', recorded_by: 'J', verified_by: 'P' }, { match_date: '2026-09-19', headcount: 44, method: 'clicker count', recorded_by: 'J' }],
    [{ status: 'locked', attendance_official: 36, fixture_snapshot: { date: '2026-08-22', isHome: true } }, { status: 'awaiting_reconciliation', attendance_official: 99, fixture_snapshot: { date: '2026-08-29' } }]);
  assert.deepEqual(figs.map((f) => [f.date, f.verified]), [['2026-09-19', false], ['2026-09-05', true], ['2026-08-22', true]]);
  const p = ATT.progress(figs);
  assert.equal(p.verifiedMatches, 2); assert.equal(p.baselineReady, false); assert.equal(p.recentAverage, 34); assert.equal(p.nextMilestone, 40); assert.equal(p.kind, 'aspiration');
  const p2 = ATT.progress([30, 36, 42, 45].map((h, i) => ({ date: '2026-09-0' + (i + 1), headcount: h, verified: true })));
  assert.equal(p2.baseline, 36); assert.deepEqual(p2.milestones.map((m) => m.reached), [false, false, false, false]);
  const c = ATT.checkins([{ lane_no: '1', match_date: '2026-09-05' }, { lane_no: '1', match_date: '2026-09-19' }, { lane_no: '2', match_date: '2026-09-19' }, { lane_no: '3', match_date: '2026-09-19', home: false }]);
  assert.deepEqual(c.matches[0], { date: '2026-09-19', checkins: 2, firstTime: 1, returning: 1 });
  assert.equal(c.repeatVisitRate, 50); assert.match(c.note, /subset/);
});
test('VOLUNTEERS: roles need what/when/where/commitment/coordinator; children need named sign-off', () => {
  const role = { stage: 'draft', data: { what: 'a', when: 'b', where: 'c', commitment: 'd' } };
  assert.match(VOL.roleGuard(role, 'approved', { actor: 'P' }), /who coordinates/);
  role.data.coordinator = 'J'; role.data.sg_children = true;
  assert.match(VOL.roleGuard(role, 'approved', { actor: 'P' }), /protections/);
  role.data.checks = 'DBS + Welfare Officer';
  assert.match(VOL.roleGuard(role, 'approved', { actor: 'P' }), /Welfare Officer/);
  assert.equal(VOL.roleGuard(role, 'approved', { actor: 'P', protections_confirmed_by: 'Welfare Officer (K)' }), null);
  assert.match(VOL.offerGuard({ data: {} }, 'assigned', {}, { stage: 'draft', data: {} }), /not been approved/);
  assert.match(VOL.offerGuard({ data: {} }, 'assigned', {}, Object.assign({}, role, { stage: 'open' })), /checks/);
  assert.equal(VOL.offerGuard({ data: {} }, 'assigned', { checks_confirmed_by: 'K' }, Object.assign({}, role, { stage: 'open' })), null);
  assert.ok(VOL.ROLE_TEMPLATES.every((t) => !t.coordinator && !t.when), 'templates never invent a coordinator or date');
});
test('FINANCE: cash, pledged and in-kind never mixed; empty means empty', () => {
  assert.equal(FIN.model([]).empty, true);
  assert.match(FIN.validateLine({ kind: 'income', category: 'gate', label: 'Gate', amount_pence: 100, frequency: 'monthly', basis: 'budget' }), /cash received, pledged/);
  assert.match(FIN.validateLine({ kind: 'cash_balance', category: 'bank', label: 'Bank', amount_pence: 100, basis: 'actual' }), /comes from/);
  const m = FIN.model([
    { kind: 'cost', category: 'pitch_and_venue', amount_pence: 50000, frequency: 'monthly', basis: 'actual', fixed: true },
    { kind: 'cost', category: 'officials_and_match', amount_pence: 12000, frequency: 'per_home_match', basis: 'budget' },
    { kind: 'cost', category: 'insurance', amount_pence: 120000, frequency: 'annual', basis: 'actual', fixed: true },
    { kind: 'income', category: 'gate', amount_pence: 20000, frequency: 'per_home_match', basis: 'budget', receipt: 'cash', repeatable: true },
    { kind: 'income', category: 'sponsorship', amount_pence: 60000, frequency: 'annual', basis: 'budget', receipt: 'pledged' },
    { kind: 'income', category: 'other_income', amount_pence: 24000, frequency: 'annual', basis: 'estimate', receipt: 'in_kind' },
    { kind: 'cash_balance', category: 'bank', amount_pence: 80000, basis: 'actual', as_of: '2026-10-01' },
    { kind: 'cost', category: 'kit_and_equipment', amount_pence: 30000, frequency: 'one_off', basis: 'budget', as_of: '2026-11-01' },
  ], { homeMatchesPerMonth: 2, today: '2026-10-09' });
  assert.equal(m.monthlyCostPence, 50000 + 24000 + 10000);
  assert.equal(m.monthlyCashIncomePence, 40000);
  assert.equal(m.monthlySurplusPence, -44000); assert.equal(m.position, 'shortfall');
  assert.equal(m.sponsorshipNeededMonthlyPence, 44000); assert.equal(m.sponsorshipNeededAnnualPence, 528000);
  assert.equal(m.pledgedMonthlyPence, 5000); assert.equal(m.inKindMonthlyPence, 2000);
  assert.equal(m.surplusIfPledgesPaidPence, -39000);
  assert.equal(m.fixedCostPence, 60000); assert.equal(m.repeatableSharePct, 100);
  assert.equal(m.cashAvailablePence, 80000);
  assert.equal(m.next90.costPence, 84000 * 3 + 30000, 'a one-off inside 90 days counts once');
  assert.equal(m.includesEstimates, true);
});
test('SCORECARD: prospects are not sponsors, pledges are not cash, empty metrics say how to fill them', () => {
  const s = SC.scorecard({ items: [{ id: 'i', kind: 'invoice', stage: 'issued', value_pence: 10000, paid_pence: 0, data: {} }], orgs: [{ relationship: 'prospect' }, { relationship: 'prospect' }] }, new Date('2026-10-09T12:00:00Z'));
  const f = (k) => s.funding.find((x) => x.key === k);
  assert.equal(f('collected').value, null); assert.ok(f('collected').how);
  assert.equal(f('owed').value, 10000); assert.equal(f('paying').value, null);
  assert.equal(s.interest.find((x) => x.key === 'prospects').value, 2);
  assert.equal(s.fans.find((x) => x.key === 'avg_attendance').value, null);
  assert.equal(s.fans.find((x) => x.key === 'campaign_attendance').value, null);
});
test('PRIORITIES: grouped, deduplicated, must-do wins', () => {
  const now = new Date('2026-10-09T12:00:00Z');
  const p = SC.priorities({ items: [
    { id: '1', kind: 'enquiry', stage: 'new', title: 'old', created_at: '2026-10-01T00:00:00Z' },
    { id: '2', kind: 'enquiry', stage: 'new', title: 'new', created_at: '2026-10-09T08:00:00Z' },
    { id: '3', kind: 'grant', stage: 'eligible', title: 'fund', due_date: '2026-10-12' },
    { id: '4', kind: 'invoice', stage: 'issued', title: 'inv', value_pence: 5000, paid_pence: 0 },
    { id: '5', kind: 'task', stage: 'open', title: 'Renewal conversation — X', due_date: '2026-10-20' },
  ] }, now);
  const all = [].concat(...p.mustDo.map((g) => g.items), ...p.money.map((g) => g.items)).map((i) => i.id);
  assert.equal(all.length, new Set(all).size);
  assert.deepEqual(p.mustDo.map((g) => g.key), ['enquiries', 'deadlines']);
  assert.deepEqual(p.money.map((g) => [g.key, g.items.map((i) => i.id)]), [['enquiries', ['2']], ['invoices', ['4']], ['renewals', ['5']]]);
});
test('MIGRATION: new tables private; slots cannot be double-sold; verification needs a second person', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261009140000_rebirth_hq.sql'), 'utf8');
  for (const t of ['hq_import_batches', 'hq_fixture_slots', 'hq_attendance', 'hq_finance_lines']) assert.match(sql, new RegExp(`alter table ${t}\\s+enable row level security`), t);
  assert.match(sql, /revoke all on hq_import_batches, hq_fixture_slots, hq_attendance, hq_finance_lines from anon, authenticated/);
  assert.match(sql, /unique \(fixture_id, slot\)/);
  assert.match(sql, /hq_attendance_second_person/);
  assert.match(sql, /drop constraint if exists hq_items_stage_ck/);
  for (const k of ['volunteer_role', 'volunteer_offer', 'proposal', 'research']) {
    for (const st of Object.keys(OS.FLOW[k])) assert.ok(sql.includes(`'${st}'`), `${k}:${st} allowed by the database`);
  }
});
test('CONFIDENTIALITY: no needy or relaunch language anywhere in the new modules', () => {
  const dir = path.join(__dirname, '..', 'netlify', 'functions', 'lib', 'rebirth');
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/const NEVER_SAY = .*\n/, '');
    assert.ok(!/\b(desperate|struggling|needs saving|relaunch(ed)?|new ownership|dysfunctional)\b/i.test(src), f);
  }
});
