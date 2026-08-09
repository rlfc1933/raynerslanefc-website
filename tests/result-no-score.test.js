// ════════════════════════════════════════════════════════════════════════════
// A MATCH WITHOUT A SCORE IS NOT A DRAW.
//
// The homepage announced, to every supporter:
//
//     D  null–null
//     LAST · V LONDON LIONS
//
// Two faults, and the second is the serious one.
//
//   PRINTING A NULL. `resultTile()` concatenated `r.us + '–' + r.them` with no
//   check that either existed.
//
//   INVENTING A RESULT. `wdl()` decided the outcome with
//   `r.us === r.them ? 'd' : 'l'` — and `null === null` is true. So a fixture
//   the registry had marked played, but for which nobody had entered a score,
//   was published as a DRAW. The site was not merely displaying a gap; it was
//   asserting a football fact that had never happened.
//
// The authoritative registry has the 8 August FA Cup tie as `played` with
// `us: null, them: null`. No score exists in any source, so none can be shown —
// the honest output is "Result to follow", and that is what these tests pin.
//
// Note the case that must NOT regress: a real 0–0 is a genuine draw and has to
// keep counting as one. `hasScore` therefore tests for null, never truthiness.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SRC = read('js/club-now.js');

/** The real functions, lifted out and run. */
const F = (() => {
  const grab = (re) => SRC.match(re)[0];
  const body = [
    grab(/function hasScore\(r\) \{[\s\S]*?\n  \}/),
    grab(/function wdl\(r\) \{[\s\S]*?\n  \}/),
    grab(/function chip\(c\) \{[\s\S]*?\n  \}/),
    grab(/function resultTile\(r, label\) \{[\s\S]*?\n  \}/),
  ].join('\n');
  return new Function('esc', body + '; return { hasScore, wdl, chip, resultTile };')(
    (s) => String(s == null ? '' : s));
})();

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// ── 1 · THE BUG ─────────────────────────────────────────────────────────────

test('a played match with no score is never called a draw', () => {
  const r = { us: null, them: null, opponent: 'London Lions' };
  assert.strictEqual(F.wdl(r), '', 'null === null must not resolve to a draw');
  assert.strictEqual(F.chip(F.wdl(r)), '', 'and no letter may be drawn');
});

test('no null ever reaches the page', () => {
  [{ us: null, them: null }, {}, { us: 2 }, { them: 1 },
   { us: undefined, them: undefined }].forEach((r) => {
    const out = F.resultTile(Object.assign({ opponent: 'X' }, r), 'Last');
    assert.ok(!/null|undefined|NaN/.test(out), 'leaked a placeholder: ' + text(out));
  });
});

test('it says what is actually true instead', () => {
  const out = F.resultTile({ us: null, them: null, opponent: 'London Lions' }, 'Last · v London Lions');
  assert.match(text(out), /Result to follow/);
  assert.match(text(out), /London Lions/, 'the fixture is still named');
});

// ── 2 · REAL RESULTS STILL WORK ─────────────────────────────────────────────

test('a win, a defeat and a draw all read correctly', () => {
  assert.strictEqual(F.wdl({ us: 2, them: 1 }), 'w');
  assert.strictEqual(F.wdl({ us: 0, them: 3 }), 'l');
  assert.strictEqual(F.wdl({ us: 1, them: 1 }), 'd');
  assert.match(text(F.resultTile({ us: 2, them: 1, opponent: 'X' })), /W 2–1/);
});

test('a genuine 0–0 is still a draw — the regression this guard could cause', () => {
  const r = { us: 0, them: 0, opponent: 'X' };
  assert.strictEqual(F.hasScore(r), true, 'zero is a score, not an absence');
  assert.strictEqual(F.wdl(r), 'd');
  assert.match(text(F.resultTile(r)), /D 0–0/);
});

test('hasScore tests for null, never for truthiness', () => {
  const src = SRC.match(/function hasScore\(r\) \{[\s\S]*?\n  \}/)[0];
  assert.match(src, /!= null/, 'a truthiness test would discard every 0–0');
  assert.ok(!/if \(!r\.us\)|r\.us &&/.test(src));
});

// ── 3 · FORM CHIPS ──────────────────────────────────────────────────────────

test('a scoreless match contributes nothing to the form guide', () => {
  assert.match(SRC, /results\.filter\(hasScore\)\.slice\(0, 5\)/,
    'a phantom D would otherwise appear in the last-five');
});

test('the form tile is dropped entirely when nothing has been scored', () => {
  assert.match(SRC, /if \(form\) \{/, 'an empty run of chips must not leave a bare label');
  assert.match(SRC, /var scored = results\.filter\(hasScore\)\.length;/,
    '"Last 5" must count matches that actually have a result');
});

// ── 4 · THE AUTHORITATIVE POSITION ──────────────────────────────────────────

test('the club file and the registry disagree, and neither invents a score', () => {
  // Recorded so the next reader understands why the tile says what it says.
  const fx = JSON.parse(read('data/fixtures.json')).fixtures || [];
  const ll = fx.filter((f) => /London Lions/i.test(f.opponent || ''))[0];
  assert.ok(ll, 'the fixture exists');
  assert.strictEqual(ll.us, null, 'no score in the club file');
  assert.strictEqual(ll.them, null);
});

test('no score is fabricated anywhere in the renderer', () => {
  const clean = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  assert.ok(!/us\s*\|\|\s*0|them\s*\|\|\s*0/.test(clean),
    'defaulting a missing score to zero would invent a result');
});

// ── 5 · THE REST OF THE SITE WAS ALREADY SAFE ───────────────────────────────

test('the fixtures page guards its score before printing it', () => {
  const s = read('fixtures.html');
  assert.match(s, /var hasScore = function \(f\) \{ return f\.us != null && f\.them != null; \};/);
  assert.match(s, /if \(f\.us != null && f\.them != null\) \{/);
});

test('the programme reader guards too', () => {
  assert.match(read('js/programme-reader.js'), /\(f\.us != null && f\.them != null\)\s*\n?\s*\?/);
});

test("the homepage list only ever receives scored results", () => {
  // js/main.js concatenates without its own guard, which is safe only because
  // its input is filtered at source. If that filter ever goes, this fails.
  assert.match(read('js/main.js'),
    /var played = sorted\.filter\(function \(f\) \{ return f\.us != null && f\.them != null; \}\);/);
});

// ── 6 · NOTHING ELSE MOVED ──────────────────────────────────────────────────

test('the live fixture facts are untouched', () => {
  const fx = JSON.parse(read('data/fixtures.json')).fixtures || [];
  const h = fx.filter((f) => f.id === 'fwp-578241')[0];
  assert.strictEqual(h.status, 'postponed');
  assert.strictEqual(h.rearrangedDate, null);
  const nb = fx.filter((f) => /New Bradwell/i.test(f.opponent || ''))[0];
  assert.strictEqual(nb.date, '2026-08-15');
});
