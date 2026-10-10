// STAFF HQ — BACK THE LANE / RUN THE LANE journeys through the real browser
// UI against the REAL club-os function and an in-memory database (fixture
// registry included). Nothing is emailed, nothing touches production.
// Also captures review screenshots of the new panels (quality/.results/rebirth).
'use strict';
process.env.SUPABASE_URL = 'https://fake-supabase.local';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.NODE_ENV = 'test';
process.env.MD_ALLOW_DEV_SECRET = '1';
process.env.FWP_SEASON = '2026-2027';

const path = require('path');
const { test, expect } = require('@playwright/test');
const { makeDb, install } = require('./support/fake-supabase');
const { open } = require('./_helpers');

const HQ_PROJECTS = process.env.REBIRTH_ALL_PROJECTS ? ['desktop-1440', 'laptop-1280', 'tablet-portrait', 'phone', 'phone-small', 'fold-folded'] : ['desktop-1440', 'phone'];
const SHOTS = process.env.REBIRTH_SHOTS || path.join(__dirname, '..', '.results', 'rebirth');
const DAY = 864e5;
const iso = (days) => { const d = new Date(Date.now() + days * DAY); d.setUTCHours(14, 0, 0, 0); return d.toISOString(); };
const ymd = (days) => iso(days).slice(0, 10);
let db, restore;

function seed() {
  return {
    football_teams: [{ id: 1, canonical_name: 'Rayners Lane' }, { id: 2, canonical_name: 'Thatcham Town' }, { id: 3, canonical_name: 'Away Opponent' }, { id: 4, canonical_name: 'Later Visitors' }, { id: 5, canonical_name: 'Earlier Visitors' }],
    football_competitions: [],
    football_fixtures: [
      { internal_fixture_id: 'fwp-900', season: '2026-2027', home_team_id: 1, away_team_id: 2, is_home_fixture: true, fixture_status: 'scheduled', scheduled_kickoff_at: iso(10), first_team: true },
      { internal_fixture_id: 'fwp-901', season: '2026-2027', home_team_id: 3, away_team_id: 1, is_home_fixture: false, fixture_status: 'scheduled', scheduled_kickoff_at: iso(5), first_team: true },
      { internal_fixture_id: 'fwp-902', season: '2026-2027', home_team_id: 1, away_team_id: 4, is_home_fixture: true, fixture_status: 'scheduled', scheduled_kickoff_at: iso(24), first_team: true },
      { internal_fixture_id: 'fwp-800', season: '2026-2027', home_team_id: 1, away_team_id: 5, is_home_fixture: true, fixture_status: 'played', scheduled_kickoff_at: iso(-7), first_team: true },
    ],
    attendance: [{ lane_no: '101', match_date: ymd(-7), home: true }, { lane_no: '102', match_date: ymd(-7), home: true }],
  };
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!HQ_PROJECTS.includes(testInfo.project.name), 'HQ journeys run on desktop and phone');
  db = makeDb(seed());
  restore = install(db);
  for (const k of Object.keys(require.cache)) if (/netlify[\\/]functions/.test(k)) delete require.cache[k];
  const fn = require('../../netlify/functions/club-os');
  await page.route('**/.netlify/functions/admin-pin', (r) => r.fulfill({ json: { ok: JSON.parse(r.request().postData() || '{}').pin === '1933' } }));
  await page.route('**/.netlify/functions/club-os', async (route) => {
    const res = await fn.handler({ httpMethod: 'POST', body: route.request().postData(), headers: route.request().headers() });
    await route.fulfill({ status: res.statusCode, headers: res.headers, body: res.body });
  });
  page.on('dialog', (d) => d.type() === 'prompt' ? d.accept(page.__answers && page.__answers.length ? page.__answers.shift() : 'Test') : d.accept());
});
test.afterEach(() => { if (restore) restore(); });

async function signIn(page, who = 'Pete (test)') {
  await open(page, '/admin.html');
  for (const d of '1933') await page.locator('.pin-btn', { hasText: new RegExp(`^${d}$`) }).click();
  await expect(page.locator('#app')).toBeVisible();
  await page.evaluate((w) => { try { localStorage.setItem('rlfc_actor', w); } catch (e) {} }, who);
}
const openPanel = (page, id) => page.evaluate((x) => window.openPanel(x), id);
const asActor = (page, who) => page.evaluate((w) => localStorage.setItem('rlfc_actor', w), who);
const shot = (page, name, info) => page.screenshot({ path: path.join(SHOTS, `${info.project.name}-${name}.png`), fullPage: true });

