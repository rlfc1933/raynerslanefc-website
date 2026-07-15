# Claude Code MASTER BRIEF — Rayners Lane FC (backend verify + Asset Studio upgrades)

Repo: `rlfc1933/raynerslanefc-website` — static HTML on Netlify + Netlify Functions + Supabase. You have GitHub + deploy context. Work in **phases, in order**. Each phase is shippable on its own. **Extend the existing code; do not rebuild working features.** Match the repo style: vanilla JS, `var`, existing helpers, no build step, no new fonts.

## Global rules (apply to every phase)
- **Brand lock:** fonts are **Bebas Neue** (`--fd`, display), **Barlow Condensed** (`--fc`, labels), **Barlow** (`--fb`, body) — **no other fonts.** Colours are tokens only: `--y #FFD100`, `--g #1A5C32`, `--bk #080808`, `--w #F5F3ED` (+ the rest in `:root` / `brand/tokens.css`). Crest is `img/badge.png`; opponent crests in `img/crests/`.
- **Never put API keys/secrets in the client.** Secrets live in Netlify env vars; secret-using functions are PIN-gated exactly like `netlify/functions/live-score.js` (`String(b.pin) !== String(process.env.ADMIN_PIN || '19332026')`).
- **Never regress** the working publish pipeline (`commitDomain` re-fetch+merge), fixture auto-fill (`psApplyFixture`), the crest library, sizes, or the share/download export.
- Atomic commits, one concern each. No secrets committed. Fail gracefully — never ship a dead button.

---

# PHASE 0 — Verify the backend actually works (do first)
Confirm which **Netlify env vars** are set and report SET/MISSING + the feature each controls:

| Var | Controls | If missing |
|---|---|---|
| `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` (or `SUPABASE_SECRET_KEY`) | real-time scoreboard, QR check-in, member list | those features dead |
| `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` | Web Push | match alerts off |
| `RESEND_API_KEY` | email | no welcome / sponsor-alert email |
| `NETLIFY_API_TOKEN` | private form reads | sponsor enquiries + fan list empty in admin |
| `ADMIN_PIN` | admin gate | **default `19332026` is live — set it now (high priority)** |

Then: confirm `supabase-schema.sql` has been run (`live_match` + `attendance` tables exist); POST a test to `/.netlify/functions/live-score` with the PIN and confirm the homepage live-bar updates within ~15s with no rebuild; do one safe reversible edit through `save-data.js` and confirm commit→live→revert. **End Phase 0 with a STATUS TABLE:** `Feature | Works? YES/NO/NEEDS-CONFIG | Evidence`. Don't fake success — if a backend isn't configured, print the exact setup steps + SQL.

---

