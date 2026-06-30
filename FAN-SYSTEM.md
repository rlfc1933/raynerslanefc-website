# Rayners Lane FC — Fan System (data model)

The single source of truth for fans is **Supabase**. (Leads — sponsors, players,
volunteers — live in HubSpot; see the build brief. Fans are *not* duplicated
into HubSpot except for one marketing-list bridge tag, added later.)

## One way to join

A fan creates a **real account** in the Fan Zone (`fan-zone.html` → "Create My
Account", `joinOrCreate('signup')` in `js/fan-zone.js`). Email + username +
password, cross-device, powered by Supabase Auth.

- The old Netlify-Forms "Join the Family List" signup has been **removed** — it
  was a second, overlapping path. There is now exactly one.
- If `js/supabase-config.js` has no URL, the site falls back to an on-device
  card (no account) so it still works — but in production Supabase is configured,
  so accounts are real.

## What a "Lane number" is

Every member gets a permanent unique **Lane number** (`ensureLaneNo`, e.g. `1234`).
It is stored on their account and printed on their membership card as a **QR code**
(`RLFC LANE-<no> <name>`). It is how the club matches a fan to their attendance.

## How hearts are awarded

Hearts are **awarded by the club only** — never self-service. A fan earns one
"yellow heart" per match they actually attend.

- **Today:** a staffer enters the Lane numbers seen at the turnstile in admin →
  Fan Club, which writes `data/attendance.json`. The fan card reads that file and
  counts the matches containing their Lane number (`officialFor` in `fan-zone.js`).
- **Phase 1 (being built):** a staffer **scans the Lane QR** on their phone
  (`scan.html`) → `check-in.js` inserts a row into a Supabase `attendance` table →
  the fan's heart count updates live, no manual typing.
- The old self check-in button has been **removed** — it wrote a value nothing
  read, so it misled fans into thinking they'd earned a heart.

## Tables

- **`fans`** (exists): the member profile — `id` (auth user id), `name`,
  `username`, `town`, `since`, `meaning`, `lane_no`, `created_at`. Email lives in
  Supabase Auth, joined by `id`.
- **`attendance`** (Phase 1): `lane_no`, `match_date`, `home`, `scanned_at`, with
  a unique constraint on `(lane_no, match_date)` so a fan can't double-count.

## How the admin sees members

Admin → **Fan Club** lists members via `loadMembers()` (`admin.html`), which tries
the PIN-gated `admin_members` Supabase RPC (public anon key), then the
`list-members.js` Netlify function (needs `SUPABASE_SERVICE_KEY`). The same helper
feeds every fan **count** (dashboard chip, Club Analytics, meeting snapshot) so
there is one number, from one source. If neither path is configured the panel
shows a clear "Supabase not configured" banner instead of a silent empty list.

## Required environment variables (Netlify)

- `SUPABASE_URL` — project URL
- `SUPABASE_SERVICE_KEY` — service_role secret (SECRET)
- `ADMIN_PIN` — gate for admin + scanner + every fan function

(The Supabase **anon** key in `js/supabase-config.js` is public and safe to ship.)
