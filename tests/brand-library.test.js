// ════════════════════════════════════════════════════════════════════════════
// THE SCREEN WHERE A GUESS BECOMES A PUBLISHED COLOUR.
//
// data/club-brands.json decides whether a club's colour reaches a public
// graphic. Until now the only way to see or change that was to edit JSON, so
// the four unconfirmed clubs were going to stay unconfirmed forever.
//
// The rule this UI serves: a machine suggestion and a confirmed palette are
// different kinds of thing, and only one of them reaches artwork. These tests
// hold the parts of that a redesign could quietly break — that a suggestion is
// never displayed as though it were confirmed, that the screen cannot promote
// anything by itself, and that hex codes stay out of the way of people who
// just want to check that New Bradwell are claret.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/brand-library.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css/brand-library.css'), 'utf8');
const ADMIN = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const BRANDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/club-brands.json'), 'utf8'));

function load(data) {
  const w = { fetch: () => Promise.resolve({ ok: false }), document: { getElementById: () => null } };
  const ctx = vm.createContext({ window: w, globalThis: w, document: w.document, fetch: w.fetch });
  vm.runInContext(SRC, ctx);
  if (data) w.BrandLibrary._state.data = data;
  return w.BrandLibrary;
}

// ── 1 · IT REFLECTS THE REGISTRY, NOT A HARDCODED NUMBER ────────────────────

test('the counts are derived from the registry', () => {
  const BL = load(BRANDS);
  const n = BL._counts();
  const opponents = BRANDS.clubs.filter((c) => c.id !== 'rayners-lane');
  assert.strictEqual(n.verified + n.review, opponents.length);
  assert.strictEqual(n.verified, opponents.filter((c) => c.verified).length);
  assert.ok(n.review >= 1, 'the deliberately unconfirmed clubs must still be surfaced');
});

test('Rayners Lane is not listed as an opponent to confirm', () => {
  const BL = load(BRANDS);
  const before = BL._counts().verified + BL._counts().review;
  assert.strictEqual(before, BRANDS.clubs.length - 1);
});

// ── 2 · A SUGGESTION IS NOT A CONFIRMED COLOUR ──────────────────────────────

test('an unconfirmed club is described as unconfirmed, in plain words', () => {
  const BL = load(BRANDS);
  const sug = BRANDS.clubs.find((c) => c.suggestion && !c.verified);
  assert.ok(sug, 'there should still be unconfirmed clubs');
  assert.match(BL._why(sug), /not confirmed/i);
});

test('a club with no confident sample says so rather than showing a colour', () => {
  const BL = load(BRANDS);
  const mono = BRANDS.clubs.find((c) => c.id !== 'rayners-lane' && !c.suggestion && !c.primary);
  assert.ok(mono, 'monochrome crests should still exist in the registry');
  assert.match(BL._why(mono), /no strong colour/i);
});

test('suggested swatches are drawn differently from confirmed ones', () => {
  // If they looked identical, the whole confirm step would be decorative.
  assert.match(SRC, /bl__sws--sug/, 'a suggestion needs its own treatment');
  assert.match(CSS, /\.bl__sws--sug \.bl__sw i\{[^}]*border-style:dashed/,
    'and that treatment has to be visible');
});

test('the owner-supplied palette is shown as coming from the club', () => {
  const BL = load(BRANDS);
  const nb = BRANDS.clubs.find((c) => c.id === 'new-bradwell-st-peter');
  assert.match(BL._why(nb), /Given by the club/i);
});

// ── 3 · THE SCREEN NEVER PROMOTES ANYTHING ON ITS OWN ───────────────────────

test('confirming requires a person, and records who', () => {
  const BL = load(JSON.parse(JSON.stringify(BRANDS)));
  const target = BL._state.data.clubs.find((c) => c.suggestion && !c.verified);
  assert.strictEqual(target.verified, false);
  BL.confirm(target.id);
  assert.strictEqual(target.verified, true, 'confirming promotes the suggestion');
  assert.match(target.provenance, /Confirmed in the Brand Library/,
    'and says who did it, so a wrong colour can be traced to a decision');
});

test('a club with nothing to confirm opens the editor instead of self-promoting', () => {
  const BL = load(JSON.parse(JSON.stringify(BRANDS)));
  const mono = BL._state.data.clubs.find((c) => c.id !== 'rayners-lane' && !c.suggestion && !c.primary);
  BL.confirm(mono.id);
  assert.strictEqual(mono.verified, false, 'nothing may be confirmed out of thin air');
  assert.strictEqual(BL._state.editing, mono.id, 'a human is asked for the colour');
});

test('loading the registry does not verify anything by itself', () => {
  const before = BRANDS.clubs.filter((c) => c.verified).length;
  load(BRANDS);
  assert.strictEqual(BRANDS.clubs.filter((c) => c.verified).length, before);
});

// ── 4 · IT SAVES THROUGH THE EXISTING, AUTHORISED PATH ──────────────────────

test('persistence goes through the portal save function, not a new endpoint', () => {
  assert.match(SRC, /global\.saveData\('club-brands'/,
    'the server authorises this exactly as it does every other data change');
  assert.ok(!/fetch\([^)]*netlify/.test(SRC), 'no private endpoint of its own');
  assert.ok(!/method:\s*'POST'/i.test(SRC), 'and no direct POST');
});

test('a page that cannot save says so instead of pretending', () => {
  assert.match(SRC, /Saved on screen only/,
    'silently losing a confirmed colour would be worse than refusing');
});

// ── 5 · COLOUR AS COLOUR ────────────────────────────────────────────────────

test('hex codes appear only inside the editor', () => {
  const beforeEditor = SRC.slice(0, SRC.indexOf('function editor'));
  assert.ok(!/bl-edit__hex/.test(beforeEditor),
    'nobody should have to read #A73666 to check a club is claret');
  assert.match(SRC.slice(SRC.indexOf('function editor')), /bl-edit__hex/);
});

test('it is wired into the portal and reachable from navigation', () => {
  assert.match(ADMIN, /<div id="brand-library"><\/div>/);
  assert.match(ADMIN, /if \(name === 'brandlibrary'\)/);
  const tools = fs.readFileSync(path.join(ROOT, 'js/portal-tools.js'), 'utf8');
  assert.match(tools, /id: 'brandlibrary'/, 'and listed in the registry');
  assert.match(tools, /'poststudio', 'brandlibrary'/, 'beside the tool that uses the colours');
});
