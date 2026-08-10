// ════════════════════════════════════════════════════════════════════════════
// THE PROGRAMME IS THE THING SUPPORTERS KEEP.
//
// The cover was a black page with the club badge, the words RAYNERS LANE FC,
// two crests and a date — visually identical for all twenty-one opponents and
// all three competitions. It carried nothing of the fixture except its text,
// while the fixtures page two clicks away had been giving every match its
// opponent's colour and its competition's mark for weeks.
//
// It now resolves the same campaign. These tests guard the parts of that which
// are easy to break silently: the resolvers being loaded at all, the registries
// being populated BEFORE the cover renders, and the dark-colour lift without
// which a navy club prints as more black.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PAGE = fs.readFileSync(path.join(ROOT, 'programme-print.html'), 'utf8');

// ── 1 · THE COVER KNOWS WHICH MATCH IT IS ───────────────────────────────────

test('the print page loads the campaign resolvers', () => {
  assert.match(PAGE, /<script src="js\/brand-palette\.js"/,
    'without this the cover cannot know the opponent’s colours');
  assert.match(PAGE, /<script src="js\/competition-brand\.js/,
    'without this it cannot print the issued competition mark');
});

test('the registries are populated before the cover renders, not after', () => {
  // A cover that resolves its palette one tick too late prints the fallback
  // and never corrects, because unlike a web page it is not re-rendered.
  assert.match(PAGE, /function loadCampaignRegistries/);
  assert.match(PAGE, /loadCampaignRegistries\(\)\s*\n?\s*\]\)\.then/,
    'the registry load must sit inside the same Promise.all the render waits on');
});

test('the cover prints the issued competition mark when the club holds one', () => {
  assert.match(PAGE, /CompetitionBrand\.identity\(/);
  assert.match(PAGE, /pc__mark/, 'and gives it somewhere to render');
});

test('an unconfirmed opponent palette gets no colour on the cover', () => {
  // Same rule as everywhere else: a guessed club colour must never be printed
  // under the Rayners Lane badge.
  assert.match(PAGE, /if \(pr && pr\.usable\) cPal = pr;/,
    'only a usable, human-confirmed palette reaches the cover');
  assert.match(PAGE, /oppC \? ' pc--tinted' : ''/,
    'and the treatment is conditional on it');
});

test('a dark club colour is lifted so it is visible on a near-black cover', () => {
  // Hilltop's #132654 over #0a0a0a is not a colour, it is more black.
  assert.match(PAGE, /BrandPalette\.glowable\(cPal\.primary/,
    'dark opponent colours must be lifted, preserving hue');
});

test('the cover cannot be taken down by a missing resolver', () => {
  // Anchor on `var oppC =` with the assignment: plain `var oppC` also matches
  // `var oppCrest` further UP the file, which inverted the slice and silently
  // handed this assertion an empty string to pass against.
  const from = PAGE.indexOf('var cPal = null');
  const to = PAGE.indexOf('var oppC =', from);
  assert.ok(from > -1 && to > from, 'the cover resolver block should be locatable');
  const block = PAGE.slice(from, to);
  assert.match(block, /catch \(e\)/, 'a programme must still print without the campaign');
});

// ── 2 · EDITORIAL PROSE ─────────────────────────────────────────────────────

test('markdown an editor typed does not print as asterisks', () => {
  // The Hilltop preview opened with "**OLD PATHS. NEW CHAPTER.**" and that is
  // exactly what came off the printer.
  assert.match(PAGE, /function inline\(s\)/);
  assert.match(PAGE, /\\\*\\\*\(\[\^\*\]\+\)\\\*\\\*/,
    'bold must be converted rather than printed');
});

test('prose is escaped before markup is added, never after', () => {
  const fn = PAGE.slice(PAGE.indexOf('function inline(s)'), PAGE.indexOf('function notes(t)'));
  const escAt = fn.indexOf('esc(s)');
  const repAt = fn.indexOf('.replace');
  assert.ok(escAt > -1 && escAt < repAt,
    'escaping after adding tags would let prose inject markup');
});

test('a fully bold line becomes a standfirst, not a shouting paragraph', () => {
  assert.match(PAGE, /class="standfirst"/);
  assert.ok(/\.body \.standfirst\{/.test(PAGE), 'and it needs to be styled as one');
});
