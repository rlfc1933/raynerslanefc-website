---
name: lane-image-quality
description: Image-quality audit for the Rayners Lane FC site on the rendered page at real device pixel ratios — soft/under-resolved images, oversized or heavy files, missing alt, missing dimensions (layout shift), distortion, eager off-screen loading. Use when adding or replacing photos, player cut-outs, sponsor logos or galleries.
---

# Lane image quality

## Run
`cd quality && npm run test:images` (desktop-1440 + phone at DPR 2.6).

Hard failures: broken images; `<img>` with no `alt` attribute.
Ratcheted: under-resolved (< 1× drawn size × DPR → soft), oversized (> 3×, > 800px),
heavy (> 350 KB), no width/height/aspect-ratio, distorted, eager below the fold.
Locally the Netlify Image CDN is bypassed, so the SOURCE file is judged — stricter
than production on bytes, identical on resolution.

## Fixing
- Use real club photography (DESIGN.md §6); never stock or AI-generated people.
- Supply a source ≥ the largest drawn width × 2 (≈ 2400px for full-bleed heroes);
  let `js/img.js` + the Image CDN serve AVIF/WebP at device width.
- Always set `width`/`height` (or CSS `aspect-ratio`) and `alt`; `alt=""` only if decorative.
- `loading="lazy"` + `decoding="async"` below the first screen; the hero image eager with `fetchpriority="high"`.
- Player cut-outs: follow `docs/matchday-photography.md`.
Re-baseline after deliberate fixes: `QUALITY_UPDATE_BASELINES=1 npx playwright test images`.
