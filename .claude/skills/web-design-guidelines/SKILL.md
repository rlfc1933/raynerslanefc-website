---
name: web-design-guidelines
description: Fast source-level UI lint (file:line findings) against Vercel's Web Interface Guidelines — accessibility, focus, forms, animation, typography, touch. Use for a quick review of changed HTML/CSS/JS before the rendered gates.
license: MIT (vercel-labs/agent-skills; rules from vercel-labs/web-interface-guidelines)
---

# Web Interface Guidelines (pinned, offline)

Vendored from `vercel-labs/agent-skills` (skills/web-design-guidelines @ 063bee9).
The upstream skill WebFetches the rules from an unpinned `main` branch on every run;
here they are pinned at `vercel-labs/web-interface-guidelines@e3d624b` (2026-08-17)
in `guidelines.md` beside this file. Do not fetch the remote copy.

## How to run
1. Read `guidelines.md` (this folder).
2. Read the files the user named — or, by default, the files changed on the branch (`git diff --name-only origin/main -- '*.html' 'css/*' 'js/*'`).
3. Apply every rule; output terse `file:line — rule — fix` findings, grouped by file.

## Lane-specific notes
- React/Next-only rules (`<Link>`, `onClick` handlers, hydration) translate to
  their vanilla equivalents: real `<a href>` / `<button>`, `addEventListener`.
- This is a source lint. It does not replace the rendered gates in `quality/`
  (axe, keyboard, responsive) — run `lane-release-quality` before shipping.
