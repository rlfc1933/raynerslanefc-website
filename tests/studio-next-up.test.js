// ════════════════════════════════════════════════════════════════════════════
// NEXT UP AND MATCH DAY ARE DIFFERENT EDITORIAL MOMENTS.
//
// WHY THIS WAS MISSING. Match Day's own hint read "Announce the next fixture —
// opponent, date, kick-off and venue." That was its original job. The cinematic
// redesign turned it into a day-of poster carrying the word MATCHDAY, but the
// editorial job was never split — so the only way to promote Saturday's game on
// a Tuesday was to post a graphic claiming the match was today.
//
// THESE TESTS ASSERT THE PRODUCT CONTRACT, NOT THE IMPLEMENTATION.
// The last incident was made worse by a test that asserted eleven templates
// should route to the cinematic renderer — the suite stayed green while the
// product was wrong. So these say what a committee member must be able to do,
// and what must never happen to the other templates.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ADMIN = read('admin.html');
const CINE = read('js/studio-cinematic.js');
const SHELL = read('js/studio-shell.js');

/**
 * The render branch for one template, from psRender, WITH COMMENTS REMOVED.
 *
 * The comments explain what a branch must not do, and therefore contain the
 * very phrases these tests look for — the Next Up branch opens by saying it is
 * "NOT A RELABELLED MATCH DAY", which failed a check for the words MATCH DAY.
 * A test must read what the template emits, not what the source says about it.
 */
