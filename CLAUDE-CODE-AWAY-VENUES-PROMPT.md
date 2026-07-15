# Claude Code Brief — Away Venues, Addresses & Directions Buttons

Repo: `rlfc1933/raynerslanefc-website`. Static HTML on Netlify, no build step, vanilla JS. Fixtures live in `data/fixtures.json` (43 fixtures, imported from Football Web Pages). The Lane App (`playermanager1933.html`) also needs this data.

## THE PROBLEM
**20 of 22 away fixtures have `venue: ""`.** Football Web Pages gives the opponent but **not their ground**. So players and travelling fans get **no address and no directions for away games** — the single thing they need most. The committee has flagged it. This must be fixed properly, once, so nobody ever hand-hunts a postcode again.

---

## ⚠️ TWO RULES THAT MATTER MORE THAN SPEED

### RULE 1 — NEVER invent, guess or approximate an address
A wrong ground sends a coach full of players to the wrong town on a Saturday. **If you cannot verify a venue from an authoritative source, leave it blank and flag it** — a missing address is recoverable; a wrong one is a disaster. No plausible-looking postcodes. No "probably". Verified or empty.

*(This is not theoretical: an AI search summary during this audit confidently placed Broadfields United at the wrong club's ground. Verify everything.)*

### RULE 2 — "Away" is a DESIGNATION, not a location
`isHome: false` means **away kit, away dressing room, official away team**. It does **NOT** necessarily mean travel.

**Concrete case: Broadfields United groundshare at Tithe Farm — our own ground.** When Broadfields are the home team, we are officially **AWAY** (`isHome:false`) but the **venue is still Tithe Farm** and there is **no journey**.

So:
- **Never infer the venue from `isHome`.** They are independent fields.
- The fixture card must show **AWAY** (correct designation) *and* the real venue.
- For this fixture specifically, surface a clear note: **"Away — but played at Tithe Farm (groundshare). No travel."** Nobody should turn up confused.

---

## TASK 1 — Complete `data/venues.json`
A seed file already exists at **`data/venues.json`**. The **ground names are verified** (Football Ground Map, Combined Counties Prem North, updated June 2026). What's missing is **address, postcode, lat/lng** for most.

**Verified ground names (do not change these):**

| Club | Ground |
|---|---|
| Rayners Lane | Tithe Farm Sports & Social Club ✅ *(full address + coords already set)* |
| Broadfields United | Tithe Farm Sports & Social Club ✅ *(groundshare — see Rule 2)* |
| Abingdon United | The Northcourt |
| Amersham Town | Spratleys Meadow |
| Ardley United | Ardley Playing Fields |
| Bedfont | The Orchard |
| Burnham | The 1878 Stadium |
| Easington Sports | Addison Road |
| Harefield United | Preston Park |
| Hilltop | Silver Jubilee Park *(groundshare at Hendon)* |
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
| Metropolitan Police FC | Imber Court *(Ember Lane, East Molesey KT8 0BT)* |
| **London Lions** | **⚠️ UNKNOWN — FA CUP away tie, 8 Aug. HIGHEST PRIORITY.** |

**For each unverified club:** find the **full street address, postcode, and latitude/longitude** from an authoritative source — the **club's own website** (best), Football Ground Map's ground page, or the FA/league listing. **Cross-check at least two sources** where possible. Then geocode to lat/lng (free: OpenStreetMap **Nominatim**, no key required — respect its usage policy, cache results).

⚠️ **lat/lng is not optional.** Sports-ground postcodes routinely route people into a housing estate half a mile away. **Coordinates are what make the Directions button actually work.**

Set `"verified": true` **only** for entries you have genuinely confirmed. Leave the rest `false` with a clear note.

## TASK 2 — Populate `venue` on every fixture
Join `data/fixtures.json` → `data/venues.json` on the opponent name (handle `&` / `and`, `FC`/`Utd` variants). For each fixture set the venue from the **home team's** ground:
- `isHome: true` → Tithe Farm.
- `isHome: false` → the **opponent's** ground *(except Broadfields — groundshare, still Tithe Farm)*.
Keep `venue` as a resolved reference (ground + address + postcode + lat/lng available to the UI), and **never overwrite a venue a staff member has manually set**.

## TASK 3 — Directions buttons (free, no API key)
On **every fixture card** — on the fixtures page, the home-page next-match card, and in **The Lane App** — show the ground, address and three buttons, driven by the venue's **lat/lng**:

- **🚗 Drive** → `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=driving`
- **🛣️ Waze** → `https://waze.com/ul?ll=<lat>,<lng>&navigate=yes`
- **🚇 Public transport** → `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=transit`

The phone's own map app handles routing, live traffic and the user's location. **No Google Directions API. No billing. No scraping.**

**Graceful degradation:** if a venue is unverified/missing, show *"Address to be confirmed"* — **never** a dead button and **never** a guessed location.

## TASK 4 — Admin: make this maintainable forever
- Add a **Venues** editor in the staff portal: club → ground, address, postcode, lat/lng, verified flag. Staff can correct any ground in seconds (grounds move; groundshares change mid-season).
- The fixture importer must **auto-attach the venue** from this table for every future import, so **this is a one-time job, not a recurring chore.**
- Flag any imported fixture whose opponent has **no verified venue** as a to-do in admin ("2 fixtures need a ground").

---

## Acceptance criteria
1. `data/venues.json` has a **verified** ground, address, postcode and **lat/lng** for every league opponent; unverified entries are explicitly flagged, not guessed.
2. **London Lions (FA Cup, 8 Aug, away)** has a confirmed venue — or is loudly flagged as unresolved. This is the biggest game of the season so far.
3. Every away fixture on the site and in The Lane App shows the **real ground + address**.
4. **Drive / Waze / Public transport** buttons open the correct location on a phone.
5. The **Broadfields away fixture** correctly shows **AWAY** *and* **Tithe Farm**, with a "no travel — groundshare" note. `isHome` and `venue` are never conflated anywhere in the codebase.
6. Future FWP imports auto-attach venues; missing ones surface as an admin to-do.
7. **No fabricated address exists anywhere.** Unverified = blank + flagged.

## Final report
List every club with its ground, postcode, lat/lng and the **source used to verify it**. Explicitly name any club you could **not** verify — do not quietly fill a gap.
