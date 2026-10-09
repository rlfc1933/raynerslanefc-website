---
name: lane-behaviour-first
description: Mandatory before building or changing ANY feature on the Rayners Lane FC site or Staff HQ — think through real people, the full journey, what goes wrong and who acts next, then prove it with a journey test. Use for every significant feature, form, workflow or HQ tool.
---

# Behaviour first (club addendum — applies to all work)

A Step 5 club, run by volunteers, on matchdays that don't go to plan. A feature
is finished when a real person can complete the real outcome — not when the
page renders or the API returns 200.

## Before building, answer in writing (commit message or PR)
1. Who uses it (fan, visitor, sponsor, player, official, volunteer, admin)?
2. What are they trying to achieve, and what triggers it?
3. What do they expect to happen — and what happens next?
4. What can go wrong (wrong details, expired session, duplicate submit, failed
   service, missing record, abandoned task)?
5. Who becomes responsible? How is completion confirmed? What if nobody responds?
6. Does it work on a phone at the ground with poor signal, by keyboard, with a screen reader?

## Scenario coverage (each meaningful feature)
First-time use · returning user · happy path · empty state · partial data (never
fabricate) · invalid input · duplicate action (idempotency key) · external
service failure (honest status) · interrupted journey · permission denied ·
expired session · delayed response (owner + escalation) · changed circumstances
(authorised edit, propagated) · mobile · accessibility · completion confirmed.

## Front and back of house are one system
Every public promise needs an operational mechanism in HQ (owner, due date,
status, audit). Every HQ action that affects supporters or sponsors produces the
right public outcome — and nothing becomes public (sponsor listing, post,
reward) without the approval step. Use Club OS (`netlify/functions/club-os.js`,
rules in `lib/club-os.js`, docs in `docs/CLUB-OS.md`) rather than inventing a
second store; data/*.json is PUBLIC — never put private records there.

## Prove it
Add or extend a journey in `quality/tests/hq.spec.js` (HQ, real functions over
the in-memory DB in `tests/support/fake-supabase.js`) or `quality/tests/journeys.spec.js`
(public). Test success, failure, recovery and hand-off as distinct users. Never
send real messages or move money in a test. Then `lane-release-quality`.

## Don't over-build
Prioritise realistic, high-impact scenarios; plain language; sensible defaults;
few decisions. Reduce volunteer workload — never add a form nobody will fill in.
