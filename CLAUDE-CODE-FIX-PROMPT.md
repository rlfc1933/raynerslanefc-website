# Fix brief for Claude Code — Rayners Lane FC site

You built this site (static HTML on Netlify; `admin.html` writes `data/*.json` via `netlify/functions/save-data.js`; public pages read those JSON files). An audit found a data-integrity bug plus several "edited in admin but the public site doesn't reflect it" issues. Work through the items below **in order**. After each, give me a one-line summary of what changed and which files. Don't refactor unrelated code. Preserve the existing visual design and the existing JSON shapes unless an item explicitly says to change them. Test each change before moving on.

---

## 1. [CRITICAL] Stop stale-copy saves from wiping other staff's data
**Problem:** Every editor except News saves the whole `data/<x>.json` from an in-memory array loaded once at login (`loadAll()` ~line 2970). If two staff edit at different times, the later save overwrites the earlier one's data from a stale base. News was already fixed (`commitArticle`/`deleteArticle` re-fetch live data first — see the warning comment ~line 3414); replicate that pattern everywhere.

**Do this:** For every save function that pushes a full-file object (`saveSquad` 3395, `saveCommittee` 3498, `saveSponsors` 4554, `savePatrons` 5265, `saveAttendance` 5313, `saveMeetings` 4424, `savePerks`, `saveSocial`, `saveEmails`, `saveCrests`, `saveGallery`, `savePlayers`, `saveFixtures`, `saveAnalytics`, `saveCommitteeWins`, `saveCommitteePlan`, and any others following the same pattern), re-fetch the current JSON from the live site **immediately before** mutating and pushing, then apply the staff member's specific add/edit/delete to that fresh copy — not to the module-level array loaded at page open. Use the same `fetchJSON(...)` helper `commitArticle` uses, with a cache-buster. Keep a clear failure path: if the re-fetch fails, abort the save and tell the user rather than pushing a possibly-empty base.

**Acceptance:** Open the portal, have a second change land in a data file, then save an unrelated edit in the same domain — the second change must survive. No editor pushes a whole-file object built from data older than the current save action.

## 2. [HIGH] Make `investment.html` sponsors come from `sponsors.json`
**Problem:** `investment.html` (~lines 295–311) hardcodes the current sponsors, so admin sponsor changes never appear there.
**Do this:** Replace the static "Our Current Sponsors" block with a fetch of `data/sponsors.json` (same cache-buster pattern as the homepage `renderPartners`) and render the sponsor name/role/url/logo from the data. Keep the existing styling. If the fetch fails or is empty, fall back gracefully (hide the block or show a neutral placeholder), don't error.
**Acceptance:** Add/rename a sponsor in admin → after rebuild, `investment.html` reflects it without code changes.

## 3. [HIGH] Move the four baked news articles into `data/news.json`
**Problem:** `news.html` `BAKED_ARTICLES` (~lines 353–374) hardcodes 4 articles that admin can't edit or remove; they always render on top of admin news.
**Do this:** Migrate those 4 entries into `data/news.json` as normal article records (preserve their `title`, `excerpt`, `image`, `date`, and external `link`/`external` behaviour — extend the news record/render to support an optional external link so the three Pitchero links still work), then delete the `BAKED_ARTICLES` array and the merge logic that injects it. The newsroom should render purely from `news.json`.
**Acceptance:** All 4 stories still appear with correct links; deleting one in admin removes it from the live newsroom.

## 4. [HIGH] Resolve the Match Day vs Fixtures "next match" conflict
**Problem:** When `matchday.json.isLive` is false, the homepage uses `fixtures.json` for the next match/countdown and ignores the opponent/date set in the Match Day editor, confusing staff.
**Do this (pick the cleaner option and tell me which):** Either (a) have the Match Day editor also create/update the corresponding upcoming fixture in `fixtures.json` so the two never disagree, or (b) leave the priority as-is but add a clear inline note in the Match Day editor UI explaining that the homepage countdown is driven by the next entry in Fixtures unless a match is set Live. Prefer (a) if it's clean.
**Acceptance:** Staff setting the next opponent see consistent behaviour between admin and the home page, with no silent override.

