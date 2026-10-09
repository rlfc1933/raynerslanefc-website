// RESPONSIVE GATE — every page × every device class (desktop → folded phone).
// Hard failures: script errors, missing same-origin files.
// Ratcheted (no NEW issues): sideways scroll, clipped/overflowing elements,
// touch targets under 24px (WCAG 2.2 AA 2.5.8) on touch devices, text under 12px.
'use strict';
const { test, expect } = require('@playwright/test');
const { PUBLIC_PAGES, STAFF_PAGES, TOUCH_PROJECTS } = require('../pages');
const { open, ratchet, LABEL_FN } = require('./_helpers');

for (const pg of [...PUBLIC_PAGES, ...STAFF_PAGES]) {
  test(`responsive · ${pg.name}`, async ({ page }, testInfo) => {
    const problems = await open(page, pg.path);
    const touch = TOUCH_PROJECTS.includes(testInfo.project.name);

    const findings = await page.evaluate(({ touch, LABEL }) => {
      const label = new Function('return ' + LABEL)();
      const out = [];
      const vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > vw + 1) out.push(`page-scrolls-sideways:${document.documentElement.scrollWidth - vw}px`);
      const visible = (el, r) => {
        if (r.width === 0 || r.height === 0) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
      };
      // Something poking past the right edge of the screen (and not inside a deliberate scroller).
      const inScroller = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true; } return false; };
      for (const el of document.body.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (!visible(el, r)) continue;
        if (r.right > vw + 2 && r.left < vw && !inScroller(el) && getComputedStyle(el).position !== 'fixed') out.push(`overflows-right:${label(el)}`);
      }
      // Interactive targets.
      if (touch) {
        for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [tabindex]:not([tabindex="-1"])')) {
          const r = el.getBoundingClientRect();
          if (!visible(el, r)) continue;
          // Inline links inside a sentence are exempt from 2.5.8.
          if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && /P|LI|SPAN|TD/.test(el.parentElement.tagName)) continue;
          if (r.width < 24 || r.height < 24) out.push(`touch-target-under-24px:${label(el)}`);
        }
      }
      // Text too small to read.
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seen = new Set();
      while (walker.nextNode()) {
        const t = walker.currentNode; const el = t.parentElement;
        if (!el || seen.has(el) || !t.textContent.trim()) continue; seen.add(el);
        const r = el.getBoundingClientRect(); if (!visible(el, r)) continue;
        if (parseFloat(getComputedStyle(el).fontSize) < 12) out.push(`text-under-12px:${label(el)}`);
      }
      return out;
    }, { touch, LABEL: LABEL_FN });

    expect(problems.pageErrors, 'JavaScript errors while rendering').toEqual([]);
    expect(problems.failed, 'same-origin files that failed to load').toEqual([]);
    ratchet(testInfo, 'responsive', pg.name, findings);
  });
}
