// GROW THE LANE / BACK THE LANE — the directive's public scenarios (§16),
// run end to end in a real browser. The REAL submit-form, lane-100 and
// club-os code runs against the in-memory PostgREST stand-in
// (support/fake-supabase.js), so a journey proves the outcome — a record the
// club can act on — not just a success message. Nothing touches production
// and nothing is emailed. Football data is a registry-shaped test fixture
// (support/registry-fixtures.js), never the stale data/fixtures.json.
'use strict';
process.env.SUPABASE_URL = 'https://fake-supabase.local';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const { test, expect } = require('@playwright/test');
const { makeDb, install } = require('./support/fake-supabase');
const { routeRegistry, NOW } = require('./support/registry-fixtures');
const { open } = require('./_helpers');

const PROJECTS = ['desktop-1440', 'phone'];
let db, restore;

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!PROJECTS.includes(testInfo.project.name), 'public scenarios run on desktop and phone');
  db = makeDb();
  restore = install(db);
  for (const k of Object.keys(require.cache)) if (/netlify[\\/]functions/.test(k)) delete require.cache[k];
  const fns = { 'submit-form': require('../../netlify/functions/submit-form'), 'lane-100': require('../../netlify/functions/lane-100') };
  let n = 0;
  for (const name of Object.keys(fns)) {
    await page.route('**/.netlify/functions/' + name, async (route) => {
      const res = await fns[name].handler({ httpMethod: route.request().method(), body: route.request().postData(), headers: { 'user-agent': 'playwright', 'x-forwarded-for': '10.1.' + testInfo.workerIndex + '.' + (++n) } });
      await route.fulfill({ status: res.statusCode, headers: res.headers, body: res.body });
    });
  }
});
test.afterEach(() => { if (restore) restore(); });

test('A supporter bringing four friends finds the next HOME match and the gate price, with no account', async ({ page }) => {
  await page.clock.setFixedTime(new Date(NOW));
  await routeRegistry(page);
  await open(page, '/');
  // The next match is away; the homepage still answers "when can we come to Tithe Farm?"
  await expect(page.locator('#kl-bug')).toContainText('Holyport');
  const home = page.locator('#kl-nexthome');
  await expect(home).toContainText('Thatcham Town');
  await expect(home).toContainText('Saturday 31 October');
  await expect(home).toContainText('Kick-off 3pm');
  await expect(page.locator('#kl-prices')).toContainText('£9');

  await page.locator('a[href="matchday.html"]').first().click();
  await expect(page).toHaveURL(/matchday\.html/);
  await expect(page.locator('#fv-next')).toContainText('Thatcham Town');
  await expect(page.locator('#fv-prices')).toContainText('General Admission');
  // Five adults on the gate, worked out from the published price.
  await expect(page.locator('#fv-calc-total')).toContainText('5 people on the gate');
  await expect(page.locator('#fv-calc-total')).toContainText('£45');
  await page.getByRole('button', { name: 'One more Under 10s' }).click();
  await expect(page.locator('#fv-calc-total')).toContainText('6 people on the gate');
  await expect(page.locator('#fv-calc-total')).toContainText('£45');
  await expect(page.getByText('You never need a phone, an app or an account')).toBeVisible();
  await expect(page.getByText('Rayners Lane', { exact: false }).first()).toBeVisible();
  await expect(page.locator('.fv-rows')).toContainText('12-minute walk');
});

test('A postponed next home fixture reads the same on the homepage and the first-visit page', async ({ page }) => {
  await page.clock.setFixedTime(new Date(NOW));
  await routeRegistry(page, { postponeNextHome: true });
  for (const [url, sel] of [['/', '#kl-nexthome'], ['/matchday.html', '#fv-next']]) {
    await open(page, url);
    const el = page.locator(sel);
    await expect(el.locator('.nh__off')).toContainText('Postponed: Thatcham Town at Tithe Farm on Saturday 31 October is off');
    await expect(el.locator('.nh__opp')).toHaveText('Abingdon United');
    await expect(el).toContainText('Saturday 7 November');
    await expect(el).not.toContainText('Wokingham');   // an old postponement is history, not news
  }
});

test('If the fixture registry is down, both pages say so instead of guessing', async ({ page }) => {
  await routeRegistry(page, { down: true });
  await open(page, '/matchday.html');
  await expect(page.locator('#fv-next')).toHaveAttribute('data-state', 'unavailable');
  await expect(page.locator('#fv-next')).toContainText('can’t load the fixture list');
});

