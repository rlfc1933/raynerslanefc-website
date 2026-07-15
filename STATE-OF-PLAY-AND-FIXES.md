# Rayners Lane FC — Verified State of Play + the next fixes

_Verified 30 June 2026 against the live site, the committed data, the git history, and the backends (not just the code). This is what is actually true, followed by the exact fixes to hand Claude Code._

## Verified verdict: the machine is built, the tank is near-empty, three wires are loose

### ✅ Actually working (proven in production)
- **Site is live** at raynerslanefc.co.uk — deployed, fast, on-brand, correct meta/OG/PWA.
- **The admin → GitHub → site save pipeline genuinely works.** Real production commits authored by the club account (`rlfc1933`) — "Admin: update data/news.json", "Admin: update data/sponsors.json", image uploads — are exactly what `save-data.js` generates. Someone published from the live panel and it shipped. This is the hardest thing to get right, and it's done.
- **News publishing works end-to-end** — one real article ("Pre Season News", 18 Jun, by Russell Nugent) is live with an uploaded image.
- **Rendering from data works** for news, sponsors, committee, crests, perks, officials, patrons.
- **Supabase fan backend is alive** (the project responds; accounts can be created).
- **Live scoreboard core path is correctly wired** (`liveScoreboard()` → `#rlfc-livebar`) — it just has never been run because the season hasn't started.

### ⚠️ Empty scaffolding — built, but no data, and the emptiness is public
| Data file | State | What the public sees |
|---|---|---|
| `fixtures.json` | empty | "Fixtures Coming Soon", homepage "vs TBC" |
| `squad.json` / `players.json` | empty | Blank squad page, no player profiles |
| `attendance.json` | empty | **Loyalty/hearts system has never run once** |
| `programmes.json` / `programme.json` | empty | No matchday programmes despite a full 28-page builder |
| `gallery.json` | empty | Placeholder gallery |
| `social.json`, `sponsor-crm.json`, `analytics.json`, `meetings.json`, `motm.json`, `signing.json` | empty | Nothing tracked / no spotlight |

The framework is real; it's running on almost no content. For a visitor, that reads as "unfinished" even though the engineering is strong.

### ❌ Broken / not connected
- **Push notifications are OFF.** The live endpoint `/.netlify/functions/push-key` returns `{"enabled":false,"key":""}` — the VAPID keys were never set in Netlify, so "Enable Match Alerts" silently does nothing.
- **Live scoreboard:** a dead duplicate implementation + a real-time latency flaw (see fix #2 below).
- **Fan QR scan loop does not exist** (covered in `LEAD-ENGINE-BUILD-PROMPT.md`, Phase 1).
- **Two fan sign-up backends, one dead** (covered in `LEAD-ENGINE-BUILD-PROMPT.md`, Phase 0).

### ❓ You must check (server-side, I can't see these)
Set in Netlify → Site configuration → Environment variables. If missing, the matching feature is silently dead:
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — without these the admin **cannot see any fan members** even though signups exist.
- `RESEND_API_KEY` — without it, no fan welcome email and no sponsor-enquiry alert email.
- `NETLIFY_API_TOKEN` — used by the (to-be-removed) old fan list.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — **confirmed NOT set** (push is off).
- `ADMIN_PIN` — set it so the public repo default (`19332026`) isn't your live gate.

### The honest takeaway for scaling into a business
This is not a "needs more code" problem first — it's a **fill the tank + connect three wires + drive adoption** problem. The biggest single lever is getting real fixtures, squad and a live match through the system once, end-to-end. Code fixes below remove the friction; the build prompt adds the lead engine on top.

---

## FIXES TO HAND CLAUDE CODE (append to the run after the existing CLAUDE-CODE-FIX-PROMPT.md)

### Fix A — Live scoreboard (consolidate + make it actually real-time)
**What's wrong:** `js/main.js` has two scoreboard implementations. The working one is `liveScoreboard()` writing to `#rlfc-livebar` (this element exists in `index.html`). But `loadMatchDay()` (lines ~112–123) also tries to update `#live-bar`, `#home-score`, `#away-score`, `#live-opp` — **none of which exist in `index.html`** — so that block is dead code. Separately, the real problem: when staff tap a score in admin, it commits `matchday.json` to GitHub and waits for a Netlify rebuild (~30–90s) before fans see it, so it isn't truly live.

**Do this:**
1. **Remove the dead block** in `loadMatchDay()` (the `#live-bar`/`#home-score`/`#away-score`/`#live-opp` updates). Keep the single `liveScoreboard()` → `#rlfc-livebar` implementation as the one source of the live bar. Field names already match (`isLive`, `isHome`, `homeScore`, `awayScore`, `status`, `scorers`) — don't change them.
2. **Make it real-time via Supabase** (no git commit per score tap): add a Supabase table `live_match` (single row: `opponent`, `is_home`, `home_score`, `away_score`, `status`, `scorers`, `is_live`, `updated_at`). Admin's "Activate & Go Live" / "Push Score Live" / score `+` buttons (`saveMatchDay`, `pushLiveScore` in `admin.html` ~lines 3078–3112) write to `live_match` through a new PIN-gated function `live-score.js` (instant). The homepage `liveScoreboard()` reads from `live_match` (poll every 10–15s, or use Supabase realtime) instead of `matchday.json`. Keep `matchday.json` only for the non-live "next match / countdown" info.
3. Give staff **instant optimistic feedback** in admin (the score updates on screen the moment they tap, then confirms saved), so it feels live to operate.
4. **Acceptance:** with a match set live, tapping `+1` in admin updates the fan's homepage scoreboard within ~15s and with **no site rebuild**. With no live match, the bar is hidden and the "next match" card still works from fixtures/matchday.

### Fix B — Turn on push notifications (or hide the button honestly)
**What's wrong:** `push-key` returns `enabled:false`; VAPID keys aren't set, so "Enable Match Alerts" does nothing.
**Do this:** Either (a) generate VAPID keys (`npx web-push generate-vapid-keys`), set `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` in Netlify, and create the `push_subscriptions` Supabase table per `PUSH-SETUP.md`, so alerts work; **or** (b) if you're not ready, make the button auto-hide when `push-key` reports `enabled:false` so the site never shows a dead control. Prefer (a).
**Acceptance:** either fans can enable alerts and receive a test from admin → Match Day, or the button is cleanly hidden until keys exist.

### Fix C — Load the data tank (so the public stops seeing "Coming Soon")
This is content, not code, but it's the highest-impact move. Priority order:
1. **Fixtures** — enter the 2026–27 Combined Counties Premier Div North schedule in admin → Fixtures (populates the homepage next-match, countdown, results, and the programme stats). Until then the live feed fallback (TheSportsDB) is the only source and shows nothing.
2. **Squad + player profiles** — add the first-team squad so the squad page and programme team-sheets work.
3. Then: gallery photos, and publish one matchday programme to prove that pipeline.
**Have Claude Code:** add a one-screen "Season Setup" checklist inside admin that shows which data files are still empty and links straight to each editor, so staff know exactly what to fill to make the site "live-ready." Acceptance: admin shows a setup progress list; filling Fixtures makes the homepage show a real next match.

### Sequencing
Run **after** `CLAUDE-CODE-FIX-PROMPT.md` (the data-integrity fixes), then Fix A → Fix B → Fix C, then the `LEAD-ENGINE-BUILD-PROMPT.md` phases. Fix A shares the Supabase setup with the build prompt's scan loop, so do them in the same sitting.
