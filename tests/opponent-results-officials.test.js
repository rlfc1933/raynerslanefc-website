// Opposition recent results and match-official appointments.
//   · the appointments parser keeps names and roles, strips contact details,
//     refuses assessment text and shows unmatched lines
//   · results: postponed/abandoned/void excluded, corrections preferred,
//     stale after three days, unavailable when there is nothing
//   · attaching results never overwrites oppSummary or other staff copy
//   · a published edition keeps its results as chosen
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MO = require(path.join(ROOT, 'js/match-officials.js'));
const OR = require(path.join(ROOT, 'js/opp-results.js'));
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const FX = [
  { id: 'fwp-1', date: '2026-11-28', opponent: 'Broadfields United', isHome: true },
  { id: 'fwp-2', date: '2026-12-05', opponent: 'Hilltop', isHome: false },
  { id: 'fwp-3', date: '2026-12-12', opponent: 'Wallingford & Crowmarsh', isHome: true },
];

// ── PARSER ────────────────────────────────────────────────────────────────
test('parser maps every role from a one-line appointment', () => {
  const p = MO.parse('Sat 28 Nov Rayners Lane v Broadfields United — Referee: A Name; AR1: B Name; AR2: C Name; 4th: D Name', FX);
  assert.strictEqual(p.matches.length, 1);
  assert.strictEqual(p.matches[0].fixtureId, 'fwp-1');
  assert.deepStrictEqual(p.matches[0].officials, { referee: 'A Name', assistant1: 'B Name', assistant2: 'C Name', fourthOfficial: 'D Name' });
});

test('parser maps long-form role names on following lines', () => {
  const p = MO.parse('5/12/2026 Hilltop v Rayners Lane\nReferee - Ed Brown\nAssistant Referee 1: F Green\nAssistant Referee 2: G White\nFourth Official: H Black', FX);
  assert.deepStrictEqual(p.matches[0].officials, { referee: 'Ed Brown', assistant1: 'F Green', assistant2: 'G White', fourthOfficial: 'H Black' });
  assert.strictEqual(p.unmatched.length, 0);
});

test('parser strips phone numbers, emails and addresses', () => {
  const p = MO.parse('Sat 28 Nov Rayners Lane v Broadfields United — Referee: A Name 07700 900123; AR1: B Name b.name@example.com; AR2: C Name, 12 High Road, HA2 0XH; 4th: D Name tel: +44 20 8123 4567', FX);
  const o = p.matches[0].officials;
  assert.deepStrictEqual(o, { referee: 'A Name', assistant1: 'B Name', assistant2: 'C Name', fourthOfficial: 'D Name' });
  const all = JSON.stringify(p);
  assert.doesNotMatch(all, /07700|example\.com|HA2 0XH|8123|High Road/);
  assert.ok(p.stripped >= 4);
});

test('parser refuses assessment text and never echoes it', () => {
  const p = MO.parse('Sat 28 Nov Rayners Lane v Broadfields United — Referee: A Name\nAssessor: Mr Z — marks 7.9', FX);
  assert.strictEqual(p.refused.length, 1);
  assert.doesNotMatch(JSON.stringify(p), /Mr Z|7\.9/);
  assert.strictEqual(MO.toRecord({ fixtureId: 'fwp-1', date: '2026-11-28', officials: { referee: 'assessment 8.1' } }, { sourceLabel: 'x', enteredBy: 'Russell' }), null);
});

test('parser shows unmatched lines with a reason, and guesses nothing', () => {
  const p = MO.parse('Sat 21 Nov Rayners Lane v Broadfields United — Referee: A Name\nRandom note\nReferee: Orphan Name', FX);
  assert.strictEqual(p.matches.length, 0);
  assert.strictEqual(p.unmatched.length, 3);
  assert.match(p.unmatched[0].reason, /no fixture against Broadfields United/);
});

