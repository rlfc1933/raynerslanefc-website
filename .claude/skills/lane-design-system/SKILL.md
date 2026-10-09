---
name: lane-design-system
description: Rayners Lane FC design-system workflow. Use before ANY visual change to the site (new section, component, page, restyle, colour, type, spacing, radius) to keep it on-token and cohesive, and when asked to extend or document the design system.
---

# Lane design system

The system already exists and is approved. Your job is to stay inside it, or to
extend it deliberately — never to drift.

## Before touching UI
1. Read `DESIGN.md` and `PRODUCT.md` (repo root). They are the brief.
2. Find the tokens you need in `css/fonts.css` (type, radii, controls, motion) and
   `css/style.css :root` (colour). Use `var(--token)`; never a raw hex, px radius,
   duration or font name in new CSS.
3. Find an existing pattern first: `grep -rn "class=\"<thing>" *.html js/components.js`.
   Reuse `.btn`, `.t-*` utilities, card/panel patterns before inventing.
4. Decide the mode (DESIGN.md §1): public page = Persuade/Read, Staff HQ = Operate.

## Making the change
- Refinement preserves (identity, copy, behaviour). A redesign of an approved
  interface needs a written justification tied to a measured problem (a failing
  gate, a journey that breaks, analytics) — put it in the commit message.
- For craft depth use the vendored `impeccable` skill: `typeset`, `layout`,
  `colorize`, `polish`, `adapt`, `harden`, `critique`. It reads DESIGN.md/PRODUCT.md
  (fallback mode, see impeccable/VENDORED.md). Read `impeccable/reference/craft-floor.md` before editing.
- A genuinely new token: add it to the owning file with a comment saying what it
  means and why the existing ones could not do the job; add it to DESIGN.md and to
  the palette/radii lists in `quality/tests/slop.spec.js` in the same commit.

## Prove it
`cd quality && npx playwright test slop visual responsive --grep <page>` — the
slop gate flags off-palette colour, off-scale radius and foreign fonts on the
rendered page; visual shows exactly what moved. Then `lane-release-quality`.
