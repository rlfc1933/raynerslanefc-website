# Rayners Lane FC — SEO setup (free, off-site — 30 mins)

The **on-site** SEO is built and live (schema, per-page meta, dynamic sitemap,
local signals). These remaining steps are free accounts and listings you set up
once — they're what actually gets The Lane into Google's local results and the
map pack for Harrow-area searches.

## 1. Google Search Console (do this first — ~10 min)
1. Go to **search.google.com/search-console** → **Add property** → **URL prefix**
   → `https://raynerslanefc.co.uk`.
2. Verify. The site already has a `google-site-verification` meta tag, so the
   **HTML tag** method should verify instantly. (If it asks for a new code,
   paste it into `js/components.js` where the current `google-site-verification`
   meta is set.)
3. **Sitemaps** → submit `https://raynerslanefc.co.uk/sitemap.xml` (it's now
   dynamic — includes every news article automatically).
4. Over the next days: check **Pages** (indexing), **Performance** (what people
   search to find you), and use **URL Inspection** to request indexing of new
   articles.

## 2. Bing Webmaster Tools (~5 min)
- **bing.com/webmasters** → add `raynerslanefc.co.uk` → you can **import from
  Google Search Console** in one click. Submit the same sitemap. (Covers Bing +
  DuckDuckGo + ChatGPT search.)

## 3. Google Business Profile — the map pack (~10 min, highest local value)
- **business.google.com** → create a profile for the club at **Tithe Farm
  Sports & Social Club, 151 Rayners Lane, Harrow HA2 0XH**.
- Category: **Soccer club** (add **Sports club**, **Association football**).
- Add: crest as logo, matchday photos, the `info@raynerslanefc.co.uk` contact,
  website `https://raynerslanefc.co.uk`, matchday hours (Sat 2–5pm).
- Verify (postcard/phone). This is what puts The Lane on **Google Maps** and in
  the local "sports clubs near me" pack.

## 4. Local citations & backlinks (consistent Name/Address/Phone)
Use the **exact** name + address everywhere so Google trusts the local signal:
> Rayners Lane FC · Tithe Farm Sports & Social Club, 151 Rayners Lane, Harrow HA2 0XH
- **Pitchero** club page → link back to `raynerslanefc.co.uk`.
- **Combined Counties League** site + **Middlesex FA** + **FA Full-Time** club pages.
- Local press for coverage/links: **Harrow Times**, **MyLondon**, **Harrow Online**.
- Non-league / groundhopper blogs and directories (e.g. Non-League Matters,
  Pyramid Passion) — a listing with a link.
- Every social bio (X, Instagram, YouTube, TikTok, Facebook) → link the site.

## 5. Keep it fed
- Publish match reports/news regularly in the admin — each one becomes an
  indexable page with its own schema and lands in the sitemap automatically.
- After a big story, use Search Console **URL Inspection → Request indexing** to
  get it crawled within hours.

---
### Still-open technical follow-ups (optional, for the developer)
- **Social share cards for individual articles/players:** titles/OG for those
  pages are set with JavaScript. Google renders JS so it indexes them, but
  Facebook/X link-preview scrapers don't run JS — so a shared article currently
  falls back to the site-wide OG card. To give each article its own share image,
  add a **Netlify Edge Function** that injects `<meta og:*>` into
  `news-article.html`/`player.html` server-side from the `id`.
- **Per-fixture pages:** fixtures render on one page, so there's no per-match
  URL. If "Rayners Lane vs X" match pages are wanted, generate them per fixture
  (adds per-match `SportsEvent` URLs to the sitemap).
