// STAFF HQ JOURNEYS — the directive's end-to-end journeys, run through the
// real browser UI against the REAL server functions (club-os.js,
// submit-form.js), with an in-memory database so no production record is
// touched and nothing is emailed. Each journey covers success AND the
// realistic failure a person will hit (ADDENDUM §8).
'use strict';
process.env.SUPABASE_URL = 'https://fake-supabase.local';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const { test, expect } = require('@playwright/test');
const { makeDb, install } = require('./support/fake-supabase');
const { open } = require('./_helpers');

const HQ_PROJECTS = ['desktop-1440', 'phone'];
let db, restore;

test.beforeEach(async ({ page, baseURL }, testInfo) => {
  test.skip(!HQ_PROJECTS.includes(testInfo.project.name), 'HQ journeys run on desktop and phone');
  process.env.URL = baseURL;
  db = makeDb({ attendance: [] });
  restore = install(db);
  // fresh module per test so it binds to this test's fake database
  for (const k of Object.keys(require.cache)) if (/netlify[\\/]functions/.test(k)) delete require.cache[k];
  const fns = { 'club-os': require('../../netlify/functions/club-os'), 'submit-form': require('../../netlify/functions/submit-form') };
  await page.route('**/.netlify/functions/admin-pin', (r) => r.fulfill({ json: { ok: JSON.parse(r.request().postData() || '{}').pin === '1933' } }));
  for (const name of Object.keys(fns)) {
    await page.route('**/.netlify/functions/' + name, async (route) => {
      const res = await fns[name].handler({ httpMethod: route.request().method(), body: route.request().postData(), headers: { 'user-agent': 'playwright' } });
      await route.fulfill({ status: res.statusCode, headers: res.headers, body: res.body });
    });
  }
  page.on('dialog', (d) => d.type() === 'prompt' ? d.accept(page.__answers && page.__answers.length ? page.__answers.shift() : 'Test Steward') : d.accept());
});
test.afterEach(() => { if (restore) restore(); });

async function signIn(page) {
  await open(page, '/admin.html');
  for (const d of '1933') await page.locator('.pin-btn', { hasText: new RegExp(`^${d}$`) }).click();
  await expect(page.locator('#app')).toBeVisible();
  await page.evaluate(() => { try { localStorage.setItem('rlfc_actor', 'Pete (test)'); } catch (e) {} });
}
const openPanel = (page, id) => page.evaluate((x) => window.openPanel(x), id);
const answers = (page, ...a) => { page.__answers = a; };

test('Journey A — a business enquires on the website and lands in HQ with an owner and the 48-hour clock', async ({ page }) => {
  await open(page, '/investment.html');
  const form = page.locator('form[name="sponsor-enquiry"]');
  await form.locator('[name=company]').fill('Harrow Test Bakery Ltd');
  await form.locator('[name=contact]').fill('Sam Baker');
  await form.locator('[name=email]').fill('sam@harrowtestbakery.co.uk');
  await form.locator('[name=message]').fill('Interested in a matchball for a home game.');
  await page.waitForTimeout(2600); // a person takes longer than the form's 2.5s bot trap
  await form.locator('button[type=submit]').click();
  await expect(page.getByText('Application received')).toBeVisible();

  // Double submit / retry must not create a second enquiry for the same submission.
  expect(db.submissions).toHaveLength(1);
  expect(db.hq_items.filter((i) => i.kind === 'enquiry')).toHaveLength(1);
  expect(db.hq_orgs.map((o) => o.name)).toEqual(['Harrow Test Bakery Ltd']);
  const enq = db.hq_items.find((i) => i.kind === 'enquiry');
  expect(enq.due_date).toBe(new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10));

  // The club sees it, assigns it, and a reply task appears.
  await signIn(page);
  await openPanel(page, 'commercial');
  await page.getByRole('button', { name: /Sponsorship enquiry — Harrow Test Bakery/ }).click();
  answers(page, 'Nigel');
  await page.locator('#cos-drawer').getByRole('button', { name: 'Assigned' }).click();
  await expect(page.locator('#cos-drawer').getByText('Reply to: Sponsorship enquiry')).toBeVisible();
  expect(db.hq_items.find((i) => i.kind === 'task').owner).toBe('Nigel');
  expect(db.hq_audit.some((a) => a.action === 'move' && a.actor === 'Pete (test)')).toBe(true);
});

