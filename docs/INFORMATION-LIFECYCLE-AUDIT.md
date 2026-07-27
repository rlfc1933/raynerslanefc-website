# Information Lifecycle Audit

**27 July 2026 · traced against `1bdb032` (live) · no code changed during the audit**

> **If a volunteer enters one piece of verified information, does every part of
> the platform that depends on it update automatically from a single
> authoritative source?**

**Mostly no — but the answer is far narrower and more encouraging than expected.**

**The club has already built exactly the machine this question asks for. It runs
for one object: players. Nothing else uses it.**

---

## 0 · Three corrections to earlier audit findings

Proven wrong by following the data. Recorded first because they change the shape
of everything below.

**1. "`squad.html` reads a Google Sheet, not `squad.json`."** — **Wrong.**
`js/squad.js:16-30` tries `data/squad.json` **first** and only falls back to the
Sheet if that file is missing or empty, then to a placeholder. The Sheet is a
third-tier fallback, not the source. Audit finding P1-5 was incorrect for squad.

**2. "The portal's squad edits may never reach the public page."** — **Wrong.**
They reach it through a properly designed chain (§2).

**3. "Four competing player stores."** — **Wrong.** There is **one** store
(Supabase `la_players`) and three *generated artefacts*. That is not duplication;
that is publishing.

---

## 1 · Data Ownership Map

**SoT** = intended single source of truth. **Auto** = does a change propagate
without a human re-typing it?

| Object | Originates | SoT | Stored | Edited by | Consumed by | Auto? |
|---|---|---|---|---|---|---|
| **Players** | Manager | **Supabase `la_players`** | Supabase → generated `players.json` + `squad.json` | Portal → `la-admin-save-squad` | squad.html · player.html · Post Studio · programme · meta.js · sitemap | ✅ **Yes** |
| Squad numbers | Manager | same | same | same | same | ✅ Yes |
| Player bios / nicknames | Player | same | same | same | same | ✅ Yes |
| Player photos | Media | same (`photo_url`) | same | same | same | ✅ Yes |
| Appearances / goals / assists | Match | **`la_players` columns** (typed) | same | same | player pages | ⚠️ typed, not derived — `la_appearances`/`la_goals` exist and **no code touches them** |
| **Fixtures** | Secretary / FWP import | `data/fixtures.json` | Git | Portal Fixtures panel (`commitDomain`) | fixtures.html · club-now · main.js · Post Studio · programme · monthly posters · FWP cards · ICS · schema | ⚠️ reads yes, **writes no** |
| Kick-off / venue changes | Secretary | `data/fixtures.json` | Git | Fixtures panel | as above **+ `matchday.json` separately** | ❌ **No** |
| **Results** | Matchday volunteer | **contested — three stores** | `fixtures.json` **and** `matchday.json` **and** Supabase `live_match` | Fixtures panel **and** Match Day panel | results · form guide · Club Now · Post Studio | ❌ **No — entered twice** |
| Matchday state | Volunteer | `data/matchday.json` + `live_match` | Git + Supabase | Match Day panel | index · club-now · main.js · scan.html | ⚠️ dual-write, no reconciliation |
| **Competitions** | League/FA | `data/competitions.json` | Git | hand-edited | fixtures.html | ⚠️ manual, sourced + dated |
| Cup draws | League/FA | `data/fixtures.json` + competitions state | Git | Fixtures panel | as fixtures | ❌ manual |
| Venues | Secretary | `data/venues.json` | Git | Venues panel | Directions · import-fixtures · club-now · Lane App | ✅ single source |
| Opponents (editorial) | Media | `data/opponents.json` | Git | baked by `tools-build-opponents.js` | `js/hooks.js` + admin **only** | ⚠️ one consumer, dead-ends |
| Crests | Media | `data/crests.json` | Git | Crests panel | Post Studio · matchday · fixtures | ✅ single source |
| **News** | Media | `data/news.json` | Git | News panel | news.html · article · RSS · sitemap · meta.js · index | ✅ single source |
| Match reports | Media | `data/news.json` (an article) | Git | Match Report panel | as news | ⚠️ separate panel, same store |
| **Sponsors** | Commercial | `data/sponsors.json` | Git | Sponsors panel | index · investment · programme | ❌ **plus hardcoded `<img>` in `index.html` + `acerbis.html`** |
| Sponsor artwork | Commercial | `img/sponsors/` | Git | portal upload → `img/uploads/` | as above | ❌ **two folders, two naming schemes** |
| Programme sponsors | Commercial | free text in `programme.json` | Git | Programme panel | programme-print | ❌ **matched to logos by name string** (`sponsorLogoFor`) |
| **Gallery** | Media | `data/gallery.json` | Git | Gallery panel **or** `tools-archive-match.js` | gallery.html | ⚠️ **two writers, two folders** |
| Photographers | Media | `credit` on gallery item | Git | both writers | nothing renders it yet | ⚠️ captured, unused |
| Programmes archive | Media | `data/programmes.json` | Git | Programme panel | programmes.html | ✅ single |
| Post Studio output | Media | **nothing — ephemeral** | device downloads | — | Instagram/X | ⚠️ no record of what was published |
| Notifications | derived | computed at runtime from `matchday`/`programme`/`fixtures`/`news`/`players`/`config` | none | — | portal badge | ✅ **fully derived — no store, cannot drift** |
| Committee / officials | Secretary | `committee.json` + `officials.json` | Git | Committee panel | about · squad · programme | ⚠️ two files, overlapping people |
| Contacts / enquiries | Public | **Supabase `submissions`** | Supabase | public forms → `submit-form` | Enquiries panel | ✅ single source |
| Commercial packages | Commercial | **hardcoded in `investment.html`** | HTML | developer only | investment.html | ❌ **not editable by a volunteer** |
| League table | Wikipedia | external | none (cached 15 min) | — | fixtures.html | ✅ external, correct |
| History / honours | Club | **hardcoded in `history.html`** + JSON-LD `award` + `llms.txt` | HTML ×3 | developer only | history · schema · AI | ❌ **three copies, hand-synced** |
| Attendance (fans) | Gate | **Supabase `attendance`** | Supabase | `check-in.js` | fan card · analytics | ✅ single source |
| Match finances | Chairman | **Supabase `match_finances`** | Supabase | analytics panel | analytics | ✅ single source |
| Fan accounts | Supporter | **Supabase `fans`** | Supabase | fan-zone | fan zone · members list | ⚠️ **defined in no SQL file in the repo** |

