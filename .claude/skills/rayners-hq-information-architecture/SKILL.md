---
name: rayners-hq-information-architecture
description: Owns Lane HQ navigation, page hierarchy and the Command Centre's order of information. Use when adding, renaming, moving or removing an HQ panel; when changing the side navigation, phone tab bar or menu sheet; when changing what the Command Centre shows or in what order; or when a person "cannot find" something in HQ.
---

# Lane HQ information architecture

## Purpose
One way in. Six sections — Overview, Football, Club and community, Commercial,
Media, Administration — drawn as a persistent side navigation (≥1024px) and a
bottom tab bar + "All sections" sheet (phones/tablets). Every entry is a real,
permission-checked destination. The Command Centre leads with what needs a
person, not with an inventory of tools.

## Trigger conditions
- A panel is added to `admin.html` (`<div class="panel" id="panel-…">`).
- A tool is added/renamed in `js/portal-tools.js` `TOOLS`.
- Any change to `js/hq-model.js` `SECTIONS`, or to `navHTML` / `paintTabbar` in `js/hq-shell.js`.
- Feedback like "where is X", "too many places", "I didn't know that existed".

## Inputs
- `js/hq-model.js` (`SECTIONS`, `navFor`, `labelOf`, `sectionOf`).
- `js/portal-tools.js` (`TOOLS`, `canSee`, `STAFF_CAPS` — drawing only; the server decides).
- `js/hq-shell.js` (`renderHome` order, `paintTabbar`).

## Steps
1. Register the tool once in `PortalTools.TOOLS` (id = panel id, never renamed —
   it is the URL hash).
2. Place it in exactly ONE `SECTIONS` section with a sentence-case, job-named
   label ("Attendance and takings", not "MD OPS"). If it does not fit any of the
   six, the tool is probably a sub-part of another — merge, don't add a seventh.
3. Permission-aware: `navFor(canSee, exists)` hides what a role may not open.
   Never hide something to imply a permission the server does not enforce.
4. Phone tab bar holds at most four items: Overview, Matchday, Tasks, Menu.
   Do not add a fifth; the sheet has everything.
5. Command Centre order (do not reorder without the product director):
   page header (date + next-match context) → next-match strip (one primary
   action) → Needs doing (grouped priorities) + My work | Money in + Supporters +
   Programmes → Recent activity.
6. Priorities are GROUPS (`buildPriorities`): one row per cause or per fixture,
   expandable to the records. Severity: critical (public sees something wrong
   now) · high/"Urgent" · normal/"Soon" · low/"Later".
7. Copy: labels name the job; no greetings, no rhetorical questions, no
   reassurance that is not true. "Changes to published content affect the public website."

## Dependencies
`rayners-product-director`, `rayners-design-system-guardian`.

## Expected outputs
- Updated `SECTIONS`; `tests/hq-model.test.js` "navigation" test green.
- Screenshots of nav at 390 and 1440 reviewed (`rayners-visual-critic`).

## Failure conditions
- A `TOOLS` entry missing from `SECTIONS`, or in two sections (the unit test fails).
- A nav entry that opens nothing, or opens a panel the role is refused.
- A second navigation concept appearing (quick actions, tiles, "all tools" accordions).
- The tab bar exceeding four items or 44px-tall targets shrinking.

## Test requirements
- `node --test tests/hq-model.test.js`
- `npx playwright test hq.spec.js -g "Lane HQ (A|E)"` (desktop-1440, phone):
  the chairman scan and the phone navigation journey.
