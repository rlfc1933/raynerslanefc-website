// Club OS rules — the behaviour real people will hit (see ADDENDUM scenarios).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const OS = require('../netlify/functions/lib/club-os');
const S = require('../netlify/functions/lib/club-os-seeds');

const item = (kind, stage, extra = {}) => Object.assign({ kind, stage, data: {} }, extra);

test('every kind has a first stage that its machine knows', () => {
  for (const k of OS.KINDS) assert.ok(OS.FLOW[k][OS.FIRST[k]], k);
});

test('STAGE MACHINES: no skipping the step that makes a record trustworthy', async (t) => {
  await t.test('invoice cannot jump draft → issued', () => assert.match(OS.guardTransition(item('invoice', 'draft', { value_pence: 100 }), 'issued', { actor: 'Pete' }), /cannot go/));
  await t.test('invoice needs an amount and a named approver', () => {
    assert.match(OS.guardTransition(item('invoice', 'draft'), 'approved', { actor: 'Pete' }), /amount/);
    assert.match(OS.guardTransition(item('invoice', 'draft', { value_pence: 5000 }), 'approved', {}), /named person/);
    assert.equal(OS.guardTransition(item('invoice', 'draft', { value_pence: 5000 }), 'approved', { actor: 'Pete' }), null);
  });
  await t.test('voiding needs a reason', () => assert.match(OS.guardTransition(item('invoice', 'issued', { value_pence: 1 }), 'void', { actor: 'x' }), /why/));
  await t.test('paid and void are terminal', () => { assert.deepEqual(OS.FLOW.invoice.paid, []); assert.deepEqual(OS.FLOW.invoice.void, []); });
  await t.test('outreach must be approved before it is sent', () => assert.match(OS.guardTransition(item('outreach', 'draft'), 'sent', { actor: 'A' }), /cannot go/));
  await t.test('the drafter cannot approve their own outreach', () =>
    assert.match(OS.guardTransition(item('outreach', 'draft', { data: { drafted_by: 'Sam' } }), 'approved', { actor: 'sam ' }), /other than/));
  await t.test('a different person can approve', () =>
    assert.equal(OS.guardTransition(item('outreach', 'draft', { data: { drafted_by: 'Sam' } }), 'approved', { actor: 'Pete' }), null));
  await t.test('a grant is only submitted with the funder’s reference', () => {
    assert.match(OS.guardTransition(item('grant', 'awaiting_approval', { owner: 'Pete' }), 'submitted', {}), /reference/);
    assert.equal(OS.guardTransition(item('grant', 'awaiting_approval', { owner: 'Pete' }), 'submitted', { reference: 'FSIF-123' }), null);
  });
  await t.test('eligibility must be justified in writing', () => assert.match(OS.guardTransition(item('grant', 'eligibility_review'), 'eligible', {}), /why/));
  await t.test('compliance complete needs evidence', () => assert.match(OS.guardTransition(item('compliance', 'in_progress', { owner: 'Sec' }), 'complete', {}), /evidence/));
  await t.test('opportunity won needs a value or in-kind flag, and an owner', () => {
    assert.match(OS.guardTransition(item('opportunity', 'proposal'), 'won', { value_pence: 100 }), /owner/);
    assert.match(OS.guardTransition(item('opportunity', 'proposal', { owner: 'Pete' }), 'won', {}), /value/);
    assert.equal(OS.guardTransition(item('opportunity', 'proposal', { owner: 'Pete', in_kind: true }), 'won', {}), null);
  });
  await t.test('comms: writer cannot approve own piece; scheduled needs a time', () => {
    assert.match(OS.guardTransition(item('comms', 'review', { data: { drafted_by: 'Media' } }), 'approved', { actor: 'Media' }), /other than/);
    assert.match(OS.guardTransition(item('comms', 'approved'), 'scheduled', {}), /date/);
  });
});

