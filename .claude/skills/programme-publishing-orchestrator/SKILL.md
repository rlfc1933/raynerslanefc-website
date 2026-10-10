---
name: programme-publishing-orchestrator
description: Use to run or reason about the programme lifecycle — creation, approval, Stage A editorial publication, Stage B team sheets, full time, postponement, archival, revisions — with no duplicates and no missed fixtures.
---

# Skill 14 — Publishing Orchestrator

Part of the Rayners Lane FC matchday programme system. Deterministic code does
the work (netlify/functions/lib/programme/*, programme-sync, programme-admin);
this skill is the workflow a person or agent follows around it. Honesty rules
from PHASE2/DESIGN apply: never invent sponsors, quotes, line-ups, history or
results; never claim an integration works without a real successful request.

## Purpose
One deterministic engine (`netlify/functions/programme-sync.js`, every 10 min) driving every edition through audited states.

## When to invoke
- Any question of "why is/isn't this published?"
- Changing lifecycle rules.

## Required inputs
- Registry fixtures, editions, approved sections/placements, line-ups, match_state.

## Authoritative data sources
- `publish-rules.decide()` (original both-teams rule) + `lifecycle.decideStage()` (two-stage model).

## Workflow
1. Records: every official home fixture, all competitions, idempotent on `fixture_id`.
2. Stage A: editorial approved (hash unchanged) + content valid + London matchday → publish with teams pending.
3. Stage B: team sheet improves → revision of squads only.
4. Full time: result captured into a new version.
5. Called off: unpublished edition → `postponed`; published → kept + `fixture_postponed_at`.
6. Played with no edition → `retrospective_candidate` until a person authorises.
7. Every write via `writeVersion()` (content hash + repair-not-collide) and logged in `programme_publication_events` with an idempotency key.
8. Before the 20261009150000 migration is applied, legacy states only (`storableState`).

## Expected output
States, versions and events consistent across endpoint, HQ and archive.

## Error handling
- One fixture failing never stops the season (`last_error` on the edition, run status partial).

## Approval requirements
Editorial approval for Stage A; retrospective authorisation; unpublish/rollback with name and reason.

## Verification tests
- `node --test tests/programme-engine.test.js tests/programme-lifecycle.test.js tests/programme-publish.test.js tests/programme-recovery.test.js`

## Other skills it may call
- programme-fixture-intelligence
- programme-team-sheets
- programme-failure-recovery
