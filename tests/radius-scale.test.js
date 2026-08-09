// ════════════════════════════════════════════════════════════════════════════
// SEVENTEEN CORNER RADII IS NOT A STYLE, IT IS THE ABSENCE OF ONE.
//
// Counted across the stylesheets, the site rounded corners at 2, 3, 4, 5, 6, 7,
// 8, 9, 10, 12, 14, 16 and 20px, plus pills and circles. Nothing agreed with
// anything else, so nothing read as deliberate — a 9px card next to an 8px card
// next to a 10px one is just noise, and noise is what "AI-generated" looks like.
//
// There is now one scale: xs / sm / md / lg / xl, plus two shapes that are not
// sizes at all (pill, circle). The steps are far enough apart to carry meaning —
// a chip is not a button, a button is not a card, a card is not a sheet.
//
// THESE TESTS DELIBERATELY DO NOT ASSERT PIXEL VALUES.
// Pinning "--r-md is 10px" would make every future design decision a failing
// test, which is how a design system turns into a cage. What is worth holding
// is the SYSTEM: the scale exists, it lives where every page can see it, the
// steps stay distinguishable, and no stylesheet quietly reintroduces a raw
// value alongside it. Tuning a step is free; adding an eighteenth is not.
//
// WHERE THE TOKENS LIVE IS ALSO LOAD-BEARING.
// Nine pages — the guides, the scanner, the print programme, the player
// manager — load css/fonts.css without css/style.css. A token defined only in
// style.css resolves to nothing there, and an invalid border-radius computes to
// 0, so every pill would have squared off on exactly the pages nobody re-checks.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CSS_DIR = path.join(ROOT, 'css');
const SHEETS = fs.readdirSync(CSS_DIR).filter((f) => f.endsWith('.css'));
const FONTS = read('css/fonts.css');

const TOKENS = ['--r-xs', '--r-sm', '--r-md', '--r-lg', '--r-xl', '--r-pill', '--r-circle'];

/** Declared value of a token, e.g. "--r-md" -> "10px". */
const valueOf = (t) => {
  const m = FONTS.match(new RegExp('\\' + t + ':\\s*([^;]+);'));
  return m ? m[1].trim() : null;
};

// ── 1 · THE SCALE EXISTS, WHERE EVERYTHING CAN SEE IT ───────────────────────

test('every step of the scale is declared', () => {
  TOKENS.forEach((t) => assert.ok(valueOf(t), t + ' must be declared'));
});

test('the scale lives in the file every page loads', () => {
  const htmls = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
  const usesCss = htmls.filter((f) => /href="css\/[a-z-]+\.css"/.test(read(f)));
  const noStyle = usesCss.filter((f) => !read(f).includes('css/style.css'));

  assert.ok(noStyle.length > 0,
    'if this ever reaches zero the constraint is gone and this test is stale');
  noStyle.forEach((f) => assert.ok(read(f).includes('css/fonts.css'),
    f + ' loads no stylesheet that defines the radius tokens — its pills square off'));

  // And the definition is not in the file those pages skip.
  assert.ok(!/--r-(xs|sm|md|lg|xl|pill|circle):/.test(read('css/style.css')),
    'defining the scale in style.css strands the pages that never load it');
});

// ── 2 · THE STEPS STILL MEAN SOMETHING ──────────────────────────────────────

test('the five size steps ascend, with no duplicates', () => {
  const px = ['--r-xs', '--r-sm', '--r-md', '--r-lg', '--r-xl'].map((t) => {
    const v = valueOf(t);
    assert.match(v, /^\d+px$/, t + ' should be a plain px step');
    return parseInt(v, 10);
  });
  const sorted = px.slice().sort((a, b) => a - b);
  assert.deepStrictEqual(px, sorted, 'xs…xl must ascend');
  assert.strictEqual(new Set(px).size, px.length, 'two steps with the same value is one step');
});

test('adjacent steps are far enough apart to be seen', () => {
  // The original problem was 8 vs 9 vs 10px — a distinction no one can perceive
  // but every stylesheet had an opinion about.
  const px = ['--r-xs', '--r-sm', '--r-md', '--r-lg', '--r-xl'].map((t) => parseInt(valueOf(t), 10));
  for (let i = 1; i < px.length; i++) {
    assert.ok(px[i] - px[i - 1] >= 2,
      `steps ${px[i - 1]}px and ${px[i]}px are indistinguishable — that is how you get seventeen`);
  }
});

test('pill and circle are shapes, not steps', () => {
  assert.match(valueOf('--r-pill'), /^\d{3,}px$/, 'a pill must be effectively unbounded');
  assert.strictEqual(valueOf('--r-circle'), '50%');
});

// ── 3 · NOTHING GOES ROUND THE SIDE ─────────────────────────────────────────

test('no stylesheet sets a raw corner radius', () => {
  const offenders = [];
  SHEETS.forEach((f) => {
    const src = read('css/' + f).replace(/\/\*[\s\S]*?\*\//g, ' ');
    const re = /border-radius:\s*([^;}\n]+)/g;
    let m;
    while ((m = re.exec(src))) {
      const parts = m[1].trim().split(/\s+/);
      if (!parts.every((p) => p.startsWith('var(--r-') || p === '0')) {
        offenders.push(f + ': ' + m[1].trim());
      }
    }
  });
  assert.deepStrictEqual(offenders, [],
    'every corner comes from the scale, or the scale is not one');
});

test('the scale is actually used, not merely declared', () => {
  const all = SHEETS.map((f) => read('css/' + f)).join('\n');
  ['--r-xs', '--r-sm', '--r-md', '--r-lg', '--r-pill', '--r-circle'].forEach((t) => {
    assert.ok(all.includes('var(' + t + ')'), t + ' is declared but never used');
  });
});

// ── 4 · WHY, RECORDED ───────────────────────────────────────────────────────

test('the next person to add a value is told why not to', () => {
  const block = FONTS.slice(FONTS.indexOf('CORNER RADII'), FONTS.indexOf('--r-xs'));
  assert.match(block, /seventeen/i, 'the count is the argument');
  assert.match(block, /style\.css/,
    'and the nine pages that never load style.css are why the tokens live here');
});
