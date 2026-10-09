// VISUAL-REGRESSION GATE — full-page screenshots of the tier-1 pages on
// desktop, tablet and phone, against committed goldens in tests/__screens__/.
// Data is frozen (fixtures/data) and volatile regions are masked, so a diff
// means the design moved. Motion is disabled for the capture.
//
//   npm run test:visual            compare
//   npm run test:visual:update     accept the current rendering as the new golden
//                                  (only after a human has looked at the diff)
'use strict';
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { PUBLIC_PAGES, VOLATILE, VISUAL_PROJECTS } = require('../pages');
const { open, UPDATE } = require('./_helpers');

// Refreshing goldens also refreshes the frozen data they were taken with.
test.beforeAll(() => {
  if (!process.argv.includes('--update-snapshots') && !process.argv.includes('-u') && !UPDATE) return;
  const src = path.join(__dirname, '..', '..', 'data');
  const dst = path.join(__dirname, '..', 'fixtures', 'data');
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) if (f.endsWith('.json')) fs.copyFileSync(path.join(src, f), path.join(dst, f));
});

for (const pg of PUBLIC_PAGES.filter((p) => p.tier === 1)) {
  test(`visual · ${pg.name}`, async ({ page }, testInfo) => {
    test.skip(!VISUAL_PROJECTS.includes(testInfo.project.name), 'visual runs on desktop-1440, tablet-portrait, phone');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.setFixedTime(new Date('2026-08-15T12:00:00+01:00'));   // a fixed Saturday in season
    await open(page, pg.path, { freeze: true });
    await expect(page).toHaveScreenshot(`${pg.name}.png`, {
      fullPage: true,
      mask: VOLATILE.map((s) => page.locator(s)),
      timeout: 20_000,
    });
  });
}
