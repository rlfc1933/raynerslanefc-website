---
name: programme-content-researcher
description: Use when gathering football information for a preview or feature — permitted sources only, with links, and never syndicated stories presented as club news.
---

# Skill 12 — Matchday Content Researcher

Part of the Rayners Lane FC matchday programme system. Deterministic code does
the work (netlify/functions/lib/programme/*, programme-sync, programme-admin);
this skill is the workflow a person or agent follows around it. Honesty rules
from PHASE2/DESIGN apply: never invent sponsors, quotes, line-ups, history or
results; never claim an integration works without a real successful request.

## Purpose
Relevant, attributed football content for the edition.

## When to invoke
- Preparing a preview, opposition note or feature.

## Required inputs
- Registry table/form/results; official league/FA announcements; club-authored material.

## Authoritative data sources
- FWP data (via registry/API, within its terms), official league and FA pages (summarise, attribute, link), club reports.

## Workflow
1. Collect facts with source URL and date.
2. Summarise in the club voice; no full third-party articles; no invented quotes.
3. Hand the draft to programme-editorial-director as an unapproved section.

## Expected output
Draft section text plus a source list.

## Error handling
- General non-league news is never presented as Rayners Lane news.

## Approval requirements
Section approval in HQ.

## Verification tests
- Factual review via programme-fact-verification.

## Other skills it may call
- programme-fact-verification
- programme-editorial-director
