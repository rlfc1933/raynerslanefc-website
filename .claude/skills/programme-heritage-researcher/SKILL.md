---
name: programme-heritage-researcher
description: Use when a programme needs club history — maintains approved historical facts, photographs and stories and never invents club history.
---

# Skill 11 — Club Heritage Researcher

Part of the Rayners Lane FC matchday programme system. Deterministic code does
the work (netlify/functions/lib/programme/*, programme-sync, programme-admin);
this skill is the workflow a person or agent follows around it. Honesty rules
from PHASE2/DESIGN apply: never invent sponsors, quotes, line-ups, history or
results; never claim an integration works without a real successful request.

## Purpose
Accurate heritage content from approved sources.

## When to invoke
- History section, anniversaries, archive features.

## Required inputs
- data/honours.json, history.html, approved evergreen `programme_sections` (section_key history).

## Authoritative data sources
- Club-published facts (founded 1933; honours on history.html). Photos only with known ownership.

## Workflow
1. Quote only facts already published by the club or supplied with evidence.
2. Save as an evergreen section (edition_id null) — approved once, reused (`preapproved`).
3. Attach source and photo credit in `data`.

## Expected output
An approved evergreen history block.

## Error handling
- Unverifiable claim → leave it out and ask the club.

## Approval requirements
Club approval of each new historical claim.

## Verification tests
- `node --test tests/programme-lifecycle.test.js` (sections overlay)

## Other skills it may call
- programme-fact-verification
- programme-editorial-director
