// PROGRAMME JOURNEYS — the matchday programme system through the real browser
// UI and the REAL server functions (programme-sync, programme-data,
// programme-admin) on an in-memory database seeded from the verified 2026/27
// facts. No production record is read or written; nothing leaves the machine.
//
// Covers: archive loading (live and with the service down), cup fixtures, the
// member gate, the two-stage edition (placeholder → partial → confirmed),
// postponement, Programme HQ approval and retrospective authorisation, and a
// REAL A4 PDF rendered page by page to PNG and checked.
'use strict';
process.env.SUPABASE_URL = 'https://fake-supabase.local';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SITE_ORIGIN = 'https://site.local';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, expect } = require('@playwright/test');
const FAKE = require('../../tests/helpers/programme-fake-db');
const SEASON = require('../../tests/fixtures/programme/season-2026-27');
const { open } = require('./_helpers');

const PROJECTS = ['desktop-1440', 'phone'];
let db, restore, F, member;

function load() {
  for (const k of Object.keys(require.cache)) if (/netlify[\\/]functions/.test(k)) delete require.cache[k];
  const FAN = require('../../netlify/functions/lib/fan/members');
  // The member gate is decided by Supabase Auth in production. Here a test
  // chooses who is asking; the gate's own logic is unchanged.
  FAN.context = async () => member
    ? { user: { id: 'u1' }, member: { id: 'm1', membership_status: 'active' }, entitled: true }
    : { user: null, member: null, entitled: false };
  FAN.record = async () => null;
  return {
    sync: require('../../netlify/functions/programme-sync'),
    data: require('../../netlify/functions/programme-data'),
    admin: require('../../netlify/functions/programme-admin'),
  };
}
const sync = (iso) => F.sync.handler({ httpMethod: 'POST', body: '{}', _now: iso ? Date.parse(iso) : SEASON.NOW });
const admin = (b) => F.admin.handler({ httpMethod: 'POST', body: JSON.stringify(Object.assign({ pin: '1933', by: 'Jenny' }, b)) });

async function wire(page) {
  for (const name of ['programme-data', 'programme-admin']) {
    await page.route('**/.netlify/functions/' + name + '**', async (route) => {
      const u = new URL(route.request().url());
      const res = await F[name === 'programme-data' ? 'data' : 'admin'].handler({
        httpMethod: route.request().method(), body: route.request().postData(),
        queryStringParameters: Object.fromEntries(u.searchParams), headers: {} });
      await route.fulfill({ status: res.statusCode, headers: res.headers, body: res.body });
    });
  }
}

function lineup(fixtureExt, side, prefix) {
  const fx = db.football_fixtures.filter((f) => f.external_fixture_id === fixtureExt)[0];
  const id = db.football_lineups.length + 1;
  db.football_lineups.push({ id, fixture_id: fx.id, team_id: side === 'home' ? fx.home_team_id : fx.away_team_id,
    status: 'confirmed', source_updated_at: '2026-10-31T14:05:00Z' });
  for (let i = 1; i <= 16; i++) {
    db.football_lineup_players.push({ lineup_id: id, provider_player_name: prefix + ' Player ' + i, shirt_number: String(i),
      lineup_role: i <= 11 ? 'starter' : 'substitute', sort_order: i, is_captain: i === 4 });
  }
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(!PROJECTS.includes(testInfo.project.name), 'programme journeys run on desktop and phone');
  db = FAKE.makeDb();
  FAKE.seedRegistry(db, SEASON.corrected());
  restore = FAKE.install(db, { passthrough: true });
  member = false;
  F = load();
  await sync();
});
test.afterEach(() => { if (restore) restore(); });

