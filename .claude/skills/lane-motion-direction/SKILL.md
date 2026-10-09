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
- CSS transitions first. Then exactly one of:
  - **GSAP + ScrollTrigger** (`js/vendor/gsap-3.15.0.min.js`) for scroll-driven
    storytelling — add the moment to `js/lane-motion.js`, which only loads GSAP on
    pages that use it and never under reduced motion;
  - **Motion mini** (`js/vendor/motion-mini-13.4.3.mjs`, `animate`) for component
    feedback (Staff HQ: see `settle()` in `js/club-os.js`).
  Never both on one element; never a third library; never hide content until a
  script runs (start from the visible state).
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
