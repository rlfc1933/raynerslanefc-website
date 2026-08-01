// Match timing — the same instant everywhere on earth.
//
// The defect these lock down was real and public: the homepage told a supporter
// in Los Angeles the match started in seven hours while Rayners Lane were
// playing the second half at Tithe Farm. The cause was `new Date("2026-08-01T
// 15:00:00")` — an offset-less string, which every browser reads in ITS OWN
// timezone.
//
// Each test runs the SAME assertions under six real timezones by setting
// process.env.TZ and re-requiring the module, which is as close as Node gets to
// "open the site in Sydney".

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const MODULE = path.join(__dirname, '..', 'js', 'match-time.js');

const ZONES = [
  'Europe/London',
  'America/Los_Angeles',
  'America/New_York',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Australia/Sydney',
];

/** Load the utility as if the page were open in `tz`. */
function inZone(tz, fn) {
  const before = process.env.TZ;
  process.env.TZ = tz;
  delete require.cache[require.resolve(MODULE)];
  const MT = require(MODULE);
  try { return fn(MT); } finally {
    process.env.TZ = before;
    delete require.cache[require.resolve(MODULE)];
  }
}

test('a BST fixture is the same instant in every timezone', () => {
  // 1 Aug 2026, 15:00 in London = 14:00 UTC (British Summer Time).
  const expected = Date.UTC(2026, 7, 1, 14, 0, 0);
  for (const tz of ZONES) {
    inZone(tz, (MT) => {
      const ko = MT.parseLondonKickoff('2026-08-01', '15:00');
      assert.strictEqual(ko, expected, tz + ' derived a different kick-off');
    });
  }
});

test('a GMT fixture is the same instant in every timezone', () => {
  // 5 Dec 2026, 15:00 in London = 15:00 UTC (no DST in December).
  const expected = Date.UTC(2026, 11, 5, 15, 0, 0);
  for (const tz of ZONES) {
    inZone(tz, (MT) => {
      assert.strictEqual(MT.parseLondonKickoff('2026-12-05', '15:00'), expected, tz);
    });
  }
});

test('clock changes are handled by the zone, not by a hand-rolled summer rule', () => {
  // BST begins 29 Mar 2026, ends 25 Oct 2026 (last Sundays).
  inZone('UTC', (MT) => {
    // Day before the spring change: GMT.
    assert.strictEqual(MT.parseLondonKickoff('2026-03-28', '15:00'), Date.UTC(2026, 2, 28, 15, 0));
    // Day after: BST.
    assert.strictEqual(MT.parseLondonKickoff('2026-03-30', '15:00'), Date.UTC(2026, 2, 30, 14, 0));
    // Day before the autumn change: still BST.
    assert.strictEqual(MT.parseLondonKickoff('2026-10-24', '15:00'), Date.UTC(2026, 9, 24, 14, 0));
    // Day after: back to GMT.
    assert.strictEqual(MT.parseLondonKickoff('2026-10-26', '15:00'), Date.UTC(2026, 9, 26, 15, 0));
  });
});

test('an evening kick-off is not dragged into the wrong day', () => {
  const expected = Date.UTC(2026, 7, 4, 18, 45, 0);   // 19:45 BST
  for (const tz of ZONES) {
    inZone(tz, (MT) => {
      assert.strictEqual(MT.parseLondonKickoff('2026-08-04', '19:45'), expected, tz);
    });
  }
});

test('THE LOS ANGELES BUG: no countdown while the match is being played', () => {
  // The exact situation the chairman hit. Kick-off 15:00 BST; it is now 16:20
  // BST and the game is in the second half.
  const fixture = { date: '2026-08-01', kickoff: '15:00' };
  const now = Date.UTC(2026, 7, 1, 15, 20, 0);          // 16:20 BST
  const live = { is_live: true, period: 'second_half', match_minute: 64, is_final: false };

  for (const tz of ZONES) {
    inZone(tz, (MT) => {
      const st = MT.temporalState(fixture, live, now);
      assert.strictEqual(st.state, 'live', tz + ' should be live');
      assert.strictEqual(st.showCountdown, false, tz + ' must NOT show a countdown');
      assert.strictEqual(st.period, 'second_half', tz);
      // And the old broken maths must be gone: the kick-off is in the past
      // everywhere, not seven hours away in California.
      assert.ok(st.kickoff < now, tz + ' thinks kick-off has not happened yet');
      assert.strictEqual(MT.formatCountdown(st.kickoff, now), null, tz + ' produced a countdown');
    });
  }
});

test('before kick-off every region counts down the same duration', () => {
  const fixture = { date: '2026-08-01', kickoff: '15:00' };
  const now = Date.UTC(2026, 7, 1, 12, 0, 0);   // 13:00 BST — two hours to go
  const seen = new Set();
  for (const tz of ZONES) {
    inZone(tz, (MT) => {
      const st = MT.temporalState(fixture, null, now);
      assert.strictEqual(st.state, 'upcoming', tz);
      assert.strictEqual(st.showCountdown, true, tz);
      const cd = MT.formatCountdown(st.kickoff, now);
      assert.strictEqual(cd.hours, 2, tz);
      assert.strictEqual(cd.days, 0, tz);
      seen.add(cd.total);
    });
  }
  assert.strictEqual(seen.size, 1, 'regions disagreed on how long is left: ' + [...seen]);
});

test('the countdown never runs negative and stops exactly at kick-off', () => {
  inZone('America/Los_Angeles', (MT) => {
    const ko = MT.parseLondonKickoff('2026-08-01', '15:00');
    assert.ok(MT.formatCountdown(ko, ko - 1000).total > 0);
    assert.strictEqual(MT.formatCountdown(ko, ko), null, 'at kick-off the countdown ends');
    assert.strictEqual(MT.formatCountdown(ko, ko + 60000), null, 'never negative');
  });
});

