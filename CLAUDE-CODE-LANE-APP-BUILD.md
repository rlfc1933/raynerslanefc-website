# Claude Code Brief — Build "The Lane App" (player + manager PWA)

Repo: `rlfc1933/raynerslanefc-website` — static HTML on Netlify, no build step, vanilla JS. Supabase already used (live scoreboard, fan attendance). PWA + Web Push scaffolding exists (`manifest.json`, `sw.js`, `push-key.js`, `push-subscribe.js`, `push-send.js`).

## 📐 THE DESIGN SPEC IS IN THE REPO — READ IT FIRST
**`lane-app-prototype.html`** is a complete, working, clickable prototype of this app, agreed with the club. **Read it before writing any code.** It defines every screen, the copy, the brand, the interaction model and the state transitions. Build *this*, not your own interpretation. (Its `localStorage` is a stand-in for Supabase — same behaviour, real backend.)

Ship at: **`raynerslanefc.co.uk/playermanager1933.html`** (root file, like `admin.html`). Add it to `robots.txt` Disallow, and give it its own manifest (`player-manifest.json`) so "Add to Home Screen" installs it as a standalone app. ⚠️ **The obscure URL is NOT security** — auth is the gate.

---

## 🔴 BLOCKERS — resolve before/alongside
1. **`CLAUDE-CODE-CRITICAL-SAVE-BUG.md` must be fixed first.** Admin saves currently overwrite each other and lose data. Do not build on a lossy write path.
2. **VAPID keys are NOT set in Netlify** → Web Push silently does nothing. Generate (`npx web-push generate-vapid-keys`), set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, create `push_subscriptions` per `PUSH-SETUP.md`.
3. **A GitHub PAT is exposed in plaintext in the git remote URL.** It must be revoked and rotated (and `GITHUB_TOKEN` updated in Netlify) — flag this loudly to the club.

## 🚫 DO NOT TOUCH
The public website, `admin.html`, `data/*.json`, or the existing publishing pipeline. This app is **additive and self-contained**.

---

## ⚙️ NON-NEGOTIABLE ENGINEERING (these are what make or break it)

### 1. Saving must be bulletproof — no repeat of the overwrite bug
- **Supabase (Postgres) is the source of truth.** Never "fetch the deployed site, merge, push" — that pattern is exactly what lost the chairman's players.
- Every write is a **targeted upsert on a single row**, not a rewrite of a whole collection. `UNIQUE (event_id, player_id)` on availability/check-in → **upsert, never insert-or-guess**.
- **Idempotency keys** on every queued write, so a retried check-in can't double-insert.
- **Optimistic UI with rollback**: show the change instantly, mark it `pending`, confirm on server ack, **roll back + tell the user** if it fails. Never a silent failure.
- Explicit save states in the UI: `saving… / saved ✓ / failed — retry`.
- Enforce integrity in the **database** (constraints, RLS), not just the client.
- **Concurrency test required:** two staff editing the same selection simultaneously must not lose each other's changes.

### 2. Offline — grounds have no signal
- **Cache reads**: event details (opponent, time, meet, kit, venue, address) must be **readable offline** via the service worker. A player at an away ground with no signal must still see where he is and when to be there.
- **Queue writes**: check-in (and availability) tapped offline → stored locally with an idempotency key, UI shows ✓ immediately, syncs when connectivity returns. Show a subtle "will sync" indicator.
- Never lose a queued action on app close.

### 3. iOS push requires the app to be INSTALLED — this will silently kill adoption
On iOS, Web Push **only works if the PWA has been added to the Home Screen**. Most of the squad is on iPhone. So:
- **Detect** whether the app is running installed (`display-mode: standalone`) vs a Safari tab.
- If not installed, **block or hard-gate onboarding** with a clear "Add to Home Screen" walkthrough (with iOS-specific steps). Do not let a player finish signup believing they'll get notifications when they won't.
- **Ask for notification permission AFTER their first successful action** (right after they mark availability) — never on first open; people reflexively decline.

### 4. Real timestamps, not display strings
Store events as **UTC `timestamptz`**; render in local time (BST/GMT). Countdowns, "is it in the past", and scheduled reminders all depend on this. Never store `"Sat 8 Aug"` as the source of truth.

### 5. Seasons — or your stats are corrupted forever
Every event, appearance, selection and stat carries a **`season`** (e.g. `2026-27`). Squad numbers are unique **per team per season**. Without this, 2026-27 and 2027-28 conflate and can never be untangled.

### 6. Automated notification schedule
If the manager must send every push by hand, he'll stop. Use scheduled jobs (Netlify scheduled functions or Supabase `pg_cron`):
- Availability request when an event is created / X days before
- Chase the non-responders (e.g. Thursday)
- Squad published → notify everyone their status
- Meet-time reminder on the morning of the event
All configurable; all idempotent (never double-send).