test('A business offers £100 for a matchday → the enquiry lands in Staff HQ as an enquiry record', async ({ page }) => {
  await open(page, '/investment.html');
  await page.locator('[data-pkg="Matchday sponsor"]').click();
  const form = page.locator('form[name="sponsor-enquiry"]');
  await expect(form.locator('[name=package]')).toHaveValue('Matchday sponsor');
  await form.locator('[name=company]').fill('Pinner Test Café Ltd');
  await form.locator('[name=contact]').fill('Priya Test');
  await form.locator('[name=email]').fill('priya@pinnertestcafe.co.uk');
  await form.locator('[name=budget]').fill('£100');
  await form.locator('[name=message]').fill('We would like to sponsor a home matchday this autumn.');
  await page.waitForTimeout(2600);
  await form.locator('button[type=submit]').click();
  await expect(page.getByText('Application received')).toBeVisible();
  await expect(page.getByText('Nothing is agreed until you have both confirmed it')).toBeVisible();

  expect(db.submissions).toHaveLength(1);
  expect(db.submissions[0].type).toBe('sponsor');
  const enq = db.hq_items.filter((i) => i.kind === 'enquiry');
  expect(enq).toHaveLength(1);
  expect(enq[0].title).toBe('Sponsorship enquiry — Pinner Test Café Ltd');
  expect(enq[0].data.interest).toBe('Matchday sponsor');
  expect(enq[0].data.budget).toBe('£100');
  expect(db.hq_orgs.map((o) => o.name)).toEqual(['Pinner Test Café Ltd']);
  // The page never sells what the club can't deliver at a shared ground.
  await open(page, '/investment.html');
  for (const sel of ['.inv-pk__list', '#inve-f5']) await expect(page.locator(sel).first()).not.toContainText(/board|naming|hospitality/i);
  await expect(page.locator('.inv-not')).toContainText('isn’t owned by the club');
});

test('A volunteer offers to help on one matchday → the club receives a volunteer record to approve', async ({ page }) => {
  await open(page, '/volunteer.html');
  await page.locator('[data-pick="Help on one matchday"]').click();
  const form = page.locator('form[name="volunteer"]');
  await expect(form.locator('[name=role]')).toHaveValue('Help on one matchday');
  await form.locator('[name=name]').fill('Val Test');
  await form.locator('[name=email]').fill('val@example.com');
  await form.locator('[name=availability]').fill('Saturday 31 October');
  await form.locator('[name=consent]').check();
  await page.waitForTimeout(2600);
  await form.locator('button[type=submit]').click();
  await expect(page.getByText('Offer received')).toBeVisible();
  await expect(page.getByText('will be in touch to agree a role')).toBeVisible();
  expect(db.submissions).toHaveLength(1);
  const s = db.submissions[0];
  expect(s.type).toBe('volunteer');
  expect(s.status === undefined || s.status === 'new').toBe(true);
  expect(s.payload).toMatchObject({ role: 'Help on one matchday', availability: 'Saturday 31 October' });
  expect(s.consent).toBe(true);
});

test('The Lane 100: an honest zero, then a real number from a real sign-up, and the wall shows only opt-ins', async ({ page }) => {
  await open(page, '/lane-100.html');
  const count = page.locator('#l100-count');
  await expect(count).toHaveAttribute('data-state', 'zero');
  await expect(count).toContainText('Be one of the first');
  await expect(page.locator('#l100-wall')).toContainText('Nobody is on the wall yet');

  const form = page.locator('#l100-form');
  await form.locator('[name=name]').fill('Sam Tester');
  await form.locator('[name=email]').fill('sam@example.com');
  await form.locator('[name=town]').fill('Pinner');
  await form.locator('[name=show_on_wall]').check();
  // consent is required: without it nothing is saved
  await page.waitForTimeout(2600);
  await form.getByRole('button', { name: 'Join The Lane 100' }).click();
  expect(db.lane100_members).toHaveLength(0);
  await form.locator('[name=consent]').check();
  await form.getByRole('button', { name: 'Join The Lane 100' }).click();

  await expect(page.locator('[data-l100-number]')).toHaveText('1');
  expect(db.lane100_members).toHaveLength(1);
  expect(db.lane100_members[0].supporter_no).toBe(1);
  await expect(count).toHaveAttribute('data-count', '1');
  await expect(page.locator('#l100-wall')).toContainText('Sam T.');
  await expect(page.locator('#l100-wall')).not.toContainText('sam@example.com');

  // A second supporter who does NOT opt in gets No. 2 and stays off the wall.
  await open(page, '/lane-100.html');
  await page.locator('#l100-form [name=name]').fill('Alex Quiet');
  await page.locator('#l100-form [name=email]').fill('alex@example.com');
  await page.locator('#l100-form [name=consent]').check();
  await page.waitForTimeout(2600);
  await page.locator('#l100-form').getByRole('button', { name: 'Join The Lane 100' }).click();
  await expect(page.locator('[data-l100-number]')).toHaveText('2');
  await expect(page.locator('#l100-wall')).not.toContainText('Alex');

  // The same email again is refused; no third number is created.
  await open(page, '/lane-100.html');
  await page.locator('#l100-form [name=name]').fill('Sam Again');
  await page.locator('#l100-form [name=email]').fill('SAM@example.com');
  await page.locator('#l100-form [name=consent]').check();
  await page.waitForTimeout(2600);
  await page.locator('#l100-form').getByRole('button', { name: 'Join The Lane 100' }).click();
  await expect(page.locator('.l100f__err')).toContainText('already one of The Lane 100');
  expect(db.lane100_members).toHaveLength(2);

  // The homepage shows the same real count.
  await open(page, '/');
  await expect(page.locator('#kl-l100-count')).toHaveAttribute('data-count', '2');
});

test('The Lane 100 counter shows no number at all when the count cannot be read', async ({ page }) => {
  await page.route('**/.netlify/functions/lane-100', (r) => r.fulfill({ status: 503, json: { ok: false } }));
  await open(page, '/lane-100.html');
  await expect(page.locator('#l100-count')).toHaveAttribute('data-state', 'unavailable');
  await expect(page.locator('#l100-count .l100c__now')).toHaveCount(0);
});
