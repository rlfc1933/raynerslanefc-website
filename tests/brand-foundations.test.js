// ════════════════════════════════════════════════════════════════════════════
// AN UNCONFIRMED COLOUR IS NOT A CLUB'S COLOUR.
//
// These palettes get published under the Rayners Lane badge on graphics that
// name another club. Getting them wrong is the visual equivalent of misspelling
// the opponent, so the registry treats a machine suggestion and a human-
// confirmed palette as different kinds of thing, and only one of them can reach
// artwork.
//
// THE CREST SAMPLER IS GOOD, AND STILL NOT GOOD ENOUGH TO PUBLISH.
// Run over the real 21 badges, the first version got the ORDER wrong on a third
// of them: Harefield United (red on white) returned a near-white primary,
// Abingdon returned a murky brown, Ardley produced a mint that exists only as
// anti-aliasing. Retuning — lightness ceiling down to 0.78, and scoring on
// saturation raised to a power so vividness beats area — fixed those.
//
// But New Bradwell St Peter still comes back sky-blue-primary / claret-second,
// which is exactly inverted. The colours are right; the ranking is wrong. No
// amount of tuning reliably fixes that, because which of a club's two colours
// is "primary" is a fact about the club, not about its badge. Hence: suggest,
// then a human confirms. That one club is the whole argument, so it is pinned.
//
// Two badges (Amersham Town, Wallingford & Crowmarsh) return nothing at all.
// That is the sampler being honest about a monochrome crest rather than
// inventing a colour from anti-aliasing, and it is the correct behaviour.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const BRANDS = JSON.parse(read('data/club-brands.json'));
const PARTNERS = JSON.parse(read('data/partners.json'));
const COMPS = JSON.parse(read('data/competitions.json'));
const FIXTURES = JSON.parse(read('data/fixtures.json')).fixtures || [];
const BP = require(path.join(ROOT, 'js/brand-palette.js'));

BP.setRegistry(BRANDS);

// ── 1 · THE REGISTRY COVERS THE SEASON ──────────────────────────────────────

test('every opponent we actually play has a brand record', () => {
  const opponents = [...new Set(FIXTURES.map((f) => f.opponent).filter(Boolean))];
  const missing = opponents.filter((n) => !BP.find(n));
  assert.deepStrictEqual(missing, [], 'unregistered opponents: ' + missing.join(', '));
});

test('visual metadata is kept out of the factual opponent file', () => {
  // opponents.json is human-verified football fact. Inferred design data must
  // never leak into it, or a guessed colour acquires the authority of a checked
  // founding date.
  const ops = read('data/opponents.json');
  assert.ok(!/primary|secondary|#[0-9A-Fa-f]{6}/.test(ops),
    'colour data must live in club-brands.json, not opponents.json');
});

test('Rayners Lane is the master brand, verified and locked', () => {
  const lane = BP.resolve('Rayners Lane');
  assert.strictEqual(lane.verified, true);
  assert.strictEqual(lane.locked, true);
  assert.strictEqual(lane.primary, '#FFD100');
  assert.strictEqual(lane.secondary, '#1A5C32');
});

// ── 2 · A SUGGESTION CANNOT REACH ARTWORK ───────────────────────────────────

test('an unverified club resolves to the neutral fallback, not its suggestion', () => {
  const c = BRANDS.clubs.find((x) => x.suggestion && !x.verified);
  assert.ok(c, 'there should still be unconfirmed clubs to guard');
  const r = BP.resolve(c.name);
  assert.strictEqual(r.usable, false, 'unconfirmed palettes must not be usable');
  assert.notStrictEqual(r.primary, c.suggestion.primary,
    'the suggestion must not leak through as the resolved colour');
  assert.strictEqual(r.primary, BRANDS._fallback.primary);
  assert.match(r.reason, /confirmed|palette/);
});