---

## 2 · The one lifecycle that already works

**Players.** This is the reference implementation and it should be the model for
everything else.

```
Manager edits a player in the portal
        │
        ▼
_savePlayersAndGrid()                          admin.html:4579
        │  POST { pin, players[], deleted[] }
        ▼
la-admin-save-squad.js                         ONE writer
        │  upsert → Supabase la_players        ← SOURCE OF TRUTH
        │  departed players set status='left', never deleted
        ▼
P.publish(false)  → la-publish-players.js      called automatically, line 59
        │  regenerates BOTH files from Supabase
        ├──► data/players.json  → GitHub commit → jsDelivr purge
        └──► data/squad.json    → GitHub commit → jsDelivr purge
        │
        ▼
squad.html (squad.json) · player.html (players.json) · Post Studio ·
programme · edge meta.js · sitemap.js
```

**One entry. One store. Two generated artefacts. Six consumers. Zero re-typing.**

The volunteer never touches `players.json` or `squad.json` — and *cannot*, from
the portal. That is why the player object has no drift, and why `squad.json` and
`players.json` contain byte-identical name sets today.

**Everything below is a description of what happens where this pattern is absent.**

---

## 3 · Workflow traces

### Scenario 1 · Secretary creates a fixture

| Step | System | Manual? |
|---|---|---|
| 1 | Portal → Fixtures → add (or FWP one-tap import) | ✍️ |
| 2 | `commitDomain('fixtures',…)` → merge against GitHub → commit → purge | auto |
| 3 | fixtures.html · Club Now · main.js · ICS feed · schema · Post Studio · monthly posters · FWP cards | auto |
| 4 | **Match Day panel — pick the fixture again to arm the scoreboard** | ✍️ **again** |
| 5 | **Programme — opponent, date, kick-off, venue, competition re-entered** | ✍️ **again** |
| 6 | **News preview — opponent, date, venue re-entered** | ✍️ **again** |

**Score: 6 steps · 4 manual · 3 duplicate entries · 5 systems · inconsistency
risk HIGH · ~12 min · confidence MEDIUM.**

Post Studio is the exception — since `fe1a036` it inherits the fixture
automatically and cannot be wrong. **That fix is the template for steps 4–6.**

### Scenario 2 · Secretary records a result

**This is the worst workflow in the platform, and it is provable from live data.**

| Store | Written by | Contains |
|---|---|---|
| Supabase `live_match` | `pushLiveMatch` during the game | 1–0 |
| `data/matchday.json` | `pushToGitHub('matchday')` | `homeScore:1, awayScore:0` |
| `data/fixtures.json` | **a separate visit to the Fixtures panel** | `us:1, them:0` |

`mdUpsertFixture()` writes `us: null, them: null, status:'scheduled'`. **The
score never flows from the scoreboard back to the fixture record.** Verified —
there is no write-back anywhere in `admin.html`.

**Live proof, today:**

