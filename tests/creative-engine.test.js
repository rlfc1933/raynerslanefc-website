// ════════════════════════════════════════════════════════════════════════════
// ONE FIXTURE, ONE IDENTITY, EVERY OUTPUT.
//
// The old Studio treated each graphic as an isolated template, so Matchday,
// Half Time, Full Time and the programme cover for the SAME game could look
// like four unrelated pieces of design. A campaign fixes the identity once and
// every state and format inherits it.
//
// These tests hold the RULES. They cannot tell you whether the artwork is any
// good — only dev/creative-gallery.html can do that, which is why it exists and
// why it was built before the Studio UI rather than after.
// ════════════════════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const CC = require(path.join(ROOT, 'js/creative-campaign.js'));
const CR = require(path.join(ROOT, 'js/creative-recipes.js'));
const SVG = require(path.join(ROOT, 'js/creative-svg.js'));
const BP = require(path.join(ROOT, 'js/brand-palette.js'));
const CB = require(path.join(ROOT, 'js/competition-brand.js'));

const brands = JSON.parse(read('data/club-brands.json'));
const comps = JSON.parse(read('data/competitions.json'));
const partners = JSON.parse(read('data/partners.json'));
const FX = JSON.parse(read('data/fixtures.json')).fixtures || [];
CC.configure({ brands, comps, partners, palette: BP, brand: CB });

const by = (n) => FX.filter((f) => f.opponent === n)[0];
const NB = by('New Bradwell St Peter');
const BU = by('Broadfields United');
const HT = FX.filter((f) => f.id === 'fwp-578241')[0];

// ── 1 · CAMPAIGN IDENTITY ───────────────────────────────────────────────────

test('the same fixture yields the same campaign id across every state', () => {
  const ids = ['matchday', 'lineup', 'fulltime', 'postponed'].map((s) => CC.build(NB, s).id);
  assert.strictEqual(new Set(ids).size, 1, 'a fixture has ONE identity: ' + ids.join(', '));
});

test('campaign building is deterministic', () => {
  assert.deepStrictEqual(CC.build(NB, 'matchday'), CC.build(NB, 'matchday'),
    'regenerating next week must produce identical artwork');
});

test('two different opponents produce different visual identities', () => {
  const a = CC.build(NB, 'matchday'), b = CC.build(BU, 'matchday');
  assert.notStrictEqual(a.id, b.id);
  assert.notStrictEqual(a.palette.tokens.awayGlow, b.palette.tokens.awayGlow,
    'New Bradwell must not look like Broadfields');
});

test('home and away swap the clubs, never the master brand', () => {
  const home = CC.build(NB, 'matchday');   // Rayners Lane at home
  const away = CC.build(BU, 'matchday');   // away at Broadfields
  assert.strictEqual(home.home.name, 'Rayners Lane');
  assert.strictEqual(away.away.name, 'Rayners Lane');
  assert.strictEqual(home.palette.tokens.accent, away.palette.tokens.accent,
    'the Lane yellow is the signal colour in both');
});

// ── 2 · NO INVENTED FOOTBALL ────────────────────────────────────────────────

test('no score means no outcome — never a draw inferred from two nulls', () => {
  assert.strictEqual(CC.outcome({ us: null, them: null }), null);
  assert.strictEqual(CC.outcome({}), null);
  assert.strictEqual(CC.build(NB, 'fulltime').score, null);
});

test('a real 0-0 is still a draw', () => {
  assert.strictEqual(CC.outcome({ us: 0, them: 0 }), 'draw');
});

test('win, draw and loss are distinguished', () => {
  assert.strictEqual(CC.outcome({ us: 3, them: 1 }), 'win');
  assert.strictEqual(CC.outcome({ us: 0, them: 2 }), 'loss');
});

// ── 3 · ART DIRECTION FOLLOWS THE FOOTBALL ──────────────────────────────────

test('a called-off match outranks everything else', () => {
  assert.strictEqual(CR.pick(CC.build(HT, 'matchday')).key, 'URGENT_UPDATE',
    'the graphic\'s job changed from promoting a match to stopping a journey');
});

test('win, draw and defeat get different treatments', () => {
  const k = (s) => CR.pick(CC.build(Object.assign({}, NB, { us: s[0], them: s[1] }), 'fulltime')).key;
  assert.strictEqual(k([3, 1]), 'VICTORY');
  assert.strictEqual(k([1, 1]), 'DRAW_EDITORIAL');
  assert.strictEqual(k([0, 2]), 'DEFEAT');
  assert.strictEqual(new Set([k([3, 1]), k([1, 1]), k([0, 2])]).size, 3);
});

test('a defeat is never celebratory', () => {
  const d = CR.recipes.DEFEAT, v = CR.recipes.VICTORY;
  assert.ok(d.layout.muted, 'defeat is stated, not dramatised');
  assert.ok(d.atmos.vignette > v.atmos.vignette, 'darker');
  assert.strictEqual(d.atmos.beams.length, 0, 'no celebratory light');
});

