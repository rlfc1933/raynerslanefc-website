// ════════════════════════════════════════════════════════════════════════════
// SIX BUTTON GEOMETRIES FOR THREE JOBS.
//
// The public site had grown six independent button families — .btn, .cn__btn,
// .fz-btn, .cal-btn, .nav__ticket and .nav__install — and between them they
// used four corner radii, four letter-spacings, three border widths and two
// font weights:
//
//     .btn          13px/800  .05em  14/28  6px   2px
//     .cn__btn      12px/800  .06em  11/14  10px  1px
//     .fz-btn       13px/800  .08em  13     10px  none
//     .cal-btn      13px/700  .10em  12/20  4px   2px
//     .nav__install 12px/800  .06em  9/15   6px   1px
//
// So the same action looked like a different control depending on which part
// of the site happened to draw it. Nobody chose that; it accumulated.
//
// The fix is a shared --ctl-* geometry layer, with two real sizes: a page-level
// call to action and the compact variant used in the nav bar and inside card
// action rows. What each family keeps is what is genuinely its own — how it
// behaves in ITS layout (flex:1 in a three-up row, a min-width before wrapping)
// and what it MEANS. Geometry is not meaning.
//
// THREE TIERS, AND ONLY THREE.
//   PRIMARY   a football action — solid yellow, ideally one per view
//   SECONDARY the alternative that is still a button — stated with a border
//   TEXT      a link at the end of a block — no box at all
//
// The site had no third tier, which is why "more" links were either bare
// anchors with no affordance or full buttons competing with the real action.
//
// As with the radius scale, these tests hold the SYSTEM and not the pixels.
// Retuning --ctl-fs is free. Growing a seventh family is not.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

const FONTS = strip(read('css/fonts.css'));
const STYLE = strip(read('css/style.css'));
const CLUBNOW = strip(read('css/club-now.css'));
const FANZONE = read('fan-zone.html').replace(/<!--[\s\S]*?-->/g, ' ');

const CTL = ['--ctl-fs', '--ctl-fs-sm', '--ctl-weight', '--ctl-ls', '--ctl-radius',
  '--ctl-border', '--ctl-pad-y', '--ctl-pad-x', '--ctl-pad-y-sm', '--ctl-pad-x-sm',
  '--ctl-min-h'];

/**
 * CSS with every @media block removed, so a selector lookup finds the BASE
 * rule rather than a responsive override. Without this, looking up
 * `.nav__install` returned `{padding:8px 12px}` from a narrow-width block and
 * the test reported the header had two yellow buttons when it has one.
 */
function baseOnly(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const at = src.indexOf('@media', i);
    if (at === -1) { out += src.slice(i); break; }
    out += src.slice(i, at);
    let j = src.indexOf('{', at);
    if (j === -1) break;
    let depth = 1;
    j++;
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
      j++;
    }
    i = j;
  }
  return out;
}

/** The base rule body for a selector, from a given source. */
function rule(src, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const m = baseOnly(src).match(new RegExp('(^|[},\\s])' + esc + '\\s*\\{([^}]*)\\}', 'm'));
  return m ? m[2] : null;
}

// ── 1 · THE SHARED LAYER EXISTS, WHERE EVERY PAGE CAN SEE IT ────────────────

test('the control tokens are declared alongside the radius scale', () => {
  CTL.forEach((t) => assert.match(FONTS, new RegExp('\\' + t + ':\\s*[^;]+;'),
    t + ' must be declared'));
});