## 5. [HIGH] Unify squad grid and player profiles
**Problem:** `squad.html` grid reads `squad.json`; profile pop-ups read `players.json`; they're edited separately and the grid record has no photo, so cards and profiles drift apart.
**Do this:** Make a single squad editor in admin the source of truth. Easiest: have the squad editor write **both** `squad.json` (grid fields incl. `photo`) and the matching `players.json` profile record for each player in one save, keyed consistently (the grid card id must match the `players.json` `id` used by the profile lookup). Ensure the grid card record includes `photo`.
**Acceptance:** Adding one player in admin produces both a grid card (with photo) and a working profile pop-up, with no second manual step.

---

## 6. [MEDIUM] Render safeguarding names from `officials.json` directly
`policies.html` bakes in "Jenny Pitt"/"Pete Singh"/"Emma Galloway" and only string-swaps from `officials.json` if the new name differs from that exact baseline. Change it to render the welfare officer / chairman / secretary names straight from `officials.json` (with the baked names only as a fallback when the file is missing), so a name change in admin always takes effect. Safeguarding-sensitive — verify it updates.

## 7. [MEDIUM] Fix the global footer/nav glitches in `js/components.js`
- Footer "Match Day → Results" points to `fixtures.html#results` but no `#results` exists — add `id="results"` to the results section in `fixtures.html`, or repoint to `#calendar`.
- The footer has two links both labelled "Sponsorship"; the second (→ `contact.html`) should be **"Volunteer" → `volunteer.html`**. Fix the label and target.
- `media.html` is orphaned (in `sitemap.xml`, not linked anywhere). Either add it to the nav/footer or remove it from `sitemap.xml`. Tell me which you chose.
- Remove the dead `#nav-burger`/`#hamburger`/`#mob-menu` handler code that no longer matches the generated markup.

## 8. [MEDIUM] Pick one brand-token system
`brand/tokens.css` (`--rl-*`) and `css/style.css` (`--yellow`/`--green`/`--font-c`…) define the same brand values under different names; only `admin.html` and `programme-print.html` use the former. Consolidate to a single token source (keep the names the bulk of the site already uses to minimise churn), have all pages reference it, and remove the duplicate. Don't change any actual colours/fonts — values stay identical, only the source consolidates.

## 9. [MEDIUM] Tighten the obviously-public sensitive data
- Stop writing the analytics password hash to the public `data/config.json`, and don't rely on a client-side gate for match finances. If `data/analytics.json` is meant to be private, move its read behind a PIN-gated Netlify function (like `list-members`) instead of a committed public file. If it's not actually sensitive, say so and we'll leave it.
- Confirm whether `data/emails.json` should be public; if it may contain personal emails, move it behind a function too.
- Rotate the default admin PIN, set `ADMIN_PIN` in Netlify, and remove the PIN and staff default password from the on-screen guide text in `admin.html` (~lines 1979, 2275). Treat the client PIN as non-secret either way.
- Note for me (no code change needed unless quick): the role/"Chairman-only" model is cosmetic; flag if you think it's worth server-enforcing.

## 10. [MEDIUM] Wire up the unreachable fields
Add the missing form inputs + save wiring so admin can actually set: committee member `photo` and `featured` (`addMember` ~3483), and patron `photo` (`addPatron` ~5251). These fields already render on public pages but can never be populated from admin today.

---

## 11. [LOW] Polish (batch at the end)
- Add `programmes.html` to `sitemap.xml`; add meta descriptions to `news-article.html` and `player.html`.
- `uploadImg` (~5389): on upload failure, surface an error instead of silently inlining base64 data URLs into the JSON.
- Optional: reduce hardcoded hex literals in inline styles in favour of the consolidated tokens (highest counts: `programme-print.html`, `fan-zone.html`, `index.html`) — only if low-risk.

---

### Ground rules
- Keep existing JSON shapes and the `pushToGitHub`/`save-data.js` contract unless an item says otherwise.
- Don't break the cache-buster fetch pattern public pages rely on.
- After items 1–5, do a quick end-to-end test: make an edit in admin for each affected domain and confirm it shows on the correct public page after save.
- Give me a short changelog at the end grouped by the item numbers above.
