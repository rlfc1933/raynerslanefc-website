# Claude Code Brief — Add AI Copywriting + CTA Headline Cards to Post Studio (Gemini backend)

Repo: `rlfc1933/raynerslanefc-website` (static HTML on Netlify + Netlify Functions). You have GitHub + deploy context. This brief **extends the existing Post Studio** in `admin.html` — do not rebuild it. Match the existing code style (vanilla JS, no framework, `var`, existing helpers) and branding.

---

## GOAL (plain English)
A social volunteer types a rough tweet into a box. One tap:
1. **Gemini rewords it** into an attractive, ready-to-post X caption they can **copy-paste straight to X** (with a Copy button).
2. Gemini also writes a short **call-to-action HOOK headline** — a teaser that makes people want to *read* the tweet. It must **NOT** just restate the tweet.
3. That hook drops into a new **Headline card** in Post Studio, rendered in **Bebas Neue**, with **a choice of on-brand colour palettes**, exported as a PNG the same way existing cards are.

So the output is two things from one box: **great tweet text to copy**, and **a title card to attach to it.**

---

## WHAT ALREADY EXISTS (integrate with these — read them first)
In `admin.html`:
- **State:** global `PS` object → `PS.type`, `PS.data`, `PS.size`, plus theme.
- **Builders:** `psBuild()` renders the type buttons from `POST_TYPES()`; `psSetType(k)`; `psFields()` renders dynamic inputs per type; `psRender()` builds the `#ps-card` preview HTML.
- **Sizes:** `PS_SIZES` = `{ ig, story, x }` (w/h) → segmented control `#ps-size` (`psSetSize`).
- **Themes:** currently only two — `psSetTheme('yellow'|'green')` via `#ps-theme`. **You will expand this into a palette picker.**
- **Fixture auto-fill:** `psApplyFixture(id)` already turns a saved fixture into a card — keep this working.
- **Export:** `psDownload()` → `html2canvas(#ps-card, { width: PS_SIZES[PS.size].w, height: PS_SIZES[PS.size].h, scale: 1 })` → native share sheet on mobile / download on desktop via `psSaveBlob`.
- **Fonts:** `--fd` = Bebas Neue, `--fc` = Barlow Condensed, `--fb` = Barlow. **No other fonts.** Colours are tokens in `:root` (`--y #FFD100`, `--g #1A5C32`, `--bk #080808`, etc.).
- **Copy-to-clipboard pattern already exists** on `.soc-cap` blocks in the Social tab — reuse that interaction (tap to copy + "copied ✓" feedback).
- **Toast + dep feedback:** use existing `toast(msg, isErr)` for status.
- **Secret pattern:** Netlify functions read secrets via `process.env.X`; several are **PIN-gated** (see `live-score.js` — it checks `String(b.pin) !== String(process.env.ADMIN_PIN || '19332026')`). Mirror that exactly.

---

## TASK 1 — New backend function: `netlify/functions/gen-post.js` (Gemini, PIN-gated)
Create a POST-only function that calls the Gemini API server-side so the key never touches the browser.

- **Env vars:** `GEMINI_API_KEY` (required), `GEMINI_MODEL` (optional, default to a current fast model), `ADMIN_PIN` (reuse existing).
- **Model:** use the current Google Generative Language API. Endpoint pattern: `https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={GEMINI_API_KEY}`. **Confirm the current recommended fast model name from Google's docs before hardcoding** (model names change); make it overridable via `GEMINI_MODEL`. Request JSON output.
- **Auth:** reject if `pin` in body ≠ `process.env.ADMIN_PIN` (default `19332026`), returning `401`. Mirror `live-score.js` response helper + CORS headers.
- **Graceful failure:** if `GEMINI_API_KEY` unset, return `200 { ok:false, error:'no-key', setup:'Add GEMINI_API_KEY in Netlify env vars.' }` so the UI degrades cleanly (never a dead button).
- **Request body:** `{ pin, mode, text, context? }` where `mode` ∈ `"tweet"` | `"hook"` | `"both"`.
- **Response:** `{ ok:true, tweets:[3 strings], hook:"…" }` (return whichever the mode asks for).
- **Timeout:** `AbortSignal.timeout(12000)`; catch and return `{ ok:false, error }` (never throw).

### The prompt Gemini receives (bake this in as a system/instruction preamble — this is the club voice):
> You are the social media copywriter for **Rayners Lane FC** ("The Lane"), a proud English non-league football club founded 1933, playing Step 5 in the Combined Counties Premier Division North. Club identity: **yellow and green**, confident, warm, community-first, punchy. Signature sign-off: **"Up The Lane."** Never corporate, never cringe, never over-hashtagged.
>
> **For mode "tweet":** rewrite the user's rough note into **3 distinct ready-to-post X captions**. Each: under 280 characters, scroll-stopping first line, natural British football tone, at most 1–2 relevant hashtags (e.g. #UpTheLane), tasteful emoji only if it earns its place. Return real punctuation, no markdown. Do not invent facts (scores, names, times) not present in the input.
>
> **For mode "hook":** write ONE very short **call-to-action headline** of **2–6 words** for a graphic title card. It must **tease and pull the reader into the tweet WITHOUT restating its content** — think a headline that makes someone stop and read (e.g. "BIG NEWS DROPS", "THE LANE IS BACK", "YOU'LL WANT TO SEE THIS", "MARK THE DATE"). ALL CAPS friendly (it renders in Bebas Neue). No emoji, no hashtags, no punctuation unless essential.
>
> Return strict JSON only: `{ "tweets": ["…","…","…"], "hook": "…" }`.

