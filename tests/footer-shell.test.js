// ════════════════════════════════════════════════════════════════════════════
// THE FOOTER IS THE SITEMAP, AND IT WAS SWITCHED OFF ON PHONES.
//
//     @media(max-width:768px){ .footer__col:not(:first-child){display:none} }
//
// Three of the four footer columns — about twenty routes: the committee, the
// club history, results, the programme, trials, policies, the shop — were
// present for anyone on a laptop and gone for everyone else. Most people who
// visit a non-league club's website are holding a phone. Hiding a sitemap is
// not a responsive layout; it is deciding some visitors get less site.
//
// AND THE AFFILIATIONS WERE DRESSED AS CONTROLS.
// Five <span>s in bordered boxes that changed colour on hover, with nothing
// behind them — a button's affordance and a button's nothing. Three of the five
// repeated, word for word, a sentence already in the brand column above. They
// are a statement of fact about the club, so they are now stated once, as a
// sentence. The claims themselves are unchanged: nothing was added or dropped.
//
// These tests hold the two properties that failed quietly, not the styling
// around them. A footer may be redesigned freely; it may not go dark on a phone
// and it may not grow fake buttons again.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CSS = read('css/style.css');
const COMPONENTS = read('js/components.js');

/** style.css with comments stripped — so prose about a rule never passes for it. */
const LIVE = CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');

// ── 1 · NOTHING IN THE FOOTER IS HIDDEN BY WIDTH ────────────────────────────

test('no breakpoint hides a footer column', () => {
  const hides = LIVE.match(/\.footer__col[^{}]*\{[^}]*display:\s*none[^}]*\}/g) || [];
  assert.deepStrictEqual(hides, [],
    'a column that vanishes below a width takes its links with it');
});

test('the whole footer link list survives every width', () => {
  // Anything that hides a run of footer links, however it is spelled.
  const risky = (LIVE.match(/\.footer[^{}]*\{[^}]*display:\s*none[^}]*\}/g) || [])
    .filter((r) => !/__social|__legal|__sep/.test(r));
  assert.deepStrictEqual(risky, [], 'found a footer block hidden by CSS: ' + risky.join(' | '));
});

/**
 * The @media blocks whose query matches `re`, each returned as its full body.
 *
 * An earlier version of this test just sliced from the first
 * `@media(max-width:768px)` and regex-matched the next `.footer__grid{…}`.
 * That silently depended on no other 768px block existing earlier in the file
 * than the base `.footer__grid` declaration — and the moment one was added the
 * test matched the DESKTOP rule and failed while the CSS was perfectly correct.
 * Reading the blocks properly costs a few lines and removes the trap.
 */
function mediaBlocks(css, re) {
  const out = [];
  const open = /@media([^{]*)\{/g;
  let m;
  while ((m = open.exec(css))) {
    if (!re.test(m[1])) continue;
    let depth = 1, i = open.lastIndex;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    out.push(css.slice(open.lastIndex, i - 1));
  }
  return out;
}

test('the columns stack rather than disappear on a phone', () => {
  const blocks = mediaBlocks(LIVE, /max-width:\s*768px/);
  assert.ok(blocks.length, 'a 768px breakpoint must exist');

  const owning = blocks.filter((b) => /\.footer__grid\{/.test(b));
  assert.strictEqual(owning.length, 1,
    'exactly one 768px block should answer for the footer grid');

  const grid = owning[0].match(/\.footer__grid\{[^}]*\}/)[0];
  assert.match(grid, /grid-template-columns:\s*1fr 1fr/,
    'two up keeps twenty links reachable without a wall of text');
  assert.match(owning[0], /\.footer__brand\{grid-column:1\/-1\}/,
    'the brand block spans, so the link columns sit beneath it');
});

// ── 2 · THE AFFILIATIONS ARE A SENTENCE, NOT FIVE BUTTONS ───────────────────

test('the boxes are gone', () => {
  assert.ok(!COMPONENTS.includes('affil-item'), 'no boxed affiliation chips in the markup');
  assert.ok(!/\.affil-item/.test(LIVE), 'and no styles left behind to bring them back');
});

test('nothing inert pretends to be interactive', () => {
  const rule = LIVE.match(/\.affils\{[^}]*\}/);
  assert.ok(rule, '.affils must still be styled');
  const hover = LIVE.match(/\.affils[^{}]*:hover[^{}]*\{[^}]*\}/g) || [];
  assert.deepStrictEqual(hover, [], 'a hover state on unclickable text is a false affordance');
  assert.ok(!/border:\s*1px/.test(rule[0]), 'no box around a sentence');
});

test('every affiliation the club claimed is still claimed', () => {
  ['Middlesex County FA', 'The FA', 'FA Charter Standard', 'Kick It Out', 'Football Foundation']
    .forEach((a) => assert.ok(COMPONENTS.includes(a), a + ' must not be dropped by a restyle'));
});

test('it is said once, not twice', () => {
  // The brand paragraph used to end with the same sentence the row below repeated.
  const brandPara = COMPONENTS.match(/<p class="footer__brand-sub">[\s\S]*?<\/p>/);
  assert.ok(brandPara, 'the brand paragraph must still exist');
  assert.ok(!/Affiliated to/.test(brandPara[0]),
    'the affiliations belong in one place, and it is not here');
  assert.match(COMPONENTS, /<span class="affils__lbl">Affiliated to<\/span>/);
});

test('the registered company details are untouched', () => {
  // Restyling the block around them must never quietly lose the legal facts.
  const brandPara = COMPONENTS.match(/<p class="footer__brand-sub">[\s\S]*?<\/p>/)[0];
  ['Rayners Lane Football Club Limited', '17110511', 'HA2 0XH'].forEach((f) =>
    assert.ok(brandPara.includes(f), f + ' is a legal requirement, not decoration'));
});

// ── 3 · THE ADDRESS READS AS AN ADDRESS ─────────────────────────────────────

test('the address is set as running text, not as a label', () => {
  const rule = LIVE.match(/\.footer__brand-sub\{[^}]*\}/)[0];
  const ls = rule.match(/letter-spacing:([^;]+)/);
  assert.ok(ls && parseFloat(ls[1]) <= 0.02,
    'wide tracking belongs on uppercase labels; on a sentence it just forces wrapping');
  assert.match(rule, /max-width:\s*\d+ch/,
    'a measure in ch tracks the type; 260px was an arbitrary cap that split the postcode');
});