test('OUTREACH PERMISSION follows PECR: sole traders are not companies', async (t) => {
  const org = (o) => Object.assign({ contact_email: 'hello@biz.co.uk', permission: 'corporate_lawful_basis', legal_form: 'limited_company' }, o);
  await t.test('verified company + lawful basis → may send', () => assert.equal(OS.sendPermission(org()).ok, true));
  await t.test('"corporate" basis on a sole trader is refused', () => assert.equal(OS.sendPermission(org({ legal_form: 'sole_trader' })).ok, false));
  await t.test('unknown legal form is treated as an individual', () => assert.match(OS.sendPermission(org({ legal_form: 'unknown' })).why, /consent/));
  await t.test('research-only is never sendable', () => assert.equal(OS.sendPermission(org({ permission: 'research_only' })).ok, false));
  await t.test('suppressed address is refused even with consent', () =>
    assert.match(OS.sendPermission(org({ permission: 'express_consent' }), new Set(['hello@biz.co.uk'])).why, /suppression/));
  await t.test('a suppressed DOMAIN blocks every address at it', () =>
    assert.equal(OS.sendPermission(org({ permission: 'express_consent', contact_email: 'new@biz.co.uk' }), new Set(['@biz.co.uk'])).ok, false));
  await t.test('no email, no send', () => assert.equal(OS.sendPermission(org({ contact_email: '' })).ok, false));
});

test('PROSPECT SCORE is explainable and bounded', () => {
  const s = OS.scoreProspect({ proximity: 1, audience: 1, community: 1, packageFit: 1, activity: 1, contactable: 1, value: 1, known: 1 });
  assert.equal(s.score, 100);
  assert.equal(Object.values(s.breakdown).reduce((a, b) => a + b, 0), 100);
  assert.equal(OS.scoreProspect({ proximity: 5, known: 1 }).breakdown.proximity, 20, 'factors clamp to 0–1');
  assert.equal(OS.scoreProspect({ proximity: 1 }).band, 'Research incomplete', 'unknown facts never look like a hot lead');
  assert.equal(OS.scoreProspect({ known: 1, doNotContact: true, proximity: 1 }).band, 'Do not contact');
  assert.ok(OS.milesFromGround(51.5717, -0.3604) < 0.1);
  assert.equal(OS.proximityFactor(1), 1); assert.equal(OS.proximityFactor(20), 0);
});

test('INVENTORY: an exclusive right cannot be sold twice in a season', () => {
  const won = [{ title: 'Hanlon — home shirt', data: { package: 'home-shirt', season: '2026/27' } }];
  assert.match(OS.inventoryClash('home-shirt', '2026/27', won), /already sold/);
  assert.equal(OS.inventoryClash('home-shirt', '2027/28', won), null);
  assert.equal(OS.inventoryClash('programme', '2026/27', won), null, 'non-exclusive packages can be sold many times');
});

test('REWARDS: earned from verified visits, redeemable once', () => {
  const L = [{ key: 'home5', games: 5 }, { key: 'home10', games: 10 }];
  const r = OS.rewardStatus(6, L, ['home5']);
  assert.deepEqual(r.map((x) => [x.key, x.earned, x.redeemed, x.redeemable]), [['home5', true, true, false], ['home10', false, false, false]]);
});

test('INVOICE PAYMENTS: part payments, no overpayment, only on issued invoices', () => {
  const inv = { stage: 'issued', value_pence: 50000, paid_pence: 0 };
  assert.deepEqual(OS.applyPayment(inv, 20000), { paid_pence: 20000, stage: 'part_paid' });
  assert.deepEqual(OS.applyPayment({ ...inv, stage: 'part_paid', paid_pence: 20000 }, 30000), { paid_pence: 50000, stage: 'paid' });
  assert.match(OS.applyPayment({ ...inv, paid_pence: 40000 }, 20000).error, /more than the invoice/);
  assert.match(OS.applyPayment({ ...inv, stage: 'draft' }, 100).error, /issued/);
  assert.match(OS.applyPayment(inv, -5).error, /positive/);
});

