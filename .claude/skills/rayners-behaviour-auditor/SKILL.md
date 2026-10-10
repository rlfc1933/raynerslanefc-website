---
name: rayners-behaviour-auditor
description: Proves Rayners Lane features with realistic end-to-end scenarios — chairman with five minutes, administrator updating a fixture-related record, volunteer on a phone, update arriving mid-edit, supporter journeys — through the real UI, real Netlify functions and an in-memory database. Use when a feature is "done", when a bug report describes a journey, and when adding any HQ workflow.
---

# Rayners behaviour auditor

## Purpose
A feature is finished when a real person completes the real outcome and the
records prove it — not when the page renders.

## Trigger conditions
- Any new or changed HQ workflow, form, status, notification or priority rule.
- A bug report phrased as a journey ("I marked it done and it came back").
- Before `rayners-release-visual-gate`.

## Inputs
- `lane-behaviour-first` answers (who, trigger, expectation, failure, owner).
- Harness: `quality/tests/support/hq-harness.js`
  - `setupHq(page, { mdops, members, submissions, programme, tasks, clubOffice })`
    routes the REAL `club-os` and `football-data` functions to the in-memory DB
    (`support/fake-supabase.js`), seeds a football registry relative to TODAY in
    Europe/London (postponed rows, registry results, historic home matches) and
    club-office records (late enquiry, proposal, unpaid invoice, review, overdue task).
  - `signIn(page, open)` — PIN 1933 → temporary committee access → Command Centre.
  - Returns `{ db, F, restore }` — assert on `db.hq_items`, `db.hq_audit`; mutate
    `F.<fixture>.scheduled_kickoff_at` to simulate the league moving a game.

## Standard scenarios (keep green; extend, don't fork)
| ID | Person / moment | Must prove |
|---|---|---|
| A | Chairman, five minutes | Needs doing / Money in / Supporters visible first; next match from registry ("Tomorrow", never stale fixtures.json); grouped "N fixtures need reconciliation"; no false "result not recorded"; nothing critical; bell = groups; read ≠ resolved |
| B | Administrator, fixture record | Checklist created once (idempotent), assign + done persisted and audited; fixture moves → one "has moved" priority → dates corrected → no old date anywhere |
| E | Phone user | No sideways scroll; tab bar ≥44px; menu → search → destination; table stacks; save visible in place |
| G | Update mid-edit | No bar on first install; one bar per version; refuses reload over unsaved work; updates after save; bar cleared |

## Steps
1. Write the scenario in `quality/tests/hq.spec.js` under "Lane HQ scenarios"
   (success AND the realistic failure).
2. Assert outcomes in the data (`db`), not only the DOM.
3. Run on `desktop-1440` and `phone`.
4. If a scenario reveals a contradiction (as B did: a finished job kept the old
   date), fix the product, not the test.

## Dependencies
`lane-behaviour-first`, `lane-journey-audit`, `rayners-product-director`.

## Expected outputs
A passing, named scenario per behaviour, committed with the change.

## Failure conditions
Tests that only check rendering; mocks that bypass the real function rules;
date-dependent tests that pass only on one day (seed relative to today).

## Test requirements
`cd quality && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test hq.spec.js --project=desktop-1440 --project=phone`
