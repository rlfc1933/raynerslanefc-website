---
name: programme-failure-recovery
description: Use when something goes wrong on a matchday — provider down, missing key, rate limit, failed publication, bad PDF, postponement, wrong line-up — with safe retry and rollback.
---

# Skill 20 — Matchday Failure Recovery

Part of the Rayners Lane FC matchday programme system. Deterministic code does
the work (netlify/functions/lib/programme/*, programme-sync, programme-admin);
this skill is the workflow a person or agent follows around it. Honesty rules
from PHASE2/DESIGN apply: never invent sponsors, quotes, line-ups, history or
results; never claim an integration works without a real successful request.

## Purpose
Degrade gracefully and never publish fabricated content.

## When to invoke
- HQ shows Publication error / last_error; supporters report a problem; provider outage.

## Required inputs
- HQ status, `football_sync_runs`, `programme_publication_events`.

## Authoritative data sources
- programme-admin actions: run, unpublish (with reason), restore, rollback, correct_player, authorise_retrospective.

## Workflow
1. Provider down / no key → registry data stands; editorial edition still publishes once approved.
2. Rate limited → wait; the budget is shared.
3. Failed publication → "Refresh programme data" (retries repair, never duplicate).
4. Wrong line-up → "Correct a name" or rollback to a previous version (new version, history kept).
5. Postponed → nothing to do: the engine pauses or marks the published edition.
6. Bad PDF → regenerate through the print journey; inspect page PNGs.
7. Archive page down → the baked ledger stays visible; the "Try again" control re-requests.

## Expected output
A restored edition and an event trail of who did what.

## Error handling
- If unsure, unpublish with a reason — never delete.

## Approval requirements
Unpublish/restore/rollback need a name.

## Verification tests
- `node --test tests/programme-admin.test.js tests/programme-engine.test.js`
- `quality/tests/programme.spec.js` (service down, postponement).

## Other skills it may call
- programme-publishing-orchestrator
- programme-team-sheets
- programme-print-pdf
