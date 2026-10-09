// Shared plumbing for the rendered-page gates.
'use strict';
const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');

const BASELINES = path.join(__dirname, '..', 'baselines');
const FIXTURE_DATA = path.join(__dirname, '..', 'fixtures', 'data');
const UPDATE = !!process.env.QUALITY_UPDATE_BASELINES;
const SITE_HOST = new URL(process.env.QUALITY_BASE_URL || `http://127.0.0.1:${process.env.QUALITY_PORT || 4173}`).host;

/** Pre-answer the cookie banner so it doesn't sit over every audit. Declined = no analytics requests. */
async function presetConsent(page, analytics = false) {
  await page.addInitScript((a) => {
    try { localStorage.setItem('rlfc_consent_v2', JSON.stringify({ analytics: a, essential: true, decidedAt: '2026-01-01T00:00:00.000Z', source: 'quality', version: 2 })); } catch (e) {}
  }, analytics);
}

/**
 * Serve data/*.json from the frozen copy in fixtures/data so a screenshot diff
 * means the DESIGN moved, not that the committee added a fixture. Refreshed by
 * `npm run test:visual:update`.
 */
async function freezeData(page) {
  if (!fs.existsSync(FIXTURE_DATA)) return;
  await page.route(/\/data\/[^/?]+\.json(\?.*)?$/, (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    const f = path.join(FIXTURE_DATA, name);
    return fs.existsSync(f) ? route.fulfill({ path: f, contentType: 'application/json' }) : route.continue();
  });
}

/**
 * Open a page the way a supporter does and wait until it has actually
 * rendered: network quiet, web fonts in, two frames painted. Collects page
 * errors and failed same-origin requests on the way.
 */
async function open(page, url, opts = {}) {
  const problems = { pageErrors: [], failed: [] };
  page.on('pageerror', (e) => problems.pageErrors.push(String(e.message || e).slice(0, 200)));
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (u.host !== SITE_HOST) return;                                   // third parties aren't ours to gate
    if (u.pathname.startsWith('/.netlify/functions/')) return;      // stubbed locally by design
    if (r.status() >= 400 && !/favicon/.test(u.pathname)) problems.failed.push(`${r.status()} ${u.pathname}`);
  });
  if (!opts.keepBanner) await presetConsent(page);
  if (opts.freeze) await freezeData(page);
  // Third-party scripts (CDNs, analytics, embeds) are not ours to audit and
  // make runs non-deterministic. Opt back in with QUALITY_THIRD_PARTY=1.
  if (!process.env.QUALITY_THIRD_PARTY) {
    await page.route((u) => /^https?:$/.test(u.protocol) && u.host !== SITE_HOST, (r) => r.abort());
  }
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return problems;
}

/**
 * The ratchet. Existing debt is recorded in baselines/<gate>/<project>/<page>.json;
 * a run fails only if it finds an issue that is NOT in the baseline. Fixing an
 * issue never fails a run — re-baseline to lock the improvement in.
 * QUALITY_UPDATE_BASELINES=1 rewrites the baseline from this run.
 */
function ratchet(testInfo, gate, pageName, findings) {
  const keys = [...new Set(findings.map((f) => typeof f === 'string' ? f : f.key))].sort();
  const file = path.join(BASELINES, gate, testInfo.project.name, pageName + '.json');
  if (UPDATE) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(keys, null, 1) + '\n');
    return;
  }
  const known = fs.existsSync(file) ? new Set(JSON.parse(fs.readFileSync(file, 'utf8'))) : new Set();
  const fresh = keys.filter((k) => !known.has(k));
  const fixed = [...known].filter((k) => !keys.includes(k));
  if (fixed.length) testInfo.annotations.push({ type: 'fixed', description: `${fixed.length} baseline issue(s) gone — re-baseline to lock in: ${fixed.slice(0, 5).join(' | ')}` });
  if (keys.length) testInfo.annotations.push({ type: 'debt', description: `${keys.length} known issue(s) (baselined)` });
  expect(fresh, `NEW ${gate} issues on ${pageName} [${testInfo.project.name}] — fix them, or re-baseline only if it is a deliberate, reviewed choice`).toEqual([]);
}

/** Short, stable CSS-ish label for an element, used as a finding key. */
const LABEL_FN = `function __label(el){
  if(!el||!el.tagName) return '?';
  var s=el.tagName.toLowerCase();
  if(el.id) return s+'#'+el.id;
  var c=(el.getAttribute('class')||'').trim().split(/\\s+/).filter(Boolean).slice(0,2).join('.');
  var p=el.parentElement, pl='';
  if(p){ pl=p.id? p.tagName.toLowerCase()+'#'+p.id : p.tagName.toLowerCase()+((p.getAttribute('class')||'').trim()? '.'+(p.getAttribute('class')||'').trim().split(/\\s+/)[0]:''); }
  return (pl? pl+' > ':'')+s+(c?'.'+c:'');
}`;

module.exports = { open, ratchet, presetConsent, freezeData, LABEL_FN, UPDATE };
