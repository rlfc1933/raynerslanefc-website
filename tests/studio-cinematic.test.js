// ════════════════════════════════════════════════════════════════════════════
// THE REAL STUDIO MUST DRAW THE REAL CREATIVE.
//
// The cinematic engine was built, tested, and looked right in a dev gallery.
// The Studio the committee actually opens still drew the old branded document.
// Two renderers, and the good one was invisible to the people who use the club.
//
// This file holds the wiring that closed that gap, and the two things most
// likely to silently reopen it: psRender() ceasing to consult the engine, and
// the engine quietly failing in a way that shows a volunteer a blank card.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/studio-cinematic.js'), 'utf8');
const ADMIN = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const SQ = require(path.join(ROOT, 'js/creative-square.js'));

test('the real psRender consults the cinematic engine FIRST', () => {
  const fn = ADMIN.slice(ADMIN.indexOf('function psRender()'), ADMIN.indexOf('function psRender()') + 1400);
  assert.match(fn, /StudioCinematic\.render\(\)/,
    'the committee-facing renderer must call the engine');
  assert.ok(fn.indexOf('StudioCinematic.render()') < fn.indexOf('PS_SIZES[PS.size]'),
    'and before it starts drawing the old card');
});

test('the portal actually loads the engine', () => {
  ['js/creative-campaign.js', 'js/creative-square.js', 'js/creative-svg.js', 'js/studio-cinematic.js']
    .forEach((f) => assert.ok(ADMIN.includes(f), f + ' must be loaded by admin.html'));
  assert.match(ADMIN, /StudioCinematic\.init\(\)/, 'and initialise it when Studio opens');
});

test('ONLY Match Day routes to the campaign renderer', () => {
  // CORRECTED AFTER THE 15 AUG INCIDENT. This test used to require eleven
  // templates to route here, which is the bug itself written down as an
  // expectation: it made Goal, Half Time and Full Time draw the Match Day
  // poster. The brief was one cinematic template, not a renderer that consumes
  // the others.
  assert.match(SRC, /\bmatchday:\s*'matchday'/);
  ['goal', 'halftime', 'fulltime', 'lineup', 'kickoff', 'offstate', 'countdown']
    .forEach((t) => assert.ok(!new RegExp('\\n\\s*' + t + ':\\s*\'').test(SRC),
      t + ' must keep its own renderer'));
});

test('non-fixture templates are left alone', () => {
  // A birthday or a quote is not a fixture and never was the problem.
  ['birthday', 'quote', 'seasonticket'].forEach((t) =>
    assert.ok(!new RegExp('\\n\\s*' + t + ':').test(SRC), t + ' must fall through'));
});

test('a goal says GOAL rather than falling through to MATCHDAY', () => {
  const h = SQ.hierarchy({ state: 'goal', score: { us: 2, them: 1 }, player: 'K. Barnard-White', minute: "67'" });
  assert.strictEqual(h.word, 'GOAL');
  assert.strictEqual(h.who, 'K. Barnard-White');
  assert.strictEqual(h.minute, "67'");
});

test('a goal with no scorer names nobody rather than guessing', () => {
  const h = SQ.hierarchy({ state: 'goal', score: { us: 1, them: 0 } });
  assert.strictEqual(h.who, '');
});

test('a red card is treated more urgently than a yellow', () => {
  assert.strictEqual(SQ.hierarchy({ state: 'red' }).tone, 'urgent');
  assert.notStrictEqual(SQ.hierarchy({ state: 'yellow' }).tone, 'urgent');
});

test('a failure shows the old card, never a blank one', () => {
  assert.match(SRC, /catch \(e\) \{/, 'render must be wrapped');
  assert.match(SRC, /return false;/, 'and signal fallback rather than throwing');
  const fn = SRC.slice(SRC.indexOf('function render()'));
  assert.match(fn, /if \(!fx\) \{ clearMark\(\); return false; \}/,
    'no fixture means no cinematic card, and the marker is cleared with it');
});

test('Studio no longer disagrees with the rest of the site about the next match', () => {
  // Studio seeded from a POSTPONED fixture, so asking for a Matchday graphic
  // produced a card reading POSTPONED — while the homepage, the fixtures page
  // and Prepare Match had all already learned to skip them.
  const fn = ADMIN.slice(ADMIN.indexOf('function psNextFixture'),
                         ADMIN.indexOf('function psLastResult'));
  assert.match(fn, /postponed/, 'the picker must know what a postponement is');
  assert.match(fn, /up\.filter\(playable\)\[0\]/, 'and prefer a playable fixture');
});
