# Rayners Lane FC — Brand System (single source of truth)

Every output — the website, the digital match programme, the **print edition**,
the live match centre and the admin — must use the same brand language. The
values live in **one place**:

- `brand/tokens.css` — CSS custom properties (the canonical file)
- `brand/tokens.json` — machine-readable mirror
- `css/style.css :root` — the live site's copy (kept in step with the above)

## Colours (locked)

| Token | Hex | Use |
| --- | --- | --- |
| yellow | `#FFD100` | primary / accent — "The Lane" yellow |
| yellow-dim | `#C9A200` | muted yellow |
| green | `#1A5C32` | secondary — club green |
| green-mid | `#236B3C` | muted green |
| black / dark / card / border | `#080808` / `#0E0E0E` / `#141414` / `#242424` | dark UI surfaces |
| text | `#F5F3ED` | primary text |
| text-dim / grey | `#AAAAAA` / `#777777` | secondary text |

**Do not introduce hex values outside this list for chrome/branding.**

### Sanctioned exceptions — match-event colours only

These represent real-world objects/outcomes, not brand chrome, and may appear
**only** on results, form and card graphics:

- win / success `#22C55E`, loss / danger `#EF4444`
- referee's yellow card `#FFCB05`, red card `#E5341F` (Post Studio card posts)

## Fonts (locked)

- Headings + big scores/stats: **Bebas Neue**
- Body copy: **Barlow**
- Labels / eyebrows / tables: **Barlow Condensed**

No other fonts. All three are loaded from Google Fonts site-wide and embed
automatically when a page is saved/printed to PDF.

## Print edition

`programme-print.html` is the print output. It is **A4**, uses the same brand
colours and fonts, and renders inside pages on white (`--rl-print-ink`) with
yellow/green accents for ink economy and readability. Export is via the
browser's **Save as PDF** (A4) — a printer-ready file. True PDF/X-4 + CMYK is a
commercial-litho concern; any print shop converts an A4 PDF on their end.

## The rule

Content is entered once in the admin; the site, the digital programme and the
print edition all render from that single source using these tokens. If a new
colour or font is ever "needed", add it here first — never inline in a page.
