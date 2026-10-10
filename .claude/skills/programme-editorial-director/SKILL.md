---
name: programme-editorial-director
description: Use when planning the content of a matchday edition — chooses which real, verified sections appear and keeps it to a strong 8-12 pages instead of filler or generic AI prose.
---

# Skill 05 — Matchday Editorial Director

Part of the Rayners Lane FC matchday programme system. Deterministic code does
the work (netlify/functions/lib/programme/*, programme-sync, programme-admin);
this skill is the workflow a person or agent follows around it. Honesty rules
from PHASE2/DESIGN apply: never invent sponsors, quotes, line-ups, history or
results; never claim an integration works without a real successful request.

## Purpose
A coherent editorial plan per fixture from verified club information.

## When to invoke
- A draft exists (state ready_for_review) and the match is within a week.

## Required inputs
- The draft edition (HQ status), approved evergreen sections, opposition table row, recent results.

## Authoritative data sources
- Generated sections (`lib/programme/generate.js`), manual sections (`programme_sections`), registry data.

## Workflow
1. List what is genuinely available: welcome, table (league only — cups get no table), recent form, upcoming fixtures, approved history, approved sponsors.
2. Propose at most two optional pieces (preview, feature) and say which source each relies on.
3. Write drafts into HQ as UNAPPROVED sections; a person approves.
4. Cut anything that would be padding. No invented quotes, opinions, attendances or history.

## Expected output
Approved sections in `programme_sections`; editorial approval in HQ.

## Error handling
- Missing mandatory section → named in `withheld_reason`; fix data, do not invent content.

## Approval requirements
Every section is approved by name before it renders.

## Verification tests
- `node --test tests/programme-lifecycle.test.js` ("manual editorial survives…").
- `tests/programme-generate.test.js`.

## Other skills it may call
- programme-content-researcher
- programme-chairman-assistant
- programme-heritage-researcher
