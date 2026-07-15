# Claude Code — Squad Photos + Coaches + Squad Page Fix + Away Directions

Repo: `rlfc1933/raynerslanefc-website` (static HTML on Netlify, vanilla JS, no build step). **The squad roster is owned by Supabase** — `la-publish-players.js` regenerates `data/players.json` + `data/squad.json` from Supabase. Do everything below in one go. Atomic commits. Don't break the public site or the Lane App.

---

## ⛔ THREE HARD RULES
1. **Supabase owns the roster.** Set player photos on the **Supabase record (`photo_url`)** then run **`la-publish-players`**. **NEVER write photos straight into `data/players.json`** — the next publish would wipe them.
2. **Never rename a player.** DB spellings are canonical; the photo is what gets attached.
3. **Never fabricate data** — no guessed addresses, no invented players. Verified or blank+flagged.

---

# JOB 1 — Squad & staff photos
The club uploaded photos to **`img/squad pics/`** (note the space — fix that). Names differ from the DB by spelling; the correct matches are below — **use them, don't re-guess.**

### Process the images first (they're ~2MB each, ~40MB total — would cripple the page)
- Move them to a URL-safe folder: **`img/players/`**.
- Rename each to its player slug (below).
- Resize/compress with `sharp` (already a dependency): a **~800px web image (~150–250KB, WebP + JP/PNG fallback)** and a **~300px thumb** for the grid. Keep aspect, don't stretch faces.
- **Do not commit the 40MB originals** to the deployed site (gitignore them or keep in `/_source/`).

### 18 PLAYER PHOTOS → set `photo_url` in Supabase, then publish
| File in `img/squad pics/` | Player (DB name) | Supabase player id |
|---|---|---|
| Michael Adofolami.png | Michael Adefolami | player-michael-adefolami |
| Charlie Austin.png | Charlie Austin | player-charlie-austin |
| Jenyo Balogun.png | Jenyo Balogun | player-jenyo-balogun |
| Keiran Bernard-White.png | Keiran Barnard-White | player-keiran-barnard-white |
| Alfie Campbell.png | Alfie Campbell | player-alfie-campbell |
| Jaycob Campbell.png | Jaycob Campbell | player-jaycob-campbell |
| Le-Kai Chevannes.png | Le'Kai Chevannes | player-le'kai-chevannes |
| Atahan Diamond.png | Ati Diamond | player-ati-diamond |
| Matteo Dos Reis.png | Mateo Dos Reis | player-mateo-dos-reis |
| Jevan El-Kafash.png | Jevan El-Kaffash | player-jevan-el-kaffash |
| Matt Forkin.png | Matthew Forkin | player-matthew-forkin |
| Micah Haley.png | Micah Haley | player-micah-haley |
| Leon Iluobe.png | Leon Iluobe | player-leon-iluobe |
| Christon John-Ahye.png | Christon John-Ahye | player-christon-john-ahye |
| Jalen Johnson.png | Jalen Johnson | player-jalen-johnson |
| Ruben Santagelo.png | Ruben Santangelo | player-ruben-santangelo |
| Casey Yusuff-Phillips.png | Casey Yousuff-Phillips | player-casey-yousuff-phillips |
| Temi.png | Temi Animashaun | player-temi-animashaun |

After setting all 18, run **`la-publish-players`** and confirm `players.json`/`squad.json` now carry real `photo` values (currently 0 of 24).

### Signed players still awaiting a photo — LEAVE ON THE SQUAD, show a placeholder
Carl Adiku · Joshua Andrews · Badou Faye · Nathan Kpemou · Jamie Pitt · Alvin Walters.
These are **signed** — do NOT remove them. Show a clean initials placeholder; their photos come later.

### Any photo file matching NOBODY = a trialist from the shoot → **SKIP it.** Never create a player from a stray image. (Currently every file matches, so nothing is skipped.)

