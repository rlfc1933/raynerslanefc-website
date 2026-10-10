// ASSET STUDIO JOURNEYS — the real admin page, the real Studio code, the REAL
// studio-assets function over an in-memory database, and a registry answer
// shaped like football-data. Every export is actually clicked, the download is
// captured, and the FILE is checked: format, exact pixel size, byte count. The
// files are kept (see OUT below) so a person (or Claude) can
// look at them, which the release notes require.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, expect } = require('@playwright/test');
const { wire } = require('./support/studio-harness');
const { presetConsent } = require('./_helpers');

// Outside .results (Playwright empties that at the start of every run) so the
// files survive for a person to open. Override with STUDIO_EXPORT_DIR.
const OUT = process.env.STUDIO_EXPORT_DIR || path.join(require('os').tmpdir(), 'rlfc-studio-exports');
fs.mkdirSync(OUT, { recursive: true });
const STUDIO_PROJECTS = ['desktop-1440', 'phone'];
let h;

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!STUDIO_PROJECTS.includes(testInfo.project.name), 'Studio journeys run on desktop and phone');
});
test.afterEach(() => { if (h && h.restore) h.restore(); h = null; });

async function signIn(page, opts) {
  h = await wire(page, opts);
  await presetConsent(page);
  await page.addInitScript(() => { try { if (!localStorage.getItem('rlfc_actor')) localStorage.setItem('rlfc_actor', 'Jenny (test)'); } catch (e) {} });
  await page.route((u) => u.hostname !== '127.0.0.1' && u.hostname !== 'localhost', (r) => r.abort());
  await page.goto('/admin.html');
  for (const d of '1933') await page.locator('.pin-btn', { hasText: new RegExp(`^${d}$`) }).click();
  await expect(page.locator('#app')).toBeVisible();
}
async function openStudio(page) {
  await page.evaluate(() => window.openPanel('poststudio'));
  await page.locator('.studio-entry__go').click();
  await expect(page.locator('#studio-root')).toBeVisible();
  await expect(page.locator('#studio-canvas[data-w]')).toBeVisible();
}
const act = (page) => page.locator('#studio-actions');
const status = (page) => page.locator('#studio-status');

/** Click, capture the browser download, save it, and return its bytes. */
async function download(page, locator, name) {
  const [dl] = await Promise.all([page.waitForEvent('download'), locator.click()]);
  const file = path.join(OUT, name || dl.suggestedFilename());
  await dl.saveAs(file);
  return { file, name: dl.suggestedFilename(), bytes: fs.readFileSync(file) };
}
function pngSize(b) { expect(b.readUInt32BE(0)).toBe(0x89504e47); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; }
function jpegSize(b) {
  expect(b[0]).toBe(0xff); expect(b[1]).toBe(0xd8);
  let i = 2;
  while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1], len = b.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + len; }
  return null;
}
const has = (bin) => { try { execFileSync('which', [bin], { stdio: 'ignore' }); return true; } catch (e) { return false; } };

