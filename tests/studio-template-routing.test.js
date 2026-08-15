// ════════════════════════════════════════════════════════════════════════════
// A TEMPLATE-SPECIFIC RENDERER GETS EXACTLY ONE TEMPLATE.
//
// MATCH-DAY INCIDENT, 15 AUGUST 2026, DURING THE GAME.
// The brief was to make the MATCH DAY GRAPHIC cinematic. The renderer that came
// out of that work was wired to ELEVEN templates — matchday, countdown,
// preseason, lineup, offstate, kickoff, goal, yellow, red, halftime, fulltime.
//
// So clicking HALF TIME set PS.type to 'halftime', re-rendered, and drew the
// Match Day poster. Staff reported "the preview doesn't switch". It switched
// every time; every switch just landed on the same picture. Goal, Half Time and
// Full Time — the three the club needs DURING a match — were all gone.
//
// Nothing was disabled, nothing threw, and the tests were green, because every
// test asked whether the cinematic renderer worked rather than whether it had
// taken anything over.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CINE = read('js/studio-cinematic.js');
const ADMIN = read('admin.html');

/** The template → campaign-state map, parsed from source. */
function states() {
  const block = CINE.slice(CINE.indexOf('var STATE = {'), CINE.indexOf('};', CINE.indexOf('var STATE = {')));
  return (block.match(/^\s*(\w+)\s*:/gm) || []).map((s) => s.trim().replace(':', ''));
}

test('the cinematic renderer owns MATCH DAY and nothing else', () => {
  assert.deepStrictEqual(states(), ['matchday'],
    'THE INCIDENT: every extra entry here silently replaces another template’s design');
});

['goal', 'halftime', 'fulltime', 'lineup', 'kickoff', 'offstate', 'yellow', 'red', 'countdown', 'preseason']
  .forEach((t) => {
    test(t + ' must render its own design, not Match Day', () => {
      assert.ok(states().indexOf(t) === -1,
        t + ' is a separate template with its own layout and its own fields');
    });
  });

test('an unclaimed template falls through to the original renderer', () => {
  assert.match(CINE, /if \(!state\) \{ clearMark\(\); return false; \}/,
    'returning false is what hands the card back to psRender');
});

test('the cinematic marker is cleared when the renderer declines', () => {
  // The card element is shared. A left-over data-cinematic from the previous
  // template made a fallback render look like a cinematic one, which is how
  // this was nearly missed a second time.
  assert.match(CINE, /function clearMark\(\)/);
  const r = CINE.slice(CINE.indexOf('function render()'));
  const declines = (r.match(/clearMark\(\); return false;/g) || []).length;
  assert.ok(declines >= 5, 'every early return must clear it, not just the first');
});

test('psRender still consults the engine before drawing', () => {
  const fn = ADMIN.slice(ADMIN.indexOf('function psRender()'), ADMIN.indexOf('function psRender()') + 900);
  assert.match(fn, /StudioCinematic\.render\(\)/);
  assert.ok(fn.indexOf('StudioCinematic.render()') < fn.indexOf('PS_SIZES[PS.size]'));
});

test('the export follows the selected template, not a fixed one', () => {
  // psBuildBlob re-renders through psRender, so whatever the type is at export
  // time is what gets captured. Nothing may pin it to matchday.
  const fn = ADMIN.slice(ADMIN.indexOf('function psBuildBlob'), ADMIN.indexOf('function psExportBusy'));
  assert.match(fn, /psRender\(\)/, 'the export re-renders the ACTIVE template');
  assert.ok(!/'matchday'/.test(fn), 'and never names a template of its own');
  assert.match(fn, /PS_SIZES\[PS\.size\]/, 'sizing follows the chosen format');
});

test('the guided shell offers the live-match templates the club needs', () => {
  const SHELL = read('js/studio-shell.js');
  ['goal', 'halftime', 'fulltime'].forEach((t) =>
    assert.ok(SHELL.indexOf("'" + t + "'") > -1, t + ' must be reachable during a match'));
});