function branch(type) {
  const fn = ADMIN.slice(ADMIN.indexOf('function psRender()'));
  const start = fn.indexOf("PS.type === '" + type + "'");
  if (start === -1) return '';
  const next = fn.indexOf("} else if (PS.type ===", start + 10);
  return fn.slice(start, next === -1 ? start + 3000 : next)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

// ── 1 · IT EXISTS, AND IT IS ITS OWN TEMPLATE ───────────────────────────────

test('NEXT UP is a first-class template in the picker', () => {
  assert.match(ADMIN, /\{ key: 'nextup',\s+label: 'Next Up',\s+group: 'Before Match' \}/,
    'a committee member must be able to see and choose it');
});

test('it leads the fixture lifecycle, before Match Day', () => {
  const types = ADMIN.slice(ADMIN.indexOf('function POST_TYPES()'));
  assert.ok(types.indexOf("key: 'nextup'") < types.indexOf("key: 'matchday'"),
    'Next Up comes first, which is what stops anyone reaching for Match Day early');
});

test('the two are described as different jobs, in plain words', () => {
  const hints = ADMIN.slice(ADMIN.indexOf('var PS_TYPE_HINT'), ADMIN.indexOf('var PS_TYPE_HINT') + 2200);
  assert.match(hints, /nextup: 'Promote an upcoming fixture/);
  assert.match(hints, /matchday: 'Promote TODAY/);
  assert.ok(!/matchday: 'Announce the next fixture/.test(hints),
    'Match Day must no longer claim the job Next Up now does');
});

test('it has its own render branch, not a relabelled Match Day', () => {
  const nu = branch('nextup'), md = branch('matchday');
  assert.ok(nu.length > 400, 'Next Up must actually render something of its own');
  assert.ok(!/AWAY DAY|MATCH DAY/.test(nu), 'and must never say the match is today');
  assert.match(nu, /psEyebrow\('NEXT UP'/);
  assert.notStrictEqual(nu, md);
});

test('the date is the headline, which is the whole editorial difference', () => {
  const nu = branch('nextup');
  const dateAt = nu.indexOf('DATE TO BE CONFIRMED');
  const koAt = nu.indexOf('KICK-OFF ');
  assert.ok(dateAt > -1 && koAt > dateAt,
    'a reader days out needs the day first and the clock second');
});

// ── 2 · MATCH DAY STAYS ISOLATED. THIS IS THE ONE THAT BIT US. ──────────────

test('NEXT UP does not route through the Match Day cinematic renderer', () => {
  const block = CINE.slice(CINE.indexOf('var STATE = {'), CINE.indexOf('};', CINE.indexOf('var STATE = {')));
  assert.ok(!/nextup/.test(block),
    'adding nextup here is exactly how Match Day consumed ten templates last time');
});

test('the cinematic renderer still owns Match Day and nothing else', () => {
  const block = CINE.slice(CINE.indexOf('var STATE = {'), CINE.indexOf('};', CINE.indexOf('var STATE = {')));
  const keys = (block.match(/^\s*(\w+)\s*:/gm) || []).map((k) => k.trim().replace(':', ''));
  assert.deepStrictEqual(keys, ['matchday']);
});

['matchday', 'lineup', 'goal', 'fulltime', 'halftime', 'kickoff', 'countdown', 'offstate']
  .forEach((t) => {
    test(t + ' keeps its own render branch after Next Up was added', () => {
      assert.ok(branch(t).length > 100, t + ' must still render itself');
    });
  });

test('Match Day still says Match Day', () => {
  assert.match(branch('matchday'), /'AWAY DAY' : 'MATCH DAY'/);
});

// ── 3 · IT USES THE REAL UPCOMING FIXTURE ───────────────────────────────────

test('Next Up seeds from the canonical fixture source', () => {
  assert.match(ADMIN, /var PS_FIXTURE_TYPES = \['nextup', 'matchday'/,
    'it must be treated as a fixture card so psFixtureFor seeds it');
});

test('it takes the opponent and home/away from the fixture, not a default', () => {
  // THE BUG THIS CAUGHT IN DEVELOPMENT: left out of this branch, Next Up kept
  // the alphabetically-first crest and defaulted to Home — advertising the
  // wrong opponent at the wrong ground, on the right date.
  const fn = ADMIN.slice(ADMIN.indexOf('function psApplyFixture'), ADMIN.indexOf('function psBuild'));
  assert.match(fn, /if \(T === 'nextup' \|\| T === 'matchday' \|\| T === 'offstate'\)/);
  assert.match(fn, /d\.ha = away \? 'away' : 'home';/);
  assert.match(fn, /if \(f\.oppCrest\) d\.oppCrest = f\.oppCrest;/);
});

test('date and kick-off are seeded in the club’s voice', () => {
  const fn = ADMIN.slice(ADMIN.indexOf('function psApplyFixture'), ADMIN.indexOf('function psBuild'));
  assert.match(fn, /d\.date = fxFmtDate\(f\.date\); d\.ko = prTo12\(/,
    '24h from the feed becomes 12h on the card');
});

test('the fixture picker and home/away toggle are offered', () => {
  assert.match(ADMIN, /\['nextup', 'matchday', 'kickoff', 'halftime', 'fulltime'\]\.indexOf\(T\) > -1 && psFixtures\.length/);
  assert.match(ADMIN, /T === 'nextup' \|\| T === 'matchday' \|\| T === 'preseason'/);
});

// ── 4 · OUTPUT ──────────────────────────────────────────────────────────────

test('it carries the sponsor band like the other fixture promotion card', () => {
  assert.match(ADMIN, /var PS_BAND_TYPES = \{ nextup:1, matchday:1 \};/);
});

test('it composes for every export format rather than one', () => {
  const nu = branch('nextup');
  assert.match(nu, /X \?/, 'the X format has its own measurements');
  assert.match(nu, /ST \?/, 'and so does the story');
});

test('a missing opponent crest degrades instead of breaking the render', () => {
  const nu = branch('nextup');
  assert.match(nu, /d\.oppCrest \|\| \(psCrests\[1\] && psCrests\[1\]\.file\) \|\| 'img\/badge\.png'/,
    'no artwork must never mean no graphic');
});

test('the preview and the export draw from the same branch', () => {
  // psBuildBlob re-renders through psRender, so the exported file is whatever
  // the active template drew. Nothing may pin the export to a fixed template.
  const fn = ADMIN.slice(ADMIN.indexOf('function psBuildBlob'), ADMIN.indexOf('function psExportBusy'));
  assert.match(fn, /psRender\(\)/);
  assert.ok(!/'nextup'|'matchday'/.test(fn));
});

// ── 5 · THE GUIDED SHELL ────────────────────────────────────────────────────

test('the guided front door offers Next Up first', () => {
  assert.match(SHELL, /types: \['nextup', 'matchday', 'countdown'/);
});
