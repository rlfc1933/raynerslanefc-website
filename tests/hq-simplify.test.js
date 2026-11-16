// HQ fixes from the 16 Nov review: last home attendance, meeting actions,
// unknown-vs-zero player figures, compliance empty state.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const shell = read('js/hq-shell.js');
const admin = read('admin.html');

function lastAttendanceWith(rows, nowIso) {
  const src = shell.slice(shell.indexOf('  function lastAttendance() {'), shell.indexOf('  function programmeFor(fx) {'));
  const T = { londonDate: (x) => new Date(x).toISOString().slice(0, 10), shortDate: (d) => d };
  const S = { data: { md: { rows } } };
  return new Function('S', 'T', 'now', src + '; return lastAttendance();')(S, T, () => Date.parse(nowIso));
}

test('a prepared future record is never "last home attendance"', () => {
  const r = lastAttendanceWith([
    { fixture: { date: '2027-04-03', opponent: 'Bedfont' }, record: { status: 'prepared', attendance_calculated: 0 } },
    { fixture: { date: '2026-11-07', opponent: 'Abingdon United' }, record: { status: 'completed', attendance_calculated: 84, attendance_official: null } },
  ], '2026-11-16T12:00:00Z');
  assert.strictEqual(r.n, 84);
  assert.match(r.label, /Abingdon United/);
});

test('the official figure wins, and an unfinished count is not zero', () => {
  assert.strictEqual(lastAttendanceWith([
    { fixture: { date: '2026-11-07', opponent: 'A' }, record: { status: 'locked', attendance_calculated: 80, attendance_official: 91 } },
  ], '2026-11-16T12:00:00Z').n, 91);
  assert.strictEqual(lastAttendanceWith([
    { fixture: { date: '2026-11-07', opponent: 'A' }, record: { status: 'in_progress', attendance_calculated: 0 } },
  ], '2026-11-16T12:00:00Z'), null, 'missing stays missing');
  assert.match(shell, /'Not recorded'/);
});

test('meeting actions become owned tasks, once, and unnamed lines are not guessed', () => {
  const src = admin.slice(admin.indexOf('function mtNorm(t) {'), admin.indexOf('function mtActionsToTasks(mt) {'));
  const parse = new Function(src + '; return mtParseActions;')();
  const a = parse('Nigel — approach 5 firms for boards\nJenny: start Football Foundation grant 2026-12-01\nsort the raffle');
  assert.deepStrictEqual(a.map((x) => x.owner), ['Nigel', 'Jenny', null]);
  assert.strictEqual(a[1].due, '2026-12-01');
  const fn = admin.slice(admin.indexOf('function mtActionsToTasks(mt) {'), admin.indexOf('function mtActionsToTasks(mt) {') + 2000);
  assert.match(fn, /idempotency_key: mtKey\(mt\.id, a\.title\)/, 'saving twice creates nothing twice');
  assert.match(fn, /no owner \(owner unclear — not guessed\)/, 'unnamed lines are reported, not assigned');
});

test('the stale "pre-season" explanation is gone from Committee meetings', () => {
  assert.ok(!/because it's pre-season/.test(admin));
});

test('blank player figures are stored as unknown, not zero', () => {
  assert.match(admin, /function numOrNull\(v\)/);
  assert.ok(!/id="sq-apps" value="0"/.test(admin));
  const srv = read('netlify/functions/la-admin-save-squad.js');
  assert.match(srv, /apps: stat\(p\.apps\)/);
  assert.ok(!/apps: Number\(p\.apps\) \|\| 0/.test(srv));
});

test('an empty compliance register reads as not set up, never as compliant', () => {
  assert.match(read('js/club-os.js'), /Not set up: no obligations recorded\./);
});

test('news says "published" only after the save is confirmed', () => {
  const c = admin.slice(admin.indexOf('function commitArticle('), admin.indexOf('function commitArticle(') + 900);
  assert.match(c, /if \(r && r\.ok\) \{ if \(after\) after\(\); \}/);
  assert.match(admin, /function nwSaveDraft\(\)/);
  assert.match(admin, /function nwPreview\(\)/);
  assert.match(admin, /function nwEdit\(id, kind\)/);
});

test('drafts are not public files, and news ids never reach inline script', () => {
  const toml = read('netlify.toml');
  assert.match(toml, /from = "\/data\/news-drafts\.json"[\s\S]{0,60}status = 404[\s\S]{0,20}force = true/);
  assert.match(toml, /from = "\/data\/programme-draft\.json"[\s\S]{0,60}status = 404[\s\S]{0,20}force = true/);
  assert.ok(!/onclick="nwEdit\(|onclick="deleteArticle\(\\'' \+ esc\(a\.id\)/.test(admin));
  assert.match(admin, /data-nw-edit="' \+ escH\(a\.id\)/);
  assert.ok(!/getJSON\('programme-draft'\)/.test(read('programme-print.html')), 'the print page reads the draft through the sign-in');
});
