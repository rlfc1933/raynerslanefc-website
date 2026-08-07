// ════════════════════════════════════════════════════════════════════════════
// THE WHOLE SQUAD, EXACTLY ONCE.
//
// The programme printed 15 players. The club has 26. Eleven were being dropped
// by `club.players.slice(0,15)` — a hard cap, nothing to do with photographs,
// statistics or identity confirmation.
//
// The 19 records in Supabase are NOT the roster and never were. They are
// Full-Time match-sheet identities: the people who have appeared in a line-up
// this season. Two different questions —
//
//   WHO PLAYS FOR RAYNERS LANE?      data/players.json, 26 players
//   WHAT MATCH DATA DO WE HAVE?      football_players, 19 identities
//
// — and conflating them is how a legitimate squad member gets deleted from the
// programme for the crime of not having played yet. A player belongs on the
// squad page because he is in the squad. Whether we can print numbers beside
// his name is a separate matter, decided per card.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const print = read('programme-print.html');
const ROSTER = JSON.parse(read('data/players.json')).players || [];

/** The renderer's own pagination, lifted out and run for real. */
const squadPages = (() => {
  const src = print.slice(print.indexOf('function squadPages(total, max){'),
                          print.indexOf('function seasonStats(fixtures, editionDate){'));
  return new Function(src + '; return squadPages;')();
})();

// ── 1 · NOBODY IS CAPPED OUT ────────────────────────────────────────────────

test('the hard 15-player cap is gone', () => {
  assert.ok(!/club\.players\.slice\(0\s*,\s*15\)/.test(print),
    'eleven players were being dropped by this one call');
  assert.match(print, /var pc = club\.players\.map\(function\(p\)\{/);
});

test('the roster is the club list, not the match-data list', () => {
  assert.ok(ROSTER.length > 19, 'the club roster is larger than the Full-Time identity list');
  assert.strictEqual(ROSTER.length, 26);
  // The squad cards must be built from club.players, never from a stats source.
  const block = print.slice(print.indexOf('var pc = club.players.map'),
                            print.indexOf('var pages = squadPages'));
  assert.ok(!/football_players|statsBy|identity_status/.test(block),
    'squad membership must not be filtered by identity or statistics');
});

test('a player with no photograph, no stats and no identity still appears', () => {
  const block = print.slice(print.indexOf('var pc = club.players.map'),
                            print.indexOf('var pages = squadPages'));
  // Nothing in the card builder may return early or skip.
  assert.ok(!/return\s+''\s*;/.test(block), 'no card may be silently omitted');
  assert.ok(!/\.filter\(/.test(block), 'the roster is not filtered on the way in');
});

// ── 2 · BALANCED PAGINATION AT EVERY ROSTER SIZE ────────────────────────────

const SIZES = [1, 3, 5, 6, 7, 12, 15, 18, 19, 20, 21, 23, 26, 30];

test('every player is placed exactly once, at every roster size', () => {
  SIZES.forEach((n) => {
    const pages = squadPages(n, 6);
    const total = pages.reduce((a, b) => a + b, 0);
    assert.strictEqual(total, n, `roster of ${n} placed ${total}`);
    assert.ok(pages.every((p) => p > 0), `roster of ${n} produced an empty page`);
  });
});

test('no page is left holding a remainder', () => {
  SIZES.forEach((n) => {
    const pages = squadPages(n, 6);
    const spread = Math.max(...pages) - Math.min(...pages);
    assert.ok(spread <= 1,
      `roster of ${n} → ${pages.join('·')} — fullest and emptiest differ by ${spread}`);
  });
});

test('the real roster of 26 balances, instead of ending on two', () => {
  assert.deepStrictEqual(squadPages(26, 6), [6, 5, 5, 5, 5]);
  // What blind chunking would have produced, and why it was wrong:
  const naive = [];
  for (let i = 0; i < 26; i += 6) naive.push(Math.min(6, 26 - i));
  assert.deepStrictEqual(naive, [6, 6, 6, 6, 2]);
  assert.notDeepStrictEqual(squadPages(26, 6), naive);
});

test('the sizes the club is likely to have', () => {
  assert.deepStrictEqual(squadPages(15, 6), [5, 5, 5]);
  assert.deepStrictEqual(squadPages(18, 6), [6, 6, 6]);
  assert.deepStrictEqual(squadPages(19, 6), [5, 5, 5, 4]);
  assert.deepStrictEqual(squadPages(20, 6), [5, 5, 5, 5]);
  assert.deepStrictEqual(squadPages(21, 6), [6, 5, 5, 5]);
  assert.deepStrictEqual(squadPages(23, 6), [6, 6, 6, 5]);
});

test('it uses the fewest pages that will hold the squad', () => {
  SIZES.forEach((n) => {
    assert.strictEqual(squadPages(n, 6).length, Math.ceil(n / 6), `roster of ${n}`);
  });
});

test('an empty roster produces no squad pages at all', () => {
  assert.deepStrictEqual(squadPages(0, 6), []);
  assert.deepStrictEqual(squadPages(-3, 6), []);
});

test('a single player does not get a page to himself plus an empty one', () => {
  assert.deepStrictEqual(squadPages(1, 6), [1]);
});

// ── 3 · THE PAGE ITSELF ─────────────────────────────────────────────────────

test('squad pages are built from the balanced plan, not a fixed step', () => {
  assert.match(print, /var pages = squadPages\(pc\.length, 30\);/);
  assert.ok(!/pi \+= PER_PAGE/.test(print), 'the fixed-step loop is gone');
  assert.match(print, /pages\.forEach\(function \(n, idx\)/);
});

test('continuation pages say so', () => {
  assert.match(print, /idx === 0 \? 'The Squad' : 'The Squad continued'/);
});

test('every squad page carries the roster archetype', () => {
  const block = print.slice(print.indexOf('var pages = squadPages'),
                            print.indexOf('var pages = squadPages') + 700);
  assert.match(block, /class="page page--roster"/);
});

test('a missing headshot still yields a designed card, not a gap', () => {
  const withoutPhoto = ROSTER.filter((p) => !(p.photo || p.image));
  assert.ok(withoutPhoto.length > 0, 'the club genuinely has players without photographs');
  assert.match(print, /sq-ph--none/);
  assert.match(print, /Photo<br>to follow/);
  assert.match(print, /esc\(initials\(p\.name\)\)/);
});

// ── 4 · THE RECONCILIATION, PINNED ──────────────────────────────────────────

test('the two lists are different sizes, and that is correct', () => {
  // If these ever converge it will be because somebody wired the squad page to
  // the match-data source, which is the bug this file exists to prevent.
  assert.strictEqual(ROSTER.length, 26, 'club roster');
  const names = ROSTER.map((p) => p.name);
  assert.strictEqual(new Set(names).size, names.length, 'no duplicate roster entries');
  assert.ok(ROSTER.every((p) => p.id), 'every roster player has an id to join statistics on');
});
