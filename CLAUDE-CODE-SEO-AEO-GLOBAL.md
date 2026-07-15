# Claude Code — SEO + AEO audit & upgrade (make Rayners Lane machine-readable to the world)

Repo: `rlfc1933/raynerslanefc-website` (static HTML on Netlify, vanilla JS, no build step). Nav/footer + org data are injected by `js/components.js`. Dynamic sitemap function already exists (`netlify/functions/sitemap.js`). Do a full pass. Atomic commits. **Never fabricate a fact** (see the hard rule).

## THE GOAL (be realistic AND ambitious)
Not "rank globally for football" — a Step 5 club won't. The winnable global play is: **be the cleanest, most factual, most machine-readable source about Rayners Lane FC and Harrow non-league football**, so Google *and the AI answer engines* (ChatGPT, Perplexity, Google AI Overviews, Claude, Gemini) surface and cite the club to anyone asking, anywhere — UK, Europe, US, Middle East. Reach comes via **AEO + structured data + story + social**, and the same work makes the whole thing **scalable as a platform**.

---

## 🔴 HARD RULE — never fabricate club facts
Founded year, honours, ground, capacity, league, people, history: use **only** verified data already on the site / supplied by the club. **Do not invent a single fact, honour, stat or date.** A wrong "fact" in structured data or `llms.txt` gets repeated by AI everywhere and is very hard to undo. Verified or omitted.

---

## PART A — CURRENT STATE (verified)
- ✅ Public pages have unique title / meta description / canonical / OG. Dynamic sitemap function exists. robots + sitemap wired.
- ❌ **Structured data almost absent** — only `fixtures.html` has any JSON-LD. `news`, `news-article`, `squad`, `player`, `about`, `history`, `programme`, `contact` have **none**.
- ❌ **No `llms.txt`** (the AEO gap).
- ❌ `news-article.html` + `player.html` (dynamic, query-param pages) **lack canonical + OG**.
- ❌ No `hreflang`, no explicit AI-crawler policy.

---

## PART B — SEO (structured data everywhere + technical)

### B1. Site-wide entity (inject via `js/components.js` so every page carries it)
`SportsTeam` **+** `SportsOrganization` JSON-LD: legal name, `alternateName` ("The Lane"), `foundingDate` (verified), `sport:"Soccer"`, full `PostalAddress` + `geo` (Tithe Farm), `logo`, `image`, `url`, `memberOf` (Combined Counties League), `sameAs` (X, Instagram, YouTube, Facebook, Pitchero, Wikidata when it exists), and **`areaServed`** (Harrow, Pinner, South Harrow, Rayners Lane, Ruislip, Northwood, Wembley, London Borough of Harrow, Greater London). Add `BreadcrumbList` on inner pages.

### B2. Per-page schema
- **News** (`news.html` list + `news-article.html` item): `NewsArticle`/`BlogPosting` — headline, datePublished, dateModified, author, image (`ImageObject`), publisher (org + logo). Inject at runtime from the article data **plus a crawlable fallback** (see B4).
- **Players** (`player.html`): `Person`/`Athlete` — name, position (`Role`), memberOf the team, image.
- **Squad** (`squad.html`): `SportsTeam` with `athlete[]` list.
- **Fixtures**: **`SportsEvent` per fixture** (not one generic block) — name "Rayners Lane FC vs X", `startDate` (real timestamp), `location` (venue + geo from `data/venues.json`), `homeTeam`/`awayTeam`, `eventStatus`.
- **About/History**: `AboutPage` + `Organization` with `foundingDate`, honours (verified only).
- **Contact**: `ContactPage` + `LocalBusiness` (matchday `openingHours`).
- **FAQ**: `FAQPage` on the pages that answer real questions (see AEO).
- **Validate every block against Google's Rich Results Test before finishing.**

### B3. Fix the dynamic pages (`news-article.html`, `player.html`)
Set **unique title, meta description, canonical, OG/Twitter** from the item data at runtime, and ensure a **crawlable fallback** so bots that don't run JS still get real content (see B4). Link to them with real `<a href>` (crawlable), not JS-only nav.

