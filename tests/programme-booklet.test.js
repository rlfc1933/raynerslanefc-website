// The print edition: booklet padding, issue number, the embedded cover and
// the export toolbar. The pure decisions live in js/programme-edition.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const E = require('../js/programme-edition.js');
const print = read('programme-print.html');
const exp = read('js/programme-export.js');
const admin = read('admin.html');

// ── booklet padding ────────────────────────────────────────────────────────
for (let n = 17; n <= 24; n++) {
  test('booklet plan for ' + n + ' pages reaches a multiple of four', () => {
    for (const fx of [true, false]) {
      const p = E.bookletPlan(n, { fixtures: fx });
      assert.strictEqual(p.pages % 4, 0);
      assert.strictEqual(p.pages, n + p.add.length);
      assert.ok(p.add.length <= 3);
      assert.strictEqual(new Set(p.add).size, p.add.length, 'no completion page twice');
      if (!fx) assert.ok(!p.add.includes('fixtures'), 'no fixtures page without real fixtures');
    }
  });
}

test('completion pages follow the priority order', () => {
  assert.deepStrictEqual(E.bookletPlan(19, { fixtures: true }).add, ['credits']);
  assert.deepStrictEqual(E.bookletPlan(18, { fixtures: true }).add, ['credits', 'notes']);
  assert.deepStrictEqual(E.bookletPlan(17, { fixtures: true }).add, ['credits', 'notes', 'fixtures']);
  assert.deepStrictEqual(E.bookletPlan(17, { fixtures: false }).add, ['credits', 'notes', 'autographs']);
  assert.deepStrictEqual(E.bookletPlan(20, { fixtures: true }).add, []);
});

test('completion pages go before the back cover; front stays first, back stays last', () => {
  for (let n = 17; n <= 24; n++) {
    const pages = Array.from({ length: n }, (_, i) => 'p' + (i + 1));
    const plan = E.bookletPlan(n, { fixtures: true });
    const out = E.assemble(pages, plan.add);
    assert.strictEqual(out.length % 4, 0);
    assert.strictEqual(out[0], 'p1');
    assert.strictEqual(out[out.length - 1], 'p' + n);
    assert.deepStrictEqual(out.slice(n - 1, n - 1 + plan.add.length), plan.add);
  }
});

