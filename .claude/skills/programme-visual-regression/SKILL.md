---
name: programme-visual-regression
description: Use before releasing programme changes — compares archive, reader and PDF pages against approved references and catches broken sponsor pages, cropping and typography defects.
---

# Skill 17 — Visual Regression Auditor

Part of the Rayners Lane FC matchday programme system. Deterministic code does
the work (netlify/functions/lib/programme/*, programme-sync, programme-admin);
this skill is the workflow a person or agent follows around it. Honesty rules
from PHASE2/DESIGN apply: never invent sponsors, quotes, line-ups, history or
results; never claim an integration works without a real successful request.

## Purpose
No unnoticed visual breakage in any edition.

## When to invoke
- Any programme CSS/JS change; new cover variant; print changes.

## Required inputs
- Golden screenshots (quality/tests/__screens__), PDF page PNGs from programme.spec.js.

## Authoritative data sources
- lane-visual-regression workflow.

## Workflow
1. Run the visual gate for programmes/programme.
2. Review the PDF page PNGs attached by the PDF journey.
3. Accept intended changes only after looking.

## Expected output
Reviewed diffs; updated goldens for intended changes.

## Error handling
- Unexpected diff → fix, do not re-baseline.

## Approval requirements
Reviewer accepts golden updates.

## Verification tests
- `npx playwright test tests/visual.spec.js -g programme`
- PDF journey.

## Other skills it may call
- lane-visual-regression
- programme-print-pdf
