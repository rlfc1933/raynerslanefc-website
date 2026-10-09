# Rayners Lane FC — Design System

The visual authority for raynerslanefc.co.uk. It records the **approved, shipped**
system; it is not a wish list. Tokens live in code — this file explains them and
says what may not be done. If this file and the CSS disagree, the CSS is the
truth and this file is the bug.

| Source of truth | Owns |
|---|---|
| `css/fonts.css` | type families, type scale, radii, control geometry, **motion tokens** (loaded by every page) |
| `css/style.css` `:root` | colour palette, `--nav-h` |
| `brand/tokens.css` / `tokens.json` | semantic colours (results, cards, print), spacing scale — for graphics & print |
| `css/a11y.css` | the accessibility panel: text size, contrast, reduce-motion switch |
| `css/edition.css` | the 2026/27 "Floodlit" edition layer, loaded last on every public page — browser surfaces, hero title card, broadcast panels, partner board, news front, page headers |

## 1 · Character

**Floodlit** (2026/27 edition). Matchday graphics under the lights — the
restraint of a Champions League broadcast, the tempo of a stream, the
certainty of a club that has been here since 1933. Black ground, one signal
yellow, a bottle-green heritage note, big condensed numbers, hairline
structure, real photography. The voice is dry and specific ("A DIVISION UP.
SO WHAT."). Premium here means **certain, consistent and fast** — not glossy.
Gen Z energy comes from tempo and type, never from glow or gradient text.

Signature moves: the hero is a title card (the headline arrives once, line by
line); Club Now is a broadcast panel; sponsors sit on a hairline board like a
partner wall; news is set as a sports desk front (one lead + running order);
headings stand alone — no kicker labels above them.

Mode by surface (impeccable vocabulary): public pages **Persuade/Read**; Match
Centre and fixtures **Read** with live status; Staff HQ (`admin.html`) **Operate**
— scanability beats expression there.

## 2 · Colour

Dark only. `--black #080808` ground, `--card #141414` / `--card2 #1A1A1A`
surfaces, `--border #242424` hairlines, `--white #F5F3ED` (warm, never pure white)
for text. **One** accent: `--yellow #FFD100` — calls to action, live state,
the score. `--green #1A5C32` is heritage, used sparingly (history, honours).
Secondary text `--grey #8F8F8F` (≥ 5.3:1 on every surface), `--muted #9A9A92`.
Semantic only where meaning demands it: win `#22C55E`, loss `#EF4444`, cards.

Never: a second accent hue, gradients on text, coloured glows, purple/blue
"tech" gradients, pure `#FFF` body text. Sponsor and opponent brand colours
appear only inside their own marks.

## 3 · Type

Two self-hosted families, no third.
- **Bebas Neue** — display only: hero, section titles, scores, names, big stats.
  `--fs-hero` 56–120px, `--fs-section` 40–64, `--fs-stat` 48–96, line-height `0.92`.
- **Manrope 400–800** — everything else. Body `--fs-body` 16–18px / 1.6;
  labels `.t-label` 13px, 700, uppercase, `0.14em`.
Utilities: `.t-hero .t-section .t-stat .t-card .t-sub .t-body .t-label .t-accent`.
Floor: no readable text under 12px; functional text ≥ 13px.

## 4 · Shape & space

Radii: `--r-xs 4` chips · `--r-sm 6` buttons/inputs · `--r-md 10` cards ·
`--r-lg 14` sheets/modals · `--r-xl 20` full-bleed · `--r-pill` · `--r-circle`.
Nothing in between. Spacing steps 4 / 8 / 16 / 32 / 64.
Controls share one geometry (`--ctl-*`): 44px minimum height (the tap floor),
13px/800 text, 6px radius, two sizes only.

## 5 · Motion direction

Motion explains a change; it never decorates. Every animation must answer
*"what just happened?"* — something arrived, something left, a state changed,
something is live. If it can't, delete it.

| Token | Value | Use |
|---|---|---|
| `--dur-instant` | 90ms | press feedback, toggles |
| `--dur-fast` | 160ms | hover, focus, small state changes |
| `--dur-base` | 240ms | menus, panels, tabs, cards entering |
| `--dur-slow` | 420ms | page-level reveal, score change — the UI ceiling |
| `--ease-out` | `cubic-bezier(.22,1,.36,1)` | arriving / expanding |
| `--ease-in` | `cubic-bezier(.4,0,1,1)` | leaving / collapsing (exits ~25% faster than entries) |
| `--ease-standard` | `cubic-bezier(.4,0,.2,1)` | moving between two states |

Meaning catalogue — the only reasons the site moves:
- **Live** — the LIVE pulse and score tick are the only infinite loops allowed.
- **Goal / result** — a score change may scale-punch once (≤ 420ms), never loop.
- **Navigation** — the menu sheet slides from the edge it lives on; the scrim fades.
- **Feedback** — press, save, error: ≤ 160ms, colour/opacity first.
- **Arrival** — content entering on scroll: one short opacity+8px rise, once, never staggered across a whole page.
- **Hero** — the WebGL hero is ambient by design and already skips under reduced motion (poster fallback).

Rules: animate `transform` and `opacity` only (no layout properties); no
bounce/elastic overshoot on UI; no scroll-jacking; nothing auto-plays sound.
`prefers-reduced-motion: reduce` **and** the a11y panel's reduce-motion switch
collapse the duration tokens to 0 — only colour/opacity cross-fades ≤ 200ms
survive. Enforced by `quality/tests/motion.spec.js`.

**Library policy — two libraries, one job each** (both vendored and pinned in `js/vendor/`, see its README):
- **CSS transitions + the duration/ease tokens** — the default for everything (hover, focus, press, menus, panels).
- **GSAP 3.15 + ScrollTrigger** — coordinated, scroll-driven *storytelling* only, loaded by `js/lane-motion.js` on pages
  that use it (history timeline progress; homepage partner board). Never downloaded under reduced motion.
- **Motion 13.4 (`animate` from motion/mini, 8 KB)** — component *feedback* in Staff HQ: the record you just changed
  settles into place so the eye finds it.
Never the same element animated by two systems; never a library on a page that gains nothing from it;
never a reveal that delays essential information (fixtures, scores, prices, forms are visible from first paint).
No React here, so GSAP React and React-specific performance skills do not apply.

## 6 · Imagery

Real club photography only — players, ground, crowd, committee. No stock, no
AI-generated people or scenes, no illustrated mascots. Player cut-outs follow
`docs/matchday-photography.md`. Every `<img>` has `alt` (empty when decorative),
`width`/`height` or `aspect-ratio`, `loading="lazy"` below the first screen, and
is served through `js/img.js` (Netlify Image CDN, AVIF/WebP, device width).
Source files ≥ 1× the largest drawn size at the device pixel ratio.

## 7 · Bans (enforced by the slop gate)

Gradient text · coloured glow shadows · side-tab accent borders on rounded
cards · glassmorphism · emoji as icons · bounce easing · fade-up on every
section · numbered 01/02/03 eyebrow markers · generic hero copy ("Elevate",
"Unlock", "Seamless") · cards nested in cards · fonts other than Bebas/Manrope ·
colours or radii outside the tokens above · em-dash saturation in body copy.

## 8 · Devices

Desktop 1440/1280, tablet portrait 768 / landscape 1180, phone 412 / 375,
foldable cover 344 and inner 884, touch and keyboard. No sideways scroll at any
width. Touch targets ≥ 44px (hard floor 24px, WCAG 2.2 2.5.8). Every
interaction works by keyboard with a visible focus ring.
