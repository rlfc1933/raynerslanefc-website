# Claude Code Brief — Add AI "background eraser" (player cutout) to Post Studio

Repo: `rlfc1933/raynerslanefc-website` (static HTML, no build step, vanilla JS + CDN). You have GitHub + deploy context. This **extends the existing Post Studio** in `admin.html`. Match the repo style; no framework, no build step.

## Goal
When the club announces a **new signing** (or MOTM / player of the month), a staffer uploads a player **headshot** and the studio **automatically removes the background** — Canva-style — producing a **transparent PNG cutout** of the player that sits cleanly against the branded card background, instead of a rectangular photo in a frame.

## Approach — in-browser, free, no API key
- Use **`@imgly/background-removal`** (open-source, runs a segmentation model **fully client-side** via CDN — no server, no key, no per-image cost, privacy-friendly). Load it lazily (only when the cutout tool is opened), from CDN.
- Fallback option: **MediaPipe Selfie Segmentation** if imgly doesn't fit. Do not use paid cloud APIs (remove.bg / Cloudinary) — no keys, no cost is a hard requirement.

## Where it plugs in (integrate, don't rebuild)
- Post Studio already renders player photos on the **signing / motm / potm / goal / birthday** cards (`psPlayerCard` / `playerFrame` / `psEff`, photos from Player Profiles `psPlayers`, uploads via `psLogoUpload`).
- Add a **"✂️ Cut out background"** action wherever a player photo is uploaded/selected (the signing card first, then the other player cards, and the Player Profiles editor so the cutout is saved for reuse).

## Build it
1. **Upload / pick photo** → **"Cut out background"** button. On tap: show a spinner/progress ("Removing background… first time takes a few seconds"), run the model, get a **transparent PNG** (`image/png` with alpha).
2. **Preview against the card** immediately — the cutout should render with no frame, drop-shadow optional, so staff see it sitting on the branded background. Add simple controls to **scale, reposition (drag), and flip** the cutout so it composes nicely (reuse the existing scale/nudge slider pattern from the sponsor-logo/pre-season crest fields).
3. **Manual touch-up (important — auto isn't always perfect):** a small **erase / restore brush** over a canvas so staff can clean up stray edges (hair, background bits) or bring back a bit that got cut. Keep it simple: brush size slider, erase/restore toggle, undo.
4. **Fallbacks & UX:** "Use original photo" button if they don't want a cutout; if the model fails or the photo is unsuitable, fall back gracefully to the original framed photo (never a broken card). Cache the loaded model so subsequent cutouts are instant.
5. **Save & reuse:** store the resulting transparent PNG (e.g. as the player's `photoCutout` alongside the existing `photo` in Player Profiles) so a signing/MOTM card can reuse it without re-processing. Don't bloat JSON — store the cutout as an uploaded image file (via the existing image-upload path), not a giant base64 blob inline.
6. **Signing card treatment:** with a cutout available, design the signing card so the player is **knocked out against a cinematic branded background** (tokened dark gradient + big crest watermark + Bebas "NEW SIGNING" + name), player cutout anchored bottom/centre — the premium "unveiling" look, not a photo in a box.

## Hard rules
- **In-browser only, no API key, no per-image cost.** Load the model lazily from CDN so the rest of Post Studio stays fast.
- Output must be a true **transparent PNG** (alpha preserved) and export crisp at the card's real resolution (tie into the 2× export fix if present).
- **Brand lock:** Bebas / Barlow only, tokened colours, crest `img/badge.png`. Don't regress existing player cards, fixture auto-fill, or the export/share path.
- Handle large phone photos without freezing; show progress; degrade gracefully to the original photo on any failure.
- Vanilla JS, no build step. Atomic commits. No secrets.

## Acceptance
1. Upload a normal headshot → one tap removes the background → a clean transparent cutout previews against the branded signing card.
2. Staff can scale/move/flip the cutout and brush-fix stray edges; "use original" always works as a fallback.
3. The cutout saves to the player's profile and is reused on signing/MOTM/POTM cards without re-processing.
4. Export is a crisp PNG at correct social size; no card regresses; everything stays on brand.
5. Works with no API key and no ongoing cost (model runs in the browser); first run shows progress, later runs are fast.
