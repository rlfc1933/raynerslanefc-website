// GATE 7 — what the public sees about a player.
//
// The line these tests defend: a name the club has not confirmed gets no page,
// no portrait and no biography. It still appears on the team sheet, because
// leaving it off would misrepresent the match — it just is not a link.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const RP = require('../netlify/functions/lib/football/read-players');

const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** The body of one top-level function, so each can be checked on its own. */
function body(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start > 0, name + ' not found');
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error('unbalanced ' + name);
}

test('the public reads refuse anything not confirmed', () => {
  const s = strip(R('netlify/functions/lib/football/read-players.js'));
  // Every function a public page can reach filters on confirmation and on the
  // record not having been merged away. reviewQueue is deliberately excluded —
  // it exists to show the unconfirmed, and it is behind the portal.
  ['squad', 'playerDetail', 'statsByClubPlayer'].forEach((fn) => {
    const b = body(s, fn);
    assert.ok(b.includes('football_players'), fn + ' does not query players');
    assert.ok(b.includes('identity_status=eq.confirmed'), 'unconfirmed players leak from ' + fn);
    assert.ok(b.includes('merged_into_id=is.null'), 'merged-away players leak from ' + fn);
  });
});

test('a player page is refused even when the slug is guessed right', () => {
  const s = strip(R('netlify/functions/lib/football/read-players.js'));
  // Belt and braces: the query filters, AND the shared rule is applied to the
  // row that comes back. One of those alone is a single point of failure.
  assert.match(s, /if \(!p \|\| !ID\.isPublic\(p\)\)\s*return null/);
});

test('the identity queue is behind the portal, reads included', () => {
  const s = strip(R('netlify/functions/football-players.js'));
  const gate = s.indexOf('adminOk');
  const firstAction = s.indexOf("action === 'queue'");
  assert.ok(gate > 0 && gate < firstAction,
    'the sign-in check must come before any handling — it names real people');
});

