# Claude Code — Publish Saturday's game + build a simple NEXT MATCH control

Repo: `rlfc1933/raynerslanefc-website` (static HTML on Netlify, vanilla JS). Fixtures live in **`data/fixtures.json`** (the source of truth). The homepage countdown auto-picks the **earliest upcoming fixture** from it. Do both jobs. Atomic commits. Don't break the site.

---

## JOB 1 — Get THIS Saturday's game live (do first, it's 3 days away)
A pre-season friendly has already been added to `data/fixtures.json` (locally). **Commit + publish it** so the homepage countdown updates from Metropolitan Police (25 Jul) to this game. If for any reason it's not in the file, add it exactly:

```json
{
  "id": "friendly-cockfosters-20260718",
  "date": "2026-07-18",
  "kickoff": "15:00",
  "opponent": "Cockfosters",
  "oppCrest": "img/crests/cockfosters.svg",
  "isHome": true,
  "venue": "Tithe Farm Sports & Social Club",
  "competition": "Pre-Season Friendly",
  "status": "scheduled",
  "us": null, "them": null, "scorers": ""
}
```
- Crest already exists at `img/crests/cockfosters.svg` ✅.
- **Verify live:** homepage next-match + countdown show **Cockfosters (H), Sat 18 Jul, 15:00, Tithe Farm**, with the Cockfosters crest, ahead of Met Police. Confirm the deployed site updated (watch for stale cache — bust `data/*` if needed).

---

## JOB 2 — The real fix: a dead-simple "NEXT MATCH" control (this is the point)
The club has **no easy way to add / edit / remove the next game** and see the site update. It's pre-season, so friendlies appear sporadically and need changing fast, by a non-technical committee member, from a phone. Build exactly that.

### Where
Put a **"⚽ NEXT MATCH"** panel as the **first, most prominent thing** in the admin portal (`admin.html`) — above everything, impossible to miss. (There is already a Fixtures editor; this is a simplified, front-and-centre quick-control that writes to the same `data/fixtures.json`, not a second system.)

### What it does (keep it stupidly simple)
- **Shows the current next match** at the top: opponent + crest, H/A, date, time, venue, and a live countdown preview — so staff see exactly what the public sees.
- **Add / edit a game** in one short form:
  - Opponent (free text) + **crest picker** (dropdown of `img/crests/`, with "no crest → initials placeholder"),
  - **Home / Away** toggle,
  - **Date** (date picker) + **Kick-off** (time),
  - **Venue** (defaults to Tithe Farm for home; free text for away),
  - **Competition** (Friendly / League / FA Cup / FA Vase / Charity).
  - One **Save** button → commits to `data/fixtures.json` via the existing merge-safe save (`commitDomain` / `save-data`) → live in ~30s. Show a clear "Saved ✓ — live shortly" state.
- **Edit** an existing upcoming fixture (tap it, change any field, save).
- **Remove** a game (postponed/cancelled) with a confirm — it drops off the site and countdown.
- **List of upcoming fixtures** below the form so staff can see/manage the run of games.

### Behaviour rules
- The homepage countdown must reflect changes **automatically** (it already picks the earliest upcoming fixture — keep that; don't hardcode anything).
- **Optional "📌 Pin as next match"** toggle: lets staff force a specific game to show on the homepage even if the date logic would pick another (useful when a friendly is added late). If used, it overrides; if not, earliest-upcoming wins.
- Adding/removing a game must **never** wipe other fixtures — use the id-keyed merge save (add/edit/delete by `id`), same engine that protects the squad.
- Works on a **phone** (big tap targets, no fiddly bits) — a committee member should add a friendly in under a minute from the stands.

### Guardrails
- Vanilla JS, no build step. `data/fixtures.json` stays the single source of truth. Brand tokens/fonts only. Atomic commits. Never fabricate a fixture.

---

## Done when
1. Saturday's **Cockfosters (H) 15:00** game is **live** on the homepage countdown, with crest, ahead of Met Police.
2. A non-technical staffer can **add, edit, remove and (optionally) pin** the next match from a phone in the admin portal, and the homepage updates within ~30s.
3. Nothing else regresses; fixtures are never wiped by an add/edit/remove.