### B4. Crawlability of dynamic/query-param pages
`?id=` pages render client-side → poor indexing. Fix so each article/player is genuinely indexable: a **Netlify Edge function** that injects the correct `<title>`/meta/OG/JSON-LD per `id` server-side (acceptable — it's for crawlability), OR pre-render. Confirm Googlebot + AI crawlers get full content, not a shell.

### B5. Sitemap + robots
- Confirm `sitemap.js` includes **every news article and fixture URL** with accurate `lastmod`; ping Google/Bing on publish.
- robots: keep `admin`/`staff`/`playermanager` disallowed. **Explicitly ALLOW AI crawlers** — `GPTBot`, `OAI-SearchBot`, `PerplexityBot`, `ClaudeBot`, `Google-Extended`, `CCBot` (the club WANTS to be in AI answers). State the policy clearly.

### B6. Performance / Core Web Vitals
Lazy-load images, serve WebP/AVIF (the squad photos work already sizes these), preload the LCP hero, content-hash static assets for real caching. Page experience is a global ranking + AI-trust signal.

---

## PART C — AEO (answer-engine optimisation — this is the global lever)

### C1. `llms.txt` + `llms-full.txt` (root)
Create **`/llms.txt`** — a concise, factual, machine-readable markdown brief for AI crawlers: who the club is, where (ground + area), founded (verified), league/level, honours (verified), how to join/trial, sponsorship, key people, and links to the main pages + `sitemap.xml`. Add **`/llms-full.txt`** with the fuller story/history. Keep it factual and current; make publishing it part of the flow so it doesn't go stale.

### C2. Answer the questions people ask AI (FAQ, real content)
Add clear, factual Q&A blocks (rendered as visible content **and** `FAQPage` schema) answering the actual prompts: *"Who are Rayners Lane FC?"*, *"Where do Rayners Lane play?"*, *"What league are Rayners Lane in?"*, *"How do I play for / trial at a non-league club in Harrow?"*, *"How do I sponsor Rayners Lane?"*, *"When is the next Rayners Lane game?"* Concise, factual, first-sentence-answers-the-question (how AI extracts).

### C3. Entity establishment (what feeds global knowledge panels)
- **Create/claim a Wikidata item** for the club (instructions in the final report — this is largely off-site, so document it for the club to action). A Wikidata entity is what lets Google/AI build a knowledge panel and cite you internationally.
- Consistent **NAP** (name/address/phone) everywhere, identical strings — AI resolves entities on consistency.
- `sameAs` links everywhere tying the socials + Wikidata + Pitchero together into one unambiguous entity.

### C4. Freshness signals
Results, next match, news updated regularly = "live, current source" — which AI engines weight. The fixtures/next-match control and match reports already feed this; make sure `dateModified` is emitted.

---

## PART D — INTERNATIONAL (done honestly)
- **`hreflang`**: `en-GB` + `x-default` (and `en` for US/global). Cheap and correct. **Do NOT auto-translate pages** into other languages — a Step 5 club has no real Arabic/German search demand and machine-translated pages hurt more than help.
- **The real international audience is diaspora + groundhoppers + story-seekers** — reached via AEO (Part C), share-optimised **OG/Twitter cards** (big, branded, per-page images — reuse Post Studio), and social. Optimise the share cards; don't build translated microsites.
- Make times/dates unambiguous for overseas readers (state **BST/GMT**, ISO datetimes in schema).
- Delivery is already global (Netlify CDN) — keep it fast.

---

## PART E — OFF-SITE (document as a checklist for the club — mostly not code)
Produce **`SEO-AEO-SETUP.md`**: register **Google Search Console** + **Bing Webmaster Tools** (verify, submit sitemap); create the **Wikidata** item; build authoritative backlinks (Combined Counties League, Middlesex FA, FA Full-Time, groundhopper sites, Harrow/London + national non-league press, the club's "most advanced digital setup at Step 5 / Wrexham-style story" angle). Backlinks + Wikidata are what actually carry an entity internationally.

---

## Acceptance criteria
1. Every key page emits valid, relevant JSON-LD (Org/Team site-wide; NewsArticle on news; Person on players; SportsEvent per fixture; FAQPage; Breadcrumb) — **all pass Google's Rich Results Test**.
2. `news-article` + `player` pages have unique title/meta/canonical/OG and are **crawlable** (real content to bots, not a JS shell).
3. `/llms.txt` and `/llms-full.txt` exist, factual and current; robots explicitly allows the major AI crawlers.
4. FAQ content + schema answer the real questions people ask AI, first-sentence-first.
5. Sitemap includes all articles + fixtures with real `lastmod`; hreflang set; OG share cards are branded per-page.
6. **No fabricated facts anywhere** — every honour/date/stat traces to verified club data.
7. `SEO-AEO-SETUP.md` lists the off-site actions (Search Console, Bing, Wikidata, backlinks).

## Final report
State: which schema types now render on which pages (with Rich Results pass/fail); confirmation `llms.txt` is live and AI crawlers allowed; the dynamic-page crawlability fix used; and the off-site checklist. Flag anything you could not verify rather than guessing.
