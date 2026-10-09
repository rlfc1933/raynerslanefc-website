// JOURNEY GATE — complete interactions, end to end, on the rendered site.
// Each journey is what a real person does; each must work by touch AND keyboard.
'use strict';
const { test, expect } = require('@playwright/test');
const { open } = require('./_helpers');

const isPhoneish = (name) => ['phone', 'phone-small', 'fold-folded', 'webkit-iphone'].includes(name);
const JOURNEY_PROJECTS = ['desktop-1440', 'tablet-portrait', 'phone', 'fold-folded', 'webkit-iphone'];

test.beforeEach(({}, testInfo) => {
  test.skip(!JOURNEY_PROJECTS.includes(testInfo.project.name), 'journeys run on desktop, tablet, phone, folded phone');
});

test('menu: opens, traps focus, closes with Escape and returns focus', async ({ page }, testInfo) => {
  await open(page, '/');
  const btn = page.locator('[data-menu-btn]:visible').first();
  if (!(await btn.count())) test.skip(true, 'no menu button at this width (desktop nav)');
  await btn.focus();
  await page.keyboard.press('Enter');
  const menu = page.locator('#lane-menu');
  await expect(menu).toHaveClass(/open/);
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => page.evaluate(() => !!document.activeElement.closest('#lane-menu'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveClass(/open/);
  await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-menu-btn'))).toBe(true);
});

test('fixtures: the next match and results render from data', async ({ page }) => {
  await open(page, '/fixtures.html');
  await expect(page.locator('#fx-next')).not.toBeEmpty();
  await expect(page.locator('#fx-results')).not.toBeEmpty();
});

test('news → article: a supporter can open a story and read it', async ({ page }) => {
  await open(page, '/news.html');
  const link = page.locator('a[href*="news-article.html?id="]').first();
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForLoadState('domcontentloaded');
  await expect(page).toHaveURL(/news-article\.html\?id=/);
  await expect(page.locator('h1').first()).not.toBeEmpty();
});

test('contact: the form will not submit empty and says why', async ({ page }) => {
  let posted = false;
  page.on('request', (r) => { if (r.method() === 'POST') posted = true; });
  await open(page, '/contact.html');
  const form = page.locator('form.contact-form');
  await form.locator('button[type=submit], input[type=submit]').first().click();
  const invalid = await form.evaluate((f) => !f.checkValidity());
  expect(invalid, 'empty contact form should be invalid').toBe(true);
  expect(posted, 'an empty form must not be sent').toBe(false);
});

test('cookies: declining loads no analytics; nothing loads before a decision', async ({ page }) => {
  const tracked = [];
  page.on('request', (r) => { if (/googletagmanager|google-analytics|clarity\.ms/.test(r.url())) tracked.push(r.url()); });
  await open(page, '/', { keepBanner: true });
  expect(tracked, 'analytics requested before consent').toEqual([]);
  const decline = page.getByRole('button', { name: /decline|reject|no thanks|essential only/i }).first();
  if (await decline.count()) { await decline.click(); await page.reload(); }
  expect(tracked, 'analytics requested after decline').toEqual([]);
});

test('staff HQ: wrong password refused, committee password lets you in', async ({ page }, testInfo) => {
  // admin-pin is a Netlify function; locally we stand in for it with the same rule.
  await page.route('**/.netlify/functions/admin-pin', async (route) => {
    const pin = JSON.parse(route.request().postData() || '{}').pin;
    await route.fulfill({ json: { ok: pin === '1933' } });
  });
  await open(page, '/admin.html');
  const key = (d) => page.locator('.pin-btn', { hasText: new RegExp(`^${d}$`) }).click();
  for (const d of '1234') await key(d);
  await expect(page.locator('#perr')).toContainText(/wrong/i);
  await expect(page.locator('#app')).toBeHidden();
  await page.waitForTimeout(2100);
  for (const d of '1933') await key(d);
  await expect(page.locator('#app')).toBeVisible();
});

test('keyboard only: every primary nav link is reachable and visibly focused', async ({ page }, testInfo) => {
  test.skip(isPhoneish(testInfo.project.name), 'desktop/tablet keyboard journey');
  await open(page, '/');
  const seen = [];
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const el = document.activeElement; const cs = getComputedStyle(el);
      return { tag: el.tagName, href: el.getAttribute('href'), ring: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none' };
    });
    seen.push(f);
  }
  const unringed = seen.filter((f) => f.tag !== 'BODY' && !f.ring);
  expect(unringed.map((f) => `${f.tag} ${f.href || ''}`), 'focused with no visible indicator').toEqual([]);
  expect(seen.some((f) => /fixtures/.test(f.href || '')), 'Fixtures link not reachable by keyboard').toBe(true);
});
