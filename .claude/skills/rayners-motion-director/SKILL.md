---
name: rayners-motion-director
description: Decides purposeful motion for Rayners Lane — functional feedback in Lane HQ (Motion mini settle), restrained storytelling on the public site (GSAP in js/lane-motion.js), and the reduced-motion alternative for every animation. Use whenever adding or reviewing an animation, transition, hover/press effect or panel movement in HQ or Studio.
---

# Rayners motion director

## Purpose
Motion answers "what just happened?" — a job moved to done, a record saved, a
panel opened, an update arrived. If it cannot answer that, it is removed.

## Trigger conditions
- New `transition`, `@keyframes`, `animate(`, GSAP call, or `settle(` usage.
- A change in how HQ confirms a save, opens a detail, or shows a new notification.

## Inputs
- `DESIGN.md` §5 (tokens and meaning catalogue), `css/fonts.css` motion tokens,
  `js/vendor/motion-mini-13.4.3.mjs`, `js/lane-motion.js` (public, do not edit
  from HQ work), `lane-motion-direction` skill.

## HQ rules
| Moment | Motion | Reduced motion |
|---|---|---|
| A record/row changed (task done, owner assigned) | `settle(el)`: opacity .4→1 + translateY 4px→0, 220ms, ease-out, once | none (instant) |
| Priority group expands | `settle(detail)` on the revealed detail only | none |
| Chevron/disclosure | rotate via `--dur-fast` + `--ease-standard` | transition: none |
| Hover/press | colour/border only, `--dur-fast` | colour only |
| Update bar / notifications | appear instantly; no slide, no pulse, no badge bounce | same |
Never: page entrances, staggered dashboards, looping glows, attention-seeking badges.

## Steps
1. State the meaning in one line. If none, delete the animation.
2. Use tokens (`--dur-*`, `--ease-*`) or `settle()` in `js/hq-shell.js`; never a
   new library. One system per element.
3. Guard: `(prefers-reduced-motion: reduce)` OR `html.a11y-reduce-motion` → no motion.
4. Animate transform/opacity only.

## Dependencies
`lane-motion-direction`, `rayners-design-system-guardian`.

## Expected outputs
Motion that runs only on a state change, ≤ 420ms, with a reduced-motion path.

## Failure conditions
Anything moving on load in HQ; infinite animation other than the public LIVE dot;
layout-property animation; motion under reduced motion.

## Test requirements
`npx playwright test motion -g admin`; spot-check with
`page.emulateMedia({ reducedMotion: 'reduce' })` that `settle()` is skipped.
