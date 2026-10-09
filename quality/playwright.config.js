// Rendered-page quality gates. See QUALITY.md for what each gate protects.
// @ts-check
'use strict';
const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.QUALITY_PORT || 4173);
// Use a Chromium already on the machine when the pinned one is not installed
// (CI images, the cloud sandbox). Locally: `npx playwright install chromium`.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const chromium = (extra) => ({ browserName: 'chromium', launchOptions: { executablePath }, ...extra });

module.exports = defineConfig({
  testDir: './tests',
  outputDir: './.results',
  snapshotPathTemplate: '{testDir}/__screens__/{projectName}/{arg}{ext}',
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: 0,                      // a flaky gate is a broken gate — fix it, don't retry it
  timeout: 45_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: './.report' }], ['json', { outputFile: './.results/results.json' }]],
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  use: {
    baseURL: process.env.QUALITY_BASE_URL || `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    colorScheme: 'dark',
    // The site's service worker would answer requests behind page.route()'s back
    // (stale caches, third parties). Audits must see exactly what the network gives.
    serviceWorkers: 'block',
  },
  webServer: process.env.QUALITY_BASE_URL ? undefined : {
    command: `node server.js ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'desktop-1440',     use: chromium({ viewport: { width: 1440, height: 900 } }) },
    { name: 'laptop-1280',      use: chromium({ viewport: { width: 1280, height: 720 } }) },
    { name: 'tablet-portrait',  use: chromium({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }) },
    { name: 'tablet-landscape', use: chromium({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }) },
    { name: 'phone',            use: chromium({ ...devices['Pixel 7'], browserName: 'chromium', launchOptions: { executablePath } }) },
    { name: 'phone-landscape',  use: chromium({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }) },
    { name: 'phone-small',      use: chromium({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }) },
    // Galaxy Z Fold class: the narrow cover screen and the near-square inner screen.
    { name: 'fold-folded',      use: chromium({ viewport: { width: 344, height: 882 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }) },
    { name: 'fold-open',        use: chromium({ viewport: { width: 884, height: 1104 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true }) },
    // Real Safari engine. Opt-in because it needs `npx playwright install webkit`.
    ...(process.env.QUALITY_WEBKIT ? [{ name: 'webkit-iphone', use: { ...devices['iPhone 15'] } }] : []),
  ],
});
