// ════════════════════════════════════════════════════════════════════════════
// A LIVE FEED REPEATS ITSELF, AND A GOAL MUST NOT.
//
// The Live Content Desk polls the club's own match_events table every twenty
// seconds. That table already guarantees uniqueness — `unique (fixture_id,
// dedupe_key)`, with a column comment explaining the key deliberately excludes
// the provider's free text so tidying "Beau  Pryce" to "Beau Pryce" is not read
// as a second red card. That is a better guarantee than a browser could
// reconstruct, so this adapter trusts it rather than inventing a second one.
//
// What the adapter DOES own is the render path: the same row arriving on the
// next poll must update in place, not append. Twenty polls across a half must
// not produce twenty copies of the 68th-minute goal.
//
// AND IT INVENTS NOTHING. A scorer the provider did not send stays absent so
// Studio asks for it, rather than publishing a goal graphic with a blank where
// a player's name belongs. Retracted events disappear; corrected events are
// marked, because a graphic may already have been posted from the old version.
// ════════════════════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.join(__dirname, '..');
const E = require(path.join(ROOT, 'js/live-content-events.js'));

const row = (o) => Object.assign({
  id: 1, fixture_id: 'fx1', event_type: 'goal', minute: 68,
  side: 'home', team: 'Rayners Lane', player: 'Beau Pryce',
  score_home_after: 2, score_away_after: 1, dedupe_key: 'g-68-home',
  source: 'fwp', received_at: '2026-08-15T15:68:00Z'
}, o);

// ── 1 · THE SAME EVENT, POLLED REPEATEDLY ───────────────────────────────────

test('twenty polls of one goal produce one goal', () => {
  let list = [];
  for (let i = 0; i < 20; i++) list = E.merge(list, [row()], { ourSide: 'home' }).events;
  assert.strictEqual(list.length, 1, 'a repeated row must update, never append');
});

test('a genuinely new event is reported as new exactly once', () => {
  let r = E.merge([], [row()], {});
  assert.deepStrictEqual(r.newIds, ['1']);
  r = E.merge(r.events, [row()], {});
  assert.deepStrictEqual(r.newIds, [], 'the second poll must not re-announce it');
});

test('two different events both survive', () => {
  const r = E.merge([], [row(), row({ id: 2, minute: 71, event_type: 'yellow_card', player: 'X' })], {});
  assert.strictEqual(r.events.length, 2);
});

// ── 2 · CORRECTIONS AND RETRACTIONS ─────────────────────────────────────────

test('a retracted event leaves the timeline', () => {
  let r = E.merge([], [row()], {});
  assert.strictEqual(r.events.length, 1);
  r = E.merge(r.events, [row({ retracted_at: '2026-08-15T16:00:00Z' })], {});
  assert.strictEqual(r.events.length, 0, 'the provider withdrew it');
});

test('a corrected event is flagged, not silently swapped', () => {
  let r = E.merge([], [row()], {});
  r = E.merge(r.events, [row({ player: 'Someone Else', corrected_at: '2026-08-15T16:00:00Z' })], {});
  assert.strictEqual(r.events.length, 1);
  assert.strictEqual(r.events[0].corrected, true,
    'a graphic may already be posted from the old version');
  assert.deepStrictEqual(r.changedIds, ['1']);
});

// ── 3 · NOTHING IS INVENTED ─────────────────────────────────────────────────

test('a goal with no scorer does not acquire one', () => {
  const e = E.normalise(row({ player: null }), {});
  assert.strictEqual(e.player, null);
  assert.ok(!/undefined|null/.test(E.describe(e)));
});

test('no score is carried when the provider sent none', () => {
  const e = E.normalise(row({ score_home_after: null, score_away_after: null }), {});
  assert.strictEqual(e.scoreHome, null);
  assert.strictEqual(E.studioPrefill(e, { id: 'c', fixtureId: 'fx1' }).scoreHome, undefined);
});

test('an own goal keeps the scorer on their own side', () => {
  // It counts for us; he plays for them. player_side is what tells them apart.
  const e = E.normalise(row({ event_type: 'own_goal', own_goal: true, side: 'home', player_side: 'away' }), { ourSide: 'home' });
  assert.strictEqual(e.side, 'home');
  assert.strictEqual(e.playerSide, 'away');
  assert.match(E.describe(e), /own goal/);
});

// ── 4 · EVERY TYPE THE CLUB'S TABLE CAN HOLD ────────────────────────────────

