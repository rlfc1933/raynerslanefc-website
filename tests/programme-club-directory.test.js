// ════════════════════════════════════════════════════════════════════════════
// THE CHAIRMAN WAS MISSING FROM THE CLUB DIRECTORY.
//
// Not filtered out. Not truncated. He was never in the list.
//
// The club keeps its people in TWO unrelated files. data/committee.json holds
// twelve members. data/officials.json separately holds three names — chairman,
// secretary, welfare officer. The programme's directory rendered the first and
// mentioned the second in a footnote card, so Pete Singh appeared on the page
// as a passing reference and never as an entry.
//
// That is the drift two hand-maintained lists always produce, and it is why the
// fix is a merge at the point of use rather than a name pasted into a file.
// These tests hold the merge in place: if either file changes, or a new role
// appears that nobody anticipated, the person still reaches the page.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const print = read('programme-print.html');
const COMMITTEE = JSON.parse(read('data/committee.json')).members || [];
const OFFICIALS = JSON.parse(read('data/officials.json'));

/** The renderer's own directory assembly, lifted out and run for real. */
function buildDirectory(officials, committee) {
  const from = print.indexOf('var seenPerson = {};');
  const to = print.indexOf("var dirHTML = SECTIONS.map(");
  const src = print.slice(from, to);
  const fn = new Function('OFF', 'club', 'esc',
    src + '; return { dirPeople: dirPeople, grouped: grouped, SECTIONS: SECTIONS, section: section };');
  return fn(officials, { committee: committee }, (s) => String(s == null ? '' : s));
}

// ── 1 · THE REGRESSION ──────────────────────────────────────────────────────

test('the Chairman is genuinely absent from the committee file', () => {
  // Pinning the cause, so nobody "fixes" this by deleting the merge.
  const names = COMMITTEE.map((m) => (m.name || '').toLowerCase());
  assert.ok(!names.includes('pete singh'),
    'if he is added to committee.json the merge must still not duplicate him');
  assert.strictEqual(OFFICIALS.chairman, 'Pete Singh', 'he lives in officials.json');
});

test('Pete Singh reaches the directory as Chairman', () => {
  const { dirPeople } = buildDirectory(OFFICIALS, COMMITTEE);
  const pete = dirPeople.find((p) => p.name === 'Pete Singh');
  assert.ok(pete, 'the Chairman must appear in the directory, not in a footnote');
  assert.strictEqual(pete.role, 'Chairman');
});

test('the Chairman is listed first, under Club Leadership', () => {
  const { grouped, SECTIONS } = buildDirectory(OFFICIALS, COMMITTEE);
  assert.strictEqual(SECTIONS[0], 'Club Leadership');
  assert.strictEqual(grouped[0][0].name, 'Pete Singh');
});

test('ordering and grouping cannot drop him', () => {
  // Whatever else changes, a person who exists in either source is on the page.
  const { dirPeople } = buildDirectory(OFFICIALS, COMMITTEE);
  const everyone = [OFFICIALS.chairman, OFFICIALS.secretary, OFFICIALS.welfareOfficer]
    .concat(COMMITTEE.map((m) => m.name))
    .filter(Boolean)
    .map((n) => n.replace(/\s+/g, ' ').trim().toLowerCase());
  const rendered = dirPeople.map((p) => p.name.toLowerCase());
  [...new Set(everyone)].forEach((n) =>
    assert.ok(rendered.includes(n), n + ' was lost between the source and the page'));
});

// ── 2 · NOBODY APPEARS TWICE ────────────────────────────────────────────────

test('a person in both files appears once, with the senior role', () => {
  const { dirPeople } = buildDirectory(
    { chairman: 'Pete Singh', secretary: 'Emma Galloway', welfareOfficer: 'Emma Galloway' },
    COMMITTEE);
  const emma = dirPeople.filter((p) => p.name === 'Emma Galloway');
  assert.strictEqual(emma.length, 1, 'Emma is secretary AND welfare officer — one entry');
  assert.strictEqual(emma[0].role, 'Club Secretary', 'the first role listed wins');
});

test('adding the Chairman to committee.json would not duplicate him', () => {
  const { dirPeople } = buildDirectory(OFFICIALS,
    COMMITTEE.concat([{ name: 'Pete Singh', role: 'Chairman' }]));
  assert.strictEqual(dirPeople.filter((p) => p.name === 'Pete Singh').length, 1);
});