test('the archive lists every home fixture, cup included, with honest states', async ({ page }) => {
  await admin({ action: 'authorise_retrospective', fixtureId: 'fwp-590749', reason: 'complete the archive' });
  await wire(page);
  await open(page, '/programmes.html');
  const led = page.locator('#programme-ledger');
  await expect(led).toHaveAttribute('data-source', 'live');
  await expect(led.locator('.pg-led__row', { hasText: 'New Bradwell St Peter' })).toContainText('FA Vase');
  await expect(led.locator('.pg-led__row', { hasText: 'Wokingham Town' })).toContainText('Postponed');
  await expect(led.locator('.pg-led__row[data-kind="retrospective"]', { hasText: 'Hilltop' })).toContainText('Archive edition');
  await expect(led.locator('.pg-led__row', { hasText: 'Thatcham Town' })).toContainText('Not yet published');
  // Away fixtures — including Broadfields' home match at the ground we share — are not listed.
  await expect(led.locator('.pg-led__row', { hasText: 'v Broadfields United' })).toHaveCount(1);   // our 28 Nov home match only
  // The shelf shows the archive edition with its label.
  await expect(page.locator('.pl-card__note, .pl-featured .label').first()).toContainText(/Archive edition/);
  // Filters narrow the season record.
  await page.selectOption('#pg-f-comp', 'cup');
  await expect(led.locator('.pg-led__row:not([hidden])')).toHaveCount(1);
});

test('the archive with the programme service DOWN says so, and the baked season record stays', async ({ page }) => {
  await page.route('**/.netlify/functions/programme-data**', (r) => r.fulfill({ status: 503, body: '{"ok":false}' }));
  await open(page, '/programmes.html');
  await expect(page.locator('.pl-notice')).toContainText('could not be loaded');
  await expect(page.getByText('The collection starts soon')).toHaveCount(0);
  const led = page.locator('#programme-ledger');
  await expect(led).toHaveAttribute('data-source', 'baked');
  await expect(led.locator('.pg-led__row')).toHaveCount(10);
  await expect(led).toContainText('As recorded on 9 October 2026');
});

test('a visitor gets the gate and a way in; a member reads the edition (two stages)', async ({ page }) => {
  await admin({ action: 'approve_editorial', fixtureId: 'fwp-578384' });
  await sync('2026-10-31T09:00:00Z');
  await wire(page);

  await open(page, '/programme.html?id=fwp-578384');
  await expect(page.locator('.pr-gate')).toBeVisible();
  await expect(page.locator('.pr-gate').getByRole('link', { name: /Join Fan Zone/ })).toHaveAttribute('href', /return=/);
  await expect(page.locator('.pr-xi__wait')).toHaveCount(0);   // no contents leak to a visitor

  member = true;
  await page.reload();
  await expect(page.locator('#pr-squads')).toContainText('Confirmed teams will appear here when available.');

  lineup('578384', 'home', 'Lane');
  await sync('2026-10-31T14:10:00Z');
  await page.reload();
  const sq = page.locator('#pr-squads');
  await expect(sq.locator('.pr-xi__side').first().locator('.pr-xi__row')).toHaveCount(16);
  await expect(sq.locator('.pr-xi__side').nth(1)).toContainText('Confirmed teams will appear here when available.');
  await expect(sq).toContainText(/Team sheet updated from Football Web Pages at/);

  lineup('578384', 'away', 'Thatcham');
  await sync('2026-10-31T14:20:00Z');
  await page.reload();
  await expect(sq.locator('.pr-xi__wait')).toHaveCount(0);
  await expect(page.locator('.pr-credit')).toContainText('version 3');
});

test('postponed after publication: the edition stays readable and says so', async ({ page }) => {
  member = true;
  await admin({ action: 'approve_editorial', fixtureId: 'fwp-578384' });
  await sync('2026-10-31T09:00:00Z');
  db.football_fixtures.filter((f) => f.external_fixture_id === '578384')[0].fixture_status = 'postponed';
  await sync('2026-10-31T11:00:00Z');
  await wire(page);
  await open(page, '/programme.html?id=fwp-578384');
  await expect(page.locator('.pr-note')).toContainText('postponed after the programme was published');
});

