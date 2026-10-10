---
name: rayners-product-director
description: Owns the overall product shape of Rayners Lane FC — public site, Staff HQ (Lane HQ) and Asset Studio as one family with three working modes. Use at the START of any feature that spans more than one screen, adds a new HQ area, changes what the Command Centre shows, or when two surfaces disagree about the same fact (a date, a score, a status). Decides which existing system owns the job before anything is built.
---

# Rayners product director

## Purpose
Keep the club's software one coherent product: every fact has one source, every
job has one home, every screen has one mode. Prevent the failure that created
the old HQ — an accumulation of individually sensible tools that disagree.

## Trigger conditions
- A new feature, area, panel or workflow is proposed for Staff HQ or the site.
- Two surfaces show different values for the same thing (e.g. HQ "next match"
  vs the homepage; a red "result not recorded" alert while the league has it).
- A request mentions "dashboard", "overview", "alerts", "notifications".
- Before any change to `js/hq-model.js` (navigation, priorities, notifications).

## Inputs
- The request, in the club's words.
- `PRODUCT.md`, `DESIGN.md`, `docs/CLUB-OS.md`, the Rebirth directive §10
  (the chairman's three questions: money in · supporter growth · what must be done).
- The sources of truth (never re-derive these):
  | Fact | Source |
  |---|---|
  | Fixtures, kick-offs, results, status | football registry: `js/football-data.js` → `/.netlify/functions/football-data` (`lib/football/read.js`). `data/fixtures.json` is STALE legacy. |
  | Club records: tasks, enquiries, deals, invoices, grants, comms | Club OS: `/.netlify/functions/club-os` (`summary`, `list`, `history`, …) |
  | Private matchday attendance/takings | `/.netlify/functions/matchday-ops` (needs a personal staff session) |
  | Dates | Europe/London via `js/hq-time.js` — never `toISOString().slice(0,10)` |
  | Navigation + destinations | `js/hq-model.js` `SECTIONS` over `js/portal-tools.js` `TOOLS` |

## Steps
1. Name the person and the moment (chairman, five minutes, on a phone; volunteer
   at the turnstile; administrator on a Tuesday). Run `lane-behaviour-first`.
2. Find the owner of the data in the table above. If none exists, say so and
   design the honest empty state — do not create a second store.
3. Decide the mode: public = Persuade/Read; HQ = Operate; Studio = Create.
4. Decide the home: an existing panel (preferred), the Command Centre (only if
   it answers one of the three questions), or a new panel registered in
   `PortalTools.TOOLS` AND placed in exactly one `HQModel.SECTIONS` section.
5. Write the behaviour as a Playwright scenario first (see `rayners-behaviour-auditor`).
6. Hand visual work to `rayners-design-system-guardian`, IA to
   `rayners-hq-information-architecture`, release to `rayners-release-visual-gate`.

## Dependencies
`lane-behaviour-first`, `rayners-hq-information-architecture`,
`rayners-design-system-guardian`, `rayners-behaviour-auditor`.

## Expected outputs
- A one-paragraph decision (owner of data, home of the job, mode) in the commit
  message or PR body.
- No new duplicate source; no orphan panel; no dead navigation entry.

## Failure conditions (stop and fix)
- A screen computes "today/next/live" itself instead of using `hq-time.js` + the registry.
- A public result and a private takings record are shown as one thing.
- The same underlying problem appears twice (two alerts, alert + notification count).
- A feature claims an outcome (sent, published, paid, exported) that did not happen.
- Copy reassures falsely ("you cannot break the website").

## Test requirements
- `node --test tests/hq-model.test.js` passes (navigation coverage, grouping, dates).
- The relevant `quality/tests/hq.spec.js` "Lane HQ" scenario passes on
  `desktop-1440` and `phone`.
