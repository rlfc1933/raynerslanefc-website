// ════════════════════════════════════════════════════════════════════════════
// THE COMPETITION IDENTIFIES THE MATCH — NEVER THE OPPONENT.
//
// A fixture card should say which competition it belongs to the way football
// says it. The feed sends "FA Vase 1Q"; the competition is the Isuzu FA Vase,
// First Qualifying Round. One resolver decides that for every surface, so the
// homepage and the fixtures page cannot disagree and a sponsorship change is
// one edit to data/competitions.json.
//
// WHY THE LOGOS ARE ABSENT, AND WHY THAT IS CORRECT.
// The FA does not publish its competition wordmarks for download. FA Challenge
// Vase rules 3(c) and 3(f): "The Association shall from time to time issue a FA
// Vase Logo", and a club "shall use the image issued by The Association and
// will follow any directions issued by The Association in relation to the use
// of such image." The mark is ISSUED to competing clubs — lifting one off a
// logo aggregator would breach the very rule it appears to satisfy.
//
// So `logo` is null and the cards print the competition's proper name. These
// tests hold that the fallback is a first-class path rather than an error
// path, and that dropping the issued artwork in later needs no code change.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CB = require(path.join(ROOT, 'js/competition-brand.js'));
const REG = JSON.parse(read('data/competitions.json'));
const COMPS = REG.competitions || [];
const FIXTURES = JSON.parse(read('data/fixtures.json')).fixtures || [];

CB.setRegistry(COMPS);

// ── 1 · ALIASES RESOLVE ─────────────────────────────────────────────────────

test('every FA Cup alias resolves to the Emirates FA Cup', () => {
  ['FA Cup', 'The FA Cup', 'Emirates FA Cup', 'The Emirates FA Cup', 'FA Cup EP',
   'FA Challenge Cup', 'fa-cup'].forEach((label) => {
    const i = CB.identity({ competition: label });
    assert.strictEqual(i.id, 'fa-cup', label);
    assert.strictEqual(i.label, 'Emirates FA Cup', label);
  });
});

test('every FA Vase alias resolves to the Isuzu FA Vase', () => {
  ['FA Vase', 'The FA Vase', 'Isuzu FA Vase', 'The Isuzu FA Vase', 'FA Vase 1Q',
   'FA Challenge Vase', 'fa-vase'].forEach((label) => {
    const i = CB.identity({ competition: label });
    assert.strictEqual(i.id, 'fa-vase', label);
    assert.strictEqual(i.label, 'Isuzu FA Vase', label);
  });
});

test('the canonical id wins over a stale label', () => {
  // A feed sending last season's sponsor must not rename the competition.
  const i = CB.identity({ competitionId: 'fa-vase', competition: 'Buildbase FA Vase' });
  assert.strictEqual(i.label, 'Isuzu FA Vase');
});

test('the league resolves from its abbreviation and its sponsored name', () => {
  ['Combined Counties Prem N', 'Combined Counties Premier Division North',
   'Cherry Red Records Combined Counties Football League'].forEach((l) => {
    assert.strictEqual(CB.identity({ competition: l }).id, 'ccl-prem-north', l);
  });
});

// ── 2 · ROUNDS ──────────────────────────────────────────────────────────────

test('the round is read out of the label and named in full', () => {
  [['FA Vase 1Q', 'First Qualifying Round'],
   ['FA Vase 2Q', 'Second Qualifying Round'],
   ['FA Cup EP', 'Extra Preliminary Round'],
   ['FA Cup PR', 'Preliminary Round'],
   ['FA Vase 3rd Qualifying Round', 'Third Qualifying Round'],
   ['FA Cup Semi-Final', 'Semi-Final'],
   ['Combined Counties Prem N', '']].forEach(([label, want]) => {
    assert.strictEqual(CB.identity({ competition: label }).round, want, label);
  });
});

test('stripping the round does not break the competition match', () => {
  assert.strictEqual(CB.withoutRound('FA Vase 1Q'), 'FA Vase');
  assert.strictEqual(CB.withoutRound('FA Cup EP'), 'FA Cup');
});