Validate/parse the JSON defensively (Gemini sometimes wraps it in ```` ```json ````). Trim tweets to 280 chars as a safety net.

---

## TASK 2 — New Post Studio card type: "Headline / Hook"
Add a new entry to `POST_TYPES()` (key e.g. `headline`) with an icon, so it appears as a selectable card. Its `psFields()` inputs:
- **Headline** (the big Bebas line — pre-filled by the AI hook, fully editable).
- **Kicker** (optional small line above, e.g. "RAYNERS LANE FC" or "NEWS").
- Optional **sub-line** (small, optional).

Its `psRender()` card: bold, minimal, poster-style — big Bebas headline centred, club crest, tokened background per the selected palette (Task 3). It should look like a **title card that makes people read the caption**, not a match card. Must render correctly at all three `PS_SIZES` (ig / story / x).

---

## TASK 3 — Expand the 2-colour toggle into a PALETTE PICKER (variation options)
Replace the two-button `#ps-theme` with a row of **on-brand palette swatches** (keep it a horizontal, tappable strip like the existing seg control). Define a `PS_PALETTES` array of **5–6 schemes**, each an object `{ key, label, bg, ink, accent }`, all drawn from or harmonious with the locked brand tokens. Suggested set (adjust to brand tokens, confirm against `brand/tokens.css` / `brand/BRAND.md`):
- **Black & Yellow** (bg `#080808`, ink `#F5F3ED`, accent `#FFD100`) — default
- **Black & Green** (bg `#080808`, ink `#F5F3ED`, accent `#1A5C32`)
- **Yellow flood** (bg `#FFD100`, ink `#080808`, accent `#1A5C32`)
- **Green flood** (bg `#1A5C32`, ink `#F5F3ED`, accent `#FFD100`)
- **Charcoal** (bg `#161616`, ink `#F5F3ED`, accent `#FFD100`)
- **Clean light** (bg `#F5F3ED`, ink `#0F0F0F`, accent `#1A5C32`)

`psSetPalette(key)` sets `PS.palette` and re-renders. **All existing card types must read the palette too** (so every card gets the variety, not just the headline). Keep the current yellow/green as the first two so nothing regresses. Every combination must stay legible (enforce dark-ink-on-light / light-ink-on-dark — the palette defines `ink`, so use it).

---

## TASK 4 — The AI copy box + Copy buttons (the core ask)
At the **top of the Post Studio panel** (above "1 · Choose a post"), add an **"✍️ Write & reword for X"** block:
- A `<textarea id="ai-src">` — "Type your rough tweet / note here…"
- Two buttons: **"✨ Reword for X"** (mode `both`) and a small **"Headline only"** (mode `hook`).
- On click → `toast('Writing…')` → POST to `/.netlify/functions/gen-post` with `{ pin: <current admin PIN in memory>, mode, text }`.
- Render the **3 tweet variants** as cards, each with a **Copy** button (reuse the `.soc-cap` copy pattern → `navigator.clipboard.writeText` with `document.execCommand('copy')` fallback, and "Copied ✓" feedback). Under 280 = green count, over = red.
- Render the **hook** with an **"Use as headline card →"** button that: switches `PS.type` to `headline`, sets `PS.data.headline = hook`, runs `psFields()` + `psRender()`, and scrolls to the preview. So the flow is: type note → get 3 tweets to copy → one tap turns the hook into a finished title card to download.
- If the function returns `ok:false` (no key / error), show a friendly toast and keep the manual fields usable — **never a dead button.**

---

## TASK 5 — Export quality + polish (while you're in here)
1. **Fix export resolution.** `psDownload()` uses `scale: 1`. Render the PNG at **2×** (or size the card natively to the real target pixels: X ≈ 1600×900, IG 1080×1080, Story 1080×1920) so exported images are crisp on social, not soft. Verify the output dimensions.
2. Confirm **fonts are fully loaded before capture** (the `document.fonts.ready` guard already exists — keep it; the new Bebas headline card must not export in a fallback font).
3. Keep the mobile **share-sheet** path and desktop download path intact.
4. Make sure the whole Post Studio panel is **easy to copy / save / edit / navigate**: logical top-to-bottom order (write → pick card → palette/size → preview → save), big tap targets, existing back button, no horizontal scroll on mobile.

---

## Guardrails
- **Extend, don't rewrite** Post Studio. Preserve `psApplyFixture`, existing card types, sizes, crest library, and the export path.
- **Never put `GEMINI_API_KEY` in the client.** Server function only, PIN-gated like `live-score.js`.
- Keep everything on-brand: **Bebas / Barlow only**, tokened colours only, no new fonts or off-palette colours.
- No new build step — plain `<script>` / functions, matching the repo.
- Atomic commits, one concern each. Don't commit any secret.

## Acceptance criteria
1. Typing a rough note + "Reword for X" returns 3 on-voice captions, each copy-paste-able with one tap and a "Copied ✓" confirmation.
2. The generated **hook is a teaser, not a restatement**, and one tap turns it into a Bebas headline card.
3. The palette picker offers 5–6 on-brand schemes and **every** card type honours the choice, always legible.
4. Exported PNGs are crisp at correct social dimensions (verify X and IG sizes) and render in Bebas, not a fallback.
5. With `GEMINI_API_KEY` unset, the AI buttons fail gracefully and the rest of Post Studio still works.
6. Nothing in the existing Post Studio (fixture auto-fill, match cards, sizes, crest library, share/download) regresses.

## Env vars to add in Netlify
- `GEMINI_API_KEY` — from Google AI Studio.
- `GEMINI_MODEL` — optional override (else a current fast model).
- `ADMIN_PIN` — already required; reused to gate this function.
