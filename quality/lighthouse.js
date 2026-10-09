// LIGHTHOUSE GATE — lab scores for the tier-1 pages, mobile + desktop.
//
//   node lighthouse.js                       against the local server (starts it)
//   QUALITY_BASE_URL=https://deploy-preview-12--site.netlify.app node lighthouse.js
//
// Accessibility, Best Practices and SEO are judged anywhere. PERFORMANCE is only
// judged against a real Netlify URL (QUALITY_BASE_URL): the local server has no
// CDN, compression or image resizing, so a local perf score would be fiction.
// Reports: .results/lighthouse/<page>-<form>.html
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { PUBLIC_PAGES } = require('./pages');

const BUDGET = { accessibility: 0.95, 'best-practices': 0.9, seo: 0.95, performance: 0.8 };
const OUT = path.join(__dirname, '.results', 'lighthouse');
const PORT = Number(process.env.QUALITY_PORT || 4173);
const REMOTE = process.env.QUALITY_BASE_URL;
const BASE = REMOTE || `http://127.0.0.1:${PORT}`;

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.env.PW_CHROMIUM_PATH) return process.env.PW_CHROMIUM_PATH;
  try { return require('@playwright/test').chromium.executablePath(); } catch (e) { return undefined; }
}

(async () => {
  const { default: lighthouse } = await import('lighthouse');
  const chromeLauncher = await import('chrome-launcher');
  fs.mkdirSync(OUT, { recursive: true });
  let server;
  if (!REMOTE) { server = spawn(process.execPath, [path.join(__dirname, 'server.js'), String(PORT)], { stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 600)); }
  const chrome = await chromeLauncher.launch({ chromePath: chromePath(), chromeFlags: ['--headless=new', '--no-sandbox'] });
  const fails = []; const rows = [];
  const cats = REMOTE ? Object.keys(BUDGET) : Object.keys(BUDGET).filter((c) => c !== 'performance');
  try {
    for (const pg of PUBLIC_PAGES.filter((p) => p.tier === 1)) {
      for (const form of ['mobile', 'desktop']) {
        const cfg = form === 'desktop' ? (await import('lighthouse/core/config/desktop-config.js')).default : undefined;
        const r = await lighthouse(BASE + pg.path, { port: chrome.port, output: 'html', onlyCategories: cats, logLevel: 'error' }, cfg);
        fs.writeFileSync(path.join(OUT, `${pg.name}-${form}.html`), r.report);
        const row = { page: pg.name, form };
        for (const c of cats) {
          const s = r.lhr.categories[c].score; row[c] = Math.round(s * 100);
          if (s < BUDGET[c]) fails.push(`${pg.name} ${form} ${c} ${Math.round(s * 100)} < ${BUDGET[c] * 100}`);
        }
        rows.push(row);
      }
    }
  } finally { await chrome.kill(); if (server) server.kill(); }
  console.table(rows);
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ base: BASE, rows, fails }, null, 1));
  if (!REMOTE) console.log('Performance not scored locally — set QUALITY_BASE_URL to a Netlify deploy preview.');
  if (fails.length) { console.error('\nLighthouse budget failures:\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('\nLighthouse budgets met.');
})().catch((e) => { console.error(e); process.exit(1); });
