# Claude Code Brief — Add a Photo → Social Composer (crop/zoom + RLFC banner overlay) to Post Studio

Repo: `rlfc1933/raynerslanefc-website` (static HTML on Netlify). You have GitHub + deploy context. This **extends the existing Post Studio** in `admin.html`. Match the existing vanilla-JS style and branding. **No backend needed — this is 100% client-side canvas compositing.**

---

## GOAL (plain English)
A photographer sends match photos. A volunteer opens Post Studio, uploads the photo (any ratio, any size), **drags to reposition and zooms/rescales** it to sit nicely inside a social frame (square / story / X), then drops a **pre-made Rayners Lane FC banner** on top so it looks official and personal to the club. One tap exports a crisp, ready-to-post PNG. They can produce several variations quickly.

---

## WHAT ALREADY EXISTS (integrate — read first)
In `admin.html`:
- **Post Studio panel** `#panel-poststudio`, state object `PS` (`PS.type`, `PS.data`, `PS.size`), `PS_SIZES` = `{ ig, story, x }` (w/h), the palette picker (`PS_PALETTES` / `psSetPalette` — if the AI-copy brief has been built; otherwise the two `psSetTheme` colours).
- **Assets you can use directly:** club crest `img/badge.png`; opponent crests `img/crests/*.png`; brand tokens in `:root` + `brand/tokens.css` (`--y #FFD100`, `--g #1A5C32`, `--bk #080808`, `--w #F5F3ED`); fonts `--fd` Bebas Neue, `--fc` Barlow Condensed, `--fb` Barlow (**no other fonts**).
- **Precedent for swatch overlays:** `COVER_THEMES` + `prSetTheme` (programme covers) — mirror this pattern for banner/palette swatches.
- **Export precedent:** `psDownload` / `psSaveBlob` — native share sheet on mobile, download on desktop. Reuse `psSaveBlob` for the final save.
- **Image upload precedent:** `prevImg` / `uploadImg` / the `.iup-wrap` dropzone component.

---

## TASK 1 — New Post Studio mode: "📸 Photo Post"
Add it as a selectable card type (or a top-level toggle in Post Studio, your call — keep it obvious). Layout, top to bottom: **Upload → frame the photo → choose banner → optional text → save.** Big tap targets, no horizontal scroll on mobile, existing Back button.

## TASK 2 — Upload any image
- File input (reuse `.iup-wrap`), `accept="image/*"`, accept **any ratio/size**. Read via `FileReader` → an `Image`. Handle large phone photos (10MB+ JPEGs) without freezing — draw to canvas, don't inline into JSON.
- Keep it all in memory/on canvas; **do not** commit photos to the repo. This is an export tool, not a stored gallery.

## TASK 3 — Crop / zoom / rescale into the social frame (the core interaction)
Render a **real `<canvas>`** sized to the selected `PS_SIZES` target (square/story/X). The photo is the background layer the user positions inside it — like `background-size: cover` but manually controlled:
- **Zoom / rescale:** a slider AND pinch-to-zoom on touch (scale the photo up/down; min scale = "cover" so no empty edges).
- **Reposition:** drag (mouse + touch) to pan the photo within the frame.
- **Switch frame ratio** (ig / story / x) live via the existing size control — the photo stays, the crop window changes; keep it filled.
- Optional niceties: a subtle darken/gradient slider at the bottom so overlaid text/banner stays readable on bright photos.
- Everything updates the canvas live. Use `requestAnimationFrame`; keep it smooth on a mid-range phone.

## TASK 4 — Pre-made RLFC banner overlays (with variations)
Provide a **set of on-brand banner/frame overlays** the user picks from as swatches (like `COVER_THEMES`). **Draw them from brand assets — do not depend on flat PNGs a designer must remake.** Each overlay = a small render function that draws onto the canvas over the photo, using `img/badge.png` + a Bebas wordmark + tokened shapes. Build **4–6 variations**, e.g.:
1. **Bottom bar** — solid/gradient tokened bar across the bottom with crest + "RAYNERS LANE FC" in Bebas.
2. **Top ribbon** — slim branded strip at the top (crest left, wordmark right).
3. **Corner lockup** — crest + small wordmark in one corner, minimal.
4. **Full frame** — thin tokened border + crest badge + optional bottom caption strip.
5. **Lower-third** (for action shots) — angled tokened panel bottom-left for a name/caption.
6. **Clean crest watermark** — semi-transparent crest, subtle.

Each overlay must:
- Respect the **selected palette** (Task from the AI brief / `PS_PALETTES`) so colours vary but stay on-brand and legible.
- Scale correctly across all three frame sizes.
- **Also allow an "Upload custom banner PNG"** option (transparent PNG) for one-off designs — drawn on top at chosen position/opacity.

## TASK 5 — Optional text on the photo
- Optional **headline** (Bebas) + **sub-line** (Barlow) fields that render into the overlay's text zone (e.g. the bottom bar / lower-third). Editable, on-brand, palette-coloured, always legible (auto-contrast against the darken layer).
- If the AI-copy Post Studio brief is built, let the user pull a generated **hook** straight into this headline.

## TASK 6 — Export (crisp, correct sizes)
- Export the composited canvas directly via `canvas.toBlob('image/png')` at the **full target resolution** (X ≈ 1600×900, IG 1080×1080, Story 1080×1920) — pixel-exact, no html2canvas, no softness.
- Ensure the crest/overlay images are fully loaded (and same-origin, so no canvas taint) before export.
- Reuse `psSaveBlob` + the mobile share-sheet path so it saves to camera roll / WhatsApp / Instagram on phone, downloads on desktop.
- Filename e.g. `rayners-lane-photo-<size>.png`.

## Guardrails
- **Extend Post Studio; don't rewrite it.** Keep all existing card types, fixture auto-fill, crest library, sizes, palettes, and export paths working.
- **No backend, no new dependencies** if avoidable — plain canvas + vanilla JS. (A tiny well-known cropper lib is acceptable only if it beats hand-rolling; prefer no dependency.)
- Bebas / Barlow only; tokened colours only; use `img/badge.png` for the crest.
- Don't store uploaded photos in the repo or JSON — in-memory + export only.
- Atomic commits; no secrets.

## Acceptance criteria
1. Upload a portrait phone photo → drag + zoom to frame it in a square, then switch to X (landscape) and it stays filled and repositionable.
2. Pick from **4–6 RLFC banner overlays**, each on-brand (crest + Bebas wordmark + tokened shapes), palette-swappable, legible on any photo.
3. Optional headline/sub-line render cleanly and stay readable on bright images.
4. Export is **crisp at the correct social pixel dimensions** and saves via the phone share sheet / desktop download.
5. Works smoothly on a mid-range phone; large uploads don't crash it.
6. Nothing in the existing Post Studio regresses.