test('they live in fonts.css for the same reason the radii do', () => {
  // Nine pages load fonts.css without style.css. A control token defined only
  // in style.css resolves to nothing there and the padding collapses to 0.
  // Definitions only. style.css is full of legitimate var(--ctl-*) USAGES;
  // what must not appear there is a declaration, which is `--ctl-x: value;`
  // not preceded by `var(`.
  const declared = (STYLE.match(/(^|[;{\s])--ctl-[a-z-]+:\s*[^;]+;/gm) || [])
    .map((s) => s.trim());
  assert.deepStrictEqual(declared, [],
    'the control tokens must not be declared in style.css: ' + declared.join(' | '));
});

test('there are exactly two sizes', () => {
  // A third size is how six families happened in the first place.
  const sizes = (FONTS.match(/--ctl-fs[a-z-]*:/g) || []).sort();
  assert.deepStrictEqual(sizes, ['--ctl-fs-sm:', '--ctl-fs:'].sort(),
    'one standard control size and one compact one — no more');
});

// ── 2 · EVERY FAMILY CONSUMES THEM ──────────────────────────────────────────

const FAMILIES = [
  ['.btn', () => rule(STYLE, '.btn')],
  ['.cn__btn', () => rule(CLUBNOW, '.cn__btn')],
  ['.fz-btn', () => rule(FANZONE, '.fz-btn')],
  ['.cal-btn', () => rule(STYLE, '.cal-btn')],
  ['.nav__install', () => rule(STYLE, '.nav__install')],
];

test('no button family sets its own font-size, tracking, weight or radius', () => {
  const offenders = [];
  FAMILIES.forEach(([name, get]) => {
    const body = get();
    assert.ok(body, name + ' must still exist');
    [[/font-size:\s*([^;]+)/, 'font-size'],
     [/letter-spacing:\s*([^;]+)/, 'letter-spacing'],
     [/font-weight:\s*([^;]+)/, 'font-weight'],
     [/border-radius:\s*([^;]+)/, 'border-radius']].forEach(([re, prop]) => {
      const m = body.match(re);
      if (m && !/var\(--ctl-/.test(m[1])) offenders.push(`${name} ${prop}: ${m[1].trim()}`);
    });
  });
  assert.deepStrictEqual(offenders, [],
    'a family setting its own geometry is a seventh family waiting to happen');
});

test('every control clears the 44px tap target', () => {
  FAMILIES.forEach(([name, get]) => {
    const body = get();
    // The nav pair are sized by their own padding inside a 68px bar; the rest
    // must state the floor explicitly.
    if (name.startsWith('.nav__')) return;
    assert.match(body, /min-height:\s*var\(--ctl-min-h\)/,
      name + ' must state the tap-target floor');
  });
});

// ── 3 · THREE TIERS ─────────────────────────────────────────────────────────

test('primary is a solid fill, secondary is a border, text is neither', () => {
  const primary = rule(STYLE, '.btn-primary');
  const outline = rule(STYLE, '.btn-outline');
  const text = rule(STYLE, '.btn-text');

  assert.match(primary, /background:\s*var\(--yellow\)/, 'primary carries the fill');
  assert.match(outline, /background:\s*transparent/, 'secondary does not');
  assert.match(outline, /border:\s*var\(--ctl-border\)/, 'secondary is stated with a border');
  assert.ok(text, 'the text tier must exist');
  assert.match(text, /background:\s*none/, 'the text tier has no surface');
  assert.match(text, /border:\s*0/, 'and no border');
});

test('the dead fourth variant is gone, not merely unused', () => {
  assert.ok(!/\.btn-green\s*[,{]/.test(STYLE),
    '.btn-green had zero usages across the whole site');
});

test('the text tier signals direction without a box', () => {
  assert.match(STYLE, /\.btn-text::after\{content:'→'/,
    'a "more" link needs an affordance; a box is the wrong one');
});

// ── 4 · ONE PRIMARY IN THE BAR ──────────────────────────────────────────────

test('the header has exactly one solid-yellow control', () => {
  // The Fixtures button is `.btn btn-primary nav__cta` — the shared foundation
  // plus a compact size modifier — so its fill comes from .btn-primary.
  assert.match(read('js/components.js'),
    /<a href="fixtures\.html" class="btn btn-primary nav__cta">/,
    'the header CTA should use the shared button, not a bespoke family');
  assert.match(rule(STYLE, '.btn-primary'), /background:\s*var\(--yellow\)/,
    'Fixtures is the football action and keeps the fill');
  assert.match(rule(STYLE, '.nav__install'), /background:\s*transparent/,
    'Install App is a convenience and must not compete with it');
});

test('.nav__cta is a size modifier, not a seventh family', () => {
  const cta = rule(STYLE, '.nav__cta');
  assert.ok(cta, '.nav__cta must exist');
  assert.match(cta, /font-size:\s*var\(--ctl-fs-sm\)/, 'compact size from the token');
  assert.ok(!/background|border-radius|border:/.test(cta),
    'colour and shape belong to .btn / .btn-primary, not to the modifier');
});

test('the dead seventh family is gone', () => {
  // .nav__ticket carried its own size, tracking, padding and radius, and had
  // zero usages in any page or script.
  // Comments are stripped first: a note recording WHY it was removed is
  // documentation, not a usage, and should not fail this.
  const decomment = (f) => read(f)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  assert.ok(!/\.nav__ticket\s*[,{:]/.test(STYLE), '.nav__ticket must be removed');
  ['index.html', 'js/components.js', 'css/a11y.css', 'css/style.css'].forEach((f) =>
    assert.ok(!decomment(f).includes('nav__ticket'), f + ' still references it'));
});

test('Install keeps its fill only where nothing competes', () => {
  // Inside the menu sheet's footer it is the sole action on offer.
  assert.match(STYLE, /\.lane-menu__foot \.nav__install\{[^}]*background:var\(--yellow\)/,
    'the exception is deliberate and must stay scoped to the menu footer');
});