# JOB 2 — Manager + Coaches
- **Gary Pitt.png** → Gary Pitt, **First Team Manager** photo (squad page header + About/committee).
- **Add these two as COACHES to the CLUB tab** (`about.html` / the "Club Roles & Staff" section — likely `data/committee.json`; confirm which system owns it and use that save path, don't create a second source):
  - **Dave Roberts — Coach** (`Dave Roberts - Coach.png`)
  - **Louis Blinko — Coach** (`Louis Blinko - Coach.png`)
  Match the existing committee/staff card style.

# JOB 3 — 🔴 FIX THE SQUAD PAGE (it's publicly broken)
Live `squad.html` currently shows **"Developer Setup Required — Player Cards tab needs a Google Sheet connected"** and falls back to a Pitchero embed. It does NOT render the club's own squad.
- **Remove the Google-Sheet dependency and the "Developer Setup Required" message.**
- Render the squad **directly from `data/squad.json` / `data/players.json`** as the default view: cards with **photo, name, squad number, position**; tap → profile (photo, position, bio, stats). Photos `object-fit:cover`, lazy-loaded, initials placeholder fallback.
- A Pitchero link can stay as a secondary link, not the primary view.

# JOB 4 — Away venues + directions buttons
**20 of 22 away fixtures have `venue: ""`.** Football Web Pages gives the opponent, not their ground. Fix it once, properly.

### Verified ground NAMES (from Football Ground Map, Jun 2026) — addresses/coords you must confirm
Create/complete **`data/venues.json`** (a seed already exists). For each club find the **full address, postcode AND lat/lng** from an authoritative source (club site / Football Ground Map / FA). **lat/lng is essential** — sports-ground postcodes often route to the wrong place. Geocode free via OpenStreetMap Nominatim (no key; cache; respect usage).

| Club | Ground (verified name) |
|---|---|
| Rayners Lane | Tithe Farm Sports & Social Club, 151 Rayners Lane, Harrow **HA2 0XH** (home) ✅ |
| Broadfields United | **Tithe Farm — GROUNDSHARE (see rule below)** ✅ |
| Abingdon United | The Northcourt |
| Amersham Town | Spratleys Meadow |
| Ardley United | Ardley Playing Fields |
| Bedfont | The Orchard |
| Burnham | The 1878 Stadium |
| Easington Sports | Addison Road |
| Harefield United | Preston Park |
| Hilltop | Silver Jubilee Park (groundshare at Hendon) |
| Holyport | Summerleaze Village |
| Kidlington | Yarnton Road |
| North Greenford United | Berkeley Fields |
| North Leigh | Eynsham Hall Park |
| Northwood | Northwood Park |
| Penn & Tylers Green | Elm Road |
| Reading City | Scours Lane |
| Thatcham Town | Waterside Park |
| Wallingford & Crowmarsh | Wallingford Sports Park |
| Wokingham Town | Lowther Road |
| Metropolitan Police FC | Imber Court, Ember Lane, East Molesey **KT8 0BT** |
| **London Lions** | **⚠️ UNKNOWN — FA CUP away tie, 8 Aug. HIGHEST PRIORITY — find it or flag it loudly.** |

### 🔑 "Away" ≠ "travel"
`isHome:false` means away kit / away designation — NOT necessarily a journey. **Broadfields groundshare at OUR ground (Tithe Farm).** So the Broadfields away fixture is officially AWAY but physically at Tithe Farm. **Never infer venue from `isHome`** — they're independent. Show that fixture as **AWAY + Tithe Farm + "no travel (groundshare)"**.

### Wire it up
- Populate `venue` on every fixture in `data/fixtures.json` from the venues table (home team's ground; Broadfields = Tithe Farm). Never overwrite a venue staff set manually.
- On **every fixture card** (fixtures page, home next-match, and The Lane App) show the ground + address + three buttons using the venue **lat/lng** — free deep links, **no API key, no billing, no scraping**:
  - 🚗 Drive → `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=driving`
  - 🛣️ Waze → `https://waze.com/ul?ll=<lat>,<lng>&navigate=yes`
  - 🚇 Transport → `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=transit`
- Unverified/missing venue → show "Address to be confirmed", never a dead button or a guessed location.
- Add a **Venues editor** in the staff portal and make the fixture importer **auto-attach venues on future imports**, so this is never a manual chore again.

# JOB 5 — Health check (the club is worried the site is broken)
Confirm and report: all `data/*.json` valid; all JS parses; homepage/squad/fixtures/About render; the Lane App works; publishing a change appears live (no stale cache). Fix anything genuinely broken; report honestly.

---

## ✅ Done when
1. 18 players show their real (optimised) photo — verify a couple visually (Temi.png = Temi Animashaun; Ruben Santagelo = Ruben Santangelo). Photos set in Supabase + published — a re-publish does NOT wipe them.
2. Signed players without pics show a clean placeholder and stay on the squad; stray/trialist images are skipped.
3. Gary Pitt shows as manager; Dave Roberts + Louis Blinko show as Coaches on the Club tab.
4. The squad page renders the club's own squad from its own data — "Developer Setup Required" is gone.
5. Every away fixture shows a real ground + address; Drive/Waze/Transport buttons open the right place; London Lions resolved or flagged; the Broadfields fixture reads AWAY + Tithe Farm + no-travel.
6. Health check passes; nothing on the public site or Lane App regresses.