| Fixture | `matchday.json` | `fixtures.json` | Meaning |
|---|---|---|---|
| Cockfosters 18 Jul | 1–0 | `us:1 them:0` | **entered twice by hand** |
| Hayes & Yeading 4 Jul | — | `us:null status:scheduled` | **entered zero times — public as "Result to follow" for 23 days** |

Downstream of a result: results list ✅ · form guide ✅ · Club Now ✅ · schema ✅
(all read `fixtures.json`) — but **only after the second manual entry**.
Player appearances ❌ never. Goals ❌ never. Match report ✍️ separate panel.
Gallery ✍️ separate. Post Studio Full-Time ✅ (since `c65fcaa`).

**Score: 9 steps · 7 manual · 2 duplicate entries · 3 stores · risk CRITICAL ·
~15 min · confidence LOW** (the two copies can silently disagree, and one
currently does by omission).

### Scenario 3 · Media volunteer uploads photographs

Two tools, two folders, no shared convention:

| Route | Destination | Fixture link | Credit | Resized |
|---|---|---|---|---|
| Portal Gallery | `img/uploads/<ts>-<slug>` | ❌ none | ✅ (since `4a19edb`) | ✅ |
| `tools-archive-match.js` | `img/matchday/<season>/<date>-<opp>/` | ✅ `fixtureId` | ✅ required | ✅ |

`gallery.json` today points at **`img/ground/`, `img/news/`, `img/players/`** —
three further folders, none of them either upload destination.

Photos reach: gallery ✅. They do **not** reach the programme, homepage, player
pages, or Post Studio — all manual re-selection.

**Score: 5 steps · 4 manual · 0 duplicate *entries* but 5 storage locations ·
risk MEDIUM · ~10 min/match · confidence MEDIUM.**

### Scenario 4 · A new player signs

**Score: 3 steps · 1 manual · 0 duplicates · risk LOW · ~3 min · confidence
HIGH.** One record, one store, automatic propagation.

The only manual re-entry is the **announcement** — Post Studio's signing card
takes a player from the same list, so even that is now half-connected. **No
unnecessary records are created.** This scenario is healthy.

### Scenario 5 · Commercial team uploads a sponsor logo

| Location | How | Volunteer-editable |
|---|---|---|
| `data/sponsors.json` | Sponsors panel | ✅ |
| `img/uploads/<ts>-<uuid>.jpeg` | portal upload | ✅ |
| `img/sponsors/<name>.png` | **committed by hand** | ❌ |
| `index.html` — Acerbis `<img>` | **hardcoded** | ❌ |
| `acerbis.html` — Acerbis `<img>` | **hardcoded** | ❌ |
| Programme | free-text name → `sponsorLogoFor()` **string match** | ⚠️ fragile |

**Score: 6 steps · 5 manual · 3 artwork locations · risk HIGH · ~20 min ·
confidence LOW.** The name-string match means renaming a sponsor in the panel
silently drops their logo from the programme.

---

## 4 · Duplicate Effort Report — ranked by volunteer time wasted per season

| # | Duplicate work | Per event | Events/season | **Season cost** | Risk if skipped |
|---|---|---|---|---|---|
| **1** | **Result typed twice** (Match Day → then Fixtures) | 3 min | ~42 | **~2h 06m** | **Fixture publicly shows "Result to follow" indefinitely — happening now** |
| **2** | **Fixture re-identified** in Programme + Match Day + News | 6 min | ~42 | **~4h 12m** | Wrong opponent/date in the programme |
| **3** | Match report written in a panel disconnected from the result | 4 min | ~42 | ~2h 48m | Report never written |
| **4** | Sponsor artwork maintained in 3 places | 20 min | ~8 | ~2h 40m | Broken logo (happened — Acerbis) |
| **5** | Photos filed by two tools into five folders | 5 min | ~21 | ~1h 45m | Photos lost, uncredited |
| **6** | Player stats typed rather than derived | 5 min | ~42 | ~3h 30m | Stats wrong or, as now, all zero |
| **7** | Committee people in `committee.json` + `officials.json` | 5 min | ~4 | ~20m | Names disagree between pages |
| **8** | Honours in `history.html` + JSON-LD + `llms.txt` | 10 min | ~2 | ~20m | AI cites a stale honour |

**Total measurable duplicate effort: ≈ 17 hours 20 minutes per season** — over
two full working days of volunteer time spent re-typing facts the system already
holds.

---

## 5 · Supabase Authority Assessment

**Supabase is a well-secured datastore. It is not the operational heart.**

