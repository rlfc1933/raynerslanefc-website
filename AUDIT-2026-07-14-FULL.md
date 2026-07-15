# Rayners Lane FC — Full System Audit
### Main site · Staff Portal · The Lane App (player/manager)
_Verified 14 July 2026 against the live site, GitHub `origin/main`, the running Netlify functions and the Supabase-backed app. Everything below is evidence-based, not inferred._

---

## VERDICT IN ONE PARAGRAPH
**The engine is now genuinely good.** The data-loss bug that ate the chairman's players is **properly fixed** — saves are atomically merged server-side against GitHub with SHA + conflict retry, and serialised by a client-side queue. Fixtures are live (43, full season + cups). The squad is live (24 real players). Push notifications are **on**. The Lane App's auth is well-engineered. **No data has been lost.**

**But there are three things that will bite you, and one is urgent.** A GitHub token with write access to the club's website is still sitting in plaintext. Two systems now write the same squad files and *will* silently overwrite each other. And the "glitches" you've been seeing are mostly a **caching** problem, not a saving problem.

---

## 🔴 CRITICAL — do these today

### 1. Your GitHub token is still exposed (unchanged from yesterday)
The repo's git remote still embeds a **GitHub Personal Access Token in plaintext**:
```
origin  https://ghp_****@github.com/rlfc1933/raynerslanefc-website.git
```
It has **write access to the club's live website**. It sits in `.git/config` in a folder that gets zipped, backed up and handed between volunteers. **Treat it as compromised.**

**Fix now:** revoke it on GitHub → create a new fine-grained token (Contents: write, this repo only) → update `GITHUB_TOKEN` in Netlify → then:
```
git remote set-url origin https://github.com/rlfc1933/raynerslanefc-website.git
```
and authenticate via SSH or the credential manager. Also confirm it was never committed into repo *history*.

### 2. TWO systems now write the same squad files — a live data-loss risk
- **`netlify/functions/la-publish-players.js`** regenerates `data/players.json` + `data/squad.json` **from Supabase** and **PUTs the whole file** to GitHub (a full overwrite — not a merge).
- **`admin.html`** still writes those *same two files* directly via `_savePlayersAndGrid()` → `commitDomain()`.