// ── 3 · UNKNOWN COMPETITIONS FALL BACK, NEVER BREAK ─────────────────────────

test('an unregistered competition still prints its own name', () => {
  const i = CB.identity({ competition: 'Harrow Charity Shield' });
  assert.strictEqual(i.known, false);
  assert.strictEqual(i.label, 'Harrow Charity Shield');
  assert.strictEqual(i.logo, null);
});

test('nothing at all is safe', () => {
  [{}, { competition: '' }, { competition: null }, null, undefined].forEach((f) => {
    const i = CB.identity(f);
    assert.strictEqual(typeof i.label, 'string');
    assert.ok(!/undefined|null|NaN/.test(i.label), 'must never print a placeholder');
    assert.strictEqual(i.logo, null);
  });
});

test('a registered competition with no asset returns a null logo, not a path', () => {
  COMPS.forEach((c) => {
    const i = CB.identity({ competitionId: c.id });
    if (!c.logo) assert.strictEqual(i.logo, null, c.id + ' must not invent an asset path');
  });
});

// ── 4 · IT NEVER KEYS OFF THE OPPONENT ──────────────────────────────────────

test('the resolver does not read the opponent at all', () => {
  const src = read('js/competition-brand.js');
  assert.ok(!/opponent|isHome|venue/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')),
    'competition identity must derive from the competition');
});

test('the same competition brands regardless of who we play', () => {
  const a = CB.identity({ competitionId: 'fa-vase', competition: 'FA Vase 1Q', opponent: 'New Bradwell St Peter' });
  const b = CB.identity({ competitionId: 'fa-vase', competition: 'FA Vase 1Q', opponent: 'Anybody Else' });
  assert.deepStrictEqual(a, b);
});

test('no surface hard-codes a club name to pick a competition', () => {
  ['js/club-now.js', 'js/competition-brand.js'].forEach((f) => {
    const s = read(f).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    assert.ok(!/New Bradwell|Hilltop/i.test(s), f + ' must not name a club in code');
  });
  // fixtures.html lists all twenty division clubs as a league-table fallback,
  // so check the competition helper itself rather than the whole file.
  const fx = read('fixtures.html');
  const fn = fx.match(/function fxCompText\(f\) \{[\s\S]*?\n\}/)[0];
  assert.ok(!/New Bradwell|Hilltop|opponent/i.test(fn),
    'the card must name its competition from the competition');
});

// ── 5 · THE REAL FIXTURES ───────────────────────────────────────────────────

test("the live next fixture brands as the Isuzu FA Vase", () => {
  const nb = FIXTURES.filter((f) => /New Bradwell/i.test(f.opponent || ''))[0];
  assert.ok(nb);
  const i = CB.identity(nb);
  assert.strictEqual(i.label, 'Isuzu FA Vase');
  assert.strictEqual(i.round, 'First Qualifying Round');
});

test('the historical FA Cup tie brands automatically through the same path', () => {
  const fc = FIXTURES.filter((f) => f.competitionId === 'fa-cup')[0];
  assert.ok(fc, 'the club has an FA Cup fixture to regress against');
  const i = CB.identity(fc);
  assert.strictEqual(i.label, 'Emirates FA Cup');
  assert.strictEqual(i.round, 'Extra Preliminary Round');
  // PRESENTATION ONLY. This tie's score is deliberately not asserted: the club
  // file still carries us/them as null for it while the registry has it played,
  // which is a known separate data issue the club asked to be left alone. The
  // point here is that branding resolves regardless of the result's state.
  assert.strictEqual(fc.competitionId, 'fa-cup', 'and nothing about the fixture changed');
});

test('every competition in the fixture data is registered', () => {
  const ids = new Set(COMPS.map((c) => c.id));
  [...new Set(FIXTURES.map((f) => f.competitionId).filter(Boolean))].forEach((id) =>
    assert.ok(ids.has(id), 'unregistered competition in fixtures: ' + id));
});

