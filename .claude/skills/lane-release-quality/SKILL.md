---
name: lane-release-quality
description: Release gate for the Rayners Lane FC site. Use before ANY deploy, push to main, or "ship it" — runs unit/contract tests, fixture integrity, all rendered gates (responsive, a11y, keyboard, visual, journeys, motion, images, slop) and Lighthouse budgets, and decides go/no-go.
---

# Lane release quality

Nothing deploys unless this passes. Netlify deploys every push to `main`, so
"don't deploy" means "don't push to main".

## Run
```
cd quality && npm ci            # first time: also `npx playwright install chromium`
npm run gate                    # local server, everything except real performance
QUALITY_BASE_URL=https://deploy-preview-<n>--<site>.netlify.app npm run gate   # + performance, on a real Netlify build
```
Gate steps: 1) `npm test` at repo root — no failures beyond `quality/known-failures.json`
(that list may only shrink); 2) fixture integrity; 3) Playwright rendered gates;
4) Lighthouse: a11y ≥ 95, best-practices ≥ 90, SEO ≥ 95, performance ≥ 80 (remote only).

## Go / no-go
- **GO** only on `GATE PASSED`. Report the summary lines to the user.
- **FAIL** → fix, don't re-baseline. Re-baselining (`QUALITY_UPDATE_BASELINES=1`,
  `test:visual:update`) is allowed only for a deliberate, reviewed change, in the
  same commit, with the reason in the message.
- Staff HQ / Netlify function changes: also run the relevant `tests/*.test.js` and
  confirm env vars the change depends on exist in Netlify.
- Then follow vendored `shipping-and-launch` (pre-launch checklist, rollback plan)
  and `code-review-and-quality` for the diff review.

## After deploy
Smoke the live URL: home, fixtures, one news article, Staff HQ sign-in.
`QUALITY_BASE_URL=https://raynerslanefc.co.uk npx playwright test journeys --project=phone`.

## Acceptance rule (club addendum)
No significant feature is "done" without: a defined user and purpose; a complete
end-to-end journey; success, error and recovery states; clear ownership where
someone else must act; correct authorisation and privacy; public ↔ HQ
consistency; mobile and accessibility; and a passing journey test proving the
real outcome (see `lane-behaviour-first`).
