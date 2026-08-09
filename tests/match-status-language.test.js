// ════════════════════════════════════════════════════════════════════════════
// A POSTPONED MATCH WAS DRAWN WITH THE LIVE TREATMENT.
//
// The homepage rendered Postponed, Cancelled and Kick-off Delayed like this:
//
//     <div class="cn__eyebrow cn__eyebrow--live"><span class="cn__dot"></span> Postponed
//
// — the live class, and with it the pulsing red dot. An animated red light on a
// game that is NOT being played is close to the most misleading thing this card
// could show. The reasoning had already been written down for Full Time ("a
// pulsing red dot on a finished game reads as still playing") and simply never
// reached the off-states.
//
// Three surfaces were also inventing their own vocabulary for the same facts:
// the homepage used a coloured eyebrow, the fixtures page a private .fx-off
// block, matchday-ops a grey pill. A supporter who learns what POSTPONED looks
// like in one place should recognise it in the next.
//
// ONE SYSTEM. Colour carries meaning and never carries it alone — the word is
// always present, so this survives without colour vision:
//     LIVE       red, and the only state that moves
//     FULL TIME  green, settled
//     POSTPONED  yellow, loud, block-level — the one that changes someone's plans
//     CANCELLED  red, flat, final
//     ABANDONED  amber, flat
//     AWAITING   grey, quiet, no status light at all
//
// UPCOMING deliberately has no treatment. A scheduled match is the normal case,
// and badging the normal case is exactly how ordinary metadata becomes a wall
// of status pills.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

const STYLE = strip(read('css/style.css'));
const CLUBNOW_JS = strip(read('js/club-now.js'));
const FIXTURES = read('fixtures.html').replace(/<!--[\s\S]*?-->/g, ' ');

// ── 1 · THE BUG ─────────────────────────────────────────────────────────────

test('an off-state never borrows the live treatment', () => {
  // Line comments stripped as well: the note recording what this USED to render
  // as necessarily names the old class, and that is documentation, not code.
  const fn = CLUBNOW_JS.match(/function renderState\(st\)[\s\S]*?\n  \}/)[0]
    .replace(/^\s*\/\/.*$/gm, ' ');
  assert.ok(!/cn__eyebrow--live/.test(fn),
    'Postponed/Cancelled/Delayed must not render as live');
  assert.ok(!/cn__dot/.test(fn),
    'and must not carry the pulsing live indicator');
  assert.match(fn, /mstat--off|mstat--cancelled|mstat--abandoned/,
    'they use the shared status classes instead');
});

test('only LIVE is allowed to move', () => {
  // `animation:none` in the reduced-motion block is a rule that REMOVES motion,
  // so it must not be counted as a state that has it.
  const animated = (STYLE.match(/\.mstat--[a-z]+::before\{[^}]*animation:[^;}]*[^}]*\}/g) || [])
    .filter((r) => !/animation:\s*none/.test(r));
  const states = Array.from(new Set(animated.map((r) => r.match(/\.mstat--([a-z]+)/)[1])));
  assert.deepStrictEqual(states, ['live'], 'only LIVE may move; found: ' + states.join(', '));
});

test('motion is dropped under reduced-motion', () => {
  assert.match(STYLE, /@media \(prefers-reduced-motion: reduce\)\{ \.mstat--live::before\{animation:none\} \}/);
});

// ── 2 · THE STATES ARE DISTINGUISHABLE, AND NOT BY COLOUR ALONE ─────────────

const STATES = ['live', 'ft', 'off', 'cancelled', 'abandoned', 'await'];

test('every supported state has its own treatment', () => {
  STATES.forEach((s) => assert.match(STYLE, new RegExp('\\.mstat--' + s + '\\{'),
    'missing a treatment for ' + s));
});

test('no two states share a colour', () => {
  const colours = STATES.map((s) => {
    const m = STYLE.match(new RegExp('\\.mstat--' + s + '\\{[^}]*color:([^;}]+)'));
    return m ? m[1].trim().toLowerCase() : null;
  }).filter(Boolean);
  assert.strictEqual(new Set(colours).size, colours.length,
    'two states that look identical are one state: ' + colours.join(', '));
});

test('the word is always there, so colour is never the only signal', () => {
  // .mstat is a text class — it has type, not just a swatch.
  const base = STYLE.match(/\.mstat\{[^}]*\}/)[0];
  assert.match(base, /text-transform:uppercase/);
  assert.match(base, /font-size/);
});

// ── 3 · POSTPONED OUTRANKS EVERYTHING AROUND IT ─────────────────────────────

test('a called-off match gets a block, not a chip', () => {
  const n = STYLE.match(/\.mnotice\{[^}]*\}/)[0];
  assert.match(n, /border-left:4px solid var\(--yellow\)/,
    'it needs to be findable at a glance on a busy fixtures page');
  assert.match(STYLE, /\.mnotice__why\{/, 'the reason is shown in full');
  assert.match(STYLE, /\.mnotice__next\{/, 'and so is whether a new date exists');
});

test('the fixtures page uses the shared system, not its own', () => {
  assert.ok(!/\.fx-off\{|class="fx-off/.test(FIXTURES),
    'the private .fx-off vocabulary must be gone');
  assert.match(FIXTURES, /class="mnotice/);
  assert.match(FIXTURES, /mstat mstat--' \+ tone/);
});

test('the called-off fixture is still shown rather than hidden', () => {
  // Disappearing would be worse than wrong: someone has the old date in a diary.
  assert.match(FIXTURES, /if \(calledOff\.length\) \{/);
  assert.match(FIXTURES, /A rearranged date will be announced once confirmed\./);
  assert.match(FIXTURES, /postponedReason/);
});

// ── 4 · AN ABSENT RESULT IS NOT A STATUS ────────────────────────────────────

test('"Result to follow" is quiet and carries no status light', () => {
  const a = STYLE.match(/\.mstat--await\{[^}]*\}/)[0];
  assert.match(a, /color:var\(--muted\)/, 'it is information, not an alert');
  assert.match(STYLE, /\.mstat--await::before\{display:none\}/,
    'a status light would make missing data look like news');
});

test('both surfaces say the same words for it', () => {
  assert.match(CLUBNOW_JS, /class="mstat mstat--await">Result to follow</);
  assert.match(FIXTURES, /class="mstat mstat--await">Result to follow</);
});

// ── 5 · THE NORMAL CASE STAYS UNBADGED ──────────────────────────────────────

test('there is no treatment for UPCOMING', () => {
  assert.ok(!/\.mstat--(upcoming|scheduled|next)\b/.test(STYLE),
    'badging every scheduled match is how metadata turns into pills');
});

// ── 6 · NOTHING ELSE MOVED ──────────────────────────────────────────────────

test('Hilltop is still postponed with no rearranged date', () => {
  const fx = JSON.parse(read('data/fixtures.json')).fixtures || [];
  const h = fx.filter((f) => f.id === 'fwp-578241')[0];
  assert.strictEqual(h.status, 'postponed');
  assert.strictEqual(h.rearrangedDate, null);
  assert.match(h.postponedReason, /Broadfields/);
});
