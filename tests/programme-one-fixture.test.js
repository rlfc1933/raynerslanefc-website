// ════════════════════════════════════════════════════════════════════════════
// ONE PROGRAMME, ONE FIXTURE — the defect Russell hit, held shut.
//
// THE FAILURE
// -----------
// The admin cover preview rendered from the FORM the operator was typing into.
// programme-print.html rendered from the SAVED FILE. Nothing reconciled them.
// So the preview showed "Rayners Lane v Hilltop, Tue 11 Aug, 7:45 PM" while the
// print edition showed "TBC / 2026-27 / 3:00 PM" and no crest — because
// data/programme.json still held opponent:'' and no date, and every one of
// those strings is a fallback:
//
//     programme-print.html   var opp = d.opponent || 'TBC'
//     programme-print.html   esc(shortDate(d.date)||'2026-27')
//     programme-print.html   to12()  →  return t||'3:00 PM'
//     crest lookup matches on `opp`, which was now 'TBC' → initialsBadge
//
// The panel told the operator to "Press Publish first". That was a workaround
// for exactly this — publishing happened to write the file — and it taught the
// committee that the only way to get a PDF was to put the programme on the
// public website. Russell was publishing Tuesday's programme in order to print
// it.
//
// SECOND FAILURE
// --------------
// prSeedFromNextFixture only filled the form when it was empty, and otherwise
// left whatever was last saved. Open the panel after a Wallingford programme
// and it still said Wallingford, with no obvious way to move on.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const admin = read('admin.html');
const print = read('programme-print.html');

// ── 1 · ONE SNAPSHOT, BUILT ONCE ────────────────────────────────────────────