test('every event_type the schema allows is mapped', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260801120000_live_match_v2.sql'), 'utf8');
  const block = sql.match(/event_type text not null\s*\n?\s*check \(event_type in \(([\s\S]*?)\)\)/);
  assert.ok(block, 'the CHECK constraint should still be readable');
  const types = [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(types.length >= 10);
  types.forEach((t) => assert.ok(E.TYPES[t], 'unmapped event type: ' + t));
});

test('an unknown type renders instead of crashing', () => {
  const e = E.normalise(row({ event_type: 'var_review' }), {});
  assert.strictEqual(e.known, false);
  assert.strictEqual(e.post, null, 'no content action for something we cannot describe');
  assert.ok(E.describe(e).length > 0);
});

// ── 5 · WHAT STUDIO RECEIVES ────────────────────────────────────────────────

test('a goal hands Studio everything the operator would otherwise retype', () => {
  const e = E.normalise(row(), { ourSide: 'home' });
  const p = E.studioPrefill(e, { id: 'c-x', fixtureId: 'fx1' });
  assert.strictEqual(p.type, 'goal');
  assert.strictEqual(p.player, 'Beau Pryce');
  assert.strictEqual(p.minute, "68'");
  assert.strictEqual(p.scoreHome, 2);
  assert.strictEqual(p.fixtureId, 'fx1');
  assert.strictEqual(p.campaignId, 'c-x');
});

test('a substitution carries both players', () => {
  const e = E.normalise(row({ event_type: 'substitution', player: 'Jones', assistant: 'Smith' }), {});
  const p = E.studioPrefill(e, {});
  assert.strictEqual(p.player, 'Jones');
  assert.strictEqual(p.playerOff, 'Smith');
  assert.match(E.describe(e), /Smith off, Jones on/);
});

test('events with no graphic offer no button', () => {
  ['second_half', 'correction', 'info'].forEach((t) => {
    assert.strictEqual(E.normalise(row({ event_type: t }), {}).post, null);
    assert.strictEqual(E.studioPrefill(E.normalise(row({ event_type: t }), {}), {}), null);
  });
});

test('stoppage time reads as football, not as minute 48', () => {
  assert.strictEqual(E.minuteLabel({ minute: 45, stoppage_minute: 3 }), "45+3'");
  assert.strictEqual(E.minuteLabel({ minute: 68 }), "68'");
});

// ── 6 · ORDERING AND RECOMMENDATION ─────────────────────────────────────────

test('newest first, by football minute', () => {
  const r = E.merge([], [row({ id: 1, minute: 12 }), row({ id: 2, minute: 68 }),
    row({ id: 3, minute: 45, stoppage_minute: 2 })], {});
  assert.deepStrictEqual(r.events.map((e) => e.id), ['2', '3', '1']);
});

test('in-the-moment events suggest Story; settled ones suggest a post', () => {
  assert.strictEqual(E.recommendedFormat(E.normalise(row(), {})), 'story');
  assert.strictEqual(E.recommendedFormat(E.normalise(row({ event_type: 'full_time' }), {})), 'square');
});

// ── 7 · THE DESK CONSUMES AUTHORITY, IT NEVER BECOMES IT ────────────────────

test('the adapter writes nothing back and polls no provider', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/live-content-events.js'), 'utf8');
  // Look for NETWORK calls, not the word "post" — the adapter legitimately has
  // a `post:` property naming the Studio content state, and matching that was
  // this test failing on its own vocabulary rather than on a real leak.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|supabase/i.test(code),
    'it transforms rows it is handed — it does not go and get them');
  assert.ok(!/method\s*:\s*['"](POST|PUT|PATCH|DELETE)/i.test(code),
    'and it never writes anything back');
});

test('the desk never publishes', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/live-content-desk.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(!/\b(publish|tweet|postTo|share_to|api\.instagram|graph\.facebook)\b/i.test(src),
    'every action prepares content for a human to export');
  assert.ok(/RLFCLive\.eventsFor/.test(src), 'and it reads the one authoritative source');
});

test('a dead feed degrades to a message, not a crash', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/live-content-desk.js'), 'utf8');
  assert.match(src, /Live data is temporarily unavailable/);
  assert.match(src, /Open Match Day Tools/, 'the manual tools stay reachable');
  assert.match(src, /\.catch\(function \(\) \{ state\.failed = true/);
});
