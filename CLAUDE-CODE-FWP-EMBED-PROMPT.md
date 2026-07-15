# Claude Code Brief — Embed Football Web Pages fixtures/table (no API key) + one-tap import

Repo: `rlfc1933/raynerslanefc-website` (static HTML on Netlify, no build step, vanilla JS; content in `data/*.json`). You have GitHub + deploy context.

**Decision made: use the free Football Web Pages EMBED. Do NOT wait for, or require, an API key.** The club accepts FWP's own widget styling.

---

## The embed
```html
<div class="fwp-embed" data-url="combined-counties-league-premier-division-north/fixtures-results"></div>
<script src="https://www.footballwebpages.co.uk/embed.js" defer></script>
```
The `<script>` tag is only needed **once per page**, even with multiple embeds.

**Discover and confirm the working `data-url` variants** before building — try at least:
- `combined-counties-league-premier-division-north/fixtures-results` (whole division)
- `combined-counties-league-premier-division-north/league-table`
- `rayners-lane/fixtures-results` (club-specific — matches their site URL pattern; **prefer this if it works**)

Report which ones render.

---

## TASK 1 — Put the embeds on the site, on-brand
1. **Fixtures page (`fixtures.html`)** — embed the fixtures/results widget. Use the **club-specific** `data-url` if it works; otherwise the division-wide one.
2. **League table** — embed the `league-table` widget (on `fixtures.html` and/or a league section). This can **replace the fragile Wikipedia scrape** in `fetch-table.js` for display purposes.
3. **Highlight Rayners Lane.** With the division-wide embed, make our rows unmistakable — CSS-target rows containing "Rayners Lane" to give them the club yellow (`--yellow #FFD100`) background / bold treatment, exactly like the existing `table.lt tr.me` pattern in the programme. If the widget's markup makes CSS targeting impossible, apply a small post-render script that finds and marks our rows once the widget has loaded.
4. **Contain the third-party styling.** It will clash with the dark yellow/green brand. Wrap each embed in a branded container (section header in Bebas, club framing), scope/override its CSS as far as its markup allows, and make sure it's responsive and doesn't break mobile. Load the script `defer`. If it can't be made to look acceptable, say so and show what's possible rather than shipping something ugly.
5. **Graceful failure:** if the widget doesn't load (blocked, offline, script error), show a clean on-brand fallback message + a link to the league on Football Web Pages. Never a blank hole.

## TASK 2 — One-tap "Import fixtures from FWP" in admin (this is the important one)
**The embed only *displays* — it cannot fill `data/fixtures.json`.** That file is what powers the **subscribable calendar feed (`fixtures-ics.js`), the home-page next-match + countdown, the matchday programme, Post Studio's "Load from fixture", and the SEO `SportsEvent` schema.** Right now `fixtures.json` is EMPTY, so **every fan who subscribed to the calendar has an empty calendar.** Fix that without an API key:

Add an **"Import fixtures from Football Web Pages"** button to **admin → Fixtures** that:
1. Loads the FWP widget into a **hidden container** on the admin page.
2. Waits for it to render, then **parses the rendered DOM** for match rows.
3. **Filters to Rayners Lane matches only** (if using the division-wide embed) and normalises them to the existing schema — **do not rename fields**: `id`, `date` (`YYYY-MM-DD`), `opponent`, `isHome` (bool), `kickoff` (`HH:MM`), `venue`, `competition`, plus `us`/`them` for played results.
4. Shows a **preview table** of what it found — staff confirm before anything is saved.
5. On confirm, writes via the existing **`commitDomain`** merge-safe save (re-fetch + merge, never clobber staff-entered data).

This is reading publicly rendered output on our own page — no key, no gated API.

**Validation before writing (required):**
- Confirm the data is the **correct season and league** (2026-27, Combined Counties Premier Division North / cup ties). ⚠️ A naive fetch of Football Web Pages' Rayners Lane page previously returned **2024-25 Isthmian South Central** data — wrong season *and* wrong league. If what you parse looks like the wrong competition or season, **abort and tell the user.**
- Sanity-check dates, and that every row is genuinely a Rayners Lane match.
- **🚫 NEVER invent, guess or auto-fill a fixture, opponent, date or result.** Parse it or fail loudly. A fabricated fixture is far worse than a missing one.
- If parsing fails (FWP changed their markup), fail with a clear message — never write partial or garbage data.

**Then verify end-to-end:** after an import, the Fixtures page shows real matches, the home countdown shows the real next match, and **`/.netlify/functions/fixtures-ics` returns real events** so subscribed calendars finally populate.

## TASK 3 — Import what exists right now
League fixtures are **not released yet** (the league: *"Fixtures will be released as soon as practicable… dependent on the Step Three and Four League fixtures being released first."*). But these are real and exist today — import them:
- **The FA Cup tie** (FA Cup starts **Sat 8 Aug 2026**; draws released 3 July).
- **The CCL League Cup** tie (drawn at the AGM, 20 June 2026), if applicable.
- **Pre-season friendlies** — upcoming as fixtures; already-played ones (e.g. Hayes & Yeading, H, Sat 4 Jul) as **results**. Cross-check `data/news.json`.

## TASK 4 — Honest interim state
No empty "Coming Soon" / "vs TBC" holes. Home + Fixtures pages show a **real countdown** to the next actual match and to the **season start, Sat 1 Aug 2026**, with a clear line like: *"League fixtures to be released — season kicks off Sat 1 August."* On-brand; blank-if-empty for anything genuinely unknown. The embed sits alongside this showing the live league picture.

## TASK 5 — Re-run after the league publishes
When the league releases the fixtures, they'll appear in the FWP widget automatically. Staff just tap **"Import fixtures from FWP"** again → preview → confirm → the whole season lands in `fixtures.json` and flows out to the site, countdown, calendar, programme, SEO and Post Studio. Make this obvious in the admin UI (a short line of instruction), and — if easy — add a check that notices when the widget contains many more fixtures than `fixtures.json` and nudges staff to re-import.

---

## Hard rules
- **`fixtures.json` remains the single source of truth** for the calendar, countdown, programme, SEO and Post Studio. The embed is display only; the import populates the file.
- **Never fabricate football data.** Parse a real source or fail loudly. Always validate league + season before writing.
- Never overwrite staff-entered scores/notes — use the existing merge-safe save.
- Vanilla JS, no build step, no new framework. Brand tokens/fonts only (Bebas/Barlow, `--yellow`, `--green`). Atomic commits. No secrets.
- No API key is required anywhere in this brief. (The free FWP non-league API remains a future upgrade if the club ever wants cleaner data and full brand control — note it, don't build it.)

## Final report
State: which `data-url` variants work; where the embeds are placed and how Rayners Lane rows are highlighted; how the widget was contained/styled against the brand; whether the "Import from FWP" parse works and what it imported (with season/league confirmed); and confirmation that **the ICS calendar feed now returns real events**.