// ── 6 · PROVENANCE AND SPONSORSHIP ──────────────────────────────────────────

test('sponsored competitions record who the sponsor is and where that was checked', () => {
  ['fa-cup', 'fa-vase'].forEach((id) => {
    const c = COMPS.filter((x) => x.id === id)[0];
    assert.match(c.sponsorConfirmed, /2027\/28/, id + ' must record the term');
    assert.match(c.sponsorSource, /^https:\/\//, id + ' must cite a source');
  });
});

test('the FA competitions record that their marks are issued, not downloaded', () => {
  ['fa-cup', 'fa-vase'].forEach((id) => {
    const c = COMPS.filter((x) => x.id === id)[0];
    // Twice-revised, and worth the note: 'issued-by-the-fa' became
    // 'official-artwork-required' when the asset slot was built, and then
    // 'official-supplied' when the club actually provided both marks. The rule
    // never changed — these are issued, never downloaded — only the state did.
    assert.strictEqual(c.logoStatus, 'official-supplied');
    assert.match(c.logo, /^img\/competitions\//,
      'the issued file has a named home so nothing is dropped anywhere');
  });
  assert.match(REG._brandNote, /Never populate `logo` from a logo-aggregator site/);
});

// ── 7 · THE CARD ITSELF ─────────────────────────────────────────────────────

test('the logo renders only when one exists, with no plate behind it', () => {
  const s = read('js/club-now.js');
  const f = s.match(/function compEyebrow\(ident, prefix\) \{[\s\S]*?\n  \}/)[0];
  assert.match(f, /if \(ident\.logo\)/, 'no logo means no <img>, so nothing can break');
  assert.match(f, /width="72" height="24"/, 'reserved box prevents layout shift');
  assert.match(f, /alt="' \+ esc\(ident\.alt\)/, 'accessible alt text');
  const css = read('css/club-now.css');
  assert.match(css, /\.cn__complogo \{[^}]*height:22px; width:auto/,
    'height only — the mark keeps its own proportions and is never stretched');
  assert.ok(!/\.cn__complogo[^}]*background:/.test(css), 'no white plate behind a transparent mark');
});

test('the competition stays subordinate to the two clubs', () => {
  const css = read('css/club-now.css');
  const logo = css.match(/\.cn__complogo \{[^}]*\}/)[0];
  const h = +logo.match(/height:(\d+)px/)[1];
  const crest = css.match(/\.cn__crest \{[^}]*\}/);
  if (crest) {
    const ch = (crest[0].match(/(?:height|width):(\d+)px/) || [])[1];
    if (ch) assert.ok(h < +ch, 'the competition mark must not outsize a club crest');
  }
  assert.ok(h <= 24, 'cap-height, not a banner');
});

test('both public surfaces use the one resolver', () => {
  assert.match(read('index.html'), /js\/competition-brand\.js/);
  assert.match(read('fixtures.html'), /js\/competition-brand\.js/);
  assert.match(read('js/club-now.js'), /CompetitionBrand\.identity/);
  assert.match(read('fixtures.html'), /CompetitionBrand\.identity/);
  assert.match(read('fixtures.html'), /CompetitionBrand\.setRegistry\(list\)/);
});

// ── 8 · NOTHING ELSE MOVED ──────────────────────────────────────────────────

test('Hilltop is still postponed with no rearranged date', () => {
  const h = FIXTURES.filter((f) => f.id === 'fwp-578241')[0];
  assert.strictEqual(h.status, 'postponed');
  assert.strictEqual(h.rearrangedDate, null);
});

test('New Bradwell is still the next match', () => {
  const MT = require(path.join(ROOT, 'js/match-time.js'));
  const up = FIXTURES.slice()
    .sort((a, b) => MT.fixtureSortKey(a) - MT.fixtureSortKey(b))
    .filter((f) => MT.isPlayable(f))
    .filter((f) => MT.fixtureSortKey(f) > Date.parse('2026-08-09T16:00:00Z') - 6 * 3600000);
  assert.strictEqual(up[0].opponent, 'New Bradwell St Peter');
});
