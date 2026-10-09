---
name: lane-responsive-audit
description: Responsive and device audit of the rendered Rayners Lane FC site across desktop, laptop, tablet (both orientations), phones, foldables (cover + open) and touch/keyboard input. Use after layout/CSS changes or when a page "looks wrong on my phone/tablet".
---

# Lane responsive audit

Audit what renders, not what the CSS says.

## Run
```
cd quality
npx playwright test responsive                       # every page × 8 device classes
npx playwright test responsive --grep fixtures       # one page
npx playwright test responsive --project=fold-folded # one device class
QUALITY_WEBKIT=1 npx playwright test responsive --project=webkit-iphone   # real Safari engine (needs: npx playwright install webkit)
```
Device classes (`playwright.config.js`): desktop-1440, laptop-1280, tablet-portrait 768,
tablet-landscape 1180, phone (Pixel 7), phone-small 375, fold-folded 344, fold-open 884.

## What fails
Hard: JS errors while rendering, same-origin files 404ing.
Ratcheted (new issues fail): sideways page scroll, elements poking past the right
edge, touch targets < 24px on touch devices, text < 12px.

## Investigate
Open `quality/.report/index.html`; each failure has a screenshot and trace
(`npx playwright show-trace <zip>`). For fixes, vendored `impeccable` → `adapt`.
Fix with fluid tokens (`clamp`, the `--fs-*` scale), not new breakpoints per device.
After a deliberate fix, lock it in: `QUALITY_UPDATE_BASELINES=1 npx playwright test responsive`.
