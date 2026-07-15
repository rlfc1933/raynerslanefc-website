# Claude Code Brief — The Lane App: Manager ↔ Player PWA (Phase 1: availability, selection, push)

Repo: `rlfc1933/raynerslanefc-website` (static HTML on Netlify, no build step, vanilla JS; Supabase already in use for the live scoreboard + attendance; PWA + Web Push scaffolding already present — `manifest.json`, `sw.js`, `push-key.js`, `push-subscribe.js`, `push-send.js`).

## 🔴 DEPENDENCY — do NOT start until the save bug is fixed
`CLAUDE-CODE-CRITICAL-SAVE-BUG.md` must be shipped first (admin saves currently overwrite each other and lose data). Building on top of a lossy write path would be reckless.

---

## THE VISION (read this — it drives every decision)
Build **The Lane App**: one installable PWA where the manager runs the squad and players run their week. Phase 1 does **one thing brilliantly**: *availability → selection → everyone knows the squad.* That is the loop that eats a non-league manager's week (chasing WhatsApp), so it delivers value immediately and earns the adoption needed for everything after.

**Adoption is the real risk, not the engineering.** If marking availability takes longer than replying to a WhatsApp message, players won't use it. Ruthlessly optimise for: **open app → two taps → done.**

### The long game (design for it now, don't build it yet)
Eventually this becomes the club's platform — first team now, **youth teams later** — with a **stats engine** where player stats are *computed from match events, never typed*. That future shape must be baked into the schema now (see "Schema must anticipate Phase 2").

---

## SAFEGUARDING & DATA (architect for this from day one)
Phase 1 is **adults (first team) only**, but youth teams will be added later. Build so that's safe by default:
- **Comms are BROADCAST-ONLY. No private 1-to-1 messaging between staff and players anywhere in the app.** Manager posts to the squad; players don't DM staff and staff don't DM players. This keeps the app FA-safeguarding-compatible when U18s arrive, and avoids a costly retrofit.
- **Team-scoped from the start:** every record belongs to a `team_id` (First Team now; youth teams later). Never assume one team.
- **Roles:** `player`, `manager`, `staff`, `chairman`. Enforce with Supabase **RLS** — a player can only read/write their own availability and read team-wide info.
- **Consent/parental fields present but unused** in the schema (`date_of_birth`, `is_minor`, `guardian_name`, `guardian_email`, `consent_at`) so youth onboarding is additive.
- **Audit log** on staff actions (who selected/changed what, when).
- **NO medical or injury data in Phase 1.** That's special-category data under UK GDPR — out of scope; do not add "injury notes" yet.
- Minimise personal data. Player phone numbers/addresses are not needed for Phase 1.

---

## DATA MODEL (Supabase — extend `supabase-schema.sql`, `IF NOT EXISTS`, safe to re-run)
Design now for the stats engine later.

- `teams` — `id`, `name` ("First Team"), `is_youth` (bool, default false)
- `app_users` — links Supabase auth user → `player_id` / role → `team_id`; `role` enum (`player`|`manager`|`staff`|`chairman`)
- `players` — `id`, `team_id`, `name`, `squad_no`, `position`, `photo`, `bio`, plus dormant safeguarding fields above. **This is the canonical player record — the website's `players.json` should ultimately derive from it.**
- `fixtures` — mirror/ingest from the existing `data/fixtures.json` (`id`, `date`, `opponent`, `is_home`, `kickoff`, `venue`, `competition`). Keep `fixtures.json` as the site's source of truth for now; the app reads it.
- `availability` — `fixture_id`, `player_id`, `status` (`available`|`unavailable`|`maybe`), `note` (short, optional), `responded_at`. Unique on (fixture_id, player_id).
- `selections` — `fixture_id`, `player_id`, `role` (`starting`|`sub`|`not_selected`), `shirt_no`, `selected_at`, `selected_by`
- `announcements` — `team_id`, `author_id`, `title`, `body`, `created_at` (broadcast only)
- `push_subscriptions` — per the existing `PUSH-SETUP.md`

### Schema must anticipate Phase 2 (the stats engine) — create these tables now, leave them empty:
- `appearances` — `fixture_id`, `player_id`, `minutes`, `started` (bool)
- `goals` — `fixture_id`, `player_id`, `minute`, `assist_player_id` (nullable)
- `cards` — `fixture_id`, `player_id`, `type` (`yellow`|`red`), `minute`
- `motm` — `fixture_id`, `player_id`, `source` (`manager`|`fan_vote`)

