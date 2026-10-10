---
name: rayners-asset-art-director
description: Creative direction and template quality for the Rayners Lane FC Asset Studio (js/studio/core.js). Use when adding or changing a template, an archetype layout, a colourway, typography on artwork, or when a graphic "looks wrong", generic or off-brand. Not for HQ screens (use rayners-design-system-guardian / lane-design-system).
---

# Rayners asset art director

Owns what the club's graphics LOOK like, and keeps them a controlled system
rather than a set of one-offs.

## Purpose
Every graphic the Studio produces must read as Rayners Lane FC at a glance,
from a phone, on a feed full of other clubs — and must be honest: real club
photography, real crests, real fixtures, nothing invented.

## Trigger conditions
- A new template is requested (e.g. "Half time", "Player spotlight").
- An archetype layout in `js/studio/core.js` (`ARCH.*`) is edited.
- A colourway (`VARIANTS`) or type size on artwork changes.
- Someone reports a graphic is cramped, empty, generic or off-brand.

## Inputs
- `js/studio/core.js` — FORMATS, VARIANTS, TEMPLATES, ARCH layouts.
- `js/studio/library-seed.json` — the genuine assets (rebuild with `node js/studio/tools/build-library.js`).
- Brand: `brand/tokens.json`, `DESIGN.md`. Fonts: Bebas Neue (display, artwork headlines, scores), Manrope (everything else).
- PHASE rules: no invented photography, sponsors, prices or quotes; ground is shared — never imply ownership.

## Steps
1. **Choose the archetype, don't invent a layout.** Existing: `fixture`, `score`, `lineup`, `sponsor`, `editorial`, `cover`, `advert`. A new template reuses one and supplies `content()`; a new archetype is justified only when the information shape differs.
2. **Compose each orientation on purpose.** Every archetype has `sq` (square/portrait), `tall` (story, A4) and `wide` (landscape) branches. A story is recomposed (stacked teams, larger headline), never a cropped square. Check the story safe area (top 250, bottom 300 px).
3. **Controlled fields only.** A template exposes the few words a person may change (`F.text`/`F.area` with `max`), one optional photo from approved categories, an optional/required sponsor, and an approved colourway (`night`, `green`, `paper`). No free colour pickers, font menus or free-position layers.
4. **Hierarchy.** One dominant element (headline or score) in Bebas, accent colour; supporting facts in a ruled info row; the club name and competition small at the top; site address bottom-left; sponsor mark bottom-right when present.
5. **Photography.** Default to approved ground photography (Tithe Farm goalmouth). Player photos use their recorded `subject` zone for focus. The hero-film still is `needs_review` (signage reads "Rayers Lane") — never default to it. The A4 programme cover starts without a photo: no library photo is large enough at 300 dpi.
6. **Render and LOOK.** Render every template × format (see rayners-asset-quality-control, step 2) and open the images. Reject: empty bottom thirds, text crossing faces, competition text unreadable on sky, a second focal point competing with the headline, all-caps body copy, decorative tilts.
7. **Hand to QC.** Run `node --test tests/studio-asset-core.test.js` and the Studio journeys.

## Dependencies
rayners-asset-compositor (geometry/layers), rayners-asset-quality-control (checks and file validation), lane-design-system (tokens), impeccable (critique language).

## Expected outputs
- Updated template/archetype in `js/studio/core.js` with formats listed explicitly.
- Contact sheet of every format reviewed by eye, with notes of what changed.
- Passing core tests; no new blocking QC on the sample data.

## Failure conditions
- Any template whose formats include a layout that is a scaled copy of another.
- Text below 18 px at 1080 scale, or a headline that wraps to 4+ lines at default copy.
- A logo or crest placed with anything but `contain`.
- Any invented image, sponsor, quote or price — stop and remove it.

## Test requirements
- `tests/studio-asset-core.test.js`: "every template composes", "a story is RECOMPOSED", "CRESTS AND LOGOS CANNOT BE DISTORTED".
- `quality/tests/studio.spec.js` Scenario C exports and the PNGs in `$TMPDIR/rlfc-studio-exports` opened and looked at.
