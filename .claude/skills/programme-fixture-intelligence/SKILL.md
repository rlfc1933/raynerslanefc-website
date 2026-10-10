---
name: programme-fixture-intelligence
description: Use when a Rayners Lane fixture is added, moved, postponed, abandoned, cancelled or rearranged, or before any programme work — decides which fixtures are official HOME fixtures in every competition and reconciles them against programme records.
---

# Skill 01 — Fixture Intelligence

Part of the Rayners Lane FC matchday programme system. Deterministic code does
the work (netlify/functions/lib/programme/*, programme-sync, programme-admin);
this skill is the workflow a person or agent follows around it. Honesty rules
from PHASE2/DESIGN apply: never invent sponsors, quotes, line-ups, history or
results; never claim an integration works without a real successful request.

## Purpose
Know every Rayners Lane fixture across all competitions, detect scheduling changes, and make sure each eligible home fixture has exactly one programme record.

## When to invoke
- A new fixture appears in the registry (league, FA Cup, FA Vase, league cup).
- A fixture shows `fixture_status` postponed/cancelled/abandoned, `sync_status` superseded, or a new FWP id for a rearranged match.
- Before matchweek, and whenever the archive looks incomplete.

## Required inputs
- Season label (default `2026-2027`).
- Registry access (service role) or the in-memory fake for tests.

## Authoritative data sources
- Registry read layer only: `netlify/functions/lib/football/read.js` (`season()`, `results()`), never `data/fixtures.json` (stale legacy).
- Official home designation = `home_team_id` / `is_home_fixture`. NEVER the venue — Broadfields United share Tithe Farm (4 Aug 2026 Broadfields v Rayners Lane was AWAY).
- FA Full-Time / league records for disputed status (see programme-football-data).

## Workflow
1. Read the season through the read layer; keep postponed and superseded rows — they are evidence, not noise.
2. Run `reconcile()` from `netlify/functions/lib/programme/reconcile.js` against `programme_editions`.
3. For each row read `status` (directive vocabulary: Never generated, Draft only, Awaiting approval, Published, Published but inaccessible, Fixture postponed/cancelled/abandoned, Historical edition missing, Requires manual evidence, Not required).
4. Superseded rows (P-P then new FWP id) carry `supersededBy`; the replacement is the fixture that gets the programme — never create a second edition for the old id.
5. A past `scheduled` row with no result and no replacement is `Requires manual evidence`: confirm against the official record before acting.
6. Let `programme-sync` create the records (it is idempotent on `fixture_id`); do not insert by hand.

## Expected output
The reconciliation table (HQ: programmes.html?hq=1, or `programme-admin` action `status`) with one row per fixture and a repair action.

## Error handling
- Registry unreachable → stop; report, do not fall back to data/fixtures.json.
- Null kick-off → use the provider date; never print a time the registry marks `kickoffTimeConfirmed:false`.
- Two candidate replacements → treat as needs review; do not guess.

## Approval requirements
None to read. Creating records is automatic. Any change of home status or eligibility override is a human decision recorded with a name.

## Verification tests
- `node --test tests/programme-reconcile.test.js` (verified 2026/27 baseline: 4 played home matches incl. FA Vase, Wokingham postponed, 578241 superseded by 590749, Broadfields 4 Aug away).
- `node --test tests/programme-engine.test.js`.

## Other skills it may call
- programme-football-data
- programme-archive-recovery
- programme-publishing-orchestrator
