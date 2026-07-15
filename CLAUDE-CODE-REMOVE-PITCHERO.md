# Claude Code — Cut the cord: remove ALL Pitchero, replace with the club's own data

Repo: `rlfc1933/raynerslanefc-website` (static HTML on Netlify, vanilla JS). **Rayners Lane has DELETED its Pitchero.** Every Pitchero link and feed on the site is now **dead** (404 / broken). Purge them and replace with the club's own pages/data. The club now owns everything Pitchero used to provide — this is a clean cut-over, not a loss. Atomic commits. **Never fabricate content** — where real text is needed and not provided, use the drafted copy below or leave a clear TODO; don't invent facts.

## SCOPE — every file with a Pitchero reference (verified)
`squad.html` (12) · `js/pitchero.js` (11) · `index.html` (7) · `fixtures.html` (7) · `news.html` (5) · `js/components.js` (5) · `about.html` (5) · `policies.html` (3) · `data/news.json` (3) · `investment.html` (2) · and 1 each in: `volunteer.html`, `trials.html`, `shop.html`, `programmes.html`, `programme.html`, `player.html`, `news-article.html`, `membership.html`, `media.html`, `innovation.html`, `history.html`, `gallery.html`, `fan-zone.html`, `fan-zone-guide.html`, `contact.html`, `data/venues.json`, `data/sponsors.json`, `tools-bake-schema.js`, `netlify/functions/fetch-news.js`.

## Dead Pitchero URLs found (all now 404):
- `pitchero.com/clubs/raynerslanefc` · `/matches` · `/news` · `/teams/259686` · `/rss.xml`
- `/news/1st-team-summer-trials-2026-…` · `/news/club-vacancies-…` · `/news/league-allocation-20262027-…` · `/news/rayners-lane-fc-202627-commercial-sponsorship-…`
- `pitchero.com/privacy-policy`

---

## TASK 1 — Kill the dead Pitchero feeds (they pull from a deleted RSS)
- **Delete `js/pitchero.js`** and its `<script src="js/pitchero.js">` include + the "Populated automatically by pitchero.js" section in `index.html` (~line 423/646). Replace that homepage section with the club's own **latest news from `news.json`** and **next match / recent results from `fixtures.json`** (both already live) — so the homepage still has a news + results block, sourced from ourselves.
- **`netlify/functions/fetch-news.js`** — if it fetches Pitchero, remove/neuter it; news now comes from `data/news.json`. Remove any front-end calls to it.
- Remove `tools-bake-schema.js` Pitchero reference.

## TASK 2 — Fix the squad page (it leans on a dead Pitchero embed)
`squad.html` currently shows a "Developer Setup Required" placeholder and a **"View Full Squad on Pitchero"** fallback — now a dead link. Per the squad-photos work: **render the squad directly from `data/squad.json` / `players.json`** as the primary (and only) view, with photos. **Remove every Pitchero link/embed/"View on Pitchero" button** from this page.

## TASK 3 — Repoint the dead Pitchero NEWS links to pages we already own
In `data/news.json` (and anywhere these are linked), these external Pitchero articles are dead. **Repoint to the club's own equivalent pages** and set `external:false` / drop the dead `link`:
| Dead Pitchero article | Repoint to (exists on our site) |
|---|---|
| 1st Team Summer Trials 2026 | `trials.html` |
| 2026-27 Commercial Sponsorship Guide | `investment.html` |
| Club Vacancies | `volunteer.html` |

For any of these with an **empty `body`**, either (a) give it a short native body (club can supply), or (b) turn the card into a direct link to the page above. Don't leave a card that links nowhere.

## TASK 4 — "League Allocation 2026-27" → native news article (no existing page)
This one has no equivalent page. Convert it to a **native article in `news.json`** (drop the dead Pitchero link). Draft body below — **the club should confirm/replace before publishing; do not add facts beyond this:**

> **League Allocation 2026-27 Confirmed**
> Rayners Lane FC will compete in the **Combined Counties Football League, Premier Division North** for the 2026-27 season — Step 5 of the National League System. The squad, led by manager Gary Pitt, returns to this level determined to make its mark. Full fixtures are on our [Fixtures page](fixtures.html), and you can follow every game live through the site and The Lane app. Up The Lane. 💛

## TASK 5 — Footer / nav / social links (`js/components.js`, all pages)
- Remove the **Pitchero** entry from the footer/nav/social row (it's injected site-wide via `components.js`).
- Where a "club platform / official page" link pointed at Pitchero, point it at **the club's own homepage** (`index.html`) or the relevant native page (Fixtures, Squad, News).
- Keep the real socials (X, Instagram, YouTube, Facebook).

## TASK 6 — Privacy policy
`policies.html` links to `pitchero.com/privacy-policy`. Replace with the club's **own privacy policy** (already on `policies.html`, or add a short GDPR-compliant privacy section). No external Pitchero policy link.

## TASK 7 — Data files + schema
- `data/sponsors.json`, `data/venues.json`: remove/replace any Pitchero URL (e.g. a league/affiliation link → point at the Combined Counties League site or the club's own page).
- Update JSON-LD `sameAs` (in `components.js` / schema): **remove the Pitchero URL**, keep the real socials + (later) Wikidata.
- Update `sitemap.xml` / `sitemap.js` if any Pitchero URL leaked in.

## TASK 8 — Sweep & verify
- Grep the whole repo for `pitchero` (case-insensitive) — **zero references may remain** in shipped files (html/js/json/xml), except historical mentions inside prose if factually appropriate (there should be none needed).
- **No dead links anywhere.** Every former Pitchero link now resolves to a live club page.
- Health check: all JSON valid, all JS parses, homepage/squad/fixtures/news render, nothing regressed.

---

## Acceptance criteria
1. `js/pitchero.js` and the Pitchero news feed are gone; the homepage news + results blocks render from `news.json` / `fixtures.json`.
2. The squad page renders our own squad with photos — no Pitchero embed or "View on Pitchero" anywhere.
3. Trials / Sponsorship / Vacancies news links point to `trials.html` / `investment.html` / `volunteer.html`; League Allocation is a native article.
4. Footer/nav/social + JSON-LD `sameAs` no longer reference Pitchero; real socials kept.
5. Privacy policy is the club's own; no external Pitchero policy link.
6. `grep -ri pitchero` on shipped files returns **nothing**; no dead links; health check passes.

## Final report
List every file changed, confirm zero remaining Pitchero references, confirm no dead links, and flag anything (e.g. an empty news body) that needs a sentence of copy from the club.
