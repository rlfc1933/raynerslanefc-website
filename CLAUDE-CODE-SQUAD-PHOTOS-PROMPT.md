# Claude Code Brief — Squad photos, coaches, and FIX the squad page

Repo: `rlfc1933/raynerslanefc-website`. Static HTML on Netlify. **The squad is now owned by Supabase** (`la-publish-players.js` regenerates `data/players.json` + `data/squad.json` from Supabase). The Lane App staff screens / `la-import-roster` manage the roster.

The club has uploaded player + staff photos and named them by person. Match them, wire them in, add the coaches to the site, and fix the squad page — **without breaking anything or reintroducing the two-sources data-loss bug.**

## Inputs already prepared (use them — do not re-guess)
- **Photos:** `img/squad pics/` — 21 PNGs (18 players, manager Gary Pitt, 2 coaches).
- **Verified mapping:** `squad-photo-map.json` (repo root). Filenames differ from DB names by spelling (Adofolami→Adefolami, Bernard→Barnard-White, El-Kafash→El-Kaffash, Santagelo→Santangelo, Atahan→Ati, Matteo→Mateo, Matt→Matthew, Temi→Temi Animashaun, etc.). **These matches are confirmed — use the map, don't fuzzy-match again.**

---

## ⚠️ HARD RULES
1. **Supabase is the single source of truth for the roster.** Set each player's photo on their **Supabase record (`photo_url`)**, then run **`la-publish-players`** to regenerate `players.json`/`squad.json`. **Do NOT write photos straight into `data/players.json`** — the next Supabase publish would wipe them (this is the exact bug from the 14 July audit). One owner only.
2. **Never rename a player.** The DB spellings (e.g. "Barnard-White", "Mateo") are canonical. The *photo* is what gets attached — the player record's name does not change.
3. **The 6 players without a photo are SIGNED squad members awaiting their pics** (Carl Adiku, Joshua Andrews, Badou Faye, Nathan Kpemou, Jamie Pitt, Alvin Walters) — they **stay on the squad** and show a clean initials placeholder for now; their photo gets added later. **Do not remove them.**
4. **Unmatched photo files = trialists from the shoot day → SKIP.** If a photo file matches no player/staff record, do **not** create a new player from it. (Currently every file matches, so nothing is skipped — but never invent a squad member from a stray image.)
4. Don't touch the public site's working parts, the Lane App, or the fixtures. Atomic commits.

---

## TASK 1 — Process & host the images (they are far too big as-is)
The uploads are **~2MB each, ~40MB total** — that would cripple the squad page on mobile.
- **Rename the folder** to a URL-safe path (the current name has a space — `img/squad pics/` — which breaks URLs). Use **`img/players/`** (already exists) or `img/squad/`.
- **Rename each file to a slug** matching the player id (e.g. `michael-adefolami.png`), per `squad-photo-map.json`.
- **Resize + compress**: produce a **web card image** (~800px, WebP + PNG/JPG fallback, ~150–250KB) and ideally a **small thumb** (~300px) for grids. Keep the original aspect; do not stretch faces. (Use `sharp` in a one-off script — it's already a dependency.)
- Commit the optimised images; **do not commit the 40MB originals** to the deployed site (keep them out via `.gitignore` or a `/_source/` folder).

## TASK 2 — Attach photos to players (via Supabase)
For each of the **18 matched players** in `squad-photo-map.json`:
- Set `photo_url` on their **Supabase** player record to the optimised image path.
- Run **`la-publish-players`** so `players.json` (profiles) and `squad.json` (grid) regenerate **with the photo field populated**.
- Verify the published JSON now has real `photo` values (currently **0 of 24** have photos).

## TASK 3 — Manager + Coaches
- **Gary Pitt** (`Gary Pitt.png`) → set as the **First Team Manager** photo wherever the manager is shown (squad page header, About/committee).
- **Add the 2 coaches to the CLUB tab** (`about.html` / `data/committee.json` — whichever drives the "Club Roles & Staff" section):
  - **Dave Roberts — Coach**
  - **Louis Blinko — Coach**
  with their photos (`Dave Roberts - Coach.png`, `Louis Blinko - Coach.png`). Match the existing committee/staff card style. If `committee.json` is admin-owned (not Supabase), use the admin save path (`commitDomain`) — confirm which system owns it first so you don't create a second-source conflict.

## TASK 4 — 🔴 FIX THE SQUAD PAGE (it's currently broken/embarrassing)
The live `squad.html` currently shows: **"Developer Setup Required — Player Cards tab needs a Google Sheet connected. See SETUP-GUIDE.md"** and falls back to a Pitchero embed. **It does not render the club's own squad data at all.** This is a public page telling visitors it needs developer setup.
- **Remove the Google-Sheet dependency.** Render the squad **directly from `data/squad.json` / `data/players.json`** — the club's real data — as the default, primary view.
- Show each player as a card: **photo**, name, squad number, position; tap → profile (photo, position, bio, stats). Photos `object-fit: cover`, lazy-loaded, with an on-brand initials placeholder for the trialists/anyone without a photo.
- Keep a Pitchero link if useful, but it must **not** be the primary/fallback — the club's own squad is the hero.
- Remove the "Developer Setup Required" message entirely.

## TASK 5 — Health check (the club is worried the site is broken)
Confirm and report: all `data/*.json` valid; all JS parses; the homepage, squad, fixtures and About pages render; the Lane App still works; publishing a change appears live (cache OK). Fix anything genuinely broken you find; **report honestly** if something's off.

---

## Acceptance criteria
1. All **18 matched players** show their real photo on the squad page and profile; **0 became misassigned** (verify a few visually — e.g. Temi Animashaun = `Temi.png`).
2. Photos are **optimised** (~150–250KB, not 2MB); the squad page loads fast on mobile.
3. Photos are set in **Supabase and published via `la-publish-players`** — a subsequent publish does **not** wipe them.
4. **Gary Pitt** shown as manager with photo; **Dave Roberts** and **Louis Blinko** appear as **Coaches on the Club tab** with photos.
5. The squad page renders the **club's own squad from its own data** — the "Developer Setup Required / connect a Google Sheet" message is **gone**.
6. Trialists without photos degrade to a clean initials placeholder; nothing is broken.
7. Health check passes; nothing else on the site or Lane App regresses.

## Final report
State: which folder/paths were used, confirmation photos went via Supabase (not direct to JSON), the coaches added, that the squad page now renders real data, and the health-check result.
