---
name: rayners-asset-compositor
description: Layout objects, image positioning and export composition for the Rayners Lane FC Asset Studio — the Scene builder, contain/cover maths, text fitting, safe areas, per-format crops and the canvas renderer (js/studio/core.js, js/studio/render.js). Use when changing how layers are placed, how photos are cropped, how text fits, or how a scene becomes pixels.
---

# Rayners asset compositor

## Purpose
Turn a document (`doc`: template, fields, per-format crops, colourway, fact
snapshot, pinned logo version) into an exact-pixel scene, and that scene into
the same pixels on screen and in the exported file.

## Trigger conditions
- Editing `Scene`, `contain`, `cover`, `fitText`, `wrap`, `photoLayer`, `sponsorMark`, `plateFill` or any `ARCH.*` geometry.
- Changing `js/studio/render.js` (`prepare`, `draw`, `exportFile`).
- A bug like "text overlaps", "photo crop wrong in story", "logo looks stretched/soft".

## Inputs
- `doc` (see `StudioApp._state.doc`), `formatId`, library ctx `{assets, sponsors, logos, meta}`.
- Real image sizes: `render.prepare()` loads every image first, then composes again — layout maths never runs on guessed sizes.

## Steps
1. **Units.** `u = min(w, h) / 1080`; place everything in `u` relative to the safe rect `s.S` (`l t r b w h`). Do not hard-code pixels.
2. **Images.** `s.image({role})`: `crest`/`logo` are forced to `contain` from natural size; `photo` uses `cover` with `doc.formats[fmt].focus/zoom`, defaulting to the asset's `subject` zone. Crops are stored PER FORMAT — never share one crop across formats.
3. **Text.** Give each text layer a box, `size`, `minSize`, `maxLines`. `fitText` shrinks to `minSize` and then reports `overflow` — never truncate silently. Use `s.fitted(L)` when the next block should follow the actual height (flow layout).
4. **Sponsor artwork.** Use the white variant on dark colourways when it exists; otherwise draw the colour artwork on a plate matching its recorded `ground` (`light`/`dark`). Ground is data on the logo version, never guessed.
5. **Layer order.** bg → photo → scrims → panels/plates → crests/logos → text → stamp. Scrims are canvas gradients; nothing relies on CSS effects.
6. **Render path.** One path: `R.prepare` → `R.draw(scene, canvas)`. Preview = the same canvas scaled by CSS. Export = `canvas.toBlob` at exact size, then `StudioPack.imageSize` must equal the format or the export throws.
7. **Verify.** Run the core tests, then render all templates × formats in a browser and inspect (see rayners-asset-quality-control).

## Dependencies
`js/studio/core.js`, `js/studio/render.js`, `js/studio/pack.js`; fonts `fonts/bebas-neue-*.woff2`, `fonts/manrope-*.woff2` (loaded via FontFace before drawing).

## Expected outputs
Scenes whose layers are all inside the safe area (except decorative bg/photo/scrim/plates), fitted text, undistorted marks, and byte-identical preview/export geometry.

## Failure conditions
- QC `safe-area`, `text-overflow` or `distorted` on the sample data.
- Drawing before fonts load (fallback face in an export).
- Any code path that sets a logo's width and height independently.
- Export dimensions not equal to `FORMATS[fmt].w × h`.

## Test requirements
`node --test tests/studio-asset-core.test.js tests/studio-asset-pack.test.js`; Playwright `quality/tests/studio.spec.js` (downloads checked for exact pixel size).