---

## 🗄️ SCHEMA (Supabase — extend `supabase-schema.sql`, `IF NOT EXISTS`, safe to re-run, RLS ON everywhere)

- `seasons` — `id`, `label` ('2026-27'), `is_current`
- `teams` — `id`, `name` ('First Team'), `is_youth` (default false)
- `app_users` — `auth_uid`, `player_id` (nullable), `role` (`chairman|manager|coach|staff|player`), `team_id`, `status`
- `permissions` — role/user → capability (e.g. `can_select_squad`). **Permissions are a matrix, not hardcoded roles** — a coach can be granted selection rights with no code change.
- `players` — `id`, `team_id`, `season`, `name`, `squad_no`, `position`, `photo_url`, `photo_cutout_url`, `bio`, `email`, `phone`, `username`, `pin_hash`, `status` (`pending|active|injured|released|left`), `sponsor_name`, `sponsor_logo`, `photo_consent` (bool), `created_at`
  - **UNIQUE (`username`)**; **UNIQUE (`team_id`,`season`,`squad_no`)** where squad_no not null; dedupe on `email` (re-signing a former player **reactivates**, never duplicates)
  - Dormant youth fields: `date_of_birth`, `is_minor`, `guardian_name`, `guardian_email`, `consent_at`
- `venues` — `club_name`, `ground`, `address`, `lat`, `lng`. ⚠️ **lat/lng matter** — sports-ground postcodes often route to the wrong place.
- `events` — **the core model. A match is only ONE kind of event.** `id`, `team_id`, `season`, `type` (`league|cup|charity|friendly|training|photoshoot|club_event`), `opponent` (nullable), `is_home`, `competition`, `starts_at` (timestamptz), `meet_at`, `kit`, `venue_id`, `source` (`fwp_import|staff`), `published` (bool), `created_by`
  - **Only `type` in (league,cup,charity,friendly) has a squad selection.** All types have availability + check-in + notifications.
  - League/cup are imported from FWP; **friendlies, charity games, photoshoots and club events are added by staff and will never come from a feed.**
- `availability` — `event_id`, `player_id`, `status` (`available|unavailable`), `note`, `responded_at` — **UNIQUE (event_id, player_id)**
- `selections` — `event_id`, `player_id`, `role` (`starting|sub|not_selected`), `selected_by`, `selected_at` — **UNIQUE (event_id, player_id)**
- `checkins` — `event_id`, `player_id`, `checked_in_at`, `source` (`self|staff`), `idempotency_key` — **UNIQUE (event_id, player_id)**
- `announcements` — `team_id`, `author_id`, `title`, `body`, `created_at` (**broadcast only**)
- `feedback` — `player_id`, `author_id`, `body`, `event_id`, `acknowledged_at` (**one-way staff → player; player may acknowledge, NOT reply**)
- `staff_notes` — `player_id`, `author_id`, `body` (**private; the player must never be able to read this — enforce in RLS**)
- `audit_log` — `actor_id`, `action`, `entity`, `entity_id`, `before`, `after`, `at` (selection, release, approve, notes)
- `push_subscriptions` — per `PUSH-SETUP.md`

### Create now, leave empty (Phase 2 stats engine — makes it purely additive later)
- `appearances` (`event_id`,`player_id`,`minutes`,`started`), `goals` (`event_id`,`player_id`,`minute`,`assist_player_id`), `cards`, `motm`
- **🔑 These MUST key on `player_id`, never a free-text name.** The website currently stores scorers as strings (`"Hill 23'"`) — that's exactly why stats never linked. Once events are keyed to players, **player stats become a SUM over events, never a number anyone types.**

### Single source of truth
**Supabase is the master for players.** `data/players.json` / `squad.json` (used by the public site) must be **generated from Supabase**, not edited independently — otherwise the app and the admin portal will overwrite each other (the exact class of bug that just lost 3 players). Implement a one-way publish: Supabase → `players.json`.

---

## 🔐 AUTH
- **Players self-sign-up:** full name, email, phone, position, **username**, **6-digit numeric code**.
  - → lands as **`pending`**. **NOT instantly in the squad.** Staff get a notification and **approve with one tap**. (Open instant signup would let anyone on the internet into the squad — unacceptable, especially before youth.)
  - **Hash the 6-digit code** (bcrypt/argon2). **Lock out after 5 failed attempts** with backoff — 6 digits is a million combos and brute-forceable in seconds otherwise.
  - **Rate-limit the signup endpoint** (spam accounts).
  - **Password reset flow via email** — mandatory, or you'll drown in "I can't get in".
