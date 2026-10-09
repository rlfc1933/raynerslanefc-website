# Vendored animation libraries

Self-hosted and pinned: no CDN request, no surprise upgrade, works with the
service worker and offline. Two libraries, one job each (DESIGN.md §5):

| File | Library | Licence | Job | Loaded on |
|---|---|---|---|---|
| `gsap-3.15.0.min.js` + `ScrollTrigger-3.15.0.min.js` | GSAP 3.15.0 (gsap.com) | GSAP Standard "no charge" licence — https://gsap.com/standard-license | Coordinated, scroll-driven storytelling | `history.html` (timeline), `index.html` (partner board reveal) — via `js/lane-motion.js`, only when motion is allowed |
| `motion-mini-13.4.3.mjs` | Motion 13.4.3 (motion.dev), `animate` from `motion/mini` only (8 KB) | MIT | Component feedback: Staff HQ status changes, record moves | `admin.html` via `js/club-os.js` |

GSAP is never used for component micro-interactions and Motion is never used
for scroll storytelling, so the two never animate the same thing.

Rebuild Motion mini: `npm i motion@13.4.3 esbuild@0.25.10 && echo "export { animate } from 'motion/mini';" > e.mjs && npx esbuild e.mjs --bundle --minify --format=esm --outfile=motion-mini.mjs`
