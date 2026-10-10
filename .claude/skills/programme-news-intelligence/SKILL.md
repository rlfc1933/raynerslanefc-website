---
name: programme-news-intelligence
description: Use when suggesting news for a programme or the site — tracks genuine club and competition developments and separates confirmed announcements from rumour.
---

# Skill 15 — News & Event Intelligence

Part of the Rayners Lane FC matchday programme system. Deterministic code does
the work (netlify/functions/lib/programme/*, programme-sync, programme-admin);
this skill is the workflow a person or agent follows around it. Honesty rules
from PHASE2/DESIGN apply: never invent sponsors, quotes, line-ups, history or
results; never claim an integration works without a real successful request.

## Purpose
News suggestions for human approval, never automatic publication.

## When to invoke
- Weekly before a home match; after official announcements.

## Required inputs
- Club news (data/news.json), official league/FA announcements, registry changes (postponements, rearrangements).

## Authoritative data sources
- Official sources only. FWP has no news endpoint — do not invent one.

## Workflow
1. List candidate items with source and confirmation status (confirmed / unconfirmed).
2. Only confirmed items become draft sections; rumours are dropped.
3. Hand to programme-editorial-director.

## Expected output
A short approval queue of confirmed items.

## Error handling
- Unconfirmed → not drafted.

## Approval requirements
Committee approval before anything is published.

## Verification tests
- Manual review; programme-fact-verification on each item.

## Other skills it may call
- programme-content-researcher
- programme-fact-verification
