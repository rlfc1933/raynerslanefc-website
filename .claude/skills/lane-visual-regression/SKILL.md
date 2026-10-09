---
name: lane-visual-regression
description: Visual-regression workflow for the Rayners Lane FC site — compare rendered tier-1 pages against committed golden screenshots on desktop, tablet and phone, review diffs, and accept intended changes. Use after any CSS/HTML/JS change that could alter appearance, and before deploys.
---

# Lane visual regression

## Run
```
cd quality
npm run test:visual            # compare against tests/__screens__/<device>/<page>.png
```
Captures are deterministic: data is served from `quality/fixtures/data` (frozen copy
of `data/*.json`), the clock is fixed to Sat 15 Aug 2026 12:00 BST, motion is disabled,
third-party requests are blocked, and volatile regions (countdowns, live tiles,
sponsor rail, canvas/video/iframes) are masked (`pages.js → VOLATILE`).

## Review a diff
`npx playwright show-report .report` → each failure shows expected / actual / diff.
Decide: **regression** → fix the code. **Intended** → a human looks at every
changed image, then:
```
npm run test:visual:update     # rewrites goldens AND re-freezes fixtures/data
```
Commit goldens with the change that caused them, never separately, and say why in
the commit message. Never update goldens to make a red run green without looking.

Goldens are rendered by Chromium on Linux; fonts rasterise differently on macOS, so
generate/compare goldens in the same environment (CI or the Linux sandbox).
