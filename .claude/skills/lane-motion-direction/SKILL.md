---
name: lane-motion-direction
description: Motion direction for the Rayners Lane FC site. Use whenever adding or changing an animation, transition, hover/press effect, scroll reveal, live/score effect, menu or panel movement, or when reviewing motion quality and reduced-motion behaviour.
---

# Lane motion direction

Motion explains a change; it never decorates. Full rules: `DESIGN.md` §5.

## Decide whether it should move at all
Write one line: *"This moves to show ___."* Valid blanks: something arrived,
something left, a state changed, a score changed, something is live, where the
menu came from. If you can't fill it, don't animate.

## Build it
- Tokens only: `--dur-instant|fast|base|slow`, `--ease-out` (enter),
  `--ease-in` (exit), `--ease-standard` (state↔state). Ceiling 420ms for UI.
- Animate `transform`/`opacity` only. No bounce/elastic overshoot. Exits faster than entries.
- Infinite loops: only LIVE indicators. One-shot everything else.
- CSS transitions first; WAAPI (`el.animate()`) for sequenced or JS-driven moments.
  The only approved library is Motion `motion@13.4.3` (vendored ESM, MIT) and only
  when CSS/WAAPI genuinely can't (cross-browser scroll-linked, springs). GSAP is
  not used. Never add a second animation runtime.
- Reduced motion is automatic for token-based CSS (tokens collapse to 0 under
  `prefers-reduced-motion` and `html.a11y-reduce-motion`). For WAAPI/JS, check
  `matchMedia('(prefers-reduced-motion: reduce)').matches ||
  document.documentElement.classList.contains('a11y-reduce-motion')` and jump to the end state.
- For craft depth: vendored `impeccable` → `animate` (reference/animate.md).

## Prove it
`cd quality && npx playwright test motion --grep <page>` — fails if anything still
moves under reduced motion, if CLS ≥ 0.1 on tier-1 pages, and ratchets slow
(>700ms) motion, overshoot easing and new infinite loops. Watch it once by eye on a
phone-width viewport as well; the gate checks rules, not feel.
