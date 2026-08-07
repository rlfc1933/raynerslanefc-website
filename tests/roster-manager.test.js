// ════════════════════════════════════════════════════════════════════════════
// THE SQUAD, MAINTAINED BY THE PEOPLE WHO PRINT IT.
//
// The canonical roster was already Supabase `la_players`, and removal already
// archived rather than deleted. What a Programme Editor could not do was the
// part that matters week to week:
//
//   EDIT somebody without minting a second player. The existing save matched by
//   NAME, so correcting a spelling created a new record and orphaned the old —
//   which is how a roster grows duplicates and how a Full-Time identity mapping
//   silently detaches from its player.
//
//   SEE who had left and bring them back. Archiving was right; nothing could
//   read those rows, so a returning player was retyped as a stranger.
//
//   BE WARNED before adding a name the club already has.
//
// The line these tests defend: `la_players` answers "who plays for Rayners
// Lane". `football_players` answers "which match-sheet names have we matched to
// a person". A signing belongs in the squad the day he signs, with no
// appearances, no photograph and no identity mapping.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const raw = read('netlify/functions/la-roster.js');
/** Comments explain the rules; assertions must read the CODE, not the prose. */
const fn = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const admin = read('admin.html');
const R = require(path.join(ROOT, 'netlify/functions/la-roster.js'))._internal;
const AUTHZ = require(path.join(ROOT, 'netlify/functions/lib/authz.js'));

// ── 1 · ONE CANONICAL ROSTER, NOT A PROGRAMME COPY ──────────────────────────

test('the roster reads and writes the club table, not a programme table', () => {
  assert.match(fn, /la_players/);
  assert.ok(!/football_players/.test(fn),
    'squad membership must never depend on Full-Time match identities');
  assert.ok(!/programme_roster|players\.json/.test(fn),
    'no second roster may be invented — players.json is regenerated from this');
});

test('every change republishes the website roster', () => {
  // deactivate and restore share one branch, so three call sites cover four actions.
  const writes = fn.match(/await P\.publish\(false\)/g) || [];
  assert.strictEqual(writes.length, 3, 'add, update, and deactivate/restore all republish');
  assert.match(fn, /require\('\.\/la-publish-players'\)/);
});

test('a player needs only a name and a position', () => {
  const block = fn.slice(fn.indexOf("if (action === 'add')"), fn.indexOf("if (action === 'update')"));
  assert.match(block, /Enter the player’s name/);
  assert.match(block, /Choose a position/);
  ['identity', 'appearances', 'goals', 'nationality', 'age', 'bio']
    .forEach((k) => assert.ok(!new RegExp(k, 'i').test(block),
      k + ' must not be required to add somebody to the squad'));
});

// ── 2 · EDITING MUST NOT CREATE A SECOND PLAYER ─────────────────────────────

