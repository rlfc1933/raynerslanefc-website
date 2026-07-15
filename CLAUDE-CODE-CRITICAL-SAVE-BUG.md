# 🔴 CRITICAL — Claude Code Brief: admin saves are silently overwriting each other (data loss)

Repo: `rlfc1933/raynerslanefc-website`. **This is a live data-loss bug. Fix it before anything else.**

---

## The bug (confirmed in production, 13 July 2026)
The chairman added **4 players** in admin → Squad. **Only 1 survived.** Verified:
- `https://raynerslanefc.co.uk/data/players.json` → 1 player (Michael Adefolami)
- `https://raw.githubusercontent.com/rlfc1933/raynerslanefc-website/main/data/players.json` → **also 1 player**

So the data was **overwritten on write** — it is not a rebuild-lag display issue. Timestamps (`updatedAt: 2026-07-13T14:56:14.988Z` / `...15.398Z`) show a single surviving final save: classic last-write-wins.

## Root cause
`commitDomain()` in `admin.html` does a merge-before-save to protect against concurrent edits:

```js
function commitDomain(name, key, idField, arr, deletedIds, extra, depId, msg) {
  fetchJSON(name, function (live) {        // ← re-fetches the DEPLOYED SITE
    var liveArr = (live && Array.isArray(live[key])) ? live[key] : [];
    ...merge liveArr + arr - deletedIds...
    pushToGitHub(name, out, depId);        // ← commits to GitHub
  });
}
```

**`fetchJSON()` reads `data/<name>.json` from the live website — which lags GitHub by a full Netlify rebuild (~30–90s).**

So any save made **within the rebuild window** merges against a **stale** base and silently discards everything committed since:

1. Save Player 1 → commit → site begins rebuilding (old file still served).
2. Save Player 2 twenty seconds later → merge re-fetches the live site → **still the pre-Player-1 file** → merged output omits Player 1 → **commit overwrites Player 1.**
3. Repeat → only the last save survives.

This affects **every domain that uses `commitDomain`** (squad, players, sponsors, committee, fixtures, gallery, patrons, meetings…), not just the squad. `_savePlayersAndGrid()` makes it worse by firing **two** `commitDomain` calls back-to-back (`players` + `squad`), so rapid saves also race each other.

---

## THE FIX — merge server-side against GitHub, atomically
The merge base must be **GitHub (the source of truth)**, never the deployed site.

### 1. Move the merge into `netlify/functions/save-data.js`
`save-data.js` already authenticates to GitHub and must fetch the file's current `sha` to commit. Make it do the merge there, atomically:

1. **GET** the current file content **+ `sha`** from the GitHub Contents API (this is always current — no rebuild lag).
2. **Merge** the incoming changes into that content, server-side, using the same rules `commitDomain` uses today: keyed by `idField`, apply `deletedIds`, incoming records upsert over existing, preserve order.
3. **PUT** the merged result with the `sha` you just read.
4. **On `409 Conflict` / sha mismatch** (someone else committed in between): **re-read, re-merge, retry** (a few attempts with small backoff). Never give up silently and never write a non-merged payload.

The client therefore sends only **its changes + deletions**, not a whole rebuilt file:
```json
{ "pin": "…", "domain": "players", "key": "players", "idField": "id",
  "upserts": [ …records the user added/edited… ],
  "deletedIds": [ … ] }
```
Keep the existing write-path allow-list (`data/*.json`, `img/uploads/*`) and the PIN gate.

### 2. Update `commitDomain()` in `admin.html`
- **Delete the `fetchJSON()` live-site read.** It is the bug.
- Send `{ upserts, deletedIds }` to `save-data.js` and let the server merge.
- Use the **server's merged response** as the new in-memory state (so the admin UI reflects reality immediately and can't drift stale).
- Keep the success/error toasts and `dep-*` status messages.

### 3. Fix the double-commit in `_savePlayersAndGrid()`
It fires two `commitDomain` calls (`players` then `squad`) which race. Either:
- send **one** request that atomically updates both files, or
- **sequence** them (await the first commit's success before starting the second), with retry on conflict.

### 4. Make saves safe by design
- **Disable the Save button while a save is in flight**, show a spinner, and only re-enable on confirmed success. Prevents rapid-fire double-saves.
- After a successful save, **do not re-hydrate the in-memory arrays from the live site** (that's how in-memory additions get wiped). Trust the server's merged response.
- Surface a clear error if a save fails — never a silent no-op.

---

## Recover the lost data
The other 3 players are gone from both the site and GitHub. **Check git history** (`data/players.json` / `data/squad.json` commits around 2026-07-13 14:5x) — the overwritten versions may contain the lost names. If found, restore them into the merged file. **Do not invent player names.** If they aren't recoverable, tell the club plainly so the chairman can re-enter them (once, after the fix).

## Verification (must pass before you call this done)
1. In admin, add **4 players one at a time, saving after each, with no waiting**. All 4 must persist in `data/players.json` AND `data/squad.json` on GitHub.
2. Simulate concurrency: fire two saves to the same domain near-simultaneously — both sets of changes must survive (no lost update).
3. Repeat for another `commitDomain` domain (e.g. sponsors) to confirm the fix is systemic, not squad-only.
4. Deletions still work: deleting a record removes it and it does **not** get resurrected by the merge.

## Hard rules
- **No data loss, ever.** A save must never discard a record it didn't explicitly delete.
- Vanilla JS, no build step. Keep the PIN gate + path allow-list. Atomic commits. No secrets.
- Don't break the other editors that rely on `commitDomain` — update them consistently.

## Interim workaround (tell the club now)
Until this ships: **add all players first, then press Save once.** If you must save between entries, **wait ~90 seconds** for the site to finish rebuilding before the next save — otherwise the newer save overwrites the older one.
