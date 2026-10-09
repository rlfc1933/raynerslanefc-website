# impeccable — vendored copy

- Source: https://github.com/pbakaus/impeccable — tag `skill-v4.1.3` (commit c0f4952, 2026-09-01). Apache-2.0 (LICENSE here).
- Included: `SKILL.md`, `reference/` (all playbooks), `scripts/detect.mjs`,
  `scripts/detector/` (deterministic anti-pattern rules), `scripts/lib/impeccable-config.mjs`.
- **Deliberately NOT included:** `scripts/context.mjs` and the other ~40 scripts
  (live-browser injection, image generation, hooks, a local server). They are
  1.6 MB of code we have not reviewed, and some reach the network. Without them
  SKILL.md step 1 hits its documented fallback: say "Context loading did not run;
  I'll read the existing project context directly" and read `PRODUCT.md` and
  `DESIGN.md` at the repo root. That is the intended mode for this project.
- The detector only talks to localhost. The release gate injects
  `scripts/detector/detect-antipatterns-browser.js` into the rendered page
  (`quality/tests/slop.spec.js`); the static CLI (`node scripts/detect.mjs file.html`)
  works too but runs degraded (regex only) without htmlparser deps — prefer the gate.
- Live mode (`/impeccable live`) is unavailable by design.
- To upgrade: pick a tag ≥ 2 weeks old, re-copy exactly these paths, re-run
  `cd quality && npm run slop`, and review the new findings before re-baselining.