| Evidence | Finding |
|---|---|
| `create trigger` | **0** |
| `create or replace function` (RPC) | **0** |
| Realtime subscriptions | **0** |
| Scheduled jobs / cron | **0** |
| Storage buckets used | **0** — every image goes to Git |
| Tables with RLS | **24 of 24**, zero write policies |
| Automation that exists | **1** — `la-admin-save-squad` → `la-publish-players`, and it lives in a **Netlify Function**, not in Supabase |

**Supabase genuinely owns:** `la_players` (+ the whole Lane App), `submissions`,
`match_finances`, `attendance`, `fans`, `push_subscriptions`.

**Authority has leaked into Git JSON for:** fixtures, results, competitions,
news, sponsors, gallery, crests, venues, opponents, programme, config —
i.e. **every object a supporter sees on matchday.**

Is that wrong? **No, and I would not migrate it.** Git-backed JSON gives the club
free history, free rollback, free diffing, and a public site that works when
Supabase is down. The constitution's Principle 5 (survive its author leaving)
favours plain files over a database only one person can query.

**The problem is not where the data lives. It is that two stores hold the same
fact with no reconciliation** — `matchday.json`/`live_match` vs `fixtures.json`.

**Hardcoded authority leaks worth naming:** commercial packages
(`investment.html`), club honours (three copies), sponsor artwork (two `<img>`
tags). None is volunteer-editable.

---

## 6 · Information Lifecycle Diagram — the fixture

```
CREATED      Portal Fixtures / FWP import ────────► fixtures.json          ✅
VERIFIED     Season guard (import-fixtures.js)                             ✅
PUBLISHED    commit + jsDelivr purge ──► fixtures.html, Club Now, ICS      ✅
BRIEFED      Programme panel ◄── ✍️ RE-TYPED                               ❌
PROMOTED     Post Studio ◄── inherits automatically (fe1a036)              ✅
ARMED        Match Day panel ◄── ✍️ RE-SELECTED ──► matchday.json          ❌
LIVE         pushLiveScore ──► live_match + matchday.json                  ⚠️ dual
COMPLETED    ✍️ RE-TYPED into Fixtures panel ──► fixtures.json             ❌ ◄── THE BREAK
RESULTS      fixtures.json ──► results, form guide, schema                 ✅
REPORTED     Match Report panel ◄── ✍️ RE-TYPED                            ❌
CAPTURED     archive tool ──► img/matchday + gallery.json                  ⚠️ separate
ARCHIVED     — no season seal exists —                                     ❌
```

**Four breaks. One of them — COMPLETED — is where the chain actually severs**,
because it is the only point where information already held by the system must
be re-entered by a human to reach the object that everything else reads.

---

## 7 · Operational improvements — workflows, not features

Ranked by volunteer time returned per unit of risk.

**O1 · Finishing a match should write the result to the fixture.**
When the volunteer sets Full-Time / takes the scoreboard down, `matchday.json`'s
score is written into the matching `fixtures.json` record (`us`, `them`,
`status:'played'`, `scorers`) via the existing merge-safe `commitDomain`.
*Removes duplicate #1 (~2h/season) and makes "Result to follow" self-clearing.*
**No new store. No schema change. One writer, already built.**

**O2 · Arming a match should not require re-picking the fixture.**
Match Day defaults to `psNextFixture()`'s answer — the function already exists
and is already authoritative in Post Studio.
*Removes a third of duplicate #2.*

**O3 · The programme should inherit the fixture.**
Opponent, date, kick-off, venue and competition pre-filled from the selected
fixture; the volunteer writes only the editorial fields.
*Removes the rest of duplicate #2 (~4h/season).*

**O4 · Sponsor artwork should have one home.**
Portal uploads land in `img/sponsors/<slug>.<ext>` and write the path into
`sponsors.json`. The two hardcoded Acerbis `<img>` tags read from
`sponsors.json` like every other partner.
*Removes duplicate #4 and the class of failure that broke the kit partner.*

**O5 · Match report should start from the result.**
Pre-fill score, scorers and opponent; the volunteer writes prose only.

**O6 · Programme sponsors should be picked, not typed.**
Replace the free-text + `sponsorLogoFor()` string match with a select bound to
`sponsors.json` ids.

**O7 · Committee and officials should be one file.**

---

## 8 · The implementation batch

**"One match, one entry"** — O1 + O2 + O3 + O4.

Together they remove the four highest-cost duplicates (**≈ 9 hours/season**),
touch one file plus two small data reads, add no store, no dependency and no
schema change, and reuse three functions that already exist and are already
proven (`commitDomain`, `psNextFixture`, the sponsor logo resolver).

**Explicitly excluded:** anything that migrates data, renames a table, moves
authority into Supabase, or rebuilds the publishing pipeline. The Git-JSON model
is working and is the right choice for a volunteer club.

Detail, risk and test plan follow in implementation.
