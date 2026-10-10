---
name: programme-mobile-reader
description: Use when changing programme.html / js/programme-reader.js — mobile-first reading, contents navigation, member gate, low-bandwidth behaviour.
---

# Skill 08 — Mobile Programme Reader

Part of the Rayners Lane FC matchday programme system. Deterministic code does
the work (netlify/functions/lib/programme/*, programme-sync, programme-admin);
this skill is the workflow a person or agent follows around it. Honesty rules
from PHASE2/DESIGN apply: never invent sponsors, quotes, line-ups, history or
results; never claim an integration works without a real successful request.

## Purpose
A supporter at the ground on a phone reads the team sheet without downloading a PDF.

## When to invoke
- Reader changes; Fan Zone auth changes; new section types.

## Required inputs
- `/.netlify/functions/programme-data?id=<fixture>` (server-gated).

## Authoritative data sources
- Only the stored version — never live club data (tests/programme-surfaces enforces it).

## Workflow
1. One request for the edition, after `LaneFan.ready` so members are recognised.
2. Locked response → the gate with Join and Sign-in routes carrying `return=`.
3. Render sections that exist; contents bar; archive marker and postponement notice first; version line; "Print or save as PDF".
4. No page-turn animation; reduced motion respected.

## Expected output
Readable edition at 344-1440px, keyboard and screen-reader usable.

## Error handling
- Fetch failure → "Programme temporarily unavailable" + console error, never a fake edition.
- Non-public edition → "This programme is not available" without hinting a draft exists.

## Approval requirements
None.

## Verification tests
- `quality/tests/programme.spec.js` (gate + two stages + postponement)
- `node --test tests/programme-surfaces.test.js tests/fan-access.test.js`.

## Other skills it may call
- programme-accessibility-audit
- programme-print-pdf