test('every decision records who made it', () => {
  const s = strip(R('netlify/functions/football-players.js'));
  assert.match(s, /if \(!by\) return resp\(400/, 'a decision with no name against it is refused');
  ['confirm', 'reject', 'merge', 'unmerge'].forEach((a) => {
    assert.ok(s.includes("action: '" + a + "'"), a + ' is not written to the audit');
  });
});

test('nothing outside the portal can confirm an identity', () => {
  // The sync writes provisional records. If it could write confirmed ones, the
  // whole review step would be decoration.
  const sync = strip(R('netlify/functions/football-sync-match.js'));
  assert.ok(!/identity_status:\s*'confirmed'/.test(sync),
    'the sync must never confirm anybody');
  assert.match(sync, /Never 'confirmed' from a provider string alone|identity_status:/);
});

// ── the pages ───────────────────────────────────────────────────────────────
test('a team sheet links only the confirmed', () => {
  const read = strip(R('netlify/functions/lib/football/read.js'));
  assert.match(read, /identity_status === 'confirmed'[\s\S]{0,120}public_slug/,
    'the link is gated on confirmation');
  const mc = strip(R('js/match-centre.js'));
  assert.match(mc, /if \(p\.playerPage\)/, 'the row links only when given a page');
  // The name is always rendered, link or not.
  assert.match(mc, /var nm = esc\(p\.name\)/);
});

test('the squad card carries the roster\'s own id', () => {
  const s = strip(R('js/squad.js'));
  assert.match(s, /var id\s*=\s*p\.id \|\|/,
    'deriving an id from the name detaches apostrophed names from their record');
});

test('the squad and profile pages load the record', () => {
  assert.match(R('squad.html'), /js\/player-record\.js\?v=\d+/);
  assert.match(R('player.html'), /js\/player-record\.js\?v=\d+/);
});

test('an unknown number is a dash, never a zero', () => {
  const s = strip(R('js/player-record.js'));
  assert.match(s, /function stat\(v\) \{\s*return \(v == null\) \? '–'/);
  // hasRecord decides whether the block appears at all, so a genuine zero can
  // be shown as zero — but only once something IS established.
  const LR = { };
  const src = R('js/player-record.js');
  new Function('window', src)(LR);
  assert.strictEqual(LR.LaneRecord.stat(null), '–');
  assert.strictEqual(LR.LaneRecord.stat(0), '0', 'an established zero is a fact');
  assert.strictEqual(LR.LaneRecord.hasRecord(null), false);
  assert.strictEqual(LR.LaneRecord.hasRecord({ appearances: 0, goals: 0 }), false);
  assert.strictEqual(LR.LaneRecord.hasRecord({ appearances: 1 }), true);
});

test('minutes are shown only where they are known', () => {
  const LR = {};
  new Function('window', R('js/player-record.js'))(LR);
  const M = LR.LaneRecord.minutes;
  assert.strictEqual(M({ minutesKnown: false, minutes: null }), null);
  assert.strictEqual(M({ minutesKnown: true, minutes: 0 }), 0);
  assert.strictEqual(M({ minutesKnown: true, minutes: 90 }), 90);
  assert.strictEqual(M(null), null);

  const page = strip(R('player.html'));
  assert.match(page, /mins != null \? statCard\(mins, 'Minutes'\) : ''/,
    'the Minutes card must disappear rather than show a guess');
});

test('an unused substitute is described as one', () => {
  const LR = {};
  new Function('window', R('js/player-record.js'))(LR);
  const d = LR.LaneRecord.describe;
  assert.match(d({ unusedSubstitute: true }), /Unused substitute/);
  assert.match(d({ started: true, goals: 2 }), /Started · 2 goals/);
  assert.match(d({ substitute: true, redCards: 1 }), /Substitute · Sent off/);
  assert.match(d({ started: true, ownGoals: 1 }), /Own goal/);
  assert.ok(!/goal/.test(d({ started: true, goals: 0 })), 'no goals is not a claim about goals');
});

// ── totals shaped for a page ────────────────────────────────────────────────
test('a missing total is not a zero total', () => {
  const none = RP.shapeTotals(null);
  assert.strictEqual(none.minutes, null);
  assert.strictEqual(none.minutesKnown, false);

  const partial = RP.shapeTotals({ appearances: 3, goals: 1, minutes_played: null, minutes_confidence: 'unavailable' });
  assert.strictEqual(partial.appearances, 3, 'appearances are still known');
  assert.strictEqual(partial.minutes, null, 'minutes are not');
  assert.strictEqual(partial.minutesKnown, false);

  const exact = RP.shapeTotals({ minutes_played: 812, minutes_confidence: 'system_derived_high' });
  assert.strictEqual(exact.minutes, 812);
  assert.strictEqual(exact.minutesExact, true);
  const assumed = RP.shapeTotals({ minutes_played: 810, minutes_confidence: 'system_derived_partial' });
  assert.strictEqual(assumed.minutesExact, false, 'ninety was assumed, and it says so');
});

test('the identity controls are named for somebody who cannot see the row', () => {
  // A column of unlabelled selects and twenty identical "Confirm" buttons is
  // unusable without the visual context of which row you are on.
  const s = R('admin.html');
  const panel = s.slice(s.indexOf('window.identRefresh'), s.indexOf('window.healthRefresh'));
  assert.match(panel, /aria-label="Which of our players is/);
  assert.match(panel, /aria-label="Confirm '/);
  assert.match(panel, /is not one of our players/);
});

test('the emergency fold is a real disclosure, keyboard and all', () => {
  const s = R('admin.html');
  assert.match(s, /<details class="emerg">\s*\n\s*<summary>/,
    'native details/summary — a div with a click handler is not keyboard-reachable');
  assert.match(s, /\.emerg>summary\{[^}]*min-height:44px/,
    'the target must be big enough to hit on a phone on a touchline');
});
