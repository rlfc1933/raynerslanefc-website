// MOTION GATE — motion must mean something, finish quickly, and stop when asked.
//
//  1. prefers-reduced-motion: reduce → after load and a scroll, nothing may be
//     moving except opacity/colour cross-fades of ≤ 200ms. (Hard failure.)
//  2. Normal motion: one-shot UI animations/transitions longer than 700ms, and
//     bounce/elastic easings, are ratcheted. Infinite loops are ratcheted too:
//     each one must be a deliberate status signal (e.g. the LIVE pulse).
//  3. Layout stability: cumulative layout shift during load must stay < 0.1
//     on the tier-1 pages (Core Web Vitals "good").
'use strict';
const { test, expect } = require('@playwright/test');
const { PUBLIC_PAGES } = require('../pages');
const { open, ratchet } = require('./_helpers');

const MOTION_PROJECTS = ['desktop-1440', 'phone'];

async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
    scrollTo(0, 0); await new Promise((r) => setTimeout(r, 120));
  });
}

const COLLECT = `(() => {
  const out = [];
  for (const a of document.getAnimations()) {
    const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
    const el = a.effect && a.effect.target;
    const kf = a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : [];
    const props = [...new Set(kf.flatMap(k => Object.keys(k)).filter(k => !['offset','easing','composite','computedOffset'].includes(k)))];
    const name = a.animationName || a.transitionProperty || a.id || 'waapi';
    const who = el ? (el.id ? '#'+el.id : el.tagName.toLowerCase()+'.'+String(el.className||'').split(' ')[0]) : '?';
    out.push({ name, who, state: a.playState, duration: Number(t.duration)||0, iterations: t.iterations, easing: t.easing||'', props });
  }
  return out;
})()`;

for (const pg of PUBLIC_PAGES) {
  test(`motion · reduced · ${pg.name}`, async ({ page }, testInfo) => {
    test.skip(!MOTION_PROJECTS.includes(testInfo.project.name));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, pg.path);
    await scrollThrough(page);
    const anims = await page.evaluate(COLLECT);
    const moving = anims.filter((a) => a.state === 'running' && (
      a.iterations === Infinity ||
      a.duration > 200 ||
      a.props.some((p) => !/opacity|color|background|border|outline|box-shadow|fill|stroke/i.test(p))
    ));
    expect(moving.map((a) => `${a.who} ${a.name} ${a.duration}ms×${a.iterations} [${a.props}]`),
      'still moving under prefers-reduced-motion').toEqual([]);
  });

  test(`motion · direction · ${pg.name}`, async ({ page }, testInfo) => {
    test.skip(!MOTION_PROJECTS.includes(testInfo.project.name));
    await page.addInitScript(() => {
      window.__cls = 0;
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
    });
    await open(page, pg.path);
    const anims = await page.evaluate(COLLECT);
    await scrollThrough(page);
    const after = await page.evaluate(COLLECT);
    const all = [...anims, ...after];
    const findings = [];
    for (const a of all) {
      if (a.iterations === Infinity) findings.push(`infinite-loop:${a.who}:${a.name}`);
      else if (a.duration > 700) findings.push(`slow-ui-motion:${a.who}:${a.name}:${a.duration}ms`);
      if (/cubic-bezier\([^)]*,\s*-|cubic-bezier\([^)]*,\s*1\.[1-9]/.test(a.easing) && a.props.some((p) => /transform|translate|scale/.test(p))) findings.push(`overshoot-easing:${a.who}:${a.name}`);
    }
    const cls = await page.evaluate(() => window.__cls);
    if (pg.tier === 1) expect(cls, `layout shift during load (CLS) on ${pg.name}`).toBeLessThan(0.1);
    else if (cls >= 0.1) findings.push(`cls-over-0.1`);
    ratchet(testInfo, 'motion', pg.name, findings);
  });
}
