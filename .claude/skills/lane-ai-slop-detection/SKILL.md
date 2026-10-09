---
name: lane-ai-slop-detection
description: Detect generic AI-generated design and copy ("AI slop") and design-system drift on the rendered Rayners Lane FC site — gradient text, glows, side-tab borders, bounce easing, generic copy, em-dash saturation, off-token colours/radii/fonts. Use after any AI-assisted UI or copy change and before deploys.
---

# Lane AI-slop detection

## Run
`cd quality && npm run slop` (desktop + phone).

Two detectors on the rendered DOM, ratcheted (existing findings baselined, new fail):
1. **impeccable detector** (vendored, pinned, local-only) — ~60 deterministic
   generated-UI tells: gradient text, glow halos, side-tab borders, nested cards,
   bounce easing, undersized UI text, low contrast, generic grid backgrounds, em-dash
   saturation, aphoristic cadence…
2. **Lane drift** — computed colours not in the palette, radii off the `--r-*`
   scale, fonts other than Bebas Neue/Manrope.

## Beyond the detector (judgement — do this too)
Read the changed page as a supporter would and check DESIGN.md §7 bans plus:
- Copy that could describe any club ("Elevate your matchday experience") → make it
  specific to Rayners Lane, in the club's dry voice, and **never invent facts**.
- Symmetric centred sections with an eyebrow, big title, three cards — repeated.
- Decorative motion with no meaning (see lane-motion-direction).
- Stock-looking or AI-generated imagery.
For a structured critique use vendored `impeccable` → `critique`, then `distill`/`quieter`.

## When a finding is wrong
If the pattern is an approved, deliberate part of the identity, leave it baselined
and note why in DESIGN.md. Don't loosen the detector to make new slop pass.