**🔑 CRITICAL ARCHITECTURAL RULE:** goals, assists, cards and appearances must reference **`player_id`**, never a free-text name. (The current site stores scorers as strings like `"Hill 23', Cole 67'"` — that's exactly why nothing links.) Once events are keyed to players, **player stats become a SUM over events, not a number anyone types.** Phase 2 then just fills these tables and computes `apps / goals / assists` — no migration required.

---

## PHASE 1 — BUILD THIS

### Auth & install
- Supabase Auth (magic-link email, or a simple invite code — whatever is lowest-friction for footballers; avoid passwords if possible).
- Manager/staff invite players; player signs in and is bound to their `player_id`.
- Installable PWA ("Add to Home Screen"), on-brand (Bebas/Barlow, `--yellow #FFD100`, `--green #1A5C32`, crest `img/badge.png`). Reuse the existing manifest/service-worker patterns.
- Web Push via the existing VAPID scaffolding (`push-key`/`push-subscribe`/`push-send`). ⚠️ VAPID keys are currently **NOT set** in Netlify — flag that they must be generated and set, or push silently does nothing.

### Manager view
1. **Request availability** for the next fixture (one tap) → push to the squad.
2. **Live availability board** — Available / Unavailable / No response, at a glance. Chase button re-pushes non-responders.
3. **Pick the squad** — drag/tap players into **Starting XI** and **Subs**. Warn on incomplete XI.
4. **Publish selection** → pushes every player ("You're **starting** vs Harefield, Sat 3pm — meet 1:45pm") and marks non-selected players respectfully.
5. **Broadcast an announcement** to the squad (manager/chairman/club news). No DMs.
6. See fixture details, and edit meet time / kit colour / meet location for the match.

### Player view (obsess over speed — this is where adoption is won or lost)
1. **Home = "Am I playing?"** — the next fixture, my selection status, kick-off, venue, meet time, kit colour, **one-tap directions** (maps link).
2. **Availability in two taps** — big Available / Unavailable buttons on the next fixture. Optional one-line note. Nothing else required.
3. **Squad announcement feed** (read-only broadcast).
4. **My profile** — photo, position, squad number, short bio, **which the player can edit themselves** (this quietly solves the club's content problem for free). Stats section present but showing real values only — see below.
5. Push notifications: availability requests, selection, announcements.

### ⚠️ The stats display — be honest
Player profiles currently show `Apps 0 · Goals 0 · Assists –` because the numbers are typed by hand and nobody maintains them. **Do not fake or seed these.** In Phase 1 either hide the stats block or show an honest "Stats start when the season kicks off (1 Aug)". They will populate for real in Phase 2 from match events. **Never invent a stat.**

### Integration with what already exists
- Read fixtures from `data/fixtures.json` (single source of truth).
- **Publishing a selection should be able to feed Post Studio's existing "Starting XI" card and the programme's team-sheet page** — the manager picks the squad once and the lineup graphic + programme are generated from it. Wire this if straightforward; otherwise expose the selection data so Post Studio can consume it.

---

## PHASE 2 (do NOT build now — just don't block it)
Match-event capture (goals, assists, cards, minutes, MOTM) → **stats compute themselves** → player profiles come alive → top-scorer tables → programme stats pages → auto milestone graphics ("50th appearance") that players share to Instagram (free reach for the club) → fan MOTM voting feeding player profiles. The schema above makes all of this additive.

---

## Hard rules
- **Broadcast-only comms. No staff↔player private messaging.** (Safeguarding-ready for youth.)
- **No medical/injury data.** No unnecessary personal data.
- **Never fabricate a stat, appearance or goal.** Real events or nothing.
- Team-scoped + RLS-enforced from day one. Writes server-side/PIN-or-auth gated; never trust the client.
- Vanilla JS, no build step, no framework. Brand tokens/fonts only. Atomic commits. Secrets in env vars only.
- Ship Phase 1 small and fast. Resist scope creep — adoption beats features.

## Acceptance criteria
1. A player installs the app, signs in, and marks availability for the next fixture in **two taps**.
2. The manager sees the live availability board, picks an XI + subs, publishes, and **every player gets a push telling them if they're starting, subbing or not selected**, with time/venue/meet details.
3. A player opening the app instantly sees "Am I playing?" plus where, when and directions.
4. Announcements broadcast to the squad; **no DM capability exists anywhere.**
5. Everything is team-scoped and RLS-protected, with the dormant youth/consent fields present so youth teams can be added without a rewrite.
6. Stats are **not faked** — hidden or honestly labelled until Phase 2.
7. Works installed on a phone, on-brand, offline-tolerant for reading.

## Final report
State: the schema created; the auth method chosen and why (friction matters); whether VAPID keys are set (push works or is dormant); how selection feeds Post Studio / the programme; and confirm no DM capability and no medical data exist anywhere in the build.