test('Today — the three questions, grouped, each line opening its record', async ({ page }, info) => {
  const fn = require('../../netlify/functions/club-os');
  await fn.intakeEnquiry({ id: 's1', name: 'Sam', email: 'sam@harrowbakery.co.uk', fields: { company: 'Harrow Bakery Ltd' } });
  await signIn(page);
  await openPanel(page, 'priorities');
  const panel = page.locator('[data-cos="priorities"]');
  await expect(panel.getByRole('heading', { name: /What needs doing/ })).toBeVisible();
  await expect(panel.getByRole('heading', { name: /Where money can come in/ })).toBeVisible();
  await expect(panel.getByText('Thatcham Town', { exact: true })).toBeVisible();
  await expect(panel.getByText(/Record attendance — Earlier Visitors/)).toBeVisible();
  await expect(panel.getByText(/2 first-time/)).toBeVisible();
  await shot(page, 'today', info);
  await panel.getByRole('button', { name: /Sponsorship enquiry — Harrow Bakery/ }).click();
  await expect(page.locator('#cos-drawer').getByRole('button', { name: 'Turn into a deal' })).toBeVisible();
});

test('Sponsor journey in the UI — enquiry → deal → approve £100 matchday → book Thatcham → won → invoice draft', async ({ page }, info) => {
  const fn = require('../../netlify/functions/club-os');
  await fn.intakeEnquiry({ id: 's2', name: 'Sam', email: 'sam@harrowbakery.co.uk', fields: { company: 'Harrow Bakery Ltd' } });
  await signIn(page);
  await openPanel(page, 'commercial');
  const dl = page.locator('#cos-drawer');
  await page.getByRole('button', { name: /Sponsorship enquiry — Harrow Bakery/ }).click();
  await dl.getByRole('button', { name: 'Turn into a deal' }).click();
  await dl.getByLabel('Package (if they asked for one)').selectOption('match');
  await dl.getByRole('button', { name: 'Create the deal' }).click();
  await expect(dl.getByRole('heading', { name: 'Harrow Bakery Ltd — sponsorship' })).toBeVisible();
  await dl.getByRole('button', { name: 'Approve package' }).click();
  await expect(dl.getByLabel('Agreed price (£)')).toBeVisible();
  await dl.getByLabel('Agreed price (£)').fill('100');
  await dl.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(dl.getByText(/Package approved by Pete \(test\)/)).toBeVisible();
  await dl.getByRole('button', { name: 'Book a home fixture' }).click();
  const sel = dl.getByLabel(/Home fixtures with the matchday slot free/);
  await expect(sel.locator('option')).toHaveCount(2);           // away game not offered
  await dl.getByRole('button', { name: 'Book it' }).click();
  await expect(dl.getByText(/booked: Thatcham Town/)).toBeVisible();
  await dl.getByRole('button', { name: 'Proposal', exact: true }).click();
  await expect(dl.locator('.cos-stage').first()).toHaveText('Proposal');
  await dl.getByRole('button', { name: 'Won', exact: true }).click();
  await expect(dl.getByText(/Booking confirmed to the sponsor/)).toBeVisible();
  expect(db.hq_items.find((i) => i.kind === 'invoice').value_pence).toBe(10000);
  expect(db.hq_fixture_slots).toHaveLength(1);
  await shot(page, 'deal', info);
  await page.keyboard.press('Escape');
  await openPanel(page, 'bookings');
  await expect(page.locator('[data-cos="bookings"]').getByRole('button', { name: /Harrow Bakery/ })).toBeVisible();
  await shot(page, 'slots', info);
});

test('Prospect import — preview flags problems, staging creates research-only prospects and contacts nobody', async ({ page }, info) => {
  await signIn(page);
  await openPanel(page, 'prospects');
  const p = page.locator('[data-cos="prospects"]');
  await expect(p.getByText(/about 107 local businesses is not in HQ yet/)).toBeVisible();
  await p.getByLabel('Or paste the rows (first line = headings)').fill('Name,Email,Town,Legal form\nRayners Lane Dental Ltd,info@rldental.example,Rayners Lane,Ltd\nPinner Window Cleaning,pinnerwc@gmail.com,Pinner,sole trader\n,,Harrow,');
  await p.getByRole('button', { name: 'Preview' }).click();
  await expect(p.locator('.cos-err')).toContainText('where this list came from');
  await p.getByLabel('Where this list came from (required)').fill('Local research (test)');
  await p.getByRole('button', { name: 'Preview' }).click();
  await expect(p.getByText(/Personal mailbox/)).toBeVisible();
  await shot(page, 'import-preview', info);
  expect(db.hq_orgs).toHaveLength(0);
  await p.getByRole('button', { name: 'Stage 2 as prospects' }).click();
  await expect(p.getByText('2 prospects staged.')).toBeVisible();
  expect(db.hq_orgs.every((o) => o.permission === 'research_only')).toBe(true);
  expect(db.hq_items).toHaveLength(0);
});