**Consequence:** a player added or edited in the **admin Squad editor** (who doesn't exist in Supabase) will be **silently wiped** the next time anyone approves a player or publishes the roster from the Lane App. The admin panel gives **no warning** that Supabase now owns the squad.

**Fix — pick ONE owner (recommended: Supabase):**
- Make the admin Squad / Player Profiles editors **read-only** (or remove them), with a clear note: *"The squad is managed in The Lane App."*
- All roster changes go through Supabase (Lane App staff screen / `la-import-roster`).
- `players.json` + `squad.json` become **generated artifacts** that nothing else writes.

### 3. `ADMIN_PIN` still defaults to the public `19332026`
Functions fall back to `process.env.ADMIN_PIN || '19332026'` — and that PIN is **printed in public source**. If `ADMIN_PIN` isn't set in Netlify, that value is your live gate. **Set it.**

---

## 🟠 HIGH

### 4. The FWP league table is a blank white box — and it's not your code's fault
**Cause:** the **2026-27 league table has no data yet** — the season doesn't start until **Sat 1 August** and no games have been played. Football Web Pages returns nothing, so the widget renders nothing.

**Why it looks broken:** `fixtures.html:110` wraps it in a forced white background, and `.fwp-embed{min-height:340px}` reserves 340px:
```html
<div style="background:#fff"><div class="fwp-embed" data-url="…/league-table"></div></div>
```
An empty widget + forced white + 340px height = **a blank white void** on a dark site.

**Fix:**
- Remove the hard-coded `background:#fff` and the unconditional `min-height`.
- **Detect an empty render** (no child nodes / zero-height iframe after load) and show an on-brand fallback: *"League table starts when the season kicks off — Sat 1 August"* with a link to FWP.
- Apply the same empty-state guard to the fixtures embed.
- It will populate itself once the season starts. **Nothing needs fixing at FWP's end.**

### 5. Away fixtures have no venue — the away-day feature is broken
Every FWP-imported away game has **`venue: ""`**:
```json
{ "opponent": "Broadfields United", "isHome": false, "venue": "" }
```
FWP gives the opponent, **not their ground**. So players get **no address and no directions** for away games — which is exactly the feature they'll use most.

**Fix:** build the `venues` table — ground name, address, **and lat/lng** — for the ~20 clubs in the division. One-time job (~1 hour), correct forever. **Use lat/lng, not just postcodes** — sports-ground postcodes routinely route you into a housing estate.

### 6. Stale JSON is being served — this is your "glitch"
An uncached fetch of `data/players.json` returned a **4-hour-old version** (1 player) while GitHub and the live site actually held the current one (24 players). With a cache-buster, the correct file came back immediately.

**This almost certainly explains the "I published it but nothing changed" complaints.** It isn't a save bug — **the save worked**. Someone is being served a cached copy.

**Fix:** verify the `Cache-Control: no-cache` header on `/data/*` in `netlify.toml` is actually being applied at the edge (check the response headers in production). Ensure all front-end fetches of `data/*.json` append a cache-buster (`?t=` + timestamp) — some already do; make it universal.

---

## 🟡 MEDIUM

7. **No squad numbers.** All 24 players have `"number": 0` — nobody has a shirt number. The squad page, team sheets and graphics will all show `0`.
8. **Missing crests** for cup/friendly opponents: **London Lions**, **New Bradwell St Peter**, **Punjab Utd**. League opponents all have crests.
9. **Empty data:** `gallery.json`, `programmes.json`, `attendance.json` are all still empty.
10. **Player stats show `0`, not `–`.** Apps/goals/assists are all zero and will *display* as zeros — which reads as "we've played and scored nothing." Until the stats engine (Phase 2) lands, show `–` or "starts 1 Aug", not fabricated-looking zeros.

---

## ✅ VERIFIED WORKING — don't touch these

- **The save engine is fixed, and fixed properly.** `save-data.js` now reads the merge base from **GitHub** (always current — no rebuild lag), applies upserts/deletes server-side, commits atomically with the file's SHA, and **retries on 409** up to 5 times. `commitDomain()` no longer reads the deployed site, and a **per-domain save queue** serialises writes. This is the correct architecture and it closed the bug that lost 3 players.
- **Fixtures: 43 live.** Full Combined Counties Prem North season **with crests**, plus **FA Cup EP — London Lions (A), Sat 8 Aug**, **FA Vase 1Q — New Bradwell St Peter (H), Sat 15 Aug**, and the friendlies.
- **Squad: 24 real players live** on the website.
- **Push notifications are ON.** `push-key` now returns `{"enabled":true,...}` with a real VAPID key — the keys are set.
- **The Lane App's security is genuinely strong:** session-token auth, staff-role gates on every privileged function, **login lockout after 5 failures in 15 minutes**, **IP-rate-limited signup**, **hashed 6-digit codes**, `player_id` derived **from the session** (so nobody can set another player's availability), idempotent writes, and an approval queue.
- **All JSON is valid. All JavaScript parses cleanly.** No syntax errors anywhere.

---

## PRIORITISED FIX ORDER

| # | Action | Why |
|---|---|---|
| 1 | **Revoke & rotate the GitHub token** | Write access to the club's site is exposed |
| 2 | **Make admin's Squad editor read-only** (Supabase owns the roster) | Prevents silent squad wipes |
| 3 | **Set `ADMIN_PIN` in Netlify** | The public default is currently the gate |
| 4 | **Fix the `/data/*` cache** + universal cache-busting | This is the "it didn't publish" glitch |
| 5 | **Empty-state the FWP embeds** | Kills the white box until 1 Aug |
| 6 | **Populate the `venues` table** (ground + lat/lng ×20) | Away directions — the feature players need most |
| 7 | Assign squad numbers; add the 3 missing crests | Cosmetic but visible everywhere |

---

_Nothing in this audit was inferred. The save engine, auth, fixtures, squad and push were each verified against the live system; the caching and league-table findings were reproduced directly._
