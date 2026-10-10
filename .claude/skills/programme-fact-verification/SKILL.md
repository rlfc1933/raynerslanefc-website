---
name: programme-fact-verification
description: Use before approving or after publishing an edition — checks line-ups, names, numbers, dates, opponents, competition, table data, scores and sponsor names against their sources and flags discrepancies instead of inventing fixes.
---

# Skill 18 — Factual Verification Agent

Part of the Rayners Lane FC matchday programme system. Deterministic code does
the work (netlify/functions/lib/programme/*, programme-sync, programme-admin);
this skill is the workflow a person or agent follows around it. Honesty rules
from PHASE2/DESIGN apply: never invent sponsors, quotes, line-ups, history or
results; never claim an integration works without a real successful request.

## Purpose
Nothing false in a programme.

## When to invoke
- Before editorial approval; after team sheets; after full time; for every retrospective edition.

## Required inputs
- The version payload; registry fixture/result; table snapshot; approved placements.

## Authoritative data sources
- Registry (FWP lists OUR goals first — read.js orients scores); FA Full-Time evidence for disputes.

## Workflow
1. Fixture: date (Europe/London), kick-off only if confirmed, official home team, opponent, competition.
2. Result orientation: our goals first in FWP lists — 0-1 v Hilltop is a defeat.
3. Line-ups: confirmed status, 11 starters, numbers, captain.
4. Sponsors: approved placements only.
5. Record each disagreement in `programme_source_discrepancies` with both values; never edit the version.

## Expected output
A pass, or a list of discrepancies for a person.

## Error handling
- Unresolvable → withhold (named person) rather than guess.

## Approval requirements
A person resolves discrepancies.

## Verification tests
- `node --test tests/programme-reconcile.test.js tests/programme-engine.test.js`

## Other skills it may call
- programme-football-data
- programme-team-sheets