test('Attendance — one person counts, another confirms; milestones are aspirations', async ({ page }, info) => {
  await signIn(page, 'Jenny (test)');
  await openPanel(page, 'attendance');
  const a = page.locator('[data-cos="attendance"]');
  await expect(a.getByText(/aspirations, not predictions/)).toBeVisible();
  await a.getByLabel('People counted').fill('38');
  await a.getByRole('button', { name: 'Record' }).click();
  await expect(a.getByText(/counted by Jenny \(test\)/)).toBeVisible();
  await a.getByRole('button', { name: 'Confirm' }).click();
  expect(db.hq_attendance[0].verified_by).toBeFalsy();
  await asActor(page, 'Pete (test)');
  await a.getByRole('button', { name: 'Confirm' }).click();
  await expect(a.locator('.cos-stat__v').first()).toHaveText('38');
  await shot(page, 'attendance', info);
});

test('Club finances — refused on the committee password; a finance sign-in sees an honest model', async ({ page }, info) => {
  await signIn(page);
  await openPanel(page, 'finance');
  const f = page.locator('[data-cos="finance"]');
  await expect(f.getByText(/personal staff sign-in/)).toBeVisible();
  const AUTH = require('../../netlify/functions/lib/md-auth');
  const tok = AUTH.issue({ username: 'Pete', role: 'Chairman', isChairman: true, auth: 'custom' });
  await page.evaluate((t) => sessionStorage.setItem('rlfc_md_token', t), tok);
  await openPanel(page, 'finance');
  await expect(f.getByText('No figures entered yet.')).toBeVisible();
  await f.getByLabel('Description').fill('Pitch hire');
  await f.getByLabel('Amount (£)').fill('600');
  await f.getByLabel('Basis').selectOption('actual');
  await f.getByRole('button', { name: 'Add line' }).click();
  await expect(f.locator('.cos-err')).toContainText('where the figure comes from');
  await f.getByLabel('Where the figure comes from').fill('Agreement, Aug 2026');
  await f.getByRole('button', { name: 'Add line' }).click();
  await expect(f.getByText('Costs per month', { exact: true })).toBeVisible();
  await expect(f.getByText(/Monthly shortfall/)).toBeVisible();
  expect(db.hq_finance_lines[0].entered_by).toMatch(/Pete/);
  await shot(page, 'finance', info);
});

test('Volunteers + scorecard — offer collected, assigned to an approved role; scorecard shows blanks honestly', async ({ page }, info) => {
  db.submissions.push({ id: 'v1', type: 'volunteer', name: 'Alex Green', email: 'alex@example.org', payload: { role: 'Programme Seller' }, created_at: new Date().toISOString() });
  await signIn(page);
  await openPanel(page, 'volunteers');
  const v = page.locator('[data-cos="volunteers"]');
  await v.getByRole('button', { name: 'Collect offers from the website' }).click();
  await expect(v.getByRole('button', { name: /Offer — Alex Green/ })).toBeVisible();
  const fn = require('../../netlify/functions/club-os');
  const call = async (actor, b) => JSON.parse((await fn.handler({ httpMethod: 'POST', body: JSON.stringify(Object.assign({ pin: '1933', actor }, b)) })).body);
  const role = (await call('Jenny', { action: 'create', kind: 'volunteer_role', title: 'Programme table — Thatcham', data: { what: 'Hand out programmes', when: 'Sat 2pm', where: 'Gate', commitment: '2 hours', coordinator: 'Jenny' } })).item;
  await call('Pete', { action: 'move', id: role.id, to: 'approved' });
  await v.getByRole('button', { name: /Offer — Alex Green/ }).click();
  const dl = page.locator('#cos-drawer');
  await dl.getByRole('button', { name: 'Approved', exact: true }).click();
  await expect(dl.locator('.cos-stage').first()).toHaveText('Approved');
  await dl.getByRole('button', { name: 'Assigned', exact: true }).click();
  await dl.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(dl.getByText(/Send instructions to Alex Green/)).toBeVisible();
  await dl.getByRole('button', { name: 'Instructions for the volunteer' }).click();
  await expect(dl.locator('.cos-pre')).toContainText('Your contact on the day: Jenny');
  await shot(page, 'volunteer', info);
  await page.keyboard.press('Escape');
  await openPanel(page, 'scorecard');
  const s = page.locator('[data-cos="scorecard"]');
  await expect(s.getByRole('heading', { name: 'Funding' })).toBeVisible();
  await expect(s.getByText('Not recorded').first()).toBeVisible();
  await expect(s.getByText(/page views are never reported as attendance/i)).toBeVisible();
  await shot(page, 'scorecard', info);
});
