---
name: rayners-design-system-guardian
description: Enforces the shared Rayners Lane design language across the public site, Lane HQ and Asset Studio — tokens, type, colour roles, spacing, radii, components and interaction conventions. Use before writing or reviewing ANY CSS or markup for HQ (css/hq*.css, admin.html panels) or the public site, and whenever a new component is about to be invented.
---

# Rayners design-system guardian

## Purpose
One product family, three modes. Stop drift: off-palette colours, odd radii,
all-caps condensed labels everywhere, giant yellow buttons, card walls.

## Trigger conditions
- Any edit to `css/*.css`, a `<style>` block, inline `style=""`, or new markup classes.
- A new component (button, table, status label, panel, empty state) is proposed.
- `lane-ai-slop-detection` or `quality/tests/slop.spec.js` reports drift.

## Inputs
- `DESIGN.md` (authority), `css/fonts.css` (type, radii `--r-*`, controls `--ctl-*`,
  motion `--dur-*`/`--ease-*`), `css/style.css` `:root` (palette), `css/kl.css`
  (public vocabulary), `css/hq.css` (HQ vocabulary).
- Palette allowed by the slop gate: `quality/tests/slop.spec.js` `PALETTE`, `RADII`.

## The HQ vocabulary (css/hq.css) — reuse, don't reinvent
| Need | Use |
|---|---|
| Surfaces | `--hq-bg #080808`, `--hq-s1 #0E0E0E` (chrome), `--hq-s2 #141414` (one raised strip), `--hq-s3 #1A1A1A` (hover/neutral button) |
| Lines / text | `--hq-line #242424`; `--hq-text #F5F3ED`, `--hq-mute #AAAAAA`, `--hq-dim #8F8F8F` |
| Signal | `--hq-y #FFD100` = the ONE primary action per screen + "urgent" dot; `--hq-red` = critical only; `--hq-ok` = done/progress |
| Buttons | `.hq-btn` (neutral), `--primary` (yellow, one per screen), `--ghost`, `--sm`; `.hq-link` for tertiary |
| Records | `.hq-table` (stacks under 700px via `data-label`), `.hq-rows`/`.hq-row` (label · note · value) |
| Queues | `.hq-pri` grouped rows with `.hq-sev--critical|high|normal|low` + `.hq-dot` |
| Activity | `.hq-act` timeline |
| States | `.hq-empty` (honest empty), `.hq-muted`, `.hq-flag` (data conflict), `.hq-err` (failure, role=alert), `.hq-tag--ok` |
| Section | `.hq-sec` + `.hq-sec__h` (15px/800, hairline) — sections are NOT boxed cards |

## Rules
1. Type: Manrope for all HQ UI; Bebas only for public display moments. Sentence
   case. No `text-transform: uppercase` on HQ labels. Body ≥14px, meta ≥12px.
2. Colour only from the tokens above; yellow never decorates; red never for history.
3. Radii only `--r-xs|sm|md|lg|xl|pill|circle` (`tests/radius-scale.test.js`).
4. Controls ≥44px on touch (`@media (pointer:coarse)`), 36px allowed on fine pointers.
5. No side-tab accent borders on rounded boxes, no glow, no gradient text, no glassmorphism.
6. Cards only when the layout benefits (the next-match strip is the one raised
   surface on the Command Centre). Lists and tables otherwise.
7. Focus: 2px yellow outline, offset 2px, on every interactive element.

## Steps
1. Search `css/hq.css` / `css/kl.css` for an existing class before writing CSS.
2. Write with tokens; run `node --test tests/radius-scale.test.js tests/button-system.test.js`.
3. Render and screenshot (360/390/768/1024/1440) and hand to `rayners-visual-critic`.

## Dependencies
`lane-design-system`, `impeccable`, `rayners-visual-critic`.

## Expected outputs
Diff that only uses tokens/classes above; any genuinely new component added to
`css/hq.css` with a comment saying when to use it.

## Failure conditions
Raw hex outside the palette; raw radius; a second primary button on a screen;
uppercase condensed labels; a new card grid; text <12px; touch target <44px on phones.

## Test requirements
`npm test` (radius/button/layout invariants), `npx playwright test slop -g admin`,
`npx playwright test responsive -g admin`.