test('suggestions are stored apart from the live palette', () => {
  BRANDS.clubs.forEach((c) => {
    if (c.id === 'rayners-lane') return;
    if (c.suggestion && !c.verified) {
      assert.strictEqual(c.primary, null,
        c.id + ': a suggestion must never be written into the live field');
    }
  });
});

test('a confirmed palette resolves and is usable', () => {
  const nb = BP.resolve('New Bradwell St Peter');
  assert.strictEqual(nb.usable, true);
  assert.strictEqual(nb.verified, true);
  assert.strictEqual(nb.primary, '#A73666', 'claret, per the owner-supplied brief');
  assert.strictEqual(nb.secondary, '#97D5E1', 'sky blue');
});

test('the sampler inverted New Bradwell, and that is recorded', () => {
  // The single clearest justification for the confirm step.
  const nb = BRANDS.clubs.find((c) => c.id === 'new-bradwell-st-peter');
  assert.ok(nb.locked, 'a human-confirmed palette should be locked');
  assert.match(nb.provenance, /Owner-supplied/);
  assert.match(nb.notes, /other way round|inverted/i);
});

test('a club with no confident sample says so rather than guessing', () => {
  const mono = BRANDS.clubs.filter((c) => c.id !== 'rayners-lane' && c.suggestion === null);
  assert.ok(mono.length >= 1, 'monochrome crests should yield no suggestion');
  mono.forEach((c) => assert.match(c.notes || '', /monochrome|low-chroma/i,
    c.id + ' should explain why there is no suggestion'));
});

test('an unknown club is handled without inventing anything', () => {
  const r = BP.resolve('Some Club That Does Not Exist');
  assert.strictEqual(r.usable, false);
  assert.strictEqual(r.primary, BRANDS._fallback.primary);
});

test('name matching survives punctuation and suffixes', () => {
  ['Penn & Tylers Green', 'penn-and-tylers-green', 'Penn and Tylers Green FC']
    .forEach((n) => assert.ok(BP.find(n), 'should resolve: ' + n));
});

// ── 3 · DERIVED TOKENS, AND WHO STAYS DOMINANT ──────────────────────────────

test('Rayners Lane supplies the key light; the opponent only counter-lights', () => {
  const t = BP.tokens(BP.resolve('Rayners Lane'), BP.resolve('New Bradwell St Peter'));
  assert.ok(t.homeGlow && t.awayGlow);
  assert.strictEqual(t.accent, '#FFD100', 'the accent stays the club yellow');
  assert.strictEqual(t.bed, '#1A5C32', 'the deep green bed is what makes it a Lane graphic');
});

test('a dark opponent colour is lifted until it can be seen, not swapped', () => {
  // Navy on near-black is invisible. Lighten the same hue rather than
  // substituting a colour that is not theirs.
  const navy = '#132654';
  const lifted = BP.glowable(navy, '#080808');
  assert.ok(BP.contrast(lifted, '#080808') >= 2.4, 'must become visible');
  const a = BP._rgb2hsl(...Object.values(BP._hex2rgb(navy)));
  const b = BP._rgb2hsl(...Object.values(BP._hex2rgb(lifted)));
  assert.ok(Math.abs(a.h - b.h) < 12, 'hue must be preserved — it is still their colour');
});

test('tokens flag when the opponent palette is not usable', () => {
  const t = BP.tokens(BP.resolve('Rayners Lane'), BP.resolve('Amersham Town'));
  assert.strictEqual(t.oppUsable, false,
    'the engine needs to know to fall back to a neutral treatment');
});

test('headline text is readable on the ground it sits on', () => {
  assert.ok(BP.contrast('#F5F3ED', '#080808') >= 4.5);
  assert.strictEqual(BP.readableOn('#FFD100'), '#0d0d0d', 'black on yellow');
  assert.strictEqual(BP.readableOn('#1A5C32'), '#FFFFFF', 'white on green');
});

// ── 4 · SPONSORS — THE CURRENT COMMERCIAL REQUIREMENT ───────────────────────

