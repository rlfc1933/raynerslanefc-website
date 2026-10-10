---
name: programme-typography-layout
description: Use when editing reader or print layout — grids, text flow, captions, page breaks, spacing — to prevent overflow and unreadable text.
---

# Skill 07 — Typography & Magazine Layout

Part of the Rayners Lane FC matchday programme system. Deterministic code does
the work (netlify/functions/lib/programme/*, programme-sync, programme-admin);
this skill is the workflow a person or agent follows around it. Honesty rules
from PHASE2/DESIGN apply: never invent sponsors, quotes, line-ups, history or
results; never claim an integration works without a real successful request.

## Purpose
Bebas for display moments only, Manrope for reading; no clipped text, no overflow, sensible breaks.

## When to invoke
- Changes to `css/p-programme.css`, `css/p-programme-print.css`, `js/programme-reader.js` markup.

## Required inputs
- A real edition (local fake DB via quality/tests/programme.spec.js).

## Authoritative data sources
- DESIGN.md type scale; slop gate palette/radii/font rules.

## Workflow
1. Body 16-18px/1.6 on screen, 10.5pt in print; no text under 12px (8.5pt in print foot).
2. Never uppercase body copy (impeccable all-caps-body).
3. Print: `break-inside: avoid` for team sheets, tables, adverts; team sheets start a page.
4. Check horizontal overflow at 344 and 360px.

## Expected output
Layouts that pass responsive and slop gates and print without clipped text.

## Error handling
- Overflow → find the element (absolute children inside scrollers are a common cause) and fix the container.

## Approval requirements
None for fixes; visual direction changes via programme-art-director.

## Verification tests
- `npx playwright test tests/responsive.spec.js -g programme`
- PDF journey in `quality/tests/programme.spec.js`.

## Other skills it may call
- programme-print-pdf
- programme-accessibility-audit
