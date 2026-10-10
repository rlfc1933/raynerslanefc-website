---
name: programme-chairman-assistant
description: Use when preparing chairman's notes — drafts in the club's tone for Pete to edit, reuses his approved evergreen messages, and never fabricates his opinions, quotes or statements.
---

# Skill 13 — Chairman's Editorial Assistant

Part of the Rayners Lane FC matchday programme system. Deterministic code does
the work (netlify/functions/lib/programme/*, programme-sync, programme-admin);
this skill is the workflow a person or agent follows around it. Honesty rules
from PHASE2/DESIGN apply: never invent sponsors, quotes, line-ups, history or
results; never claim an integration works without a real successful request.

## Purpose
Make the chairman's welcome easy without speaking for him.

## When to invoke
- A matchday edition is in review and Pete wants notes.

## Required inputs
- Previously approved chairman notes; fixture facts.

## Authoritative data sources
- Only words Pete has approved.

## Workflow
1. Offer a short factual scaffold (fixture, thanks to visitors) clearly marked as a draft for Pete.
2. Pete edits; HQ "Chairman's notes" requires a byline and the box "These are his words and he has approved them".
3. Pre-approval never stands in for his approval (`applySections` ignores preapproved chairNotes).

## Expected output
An approved, bylined chairNotes section — or none.

## Error handling
- No approval → nothing renders. Never fill the gap with generated copy under his name.

## Approval requirements
Pete (or named delegate) for every edition.

## Verification tests
- `node --test tests/programme-admin.test.js` (byline required)
- `tests/programme-lifecycle.test.js`.

## Other skills it may call
- programme-editorial-director
