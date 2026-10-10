---
name: programme-analytics
description: Use when reporting programme reads, downloads, archive use or sponsor interactions — real, privacy-conscious counts only.
---

# Skill 19 — Programme Analytics

Part of the Rayners Lane FC matchday programme system. Deterministic code does
the work (netlify/functions/lib/programme/*, programme-sync, programme-admin);
this skill is the workflow a person or agent follows around it. Honesty rules
from PHASE2/DESIGN apply: never invent sponsors, quotes, line-ups, history or
results; never claim an integration works without a real successful request.

## Purpose
Accurate evidence of programme value for the club and its sponsors.

## When to invoke
- Monthly reporting; sponsor fulfilment reports.

## Required inputs
- `fan_events` (`programme_opened`, recorded once per member per edition per day by programme-data), `programme-stats` function, consented analytics.

## Authoritative data sources
- Only recorded events. No estimates presented as counts.

## Workflow
1. Query `programme-stats` / fan events for opens per edition.
2. PDF saves happen in the browser and are NOT counted — say so rather than estimating.
3. Sponsor report: edition, placement, version, opens.

## Expected output
A short report with counts and their limits.

## Error handling
- Missing data → report as missing.

## Approval requirements
Sponsor-facing reports are approved before sending (no external sending by automation).

## Verification tests
- `node --test tests/programme-stats-join.test.js`

## Other skills it may call
- programme-sponsor-director