test('Scenario C — next match from the registry, approved, exported as real PNG, JPEG, A4 PDF and ZIP', async ({ page }, testInfo) => {
  test.slow();
  await signIn(page);
  await openStudio(page);
  const insp = page.locator('.studio-inspector');
  // The facts come from the registry; nobody typed them.
  await expect(insp.locator('.studio-facts')).toContainText('North Leigh');
  await expect(insp.locator('.studio-facts')).toContainText('Combined Counties League Premier Division North');
  await expect(insp.locator('.studio-facts')).toContainText('3pm (UK time)');
  await expect(insp.locator('select[data-act="fixture"]')).toBeVisible();
  await expect(insp.getByText('From the football registry')).toBeVisible();

  // Before approval only a PROOF exists.
  await expect(act(page).getByRole('button', { name: /Download proof/ })).toBeVisible();
  await expect(act(page).getByRole('button', { name: 'PNG', exact: true })).toHaveCount(0);

  await act(page).getByRole('button', { name: 'Save draft' }).click();
  await expect(status(page)).toContainText('Saved as revision 1');
  const proof = await download(page, act(page).getByRole('button', { name: /Download proof/ }), `proof-${testInfo.project.name}.png`);
  expect(proof.name).toMatch(/-PROOF\.png$/);
  expect(pngSize(proof.bytes)).toEqual({ w: 1080, h: 1080 });

  await act(page).getByRole('button', { name: 'Ready for review' }).click();
  await expect(page.locator('.studio-sec--head')).toContainText('Ready for review');
  await act(page).getByRole('button', { name: 'Approve revision 1' }).click();
  await expect(page.locator('.studio-sec--head')).toContainText('Approved');

  if (testInfo.project.name !== 'desktop-1440') return; // the heavy export matrix runs once
  const checks = [
    ['square', 'PNG', 1080, 1080], ['portrait', 'PNG', 1080, 1350], ['story', 'PNG', 1080, 1920], ['landscape', 'PNG', 1920, 1080], ['story', 'JPEG', 1080, 1920],
  ];
  for (const [fmt, kind, w, hgt] of checks) {
    const row = act(page).locator('.studio-exrow', { hasText: new RegExp('^' + { square: 'Square', portrait: 'Portrait', story: 'Story', landscape: 'Landscape' }[fmt]) });
    const f = await download(page, row.getByRole('button', { name: kind, exact: true }));
    expect(f.name).toBe(`rlfc-next-match-north-leigh-${f.name.match(/\d{4}-\d{2}-\d{2}/)[0]}-${fmt}-${w}x${hgt}.${kind === 'PNG' ? 'png' : 'jpg'}`);
    expect(kind === 'PNG' ? pngSize(f.bytes) : jpegSize(f.bytes)).toEqual({ w, h: hgt });
    expect(f.bytes.length).toBeGreaterThan(80000);   // a real photograph-backed render, not a blank canvas
    await expect(status(page)).toContainText('Recorded in the library');
  }
  const pdf = await download(page, act(page).locator('.studio-exrow', { hasText: 'A4 PDF' }).getByRole('button', { name: 'PDF' }));
  expect(pdf.bytes.slice(0, 8).toString()).toBe('%PDF-1.4');
  expect(pdf.bytes.length).toBeGreaterThan(200000);
  await expect(status(page)).toContainText('a4-2480x3508.pdf');
  if (has('pdfinfo')) expect(execFileSync('pdfinfo', [pdf.file]).toString()).toMatch(/Page size:\s+595\.28 x 841\.89 pts \(A4\)/);
  if (has('pdftoppm')) execFileSync('pdftoppm', ['-png', '-r', '30', '-singlefile', pdf.file, path.join(OUT, 'a4-page')]);

  const zip = await download(page, act(page).getByRole('button', { name: /every format \(ZIP\)/ }));
  expect(zip.bytes.readUInt32LE(0)).toBe(0x04034b50);
  await expect(status(page)).toContainText(/5 files, .*Recorded in the library/);
  if (has('unzip')) {
    const list = execFileSync('unzip', ['-l', zip.file]).toString();
    for (const s of ['square-1080x1080.png', 'portrait-1080x1350.png', 'story-1080x1920.png', 'landscape-1920x1080.png', 'a4-2480x3508.pdf']) expect(list).toContain(s);
    expect(execFileSync('unzip', ['-t', zip.file]).toString()).toMatch(/No errors detected/);
  }
  // Every final file was recorded against the approved revision; exported ≠ published.
  const ex = h.db.studio_exports.filter((e) => !e.proof);
  expect(ex.length).toBe(7);
  expect(ex.every((e) => e.rev === 1)).toBe(true);
  expect(h.db.studio_compositions[0].state).toBe('exported');
  expect(h.db.studio_publications).toHaveLength(0);
});

test('Scenario F — interrupted work is offered back; an approved revision is never overwritten', async ({ page }) => {
  test.slow();
  await signIn(page);
  await openStudio(page);
  await act(page).getByRole('button', { name: 'Save draft' }).click();
  await expect(status(page)).toContainText('Saved as revision 1');
  await act(page).getByRole('button', { name: 'Ready for review' }).click();
  await act(page).getByRole('button', { name: 'Approve revision 1' }).click();
  await expect(page.locator('.studio-sec--head')).toContainText('Approved');

  // Edit after approval, then the session dies before saving.
  const headline = page.locator('.studio-inspector [data-field="kicker"]');
  await headline.fill('Next up');
  await expect(page.locator('.studio-note', { hasText: 'Approved revision 1 stays approved' })).toBeVisible();
  await page.waitForTimeout(200);
  page.removeAllListeners('dialog'); page.on('dialog', (d) => d.accept());
  await page.reload();
  // The HQ keeps its sign-in for the browser session; only enter it if asked.
  await page.waitForTimeout(500);
  if (!(await page.locator('#app').isVisible())) for (const d of '1933') await page.locator('.pin-btn', { hasText: new RegExp(`^${d}$`) }).click();
  await expect(page.locator('#app')).toBeVisible();
  await openStudio(page);
  const banner = page.locator('#studio-recovery');
  await expect(banner).toContainText('Unsaved work found');
  await expect(banner).toContainText('based on revision 1');
  await banner.getByRole('button', { name: 'Restore it' }).click();
  await expect(page.locator('.studio-inspector [data-field="kicker"]')).toHaveValue('Next up');

  await act(page).getByRole('button', { name: 'Save revision 2' }).click();
  await expect(status(page)).toContainText('Approved revision 1 is unchanged');
  const comp = h.db.studio_compositions[0];
  expect([comp.head_rev, comp.approved_rev]).toEqual([2, 1]);
  expect(h.db.studio_revisions.find((r) => r.rev === 1).doc.fields.kicker).toBeUndefined();
  expect(h.db.studio_revisions.find((r) => r.rev === 2).doc.fields.kicker).toBe('Next up');
  // Final files still come from revision 1 while revision 2 waits for approval.
  await expect(act(page).getByText('Final files · approved revision 1')).toBeVisible();
  await expect(act(page).getByRole('button', { name: 'Ready for review' })).toBeVisible();
});