test('the programme is built in exactly one place', () => {
  assert.match(admin, /function prBuildDoc\(\)/,
    'preview, save and print must not each assemble their own idea of the programme');
  const save = admin.match(/function saveProgramme\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(save, /var data = prBuildDoc\(\)/, 'save must use the shared builder');
});

test('the selected fixture is carried with the programme', () => {
  const b = admin.match(/function prBuildDoc\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(b, /data\.fixtureId = gv\('pr-fixture'\)/,
    'without a fixture id the only link to a match was a date+opponent string');
  assert.match(b, /isHome/, 'home/away must travel with the programme too');
});

test('every field the print edition falls back on is actually saved', () => {
  // These five are the ones that produced TBC / 2026-27 / 3:00 PM.
  const b = admin.match(/function prBuildDoc\(\) \{[\s\S]*?\n\}/)[0];
  ['opponent', 'date', 'kickoff', 'venue', 'competition'].forEach((k) => {
    assert.ok(new RegExp(k + ':\\s*gv\\(').test(b), `${k} is not saved`);
  });
  assert.match(b, /oppCrest: prCurrentOppCrest\(\)/, 'the crest must be saved too');
});

// ── 2 · PRINT AND PREVIEW SEE THE SAME THING ────────────────────────────────

test('print is handed the draft the operator is looking at', () => {
  assert.match(admin, /function prHandOverDraft\(\)/);
  const h = admin.match(/function prHandOverDraft\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(h, /prBuildDoc\(\)/, 'the hand-off must be the same snapshot');
  assert.match(h, /rlfc_programme_draft/);
  const p = admin.match(/function prPrintEdition\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(p, /prHandOverDraft\(\)/);
  assert.match(p, /draft=1/, 'the print page must be told to use the draft');
});

test('the print page prefers the handed-over draft over the saved file', () => {
  assert.match(print, /function draftSnapshot\(\)/);
  const l = print.match(/function loadProgrammeDoc\(\)\{[\s\S]*?\n  \}/)[0];
  const order = [l.indexOf('draftSnapshot'), l.indexOf('paramId'), l.indexOf("getJSON('programme')")];
  assert.ok(order[0] > -1 && order[0] < order[1],
    'the draft must be consulted before the archive or the saved file');
});

test('a stale hand-off is ignored rather than printed', () => {
  const d = print.match(/function draftSnapshot\(\)\{[\s\S]*?\n  \}/)[0];
  assert.match(d, /30 \* 60 \* 1000/, 'an old snapshot would silently print the wrong match');
  assert.match(d, /savedAt/);
});

test('the draft carries the fixture, so print cannot recompute it', () => {
  // Once a programme has a fixture, no downstream page may ask
  // "what is the next fixture?" again.
  // The whole cover block, not just its first few lines.
  const r = print.slice(print.indexOf('function render(d, crests'),
                        print.indexOf('/* 7 — LEAGUE TABLE */'));
  assert.match(r, /d\.opponent/, 'the opponent comes from the document');
  assert.match(r, /shortDate\(d\.date\)/, 'so does the date');
  assert.match(r, /d\.kickoff/, 'and the kick-off');
  assert.ok(!/nextFixture/.test(r), 'the cover must never recompute the next fixture');
});

// ── 3 · PRINTING IS NOT PUBLISHING ──────────────────────────────────────────

test('the panel no longer tells anybody to publish before printing', () => {
  // Strip comments first — the code explains the old instruction, and matching
  // our own prose would make this test pass or fail on the wrong thing.
  assert.ok(!/Press Publish first/.test(strip(admin)),
    'this instruction is what made Russell publish a programme in order to print it');
  assert.match(admin, /Print this programme now\. This does not put it on the website\./);
});

test('printing says plainly that nothing was published', () => {
  const p = admin.match(/function prPrintEdition\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(p, /Nothing has been published to the website/);
  // And it must not call the publish path.
  assert.ok(!/publishProgramme|prPublish/.test(p));
});

test('saving says what happened, in the club’s words', () => {
  const s = admin.match(/function saveProgramme\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(s, /Programme saved\. Nothing has been published/);
  assert.ok(!/Programme published — saved to the archive/.test(s),
    'saving is not publishing and must not say it is');
});

// ── 4 · THE FIXTURE IS THE OPERATOR’S CHOICE ────────────────────────────────

test('a saved fixture wins over any guess about the next match', () => {
  const f = admin.match(/function prSeedFromNextFixture\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(f, /_prSavedFixtureId/, 'the programme must remember its own fixture');
  const savedAt = f.indexOf('_prSavedFixtureId');
  const guessAt = f.indexOf('todayISO');
  assert.ok(savedAt > -1 && savedAt < guessAt,
    'the remembered fixture must be checked before any guess');
});

test('a part-built programme is never overwritten by the season moving on', () => {
  const f = admin.match(/function prSeedFromNextFixture\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(f, /if \(gv\('pr-opp'\)\) \{[^}]*return; \}/,
    'this is the Wallingford case — work in progress must survive');
  // The old rule re-seeded whenever the saved date fell into the past.
  assert.ok(!/savedDate < todayISO/.test(f), 'the old date-based re-seed is gone');
});

test('the fixture id is restored when the panel opens', () => {
  assert.match(admin, /window\._prSavedFixtureId = \(d && d\.fixtureId\) \|\| ''/);
});

test('the panel says which match it is for, and that it is not public', () => {
  assert.match(admin, /function prRenderFixtureHeader\(\)/);
  const h = admin.match(/function prRenderFixtureHeader\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(h, /Programme for/);
  assert.match(h, /Draft &mdash; not visible to fans/);
  // "Next Game" is the wording that made a Friday-built Tuesday programme
  // look like the wrong match.
  assert.ok(!/Next Game/.test(h));
});

test('choosing a fixture keeps the writing already done', () => {
  const f = admin.match(/function prProgFromFixture\(id, quiet\) \{[\s\S]*?\n\}/)[0];
  ['pr-mgr', 'pr-wel', 'pr-h2h', 'pr-lf'].forEach((id) => {
    assert.ok(!new RegExp("setVal\\('" + id + "'").test(f),
      `choosing a fixture must not wipe ${id}`);
  });
  assert.match(f, /Your writing has been kept/);
});

// ── 5 · PLAYER CARDS AND A4 ─────────────────────────────────────────────────

test('the headshot box is portrait, so faces are not sliced', () => {
  const css = print.match(/\.pcard \.ph\{[^}]*\}/)[0];
  assert.match(css, /aspect-ratio:4\/5/,
    'a 96px-tall box in a ~225px column is a letterbox — it cropped the chin off');
  assert.ok(!/height:96px/.test(css));
  const img = print.match(/\.pcard \.ph img\{[^}]*\}/)[0];
  assert.match(img, /object-fit:cover/);
  assert.match(img, /object-position:50% 28%/, 'the eyeline sits above centre in squad photos');
  assert.ok(!/object-position:top/.test(img), 'top-anchoring is what cut the chins');
});

test('nothing that reads as one unit may be split across sheets', () => {
  const card = print.match(/\.pcard\{[^}]*\}/)[0];
  assert.match(card, /break-inside:avoid/);
  const printBlock = print.match(/@media print\{[\s\S]*?\n  \}/)[0];
  ['.pcard', '.card', '.spon'].forEach((sel) => {
    assert.ok(printBlock.indexOf(sel) > -1, `${sel} must be protected from page breaks`);
  });
  assert.match(printBlock, /page-break-inside:avoid/);
});

test('panel colours and logos survive the print pipeline', () => {
  const printBlock = print.match(/@media print\{[\s\S]*?\n  \}/)[0];
  assert.match(printBlock, /print-color-adjust:exact/,
    'without this Chrome drops every background and the crest strip prints blank');
});

// ── 6 · SPONSORS: TWO DIFFERENT THINGS ──────────────────────────────────────

test('match sponsors are typed once and reach the print edition', () => {
  const b = admin.match(/function prBuildDoc\(\) \{[\s\S]*?\n\}/)[0];
  ['matchSponsor', 'ballSponsor', 'matchdaySponsor'].forEach((k) => {
    assert.ok(new RegExp(k + ':\\s*gv\\(').test(b), `${k} is not saved with the programme`);
  });
  // …and are rendered from that same document, not re-entered anywhere.
  assert.match(print, /d\.matchSponsor/);
  assert.match(print, /d\.ballSponsor/);
  assert.match(print, /d\.matchdaySponsor/);
});

test('recurring partners come from the sponsor registry, not from typing', () => {
  const sponsors = JSON.parse(read('data/sponsors.json'));
  const list = sponsors.sponsors || sponsors;
  const mjm = list.filter((s) => s.name === 'MJM Sports')[0];
  assert.ok(mjm, 'MJM Sports must be a real record, so nobody retypes it each week');
  assert.strictEqual(mjm.logo, 'img/sponsors/mjm-sports.png');
  assert.ok(fs.existsSync(path.join(ROOT, mjm.logo)), 'the supplied artwork must be in the repo');
  // The print page already renders every sponsor record, so MJM needs no
  // hard-coding anywhere.
  assert.ok(!/MJM/.test(strip(print)), 'a partner must not be hard-coded into the design');
});

test('no commercial title is invented for MJM', () => {
  const sponsors = JSON.parse(read('data/sponsors.json'));
  const list = sponsors.sponsors || sponsors;
  const mjm = list.filter((s) => s.name === 'MJM Sports')[0];
  // about.html records no designation for MJM, so a neutral one is used.
  assert.strictEqual(mjm.tier, 'Club Partner');
  assert.ok(!/Main Sponsor|Official Partner|Title/i.test(mjm.tier));
});

test('Cherry Red Records sits with the league, not in the club partner strip', () => {
  // about.html lists it under affiliations, linked to the league — it is the
  // COMPETITION'S title sponsor, not Rayners Lane's. Putting it in the club
  // strip would assert a relationship the club does not have.
  const sponsors = JSON.parse(read('data/sponsors.json'));
  const list = sponsors.sponsors || sponsors;
  assert.ok(!list.some((s) => /cherry red/i.test(s.name || '')),
    'Cherry Red is not a Rayners Lane sponsor');
  assert.match(print, /league-mark/);
  assert.match(print, /Title sponsor of the Combined Counties League/);
  assert.ok(fs.existsSync(path.join(ROOT, 'img/sponsors/cherry-red-records.png')));
});

test('the league title sponsor is named correctly', () => {
  // The programme credited "Pitching In", which sponsors other leagues. The
  // club's own affiliations name Cherry Red Records.
  assert.ok(!/title partner, Pitching In/.test(print));
  assert.match(print, /title sponsor, Cherry Red Records/);
  assert.match(read('about.html'), /Cherry Red Records Combined Counties/);
});

test('partner artwork keeps its shape', () => {
  const mark = print.match(/\.league-mark img\{[^}]*\}/)[0];
  assert.match(mark, /width:auto/, 'a fixed width and height would distort the logo');
  assert.match(mark, /object-fit:contain/);
  // White artwork needs a dark panel or it prints invisible.
  const panel = print.match(/\.league-mark\{[^}]*\}/)[0];
  assert.match(panel, /background:#0d0d0d/);
});

// ── 7 · NOTHING ELSE MOVED ──────────────────────────────────────────────────

test('the official line-up gate is untouched', () => {
  const sync = read('netlify/functions/programme-sync.js');
  assert.ok(/teamsheet|team sheet|lineup|confirmed/i.test(sync),
    'the FWP gate must still decide when line-ups become public');
});

test('fixture, player and squad truth is not edited to suit the programme', () => {
  // The programme must adapt to the fixture data, never the other way round.
  const b = admin.match(/function prBuildDoc\(\) \{[\s\S]*?\n\}/)[0];
  assert.ok(!/pushToGitHub\('fixtures'|pushToGitHub\('players'|pushToGitHub\('squad'/.test(b));
  const p = admin.match(/function prPrintEdition\(\) \{[\s\S]*?\n\}/)[0];
  assert.ok(!/pushToGitHub\('fixtures'/.test(p));
});

test('archived editions keep their own fixture for ever', () => {
  // An archived programme is looked up by id and rendered from its own stored
  // fields, so a later change to the fixture list cannot rewrite history.
  const l = print.match(/function loadProgrammeDoc\(\)\{[\s\S]*?\n  \}/)[0];
  assert.match(l, /items\.filter\(function\(it\)\{return it\.id===id;\}\)/);
});
