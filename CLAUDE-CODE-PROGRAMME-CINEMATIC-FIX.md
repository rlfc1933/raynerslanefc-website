# Claude Code Brief — Fix the "empty white pages" + make the programme cinematic

Repo: `rlfc1933/raynerslanefc-website` (static HTML, no build step, vanilla JS). Target file: **`programme-print.html`** (the A4 programme). You have GitHub + deploy context. **This is a focused visual fix — do not restructure the data or the admin builder. Keep every existing page and all crests/sponsors.**

## The problem (diagnosed — fix the cause, not the symptom)
Every page is a fixed A4 sheet — `.page { width:210mm; min-height:297mm; background:#fff; padding:15mm 14mm 18mm }` — and content is **top-aligned**, so short pages (chairman's welcome, manager's notes, etc.) fill only the **top quarter** and leave a big blank white void below. It looks unfinished and flat. The pages are also plain white with a small text block — no cinematic feel.

## What "fixed" looks like
Premium, editorial, cinematic — think a Formula 1 / matchday magazine, not a Word document. **No page should have loose empty space, and no page should be a plain white sheet with text stuck at the top.** Every page's content fills its full height with intent, and the design carries the brand.

## Do this

### 1. Kill the trapped whitespace (layout)
- Make every `.page` a **flex column** (`display:flex; flex-direction:column`) so content distributes down the full 297mm — header/banner at top, body in the middle, a **branded footer strip pinned to the bottom** (crest + "RAYNERSLANEFC.CO.UK" + page number + sponsor). No more content floating at the top.
- For short-content pages, the middle area should **grow to fill** (`flex:1`) and center its content, or be padded out with design elements below (see 2) — never left blank.
- Keep `min-height:297mm` + page-break behaviour so it still prints as clean A4 pages. Content that genuinely overflows should break to a second page, not shrink illegibly.

### 2. Fill the space with cinematic design (not filler)
Give every page real visual weight using elements that fit the brand and the content:
- **Full-bleed edges:** let banners, imagery and colour blocks run to the page edge (negative-margin out of the 14mm padding) instead of sitting in a centered white column.
- **Cinematic hero zones:** cover, chairman, manager, opposition and match-centre pages get a large **photo or dark gradient hero band** (use uploaded photos if present; otherwise a tokened dark gradient + large faded crest watermark — the `.banner::after` crest-watermark pattern already exists, scale it up).
- **Big typographic moments:** oversized Bebas (`--fd`) pull-quotes, drop-caps on the lead paragraph, section numerals — turn a 3-line manager's note into a designed spread, not a paragraph on white.
- **Structured blocks to occupy space with value:** stat tiles, "did you know" cards, a form strip, a sponsor rail, a fixture teaser — the CSS for tiles/cards/form-strips already exists; deploy them to fill otherwise-empty lower halves.
- **Alternate light/dark pages** so it doesn't read as a stack of white sheets — some pages go full dark (tokened `--g`/`#0d0d0d` with a crest watermark), keeping ink-heavy pages balanced for print.

### 3. Cover + back cover go full cinematic
- Cover: full-bleed dark/hero background, both crests in a bold **VS lockup** (keep `img/badge.png` + opponent crest — do not remove), huge Bebas title, fixture/date/venue, subtle texture — a poster, not a header.
- Back cover: next-fixture teaser, countdown, sponsor, slogan — full-bleed, not a white page with a logo.

### 4. Media / image upload zones (fill the space with real photos, at full quality)
The empty space should ideally be filled with **club photography**, so build clear, staff-editable image slots that scale correctly and never look stretched or blurry.
- **Where images go (add an upload field in the admin programme builder for each):** cover hero (full-bleed background), chairman photo, manager photo, opposition/action shot, a match-centre venue/crowd photo, one photo per squad player (already supported — keep), a full-page "photo of the match" spread, and sponsor logos. If a slot has no image, fall back to the tokened dark-gradient + crest watermark — **never a broken/blank box.**
- **Scaling rule:** heroes and full-bleed photos use `object-fit:cover` (fills the zone, crops gracefully, never distorts); logos and crests use `object-fit:contain` (never cropped, never stretched). Give each slot a fixed aspect-ratio box so layout never jumps.
- **Quality — do NOT let uploads get soft:** for a print A4 page, images must be **high resolution** (aim ~300 DPI for the printed size — a full-page hero ≈ 2480×3508px, a half-page ≈ 2480×1754px). Do **not** downscale or re-compress hero/photo uploads the way small logo uploads may be; store/serve them at full resolution. Keep aspect ratio; use `image-rendering` sensibly. If an uploaded photo is too low-res for its slot, surface a gentle "this image may look soft in print" warning rather than silently blurring it.
- **What's important:** focal point — let staff nudge the crop focus (object-position) so faces/action aren't cut off; consistent treatment (a subtle dark gradient over photos where text sits, so captions stay readable); and lazy, ordered loading so the page stays fast.

## Hard rules
- **Keep every existing page, all crests (`img/badge.png` + `img/crests/`), and every sponsor placement.** This is a redesign of the *look*, not the content.
- **Brand tokens only** — Bebas Neue / Barlow / Barlow Condensed, `--y`/`--g`/`--ink` etc. No new fonts, no off-palette colours.
- **Must still print correctly as A4** (page breaks intact, nothing clipped, readable at print size). Test the print preview.
- Vanilla CSS/JS only, no build step. Atomic commits (e.g. one per page type). Don't touch the data contract or the admin programme builder.

## Acceptance
1. Open the programme: **no page has a blank lower half** — every page's content fills its height with a pinned branded footer.
2. It reads **cinematic and premium** — full-bleed heroes, big type, dark/light rhythm — not white sheets with top-stuck text.
3. Cover and back cover are full-bleed poster-style with both crests intact.
4. It still prints as clean A4 pages, on-brand, with all sponsors and crests present.
