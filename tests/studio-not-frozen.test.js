// ════════════════════════════════════════════════════════════════════════════
// A TEMPLATE-SPECIFIC FEATURE MUST NEVER TAKE THE STUDIO AWAY FROM ANYONE.
//
// MATCH-DAY INCIDENT, 15 AUGUST 2026, DURING THE GAME.
// The guided front door called showPicker(false), which set the original
// twenty-five-button template list to display:none. Nothing was disabled and
// every control still worked — but the route to GOAL had silently moved, mid
// match. From the touchline that is indistinguishable from a frozen studio, and
// the club could not post goals while the game was being played.
//
// The lesson is narrow and worth keeping: a new way in is an ADDITION. It may
// suggest a route; it may not remove the one people already use.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SHELL = read('js/studio-shell.js');
const ADMIN = read('admin.html');
const CINE = read('js/studio-cinematic.js');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

// ── 1 · THE STUDIO STAYS REACHABLE ──────────────────────────────────────────

test('nothing in the studio shell can hide the original template picker', () => {
  const src = strip(SHELL);
  assert.ok(!/ps-types[\s\S]{0,200}display\s*=\s*['"]none/.test(src),
    'THE INCIDENT: hiding #ps-types strands anyone who knows the old workflow');
  assert.ok(!/display\s*=\s*on\s*\?\s*''\s*:\s*['"]none/.test(src),
    'no conditional hide either');
});

test('the picker is positively restored on every screen of the shell', () => {
  const src = strip(SHELL);
  const calls = src.match(/showPicker\(\)/g) || [];
  assert.ok(calls.length >= 3,
    'the category screen, a chosen category and the full list must all show it');
  const fn = src.slice(src.indexOf('function showPicker'));
  assert.match(fn, /el\.style\.display = '';/, 'and it must clear the display, not set it');
});

test('both routes to a template exist in the markup', () => {
  assert.match(ADMIN, /<div id="ps-shell"><\/div>/, 'the guided front door');
  assert.match(ADMIN, /<div class="ps-types" id="ps-types">/, 'and the full picker');
  assert.ok(ADMIN.indexOf('id="ps-shell"') < ADMIN.indexOf('id="ps-types"'),
    'the guide sits above the list it supplements');
});

test('choosing a template still goes through the original function', () => {
  assert.match(strip(SHELL), /global\.psSetType\s*===\s*'function'[\s\S]{0,80}psSetType\(t\)/,
    'the shell must not fork the selection logic');
});

test('the GOAL template is offered by the guided route', () => {
  assert.match(SHELL, /'kickoff', 'goal', 'yellow', 'red', 'halftime'/,
    'the state the operator needs mid-match must be one tap in');
});

// ── 2 · ONE TEMPLATE CANNOT DISABLE THE REST ────────────────────────────────

test('a cinematic failure falls back instead of taking the studio down', () => {
  assert.match(CINE, /catch \(e\) \{/);
  assert.match(CINE, /return false;/, 'a failure hands back to the original renderer');
  const psr = ADMIN.slice(ADMIN.indexOf('function psRender()'), ADMIN.indexOf('function psRender()') + 900);
  assert.match(psr, /try \{[\s\S]*StudioCinematic\.render\(\)[\s\S]*catch/,
    'and psRender must guard the call');
});

test('a throw during export cannot lock the download button forever', () => {
  // PS._busy was set before a re-render that could throw. Nothing cleared it,
  // so every later Download silently returned at the guard — a dead button on
  // a matchday, with no explanation.
  const fn = ADMIN.slice(ADMIN.indexOf('function psBuildBlob'), ADMIN.indexOf('function psExportBusy'));
  assert.match(fn, /catch \(err\) \{[\s\S]*PS\._busy = false;/,
    'the busy flag must clear on a failed pre-export render');
});

test('the studio does not depend on the campaign registries loading', () => {
  // The registries are fetched. A slow or failed fetch must not mean no Studio.
  assert.ok(CINE.indexOf('!ready) { clearMark(); return false; }') > -1,
    'not ready simply means the original renderer draws');
});

// ── 3 · WHAT A TEMPLATE CHANGE MUST NOT TOUCH ───────────────────────────────

test('the shell owns navigation only — no fields, no export, no data', () => {
  const src = strip(SHELL);
  ['psBuildBlob', 'psDownload', 'psShare', 'saveData', 'fetch('].forEach((f) =>
    assert.ok(!src.includes(f), 'the front door must not touch ' + f));
});
