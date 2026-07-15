# Claude Code Brief — Audit Fixes + Fixtures Page Redesign

Repo: `rlfc1933/raynerslanefc-website` — static HTML on Netlify, no build step, vanilla JS. Supabase powers The Lane App (`playermanager1933.html` + `la-*` functions). Full findings: **`AUDIT-2026-07-14-FULL.md`** (read it).

**Two jobs: (A) close the audit's critical/high findings. (B) rebuild the fixtures presentation so it looks like a professional football club, not a Step 5 afterthought.**

---

# PART A — AUDIT FIXES

## 🔴 A1. Revoke the exposed GitHub token (URGENT — flag to the club immediately)
The git remote embeds a **GitHub PAT in plaintext** with **write access to the live website**:
```
origin  https://ghp_****@github.com/rlfc1933/raynerslanefc-website.git
```
Treat as compromised. Instruct the club to: revoke on GitHub → issue a new **fine-grained** token (Contents: write, this repo only) → update `GITHUB_TOKEN` in Netlify → then:
```
git remote set-url origin https://github.com/rlfc1933/raynerslanefc-website.git
```
Verify the token was never committed into repo **history**.

## 🔴 A2. Two systems write the same squad files — stop the silent wipes
- `netlify/functions/la-publish-players.js` regenerates `data/players.json` + `data/squad.json` **from Supabase** and **PUTs the whole file** (full overwrite, not a merge).
- `admin.html` **still writes the same two files** via `_savePlayersAndGrid()` → `commitDomain()`.

Any player added/edited in the **admin Squad editor** but absent from Supabase is **silently wiped** on the next Lane App publish.

**Fix — Supabase is the single owner of the roster:**
- Make the admin **Squad** and **Player Profiles** editors **read-only**, with a clear on-screen note: *"The squad is managed in The Lane App."* (Link to it.)
- All roster changes go via Supabase (Lane App staff screens / `la-import-roster`).
- `players.json` + `squad.json` become **generated artifacts** — nothing else may write them.
- Remove/neutralise `_savePlayersAndGrid` so it cannot fire.

## 🔴 A3. Set `ADMIN_PIN`
Functions fall back to `process.env.ADMIN_PIN || '19332026'` — and that PIN is **printed in public source**. Confirm `ADMIN_PIN` is set in Netlify; if not, tell the club to set it.

## 🟠 A4. Fix the stale-data cache (this is the "I published but nothing changed" glitch)
An uncached fetch of `data/players.json` returned a **4-hour-old copy** while GitHub held the current one. The save had worked — a **cached copy** was being served.
- Verify `Cache-Control: no-cache` on `/data/*` in `netlify.toml` is actually applied **at the edge** (inspect production response headers).
- Make **every** front-end fetch of `data/*.json` cache-bust (`?t=` + `Date.now()`). Some do; make it universal (`js/main.js`, `components.js`, `fixtures.html`, `squad.html`, programme, Post Studio).

## 🟠 A5. Empty-state the Football Web Pages embeds (the blank white box)
The 2026-27 league table **has no data yet** (season starts **Sat 1 Aug**), so the widget renders nothing. `fixtures.html:110` forces `background:#fff` + `.fwp-embed{min-height:340px}` → **a white void on a dark site**.
- **Remove** the hard-coded `background:#fff` and the unconditional `min-height`.
- **Detect an empty render** (no child nodes / zero-height iframe after load) and show an **on-brand fallback**: *"League table starts when the season kicks off — Sat 1 August"* + link to FWP.
- Same guard on the fixtures embed. It will populate itself on 1 Aug — nothing is broken upstream.

## 🟠 A6. Away venues — 20 of 22 away fixtures have NO venue
FWP gives the opponent, not their ground. Every away fixture has `venue: ""`, so there's **no address and no directions** — the thing players and travelling fans need most.

Build a **`venues` lookup** (JSON or Supabase table) keyed by club name, containing **ground name, full address, postcode, and lat/lng**, for the 19 league clubs + the cup/friendly opponents. Then populate `venue` on every fixture from it.
⚠️ **Use lat/lng, not just postcodes** — sports-ground postcodes routinely route people into a housing estate half a mile away.

## 🟡 A7. Crests — wire up the 5 missing opponents
**All 19 league opponents already have crests** in `img/crests/` and are already wired to their fixtures. Only the cup/friendly opponents are missing — and **3 of the 5 have been supplied by the club.**

### Save these 3 PNGs (supplied) into `img/crests/` with these EXACT filenames
Match the existing convention (lowercase, dashes, **no `-fc` suffix** — e.g. `harefield-united.png`). Transparent background around the badge shape; the crest normaliser auto-trims and centres them so they match the league crests visually.

| File to create | Club |
|---|---|
| `img/crests/london-lions.png` | London Lions |
| `img/crests/new-bradwell-st-peter.png` | New Bradwell St Peter |
| `img/crests/metropolitan-police.png` | Metropolitan Police FC |

### Then set `oppCrest` on these fixtures in `data/fixtures.json` (all currently `""`)
| Fixture `id` | Opponent | Set `oppCrest` to |
|---|---|---|
| `facup-ep-london-lions-20260808` | London Lions | `img/crests/london-lions.png` |
| `favase-1q-new-bradwell-20260815` | New Bradwell St Peter | `img/crests/new-bradwell-st-peter.png` |
| `friendly-met-police-20260725` | Metropolitan Police FC | `img/crests/metropolitan-police.png` |

⚠️ These are the **FA Cup tie and the FA Vase tie** — the two biggest games on the calendar. They must render as proper crest lockups, not text.