test('kick-off passed with no report says so instead of inventing a state', () => {
  const fixture = { date: '2026-08-01', kickoff: '15:00' };
  inZone('Europe/London', (MT) => {
    const ko = MT.parseLondonKickoff('2026-08-01', '15:00');
    assert.strictEqual(MT.temporalState(fixture, null, ko + 5 * 60000).state, 'kickoff_due');
    assert.strictEqual(MT.temporalState(fixture, null, ko + 60 * 60000).state, 'awaiting_update');
    // Never a countdown once the moment has gone.
    [5, 60, 200].forEach((m) => {
      assert.strictEqual(MT.temporalState(fixture, null, ko + m * 60000).showCountdown, false);
    });
  });
});

test('a trusted source outranks the clock', () => {
  const fixture = { date: '2026-08-01', kickoff: '15:00' };
  inZone('Asia/Kolkata', (MT) => {
    const ko = MT.parseLondonKickoff('2026-08-01', '15:00');
    // Source says full time even though only 20 minutes have passed — the source wins.
    const ft = MT.temporalState(fixture, { is_final: true, period: 'full_time' }, ko + 20 * 60000);
    assert.strictEqual(ft.state, 'full_time');
    assert.strictEqual(ft.showCountdown, false);
    // Source says live BEFORE the scheduled time (early kick-off) — still live,
    // and crucially not a countdown.
    const early = MT.temporalState(fixture, { is_live: true, period: 'first_half' }, ko - 10 * 60000);
    assert.strictEqual(early.state, 'live');
    assert.strictEqual(early.showCountdown, false);
  });
});

test('postponed and cancelled never show a countdown', () => {
  const fixture = { date: '2026-08-01', kickoff: '15:00' };
  inZone('Europe/London', (MT) => {
    const before = Date.UTC(2026, 7, 1, 9, 0, 0);
    for (const p of ['postponed', 'cancelled', 'abandoned', 'delayed']) {
      const st = MT.temporalState(fixture, { period: p }, before);
      assert.strictEqual(st.state, p);
      assert.strictEqual(st.showCountdown, false, p + ' must not count down');
    }
  });
});

test('invalid or missing times fail safely rather than defaulting to now', () => {
  inZone('Europe/London', (MT) => {
    for (const bad of [null, undefined, '', 'soon', '2026-13-45', 'TBC']) {
      assert.ok(isNaN(MT.parseLondonKickoff(bad, '15:00')), 'should reject: ' + bad);
    }
    assert.ok(isNaN(MT.parseLondonKickoff('2026-08-01', 'teatime')));
    const st = MT.temporalState({ date: 'nonsense' }, null, Date.now());
    assert.strictEqual(st.state, 'unknown');
    assert.strictEqual(st.showCountdown, false, 'unknown must not count down');
  });
});

test('a combined date-time with no offset is club time, with an offset is absolute', () => {
  for (const tz of ZONES) {
    inZone(tz, (MT) => {
      // This is the exact string loadMatchDay() builds.
      assert.strictEqual(MT.kickoffEpoch({ date: '2026-08-01T15:00:00' }),
        Date.UTC(2026, 7, 1, 14, 0, 0), tz + ' misread an offset-less date-time');
      // An explicit offset must be honoured as-is.
      assert.strictEqual(MT.kickoffEpoch({ date: '2026-08-01T15:00:00Z' }),
        Date.UTC(2026, 7, 1, 15, 0, 0), tz);
      // A stored timestamptz from Supabase is already absolute.
      assert.strictEqual(MT.kickoffEpoch({ scheduled_kickoff: '2026-08-01T14:00:00+00:00' }),
        Date.UTC(2026, 7, 1, 14, 0, 0), tz);
    });
  }
});

test('fixture ordering is identical in every timezone', () => {
  const list = [
    { id: 'c', date: '2026-08-11', kickoff: '19:45' },
    { id: 'a', date: '2026-08-01', kickoff: '15:00' },
    { id: 'b', date: '2026-08-04', kickoff: '19:45' },
  ];
  const orders = new Set();
  for (const tz of ZONES) {
    inZone(tz, (MT) => {
      const sorted = list.slice().sort((x, y) => MT.fixtureSortKey(x) - MT.fixtureSortKey(y));
      orders.add(sorted.map((f) => f.id).join(','));
    });
  }
  assert.deepStrictEqual([...orders], ['a,b,c'], 'fixture order varied by viewer timezone');
});

test('the official kick-off is always shown in club time', () => {
  // A supporter in Sydney must still be told the match is at 15:00, because
  // that is what the club published — their own time is optional extra.
  for (const tz of ZONES) {
    inZone(tz, (MT) => {
      const ko = MT.parseLondonKickoff('2026-08-01', '15:00');
      assert.strictEqual(MT.formatKickoffClub(ko), '15:00', tz + ' showed the wrong official time');
    });
  }
});

test('an admin in Los Angeles entering 15:00 stores 15:00 UK', () => {
  // The portal saves what staff typed as club time regardless of where they are.
  inZone('America/Los_Angeles', (MT) => {
    assert.strictEqual(MT.parseLondonKickoff('2026-08-01', '15:00'), Date.UTC(2026, 7, 1, 14, 0, 0));
    assert.strictEqual(MT.formatKickoffClub(MT.parseLondonKickoff('2026-08-01', '15:00')), '15:00');
  });
});
