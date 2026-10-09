# Quality system — design, motion, UX and release gates

How raynerslanefc.co.uk is kept bespoke, cohesive and working on every device.
Everything here audits the **rendered** site in a real browser, not just source.

## Skills (`.claude/skills/`)

| Skill | Source (pinned) | Responsibility |
|---|---|---|
| `lane-design-system` | this repo | Stay on-token; extend the system deliberately; DESIGN.md / PRODUCT.md are the brief |
| `lane-motion-direction` | this repo | Meaningful motion only; tokens; reduced-motion; library policy (Motion only if needed, no GSAP) |
| `lane-responsive-audit` | this repo | 9 device classes incl. foldables and landscape phone, touch + keyboard |
| `lane-visual-regression` | this repo | Golden screenshots of tier-1 pages on desktop/tablet/phone |
| `lane-journey-audit` | this repo | End-to-end journeys by touch and keyboard; Clarity-informed |
| `lane-image-quality` | this repo | Resolution vs DPR, bytes, alt, dimensions, lazy-loading |
| `lane-ai-slop-detection` | this repo | Generated-UI tells + design-system drift |
| `lane-release-quality` | this repo | The go/no-go gate before any push to `main` |
| `lane-behaviour-first` | this repo (club addendum) | Real people, full journeys, failure and hand-off — before any feature is called done |
| `impeccable` | pbakaus/impeccable `skill-v4.1.3` (c0f4952), Apache-2.0 | Craft playbooks (audit, critique, polish, typeset, layout, animate, adapt, harden…) + the deterministic slop detector. Runs in context-fallback mode; network/live scripts not vendored (see its VENDORED.md) |
| `web-design-guidelines` | vercel-labs/agent-skills (063bee9) + web-interface-guidelines `e3d624b`, MIT | Fast source lint, `file:line`; rules pinned offline instead of fetched live |
| `shipping-and-launch` | addyosmani/agent-skills (5aec0d0), MIT | Pre-launch checklist, rollback |
| `code-review-and-quality` | addyosmani/agent-skills (5aec0d0), MIT | Diff review standard |
| `frontend-design` | anthropics/skills (41bbe19), Apache-2.0 | Art direction for NEW surfaces (type, layout, motion, named AI tells) |
| `ui-ux-pro-max` | nextlevelbuilder/ui-ux-pro-max-skill (dcc40ff), MIT | Searchable UX rules / styles / type / motion reference (Python stdlib, offline). Reference only — DESIGN.md wins on conflict |

### Considered and not installed

| Source | Why not |
|---|---|
| GSAP React, Vercel react-best-practices / composition | The site has no React. |
| mattpocock/skills, ponytail, matt-riley/agent-skills | Duplicate code-review/TDD skills above; matt-riley is GPL-3.0. |
| jaccas/understand-anything | Stale fork (Apr 2026) of a pnpm/TypeScript plugin; install the upstream on demand: `/plugin marketplace add Lum1104/Understand-Anything`. The architecture map for this site is docs/CLUB-OS.md + the capability matrix. |
| tt-a1i/archify | Diagram generator with npm deps; install per machine on demand: `npx skills add tt-a1i/archify -g`. Not needed at runtime. |
| charliehuge/Granted | GPL-3.0 and US-nonprofit model (EIN/501c3). Replaced by the UK grants pipeline in Club OS. |
| Anthropic document skills (docx/pdf/pptx/xlsx) | Source-available, not redistributable in a public repo: `/plugin install document-skills@anthropic-agent-skills` per machine. |
| Refero | Paid account; MCP `https://api.refero.design/mcp` once subscribed. |
| Chrome DevTools MCP (addy browser-testing) | Redundant with the Playwright gates. |

## Tooling (`quality/`, separate package so nothing reaches Netlify functions)

| Tool | Version | Used for |
|---|---|---|
| `@playwright/test` | 1.63.0 | Rendered gates, device matrix, screenshots, traces |
| `@axe-core/playwright` | 4.13.0 | WCAG 2.0/2.1/2.2 A+AA scans |
| `lighthouse` | 13.5.0 | A11y / best-practices / SEO budgets; performance on Netlify URLs |
| `server.js` | — (no deps) | Local Netlify stand-in: pretty URLs, Image-CDN passthrough, stubbed functions |
| `tests/support/fake-supabase.js` | — (no deps) | In-memory Supabase REST so HQ journeys run the REAL functions with isolated data |

Runtime libraries (vendored in `js/vendor/`, see its README): **GSAP 3.15 + ScrollTrigger** (scroll storytelling, two pages,
never under reduced motion) and **Motion 13.4 mini** (8 KB, Staff HQ status feedback).

Microsoft Clarity: wired into `js/consent.js`, **off** until `CLARITY_ID` is set
(and policies.html updated). Consent-gated like GA; never on Staff HQ.

## Gates

| Gate | Command (`cd quality`) | Fails on |
|---|---|---|
| Unit/contract | `npm run gate` step 1 | any failure not in `known-failures.json` |
| Responsive | `npm run test:responsive` | JS errors, 404s; NEW sideways scroll, overflow, < 24px touch targets, < 12px text |
| Accessibility | `npm run test:a11y` | NEW axe violations; keyboard: no visible focus, skip link broken |
| Visual | `npm run test:visual` | > 0.2% pixel diff vs goldens |
| Journeys | `npm run test:journeys` | any broken public journey |
| Staff HQ journeys | `npx playwright test hq` | any broken HQ journey (real functions, in-memory DB): enquiry→owner, deal→fulfilment→invoice, outreach permission/suppression, rewards once, starting records |
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
