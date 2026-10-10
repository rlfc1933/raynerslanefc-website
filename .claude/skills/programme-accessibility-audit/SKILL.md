---
name: programme-accessibility-audit
description: Use after any programme UI change — contrast, text size, semantic headings, reading order, team-sheet lists, keyboard and screen-reader access, and text alternatives to visual layouts.
---

# Skill 16 — Accessibility & Readability Auditor

Part of the Rayners Lane FC matchday programme system. Deterministic code does
the work (netlify/functions/lib/programme/*, programme-sync, programme-admin);
this skill is the workflow a person or agent follows around it. Honesty rules
from PHASE2/DESIGN apply: never invent sponsors, quotes, line-ups, history or
results; never claim an integration works without a real successful request.

## Purpose
Every programme readable by everyone.

## When to invoke
- Reader, archive, HQ or print changes.

## Required inputs
- Rendered pages via the quality server.

## Authoritative data sources
- quality/tests/a11y.spec.js (axe), responsive.spec.js, DESIGN.md contrast notes.

## Workflow
1. Run `npx playwright test tests/a11y.spec.js tests/responsive.spec.js -g programme`.
2. Check: covers carry one label; every cover fact is also text; team sheets are lists with labels; ledger statuses are text not colour alone; 44px targets.
3. Check the baked ledger is readable with JavaScript off.

## Expected output
No new axe or responsive findings.

## Error handling
- Baseline only deliberate, reviewed choices.

## Approval requirements
None.

## Verification tests
- The gates above.

## Other skills it may call
- web-design-guidelines
- lane-responsive-audit
