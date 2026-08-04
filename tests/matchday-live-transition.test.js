// THE MATCH-DAY DEADLOCK — found in the readiness audit on 4 August 2026,
// about an hour before kick-off at Broadfields United.
//
// The Match Centre polls every 15 seconds, but the condition was:
//
//     if (lastState.state === 'live' || 'delayed' || 'awaiting') load();
//
// The state only BECOMES 'awaiting' inside temporal(), which only runs inside
// render(), which only runs inside load(). So from 'upcoming' nothing could
// ever call load(). Meanwhile the countdown reached zero, printed "KICK OFF"
// and cleared its own timer.
//
// A supporter who opened the Match Centre before kick-off and left it open
// would sit on "KICK OFF" for ninety minutes. The score was updating; the page
// had simply stopped asking.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js/match-centre.js'), 'utf8');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

test('THE PAGE KEEPS ASKING ONCE KICK-OFF ARRIVES', async (t) => {
  await t.test('an upcoming match starts polling at kick-off', () => {
    assert.match(CODE, /s === 'upcoming' && lastFixture && lastFixture\.kickoffAt/,
      'without this the countdown hits zero and nothing ever re-fetches');
    assert.match(CODE, /Date\.now\(\) >= ko - 60000/,
      'polling should begin shortly BEFORE kick-off, not exactly on it');
  });

  await t.test('the fixture is retained so kick-off can be known', () => {
    assert.match(CODE, /var lastFixture = null/);
    assert.match(CODE, /lastFixture = d\.fixture/);
  });

  await t.test('live, delayed and awaiting still poll', () => {
    assert.match(CODE, /s === 'live' \|\| s === 'delayed' \|\| s === 'awaiting'/);
  });

  await t.test('a finished match stops polling', () => {
    // full_time must NOT be in the polling set — repolling a finished match
    // forever is noise against the provider.
    const poll = /poll = setInterval\([\s\S]*?\}, 15000\);/.exec(CODE)[0];
    assert.ok(!/full_time/.test(poll), 'a finished match is finished');
    assert.ok(!/postponed|cancelled/.test(poll), 'and so is a called-off one');
  });

  await t.test('the countdown still stops itself at zero', () => {
    assert.match(CODE, /KICK OFF<\/span>';\s*clearInterval\(cdTimer\)/,
      'the countdown must not run past zero — the poll takes over');
  });
});

test('THE TRANSITION LOGIC ITSELF', async (t) => {
  // Re-implement the guard exactly and drive it through a real match evening.
  function shouldPoll(state, kickoffAt, now) {
    if (state === 'live' || state === 'delayed' || state === 'awaiting') return true;
    if (state === 'upcoming' && kickoffAt) {
      const ko = Date.parse(kickoffAt);
      if (isFinite(ko) && now >= ko - 60000) return true;
    }
    return false;
  }
  const KO = Date.parse('2026-08-04T18:45:00+00:00');   // 19:45 BST, tonight

  await t.test('quiet in the afternoon', () => {
    assert.strictEqual(shouldPoll('upcoming', '2026-08-04T18:45:00+00:00', KO - 3 * 3600e3), false);
  });
  await t.test('wakes a minute before kick-off', () => {
    assert.strictEqual(shouldPoll('upcoming', '2026-08-04T18:45:00+00:00', KO - 59e3), true);
  });
  await t.test('polling through kick-off itself', () => {
    assert.strictEqual(shouldPoll('upcoming', '2026-08-04T18:45:00+00:00', KO), true);
    assert.strictEqual(shouldPoll('awaiting', '2026-08-04T18:45:00+00:00', KO + 60e3), true);
    assert.strictEqual(shouldPoll('live', '2026-08-04T18:45:00+00:00', KO + 30 * 60e3), true);
  });
  await t.test('half time keeps polling, full time stops', () => {
    assert.strictEqual(shouldPoll('live', '2026-08-04T18:45:00+00:00', KO + 50 * 60e3), true);
    assert.strictEqual(shouldPoll('full_time', '2026-08-04T18:45:00+00:00', KO + 115 * 60e3), false);
  });
  await t.test('a postponed match never polls', () => {
    assert.strictEqual(shouldPoll('postponed', '2026-08-04T18:45:00+00:00', KO), false);
  });
  await t.test('a fixture with no kick-off time cannot spin', () => {
    assert.strictEqual(shouldPoll('upcoming', null, KO + 3600e3), false);
    assert.strictEqual(shouldPoll('upcoming', 'not-a-date', KO + 3600e3), false);
  });
});
