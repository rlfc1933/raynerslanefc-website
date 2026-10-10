---
name: programme-team-sheets
description: Use whenever line-ups, squads or player names touch a programme — keeps season squad, registered players, matchday squad, starting XI, substitutes, captain and match events distinct, and never shows a predicted XI as confirmed.
---

# Skill 04 — Squad & Team-Sheet Intelligence

Part of the Rayners Lane FC matchday programme system. Deterministic code does
the work (netlify/functions/lib/programme/*, programme-sync, programme-admin);
this skill is the workflow a person or agent follows around it. Honesty rules
from PHASE2/DESIGN apply: never invent sponsors, quotes, line-ups, history or
results; never claim an integration works without a real successful request.

## Purpose
Publish only genuine, validated team sheets, side by side, with source and timestamp.

## When to invoke
- Team-sheet window on matchday.
- A name needs correcting.
- Only one team's sheet has arrived.

## Required inputs
- `football_lineups` / `football_lineup_players` for the fixture (registry).

## Authoritative data sources
- Provider team sheets via the registry (status `confirmed` only).
- Never `data/players.json` / the season roster as an XI.

## Workflow
1. `lifecycle.teamSheets(home, away, fixture)` validates each side with `publish-rules.validateLineup` (11 starters, no duplicates, right fixture/team, source timestamp).
2. `squadsSection()` shows a confirmed side and keeps "Confirmed teams will appear here when available." for the other.
3. Status improves pending → partial → confirmed; each improvement is ONE new version (Stage B), editorial untouched.
4. Name corrections: HQ inspector → "Correct a name" (`correct_player`) — new version, correction noted, re-applied after later refreshes.
5. Do not publish team news before it is public; FWP has no guaranteed release time.

## Expected output
Squads section with `status`, per-side `confirmed`, `source`, `sourceUpdatedAt`, `corrections`.

## Error handling
- Unconfirmed/predicted sheet → placeholder.
- Both sheets same team → rejected.
- Same sheet twice → no new version (content hash).

## Approval requirements
Corrections need a named person.

## Verification tests
- `node --test tests/programme-lifecycle.test.js`
- quality: `programme.spec.js` "two stages".

## Other skills it may call
- programme-fact-verification
- programme-publishing-orchestrator