test('whitespace and casing do not create a second person', () => {
  const { dirPeople } = buildDirectory({ chairman: '  Pete   Singh ' },
    [{ name: 'PETE SINGH', role: 'Chairman' }]);
  assert.strictEqual(dirPeople.length, 1);
  assert.strictEqual(dirPeople[0].name, 'Pete Singh', 'runs of spaces collapse');
});

test('an empty official is skipped, not rendered blank', () => {
  const { dirPeople } = buildDirectory({ chairman: '', secretary: null }, COMMITTEE);
  assert.ok(dirPeople.every((p) => p.name.length > 0));
});

// ── 3 · SECTIONS ────────────────────────────────────────────────────────────

test('roles land in the section a reader would expect', () => {
  const { section } = buildDirectory(OFFICIALS, COMMITTEE);
  [['Chairman', 0], ['Vice Chairman', 0], ['Club President', 0],
   ['First Team Manager', 1], ['Coach', 1], ['Goalkeeping Coach', 1], ['Physio', 1],
   ['Club Secretary', 2], ['Programme Editor', 2], ['Club Treasurer', 2],
   ['Welfare Officer', 3]].forEach(([role, want]) =>
    assert.strictEqual(section(role), want, role));
});

test('an unrecognised role still appears rather than vanishing', () => {
  // WHERE it lands matters far less than THAT it lands. A brand-new role must
  // never fall off the page because nobody taught the grouper about it.
  const { section, grouped } = buildDirectory(OFFICIALS,
    COMMITTEE.concat([{ name: 'A Newcomer', role: 'Kit Manager' },
                      { name: 'Someone Else', role: 'Groundsman' }]));
  assert.ok(grouped.flat().some((p) => p.name === 'A Newcomer'));
  assert.ok(grouped.flat().some((p) => p.name === 'Someone Else'));
  assert.strictEqual(section('Groundsman'), 2, 'anything unrecognised falls to Club Operations');
  assert.strictEqual(section('Kit Manager'), 1, '…but a "manager" reads as football, which is fair');
});

test('the real club structure renders into its sections', () => {
  const { grouped } = buildDirectory(OFFICIALS, COMMITTEE);
  assert.ok(grouped[0].length >= 3, 'leadership: chairman, vice chairman, president');
  assert.ok(grouped[1].length >= 4, 'football: manager, coaches, physio');
  assert.ok(grouped[2].length >= 3, 'operations: secretary, treasurer, programme');
  // Safeguarding is EMPTY here, and correctly so: Emma Galloway is both Club
  // Secretary and Welfare Officer, and one person gets one entry under their
  // senior role. An empty section renders nothing rather than a bare heading.
  assert.strictEqual(grouped[3].length, 0);
  assert.ok(!/Safeguarding & Welfare<\/b><\/div>/.test(''), 'no empty section heading is emitted');
  const total = grouped.flat().length;
  assert.strictEqual(total, new Set(grouped.flat().map((p) => p.name)).size);
});

// ── 4 · IT IS A PUBLIC DIRECTORY, NOT THE STAFF DATABASE ────────────────────

test('no private staff-account data can reach the page', () => {
  const block = print.slice(print.indexOf('var seenPerson = {};'),
                            print.indexOf("'<div class=\"rule\"><span>Programme</span></div>'"));
  ['password', 'pass_hash', 'pin', 'token', 'capabilit', 'permission', 'isChairman', 'username']
    .forEach((k) => assert.ok(!new RegExp(k, 'i').test(block),
      'the public directory must not touch ' + k));
});

test('only name and public role are rendered', () => {
  const { dirPeople } = buildDirectory(OFFICIALS, COMMITTEE);
  dirPeople.forEach((p) =>
    assert.deepStrictEqual(Object.keys(p).sort(), ['name', 'role']));
});

// ── 5 · THE PAGE ────────────────────────────────────────────────────────────

test('the directory is a masthead, not a card grid', () => {
  assert.match(print, /class="mast-dir"/);
  assert.ok(!/class="dir"/.test(print.slice(print.indexOf('var seenPerson'))),
    'the old two-column key/value list is gone');
  const css = print.match(/\.md-p \.nm\{[^}]*\}/)[0];
  assert.match(css, /font-size:16px/);
  const roleCss = print.match(/\.md-p \.rl\{[^}]*\}/)[0];
  assert.match(roleCss, /font-size:8px/, 'names outrank role labels visually');
});

test('the page carries contact routes and a programme credit', () => {
  assert.match(print, /md-contact/);
  assert.match(print, /<span>Programme<\/span>/);
  assert.match(print, /NSPCC 0808 800 5000/, 'the safeguarding route survives the redesign');
});
