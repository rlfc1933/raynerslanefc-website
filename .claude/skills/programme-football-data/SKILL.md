---
name: programme-football-data
description: Use when connecting or changing a football data source for the programme — the official Football Web Pages API adapter, the registry fallback, the request budget, and the FA Full-Time verification workflow.
---

# Skill 03 — Football Data Normalisation (FWP API + FA Full-Time)

Part of the Rayners Lane FC matchday programme system. Deterministic code does
the work (netlify/functions/lib/programme/*, programme-sync, programme-admin);
this skill is the workflow a person or agent follows around it. Honesty rules
from PHASE2/DESIGN apply: never invent sponsors, quotes, line-ups, history or
results; never claim an integration works without a real successful request.

## Purpose
Map Football Web Pages and authorised FA data into one stable model, preserve source references and timestamps, and record — never silently resolve — disagreements.

## When to invoke
- FWP issues the club an API key.
- A provider disagrees with another source.
- Any new consumer wants fixture/table/line-up data.

## Required inputs
- `FWP_API_KEY` (Netlify env, server-side only).
- FWP team id and competition ids — DISCOVERED via `teams.json`/`competitions.json`, never guessed from URL slugs.

## Authoritative data sources
- Official API (documented 9 Oct 2026): base `https://api.footballwebpages.co.uk/v2/`, header `FWP-API-Key`, 10 requests/minute, free for non-league clubs' official websites (print/download use NOT addressed — ask info@footballwebpages.co.uk before API data goes into a printed/downloadable programme).
- Registry (`lib/football/*`) — current source while no key exists.
- FA Full-Time: authorised embed feeds via the league/club Full-Time admin only. No scraping.

## Workflow
1. All API calls go through `netlify/functions/lib/programme/fwp-api.js` (`createClient`, `dbBudget` for the shared 10/min budget in `programme_provider_requests`). Only documented endpoints/params are accepted.
2. Without a key `source().fetch()` returns the registry value with `degraded:true`. Never claim the API works until a real authenticated request succeeds.
3. On first key: call `competitions.json` and `teams.json?comp=<id>`, confirm Rayners Lane's team id by eye, store it as `FWP_TEAM_ID`; capture one real `match.json` response and write the normaliser against it (the field schema is not published).
4. Snapshot raw responses into `programme_source_snapshots`; record disagreements into `programme_source_discrepancies` with BOTH values.
5. Source precedence: official FA/league decision (postponement, result sanction) > authorised FWP feed for match events/line-ups > club-approved manual correction > club editorial.
6. FA Full-Time workflow (manual, no scraping): a committee member opens the league's Full-Time fixture page, checks date/home team/status/result for each disputed row, records the URL as `evidence_url` and resolves the discrepancy with their name.

## Expected output
Normalised fixtures/tables/line-ups with `source` and `sourceUpdatedAt`; open discrepancies listed in HQ.

## Error handling
- 429 or 5xx → retried with backoff within budget; budget exhausted → `rateLimited`, last known data kept.
- 401/403 → not retried; report key problem.
- Key never logged, echoed or sent to a browser (`tests/programme-fwp-api.test.js` scans js/).

## Approval requirements
A person resolves every discrepancy. Requesting the key and print permission from FWP is an external action for the club.

## Verification tests
- `node --test tests/programme-fwp-api.test.js` (stub fetch only — proves behaviour, NOT live connectivity).

## Other skills it may call
- programme-fixture-intelligence
- programme-fact-verification