test('The King, Denham is in the persistent rail', () => {
  ['home', 'away', 'neutral'].forEach((ctx) =>
    assert.ok(PARTNERS.contexts[ctx].includes('king'),
      'owner-confirmed Aug 2026: King Denham sits in the rail on every post (' + ctx + ')'));
});

test('the three persistent partners appear in every context', () => {
  ['home', 'away', 'neutral'].forEach((ctx) => {
    ['ashwood', 'king', 'ahiq'].forEach((id) =>
      assert.ok(PARTNERS.contexts[ctx].includes(id), id + ' missing from ' + ctx));
  });
});

test('the superseded configuration is recorded, not silently dropped', () => {
  assert.match(PARTNERS._historicalNote, /SUPERSEDED/);
  assert.match(PARTNERS._historicalNote, /King, Denham/);
});

test('home presents HDL, away presents McCafferty\'s', () => {
  assert.strictEqual(PARTNERS.presents.home, 'hdl');
  assert.strictEqual(PARTNERS.presents.away, 'mccafferty');
});

test('every sponsor asset the rail references exists on disk', () => {
  Object.entries(PARTNERS.sponsors).forEach(([id, s]) => {
    ['colour', 'white'].forEach((k) => {
      if (!s[k]) return;
      assert.ok(fs.existsSync(path.join(ROOT, s[k])), id + '.' + k + ' missing: ' + s[k]);
    });
  });
});

test('the stale Ashwood upload path is gone', () => {
  const s = JSON.parse(read('data/sponsors.json'));
  const a = (s.sponsors || s).find((x) => /Ashwood/i.test(x.name));
  assert.ok(!/img\/uploads\//.test(a.logo), 'must not point at a vanished upload');
  assert.ok(fs.existsSync(path.join(ROOT, a.logo)), 'and the canonical asset must exist');
});

// ── 5 · COMPETITIONS ────────────────────────────────────────────────────────

test('the league artwork already in the repository is wired up', () => {
  const l = COMPS.competitions.find((c) => c.id === 'ccl-prem-north');
  assert.ok(fs.existsSync(path.join(ROOT, l.logo)), 'league mark should resolve');
  assert.ok(fs.existsSync(path.join(ROOT, l.sponsorLogo)), 'Cherry Red Records should resolve');
  assert.strictEqual(l.sponsorName, 'Cherry Red Records');
});

test('the FA competitions carry the artwork the club was issued', () => {
  // This test used to assert the marks were ABSENT and awaiting issue. The club
  // has since supplied both, so it now guards the thing that actually matters:
  // that what is on disk is the supplied file and nobody has substituted a
  // traced or downloaded lookalike for it.
  ['fa-cup', 'fa-vase'].forEach((id) => {
    const c = COMPS.competitions.find((x) => x.id === id);
    assert.strictEqual(c.logoStatus, 'official-supplied');
    assert.match(c.logo, /^img\/competitions\//, 'issued artwork lives in one place');
    assert.ok(fs.existsSync(path.join(ROOT, c.logo)), id + ' artwork missing from disk');
    assert.match(c.logoNote, /supplied by the club/i, 'provenance must be recorded');
    assert.match(c.logoNote, /Never redraw|Never redraw, recolour|reinterpret|resolution/i);
  });
});

test('the Vase mark is vector, which the programme needs', () => {
  const v = COMPS.competitions.find((x) => x.id === 'fa-vase');
  assert.match(v.logo, /\.svg$/, 'A4 print cannot use a small raster mark');
});

test('a missing official mark is a permitted state, not a broken one', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'img/competitions/README.txt')),
    'the drop-in location should be documented where someone will find it');
  assert.match(read('img/competitions/README.txt'), /not a broken state/);
});

test('the county FA badge is not mistaken for a competition mark', () => {
  const m = COMPS.competitions.find((c) => c.id === 'middlesex-senior-cup');
  assert.strictEqual(m.logo, null);
  assert.match(m.logoNote, /NOT the competition logo/);
});
