# Claude Code Brief — Complete the Rayners Lane FC Audit (Layer 3) + Close Remaining Gaps

You are working in the `rlfc1933/raynerslanefc-website` repo (static HTML on Netlify + Netlify Functions + Supabase). You have GitHub and the deployment context. A prior review already did a full **static code audit** and **live production endpoint tests**. Your job is to complete the parts that review could not reach — the authenticated write path, the backend connections, and the environment configuration — then fix the remaining gaps. **Verify with evidence; do not assume. Report what is actually true.**

---

## ALREADY PROVEN — do NOT redo these (trust and build on them)

- **Publishing pipeline works in production.** `admin.html` → `commitDomain()` → `save-data.js` → GitHub commit → Netlify rebuild → public pages read `data/*.json`. Real articles and sponsors are live right now.
- **The #1 data-loss bug is fixed.** `commitDomain()` re-fetches live JSON, merges (live + local edits − deletions), then pushes — applied across all editors, not just News. `commitArticle()` does the same for news.
- **`fetch-fixtures.js` executes live** (returns TheSportsDB JSON + club badge; empty results are just off-season).
- **`push-key.js` returns `{"enabled":false}` in production** — VAPID keys are NOT set, so match-alert push is genuinely off. The front-end (`js/components.js`) correctly hides the button when disabled.
- **`list-sponsors.js` correctly refuses unauthenticated calls** (PIN gate works).
- All `data/*.json` are valid; all JS parses; no broken internal links; the GitHub token stays server-side with write paths allow-listed to `data/*.json` + `img/uploads/*`.

## NOT YET PROVEN — this is your mission
The authenticated admin-writes-to-live loop, and whether the Supabase / email / push backends are actually connected. All of these depend on Netlify environment variables that the prior review could not see.

---

## TASK 1 — Audit the environment configuration (do this FIRST; everything depends on it)

Check which of these are set in **Netlify → Site configuration → Environment variables** (use the Netlify CLI/API or MCP if available; otherwise print the exact list for the human to confirm). For EACH, report `SET` / `MISSING` and the exact feature it controls:

| Env var | Controls | If MISSING, this is dead |
|---|---|---|
| `SUPABASE_URL` | Supabase base URL | real-time scoreboard, QR check-in, member list |
| `SUPABASE_SERVICE_KEY` **or** `SUPABASE_SECRET_KEY` | server writes to Supabase (either name accepted by code) | same as above |
| `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` | Web Push | match-alert notifications |
| `RESEND_API_KEY` | transactional email | fan welcome email, sponsor-enquiry alert |
| `NETLIFY_API_TOKEN` | reads private form submissions | sponsor enquiries + fan list in admin |
| `ADMIN_PIN` | overrides the shared admin PIN | **if unset, the public repo default `19332026` is the live gate — HIGH PRIORITY** |
| `SITE_ID` | injected by Netlify automatically | (should already be present) |

**Output a table** of every variable with SET/MISSING and the consequence. This table alone answers "does everything actually work."

---

## TASK 2 — Set `ADMIN_PIN` (security, do immediately)
The default PIN `19332026` is visible in public source. Set a new `ADMIN_PIN` in Netlify so the repo default is not the live gate. Confirm `save-data.js`, `live-score.js`, `list-sponsors.js`, `list-members.js` all read `process.env.ADMIN_PIN`. Report the new PIN to the human privately (do not commit it anywhere).

---

## TASK 3 — Verify (or connect) Supabase
1. Confirm `SUPABASE_URL` + a service/secret key are set.
2. Confirm the schema in `supabase-schema.sql` has been run: tables `live_match` (single row id=1) and `attendance` must exist with the RLS policies in that file.
3. **Prove the real-time scoreboard write path:** POST a test payload to `/.netlify/functions/live-score` with the correct PIN and `is_live:true`, a test opponent and score. Then fetch the homepage live-bar read path and confirm the score appears (poll of the `live_match` row). Then set `is_live:false` and confirm the bar hides.
4. Report: does a score tapped in admin reach the homepage within ~15s with **no site rebuild**? YES/NO with evidence.

If Supabase is not configured, print the exact steps + the SQL to run, and do not fake success.

---

## TASK 4 — Turn on Web Push, or confirm it stays cleanly hidden
Preferred: make alerts actually work.
1. Generate keys: `npx web-push generate-vapid-keys`.
2. Set `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` in Netlify.
3. Create the `push_subscriptions` table per `PUSH-SETUP.md`.
4. Confirm `push-key` now returns `{"enabled":true,...}`, subscribe a test browser, and send a test from admin → Match Day via `push-send.js`. Report delivery YES/NO.

If you are not enabling it now: confirm the button auto-hides while `push-key` reports `enabled:false` (it should already), so no dead control ever shows. State which path you took.

---

## TASK 5 — Prove the authenticated publish loop end-to-end
Make one **safe, reversible** test edit through the real flow (e.g. add then remove a hidden test key in a low-risk data file, or edit `updatedAt`), and confirm:
1. `save-data.js` commits it to GitHub as the club account.
2. Netlify rebuilds and the change is live on the public URL.
3. Revert the test edit and confirm the revert also publishes.
Report the commit SHAs and confirm no unintended data was overwritten (this validates the `commitDomain` merge in production).

---

## TASK 6 — Confirm the remaining code-level items
For each, report FIXED / STILL OPEN with the file + line:
1. **Match-finances security:** `data/analytics.json` and the `analyticsHash` in `data/config.json` are public; the gate is client-side only. If match takings/attendance are sensitive, move them behind a PIN-gated function (like `live-score.js`) instead of a JS gate. If the club accepts them being public, state that explicitly.
2. **`emails.json`:** confirm it holds only role addresses (no personal names/emails), since the repo is public. Add a code comment/guard warning against entering personal data.
3. **Season-setup / data-completeness helper:** confirm admin shows which `data/*.json` are still empty (fixtures, squad, players, attendance, programmes, gallery) and links to each editor. If missing, add a one-screen "Season Setup" checklist in admin.
4. **Brand tokens (low priority):** `brand/tokens.css` (`--rl-*`) vs `css/style.css` (`--yellow/--green`) duplicate colours under different names. Note whether to unify (optional).

---

## TASK 7 — Data-completeness report (the content tank)
You cannot invent real fixtures/squad data, but you CAN report readiness. Print a table of every `data/*.json` with row counts and EMPTY/POPULATED, and list the exact editors the club must fill to make the site "live-ready": **fixtures → squad/players → gallery → one published programme.** Make clear this is content entry, not a code bug.

---

## Guardrails
- **Do not break the working publish pipeline or the `commitDomain` merge logic.** They are proven correct.
- Make **atomic, well-described commits**, one concern each.
- **Never commit secrets** (PINs, keys, tokens) to the repo. Env vars only.
- If a backend isn't configured, output the exact setup steps + SQL — do not simulate success.
- Do not enter real personal data (emails, minors' details) into public files.

## Final report format
End with a single **STATUS TABLE**: `Feature | Works in production? (YES/NO/NEEDS-CONFIG) | Evidence`. Cover: public site render, data publishing, real-time scoreboard, QR check-in, member list, push alerts, welcome/sponsor emails, sponsor-enquiry inbox, admin PIN security, content-tank readiness. This table is the deliverable — it is the honest answer to "does everything actually work how it needs to."
