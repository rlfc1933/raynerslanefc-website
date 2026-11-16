// Verification of the PR #37 HQ changes, with the gaps found fixed:
// meeting-action idempotency on edit, unclear owners, news escaping and PIN,
// legitimate zero attendance, unknown squad figures end to end.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const admin = read('admin.html');
const shell = read('js/hq-shell.js');

const mtSrc = admin.slice(admin.indexOf('function mtNorm(t) {'), admin.indexOf('function mtActionsToTasks(mt) {'));
const MT = new Function(mtSrc + '; return { mtKey: mtKey, mtParseActions: mtParseActions, mtResolveOwner: mtResolveOwner };')();
const PEOPLE = [{ name: 'Nigel Smith' }, { name: 'Jenny Patel' }, { name: 'Pete Singh' }, { name: 'Pete Jones' }];

test('meeting actions: the key is meeting + action text, so editing, reordering or inserting creates no duplicate', () => {
  const before = MT.mtParseActions('Nigel — approach 5 firms\nJenny — grant form', PEOPLE).map((a) => MT.mtKey('m1', a.title));
  const after = MT.mtParseActions('New line — something\nJenny — grant form\nNigel —   Approach 5 firms ', PEOPLE).map((a) => MT.mtKey('m1', a.title));
  assert.ok(after.includes(before[0]) && after.includes(before[1]), 'existing actions keep their keys');
  assert.equal(new Set(after).size, 3);
  assert.notEqual(MT.mtKey('m1', 'grant form'), MT.mtKey('m2', 'grant form'), 'keys are per meeting');
  assert.ok(!/:\d+$/.test(before[0].replace(/:a[0-9a-z]+:\d+$/, '')), 'no line index in the key');
});

test('meeting actions: owners are matched to committee names, never guessed', () => {
  const a = MT.mtParseActions('Nigel & Jenny — book the hall\nBob — paint lines\nnigel smith — boards\nPete — raffle\nJenny — grant\nsort the raffle', PEOPLE);
  assert.deepStrictEqual(a.map((x) => x.owner), [null, null, 'Nigel Smith', null, 'Jenny Patel', null]);
  assert.equal(a[0].unclear, 'owner unclear: Nigel & Jenny');
  assert.equal(a[1].unclear, 'owner unclear: Bob');
  assert.equal(a[3].unclear, 'owner unclear: Pete', 'two Petes: ambiguous');
  assert.equal(a[5].unclear, 'owner unclear: no name given');
  const fn = admin.slice(admin.indexOf('function mtActionsToTasks(mt) {'), admin.indexOf('function deleteMeeting(id) {'));
  assert.match(fn, /owner: a\.owner \|\| undefined/);
  assert.match(fn, /note: a\.unclear/);
});

test('news: drafts and publishing go through save-data with the committee PIN', () => {
  const draft = admin.slice(admin.indexOf('function nwSaveDraft() {'), admin.indexOf('function nwPreview() {'));
  assert.match(draft, /save-data[\s\S]*pin: PIN/);
  const push = admin.slice(admin.indexOf('function pushToGitHub'), admin.indexOf('function pushToGitHub') + 900);
  assert.match(push, /save-data[\s\S]*pin: PIN/);
});

test('news preview escapes every field (XSS payloads stay text)', () => {
  const esc = admin.slice(admin.indexOf('function escH(s) {'), admin.indexOf('\n', admin.indexOf('function escH(s) {')));
  const src = admin.slice(admin.indexOf('function nwPreview() {'), admin.indexOf('function nwEdit(id, kind) {'));
  const X = '<img src=x onerror=alert(1)>"\'><script>alert(2)</script>';
  const box = { hidden: true, innerHTML: '', scrollIntoView() {} };
  const run = (form, img) => new Function('document', 'imgStore', 'nwForm', esc + ';' + src + '; nwPreview();')(
    { getElementById: () => box }, img ? { nw: { dataUrl: img } } : {}, () => form);
  run({ title: X, category: X, date: X, excerpt: X, body: X + '\n\n' + X, author: X, image: 'javascript:alert(3)' });
  assert.ok(!/<script|<img src=x|onerror=alert\(1\)>/.test(box.innerHTML.replace(/&lt;[^]*?&gt;/g, '')), box.innerHTML);
  assert.ok(!/<script/i.test(box.innerHTML));
  assert.ok(!/javascript:/i.test(box.innerHTML), 'a javascript: image never becomes a src');
  assert.ok(!/" onerror/.test(box.innerHTML));
  run({ title: 'ok', image: 'img/news/a.png' });
  assert.match(box.innerHTML, /src="img\/news\/a\.png"/);
});

function lastAttendanceWith(rows, nowIso) {
  const src = shell.slice(shell.indexOf('  function lastAttendance() {'), shell.indexOf('  function programmeFor(fx) {'));
  const T = { londonDate: (x) => new Date(x).toISOString().slice(0, 10), shortDate: (d) => d };
  return new Function('S', 'T', 'now', src + '; return lastAttendance();')({ data: { md: { rows } } }, T, () => Date.parse(nowIso));
}
test('attendance: an official 0 for a completed past match shows 0; no figure shows Not recorded', () => {
  const zero = lastAttendanceWith([{ fixture: { date: '2026-11-07', opponent: 'A' }, record: { status: 'completed', attendance_official: 0, attendance_calculated: 12 } }], '2026-11-16T12:00:00Z');
  assert.strictEqual(zero.n, 0);
  const none = lastAttendanceWith([
    { fixture: { date: '2026-11-07', opponent: 'Latest' }, record: { status: 'completed', attendance_official: null, attendance_calculated: null } },
    { fixture: { date: '2026-10-07', opponent: 'Older' }, record: { status: 'completed', attendance_official: 90 } }], '2026-11-16T12:00:00Z');
  assert.strictEqual(none.n, null, 'the latest match has no figure: not an older one, not zero');
  assert.match(shell, /att && att\.n != null \? String\(att\.n\) : \(d\.md && d\.md\.rows \? 'Not recorded'/);
});

test('squad: unknown stays null end to end, including la-publish-players output', async () => {
  const lanePath = require.resolve('../netlify/functions/lib/lane');
  const saved = require.cache[lanePath];
  require.cache[lanePath] = { id: lanePath, filename: lanePath, loaded: true, exports: { sel: async () => [{ name: 'A B', squad_no: null, age: null, apps: null, goals: 0, assists: null }] } };
  delete require.cache[require.resolve('../netlify/functions/la-publish-players')];
  try {
    const r = await require('../netlify/functions/la-publish-players').publish(true);
    assert.deepStrictEqual([r.players[0].number, r.players[0].age, r.players[0].apps, r.players[0].goals, r.players[0].assists], [null, null, null, 0, null]);
    assert.deepStrictEqual([r.squad[0].no, r.squad[0].apps], [null, null]);
  } finally { if (saved) require.cache[lanePath] = saved; else delete require.cache[lanePath]; }
  assert.match(read('netlify/functions/la-admin-save-squad.js'), /function stat\(v\) \{ if \(v == null \|\| v === ''\) return null;/);
});

test('empty states name the next step in plain English', () => {
  assert.ok((shell.match(/Next step:/g) || []).length >= 5);
});