test('an FA competition feels different from a league game', () => {
  assert.strictEqual(CR.pick(CC.build(NB, 'matchday')).key, 'CUP_NIGHT');
  assert.notStrictEqual(CR.pick(CC.build(BU, 'matchday')).key, 'CUP_NIGHT');
});

test('an unconfirmed opponent palette falls back to a Lane-led treatment', () => {
  const w = by('Wallingford & Crowmarsh');
  if (!w) return;
  const c = CC.build(w, 'matchday');
  assert.strictEqual(c.palette.oppUsable, false);
  assert.match(CR.pick(c).why, /unconfirmed/);
});

test('every auto choice can explain itself', () => {
  ['matchday', 'fulltime', 'postponed', 'lineup', 'motm'].forEach((s) => {
    const p = CR.pick(CC.build(NB, s));
    assert.ok(p.why && p.why.length > 8, s + ' must justify its recipe');
  });
});

// ── 4 · SPONSORS RESOLVE WITHOUT ANYONE REMEMBERING THE RULE ────────────────

test('home presents HDL, away presents McCafferty\'s — automatically', () => {
  assert.strictEqual(CC.build(NB, 'matchday').sponsors.presenter.id, 'hdl');
  assert.strictEqual(CC.build(BU, 'matchday').sponsors.presenter.id, 'mccafferty');
});

test('the persistent three are on every post', () => {
  [NB, BU].forEach((f) => {
    const ids = CC.build(f, 'matchday').sponsors.rail.map((r) => r.id);
    ['ashwood', 'king', 'ahiq'].forEach((id) => assert.ok(ids.includes(id), id));
  });
});

test('the presenter is not printed twice', () => {
  const c = CC.build(NB, 'matchday');
  assert.ok(!c.sponsors.rail.map((r) => r.id).includes(c.sponsors.presenter.id),
    'it has its own prominent slot; repeating it in the rail destroys the hierarchy');
});

// ── 5 · FORMATS ARE COMPOSED, NOT CROPPED ───────────────────────────────────

test('all four deliverable sizes are exact', () => {
  assert.deepStrictEqual([CC.format('story').w, CC.format('story').h], [1080, 1920]);
  assert.deepStrictEqual([CC.format('portrait').w, CC.format('portrait').h], [1080, 1350]);
  assert.deepStrictEqual([CC.format('square').w, CC.format('square').h], [1080, 1080]);
  assert.deepStrictEqual([CC.format('x').w, CC.format('x').h], [1600, 900]);
});

test('Story reserves the zones Instagram covers with its own UI', () => {
  const s = CC.format('story');
  assert.ok(s.safeTop >= 200 && s.safeBottom >= 300,
    'the commonest way a good graphic fails in the wild');
});

test('each format gets its own atmosphere, not one plate rescaled', () => {
  const c = CC.build(NB, 'matchday');
  const story = CR.spec(c, CC.format('story'));
  const x = CR.spec(c, CC.format('x'));
  assert.notStrictEqual(story.fog, x.fog, 'a wide frame shows more, so it needs less');
  assert.ok(story.h > story.w && x.w > x.h);
});

// ── 6 · THE ATMOSPHERE LAYER ────────────────────────────────────────────────

test('the SVG plate uses the filter set the old engine never touched', () => {
  const svg = SVG.plate(CR.spec(CC.build(NB, 'matchday'), CC.format('square')));
  ['feTurbulence', 'feGaussianBlur', 'feColorMatrix', 'radialGradient', 'linearGradient']
    .forEach((f) => assert.ok(svg.includes(f), 'missing ' + f));
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
});

test('the same campaign always renders the same grain', () => {
  const spec = CR.spec(CC.build(NB, 'matchday'), CC.format('square'));
  assert.strictEqual(SVG.plate(spec), SVG.plate(spec), 'no randomness may reach artwork');
});

test('atmosphere never contains a fact', () => {
  const svg = SVG.plate(CR.spec(CC.build(NB, 'matchday'), CC.format('square')));
  ['New Bradwell', 'Rayners', 'Isuzu', '<text', '<image']
    .forEach((s) => assert.ok(!svg.includes(s),
      'crests, names and copy are protected DOM layers, never generated: ' + s));
});

// ── 7 · THE RENDERER BOUNDARY ───────────────────────────────────────────────

test('the creative model knows nothing about html2canvas', () => {
  ['js/creative-campaign.js', 'js/creative-recipes.js', 'js/creative-svg.js'].forEach((f) => {
    assert.ok(!/html2canvas|getContext|document\./.test(read(f).replace(/\/\*[\s\S]*?\*\//g, ' ')),
      f + ' must survive a renderer swap');
  });
});

test('long club names are handled, not hoped about', () => {
  const css = read('css/creative-engine.css');
  assert.match(css, /overflow-wrap: break-word/);
  assert.ok(/New Bradwell St Peter|Wallingford/.test(css), 'the awkward cases are named');
});
