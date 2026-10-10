---
name: rayners-asset-quality-control
description: Validate Rayners Lane FC Asset Studio graphics and files — logos, crests, safe areas, text fit, resolution, rights/approval, registry facts, exact dimensions and real file delivery (PNG, JPEG, A4 PDF, ZIP). Use before claiming any export works, after any Studio change, and before release.
---

# Rayners asset quality control

## Purpose
Prove a graphic is fit to publish and that the delivered file is real. A
preview is not a deliverable; a download that was never opened is not proof.

## Trigger conditions
- Any change under `js/studio/**`, `css/studio-*.css`, `netlify/functions/studio-assets.js`.
- A claim that a format "exports".
- A new template, format, logo version or library asset.

## Inputs
- QC rules: `StudioCore.qc(scene, doc, ctx)` (pixels + facts) and `StudioCore.factChecks(doc, ctx)` (server-side subset).
- Severities: `block` (cannot be reviewed, approved or final-exported), `warn` (a person must look), `info`.

## Steps
1. **Unit gates.** `node --test tests/studio-asset-core.test.js tests/studio-asset-pack.test.js tests/studio-asset-library.test.js`.
2. **Render everything and look.** With the local server (`cd quality && node server.js 4203`), sign in to `/admin.html`, open Post Studio → Open Asset Studio, and render every template × format via `StudioRender.prepare` + `draw` (the scratch `all.js` pattern: route `football-data` and `studio-assets` through `quality/tests/support/studio-harness.js`). Open the images with the Read tool. Check: nothing crosses a face; competition readable on sky; no empty thirds; sponsor artwork readable on its plate; crests not soft at A4.
3. **Real exports.** `cd quality && QUALITY_PORT=4203 PW_CHROMIUM_PATH=… npx playwright test tests/studio.spec.js --project=desktop-1440 --project=phone`. Scenario C clicks every export, captures the download, checks magic bytes and exact pixel size, runs `pdfinfo` (A4 595.28×841.89 pt) and `unzip -t`. Files land in `$TMPDIR/rlfc-studio-exports` — open at least one PNG per orientation and the PDF page render (`a4-page.png`).
4. **Governance checks to confirm by hand when relevant:** photo approval and rights recorded; hero-film still remains `needs_review`; sponsor logo version (outdated → warn); score present for result templates; Matchday on the day; postponed only when the registry says so; line-up has eleven.
5. **Record the outcome** in the report: which formats exported, sizes, byte counts, what was looked at.

## Dependencies
Playwright (`/home/claude/site/quality/node_modules`), Chromium at `/opt/pw-browsers/chromium-1194`, `pdfinfo`/`pdftoppm`/`unzip` when installed; rayners-asset-compositor for fixes.

## Expected outputs
Passing tests, inspected images, and a factual list: "PNG 1080×1080/1080×1350/1080×1920/1920×1080, JPEG, A4 PDF 2480×3508 in a 595.28×841.89 pt page, ZIP of all formats — verified".

## Failure conditions
- Any export whose decoded size differs from its format (the renderer throws; QC must never be bypassed).
- A "final" export from a revision that is not the approved revision.
- Claiming publication from an export — exported ≠ published.
- Any blocking QC on a graphic marked approved.

## Test requirements
All three `tests/studio-asset-*.test.js`, `quality/tests/studio.spec.js` on desktop-1440 and phone, and the admin gates (`-g admin`) with no new findings.