test('a stored record holds only names, roles, label, checkedAt, enteredBy', () => {
  const r = MO.toRecord({ fixtureId: 'fwp-1', date: '2026-11-28', opponent: 'Broadfields United', officials: { referee: 'A Name 07700 900123' }, notes: 'secret', phone: '07700' },
    { sourceLabel: 'League appointments email', enteredBy: 'Russell', checkedAt: '2026-11-16T10:00:00Z' });
  assert.deepStrictEqual(Object.keys(r).sort(), ['checkedAt', 'date', 'enteredBy', 'fixtureId', 'officials', 'opponent', 'sourceLabel', 'status'].sort());
  assert.strictEqual(r.officials.referee, 'A Name');
  assert.strictEqual(MO.toRecord({ fixtureId: 'fwp-1', date: '2026-11-28', officials: { referee: 'A' } }, { sourceLabel: '', enteredBy: 'R' }), null, 'no source label → refused');
});

test('using appointments asks before overwriting different names', () => {
  const d = MO.diffAgainst({ referee: 'Typed Name', assistant1: '' }, { referee: 'Appointed Name', assistant1: 'B' });
  assert.strictEqual(d.length, 1);
  assert.strictEqual(d[0].el, 'pr-ref');
  const ed = read('js/programme-editor.js');
  assert.match(ed, /diffAgainst\(cur, rec\.officials\);\s*if \(diff\.length && !global\.confirm\(/, 'a differing name is only replaced after confirm');
  assert.match(ed, /s1\.value = 'confirmed'/);
});

test('recordFor matches by id, then by date and opponent', () => {
  const recs = [{ fixtureId: 'fwp-1', date: '2026-11-28', opponent: 'Broadfields United', officials: { referee: 'A' } }];
  assert.ok(MO.recordFor(recs, { id: 'fwp-1' }));
  assert.ok(MO.recordFor(recs, { id: 'reg-99', date: '2026-11-28', opponent: 'Broadfields United FC' }));
  assert.strictEqual(MO.recordFor(recs, { id: 'reg-99', date: '2026-11-29', opponent: 'Broadfields United' }), null);
});

// ── RESULTS ───────────────────────────────────────────────────────────────
const R = (date, hs, as, extra) => Object.assign({ date, home: 'Hilltop', away: 'Other', homeScore: hs, awayScore: as, competition: 'CCL', status: 'completed' }, extra || {});

test('postponed, abandoned, void and unscored matches are excluded', () => {
  const items = [R('2026-11-01', 2, 1), R('2026-11-04', null, null, { status: 'postponed' }), R('2026-11-07', 1, 0, { status: 'abandoned' }),
    R('2026-11-08', 0, 0, { status: 'void' }), R('2026-11-09', 3, 3, { postponed: true }), R('2026-11-10', null, 1)];
  const got = OR.lastCompleted(items, 5);
  assert.deepStrictEqual(got.map((r) => r.date), ['2026-11-01']);
});

test('a correction replaces the original score', () => {
  const auto = [R('2026-11-01', 2, 1, { fetchedAt: '2026-11-02T00:00:00Z' })];
  const manual = [R('2026-11-01', 2, 2, { enteredBy: 'Russell', sourceText: 'FA Full-Time', enteredAt: '2026-11-03T00:00:00Z' })];
  const got = OR.lastCompleted(OR.merge(auto, manual), 5);
  assert.strictEqual(got.length, 1);
  assert.strictEqual(got[0].awayScore, 2);
  const corrected = OR.merge([R('2026-11-01', 2, 1), R('2026-11-01', 1, 1, { corrected: true })], []);
  assert.strictEqual(corrected.length, 1);
  assert.strictEqual(corrected[0].homeScore, 1, 'a provider-corrected row beats the original');
});

test('last N, newest first, respecting the cut-off', () => {
  const items = ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29'].map((d) => R(d, 1, 0));
  assert.deepStrictEqual(OR.lastCompleted(items, 2, '2026-10-20').map((r) => r.date), ['2026-10-15', '2026-10-08']);
});

test('state: available, stale after three days, unavailable without a fetch', () => {
  const now = Date.parse('2026-11-16T12:00:00Z');
  assert.strictEqual(OR.state('2026-11-15T12:00:00Z', now), 'available');
  assert.strictEqual(OR.state('2026-11-13T11:00:00Z', now), 'stale');
  assert.strictEqual(OR.state(null, now), 'unavailable');
});

test('a manual result carries provenance and is refused without it', () => {
  const ok = OR.toManual({ club: 'Hilltop', date: '2026-11-01', home: 'Hilltop', away: 'Other', homeScore: 2, awayScore: 1, enteredBy: 'Russell', sourceText: 'FA Full-Time results page' }, '2026-11-16T10:00:00Z');
  assert.deepStrictEqual(ok.provenance, { kind: 'manual', enteredBy: 'Russell', sourceText: 'FA Full-Time results page', enteredAt: '2026-11-16T10:00:00Z' });
  assert.strictEqual(OR.toManual({ club: 'Hilltop', date: '2026-11-01', home: 'Hilltop', away: 'Other', homeScore: 2, awayScore: 1, enteredBy: 'Russell' }), null);
  assert.strictEqual(OR.toManual({ club: 'Hilltop', date: '2026-11-01', home: 'Hilltop', away: 'Other', homeScore: 2.5, awayScore: 1, enteredBy: 'R', sourceText: 's' }), null);
});

test('attaching results never overwrites staff-written fields', () => {
  const doc = { oppSummary: 'Written by Russell', oppManager: 'J Bloggs', headToHead: 'Typed', referee: 'A Name' };
  const out = OR.attach(doc, [R('2026-11-01', 2, 1), R('2026-11-02', null, null, { status: 'postponed' })], { source: 'Manual entries', fetchedAt: '2026-11-16T00:00:00Z', cutoff: '2026-11-01' });
  ['oppSummary', 'oppManager', 'headToHead', 'referee'].forEach((k) => assert.strictEqual(out[k], doc[k]));
  assert.strictEqual(out.oppRecentResults.items.length, 1);
  assert.strictEqual(out.oppRecentResults.cutoff, '2026-11-01');
  assert.strictEqual(doc.oppRecentResults, undefined, 'the input document is not mutated');
  const ed = read('js/programme-editor.js');
  const refresh = ed.match(/PRE\.refreshOppResults = function[\s\S]*?\n  \};/)[0];
  assert.doesNotMatch(refresh, /oppSummary|pr-oppsum|PRE\.oppRecent\s*=/, 'a background refresh only replaces PRE.oppLive');
});

test('a published edition keeps its results', () => {
  const pub = { published: true, oppRecentResults: { items: [R('2026-10-01', 1, 0)], cutoff: '2026-10-01', source: 'x' } };
  assert.strictEqual(OR.attach(pub, [R('2026-11-01', 5, 0)]).oppRecentResults.items[0].date, '2026-10-01');
  const admin = read('admin.html');
  const freeze = admin.match(/async function prFreezeEdition\(base\) \{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(freeze.replace(/\/\/.*$/gm, ''), /oppRecentResults\s*=|opponent-results/, 'freeze never re-fetches or replaces the chosen results');
  assert.match(admin, /oppRecentResults: \(window\.PRE && PRE\.oppRecent\) \|\| null/, 'the chosen set travels in the one document builder');
  const print = read('programme-print.html');
  assert.match(print, /Results to '\+esc\(/, 'the print page states the cut-off and source');
});

// ── SERVER ────────────────────────────────────────────────────────────────
process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'fake';
const save = require(path.join(ROOT, 'netlify/functions/save-data.js'));
const fn = require(path.join(ROOT, 'netlify/functions/opponent-results.js'));
const blobs = {};
const store = { get: async (k) => (k in blobs ? JSON.parse(blobs[k]) : null), setJSON: async (k, v) => { blobs[k] = JSON.stringify(v); } };
save._setDraftStore(store); fn._setStore(store);
const call = async (b) => { const r = await save.handler({ httpMethod: 'POST', body: JSON.stringify(Object.assign({ pin: '1933' }, b)) }); return { status: r.statusCode, j: JSON.parse(r.body) }; };

test('save-data rebuilds appointment records and keeps them private', async () => {
  const r = await call({ merge: true, domain: 'fixture-officials', key: 'items', idField: 'fixtureId',
    upserts: [{ fixtureId: 'fwp-1', date: '2026-11-28', opponent: 'Broadfields United', officials: { referee: 'A Name 07700 900123' }, sourceLabel: 'League appointments email', enteredBy: 'Russell', phone: '07700 900123', notes: 'assessor marks' }] });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.j.private, true);
  const stored = JSON.parse(blobs['fixture-officials']).items[0];
  assert.strictEqual(stored.officials.referee, 'A Name');
  assert.doesNotMatch(JSON.stringify(stored), /07700|assessor/);
  assert.deepStrictEqual(r.j.merged[0], stored, 'the response is the stored state');
  const bad = await call({ merge: true, domain: 'fixture-officials', key: 'items', idField: 'fixtureId', upserts: [{ fixtureId: 'fwp-2', date: '2026-12-05', officials: { referee: 'B' } }] });
  assert.strictEqual(bad.status, 400, 'no source or enteredBy → refused');
  const raw = await call({ path: 'data/fixture-officials.json', content: Buffer.from('{}').toString('base64') });
  assert.strictEqual(raw.status, 400, 'no whole-file writes');
  const deny = await save.handler({ httpMethod: 'POST', body: JSON.stringify({ pin: 'wrong', read: true, path: 'data/fixture-officials.json' }) });
  assert.strictEqual(deny.statusCode, 401);
});

test('opponent-results: automation off → no network, manual results, explicit states', async () => {
  delete process.env.FWP_SYNC_ENABLED;
  let fetched = 0;
  const empty = JSON.parse((await fn._handle({ pin: '1933', club: 'Hilltop', refresh: true }, { fetchImpl: async () => { fetched++; return {}; } })).body);
  assert.strictEqual(fetched, 0, 'the permission gate is respected');
  assert.strictEqual(empty.automation.enabled, false);
  assert.strictEqual(empty.state, 'unavailable');
  const m = await call({ merge: true, domain: 'opponent-results', key: 'items', idField: 'id',
    upserts: [{ club: 'Hilltop', date: '2026-11-07', home: 'Hilltop', away: 'Burnham', homeScore: 2, awayScore: 0, enteredBy: 'Russell', sourceText: 'FA Full-Time', enteredAt: '2026-11-15T10:00:00Z' }] });
  assert.strictEqual(m.status, 200);
  const got = JSON.parse((await fn._handle({ pin: '1933', club: 'Hilltop' }, { now: Date.parse('2026-11-16T10:00:00Z') })).body);
  assert.strictEqual(got.items.length, 1);
  assert.strictEqual(got.state, 'available');
  const later = JSON.parse((await fn._handle({ pin: '1933', club: 'Hilltop' }, { now: Date.parse('2026-11-20T10:00:00Z') })).body);
  assert.strictEqual(later.state, 'stale');
  const deny = await fn._handle({ pin: 'nope', club: 'Hilltop' });
  assert.strictEqual(deny.statusCode, 401);
});

test('opponent-results: when permitted, provider rows are filtered and cached', async () => {
  process.env.FWP_SYNC_ENABLED = 'true';
  const html = '<table>' +
    '<tr data-href="match/2026-2027/ccl/bedfont/x/1001" title="t"><td class="date" data-export="31/10/2026"></td><td class="opponent" data-export="Burnham"></td><td class="venue">H</td><td class="competition">CCL</td><td class="ko-score">(1) 2 - 1 (0)</td></tr>' +
    '<tr data-href="match/2026-2027/ccl/x/bedfont/1002" title="t"><td class="date" data-export="7/11/2026"></td><td class="opponent" data-export="Holyport"></td><td class="venue">A</td><td class="competition">CCL</td><td class="ko-score">P - P</td></tr>' +
    '</table>';
  try {
    const r = JSON.parse((await fn._handle({ pin: '1933', club: 'Bedfont', refresh: true }, { fetchImpl: async () => ({ ok: true, body: html }) })).body);
    assert.strictEqual(r.items.length, 1, 'postponed match excluded');
    assert.strictEqual(r.items[0].home, 'Bedfont');
    assert.strictEqual(r.items[0].homeScore, 2);
    assert.match(r.sourceUrl, /^https:\/\/www\.footballwebpages\.co\.uk\/bedfont\/fixtures-results$/);
    assert.ok(JSON.parse(blobs['opponent-results-auto']).byClub.bedfont, 'cached in the private store');
  } finally { delete process.env.FWP_SYNC_ENABLED; }
});
