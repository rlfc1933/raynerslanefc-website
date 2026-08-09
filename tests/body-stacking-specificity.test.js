// ════════════════════════════════════════════════════════════════════════════
// A BLANKET RULE THAT OUTWEIGHS EVERYTHING IT DID NOT KNOW ABOUT.
//
// One declaration gives every direct child of <body> its own stacking context:
//
//     body > *:not(#bg-imagery):not(#lane-menu):not(#nav-placeholder)
//            :not(#a11y-fab):not(#a11y-panel) { position:relative; z-index:1 }
//
// The intent is right and the site depends on it. The way the exclusions were
// written was not. In `:not(X)` the pseudo-class takes the specificity of X, so
// five ids made this single declaration (5,0,0) — heavier than any class rule
// anywhere on the site. It therefore silently beat the positioning of every
// overlay that scripts append to <body>, and the exclusion list had to grow by
// hand each time someone noticed. Twice, nobody noticed:
//
//   THE SKIP LINK. `.skip-link` is `position:fixed; top:-60px`, revealed by
//   `:focus{top:12px}`. Forced to `relative`, those offsets resolved against its
//   flow position at the top of the DOCUMENT rather than the viewport — so on
//   any scrolled page the first thing a keyboard user tabs to was off-screen.
//   That is WCAG 2.4.1 Bypass Blocks, failing silently on all 21 pages.
//
//   THE LANE CURSOR. `.lane-cur` / `.lane-ring` are `position:fixed` and follow
//   the pointer by transform. Dropped into normal flow at the end of <body>,
//   their transform extended the scrollable area: ~460px of dead scroll below
//   the footer of every page, growing as the pointer moved down the screen.
//
// The fix is specificity, not another exclusion. `:where()` always contributes
// zero, so the rule settles at (0,0,1) — it still applies to exactly the same
// elements, but anything that states its own position now wins, including
// elements added in future. Measured across ten rendered pages, the only three
// elements whose computed position changed were the skip link and the two
// cursor nodes: the ones that were supposed to be fixed all along.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CSS = read('css/style.css');

/** The one declaration this file is about. */
const RULE = (() => {
  const m = CSS.match(/^body > \*:not\([^\n]*\{[^}]*\}/m);
  assert.ok(m, 'the body-child stacking rule must still exist');
  return m[0];
})();

// ── 1 · THE RULE STILL DOES ITS JOB ─────────────────────────────────────────

test('every body child still gets its own stacking context', () => {
  assert.match(RULE, /position:\s*relative/);
  assert.match(RULE, /z-index:\s*1\b/);
});

test('the same five elements are still excluded', () => {
  ['#bg-imagery', '#lane-menu', '#nav-placeholder', '#a11y-fab', '#a11y-panel']
    .forEach((id) => assert.ok(RULE.includes(id), id + ' must stay excluded'));
});

test('the nav shell is still lifted above content', () => {
  // Flattening #nav-placeholder to z-index:1 let later content paint over the
  // fixed bottom bar and swallow taps. That fix must survive this one.
  assert.match(CSS, /#nav-placeholder \{ position:relative; z-index:1000; \}/);
});

// ── 2 · IT NO LONGER OUTWEIGHS EVERYTHING ───────────────────────────────────

test('the exclusions carry no specificity', () => {
  assert.match(RULE, /:not\(:where\(/,
    'bare :not(#id) chains make this rule (5,0,0) and beat every class on the site');
  const bareIdNot = RULE.match(/:not\(#/g) || [];
  assert.strictEqual(bareIdNot.length, 0,
    'an id inside a bare :not() contributes full id specificity');
});

test('an element that states its own position wins', () => {
  // (0,0,1) for `body > *` versus (0,1,0) for a class. This is the whole point:
  // the next overlay someone appends to <body> will not need a code change here.
  const idsOutside = (RULE.split('{')[0].match(/#[a-z-]+/gi) || [])
    .filter((id) => !RULE.split('{')[0].includes(':where(' + id) &&
                    !new RegExp(':where\\([^)]*' + id).test(RULE.split('{')[0]));
  assert.deepStrictEqual(idsOutside, [],
    'every id must sit inside :where() so it contributes nothing');
});

// ── 3 · THE TWO THINGS IT WAS BREAKING ──────────────────────────────────────

test('the skip link is fixed to the viewport, not to the document', () => {
  assert.match(CSS, /\.skip-link\{position:fixed;top:-60px/,
    'a relative skip link resolves its offsets against the top of the page');
  assert.match(CSS, /\.skip-link:focus\{top:12px/);
});

test('the cursor is fixed, so it cannot extend the page', () => {
  const js = read('js/components.js');
  assert.match(js, /\.lane-cur,\.lane-ring\{position:fixed;/,
    'in normal flow its transform adds scrollable overflow below the footer');
  assert.match(js, /transform:translate3d\(-50%,-50%,0\)/);
});

test('neither is listed as an exclusion — they win on their own merits', () => {
  // Adding them to the list would fix today and leave the trap set for tomorrow.
  assert.ok(!/lane-cur|lane-ring|lane-skip|skip-link/.test(RULE),
    'the rule must not need to know about individual overlays');
});

// ── 4 · WHY, RECORDED ───────────────────────────────────────────────────────

test('the reasoning is written down where the next reader will hit it', () => {
  const i = CSS.indexOf(RULE);
  const preamble = CSS.slice(Math.max(0, i - 1400), i);
  assert.match(preamble, /:where\(\) is always zero-specificity|zero-specificity/,
    'the next person to add an exclusion needs to know why they should not');
  assert.match(preamble, /skip link/i);
});
