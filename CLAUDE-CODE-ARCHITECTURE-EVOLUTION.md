# Claude Code Brief — Architecture Evolution (Phases 1–3)

Repo: `rlfc1933/raynerslanefc-website`. Static HTML on Netlify, no build step, vanilla JS; content is flat `data/*.json` committed to GitHub by `netlify/functions/save-data.js` (triggering a full rebuild), read by the pages; `admin.html` is the editor; Supabase already powers the live scoreboard + attendance. You have GitHub + deploy context.

## Prime directive — this is a migration, not a rewrite
Evolve the architecture **incrementally and reversibly**. The live site and the "any volunteer edits from `admin.html`" flow must keep working at every step. Each phase ships on its own and is verified before the next begins. **No paradigm change to the front end in this brief** — no React, no Astro, no build step yet (that's a separate future decision). Atomic commits, one concern each. Never commit secrets. Never destroy data — migrations are additive with fallbacks.

Do the phases in this order: **1 (images) → 2 (caching) → 3 (data layer)**. Phases 1–2 are non-breaking quick wins; Phase 3 is the big one and is done domain-by-domain with fallbacks.

---

## PHASE 1 — Image pipeline (responsive, modern formats)
**Problem:** images are served raw at original size/format; no responsive sizing, no AVIF/WebP. This hurts performance and quality (and the "soft exports / heavy pages" issues elsewhere).

**Do:**
1. Adopt an on-the-fly image transform CDN at £0 — **Netlify Image CDN** (built in: `/.netlify/images?url=…&w=…&fm=avif`) preferred, or Cloudinary free tier. Confirm which is available and standardise on one.
2. Add a small helper (`js/img.js`) that rewrites image URLs to the CDN with the right width + `fm=avif`/`webp` + quality, and emits **responsive `srcset`/`sizes`** for the common slots (hero, cards, crests, gallery, player photos).
3. Apply `loading="lazy"` + `decoding="async"` to non-hero images; preload the LCP hero image per page.
4. Leave crests/logos as `contain`, photos as `cover`. Don't upscale beyond source.

**Acceptance:** Lighthouse mobile Performance improves measurably; images download as AVIF/WebP at device-appropriate sizes; no visual regressions; crests stay crisp.

---

## PHASE 2 — Caching & content-hashing
**Problem:** `netlify.toml` force-revalidates JS/CSS on every load (`max-age=0, must-revalidate`) — no real CDN caching, so returning visitors re-fetch unchanged assets.

**Do:**
1. **Content-hash** the static assets that don't change per-deploy (`css/*.css`, `js/*.js`) — filename or query hash — and serve them `Cache-Control: public, max-age=31536000, immutable`.
2. Keep **HTML** and **`data/*.json`** on short/revalidate caching (they change) — leave those rules as they are.
3. Ensure the service worker (`sw.js`) never caches `data/*` (already correct) and picks up hashed assets cleanly (bump the cache version on deploy).
4. Verify no stale-asset bugs: a deploy must invalidate old hashed files and clients must get the new ones.

**Acceptance:** repeat visits serve JS/CSS from cache (200-from-disk/304 → immutable), HTML/data still update immediately after an edit, no stale-asset breakage.

---

## PHASE 3 — Supabase as the primary data layer (the big evolution)
**Goal:** move content from "commit JSON → full rebuild to publish" to **instant reads/writes against Supabase (Postgres + REST + Realtime + RLS)**, so an edit is live in seconds with no rebuild — while keeping the git-JSON as an automatic backup/fallback and keeping `admin.html` as the editor. This is the change that turns the site from "a brochure that republishes" into a live app.

### Do it domain-by-domain, not all at once
Start with **one low-risk pilot domain: `news`.** Prove the full loop, verify, then roll the identical pattern out to the other domains (`fixtures`, `squad`/`players`, `sponsors`, `committee`, `gallery`, `programmes`, `perks`, etc.). Extend the pattern already proven by `live_match`/`attendance` + `live-score.js`.

### The pattern for each domain
1. **Schema:** create a Supabase table mirroring the JSON shape (append to `supabase-schema.sql`, `IF NOT EXISTS`, safe to re-run). Enable **RLS**: public `SELECT` (anon key) for public content; **writes only server-side** with the service key.
2. **Write path:** a PIN-gated function (mirror `live-score.js`) — `admin.html`'s existing `commitDomain` save calls it → it upserts into Supabase **instantly (no rebuild)**. Preserve the re-fetch-and-merge safety `commitDomain` already has. **Also** keep writing the JSON snapshot to git as an automatic **backup/export** (so nothing is lost and the site still works if Supabase is ever down) — but the DB is now the source of truth.
3. **Read path:** pages read from Supabase via the **anon key + RLS public read** (poll or Supabase Realtime for live things). Implement a **fallback**: if the Supabase read fails, fall back to `data/<domain>.json`. This makes the migration safe — worst case, you're back to today's behaviour.
4. **Migrate existing data** once: seed the table from the current `data/<domain>.json`.
5. **Verify** the pilot end-to-end (edit in admin → live in ~seconds, no rebuild; public page renders from DB; fallback works if DB unreachable; RLS blocks unauthorised writes) **before** rolling out to the next domain.

### Keep intact
- `admin.html` UX and the `commitDomain` merge-safety must not regress.
- The site must render even with the DB unreachable (JSON fallback).
- RLS must prevent any client-side write; all writes go through the PIN-gated service-key functions.

**Acceptance (Phase 3):** editing any migrated domain in `admin.html` appears on the public site in **seconds with no Netlify rebuild**; public pages read from Supabase with a working JSON fallback; writes are server-side + PIN-gated + RLS-protected; a git JSON backup of each domain still exists; no content lost in migration.

---

## Env vars (Netlify)
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (or `SUPABASE_SECRET_KEY`) — server writes (already used).
- `SUPABASE_ANON_KEY` — public reads via RLS (add if not present).
- Image CDN: none if using Netlify Image CDN; else Cloudinary cloud name.

## Explicitly OUT of scope for this brief (separate future decision)
Front-end framework / build step (Web Components or **Astro**), design-system componentisation, fan-account SSO, and any Cloudflare platform move. Do **not** start these here — note them in the final report as the recommended next architectural step, with the trade-off that they introduce a build step.

## Final report
End with: what shipped per phase, before/after Lighthouse numbers, which domains are now Supabase-backed vs still JSON, and a short "next: components + build step (Astro)" recommendation with its trade-offs.
