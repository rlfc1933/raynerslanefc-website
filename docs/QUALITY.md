# Quality system — design, motion, UX and release gates

How raynerslanefc.co.uk is kept bespoke, cohesive and working on every device.
Everything here audits the **rendered** site in a real browser, not just source.

## Skills (`.claude/skills/`)

| Skill | Source (pinned) | Responsibility |
|---|---|---|
| `lane-design-system` | this repo | Stay on-token; extend the system deliberately; DESIGN.md / PRODUCT.md are the brief |
| `lane-motion-direction` | this repo | Meaningful motion only; tokens; reduced-motion; library policy (Motion only if needed, no GSAP) |
| `lane-responsive-audit` | this repo | 8 device classes incl. foldables, touch + keyboard |
| `lane-visual-regression` | this repo | Golden screenshots of tier-1 pages on desktop/tablet/phone |
| `lane-journey-audit` | this repo | End-to-end journeys by touch and keyboard; Clarity-informed |
| `lane-image-quality` | this repo | Resolution vs DPR, bytes, alt, dimensions, lazy-loading |
| `lane-ai-slop-detection` | this repo | Generated-UI tells + design-system drift |
| `lane-release-quality` | this repo | The go/no-go gate before any push to `main` |
| `impeccable` | pbakaus/impeccable `skill-v4.1.3` (c0f4952), Apache-2.0 | Craft playbooks (audit, critique, polish, typeset, layout, animate, adapt, harden…) + the deterministic slop detector. Runs in context-fallback mode; network/live scripts not vendored (see its VENDORED.md) |
| `web-design-guidelines` | vercel-labs/agent-skills (063bee9) + web-interface-guidelines `e3d624b`, MIT | Fast source lint, `file:line`; rules pinned offline instead of fetched live |
| `shipping-and-launch` | addyosmani/agent-skills (5aec0d0), MIT | Pre-launch checklist, rollback |
| `code-review-and-quality` | addyosmani/agent-skills (5aec0d0), MIT | Diff review standard |

## Tooling (`quality/`, separate package so nothing reaches Netlify functions)

| Tool | Version | Used for |
|---|---|---|
| `@playwright/test` | 1.63.0 | Rendered gates, device matrix, screenshots, traces |
| `@axe-core/playwright` | 4.13.0 | WCAG 2.0/2.1/2.2 A+AA scans |
| `lighthouse` | 13.5.0 | A11y / best-practices / SEO budgets; performance on Netlify URLs |
| `server.js` | — (no deps) | Local Netlify stand-in: pretty URLs, Image-CDN passthrough, stubbed functions |

Microsoft Clarity: wired into `js/consent.js`, **off** until `CLARITY_ID` is set
(and policies.html updated). Consent-gated like GA; never on Staff HQ.

## Gates

| Gate | Command (`cd quality`) | Fails on |
|---|---|---|
| Unit/contract | `npm run gate` step 1 | any failure not in `known-failures.json` |
| Responsive | `npm run test:responsive` | JS errors, 404s; NEW sideways scroll, overflow, < 24px touch targets, < 12px text |
| Accessibility | `npm run test:a11y` | NEW axe violations; keyboard: no visible focus, skip link broken |
| Visual | `npm run test:visual` | > 0.2% pixel diff vs goldens |
| Journeys | `npm run test:journeys` | any broken journey |
| Motion | `npm run test:motion` | anything moving under reduced motion; CLS ≥ 0.1 (tier 1); NEW slow/overshoot/infinite motion |
| Images | `npm run test:images` | broken / no alt; NEW soft, heavy, oversized, unsized, distorted, eager-offscreen |
| AI-slop + drift | `npm run slop` | NEW impeccable findings, off-palette colours, off-scale radii, foreign fonts |
| Lighthouse | `npm run lighthouse` | a11y < 95, best-practices < 90, SEO < 95, perf < 80 (remote) |
| **Release** | **`npm run gate`** | **any of the above** |

"NEW" = the ratchet: issues present when the gate was introduced are recorded in
`quality/baselines/` and reported as debt; the build fails only when something
gets worse. Fix debt, then re-baseline to lock the improvement in.

## First run

```
cd quality
npm ci
npx playwright install chromium        # once per machine
npm run gate
```
