---
name: programme-archive-recovery
description: Use when a programme is missing, unreachable, unpublished in error, or the archive shows a loading state — finds the fault, restores what exists and prepares clearly labelled retrospective Archive Editions for matches that never had one.
---

# Skill 02 — Archive Repair & Recovery

Part of the Rayners Lane FC matchday programme system. Deterministic code does
the work (netlify/functions/lib/programme/*, programme-sync, programme-admin);
this skill is the workflow a person or agent follows around it. Honesty rules
from PHASE2/DESIGN apply: never invent sponsors, quotes, line-ups, history or
results; never claim an integration works without a real successful request.

## Purpose
Identify missing or inaccessible historical programmes, recover stored versions, repair records and publication states, and create retrospective editions only when labelled "Archive Edition — Reconstructed from verified match records".

## When to invoke
- The reconciliation shows Historical edition missing, Published but inaccessible, or an orphan edition.
- A supporter reports a programme that will not open.
- After a postponement or rearrangement.

## Required inputs
- Fixture id (`fwp-<id>` or the legacy internal id).
- A named person to authorise any retrospective edition.

## Authoritative data sources
- `programme_editions`, `programme_versions` (immutable), `programme_publication_events`.
- The verified match record (registry result; FWP lists OUR goals first).

## Workflow
1. Run the reconciliation (programme-fixture-intelligence). Note the status and `repairAction`.
2. Published but inaccessible: check `unpublished_*` (a person decided — leave it unless they reverse it) or `current_version = 0` (re-run `programme-sync`; `writeVersion` repairs, never duplicates).
3. Null `internal_fixture_id`: the next sync run repairs it to the read-layer id.
4. Historical edition missing: the sync puts the record in `retrospective_candidate`. A named person authorises in Programme HQ ("Authorise archive edition") or `programme-admin` `authorise_retrospective`.
5. The engine builds it with `lifecycle.retrospectiveEdition()`: cover marked Archive Edition, the verified result, line-ups ONLY if confirmed sheets exist, no kick-off time if unconfirmed, dated NOW (never backdated).
6. Re-bake the static ledger if the baseline changed: `node netlify/functions/lib/programme/bake-ledger.js` (from a new verified snapshot only).

## Expected output
Every played home fixture either Published, Awaiting approval, or Requires manual evidence — none silently missing.

## Error handling
- Never overwrite a version: corrections and rollbacks are new versions.
- Never present a retrospective edition as a matchday original.
- Postponed fixture with no edition → cancellation record only.

## Approval requirements
Required for every retrospective edition (name recorded in `retrospective_authorised_by` and the event log).

## Verification tests
- `node --test tests/programme-admin.test.js` (authorise → Archive edition in ledger).
- `node --test tests/programme-engine.test.js` (labelled, never 12:00, never backdated).

## Other skills it may call
- programme-fixture-intelligence
- programme-fact-verification
- programme-publishing-orchestrator