test('Programme HQ: sign in, approve the next edition, authorise an archive edition', async ({ page }) => {
  await wire(page);
  page.on('dialog', (d) => d.type() === 'prompt' ? d.accept('complete the archive') : d.accept());
  await open(page, '/programmes.html?hq=1');
  await page.getByLabel('Committee password').fill('1933');
  await page.getByLabel('Your name').fill('Jenny');
  await page.getByRole('button', { name: 'Open Programme HQ' }).click();
  await expect(page.locator('#phq-next-h')).toBeVisible();
  await expect(page.locator('.phq-fixture')).toContainText('Thatcham Town');

  await page.getByRole('button', { name: 'Approve editorial edition' }).click();
  await expect(page.locator('#phq-msg')).toContainText('Approved');
  expect(db.programme_editions.filter((e) => e.external_fixture_id === '578384')[0].editorial_approved_by).toBe('Jenny');

  const row = page.locator('.phq-table tr', { hasText: '590749' });
  await row.getByRole('button', { name: 'Authorise archive edition' }).click();
  await expect(page.locator('#phq-msg')).toContainText('Archive Edition published');
  const e = db.programme_editions.filter((x) => x.external_fixture_id === '590749')[0];
  expect(e.edition_kind).toBe('retrospective');
  expect(db.programme_publication_events.some((x) => x.event_type === 'retrospective_authorised' && x.actor === 'Jenny')).toBe(true);
});

test('Programme HQ refuses a wrong password', async ({ page }) => {
  await wire(page);
  await open(page, '/programmes.html?hq=1');
  await page.getByLabel('Committee password').fill('0000');
  await page.getByLabel('Your name').fill('Someone');
  await page.getByRole('button', { name: 'Open Programme HQ' }).click();
  await expect(page.getByRole('alert')).toContainText('not recognised');
});

test('a REAL A4 PDF: generated, measured, every page rendered to PNG and checked', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'one PDF is enough');
  member = true;
  await admin({ action: 'approve_editorial', fixtureId: 'fwp-578384' });
  await sync('2026-10-31T09:00:00Z');
  lineup('578384', 'home', 'Lane'); lineup('578384', 'away', 'Thatcham');
  await sync('2026-10-31T14:20:00Z');
  await admin({ action: 'authorise_retrospective', fixtureId: 'fwp-590749' });
  await wire(page);

  for (const [id, name] of [['fwp-578384', 'matchday'], ['fwp-590749', 'archive']]) {
    await open(page, '/programme.html?id=' + id);
    await expect(page.locator('.pr-cover')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print' });
    const dir = testInfo.outputPath(name);
    fs.mkdirSync(dir, { recursive: true });
    const pdf = path.join(dir, name + '.pdf');
    await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
    await page.emulateMedia({ media: 'screen' });

    const info = execFileSync('pdfinfo', [pdf]).toString();
    expect(info).toMatch(/Page size:\s+59[45](\.\d+)? x 84[12](\.\d+)? pts \(A4\)/);
    const pages = Number(info.match(/Pages:\s+(\d+)/)[1]);
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(pages).toBeLessThanOrEqual(12);   // an edition, not twenty pages of filler
    expect(info).toMatch(new RegExp('Title:.*' + (name === 'archive' ? 'Archive Edition' : 'Matchday Programme') + '.*version'));

    // Every page rendered to an image; no accidental blank pages; every page
    // after the cover carries the running foot with its page number.
    execFileSync('pdftoppm', ['-r', '50', '-png', pdf, path.join(dir, 'page')]);
    const pngs = fs.readdirSync(dir).filter((f) => /^page-\d+\.png$/.test(f)).sort();
    expect(pngs.length).toBe(pages);
    for (let i = 1; i <= pages; i++) {
      const text = execFileSync('pdftotext', ['-f', String(i), '-l', String(i), '-layout', pdf, '-']).toString().trim();
      expect(text.length, 'page ' + i + ' is blank').toBeGreaterThan(10);
      if (i > 1) expect(text).toContain('Page ' + i + ' of ' + pages);
      await testInfo.attach(name + '-page-' + i, { path: path.join(dir, pngs[i - 1]), contentType: 'image/png' });
    }
    const all = execFileSync('pdftotext', ['-layout', pdf, '-']).toString();
    if (name === 'archive') {
      expect(all).toContain('Archive Edition — Reconstructed from verified match records');
      expect(all).not.toMatch(/Kick-off 1[23]:00/);
    } else {
      expect(all).toContain('Lane Player 1');
      expect(all).toContain('Company No. 17110511');   // FA Standardised Rule 2.15 footer
    }
  }
});