test('an edit is applied by id, never by name', () => {
  const block = fn.slice(fn.indexOf("if (action === 'update')"), fn.indexOf("if (action === 'deactivate'"));
  assert.match(raw, /BY ID, NEVER BY NAME/);
  assert.match(block, /id=eq\.' \+ encodeURIComponent\(id\)/);
  assert.ok(!/norm\(|byName/.test(block), 'name matching is what split players in two');
});

test('changing a display name keeps the same record', () => {
  const block = fn.slice(fn.indexOf("if (action === 'update')"), fn.indexOf("if (action === 'deactivate'"));
  assert.match(block, /patch\.name = String\(b\.name\)\.trim\(\)/);
  assert.ok(!/L\.ins\(/.test(block), 'an edit must never insert a new row');
});

test('the browser edits by id too', () => {
  const f = admin.match(/async function prRosterEdit\(id\)[\s\S]*?\n\}/)[0];
  assert.match(f, /action: 'update', id: id/);
  assert.match(f, /BY ID/);
});

// ── 3 · REMOVING SOMEBODY DESTROYS NOTHING ──────────────────────────────────

test('there is no delete, only a change of status', () => {
  assert.ok(!/L\.del\(|method: 'DELETE'|\bdelete\b/i.test(fn.replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')), 'a departure must never remove the record');
  const block = fn.slice(fn.indexOf("if (action === 'deactivate'"), fn.indexOf("return L.resp(400, { ok: false, error: 'unknown action"));
  assert.match(block, /status: status/);
  assert.match(raw, /NOT A DELETE/);
});

test('the wording staff see is “remove from squad”, not “delete”', () => {
  const f = admin.match(/async function prRosterOut\(id\)[\s\S]*?\n\}/)[0];
  assert.match(f, /Remove .* from the current squad\?/);
  assert.match(f, /Nothing is deleted/);
  assert.match(f, /you can restore them at any time/);
  assert.ok(!/delete/i.test(admin.match(/onclick="prRosterOut\([^)]*\)">([^<]*)</)[1]));
});

test('a departed player can be seen and restored', () => {
  assert.match(fn, /inactive: all\.filter\(\(p\) => !p\.active\)/);
  assert.match(admin, /Left the club \(/);
  assert.match(admin, /Restore to squad/);
  const f = admin.match(/async function prRosterBack\(id\)[\s\S]*?\n\}/)[0];
  assert.match(f, /action: 'restore'/);
});

test('restoring does not recreate the player', () => {
  const block = fn.slice(fn.indexOf("if (action === 'deactivate'"));
  assert.ok(!/L\.ins\(/.test(block), 'a returning player keeps their original record and history');
});

// ── 4 · DUPLICATE PROTECTION ────────────────────────────────────────────────

test('a very similar name is flagged, never silently added', () => {
  const block = fn.slice(fn.indexOf("if (action === 'add')"), fn.indexOf("if (action === 'update')"));
  assert.match(block, /duplicate: true/);
  assert.match(block, /!b\.confirmDuplicate/);
  assert.match(raw, /never silently silently duplicated|is never silently/);
});

test('the warning shows who it matched, including people who have left', () => {
  const f = admin.match(/async function prRosterAdd\(confirmDuplicate\)[\s\S]*?\n\}/)[0];
  assert.match(f, /\(left the club\)/);
  assert.match(f, /restore them from/);
  assert.match(f, /Add ".* as a separate player anyway\?/);
});

test('the matcher catches the cases that actually occur', () => {
  // Real examples from this club's own unresolved identities.
  assert.strictEqual(R.looksLike('Temi Animashaun', 'Temiloluwa Animashaun'), true, 'short form');
  assert.strictEqual(R.looksLike('J Smith', 'John Smith'), true, 'initial');
  assert.strictEqual(R.looksLike('pete  singh', 'Pete Singh'), true, 'spacing and case');
  assert.strictEqual(R.looksLike('Le’Kai Chevannes', "Le'Kai Chevannes"), true, 'curly apostrophe');
});

test('it does not cry duplicate over genuinely different people', () => {
  assert.strictEqual(R.looksLike('Gary Pitt', 'Jamie Pitt'), false, 'same surname, different person');
  assert.strictEqual(R.looksLike('Alfie Campbell', 'Jaycob Campbell'), false);
  assert.strictEqual(R.looksLike('Josh Andrew', 'Joshua Andrews'), false, 'different surname');
});

// ── 5 · PERMISSIONS AND AUDIT ───────────────────────────────────────────────

test('changing the squad needs the capability; looking at it does not', () => {
  assert.strictEqual(AUTHZ.CAP.MANAGE_ROSTER, 'can_manage_first_team_roster');
  const listAt = fn.indexOf("if (action === 'list')");
  const gateAt = fn.indexOf('const g = await gate(event);');
  assert.ok(listAt < gateAt, 'reading the squad stays open inside the portal');
  ['add', 'update', 'deactivate'].forEach((a) =>
    assert.ok(fn.indexOf("action === '" + a + "'") > gateAt, a + ' must be behind the gate'));
});

test('the Programme Editor can maintain the roster and nothing else', () => {
  assert.deepStrictEqual(AUTHZ.DEFAULT_CAPS['Programme Editor'], [AUTHZ.CAP.MANAGE_ROSTER]);
  [AUTHZ.CAP.MANAGE_USERS, AUTHZ.CAP.ASSIGN_ADMIN, AUTHZ.CAP.CONFIRM_IDENTITY, AUTHZ.CAP.VIEW_STAFF]
    .forEach((c) => assert.ok(!AUTHZ.DEFAULT_CAPS['Programme Editor'].includes(c)));
});

test('the manager and the chairman hold it too', () => {
  ['Team Manager', 'Chairman', 'System Maintainer'].forEach((r) =>
    assert.ok(AUTHZ.DEFAULT_CAPS[r].includes(AUTHZ.CAP.MANAGE_ROSTER), r));
  assert.ok(!AUTHZ.DEFAULT_CAPS['V Chairman'].includes(AUTHZ.CAP.MANAGE_ROSTER));
});

test('the drawing mirror agrees with the server', () => {
  const pt = read('js/portal-tools.js');
  const caps = pt.slice(pt.indexOf('var STAFF_CAPS = {'), pt.indexOf('/** Does this role hold'));
  Object.keys(AUTHZ.DEFAULT_CAPS).forEach((role) =>
    assert.ok(caps.includes("'" + role + "'"), 'no mirror for ' + role));
  assert.match(caps, /'Programme Editor': \['can_manage_first_team_roster'\]/);
});

test('every roster change is written to the audit', () => {
  ['roster_player_added', 'roster_player_edited', 'roster_player_deactivated', 'roster_player_restored']
    .forEach((a) => assert.ok(fn.includes(a), a + ' is not audited'));
  const a = fn.match(/async function audit\(entry\)[\s\S]*?\n\}/)[0];
  assert.match(a, /actorUsername: entry\.by/);
  assert.ok(!/pin|password|token/i.test(a.replace(/^\s*\/\/.*$/gm, '')));
});

test('the decider comes from the signed session, not the browser', () => {
  assert.match(fn, /const by = \(g\.session\.username \|\| ''\)/);
  assert.ok(!/b\.by\b/.test(fn), 'a typed name must not become the record of who changed the squad');
});

// ── 6 · THE PROGRAMME PICKS THE CHANGE UP ───────────────────────────────────

test('the roster opens with the Programme', () => {
  assert.match(admin, /if \(name === 'programme'\) \{ initProgramme\(\); prStatsStatus\(\); prRosterLoad\(\); \}/);
  assert.match(admin, /id="pr-roster"/);
  assert.match(admin, /First Team Roster/);
});

test('a player with no photograph gets a graphic, not a blank box', () => {
  const f = admin.match(/function prRosterRender\(\)[\s\S]*?\n\}/)[0];
  assert.match(f, /initials/);
  assert.match(admin, /designed Rayners Lane/);
  assert.match(admin, /graphic, not a blank box/);
});

test('the squad page has no fixed capacity to break', () => {
  const print = read('programme-print.html');
  assert.ok(!/slice\(0\s*,\s*\d+\)/.test(print.slice(print.indexOf('var pc = club.players'),
    print.indexOf('var pages = squadPages'))), 'no cap may be reintroduced');
  assert.match(print, /var pages = squadPages\(pc\.length, 30\)/);
});