test('Journey A (failure) — if the database is down the visitor is told, nothing pretends to succeed', async ({ page }) => {
  await page.route('**/.netlify/functions/submit-form', (r) => r.fulfill({ json: { ok: false, error: 'save-failed' } }));
  await open(page, '/investment.html');
  const form = page.locator('form[name="sponsor-enquiry"]');
  await form.locator('[name=company]').fill('X'); await form.locator('[name=contact]').fill('Y'); await form.locator('[name=email]').fill('y@x.co.uk');
  await page.waitForTimeout(2600);
  await form.locator('button[type=submit]').click();
  await expect(form.locator('.lane-form-err')).toBeVisible();
  await expect(page.getByText('Application received')).toHaveCount(0);
});

test('Sponsorship — winning a deal needs an owner and a value, then creates fulfilment, an invoice draft and a renewal task', async ({ page }) => {
  await signIn(page);
  await openPanel(page, 'commercial');
  await page.getByRole('button', { name: 'Pipeline' }).click();
  await page.getByRole('button', { name: '+ New' }).click();
  await page.getByLabel('Title *').fill('Hanlon Test — matchball');
  await page.getByRole('button', { name: 'Create' }).click();
  const drawer = page.locator('#cos-drawer');
  await expect(drawer.getByText('Hanlon Test — matchball')).toBeVisible();
  for (const step of ['Qualified', 'Contact approved']) { await drawer.getByRole('button', { name: step, exact: true }).click(); await expect(drawer.locator('.cos-stage').first()).toHaveText(step); }
  answers(page, 'Pete'); // owner is asked for when moving to Contacted
  await drawer.getByRole('button', { name: 'Contacted', exact: true }).click();
  for (const step of ['Responded', 'Proposal']) { await drawer.getByRole('button', { name: step, exact: true }).click(); await expect(drawer.locator('.cos-stage').first()).toHaveText(step); }
  answers(page, ''); // no value given → refused, explained
  await drawer.getByRole('button', { name: 'Won', exact: true }).click();
  await expect(drawer.locator('.cos-err')).toContainText('agreed value');
  answers(page, '450');
  await drawer.getByRole('button', { name: 'Won', exact: true }).click();
  await expect(drawer.getByText('Contract signed (both parties)')).toBeVisible();
  const kids = db.hq_items.filter((i) => i.parent_id);
  expect(kids.filter((k) => k.kind === 'fulfilment')).toHaveLength(12);
  expect(kids.filter((k) => k.kind === 'invoice').map((k) => k.value_pence)).toEqual([45000]);
  expect(kids.filter((k) => k.kind === 'task')).toHaveLength(1);
});

test('Outreach — no self-approval, and no "sent" for a business without a lawful basis or on the suppression list', async ({ page }) => {
  await signIn(page);
  await openPanel(page, 'outreach');
  await page.getByRole('button', { name: 'Businesses' }).click();
  await page.getByRole('button', { name: '+ Add organisation' }).click();
  await page.getByLabel('Name *').fill('Pinner Test Plumbing');
  await page.getByLabel('Business email').fill('hello@pinnertestplumbing.co.uk');
  await page.getByLabel('Legal form (decides outreach rules)').selectOption('sole_trader');
  await page.getByLabel('Contact permission').selectOption('corporate_lawful_basis');
  await page.getByRole('button', { name: 'Save' }).click();
  const drawer = page.locator('#cos-drawer');
  await expect(drawer.locator('.cos-send')).toContainText('Sole traders and partnerships need consent');

  // Duplicate business refused.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '+ Add organisation' }).click();
  await page.getByLabel('Name *').fill('Pinner test plumbing');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(drawer.locator('.cos-err')).toContainText('Already on record');
  await page.keyboard.press('Escape');

  // Draft as Pete; Pete cannot approve his own draft.
  const org = db.hq_orgs[0];
  const r = await page.evaluate((id) => fetch('/.netlify/functions/club-os', { method: 'POST', body: JSON.stringify({ pin: '1933', actor: 'Pete (test)', action: 'create', kind: 'outreach', title: 'Intro — Pinner Test Plumbing', org_id: id }) }).then((x) => x.json()), org.id);
  expect(r.ok).toBe(true);
  const call = (actor, body) => page.evaluate(([a, b]) => fetch('/.netlify/functions/club-os', { method: 'POST', body: JSON.stringify(Object.assign({ pin: '1933', actor: a }, b)) }).then((x) => x.json()), [actor, body]);
  expect((await call('Pete (test)', { action: 'move', id: r.item.id, to: 'approved' })).error).toMatch(/other than/);
  expect((await call('Nigel', { action: 'move', id: r.item.id, to: 'approved' })).ok).toBe(true);
  expect((await call('Nigel', { action: 'move', id: r.item.id, to: 'sent' })).error).toMatch(/Not sent: .*consent/);
  // They object → suppressed → still cannot be sent even after a basis is recorded.
  expect((await call('Nigel', { action: 'suppress', value: 'hello@pinnertestplumbing.co.uk', reason: 'asked not to be contacted (test)' })).ok).toBe(true);
  await call('Nigel', { action: 'saveOrg', id: org.id, permission: 'express_consent' });
  expect((await call('Nigel', { action: 'move', id: r.item.id, to: 'sent' })).error).toMatch(/suppression/);
  expect(db.hq_items.find((i) => i.id === r.item.id).stage).toBe('approved');
});

