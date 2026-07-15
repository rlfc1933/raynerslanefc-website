# Claude Code Brief — Local SEO for Non-League Football (Harrow / West London)

Repo: `rlfc1933/raynerslanefc-website` (static HTML on Netlify, no build step, vanilla JS; content in `data/*.json`). You have GitHub + deploy context. This is **technical + on-page SEO focused on local non-league discovery** — Harrow, surrounding areas (Pinner, South Harrow, Ruislip, Northwood, Wembley), West London, and every "Rayners Lane vs [opponent]" query. **Do not restructure the site or add a framework.** Extend what's there.

## What already exists (build on it, don't duplicate)
- Good base: canonical tags, OG/Twitter cards, `robots.txt`, a **static** `sitemap.xml` (~18 URLs), and JSON-LD on `index.html` (`SportsTeam`, `SportsOrganization`, `WebSite`, `FAQPage`, `Place`, `PostalAddress`) and one block on `fixtures.html`.
- Gaps (fix these): no per-fixture Event schema, no Article schema on news, a static sitemap that omits news/fixtures, and dynamic pages (`news-article.html?id=…`, `player.html?id=…`) that are poorly indexable with missing meta descriptions.

## Prime directive
Every change must be **data-driven from `data/*.json`** (so it stays correct as staff edit), on-brand, and must not break existing pages. Atomic commits, one concern each. No secrets.

---

## TASK 1 — Make the dynamic pages indexable (highest priority)
`news-article.html?id=…` and `player.html?id=…` render client-side from a query param, so Google indexes them poorly and they lack unique meta. Fix so each has genuine, unique, crawlable SEO:
- On load, set a **unique `<title>`, `<meta name="description">`, canonical, and OG/Twitter tags** from the article/player data (title, excerpt, image, date, author).
- Add **`NewsArticle`/`BlogPosting` JSON-LD** for each news article (headline, datePublished, dateModified, author, image, publisher = Rayners Lane FC with logo) and **`Person`/`Athlete` JSON-LD** for each player profile.
- Ensure the pre-rendered/default HTML has sensible fallback meta so a crawler that doesn't run JS still gets something useful. (If a `<noscript>` summary or server-side inject via a Netlify Edge function is the cleanest way to guarantee crawlability, do that.)
- Give each article a clean canonical URL and make sure it's linked from `news.html` with real `<a href>` (crawlable links, not JS-only navigation).

## TASK 2 — Per-fixture `SportsEvent` schema (wins "vs" + fixture rich results)
On `fixtures.html` (and the home next-match), emit a **`SportsEvent` JSON-LD block per fixture** from `data/fixtures.json`: `name` ("Rayners Lane FC vs [Opponent]"), `startDate`, `eventStatus`, `eventAttendanceMode`, `location` (Tithe Farm Sports & Social Club, full `PostalAddress` + `geo` lat/long), `homeTeam`/`awayTeam` (`SportsTeam`), `organizer`, and `offers`/free-entry where relevant. Update automatically as fixtures change.

## TASK 3 — Full local `SportsTeam` / `LocalBusiness` identity
Upgrade the site-wide organisation JSON-LD (in `components.js` or a shared include so every page carries it):
- `SportsTeam` + `LocalBusiness` with full `PostalAddress`, `geo` coordinates for Tithe Farm (HA2 area), `telephone`, `sport: "Soccer"`, `memberOf` the Combined Counties League, and **`areaServed`** listing Harrow, Pinner, South Harrow, Rayners Lane, Ruislip, Northwood, Wembley and the London Borough of Harrow.
- `sameAs`: X, Instagram, YouTube, Pitchero, Facebook.
- Matchday `openingHoursSpecification` for the ground.
- `logo`/`image` pointing to the crest + OG card.
- Add **`BreadcrumbList`** JSON-LD across inner pages.

## TASK 4 — Dynamic sitemap + robots
- Replace the static `sitemap.xml` with a **generated one** (build/deploy step or a Netlify function at `/sitemap.xml`) that includes **every news article and fixture/result URL** plus all static pages, each with an accurate `lastmod` from the data. Ping search engines / keep it fresh on publish.
- Keep `robots.txt` blocking `admin.html` + `staff-guide.html`; confirm it references the sitemap.
- Add per-page **canonical** tags everywhere they're missing.

## TASK 5 — Per-page on-page SEO (local intent)
- Give **every page a unique, local-intent `<title>` and meta description** (many are generic; `news-article.html`/`player.html` were missing them). Weave natural local terms — "Harrow", "non-league football", "Combined Counties", area names — without stuffing.
- One clear `<h1>` per page; sensible heading order; descriptive `alt` text on images (crest, players, ground).
- Internal linking: opponent mentions, area/venue, and related news cross-link with real anchors.
- Ensure Core Web Vitals are healthy (ties into the image + caching architecture work — flag if not yet done).

## TASK 6 — Off-site setup checklist (output, don't "build")
Produce a short `SEO-SETUP.md` the club can action (these are free and off-site, so document them rather than code them):
- Register **Google Search Console** + **Bing Webmaster Tools**, verify the domain, submit the sitemap.
- Create/claim a **Google Business Profile** for Tithe Farm (category: soccer club / sports club) for the local map pack.
- Build local citations/backlinks: Pitchero club page, Middlesex FA, Combined Counties League site, FA Full-Time, local press (Harrow Times, MyLondon), groundhopper blogs — all linking back with consistent name/address.

## Hard rules
- Vanilla JS/CSS, no framework/build-step introduced (a Netlify Edge function for meta injection is acceptable if needed for crawlability). Data-driven from `data/*.json`. On-brand. Atomic commits. No secrets.
- Validate all JSON-LD against Google's Rich Results Test before finishing.

## Acceptance criteria
1. Each news article + player profile has a unique title/description/canonical/OG and valid Article/Person JSON-LD, and is crawlable (real links + fallback meta).
2. Every fixture emits valid `SportsEvent` schema with venue geo + both teams.
3. Site-wide `SportsTeam`/`LocalBusiness` schema carries full Harrow-area `areaServed`, geo, and `sameAs`; passes Rich Results Test.
4. `sitemap.xml` is generated and includes all articles + fixtures with real `lastmod`.
5. Every page has a unique local-intent title + meta description and one clean `<h1>`.
6. `SEO-SETUP.md` lists the free off-site steps (Search Console, GBP, citations).