test('DUPLICATES: same business by name, website or email is found', () => {
  const orgs = [{ id: 'a', name: "McCafferty's Bar", name_key: 'mccaffertysbar', website_host: 'mccaffertys.co.uk', contact_email: 'info@mccaffertys.co.uk' }];
  assert.equal(OS.findDuplicate({ name: 'McCaffertys bar' }, orgs).id, 'a');
  assert.equal(OS.findDuplicate({ name: 'Other', website: 'https://www.mccaffertys.co.uk/menu' }, orgs).id, 'a');
  assert.equal(OS.findDuplicate({ name: 'Other', contact_email: 'INFO@mccaffertys.co.uk' }, orgs).id, 'a');
  assert.equal(OS.findDuplicate({ name: 'Higginson Stairs' }, orgs), null);
});

test('COMMAND CENTRE: overdue, due today, unowned, 48h enquiries', () => {
  const today = new Date('2026-10-09T10:00:00Z');
  const items = [
    { kind: 'task', stage: 'open', due_date: '2026-10-01', owner: 'A', title: 'late' },
    { kind: 'compliance', stage: 'not_started', due_date: '2026-10-09', title: 'today, nobody owns it' },
    { kind: 'enquiry', stage: 'new', created_at: '2026-10-06T09:00:00Z', title: 'waiting 3 days' },
    { kind: 'task', stage: 'done', due_date: '2026-09-01', title: 'closed — ignored' },
    { kind: 'invoice', stage: 'issued', title: 'unpaid' },
  ];
  const a = OS.attention(items, today);
  assert.deepEqual(a.overdue.map((i) => i.title), ['late']);
  assert.deepEqual(a.today.map((i) => i.title), ['today, nobody owns it']);
  assert.ok(a.unowned.some((i) => i.title === 'today, nobody owns it'));
  assert.deepEqual(a.enquiriesOver48h.map((i) => i.title), ['waiting 3 days']);
  assert.equal(a.invoicesUnpaid.length, 1);
});

test('MONEY INPUT: pounds to pence, junk refused', () => {
  assert.equal(OS.poundsToPence('£1,250.50'), 125050);
  assert.equal(OS.poundsToPence(''), null);
  assert.ok(Number.isNaN(OS.poundsToPence('lots')));
});

test('SEEDS never invent: every grant has a source URL and checked date; compliance has no guessed due dates', () => {
  for (const g of S.GRANTS) { assert.match(g.url, /^https:\/\//, g.key); assert.ok(g.note.length > 20); }
  for (const c of S.COMPLIANCE) assert.equal(c.due, undefined, 'compliance seeds must not carry a due date');
  const orgs = S.sponsorOrgs({ sponsors: [{ name: 'Acerbis', url: 'https://acerbis.com' }, { name: 'Your Brand Here' }] });
  assert.deepEqual(orgs.map((o) => o.name), ['Acerbis'], 'the "your brand here" placeholder is not a sponsor');
  assert.equal(orgs[0].value_pence, undefined, 'no invented contract values');
});

test('club-os function: refuses without the committee password, and unsigned writes', async () => {
  const fn = require('../netlify/functions/club-os');
  const call = (body) => fn.handler({ httpMethod: 'POST', body: JSON.stringify(body) });
  assert.equal((await call({ pin: 'nope', action: 'summary' })).statusCode, 401);
  const r = JSON.parse((await call({ pin: '1933', action: 'create', kind: 'task', title: 'x' })).body);
  assert.equal(r.ok, false); assert.match(r.error, /who you are/);
  const u = JSON.parse((await call({ pin: '1933', action: 'wat' })).body);
  assert.match(u.error, /Unknown action/);
});

test('migration: Club OS tables are private (RLS on, no anon/authenticated access)', () => {
  const sql = require('fs').readFileSync(require('path').join(__dirname, '..', 'supabase', 'migrations', '20261009120000_club_os.sql'), 'utf8');
  for (const t of ['hq_orgs', 'hq_suppression', 'hq_items', 'hq_redemptions', 'hq_audit']) {
    assert.match(sql, new RegExp(`alter table ${t}\\s+enable row level security`), t);
  }
  assert.match(sql, /revoke all on hq_orgs, hq_suppression, hq_items, hq_redemptions, hq_audit from anon, authenticated/);
  assert.match(sql, /unique \(lane_no, reward_key, season\)/, 'one redemption per reward per season');
  assert.match(sql, /idempotency_key text unique/);
  assert.match(sql, /hq_audit is append-only/);
});
