// ════════════════════════════════════════════════════════════════════════════
// THE OTHER HALF OF THE LIVE CONTENT DESK.
//
// The desk could read the club's authoritative events and offer "Create
// update". Pressing it opened Studio and then stopped, because
// psApplyLivePrefill() did not exist — the function the desk called by name.
// The operator still typed the scorer, the minute and the score by hand, which
// are precisely the three things the feed had already told us, while the game
// carried on around them.
//
// What these tests hold:
//   · the whole chain works, from a match_events row to Studio's state
//   · nothing is invented — a fact the provider did not send stays absent
//   · an event type Studio has no template for does not become a dead button
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const EVENTS = require(path.join(ROOT, 'js/live-content-events.js'));
const SRC = fs.readFileSync(path.join(ROOT, 'js/live-prefill.js'), 'utf8');
const ADMIN = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');

/** A stand-in for Studio, recording what the bridge did to it. */
function studio() {
  const w = {
    PS: { type: 'matchday', size: 'ig', data: {} },
    calls: [],
    psSetType(k) { w.calls.push('setType:' + k); w.PS.type = k; w.PS.data = {}; },
    psApplyFixture(id) { w.calls.push('fixture:' + id); },
    psFields() { w.calls.push('fields'); },
    psRender() { w.calls.push('render'); }
  };
  const ctx = vm.createContext({ window: w, globalThis: w });
  vm.runInContext(SRC, ctx);
  return w;
}

const CAMPAIGN = { id: 'fx-1', fixtureId: 'fx-1' };

/** The real chain: a database-shaped row → adapter → bridge → Studio. */
function through(row) {
  const e = EVENTS.normalise(row, { ourSide: 'home' });
  const pre = EVENTS.studioPrefill(e, CAMPAIGN);
  if (pre) pre.format = EVENTS.recommendedFormat(e);
  const w = studio();
  const key = pre ? w.psApplyLivePrefill(pre) : null;
  return { w, pre, key };
}

// ── 1 · THE CHAIN CLOSES ────────────────────────────────────────────────────

test('a goal reaches Studio with its scorer, minute and score', () => {
  const { w, key } = through({
    id: '7', event_type: 'goal', minute: 67, side: 'home',
    player: 'Keiran Barnard-White', score_home_after: 2, score_away_after: 1
  });
  assert.strictEqual(key, 'goal');
  assert.strictEqual(w.PS.type, 'goal');
  assert.strictEqual(w.PS.data.minute, "67'");
  assert.strictEqual(w.PS.data.player, 'Keiran Barnard-White');
  assert.strictEqual(w.PS.data.score, '2–1');
  assert.ok(w.calls.includes('render'), 'and the card is drawn');
});

test('the fixture is applied AFTER the type, or it would be wiped', () => {
  // psSetType resets PS.data and re-seeds the next fixture. Applying the live
  // fixture first would be silently undone, and a full-time recap made after
  // the whistle would carry the NEXT match's crests.
  const { w } = through({ id: '1', event_type: 'goal', minute: 10, side: 'home', player: 'X' });
  assert.ok(w.calls.indexOf('setType:goal') < w.calls.indexOf('fixture:fx-1'),
    'order matters: ' + w.calls.join(' → '));
});

test('the recommended format reaches Studio as a size', () => {
  const goal = through({ id: '1', event_type: 'goal', minute: 10, side: 'home', player: 'X' });
  assert.strictEqual(goal.w.PS.size, 'story', 'in-the-moment events are stories');
  const ft = through({ id: '2', event_type: 'full_time', minute: 90, side: 'home',
    score_home_after: 2, score_away_after: 1 });
  assert.strictEqual(ft.w.PS.size, 'ig', 'settled events are square posts');
});

test('the event id is carried so a later correction can be traced', () => {
  const { w } = through({ id: '99', event_type: 'goal', minute: 5, side: 'home', player: 'X' });
  assert.strictEqual(w.PS._liveEventId, '99');
});

// ── 2 · NOTHING IS INVENTED ─────────────────────────────────────────────────

test('a goal with no scorer leaves the scorer for a human', () => {
  // A graphic naming the wrong player is worse than one naming nobody.
  const { w } = through({ id: '3', event_type: 'goal', minute: 12, side: 'home' });
  assert.strictEqual(w.PS.data.player, undefined);
  assert.strictEqual(w.PS.data.name, undefined);
});

test('an event with no score does not gain one', () => {
  const { w } = through({ id: '4', event_type: 'yellow_card', minute: 33, side: 'away', player: 'R. Deane' });
  assert.strictEqual(w.PS.data.score, undefined);
  assert.strictEqual(w.PS.data.scoreHome, undefined);
});

test('the bridge writes no football data anywhere', () => {
  assert.ok(!/method:\s*'POST'/i.test(SRC), 'it must never POST');
  assert.ok(!/fetch\(/.test(SRC), 'it must not reach the network at all');
});

// ── 3 · UNSUPPORTED AND UNKNOWN EVENTS ──────────────────────────────────────

test('a substitution produces a real graphic rather than a dead button', () => {
  // Studio has no substitution template. Routing it nowhere would leave the
  // desk offering a button that does nothing.
  const { w, key } = through({
    id: '5', event_type: 'substitution', minute: 62, side: 'home',
    player: 'Beau Pryce', assistant: 'Harry Bonner'
  });
  assert.strictEqual(key, 'announce');
  assert.strictEqual(w.PS.data.body, 'Harry Bonner off, Beau Pryce on');
});

test('an event with no graphic offers none', () => {
  const e = EVENTS.normalise({ id: '6', event_type: 'second_half', minute: 46 }, {});
  assert.strictEqual(EVENTS.studioPrefill(e, CAMPAIGN), null,
    'the desk must not show Create update for an event with no content state');
});

test('an unknown authoritative event degrades instead of throwing', () => {
  const e = EVENTS.normalise({ id: '8', event_type: 'hydration_break', minute: 30 }, {});
  assert.strictEqual(e.known, false);
  assert.strictEqual(e.post, null);
  assert.doesNotThrow(() => EVENTS.describe(e));
});

test('a prefill for a type Studio cannot build returns null, not a crash', () => {
  const w = studio();
  assert.strictEqual(w.psApplyLivePrefill({ type: 'no-such-state' }), null);
  assert.strictEqual(w.psApplyLivePrefill(null), null);
});

// ── 4 · IT IS ACTUALLY WIRED INTO THE PORTAL ────────────────────────────────

test('the desk, the adapter and the bridge are all loaded by the portal', () => {
  // The engine existing is not the feature. It has to be on the page.
  ['js/live-content-events.js', 'js/live-content-desk.js', 'js/live-prefill.js']
    .forEach((f) => assert.ok(ADMIN.includes(f), f + ' must be loaded by admin.html'));
  assert.match(ADMIN, /<div id="live-content-desk"><\/div>/,
    'and the desk needs somewhere to mount');
});

test('the desk calls the bridge by the name the bridge registers', () => {
  const desk = fs.readFileSync(path.join(ROOT, 'js/live-content-desk.js'), 'utf8');
  assert.match(desk, /window\.psApplyLivePrefill/);
  assert.match(SRC, /global\.psApplyLivePrefill = apply;/,
    'this pairing is the whole bug that was open');
});
