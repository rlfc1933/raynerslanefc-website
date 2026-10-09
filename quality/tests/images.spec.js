// IMAGE-QUALITY GATE — judged on the rendered page, at the real device pixel ratio.
//
// Hard failures: broken images; <img> without an alt attribute.
// Ratcheted:
//   under-resolved  — source has < 1× the pixels it is drawn at (looks soft)
//   oversized       — source has > 3× the pixels needed (wasted bytes)
//   heavy           — a single image over 350 KB on the wire
//   no-dimensions   — no width/height or aspect-ratio → layout shift while loading
//   distorted       — drawn at a different aspect ratio than the file without object-fit
//   eager-offscreen — below the first screen but not loading="lazy"
// Locally the Netlify Image CDN is bypassed, so sizes are judged on the SOURCE
// asset — stricter than production, which is the right side to err on.
'use strict';
const { test, expect } = require('@playwright/test');
const { PUBLIC_PAGES } = require('../pages');
const { open, ratchet, LABEL_FN } = require('./_helpers');

const IMG_PROJECTS = ['desktop-1440', 'phone'];

for (const pg of PUBLIC_PAGES) {
  test(`images · ${pg.name}`, async ({ page }, testInfo) => {
    test.skip(!IMG_PROJECTS.includes(testInfo.project.name));
    const bytes = new Map();
    page.on('response', async (r) => {
      if (r.request().resourceType() !== 'image') return;
      const len = Number(r.headers()['content-length'] || 0) || (await r.body().catch(() => Buffer.alloc(0))).length;
      bytes.set(r.url(), len);
    });
    await open(page, pg.path);
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += innerHeight) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); } scrollTo(0, 0); });
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});

    const imgs = await page.evaluate((LABEL) => {
      const label = new Function('return ' + LABEL)();
      const dpr = devicePixelRatio || 1;
      return [...document.images].map((im) => {
        const r = im.getBoundingClientRect(); const cs = getComputedStyle(im);
        return {
          who: label(im), src: im.currentSrc || im.src, hasAlt: im.hasAttribute('alt'),
          broken: im.complete && im.naturalWidth === 0 && !!(im.currentSrc || im.src) && cs.display !== 'none',
          nw: im.naturalWidth, nh: im.naturalHeight, w: r.width, h: r.height, dpr,
          shown: r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none',
          dims: (im.getAttribute('width') && im.getAttribute('height')) || cs.aspectRatio !== 'auto',
          fit: cs.objectFit, lazy: im.loading === 'lazy', docTop: r.top + scrollY,
          svg: /\.svg(\?|$)/i.test(im.currentSrc || im.src),
        };
      });
    }, LABEL_FN);

    const hard = []; const findings = [];
    const vh = page.viewportSize().height;
    for (const i of imgs) {
      if (!i.hasAlt) hard.push(`no-alt:${i.who}`);
      if (i.broken) hard.push(`broken:${i.who}:${i.src.slice(-60)}`);
      if (!i.shown || i.svg || !i.nw) continue;
      const need = i.w * i.dpr;
      if (i.nw < need * 0.98 && i.nw < 2400) findings.push(`under-resolved:${i.who}`);
      if (i.nw > need * 3 && i.nw > 800) findings.push(`oversized:${i.who}`);
      if (!i.dims) findings.push(`no-dimensions:${i.who}`);
      const ar = i.nw / i.nh, drawn = i.w / i.h;
      if (Math.abs(ar - drawn) / ar > 0.04 && !/cover|contain|scale-down/.test(i.fit)) findings.push(`distorted:${i.who}`);
      if (i.docTop > vh * 1.2 && !i.lazy) findings.push(`eager-offscreen:${i.who}`);
      const b = bytes.get(i.src); if (b > 350 * 1024) findings.push(`heavy:${i.src.split('/').pop().split('?')[0]}`);
    }
    expect(hard, 'broken images / images with no alt attribute').toEqual([]);
    ratchet(testInfo, 'images', pg.name, findings);
  });
}