test('Scenario D — a new sponsor logo becomes a version; older graphics keep theirs, new ones use it', async ({ page }) => {
  test.slow();
  await signIn(page);
  await openStudio(page);
  // A match-sponsor graphic made with HDL's repository logo (v1).
  await page.evaluate(() => window.StudioApp.startNew('match-sponsor'));
  await page.locator('.studio-inspector select[data-act="sponsor"]').selectOption('hdl');
  await expect(page.locator('.studio-inspector')).toContainText('Logo version 1 (current)');
  await act(page).getByRole('button', { name: 'Save draft' }).click();
  await expect(status(page)).toContainText('Saved as revision 1');

  // The sponsor sends new artwork: upload it as version 2 and approve it.
  await page.locator('.studio-tab', { hasText: 'Library' }).click();
  await page.getByRole('button', { name: 'Sponsor logos' }).click();
  const row = page.locator('tr', { hasText: 'Hanlon Dry Lining' });
  await row.locator('select[data-ground]').selectOption('dark');
  await row.locator('input[type=file]').setInputFiles(path.join(__dirname, '..', '..', 'img', 'sponsors', 'hanlon-dry-lining.png'));
  await expect(status(page)).toContainText('Uploaded as version 2');
  await expect(row).toContainText('Needs approval');
  await row.getByRole('button', { name: 'Approve as current' }).click();
  await expect(status(page)).toContainText('Existing graphics keep the version they were made with');

  // The saved graphic still records v1 and is told a newer one exists.
  await page.locator('.studio-tab', { hasText: 'Graphics' }).click();
  await page.locator('tr', { hasText: 'Match sponsor' }).getByRole('button', { name: 'Open' }).click();
  await expect(page.locator('.studio-inspector')).toContainText('Logo version 1');
  await expect(page.locator('#studio-checks')).toContainText('newer approved logo (v2)');
  expect(h.db.studio_revisions[0].doc.refs.logoVersion).toBe(1);
  // A new graphic picks up v2.
  await page.evaluate(() => window.StudioApp.startNew('new-sponsor'));
  await page.locator('.studio-inspector select[data-act="sponsor"]').selectOption('hdl');
  await expect(page.locator('.studio-inspector')).toContainText('Logo version 2 (current)');
});

test('Registry unreachable — fixture graphics wait honestly; nothing is retyped from an old file', async ({ page }) => {
  await signIn(page, { registryDown: true });
  await openStudio(page);
  await expect(status(page)).toContainText('football registry could not be reached');
  await expect(page.locator('.studio-inspector')).toContainText('nothing is retyped');
  await expect(page.locator('#studio-checks')).toContainText('Choose the fixture from the registry');
  await expect(act(page).getByRole('button', { name: 'Ready for review' })).toHaveCount(0);
});

test('Library server not set up — work is kept on this device and the Studio says so', async ({ page }) => {
  await signIn(page, { noTables: true });
  await openStudio(page);
  await page.evaluate(() => window.StudioApp.startNew('news'));
  await page.locator('.studio-inspector [data-field="headline"]').fill('Floodlit friendly confirmed');
  await act(page).getByRole('button', { name: 'Save draft' }).click();
  await expect(page.locator('#studio-mode')).toHaveText('Saved on this device only');
  await expect(status(page)).toContainText('Saved as revision 1');
});

test('Studio fits the screen — no sideways scrolling, every control reachable', async ({ page }) => {
  await signIn(page);
  await openStudio(page);
  const over = await page.evaluate(() => { const r = document.getElementById('studio-root'); return r.scrollWidth - r.clientWidth; });
  expect(over).toBeLessThanOrEqual(1);
  for (const v of ['Graphics', 'Library']) {
    await page.locator('.studio-tab', { hasText: v }).click();
    expect(await page.evaluate(() => { const r = document.getElementById('studio-root'); return r.scrollWidth - r.clientWidth; })).toBeLessThanOrEqual(1);
  }
  await page.locator('.studio-tab', { hasText: 'Create' }).click();
  await page.screenshot({ path: path.join(OUT, 'workspace-' + test.info().project.name + '.png'), fullPage: false });
});