### Still to source (2)
**Hayes & Yeading United** (`friendly-hayes-yeading-20260704`) and **Punjab Utd FC** (`matchday-current`) — both friendlies. Suggested filenames when supplied: `hayes-and-yeading-united.png`, `punjab-utd.png`. **Do not invent or generate a crest** — leave the fallback in place until the club supplies the real artwork.

### Missing-crest fallback (required)
Any fixture without a crest must render an **on-brand placeholder** — the club's initials in a tokened circle (Bebas, `--border`/`--card` styling) — **never a broken image icon and never a blank space.** Apply this generically so future opponents degrade gracefully.

## 🟡 A8. Other data gaps
- **All 24 players have `"number": 0`** — nobody has a shirt number. Add them (via Supabase, per A2).
- Player stats display `0` — until the stats engine lands, render **`–`**, never a fabricated-looking zero.

---

# PART B — FIXTURES PAGE REDESIGN (design & branding is the point)

## The problem
Fixtures currently render as a plain text list, and away games read **"Rayners Lane @ Broadfields United"**. That's a spreadsheet, not a football club. **You already have every league crest** — use them.

## The standard to hit
It should feel like a Premier League club's fixture list: **crest-led, month-sectioned, colour-coded, shareable.** Premium, on-brand, and instantly scannable. Never a text list.

## B1. Kill "@" — proper VS lockups, always
Every fixture is a **card** with a crest lockup, never a text string:

```
   [RLFC crest]   RAYNERS LANE          [HOME]
        vs
   [Opp crest]    BROADFIELDS UNITED
   ─────────────────────────────────────────
   Sat 4 Aug · 19:45 · Combined Counties Prem N
   📍 Tithe Farm Sports & Social Club
   [ Directions ]  [ Add to calendar ]  [ Share ]
```
- **Home games:** Rayners Lane listed **first**. **Away games:** opponent first — the way real clubs do it. **Never "@"**.
- Both crests always shown. Missing crest → an on-brand placeholder (club initials in a tokened circle), never a broken image.

## B2. Colour-code home vs away, and by competition
- **HOME** → club **yellow** (`--yellow #FFD100`) accent bar / badge.
- **AWAY** → club **green** (`--green #1A5C32`) accent — visually distinct at a glance, but still premium (do **not** make away games look "lesser" or greyed out).
- **Competition tags**, each with its own tokened colour: `League` · `FA Cup` · `FA Vase` · `Friendly` · `Charity`. A cup tie should feel like an event.

## B3. Month sections
Group fixtures under big **Bebas** month headers — **AUGUST · SEPTEMBER · OCTOBER …** — with a subtle divider and the fixture count. Makes a 43-game season scannable instead of endless.

## B4. Share cards (the growth feature)
Every fixture card gets a **Share** button using the **Web Share API** (`navigator.share`) with a graceful desktop fallback (copy-to-clipboard + WhatsApp/X links):
- Shares a clean line: *"⚽ Rayners Lane vs Broadfields United — Sat 4 Aug, 19:45, Tithe Farm. Up The Lane 💛"* + the fixture link.
- **Better:** generate a **branded PNG share card** for the fixture (both crests, date, KO, venue, club colours) and share the *image*. **Post Studio already builds exactly this graphic** (`psRender` / matchday card + the crest library) — reuse that engine rather than writing a new one. A fan sharing an on-brand card to WhatsApp/Instagram is free reach.

## B5. Practical detail per card
- Kick-off time, competition, **venue + one-tap Directions** (Google Maps / Waze / transit deep links using the venue lat/lng from A6 — **no API key needed**).
- **Add to calendar** (you already have `fixtures-ics.js`).
- Result shown once played (score + scorers), with a subtle W/D/L treatment.
- **Next match** visually elevated — a hero card with a countdown.

## B6. Non-negotiables
- **Brand lock:** Bebas Neue / Barlow / Barlow Condensed only. Tokened colours only. Crest `img/badge.png`, opponents from `img/crests/`.
- **Mobile-first** — most fans are on a phone. Cards must be thumb-friendly and fast.
- Crests: `object-fit: contain` (never stretched/cropped). Lazy-load below the fold.
- Vanilla JS, no build step, no framework. Data from `data/fixtures.json` — **never hardcode a fixture**.
- **Never fabricate** a fixture, venue, result or crest.

---

## Acceptance criteria
1. The exposed GitHub token is revoked/rotated and removed from the remote URL (or the club is clearly told to, with exact steps).
2. Admin's Squad/Player editors are **read-only**; Supabase is the sole roster owner; `_savePlayersAndGrid` cannot fire. Adding a player in the Lane App and republishing **does not wipe anything**.
3. `ADMIN_PIN` confirmed set; no function relies on the public default.
4. Publishing a change is visible on the live site **immediately** — no stale cached JSON (verified in production response headers).
5. The league table shows an **on-brand "starts 1 August" message**, not a blank white box.
6. Every away fixture has a **real venue with lat/lng**; Directions opens the correct ground in Maps/Waze/transit.
7. The fixtures page shows **crest-led VS lockups** — **no "@" anywhere** — colour-coded home/away and by competition, grouped by month, with the next match elevated.
8. Every fixture has a working **Share** button (Web Share API on mobile, fallback on desktop), ideally sharing a **branded PNG** generated by the existing Post Studio engine.
9. The 3 supplied crests are saved at the exact paths in A7 and wired to the FA Cup, FA Vase and Met Police fixtures; any crestless fixture shows an on-brand initials placeholder (never a broken image). All 24 players have shirt numbers; stats render `–` not `0`.
10. It looks like a professional club on a phone. Nothing regresses on the main site or the Lane App.

## Final report
State: token status; which system now owns the roster and what was made read-only; cache verification (with headers); the venues source and how many fixtures got a real ground; and a before/after of the fixtures page.
