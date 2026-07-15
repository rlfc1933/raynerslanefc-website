# Rayners Lane FC — Full Audit & Upgrade Review

_Verified 4 July 2026 against the actual current files, git history, and backends — not the older June audit docs (several of those findings have since been fixed in later commits, so this supersedes them where they disagree)._

---

## 1. The honest verdict: does it genuinely work?

**Yes — the engineering is real and in good shape.** This is not a hollow demo. The hard parts are built correctly and proven in production. What's holding it back is not code — it's an **empty content tank** and **a handful of server settings I cannot see from the files.**

Three-line summary:

- **The machine works.** Admin → GitHub → live-site publishing pipeline is real, with actual production commits from the club account. Real-time scoreboard, PWA, push scaffolding, lead engine, 28-page programme builder — all present and wired.
- **The tank is near-empty.** Fixtures, squad, players, attendance, programmes and gallery are all empty arrays. To a visitor that reads as "unfinished," even though the framework behind it is strong.
- **A few wires are server-side.** Push alerts, member list, and welcome emails depend on environment variables in Netlify that I can't verify from here. If unset, those features are silently off.

---

## 2. What I verified as genuinely working ✅

- **Publishing pipeline** — every editor now uses `commitDomain()`, which **re-fetches the live JSON, merges, then pushes.** This fixes the single most dangerous bug the June audit found (stale saves silently wiping other staff's work). It's now fixed *across all editors*, not just News. This was the most important thing to get right and it's done properly.
- **Real-time scoreboard** — `live-score.js` writes the score to a Supabase row instantly (no rebuild wait), PIN-gated, tolerant of either key name, degrades gracefully if Supabase isn't configured. The old dead duplicate scoreboard block in `main.js` was removed. Solid.
- **All JSON data files are valid.** All JavaScript (functions + front-end) parses cleanly. No syntax errors anywhere.
- **No broken internal links or missing assets.** (A raw scan flagged 27, but every one is a false positive — JS template fragments, not real links.)
- **Push notifications degrade honestly** — the "Enable Match Alerts" button now auto-hides when the server reports push isn't configured, so fans never see a dead control.
- **News is fully admin-managed** — the four hard-coded "baked" articles the June audit flagged are gone; the newsroom is now driven entirely from `news.json`.
- **`investment.html` sponsors now render from `sponsors.json`** (the hard-coded names are just fallbacks). Footer duplicate-"Sponsorship" bug fixed, Volunteer link added, Results anchor now resolves.
- **Server keeps the GitHub token server-side** and allow-lists write paths to `data/*.json` and `img/uploads/*`. Good security hygiene for the write proxy.

Bottom line: **most of the older audit's findings have already been fixed.** Trust the code, not the June docs.

---

## 3. What actually still needs attention

### 🔴 Highest impact — fill the content tank (this is content, not code)
These files are empty right now, and the emptiness is public-facing:

| File | Public sees |
|---|---|
| `fixtures.json` | "Fixtures coming soon", homepage "vs TBC", no countdown |
| `squad.json` / `players.json` | blank squad page, no player profiles or programme team-sheets |
| `attendance.json` | the loyalty/hearts "streak" system has never run |
| `programmes.json` | no matchday programmes despite a full 28-page builder |
| `gallery.json` | placeholder gallery |

**The single highest-leverage move for the whole club:** enter the 2026–27 fixtures and the first-team squad in admin, then run one real matchday end-to-end (go live, tap a score, publish a programme). That one action lights up the homepage, countdown, squad page, programme stats and the scoreboard simultaneously.

### 🟡 Must-check server settings (I can't see these from the files)
In **Netlify → Site configuration → Environment variables**. If missing, the matching feature is silently dead:

- `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` (or `SUPABASE_SECRET_KEY`) — without these: no real-time scoreboard, no QR check-in, admin can't see fan members.
- `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` — without these: match-alert push is off (button stays hidden).
- `RESEND_API_KEY` — without it: no fan welcome email, no sponsor-enquiry alert.
- `ADMIN_PIN` — **set this.** Otherwise the public repo default (`19332026`) is your live gate.
- Run the `supabase-schema.sql` once in Supabase (creates `live_match` + `attendance` tables) if not already done.

### 🟡 Security posture (small-club-appropriate, but know the truth)
- The match-finances "analytics" gate is **client-side only.** Its password hash sits in `data/config.json`, which is public, and `analytics.json` is a public committed file. **If match takings/attendance are sensitive, they must move behind a server function — the JS gate is not real security.**
- The **role model is cosmetic** — "Chairman-only" tiles are UI only; the shared PIN is the sole real gate. Fine for a volunteer tool; just don't treat roles as security.
- `emails.json` currently holds only role addresses (no personal names) — clean today, but never enter real personal emails there since the repo is public.

### 🟢 Low / polish
- Two brand-token systems still coexist (`brand/tokens.css` `--rl-*` used by admin/programme; `css/style.css` `--yellow/--green` everywhere else). They duplicate the same colours under different names and can drift — worth unifying (`design:design-system` skill is built for exactly this).
- Heavy inline hard-coded hex in a few pages instead of tokens.
- Worth a proper accessibility pass before the season (`design:accessibility-review`).

---

## 4. The recommended open-source stack — my honest read

The list you were given is **real and well-chosen** — every project on it is a genuine, popular, actively-maintained tool. But it's a *menu for a 20-person product team*, not a to-do list for a Step 5 club run by volunteers. Dumping 40 self-hosted services on yourselves would create a huge maintenance burden and most would sit unused. The skill is picking the 20% that delivers 80% of the value **and fits what you've already built.**

### ✅ Genuinely worth doing — high value, low burden, fits your architecture
| Tool | Why it fits *you specifically* |
|---|---|
| **Directus** or **Strapi** (CMS) | This is the biggest real upgrade. Your admin is a hand-built JSON editor — powerful but bespoke. A proper headless CMS lets committee members edit fixtures/players/sponsors/news with a real UI, roles, and media handling, and your pages read its API instead of flat JSON. Consider it the *natural evolution* of your current admin. |
| **Supabase** | You're **already using it** (scoreboard, check-in). Lean in — it also gives you a real database, auth, storage and realtime on a free tier. It can replace the "commit JSON to GitHub" pattern entirely over time. |
| **n8n** (automation) | The single highest-leverage add. "Goal scored → post to Instagram + Facebook + X + newsletter + site" automatically. Maps directly onto your manual Post Studio. Self-host one instance. |
| **Umami** or **Plausible** (analytics) | Privacy-friendly, lightweight, one container. Tells you what fans actually look at. Easy win. |
| **Cal.com** (scheduling) | Trials, pitch hire, physio, meetings — real recurring club need, clean tool. |
| **Listmonk** (newsletters) | You already collect members; this sends to them properly. Pairs with your lead engine. |
| **Lucide / shadcn/ui / GSAP / Chart.js** | Front-end polish you can adopt incrementally without re-platforming. Chart.js specifically fits your match-centre/attendance stats. |

### 🤔 Nice, but only once the basics are humming
Leaflet (interactive ground map), ECharts (heavier charts), Plyr (highlight video player), Meilisearch (instant search), Immich/PhotoPrism (media library), Uptime Kuma (monitoring), Formbricks (forms). All good — but they solve problems you don't feel yet. Revisit when you have content and traffic.

### ⚠️ Cool-factor, high-cost, low-payoff for a Step 5 club — I'd skip for now
- **Three.js / React Three Fiber 3D stadium, player holograms, tsParticles** — lovely demos, real dev/performance/maintenance cost, and they don't help you win members or sponsors. Your existing WebGL hero already delivers the "wow." Don't chase this.
- **face-api.js face recognition to auto-tag players** — genuinely thorny on privacy/consent (minors especially), and unreliable. Not worth the safeguarding risk.
- **The full "AI brain" (Open WebUI / LibreChat / Ollama / AnythingLLM)** — this is the shiniest idea and the biggest trap. "Ask Rayners Lane" trained on programmes and minutes is a lovely vision, but self-hosting an LLM stack is a real ongoing commitment. **You already have a far simpler path: Cowork (this tool) + the skills you already have installed.** Drop your FA handbook, constitution and match reports into a folder here and you get the "searchable club memory" outcome today, with zero servers to run. Prove the value that way first; only self-host if it genuinely takes off.

### The football-specific feature ideas
Player cards with FIFA-style ratings, prediction league, fantasy Rayners Lane, achievement badges, "Where Are They Now?", AI match-report drafts, digital programme generator — **these are the genuinely good ideas**, because they give fans a reason to return daily and they're differentiated at your level. Crucially, **most don't need any of the heavy infrastructure above** — they need your existing data tank filled plus modest front-end work. The AI match-report drafts and social captions you can do **right now in Cowork** with the `marketing:draft-content` and `small-business:run-campaign` skills, pasted into your existing editors.

---

## 5. Where this all "sits and works with you as a club"

Think in three layers, cheapest-effort first:

1. **Content layer (do now, free):** Fill fixtures + squad in the admin you already have. Run one live matchday. This alone transforms the site from "coming soon" to "living."
2. **Assist layer (do now, free):** Use **Cowork + your installed skills** as the club's "AI brain" and content studio — draft match reports, news, sponsor outreach, social captions, and answer "what happened vs Harefield" by dropping documents in a folder. No servers.
3. **Platform layer (do when you outgrow flat JSON):** Introduce **Directus/Strapi (CMS) + Supabase (data/auth) + n8n (automation) + Umami (analytics) + Cal.com (bookings) + Listmonk (newsletters).** That's the realistic, maintainable "strong structured backend" — six services, not forty.

---

## 6. Recommended order of action

1. **Set the Netlify env vars** (Section 3) and run the Supabase SQL — flips on scoreboard, check-in, members, push, emails.
2. **Enter 2026–27 fixtures + first-team squad** in admin.
3. **Run one full live matchday** end-to-end (go live, tap score, publish a programme) to prove every pipeline with real data.
4. **Move match-finances behind a server function** if that data is sensitive.
5. **Then** pick from the platform layer — I'd start with **n8n** (social automation) and a **CMS trial (Directus)**, because those remove the most volunteer workload.
6. Unify the two brand-token systems and run an accessibility pass before the season.

_This file supersedes `AUDIT-2026-06.md` and `STATE-OF-PLAY-AND-FIXES.md` where they conflict — those pre-date the fixes now in the code._
