# Claude Code — Build the "Innovation" flagship page (the tech/AI story that sells sponsors)

Repo: `rlfc1933/raynerslanefc-website` (static HTML on Netlify, vanilla JS, no build step). Brand tokens: `--yellow #FFD100`, `--green #1A5C32`, black; fonts Bebas / Barlow. Existing sponsorship page: `investment.html`.

## THE MISSION
Make one thing undeniable to two audiences at once:
1. **Rival clubs** — "Rayners Lane are the club redefining what non-league can do with tech and AI."
2. **Sponsors** — "Put your brand on the most technologically advanced club at this level."

Build a **cinematic, scroll-telling flagship page** — `innovation.html` (linked prominently from the nav, homepage and `investment.html`) — that showcases what the club has genuinely built and converts it into a sponsorship pitch. This is a **positioning + sales asset**, not a feature list.

---

## 🔴 HARD RULE — real capabilities only, zero fabricated stats
Everything on this page must be **true and verifiable**. Showcase real, shipped features (below). **Do NOT invent audience numbers, reach figures, follower counts, engagement %, or "10,000 fans" claims.** Where a metric would help, either use a **real** figure the club supplies, or frame as honest capability/potential ("every goal auto-posts across five platforms", not "seen by X people"). A sponsor who catches one fake number is gone. If unsure, leave the number out.

---

## WHAT WE'VE ACTUALLY BUILT (the true story — use these, verified this month)
- **A custom staff portal** — the whole club + website run from a phone, no developers, no agency.
- **The Lane App** — a player & manager PWA: availability, squad selection, matchday & training check-in, private feedback, live push notifications.
- **Live match scoreboard** — real-time scores to fans' phones as they happen.
- **Automated fixtures & league table** — synced from official data, always current.
- **Auto-generating digital matchday programme** — EFL-standard, built from live club data, printable + online.
- **Post Studio** — an on-brand graphics engine with **AI copywriting** (rewrites match notes into social posts) and **AI background-removal** for player cards.
- **Fan Zone** — digital member cards, a loyalty/rewards system, QR matchday check-in.
- **Subscribable fixtures calendar**, installable app, and push alerts.
- **Answer-engine ready** — structured so AI assistants (ChatGPT, Perplexity, Google AI) can surface the club.

Framing line (true and powerful): **"A Step 5 club running like a top-flight operation — with technology most clubs three or four divisions above don't have."**

---

## PAGE STRUCTURE (cinematic, mobile-first, on-brand)

1. **Hero** — full-bleed, bold: *"THE MOST ADVANCED CLUB IN NON-LEAGUE FOOTBALL."* Sub: the framing line above. One primary CTA: **"Partner with The Lane"** → sponsorship. Reuse the existing WebGL/hero style so it feels premium, not templated.

2. **The manifesto** (why this matters) — 2–3 sentences: independent, ambitious, building the blueprint for the modern community club; sponsors don't just get a logo on a shirt, they get a stake in the story other clubs are copying.

3. **The stack — shown, not listed** — a scroll-telling section, one strong visual "moment" per capability (real screenshots/mockups of the portal, the app, the live scoreboard, Post Studio, the programme). Each with a punchy line: what it does + why it's unusual at this level. Animate on scroll (GSAP/CSS, respect reduced-motion). This is the "shout at people" section — make it feel like an Apple product page.

4. **Why it matters to a SPONSOR** — translate tech → commercial value, honestly:
   - Association with innovation and a genuinely differentiated brand story.
   - Your brand rendered *natively* into the club's content engine — auto-generated match graphics, the digital programme, player cards, the app.
   - Measurable, digital-first exposure (frame as capability; use real numbers only if supplied).
   - A club that produces content constantly = a partner that keeps your brand visible, not a static logo.
   - **Player sponsorship** as a product (name/brand on a player's profile, card and goal graphics).

5. **Packages / call to action** — tiers (or link into the existing `investment.html` packages) + a clear enquiry path (reuse the existing sponsor-enquiry form / HubSpot lead function — don't build a new one). Big, obvious "Become a partner" CTA.

6. **The pitch-ready close** — a confident sign-off + share buttons (so other clubs and press actually pass it around) and a link to download/print a one-page sponsor deck if easy.

---

## INTEGRATION & GUARDRAILS
- Link it from the **main nav**, a **homepage band**, and the top of **`investment.html`**.
- Reuse existing components (hero, nav/footer via `components.js`, sponsor-enquiry form, Post Studio assets). Don't duplicate systems.
- Real screenshots of the actual portal/app where possible (the club can supply); otherwise on-brand recreations clearly representing real features — **never mock a feature that doesn't exist.**
- Brand tokens/fonts only. Mobile-first, fast (lazy-load, optimised images), accessible.
- Add the page to `sitemap.xml`; give it strong `<title>`/meta/OG + JSON-LD (`WebPage` + `Organization`) so it's shareable and AI-surfaceable.
- Vanilla JS, no build step. Atomic commits. Nothing else regresses.

## Acceptance criteria
1. `innovation.html` exists, is cinematic and on-brand, and reads as a positioning + sponsor-conversion asset (not a feature dump).
2. Every capability shown is **real**; **no fabricated metrics** anywhere.
3. It's linked from nav, homepage and `investment.html`, and routes to the existing sponsor enquiry flow.
4. Share buttons + branded OG card so clubs/press can spread it.
5. Fast and flawless on a phone; nothing else on the site breaks.

## Final report
State: the page's sections, which real features are showcased and how (screenshot vs recreation), confirmation no invented numbers were used, and where it's linked from.