test('Rewards — earned from verified check-ins, redeemable once, refused twice', async ({ page }) => {
  const y = new Date().getUTCMonth() >= 6 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;
  for (let i = 0; i < 6; i++) db.attendance.push({ lane_no: '4242', home: true, match_date: `${y}-08-${String(10 + i).padStart(2, '0')}` });
  db.attendance.push({ lane_no: '4242', home: true, match_date: `${y}-08-10` }); // a double scan of the same match counts once
  await signIn(page);
  await openPanel(page, 'rewards');
  await page.getByLabel('Lane number (from their card)').fill('4242');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('6 verified home visit(s)')).toBeVisible();
  await page.getByRole('button', { name: 'Redeem now' }).click();
  await expect(page.locator('[data-cos="rewards"]').getByText('Redeemed', { exact: true })).toBeVisible();
  expect(db.hq_redemptions).toHaveLength(1);
  const again = await page.evaluate(() => fetch('/.netlify/functions/club-os', { method: 'POST', body: JSON.stringify({ pin: '1933', actor: 'Other phone', action: 'redeem', lane_no: '4242', reward_key: 'home5' }) }).then((x) => x.json()));
  expect(again.ok).toBe(false); expect(again.error).toMatch(/Already redeemed/);
  const early = await page.evaluate(() => fetch('/.netlify/functions/club-os', { method: 'POST', body: JSON.stringify({ pin: '1933', actor: 'x', action: 'redeem', lane_no: '4242', reward_key: 'home10' }) }).then((x) => x.json()));
  expect(early.error).toMatch(/Not earned yet/);
});

test('Club Office — starting records load once, honestly, and the command centre shows real gaps', async ({ page }) => {
  await signIn(page);
  await openPanel(page, 'command');
  await page.getByRole('button', { name: 'Load starting records' }).click();
  await expect(page.locator('[data-cos="command"]').getByText('Nobody owns these')).toBeVisible();
  const grants = db.hq_items.filter((i) => i.kind === 'grant');
  expect(grants.length).toBeGreaterThan(5);
  expect(grants.every((g) => /^https:\/\//.test(g.data.source_url))).toBe(true);
  expect(grants.find((g) => /Movement Fund/.test(g.title)).stage).toBe('ineligible');
  expect(db.hq_items.filter((i) => i.kind === 'compliance').every((c) => !c.due_date)).toBe(true);
  const before = db.hq_items.length;
  await page.evaluate(() => fetch('/.netlify/functions/club-os', { method: 'POST', body: JSON.stringify({ pin: '1933', actor: 'x', action: 'seed' }) }));
  expect(db.hq_items.length).toBe(before); // re-running creates nothing
});

test('Permissions — no committee password, no data; unsigned writes refused', async ({ page }) => {
  await open(page, '/');
  const r = await page.evaluate(() => fetch('/.netlify/functions/club-os', { method: 'POST', body: JSON.stringify({ pin: '0000', action: 'orgs' }) }).then((x) => x.status));
  expect(r).toBe(401);
  const w = await page.evaluate(() => fetch('/.netlify/functions/club-os', { method: 'POST', body: JSON.stringify({ pin: '1933', action: 'create', kind: 'task', title: 'x' }) }).then((x) => x.json()));
  expect(w.error).toMatch(/who you are/);
});
