# Claude Code Brief — Fixtures & League Data: a provider layer, powered by the Football Web Pages API

Repo: `rlfc1933/raynerslanefc-website` (static HTML on Netlify, no build step, vanilla JS; content in `data/*.json`). You have GitHub + deploy context.

**The club has no time for manual entry. NOBODY types fixtures in by hand.**

## ⏱️ ORDER OF WORK — do NOT sit blocked waiting for the API key
The free API key has been requested but may take days. **Ship everything that doesn't need it first:**

1. **Now, no key needed:** **Task 0** (the free embed — instant visible fixtures/table), **Task 5** (honest interim state + countdown), **Task 2** (import the FA Cup tie, League Cup tie and friendlies from Full-Time / the league draw), and **Task 6** (programme pages).
2. **Now, build it ready:** **Task 1** (the provider layer) and **Task 3** (the scheduled sync) — write `FootballWebPagesProvider` against the documented API shape and unit-test it against the schema, so it's complete and waiting.
3. **The moment the key arrives:** set `FWP_API_KEY` / `FWP_TEAM_ID` / `FWP_COMP_ID` in Netlify → the provider goes live → **Task 4** (live league table) switches from Wikipedia to FWP. No further code changes.

If the key never arrives, the `FullTimeProvider` fallback must still deliver fixtures. The club is never left with an empty site.

---

## ⚡ THE HEADLINE FINDING — don't scrape, use the free official API
**Football Web Pages provides a free API to non-league football clubs** (request access by email). It is structured, official, and covers everything needed:

- Base: `https://api.footballwebpages.co.uk/v2/`
- Endpoints: **`fixtures-results.json`**, **`league-table.json`**, `match.json`, `form-guide.json`, `records.json`
- Auth: send the key in an **`FWP-API-Key` header**. Rate limit: **10 requests/minute**.
- Docs: `https://www.footballwebpages.co.uk/api`

**Crucially: `netlify/functions/fetch-fixtures.js` ALREADY has hooks for `FWP_API_KEY` + `FWP_TEAM_ID`.** The original build anticipated this source — the key was simply never obtained, which is why fixtures never populated.

### 🔴 HUMAN ACTION REQUIRED (blocking — flag this to the club immediately)
**Email Football Web Pages to request the free non-league club API key** (see their `/api` page). Then set in Netlify env vars:
- `FWP_API_KEY` — the key they issue
- `FWP_TEAM_ID` — Rayners Lane's Football Web Pages team ID (confirm from `footballwebpages.co.uk/rayners-lane`)
- `FWP_COMP_ID` / season — pin the **2026-27 Combined Counties Premier Division North** competition.

⚠️ **Do NOT trust Football Web Pages' default team page without pinning the season/competition** — fetching `/rayners-lane/fixtures-results` returns **2024-25 Isthmian South Central** data (wrong season AND wrong league). Always pin season + competition explicitly and validate.

---

## THE SITUATION (verified 12 July 2026)
- **`data/fixtures.json` is the source of truth** and is **EMPTY**. Everything downstream reads it: Fixtures page, home next-match + countdown, programme, SEO/JSON-LD, Post Studio's "Load from fixture", and **`fixtures-ics.js`, which builds the subscribable calendar feed FROM it — so every fan who subscribed currently has an EMPTY CALENDAR.**
- `fetch-fixtures.js` currently falls back to **TheSportsDB** (team `148927`) which doesn't cover Step 5 → returns `{"next":null,"results":[]}`.
- `fetch-table.js` scrapes **Wikipedia** — fragile, lags badly.
- 🔴 **League fixtures are NOT released yet, no date set.** The league: *"Fixtures will be released as soon as practicable… dependent on the Step Three and Four League fixtures being released first."*
- ✅ **Step 5 season starts Saturday 1 August 2026.** ✅ **FA Cup starts Saturday 8 August 2026**; FA Cup + Vase **draws released 3 July 2026** — so the cup tie exists NOW.
- Club has pre-season friendlies (Hayes & Yeading, H, Sat 4 Jul — already played, so a RESULT; Metropolitan Police, A, Sat 25 Jul 3pm, Imber Court). Cross-check `data/news.json`.

