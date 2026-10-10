---
name: rayners-release-visual-gate
description: Runs the go/no-go for any Rayners Lane release that touches UI — unit tests, HQ scenarios, responsive/a11y/slop/motion gates and a screenshot review at the eight standard widths. Use before committing UI work as finished, before any push to main or deploy, and when someone says "ship it".
---

# Rayners release visual gate

## Purpose
Nothing visual ships on code inspection alone. One command sequence, one
decision, recorded with evidence.

## Trigger conditions
UI changes to `admin.html`, `css/*`, `js/hq-*`, public pages, Asset Studio, `sw.js`.

## Inputs
The diff; `quality/known-failures.json`; `quality/baselines/` (the ratchet).

## Steps
1. Unit: `npm test` — only the entries in `quality/known-failures.json` may fail.
2. Scenarios: `cd quality && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test hq.spec.js`
   (all HQ journeys incl. "Lane HQ A/B/E/G").
3. Rendered gates for touched pages:
   `npx playwright test responsive a11y slop motion images journeys -g "<page>"`.
   Fix NEW findings you caused; record pre-existing debt, don't hide it.
   `visual` goldens differ on intentionally redesigned pages — review, then
   accept with `npm run test:visual:update` only when the change is intended.
4. Screenshots: 360, 390, 430, 768, 1024, 1280, 1440, 1920 of each changed
   screen and state; read them (`rayners-visual-critic`). Zero horizontal overflow.
5. PWA: if HQ code changed, `sw.js` `VERSION` + `CACHE` bumped (`rayners-pwa-reliability`).
6. Honesty check: no fabricated data, no claims of sends/publishes/exports that
   did not happen, no confidential club circumstances in copy, code or comments.
7. Decide GO / NO-GO; write the evidence (tests run, widths viewed) in the commit.
   Migrations are written, never applied to production from here; list them.

## Dependencies
`lane-release-quality`, `rayners-visual-critic`, `rayners-behaviour-auditor`,
`rayners-pwa-reliability`.

## Expected outputs
A GO/NO-GO line with evidence; no untracked failing gate.

## Failure conditions (NO-GO)
New unit failure; any HQ scenario failing; new axe violation; new overflow or
<24px target; off-token colour/radius; unbumped `sw.js` after HQ code change;
screenshots not reviewed.

## Test requirements
This skill IS the test run; its output is the evidence list above.