- **Staff sign in with INDIVIDUAL logins** — not one shared PIN. `staff-login.js` / `staff-users.js` already provide salted+hashed per-user staff passwords: use them. This gives an **audit trail** (who released a player, who wrote a note) and lets you revoke one person. ⚠️ **The shared `19332026` is printed in public source — it must not be the gate to players' personal data.**
- **Binding prevents profile clashes:** an approved player's `auth_uid` binds 1:1 to a `player_id`. A player can never claim or collide with another's profile.

## 🛡️ SAFEGUARDING & GDPR (build in now — retrofitting is brutal)
- **Broadcast + feedback only. NO private staff↔player messaging anywhere.** Feedback is one-way (player can acknowledge 👍, not reply). This is what makes it safe to extend to youth teams without a rebuild.
- **Team-scoped** everything, so youth teams are additive.
- **No medical/injury notes.** "Unavailable" is a self-declared availability status — that's fine. Detailed injury/medical data is special-category under UK GDPR: **out of scope.** (If the club later wants emergency contacts, that's a separate, locked-down, audit-logged decision.)
- **Privacy notice + lawful basis at signup.** **Photo consent checkbox** (their headshot appears on a public website).
- **Data export + erasure** for a player on request. Releasing a player **archives** — it never deletes their appearances/goals (real club history).

## 🗺️ MAPS — deep links, no API, no key, no scraping
Three buttons per event, using the venue's **lat/lng**:
- Drive → `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=driving`
- Waze → `https://waze.com/ul?ll=<lat>,<lng>&navigate=yes`
- Public transport → `...&travelmode=transit`
The phone's own map app handles routing, live traffic and location. **Do not** use the paid Google Directions API and **do not** scrape Google/Waze.

## 📸 MEDIA
- One headshot per player, uploaded once (photoshoot bulk-upload) → used by the app profile, the website squad page, the programme team sheet and Post Studio graphics. **One photo, everywhere.**
- Player sponsor (`sponsor_name`, `sponsor_logo`) shows on their app profile, website profile, programme team sheet and their goal graphics — it's a sellable product.

## 💬 WHATSAPP
Don't fight it. Add a **"Share to WhatsApp"** button that posts the availability/squad summary into the group. The app does what WhatsApp can't (*counting*); WhatsApp keeps the banter.

---

## ✅ ACCEPTANCE CRITERIA (must all pass)

**Save integrity (highest priority)**
1. Two staff change the selection for the same event simultaneously → **no lost updates**.
2. A player taps availability 5× rapidly → exactly one row, final value correct.
3. Check in with **airplane mode on** → UI confirms instantly → re-enable signal → it syncs **exactly once** (no duplicate).
4. Kill the app mid-save → the queued write survives and syncs on next open.
5. A failed save **tells the user and rolls back** — never silently discards.

**Core loop**
6. Player signs up (name/email/phone/position/username/6-digit code) → appears as **pending** → staff approve in one tap → player is in the squad and can be selected.
7. Player marks availability in **two taps**; manager sees it live.
8. Manager picks XI + subs, publishes → **every player is pushed their status** with time, venue, meet time.
9. Player opens app offline at an away ground → **still sees address, meet time and kit**; check-in queues and syncs.
10. Staff add a **friendly / charity match / photoshoot** by hand; squad availability is requested for it. Photoshoot/club event has **no squad selection** but does have availability + check-in.
11. Maps buttons open Google Maps (drive), Waze and Google transit correctly.
12. Feedback reaches the player one-way; **no DM capability exists anywhere in the app**; private staff notes are unreadable by players (verified against RLS).
13. Releasing a player revokes access and removes them from selection **but preserves their appearances/goals**.
14. Stats show `–` and an honest "starts 1 August" — **never fabricated zeros or invented numbers.**

**Platform**
15. Installs to Home Screen from `/playermanager1933.html`; iOS users are gated through the install step before being promised notifications.
16. Scheduled notifications fire (availability request, chase, squad published, meet-time reminder) without double-sending.
17. RLS verified: a player cannot read another player's phone/email/notes, cannot write another's availability, cannot self-approve.
18. The public website and `admin.html` are **completely unaffected**.

## Guardrails
- Vanilla JS + Supabase JS client via CDN. **No framework, no build step.** Brand tokens/fonts only (Bebas/Barlow, `--yellow #FFD100`, `--green #1A5C32`, crest `img/badge.png`).
- **Never fabricate football data** — no invented stats, fixtures or results.
- Secrets in Netlify env vars only; **never commit a key**. Supabase **anon key + RLS** on the client; service key server-side only.
- Atomic commits. Build behind the single new page; nothing else changes.

## Final report
State: the schema created; how writes are made atomic and how offline queueing/idempotency works; the auth + approval flow; whether VAPID push is live; how iOS install-gating is handled; the scheduled jobs; confirmation that **no DM capability and no medical data exist**; and the results of the **save-integrity tests (1–5)** — those are the ones that matter most.
