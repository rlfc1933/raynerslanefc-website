---
name: rayners-visual-critic
description: Critiques RENDERED Rayners Lane interfaces (Lane HQ, Asset Studio, public pages) with impeccable's critique/audit playbooks and the club's acceptance criteria, using real screenshots at the standard widths. Use after any visual change and before declaring UI work done; never accept code inspection as proof of visual quality.
---

# Rayners visual critic

## Purpose
Look at what people will actually see, at the sizes they actually use, and
reject the patterns the directive names — then verify the fix by looking again.

## Trigger conditions
- Any change to HQ markup/CSS (`admin.html`, `css/hq*.css`, `js/hq-shell.js` rendering).
- Any public page layout change; any Asset Studio template change.
- Before `rayners-release-visual-gate`.

## Inputs
- The screen(s) changed and the state(s) that matter (empty, loading, populated,
  error, long text, many items).
- For HQ: the harness `quality/tests/support/hq-harness.js` (`setupHq`, `signIn`)
  gives a signed-in HQ over the real functions and an in-memory database.

## Steps
1. Serve locally: `cd quality && node server.js <port> &`.
2. Capture 360, 390, 430, 768, 1024, 1280, 1440, 1920 (Playwright, Chromium at
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, `timezoneId: 'Europe/London'`).
   For HQ, sign in through the harness, then capture: Command Centre, one
   expanded priority group, notifications open, phone menu sheet, Matchday
   preparation with a checklist.
3. Read every screenshot (the Read tool shows images). Record per width:
   overflow (scrollWidth − innerWidth must be 0), truncation, wrapping that
   breaks meaning, hierarchy (is the most important thing the most prominent?),
   number of yellow elements (exactly one primary), contrast, density.
4. Apply impeccable `critique` (`.claude/skills/impeccable/reference/`) heuristics:
   hierarchy, rhythm, alignment, cognitive load, state coverage; run the
   detector via `npx playwright test slop -g <page>`.
5. Reject (fix, then re-capture): generic repeated card layouts; unnecessary
   yellow; inconsistent spacing; weak contrast; truncated headings; clipped text;
   overflow; distorted images; decorative icons without function; contradictory
   status colours; dead-end actions; overly dense phone screens.
6. Write the findings and fixes in the commit/PR, naming the widths checked.

## Dependencies
`impeccable`, `rayners-design-system-guardian`, `lane-responsive-audit`.

## Expected outputs
A short critique (what was wrong, what changed) and the final screenshots looked at.

## Failure conditions
Declaring done without opening the screenshots; any horizontal scroll; any
screen with two competing primary actions; critical red used for historic data.

## Test requirements
`npx playwright test responsive a11y slop -g admin` show no NEW issues;
`hq.spec.js` "Lane HQ E" asserts no sideways scroll on a phone.
