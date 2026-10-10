---
name: programme-sponsor-director
description: Use when a sponsor should appear in a programme — only approved, agreed commercial records render; contracted placements are checked, never silently replaced.
---

# Skill 10 — Sponsor Advertising Director

Part of the Rayners Lane FC matchday programme system. Deterministic code does
the work (netlify/functions/lib/programme/*, programme-sync, programme-admin);
this skill is the workflow a person or agent follows around it. Honesty rules
from PHASE2/DESIGN apply: never invent sponsors, quotes, line-ups, history or
results; never claim an integration works without a real successful request.

## Purpose
Correct sponsor recognition per match from genuine approved obligations, with fulfilment evidence.

## When to invoke
- A match sponsor / match-ball sponsor / advert is agreed; before matchday; after publication for fulfilment.

## Required inputs
- `programme_sponsor_placements` (approval_status, approved_by, artwork, dates).
- HQ commercial record id where one exists.

## Authoritative data sources
- Club-approved deals only. Researched prospects are never inserted. Entry points that exist: £50 match-ball, £100 matchday (state prices only where the club already does). Ground rights (boards, naming, hospitality) are NOT the club's to sell — Tithe Farm is shared.

## Workflow
1. Record the placement in HQ; tick "agreed, approved commercial deal" only when it is. Unticked = proposal, never rendered.
2. `lifecycle.sponsorPlacements()` filters to approved, in-date, correctly-shaped artwork; issues are flagged on the edition (`last_error`).
3. After publication, record fulfilment evidence (version id, placement) against the placement.

## Expected output
Placements section in the edition; sponsor issues listed in HQ.

## Error handling
- Missing/misshaped artwork → flagged, placement omitted, the sponsor is not swapped for another.

## Approval requirements
Chairman/committee approval for every placement and every sponsor name on site.

## Verification tests
- `node --test tests/programme-lifecycle.test.js` (sponsor placements)
- `node --test tests/programme-admin.test.js` (proposal never renders).

## Other skills it may call
- programme-publishing-orchestrator
- programme-fact-verification
