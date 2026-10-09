// ACCESSIBILITY GATE — axe-core against WCAG 2.0/2.1/2.2 A + AA on the
// rendered page, plus the keyboard basics axe can't see.
'use strict';
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { PUBLIC_PAGES, STAFF_PAGES, A11Y_PROJECTS } = require('../pages');
const { open, ratchet } = require('./_helpers');

for (const pg of [...PUBLIC_PAGES, ...STAFF_PAGES]) {
  test(`a11y · ${pg.name}`, async ({ page }, testInfo) => {
    test.skip(!A11Y_PROJECTS.includes(testInfo.project.name), 'a11y runs on desktop-1440 + phone');
    await open(page, pg.path);
    const res = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const findings = [];
    for (const v of res.violations) {
      for (const n of v.nodes) findings.push(`${v.impact}:${v.id}:${n.target.join(' ').slice(0, 120)}`);
    }
    await testInfo.attach('axe.json', { body: JSON.stringify(res.violations, null, 1), contentType: 'application/json' });
    ratchet(testInfo, 'a11y', pg.name, findings);
  });
}

// Keyboard: the first Tab must land on something visible with a visible focus
// indicator, and the skip link must move focus into the main content.
for (const pg of PUBLIC_PAGES.filter((p) => p.tier === 1)) {
  test(`keyboard · ${pg.name}`, async ({ page }, testInfo) => {
    test.skip(!A11Y_PROJECTS.includes(testInfo.project.name) || testInfo.project.name === 'phone', 'keyboard runs on desktop');
    await open(page, pg.path);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(350);   // let a sliding skip link finish arriving
    const first = await page.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return null;
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none';
      return { id: el.id, cls: el.className, ring, onScreen: r.width > 0 && r.height > 0 && r.top >= 0 && r.top < innerHeight };
    });
    expect(first, 'Tab focuses nothing').not.toBeNull();
    expect(first.onScreen, 'first focused element is off-screen').toBe(true);
    expect(first.ring, 'first focused element shows no focus indicator').toBe(true);
    if (first.id === 'lane-skip') {
      await page.keyboard.press('Enter');
      const inMain = await page.evaluate(() => !!document.activeElement.closest('main, [role=main], #main'));
      expect(inMain, 'skip link does not move focus into main content').toBe(true);
    }
  });
}
