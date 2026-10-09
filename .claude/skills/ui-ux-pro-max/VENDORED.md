# ui-ux-pro-max — vendored copy

- Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill @ dcc40ff (2026-09-21), MIT (LICENSE here).
- Only the `ui-ux-pro-max` skill is vendored (searchable UX rules, styles, palettes, typography,
  motion and chart guidance; Python 3 standard library, local CSVs, no network).
  NOT vendored: `design` (logo/CIP/icon generation via Gemini/AtlasCloud/MuAPI keys), `ui-styling`
  (shadcn/Tailwind), `slides`, `banner-design`, `brand`, `design-system` (remote image fetch) —
  paid APIs or a stack this site doesn't use. Its `scripts/tests` were dropped.
- **Run it from the repo root** (the upstream SKILL.md assumes a plugin root):
  `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain ux|style|typography|color|motion|landing -n 5`
- **Precedence:** it is a reference library, not the brief. Where its suggestions conflict with
  DESIGN.md (e.g. it suggests neon glow and #000 for "dark OLED"), DESIGN.md wins — the slop gate
  will flag glow/gradient text regardless.