# PHASE 1 — Fix oversized text on cards (auto-fit) + add Full-Time quote & scorers
**Root cause (verified):** every Post Studio card in `psRender()` (`admin.html`) uses **hard-coded pixel font sizes** with absolute positioning and **no wrapping/auto-fit**. So any longer text (a 2–3 sentence manager's quote, a long goalscorer list) overflows or looks oversized. The Full-Time card (`case 'halftime': case 'fulltime'` in `psFieldDefs`, and the `PS.type==='fulltime'` block in `psRender`, ~admin.html:4183) currently only collects **Home/Away score** — it has **no manager-quote or goalscorers field yet.**

### 1a. Build ONE reusable auto-fit helper
Add `psAutoFit()` that runs at the **end of `psRender()`** (after `#ps-card` innerHTML is set). It finds every element tagged `data-fit="MAX:MIN"` (px) and shrinks its `font-size` from MAX down until the text fits its box (no overflow of `scrollWidth`/`scrollHeight`), floored at MIN. For multi-line text also allow wrapping within a max-width box. Because export is `html2canvas` over the live DOM node, the fitted size is captured correctly — verify in the exported PNG, not just the preview.

### 1b. Add Manager's Quote + Goalscorers to the Full-Time card
In `psFieldDefs` for `fulltime` (keep half-time as-is or mirror), add two optional inputs: **Goalscorers** (`d.scorers`, e.g. "Hill 23', Cole 67'") and **Manager's quote** (`d.mgrQuote`, a `<textarea>` for 2–3 sentences). In the `psRender` fulltime block, render:
- **Goalscorers** as a line under the score — Bebas/Barlow, tokened, tagged `data-fit="40:22"` inside a fixed-width box so a long list shrinks instead of overflowing.
- **Manager's quote** as an italic block near the bottom (the "manager's quote here" zone) inside a fixed box, tagged e.g. `data-fit="34:16"` with wrapping, so 1 word stays big and 3 sentences shrink to fit cleanly.
Both must render correctly at all `PS_SIZES` (ig/story/x).

### 1c. Find & fix everywhere else the same text appears ("find & fix all")
Grep the repo for manager-quote / goalscorers rendering and apply the same auto-fit so nothing overflows:
- **Match Report** editor (`publishMatchReport`, `mr-scorers`, ~admin.html:1039/4983) → News page output.
- **Matchday programme** (`programme.html` / `programme-print.html`) — manager's notes + result/scorers pages (fixed sizes there too).
- Any other card free-text (announcement `body`, birthday `bmsg`, quote lines, sponsor sub-line) → tag with `data-fit` and sensible MAX:MIN so long entries never blow the layout.
**Acceptance:** typing a 3-sentence manager quote and a 6-name scorer list on the Full-Time card produces a clean, balanced graphic (text auto-shrinks, stays on-brand), and the same is true wherever those fields exist.

---

# PHASE 2 — AI copywriting (Gemini) + hook headline card + palette variety
### 2a. Backend `netlify/functions/gen-post.js` (Gemini, PIN-gated)
Mirror `live-score.js` (PIN check, CORS, graceful `{ok:false}` if key unset). Env: `GEMINI_API_KEY` (required), `GEMINI_MODEL` (optional; **confirm a current fast Gemini model from Google's docs**, endpoint `https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key=...`). Body `{ pin, mode, text }`, `mode` ∈ `tweet|hook|both`. Return `{ ok:true, tweets:[3], hook:"" }`. Timeout 12s, parse JSON defensively (strip ```` ```json ````), trim tweets to 280 chars.

**Club-voice instruction to bake in:** _"You are the social copywriter for **Rayners Lane FC** ('The Lane'), founded 1933, Step 5 Combined Counties Premier North. Yellow & green, confident, warm, punchy non-league voice, sign-off 'Up The Lane.' Never corporate. mode 'tweet' → 3 distinct ready-to-post X captions, <280 chars, strong first line, ≤2 hashtags (#UpTheLane), tasteful emoji only if earned, invent no facts. mode 'hook' → ONE 2–6 word CTA headline that teases the tweet WITHOUT restating it (e.g. 'BIG NEWS DROPS', 'THE LANE IS BACK'), ALL-CAPS friendly (renders in Bebas), no hashtags/emoji. Return strict JSON {\"tweets\":[…],\"hook\":\"…\"}."_

### 2b. Front-end: the copy box (top of Post Studio, above "1 · Choose a post")
`<textarea id="ai-src">` + buttons **"✨ Reword for X"** (mode both) and **"Headline only"** (mode hook). On click → POST to `gen-post` with the in-memory PIN → render **3 tweet variants**, each with a **Copy** button (reuse the `.soc-cap` clipboard pattern + "Copied ✓", green/red char count). Render the **hook** with **"Use as headline card →"** that sets `PS.type='headline'`, `PS.data.headline=hook`, runs `psFields()`+`psRender()`, scrolls to preview.

### 2c. New card type `headline` + palette picker
Add `{ key:'headline', label:'Headline' }` to `POST_TYPES()`. Fields: **Headline** (Bebas, auto-fit via Phase 1 `data-fit`), optional **Kicker** + **Sub-line**. Render as a bold poster title card (crest + big Bebas headline + tokened background per palette) — a teaser card, not a match card; correct at all sizes.
Replace the 2-button `#ps-theme` with a **`PS_PALETTES` swatch row (5–6 on-brand schemes)** `{key,label,bg,ink,accent}` (Black&Yellow default, Black&Green, Yellow-flood, Green-flood, Charcoal, Clean-light). `psSetPalette(key)` → `PS.palette` → re-render. **Every** card type reads the palette; keep legibility (use each palette's `ink`). Keep current yellow/green first so nothing regresses.

---

# PHASE 3 — Photo → Social composer (crop/zoom + RLFC banner overlay)
100% client-side canvas; **no backend**. New Post Studio mode **"📸 Photo Post"**.
1. **Upload** any-ratio image (`accept="image/*"`, `FileReader`→`Image`); handle 10MB+ phone photos via canvas (don't inline into JSON; export-only, never committed).
2. **Frame it:** render a real `<canvas>` at the selected `PS_SIZES` target. Photo is a `cover`-style background the user **drags to reposition** (mouse+touch) and **zooms/rescales** (slider + pinch; min scale = cover so no empty edges). Switching ig/story/x re-crops live and stays filled. Add an optional bottom **darken/gradient** slider for text legibility.
3. **RLFC banner overlays (variations):** draw from brand assets (not flat PNGs). Provide **4–6** options, each a render fn drawing crest + Bebas wordmark + tokened shapes, palette-aware, scaling across sizes. **DEFAULT banner (build this exactly):** a horizontal **PNG-style banner strip across the top of the image** — **club crest (`img/badge.png`) on the LEFT**, then a **green (`--g #1A5C32`) strip** filling the bar with **"#UPTHELANE" in italic Bebas Neue** across it (Bebas has no native italic — apply `font-style:italic` + a slight `skewX(-8deg)` for the slanted look), white text, vertically centred, tasteful padding. Other variations: bottom bar, corner lockup, thin full frame, lower-third caption panel. Also allow **"Upload custom banner PNG"** (transparent) placed on top.
4. **Optional text:** Bebas headline + Barlow sub-line into the banner/lower-third, auto-fit (Phase 1), palette-coloured, auto-contrast on the darken layer.
5. **Export:** composite via `canvas.toBlob('image/png')` at **full target resolution** (X ≈1600×900, IG 1080×1080, Story 1080×1920) — crisp, no html2canvas softness. Ensure crest/overlay images are same-origin + loaded before export. Reuse `psSaveBlob` + the mobile share sheet.

**Also (quality fix while in Post Studio):** the existing `psDownload()` uses `html2canvas(..., scale:1)` → soft exports. Render existing cards at **2×** (or native target px) so all downloaded graphics are crisp at true social dimensions.

---

## Env vars to add in Netlify
`GEMINI_API_KEY` (Google AI Studio), `GEMINI_MODEL` (optional), and ensure `ADMIN_PIN` is set (reused to gate `gen-post.js`).

## Final acceptance (whole brief)
1. Phase 0 STATUS TABLE proves each backend feature YES/NO/NEEDS-CONFIG with evidence; `ADMIN_PIN` set.
2. A 3-sentence manager quote + long scorer list on the Full-Time card auto-shrink to a clean, on-brand graphic; the same fields auto-fit wherever else they render.
3. Rough note → 3 copy-paste X captions (one-tap copy) + a teaser hook that becomes a Bebas headline card; 5–6 palettes, every card honours them.
4. Photographer uploads any photo → frames it (drag/zoom) → applies the crest-left / green-strip / italic-Bebas #UpTheLane banner (or others) → crisp export at correct social sizes via the share sheet.
5. No existing Post Studio feature (fixture auto-fill, match cards, crest library, share/download) regresses; brand fonts/colours respected throughout.
