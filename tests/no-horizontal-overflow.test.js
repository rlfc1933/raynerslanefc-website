// ════════════════════════════════════════════════════════════════════════════
// A PAGE THAT SCROLLS SIDEWAYS ON A PHONE IS A BROKEN PAGE.
//
// `overflow-x:hidden` was deliberately removed from <body> a while back, on the
// grounds that hiding overflow is not fixing it — "if anything overflows again
// it will be visible, which is the point". Measuring all 25 public routes at
// 390px, three of them did:
//
//     /about.html   253px   two inline grids on fixed 340px columns, plus a
//                           `1fr 1fr` pair that cannot shrink below min-content
//     /media.html    59px   a hard `1fr 1fr 1fr` social row
//     /shop.html     34px   a 28px Bebas email address set to white-space:nowrap
//
// None was caused by Batch 2 — about.html is byte-identical to 656ad47 in the
// relevant places. They were simply now visible, which is the removal of
// overflow-x:hidden doing its job.
//
// WHAT THESE TESTS GUARD.
// Not pixel widths — a Node test cannot lay out a page, and a screenshot test
// here would be brittle. They guard the two authoring patterns that caused it,
// both of which are invisible on a laptop and guaranteed to overflow a phone:
//
//   A fixed px grid column wide enough to exceed a 390px screen, written inline
//   so no media query can ever collapse it.
//
//   nowrap on a long unbreakable string.
//
// The rendered widths themselves were verified in a browser at 390/430/768/
// 1000/1400 and are recorded in the Batch 2 report, not asserted here.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** Public pages only. admin/staff surfaces are desktop tools and out of scope. */
const PRIVATE = /^(admin|staff-|chairman-setup|playermanager|scan|guide|The-Lane-Portal|lane-app-prototype|fan-zone-guide|programme-print)/;
const PAGES = fs.readdirSync(ROOT)
  .filter((f) => f.endsWith('.html') && !PRIVATE.test(f));

/** The narrowest screen the club actually sees in analytics terms. */
const NARROW = 390;

// ── 1 · NO UNCOLLAPSIBLE GRID COLUMN ────────────────────────────────────────

test('no public page hard-codes a wide grid column INLINE', () => {
  // The distinction that matters is reachability, not the px value itself.
  // `.newsroom-layout{grid-template-columns:1fr 340px}` and `.player-hero`
  // both carry a 340/360px track and both are fine, because they are classes
  // with @media overrides that collapse them. The same declaration written in
  // a style="" attribute can never be overridden by a breakpoint, so it is
  // guaranteed to overflow a narrow screen. Only inline is an offence.
  const offenders = [];
  PAGES.forEach((f) => {
    const src = read(f);
    const re = /style="([^"]*grid-template-columns[^"]*)"/g;
    let m;
    while ((m = re.exec(src))) {
      const decl = (m[1].match(/grid-template-columns:\s*([^;"]+)/) || [])[1] || '';
      if (/minmax|auto-fit|auto-fill/.test(decl)) continue;
      const widest = (decl.match(/(\d+)px/g) || [])
        .map((p) => parseInt(p, 10)).sort((a, b) => b - a)[0];
      if (widest && widest >= NARROW - 60) {
        offenders.push(`${f}: inline ${decl.trim()} (${widest}px track)`);
      }
    }
  });
  assert.deepStrictEqual(offenders, [],
    'an inline fixed track cannot be collapsed by any breakpoint');
});

test('class-based fixed tracks are collapsed by a breakpoint', () => {
  // The legitimate pattern, held so it stays legitimate.
  [['news.html', '.newsroom-layout'], ['player.html', '.player-hero']].forEach(([file, sel]) => {
    const src = read(file);
    const esc = sel.replace('.', '\\.');
    assert.match(src, new RegExp(esc + '\\s*\\{[^}]*grid-template-columns:\\s*[^;}]*\\d{3}px'),
      file + ' should still define ' + sel + ' with its desktop track');
    assert.match(src, new RegExp('@media\\([^)]*max-width[^)]*\\)\\s*\\{[^{}]*' + esc + '\\s*\\{[^}]*grid-template-columns:\\s*1fr'),
      sel + ' has a fixed track and must have a breakpoint that stacks it');
  });
});

test('the about page splits are answered by a breakpoint, not by inline px', () => {
  // These carry a real design (a 340px portrait beside a text column), so they
  // keep their proportions on desktop and stack below 768 — which needs a class.
  const about = read('about.html');
  assert.match(about, /<div class="bio-split">/);
  assert.match(about, /<div class="bio-split bio-split--rev">/);
  assert.ok(!/grid-template-columns:340px 1fr/.test(about),
    'the inline fixed grid must be gone, not merely overridden');

  const css = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(css, /\.bio-split\{[^}]*grid-template-columns:340px 1fr/,
    'desktop proportions unchanged');
  assert.match(css, /@media\(max-width:768px\)\{\s*\.bio-split,\.bio-split--rev\{grid-template-columns:1fr\}/,
    'and they must actually stack');
});

// ── 2 · NOTHING UNBREAKABLE IS PINNED OPEN ──────────────────────────────────

test('no long string is held open with nowrap on a public page', () => {
  const offenders = [];
  PAGES.forEach((f) => {
    read(f).split('\n').forEach((line, i) => {
      if (!/white-space:\s*nowrap/.test(line)) return;
      // nowrap is fine on short labels; the danger is a long unbreakable token
      // such as an email address or URL rendered at display size.
      if (/@[a-z0-9.-]+\.[a-z]{2,}|https?:\/\//i.test(line)) {
        offenders.push(`${f}:${i + 1}`);
      }
    });
  });
  assert.deepStrictEqual(offenders, [],
    'an email address at display size with nowrap will push a phone sideways');
});

test('the shop address shrinks instead of pushing the page', () => {
  const shop = read('shop.html');
  assert.match(shop, /font-size:clamp\(19px,5\.2vw,28px\)/,
    'it should scale down on a narrow screen');
  assert.match(shop, /overflow-wrap:anywhere/,
    'and break if it still cannot fit');
});

// ── 3 · THE GUARD THAT MUST NOT COME BACK ───────────────────────────────────

test('overflow-x:hidden is not reintroduced on the page itself', () => {
  // Re-adding it would make all of the above invisible again rather than fixed.
  const css = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const onRoot = css.match(/(^|\})\s*(html|body|html,body|body,html)\s*\{[^}]*\}/g) || [];
  onRoot.forEach((rule) => {
    assert.ok(!/overflow-x:\s*hidden/.test(rule),
      'hiding overflow masks the defect instead of removing it: ' + rule.slice(0, 90));
  });
});