test('the completion pages never repeat the membership promotion', () => {
  assert.ok(!E.PRIORITY.some((k) => /member|join|yellow/i.test(k)));
  const from = print.indexOf('function xHead(kick, title)');
  const to = print.indexOf("window.__pxExtra =", from);
  assert.ok(from > -1 && to > from);
  const block = print.slice(from, to);
  assert.ok(!/fan-zone|membership|Join the Yellow Army|Be part of/i.test(block.replace(/\/\*[\s\S]*?\*\//g, '')),
    'the back cover carries the membership call; a completion page must not');
  assert.ok(!/foot\(\)/.test(block), 'the rotating footer carries a membership CTA; completion pages use xFoot()');
});

test('club officers are listed by role only — no phone numbers', () => {
  const from = print.indexOf('// (a) Club information & credits');
  const block = print.slice(from, print.indexOf('// (b) Matchday notes', from));
  assert.ok(!/phone|mobile|tel:|\.phone/i.test(block));
  assert.match(block, /d\.savedBy/, 'Edited by comes from the saved draft, and only when present');
});

// ── issue number ──────────────────────────────────────────────────────────
const FX = [
  { id: 'a', date: '2026-08-01', kickoff: '15:00', isHome: true, season: '2026-27' },
  { id: 'b', date: '2026-08-04', kickoff: '19:45', isHome: false, season: '2026-27' },
  { id: 'c', date: '2026-08-11', kickoff: '19:45', isHome: true, season: '2026-27', status: 'postponed' },
  { id: 'd', date: '2026-08-15', kickoff: '15:00', isHome: true, season: '2026-27' },
  { id: 'e', date: '2026-08-29', kickoff: '15:00', isHome: true, season: '2026-27' },
  { id: 'z', date: '2025-08-29', kickoff: '15:00', isHome: true, season: '2025-26' },
];
test('issue number counts home fixtures this season up to and including this one', () => {
  assert.strictEqual(E.issueNumber(FX, { fixtureId: 'a' }), 1);
  assert.strictEqual(E.issueNumber(FX, { fixtureId: 'd' }), 2, 'the postponed home game issued no programme');
  assert.strictEqual(E.issueNumber(FX, { fixtureId: 'e' }), 3, 'last season does not count');
});
test('issue number is unknown rather than guessed', () => {
  assert.strictEqual(E.issueNumber(FX, { fixtureId: 'b' }), null, 'away match');
  assert.strictEqual(E.issueNumber(FX, { fixtureId: 'nope' }), null, 'not in the list');
  assert.strictEqual(E.issueNumber([], { fixtureId: 'a' }), null, 'no fixtures');
  assert.strictEqual(E.issueNumber(FX, { fixtureId: 'c' }), null, 'postponed fixture');
});
test('the real fixture list gives the Broadfields edition issue 9', () => {
  const fixtures = JSON.parse(read('data/fixtures.json')).fixtures;
  assert.strictEqual(E.issueNumber(fixtures, { fixtureId: 'fwp-578415' }), 9);
});

// ── cover photograph ──────────────────────────────────────────────────────
test('the cover uses only approved club photography', () => {
  const lib = JSON.parse(read('js/studio/library-seed.json')).assets;
  assert.strictEqual(E.coverPhoto({}, lib).src, 'img/ground/tithe-farm-goalmouth-1600.jpg');
  const player = lib.find((a) => a.category === 'player' && a.approval === 'approved');
  assert.strictEqual(E.coverPhoto({ coverAsset: player.id }, lib).src, player.src);
  const unapproved = lib.find((a) => a.approval !== 'approved');
  if (unapproved) assert.notStrictEqual(E.coverPhoto({ coverAsset: unapproved.id }, lib).src, unapproved.src);
  const crest = lib.find((a) => a.category === 'crest');
  assert.notStrictEqual(E.coverPhoto({ coverAsset: crest.id }, lib).src, crest.src, 'a crest is not a photograph');
  assert.strictEqual(E.coverPhoto({ coverPhoto: 'img/x.jpg' }, lib).src, 'img/ground/tithe-farm-goalmouth-1600.jpg', 'an unlisted path is not used');
  assert.strictEqual(E.coverPhoto({ coverPhoto: 'javascript:alert(1)' }, lib).src, 'img/ground/tithe-farm-goalmouth-1600.jpg');
  assert.strictEqual(E.coverPhoto({ coverPhoto: player.src }, lib).src, player.src, 'an approved photo by path is used');
});
test('the cover carries the recurring masthead and issue identity', () => {
  assert.match(print, /<span class="pc__title">The Lane<\/span>/);
  assert.match(print, /Rayners Lane FC &mdash; Official Matchday Programme/);
  assert.match(print, /ProgrammeEdition\.issueNumber\(fixtures, d\)/);
  assert.match(print, /if \(d\.price\) issueBits\.push/, 'a price line only when the edition has one');
  assert.match(print, /<script src="js\/programme-edition\.js/);
});

// ── embed=cover ───────────────────────────────────────────────────────────
test('programme-print has an embed=cover mode that renders page 1 only', () => {
  assert.match(print, /var EMBED = qp\('embed'\) === 'cover';/);
  assert.match(print, /innerHTML = EMBED \? P\[0\] : P\.join\(''\)/);
  assert.match(print, /html\.px-embed \.bar/);
  const from = print.indexOf('function embedDoc()');
  const block = print.slice(from, print.indexOf('function loadProgrammeDoc', from));
  assert.match(block, /rlfc_programme_draft/);
  assert.ok(!/getJSON|fetch\(/.test(block), 'the preview never falls back to a saved or published file');
});
test('the HQ preview is the embedded print cover, debounced', () => {
  const from = admin.indexOf('function prRenderPreview()');
  const block = admin.slice(from, admin.indexOf('// ── CUSTOM PAGES', from));
  assert.match(block, /programme-print\.html\?embed=cover/);
  assert.match(block, /setTimeout\(prRenderPreviewNow, 600\)/);
  assert.match(block, /localStorage\.setItem\('rlfc_programme_draft'/);
  assert.ok(!/RAYNERS LANE FC<\/div>/.test(block), 'the hand-drawn second cover is gone');
});

// ── toolbar ───────────────────────────────────────────────────────────────
test('the toolbar offers Reading PDF and Booklet PDF, and says who imposes', () => {
  assert.match(print, /id="px-pdf"[^>]*>Reading PDF</);
  assert.match(print, /id="px-booklet"[^>]*>Booklet PDF</);
  assert.match(print, /Booklet PDF — 20 pages in reading order; your printer or print dialogue does the booklet imposition \(2-up, saddle stitch\)\./);
  assert.match(print, /RGB colour, no bleed, not press-ready/);
  assert.ok(!/A5/.test(print.slice(print.indexOf('<div class="bar px-bar">'), print.indexOf('<div id="px-banner">'))), 'A5 is not offered');
  assert.match(exp, /build\(doc, 'booklet'\)/);
  assert.match(exp, /renderingMode: 'invisible'/, 'the selectable text layer');
  assert.match(exp, /fonts\/pdf\/Manrope-Regular\.ttf/);
  assert.ok(fs.existsSync(path.join(ROOT, 'fonts/pdf/OFL-Manrope.txt')), 'the font travels with its licence');
});