## Other verified identifiers (for the fallback provider)
- FA Full-Time is **`fulltime.thefa.com`** (NOT `fulltime.fa.com`) — it's a **JavaScript app**, so a plain serverless fetch returns an **empty shell**.
- Rayners Lane team page: `displayTeam.html?divisionseason=999641522&teamID=387063881` → **teamID `387063881`**
- CCL Premier Division North: `index.html?divisionseason=21039069` → **divisionseason `21039069`** (verify it's the current 2026-27 one)
- Community Full-Time projects worth reading (fallback only): `github.com/hawkmauk/thefa-fulltime-api`, `github.com/jc-murray-1986/fa-full-time-mobile`.

---

## TASK 0 — Ship the free FWP EMBED now (instant visible win, no key needed)
Football Web Pages also offers a **free, no-key embed widget**:

```html
<div class="fwp-embed" data-url="combined-counties-league-premier-division-north/fixtures-results"></div>
<script src="https://www.footballwebpages.co.uk/embed.js" defer></script>
```
(The script tag is only needed once per page, even with multiple embeds.)

**Use it for DISPLAY, immediately** — a "League Fixtures & Table" section (and it suits the programme's "The Competition" page too). Also try the **club-specific and table variants**, e.g. `rayners-lane/fixtures-results` and `combined-counties-league-premier-division-north/league-table` — confirm which `data-url` values work.

**⚠️ Understand its limits — it is NOT a substitute for the API:**
- It **renders a widget; it does not return data.** It **cannot populate `data/fixtures.json`**, so it does **NOT** fix the **ICS calendar feed**, the **home-page countdown/next match**, the **programme**, **Post Studio "Load from fixture"**, or the **SEO `SportsEvent` schema** — all of which read `fixtures.json`.
- It's third-party styling (will clash with the dark yellow/green brand) and adds a third-party script — load it `defer`, scope it, and style/contain it as best you can so it doesn't wreck the page.
- **Do not reverse-engineer the endpoints `embed.js` calls in order to bypass the API key.** The API key is free for non-league clubs and is being requested — use the embed for display as intended, and the API for data.

So: **embed = display today; API = data that powers everything else.** Ship both.

## TASK 1 — Build a PROVIDER LAYER (the key architectural decision)
The club intends to grow this into a platform for multiple clubs. Abstract the data source so it can be swapped without touching the app. Define one interface:

```js
// FootballProvider
getFixtures()  // upcoming
getResults()   // played
getTable()     // league standings
getMatch(id)   // optional detail
```

Implement, in priority order:
1. **`FootballWebPagesProvider`** — **PRIMARY.** Uses the free non-league API above (`FWP-API-Key` header, respect the 10 req/min limit, cache aggressively). Covers fixtures, results **and** the league table — so it can replace the Wikipedia table scrape too.
2. **`FullTimeProvider`** — **FALLBACK.** FA Full-Time. Prefer any official iCal/CSV/widget export; otherwise find the underlying JSON/XHR endpoint the page itself calls (inspect network traffic) rather than rendering a browser. Only if neither works, a scheduled **GitHub Action + Playwright** that renders the page and commits `data/fixtures.json` (fits the repo's git-as-CMS pipeline; free; avoids Chromium-in-serverless).
3. **`ManualProvider`** — final fallback: whatever staff entered in `admin.html` / a bulk paste-CSV import.

The app calls `provider.getFixtures()` and never cares which source answered. Config picks the provider; failover is automatic (FWP → Full-Time → Manual). **Normalise every provider's output to the existing `fixtures.json` schema — do not rename fields:** `id`, `date` (`YYYY-MM-DD`), `opponent`, `isHome` (bool), `kickoff` (`HH:MM`), `venue`, `competition`, plus `us`/`them` for results.

## TASK 2 — Import everything REAL right now
Populate `data/fixtures.json` with what genuinely exists today, via the provider layer:
- **The FA Cup tie** (Extra Preliminary Round, **Sat 8 Aug 2026**) and the **FA Vase** tie if applicable — find it via FWP, Full-Time, or the league's draw summary (`eefconline.co.uk/cupsummary.html`; the league also publishes it as images).
- **CCL League Cup** draw (made at the AGM, 20 June 2026), if drawn.
- **Pre-season friendlies** — upcoming as fixtures, already-played as **results**.

Then **verify end-to-end**: Fixtures page lists them, home countdown shows the real next match, and **`/.netlify/functions/fixtures-ics` returns real events** so fans' subscribed calendars finally populate.

**🚫 ABSOLUTE RULE: never invent a fixture, opponent, date, result or table position.** Everything traces to a real source. If you can't retrieve the FA Cup tie, **say so and stop** — a fabricated fixture is far worse than a missing one. (A naive fetch of Football Web Pages nearly served a fictional 2024-25 Isthmian season — validate league + season before writing.)

## TASK 3 — Auto-sync so league fixtures land with nobody watching
Scheduled sync (every 6–12h; plus an on-demand "Check now" button in admin) through the provider layer:
- Diff against `fixtures.json`: NEW · CHANGED (date/time/venue) · RESULT · POSTPONED/REMOVED.
- **Detect the big moment:** when the full league fixture list appears, notify staff (bell/push) — *"League fixtures released — N fixtures ready to import."*
- **Stage for approval; never blind-overwrite.** Fixtures get rearranged constantly and a blind sync could wipe staff-entered scores/notes. Show a reviewable diff in admin → Fixtures with per-row accept + "import all". Optional **"auto-apply brand-new fixtures"** toggle (safe: only adds); changes/results always need approval.
- Preserve `commitDomain`'s re-fetch-and-merge safety.
- **Resilience:** validate parsed output (shape, sane dates, correct league + season) before writing. On failure **write nothing**, log, and **alert staff** that the sync is broken. Never fail silently, never write garbage.

## TASK 4 — League table: live, via the provider
Serve the table from **`FootballWebPagesProvider.getTable()`** (`league-table.json`) instead of Wikipedia; keep the Wikipedia parse as a fallback. Cache ~15–30 min. Handle the **pre-season state gracefully** (right now every team has 0 played) — show an honest "season not started" rather than a misleading table. Highlight Rayners Lane's row; promotion/relegation shading from real standings only.

## TASK 5 — Honest interim state (league fixtures pending)
No empty "Coming Soon" / "vs TBC" holes. Home + Fixtures pages show a **real countdown** to the next actual match (FA Cup tie / friendly) and to the **season start, Sat 1 Aug 2026**, with a clear line: *"League fixtures to be released — season kicks off Sat 1 August. FA Cup: [opponent], Sat 8 August."* On-brand; blank-if-empty for anything genuinely unknown.

## TASK 6 — Programme: fixtures pages + live table
`programme-print.html` already has a live-fed League Table page ("Where We Stand"), a "The Competition" page, and a small "Coming Up" page. Expand:
1. Add a full **"Fixtures & Results" spread (1–2 pages)** from `fixtures.json` — full season schedule with results filled in as played. Fill the page properly (no dead white space), on-brand, crests where sensible; handle "league fixtures TBC" honestly pre-release.
2. League Table page reads the **live provider** feed.
3. Mirror both into the online `programme.html` (sortable table, results timeline).
4. Blank-if-empty gracefully.

---

## Hard rules
- **`fixtures.json` stays the single source of truth**; the provider layer populates it. Nothing bypasses it — all downstream features (site, countdown, ICS, programme, SEO, Post Studio) keep working unchanged.
- **Never fabricate football data.** Real source or nothing. Always validate league + season before writing.
- Never overwrite staff-entered scores/notes without approval.
- Vanilla JS, no build step, no new framework (a scheduled GitHub Action is acceptable for the Full-Time fallback). Brand tokens/fonts only. Atomic commits. Keys in Netlify env vars, never committed.

## Final report
State: whether the FWP API key was obtained and working; which provider served the data; the FA Cup tie found (with source); what was imported; the sync schedule and what's auto vs approval-gated; confirmation that **the ICS calendar now returns real events**; and that the programme's fixtures + table pages generate from live data. Flag clearly if the club still needs to email Football Web Pages for the key.
