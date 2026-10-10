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

// ════════════════════════════════════════════════════════════════════════
// LANE HQ — the redesigned shell, proved by the directive's scenarios
// (product design intervention §18 A, B, E, G). The REAL club-os and
// football-data functions over the in-memory database; the football registry
// is seeded relative to today in Europe/London (support/hq-harness.js), with
// the real shape of the week of 9 October 2026: postponed and superseded rows,
// results in the registry, historic home matches with no takings record.
// ════════════════════════════════════════════════════════════════════════
const HQ = require('./support/hq-harness');

test.describe('Lane HQ scenarios', () => {
  let hq;
  test.afterEach(() => { if (hq) hq.restore(); hq = null; });

  test('Lane HQ A — the chairman has five minutes: what needs doing, money, supporters, next match', async ({ page }, info) => {
    hq = await HQ.setupHq(page, { programme: { opponent: 'North Leigh', date: '2026-10-10', managerNotes: 'x' } });
    const t0 = Date.now();
    await HQ.signIn(page, open);
    const home = page.locator('#hq-home');
    expect(Date.now() - t0).toBeLessThan(15000);

    // The three questions are answered on the first screen (desktop) / in the first sections (phone).
    for (const h of ['Needs doing', 'Money in', 'Supporters']) await expect(home.getByRole('heading', { name: h })).toBeVisible();
    if (info.project.name === 'desktop-1440') {
      for (const h of ['Needs doing', 'Money in', 'Supporters']) await expect(home.getByRole('heading', { name: h })).toBeInViewport();
    }
    // No generic greeting, no misleading reassurance, no tool inventory.
    const text = await home.innerText();
    for (const banned of [/Good (morning|afternoon|evening)/, /Everything is available to you/, /cannot break the website/i, /All club tools/, /Quick actions/, /classic tile/i]) {
      expect(text).not.toMatch(banned);
    }
    // The next match is the registry's — tomorrow, not "today", and never the stale North Leigh fixture.
    const strip = page.locator('.hq-match');
    await expect(strip).toContainText('Holyport v Rayners Lane');
    await expect(strip).toContainText(/Tomorrow, /);
    expect(await page.locator('body').innerText()).not.toMatch(/Today at the club/i);
    await expect(strip).toContainText('Next home match: Thatcham Town');

    // Priorities: grouped by fixture and cause; registry results are public results.
    const rows = page.locator('.hq-pri__row');
    await expect(rows.filter({ hasText: /result not recorded|No result recorded/i })).toHaveCount(0);
    const rec = rows.filter({ hasText: '3 fixtures need reconciliation' });
    await expect(rec).toHaveCount(1);
    await expect(page.locator('.hq-sev--critical')).toHaveCount(0);
    await rec.locator('.hq-pri__btn').click();
    const items = rec.locator('.hq-pri__item');
    await expect(items).toHaveCount(3);
    await expect(rec).toContainText('Private attendance and takings records');
    await expect(items.filter({ hasText: 'Ardley United' })).toContainText('waiting for approval');
    await expect(items.filter({ hasText: 'Hilltop' })).toContainText('No attendance and takings record yet');
    // The postponed Hilltop and Wokingham rows are not "missing takings".
    await expect(items.filter({ hasText: 'Wokingham' })).toHaveCount(0);

    // Money: from the club office, not invented.
    const money = page.locator('section[aria-labelledby="hq-s-money"]');
    await expect(money.locator('.hq-row', { hasText: 'New sponsorship enquiries' })).toContainText('1');
    await expect(money.locator('.hq-row', { hasText: 'Owed on issued invoices' })).toContainText('£200');
    await expect(rows.filter({ hasText: '1 sponsorship enquiry waiting more than 48 hours' })).toHaveCount(1);
    // The programme being edited is for another fixture — said plainly, once.
    await expect(page.locator('section[aria-labelledby="hq-s-prog"] .hq-flag')).toContainText('North Leigh');

    // One notification system: the bell counts the same groups, unread first.
    const groups = await rows.count();
    await page.locator('#bell-btn').click();
    await expect(page.locator('#notif-panel')).toBeVisible();
    await expect(page.locator('#notif-panel .hq-note:not(.is-resolved)')).toHaveCount(groups);
    const badge = Number(await page.locator('#bell-badge').innerText());
    await page.locator('#notif-panel .hq-note').first().getByRole('button', { name: 'Mark as read' }).click();
    await expect(page.locator('#bell-badge')).toHaveText(String(badge - 1));
    await expect(page.locator('#notif-panel .hq-note:not(.is-resolved)')).toHaveCount(groups); // read ≠ resolved
    await page.keyboard.press('Escape');

    // A group opens the real destination.
    await page.locator('.hq-pri__row', { hasText: 'approvals waiting' }).locator('.hq-pri__btn').click();
    await page.locator('.hq-pri__row', { hasText: 'approvals waiting' }).getByRole('button', { name: /^Go to/ }).click();
    await expect(page.locator('#panel-commsdesk')).toBeVisible();
    await expect(page.locator('#hq-home')).toBeHidden();
  });

  test('Lane HQ B — an administrator works a fixture record, the fixture moves, nothing contradicts it', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-1440', 'one run is enough for a data journey');
    hq = await HQ.setupHq(page, { mdops: null });
    await HQ.signIn(page, open);
    await page.locator('.hq-match').getByRole('button', { name: 'Matchday preparation' }).click();
    const mp = page.locator('#hq-match');
    await expect(mp).toContainText('Holyport v Rayners Lane');
    await mp.getByRole('button', { name: 'Create the checklist' }).click();
    await expect(mp.locator('tbody tr')).toHaveCount(5);
    const holyId = hq.F.holyport.internal_fixture_id;
    const tasks = () => hq.db.hq_items.filter((i) => i.kind === 'task' && i.data && i.data.fixture === holyId);
    expect(tasks()).toHaveLength(5);
    const oldDay = HQ.londonDay(1);
    expect(tasks().every((t) => t.data.fixture_date === oldDay && t.created_by === 'Pete Singh')).toBe(true);

    // Assign and complete a job.
    page.__answers = ['Jenny'];
    await mp.locator('tbody tr').first().getByRole('button', { name: 'Assign' }).click();
    await expect(mp.locator('tbody tr').first()).toContainText('Jenny');
    await mp.locator('tbody tr').first().getByRole('button', { name: 'Mark done' }).click();
    await expect(mp.locator('tbody tr').first()).toContainText('Done');
    await expect(mp).toContainText('1 of 5 done');
    expect(tasks().filter((t) => t.stage === 'done')).toHaveLength(1);
    expect(hq.db.hq_audit.some((a) => a.action === 'move' && a.actor === 'Pete Singh')).toBe(true);

    // The league rearranges the fixture: the registry moves it a week.
    hq.F.holyport.scheduled_kickoff_at = HQ.london(HQ.londonDay(8), '15:00');
    await page.locator('#hq-nav').getByRole('link', { name: 'Command centre' }).click();
    await page.locator('[data-hq-refresh]').click();
    const moved = page.locator('.hq-pri__row', { hasText: 'Holyport (away) has moved to' });
    await expect(moved).toHaveCount(1);
    await expect(moved).toContainText('Urgent');
    await moved.locator('.hq-pri__btn').click();
    await moved.getByRole('button', { name: /^Go to/ }).click();
    await expect(mp.locator('.hq-flag--act')).toContainText('This fixture has moved');
    await mp.getByRole('button', { name: /Move them to the new date/ }).click();
    await expect(mp.locator('.hq-flag--act')).toHaveCount(0);
    const newDay = HQ.londonDay(8);
    expect(tasks().filter((t) => t.stage !== 'done').every((t) => t.data.fixture_date === newDay)).toBe(true);
    expect(tasks().filter((t) => !/^After the match/.test(t.title) && t.stage !== 'done').every((t) => t.due_date === newDay)).toBe(true);

    // No contradictory dates remain: the old date appears nowhere for Holyport.
    const oldLabel = await page.evaluate((d) => HQTime.shortDate(d), oldDay);
    expect(await mp.innerText()).not.toContain(oldLabel);
    await page.locator('#hq-nav').getByRole('link', { name: 'Command centre' }).click();
    await expect(page.locator('.hq-match')).toContainText(await page.evaluate((d) => HQTime.shortDate(d), newDay));
    expect(await page.locator('#hq-home').innerText()).not.toContain(oldLabel);
    await expect(page.locator('.hq-pri__row', { hasText: 'has moved' })).toHaveCount(0);
  });

  test('Lane HQ E — on a phone: simple navigation, adapted tables, clear saves, no sideways scroll', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'phone only');
    hq = await HQ.setupHq(page, { mdops: null });
    await HQ.signIn(page, open);
    const noSideways = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await noSideways()).toBe(true);
    await expect(page.locator('#hq-nav')).toBeHidden();               // no desktop sidebar on a phone
    const bar = page.locator('#hq-tabbar');
    await expect(bar).toBeVisible();
    for (const b of await bar.getByRole('button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);

    // Menu → search → a destination, in three taps.
    await bar.getByRole('button', { name: 'Menu' }).click();
    const sheet = page.locator('#hq-sheet');
    await expect(sheet).toBeVisible();
    await sheet.getByRole('searchbox', { name: 'Find a tool' }).fill('spons');
    await sheet.getByRole('link', { name: 'Sponsorship', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(page.locator('#panel-commercial')).toBeVisible();
    expect(await noSideways()).toBe(true);

    // Matchday from the tab bar; the job table stacks into readable rows.
    await bar.getByRole('button', { name: 'Matchday' }).click();
    const mp = page.locator('#hq-match');
    await mp.getByRole('button', { name: 'Create the checklist' }).click();
    await expect(mp.locator('tbody tr')).toHaveCount(5);
    expect(await noSideways()).toBe(true);
    const done = mp.locator('tbody tr').first().getByRole('button', { name: 'Mark done' });
    expect((await done.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await done.click();
    await expect(mp.locator('tbody tr').first()).toContainText('Done');     // the save shows where it happened
    expect(await noSideways()).toBe(true);

    // Back to the overview from the tab bar.
    await bar.getByRole('button', { name: 'Overview' }).click();
    await expect(page.locator('#hq-home')).toBeVisible();
    await expect(page.locator('.hq-match')).toContainText('1 of 5 jobs done');
  });
});

// Scenario G needs a real service worker, which the shared config blocks, and
// a sw.js whose bytes change mid-test — so it serves the site itself.
test('Lane HQ G — a new version arrives while someone is editing: no forced reload, update when safe', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop-1440', 'one browser is enough for the lifecycle');
  const http = require('http'), fs = require('fs'), path = require('path');
  const ROOT = path.resolve(__dirname, '..', '..');
  let build = 1;
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.mjs': 'text/javascript', '.svg': 'image/svg+xml' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.startsWith('/.netlify/')) { res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end('{"ok":false}'); }
    if (p === '/') p = '/index.html';
    const abs = path.join(ROOT, p);
    if (!abs.startsWith(ROOT) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); return res.end(); }
    let body = fs.readFileSync(abs);
    if (p === '/sw.js') body = Buffer.from(String(body).replace(/var VERSION = '[^']*'/, `var VERSION = 'test-build-${build}'`));
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(abs)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const ctx = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 1280, height: 800 }, timezoneId: 'Europe/London' });
  const page = await ctx.newPage();
  try {
    await ctx.route((u) => !u.href.startsWith(base), (r) => r.abort());
    await ctx.route('**/.netlify/functions/admin-pin', (r) => r.fulfill({ json: { ok: true } }));
    await page.addInitScript(() => { try { localStorage.setItem('rlfc_consent_v2', '{"analytics":false,"essential":true,"version":2}'); localStorage.setItem('rlfc_actor', 'Test'); } catch (e) {} });
    await page.goto(base + '/admin.html');
    await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
    for (const d of '1933') await page.locator('.pin-btn', { hasText: new RegExp(`^${d}$`) }).click();
    const temp = page.getByRole('button', { name: 'Continue with temporary committee access' });
    if (await temp.isVisible({ timeout: 3000 }).catch(() => false)) await temp.click();
    await page.locator('#app').waitFor({ state: 'visible' });
    // A first install is not an "update".
    await expect(page.locator('#hq-update.on')).toHaveCount(0);

    // Start editing something.
    await page.evaluate(() => openPanel('news'));
    const field = page.locator('#panel-news input[type=text]:visible, #panel-news textarea:visible').first();
    await field.click();
    await field.pressSequentially('Matchday notes in progress');
    await page.evaluate(() => { window.__stillHere = true; });

    // A new version ships. Ask twice: one bar, not two.
    build = 2;
    await page.evaluate(() => HQPwa.checkNow());
    await page.evaluate(() => HQPwa.checkNow());
    const bar = page.locator('#hq-update.on');
    await expect(bar).toContainText('An update to Lane HQ is ready', { timeout: 15000 });
    await expect(bar).toContainText('test-build-2');
    await expect(page.locator('#hq-update')).toHaveCount(1);
    // Nothing reloaded by itself, and the typing is still there.
    expect(await page.evaluate(() => window.__stillHere)).toBe(true);

    // "Reload now" with unsaved work → it refuses, and says why.
    await bar.getByRole('button', { name: 'Reload now' }).click();
    await expect(bar).toContainText('You have unsaved changes in News');
    expect(await page.evaluate(() => window.__stillHere)).toBe(true);
    await expect(field).toHaveValue(/Matchday notes in progress/);
    await bar.getByRole('button', { name: 'Keep editing' }).click();

    // They save (a confirmed save clears the marker) and update at a safe point.
    await page.evaluate(() => toast('Saved'));
    await Promise.all([page.waitForEvent('load'), bar.getByRole('button', { name: 'Reload now' }).click()]);
    await page.waitForFunction(() => window.HQPwa && navigator.serviceWorker.controller);
    expect(await page.evaluate(() => window.__stillHere)).toBeUndefined();   // it really reloaded
    const v = await page.evaluate(() => new Promise((res) => { const ch = new MessageChannel(); ch.port1.onmessage = (e) => res(e.data.version); navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' }, [ch.port2]); }));
    expect(v).toBe('test-build-2');
    await page.waitForTimeout(800);
    await expect(page.locator('#hq-update.on')).toHaveCount(0);           // cleared after the update
    expect(await page.evaluate(() => sessionStorage.getItem('hq_update_later'))).toBeNull();
  } finally {
    await ctx.close();
    server.close();
  }
});
