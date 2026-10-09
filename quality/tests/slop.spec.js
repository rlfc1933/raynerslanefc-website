// AI-SLOP + DESIGN-DRIFT GATE — on the rendered page.
//
// Two detectors, both ratcheted (existing findings baselined, new ones fail):
//  1. impeccable's deterministic anti-pattern rules (vendored, pinned, local-only:
//     .claude/skills/impeccable/scripts/detector/detect-antipatterns-browser.js) —
//     gradient text, glow halos, side-tab borders, bounce easing, nested cards,
//     generic fonts, low contrast, and ~50 more generated-UI tells.
//  2. Lane design-system drift: computed values that are not in the token set —
//     off-palette colours, font families other than Bebas Neue / Manrope,
//     radii off the --r-* scale. Every new value must come from css/fonts.css or
//     css/style.css tokens, or be added there deliberately.
'use strict';
const path = require('path');
const { test } = require('@playwright/test');
const { PUBLIC_PAGES } = require('../pages');
const { open, ratchet, LABEL_FN } = require('./_helpers');

const DETECTOR = path.join(__dirname, '..', '..', '.claude', 'skills', 'impeccable', 'scripts', 'detector', 'detect-antipatterns-browser.js');
const SLOP_PROJECTS = ['desktop-1440', 'phone'];

// The approved palette (css/style.css :root) — compared on RGB, any alpha.
const PALETTE = ['#FFD100', '#C9A200', '#1A5C32', '#236B3C', '#080808', '#0E0E0E', '#141414', '#1A1A1A', '#242424',
  '#F5F3ED', '#8F8F8F', '#AAAAAA', '#9A9A92', '#FFFFFF', '#000000',
  // semantic (brand/tokens.css): result + card colours, print ink
  '#777777', '#22C55E', '#EF4444', '#FFCB05', '#E5341F', '#111111', '#555555', '#E2E2E2', '#0D0D0D'];
const RADII = [0, 4, 6, 10, 14, 20];   // --r-xs … --r-xl ; pill and circle handled separately
const FONTS = /bebas neue|manrope|system-ui|-apple-system|segoe ui|arial narrow|monospace|ui-monospace|sf mono|menlo|consolas/i;

for (const pg of PUBLIC_PAGES) {
  test(`slop · ${pg.name}`, async ({ page }, testInfo) => {
    test.skip(!SLOP_PROJECTS.includes(testInfo.project.name));
    await page.addInitScript(() => { window.__IMPECCABLE_CONFIG__ = { autoScan: false }; });
    await open(page, pg.path);
    await page.addScriptTag({ path: DETECTOR });

    const imp = await page.evaluate(async () => {
      const fn = window.impeccableDetectAsync || window.impeccableDetect;
      if (!fn) return { error: 'detector not loaded' };
      const res = await fn();
      const list = Array.isArray(res) ? res : (res && (res.findings || res.results)) || [];
      const flat = [];
      for (const g of list) for (const f of (g.findings || [g])) flat.push({ id: f.type || f.antipattern || f.id, sev: f.severity, el: g.selector || '' });
      return flat;
    });
    const findings = [];
    if (imp.error) findings.push('detector-failed');
    else for (const f of imp) findings.push(`impeccable:${f.id}:${String(f.el).replace(/:nth-of-type\(\d+\)/g, '').slice(0, 80)}`);

    const drift = await page.evaluate(({ PALETTE, RADII, FONTS, LABEL }) => {
      const label = new Function('return ' + LABEL)();
      const hex = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a] = m[1].split(/[ ,/]+/).map(Number); if (a === 0) return null; return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase(); };
      const pal = new Set(PALETTE);
      const near = (h) => [...pal].some((p) => { const d = [1, 3, 5].reduce((s, i) => s + Math.abs(parseInt(p.substr(i, 2), 16) - parseInt(h.substr(i, 2), 16)), 0); return d <= 6; });
      const out = new Set();
      for (const el of document.body.querySelectorAll('*')) {
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
        if (el.closest('svg, img, video, canvas, iframe, [data-brand], [class*="crest"], [class*="sponsor"], [class*="partner"]')) continue;   // third-party brand colours are not ours to police
        const cs = getComputedStyle(el);
        for (const prop of ['color', 'backgroundColor', 'borderTopColor']) {
          if (prop === 'borderTopColor' && parseFloat(cs.borderTopWidth) === 0) continue;
          const h = hex(cs[prop]); if (h && !near(h)) out.add(`off-palette:${h}:${prop}`);
        }
        const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
        if (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !new RegExp(FONTS, 'i').test(fam)) out.add(`off-font:${fam}`);
        const rad = parseFloat(cs.borderTopLeftRadius);
        if (rad && !cs.borderTopLeftRadius.includes('%') && rad < 500 && !RADII.includes(Math.round(rad)) && Math.round(rad) !== Math.round(Math.min(r.width, r.height) / 2)) out.add(`off-radius:${Math.round(rad)}px:${label(el)}`);
      }
      return [...out];
    }, { PALETTE, RADII, FONTS: FONTS.source, LABEL: LABEL_FN });
    findings.push(...drift);
    ratchet(testInfo, 'slop', pg.name, findings);
  });
}
