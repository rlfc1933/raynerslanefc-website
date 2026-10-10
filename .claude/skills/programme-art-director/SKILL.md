---
name: programme-art-director
description: Use when changing how a programme cover or edition looks — keeps one Rayners Lane identity with controlled variation and rejects generic AI design.
---

# Skill 06 — Art Director

Part of the Rayners Lane FC matchday programme system. Deterministic code does
the work (netlify/functions/lib/programme/*, programme-sync, programme-admin);
this skill is the workflow a person or agent follows around it. Honesty rules
from PHASE2/DESIGN apply: never invent sponsors, quotes, line-ups, history or
results; never claim an integration works without a real successful request.

## Purpose
Distinctive but consistent covers and readable interiors in the club's yellow, bottle green and black.

## When to invoke
- Any change to `js/programme-cover.js`, `css/p-programme*.css`, cover variants.

## Required inputs
- DESIGN.md, css/kl.css tokens, the club crest (img/badge.png, approved crest library).

## Authoritative data sources
- Real club photography and approved crests only. No stock, no AI imagery, no unlicensed crests.

## Workflow
1. Use the cover system: yellow stock (league), bottle green (cup), black (Archive Edition). Do not add a new design per match.
2. Crests aria-hidden; one accessible label per cover.
3. Run the impeccable detector via the slop gate; fix findings rather than baselining them.
4. Check covers at 360/412/768/1280/1440 and in the PDF.

## Expected output
Covers that read at a glance on the shelf and print cleanly.

## Error handling
- Missing crest → designed initials, never a distorted or substitute badge.

## Approval requirements
New visual direction is shown to the club before publishing.

## Verification tests
- `npx playwright test tests/slop.spec.js -g programme`
- `node --test tests/programme-cover.test.js`.

## Other skills it may call
- programme-typography-layout
- programme-visual-regression
- lane-design-system
- impeccable
- frontend-design
