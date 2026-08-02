// GATE 8 — a whole season, end to end, offline.
//
// Individual rules are tested elsewhere. This asks a different question: after
// forty matches of substitutions, dismissals, own goals and misspellings, does
// the club's record of its players still add up?
//
// The season is generated from a fixed seed, so it is the same season every
// time this runs. A failure here is reproducible, not a coincidence.

const test = require('node:test');
const assert = require('node:assert');
const P = require('../netlify/functions/lib/football/participation');
const ID = require('../netlify/functions/lib/football/identity');

/* ── a deterministic season ───────────────────────────────────────────────── */
// Math.random would make a failure impossible to reproduce, which is the one
// thing a season-long simulation must not be.
function rng(seed) {
  let s = seed >>> 0;
  return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const SQUAD = ['Michael Adefolami', 'Beau Pryce', 'Keiran Barnard-White', "Le'Kai Chevannes",
  'Harry Bonner', 'Jordan Ellis', 'Sam Whitfield', 'Tom Reece', 'Ade Oyelaran',
  'Chris Nunn', 'Danny Fox', 'Ryan Sealy', 'Marcus Bell', 'Owen Pratt',
  'Jamie Todd', 'Kofi Mensah'];
const OPPO = ['A Smith', 'B Jones', 'C Patel', 'D O\'Brien', 'E Wright', 'F Khan',
  'G Adams', 'H Lloyd', 'I Barnes', 'J Doyle', 'K Frost', 'L Hall',
  'M Grant', 'N Poole', 'O Reid', 'P Vance'];

const COMPS = ['league', 'league', 'league', 'league', 'league_cup', 'fa_competition', 'friendly'];

function buildSeason(seed) {
  const r = rng(seed);
  const pick = (n) => Math.floor(r() * n);
  const matches = [];

  for (let m = 0; m < 40; m++) {
    const home = m % 2 === 0;
    const comp = COMPS[pick(COMPS.length)];
    // Sixteen named, eleven of whom start.
    const ourSquad = SQUAD.slice();
    const theirSquad = OPPO.slice();
    const events = [];
    const lineup = (names, side) => {
      const players = names.map((n, i) => ({
        name: i === 0 ? n + ' (C)' : n,
        role: i < 11 ? 'starter' : 'unused',
        enteredMinute: null, exitedMinute: null, isCaptain: i === 0,
      }));
      // Up to three substitutions, always a starter off and a named sub on.
      const subs = pick(4);
      for (let s = 0; s < subs; s++) {
        const off = players[1 + pick(10)];
        const on = players.filter((p) => p.role === 'unused')[0];
        if (!off || !on || off.exitedMinute != null) continue;
        const minute = 45 + pick(40);
        off.exitedMinute = minute;
        on.role = 'substitute';
        on.enteredMinute = minute;
        events.push({ type: 'substitution', side, player: on.name, assistant: off.name, minute });
      }
      return players;
    };

    const ours = lineup(ourSquad, home ? 'home' : 'away');
    const theirs = lineup(theirSquad, home ? 'away' : 'home');

    // Goals. Some are own goals — credited to nobody's tally.
    const goals = pick(5);
    for (let g = 0; g < goals; g++) {
      const own = r() < 0.12;
      const scorers = r() < 0.5 ? ours : theirs;
      const who = scorers.filter((p) => p.role !== 'unused')[pick(11)];
      if (!who) continue;
      events.push({
        type: own ? 'own_goal' : 'goal',
        side: scorers === ours ? (home ? 'home' : 'away') : (home ? 'away' : 'home'),
        player: who.name, minute: 1 + pick(89), ownGoal: own,
      });
    }

    // Cards, including the occasional second yellow.
    const cards = pick(4);
    for (let c = 0; c < cards; c++) {
      const list = r() < 0.5 ? ours : theirs;
      const who = list.filter((p) => p.role !== 'unused')[pick(11)];
      if (!who) continue;
      const side = list === ours ? (home ? 'home' : 'away') : (home ? 'away' : 'home');
      const straight = r() < 0.15;
      if (straight) events.push({ type: 'red_card', side, player: who.name, minute: 1 + pick(89) });
      else {
        events.push({ type: 'yellow_card', side, player: who.name, minute: 1 + pick(89) });
        if (r() < 0.18) events.push({ type: 'yellow_card', side, player: who.name, minute: 1 + pick(89) });
      }
    }

    matches.push({
      id: 'f' + m, home, competitionType: comp,
      lineups: home ? { home: { players: ours }, away: { players: theirs } }
                    : { home: { players: theirs }, away: { players: ours } },
      events,
      ourSide: home ? 'home' : 'away',
    });
  }
  return matches;
}

/** Run the season through the same functions production uses. */
function play(matches) {
  const records = [];
  matches.forEach((m) => {
    const recs = P.forFixture(m.lineups, m.events, { fullTimeMinute: 90 });
    recs.forEach((rec) => {
      records.push(Object.assign(rec, {
        fixtureId: m.id, season: '2026-27', competitionType: m.competitionType,
        teamId: rec.side === m.ourSide ? 1 : 2,
      }));
    });
  });
  return records;
}

const SEASON = buildSeason(20260801);
const RECORDS = play(SEASON);
const OURS = RECORDS.filter((r) => r.teamId === 1);

/* ── the invariants ───────────────────────────────────────────────────────── */

test('the season simulation actually produced a season', () => {
  assert.strictEqual(SEASON.length, 40);
  assert.strictEqual(OURS.length, 40 * 16, 'sixteen named every week');
  assert.ok(RECORDS.filter((r) => r.goals > 0).length > 20, 'somebody scored');
  assert.ok(RECORDS.filter((r) => r.redCards > 0).length > 0, 'somebody was sent off');
  assert.ok(RECORDS.filter((r) => r.ownGoals > 0).length > 0, 'somebody put through his own net');
});

test('an appearance is always a start or a substitute appearance — never neither, never both', () => {
  RECORDS.forEach((r) => {
    if (r.appearance) {
      assert.ok(r.started !== r.substitute, r.name + ' in a match appeared as ' +
        JSON.stringify({ started: r.started, substitute: r.substitute }));
    } else {
      assert.strictEqual(r.started, false);
      assert.strictEqual(r.substitute, false);
    }
  });
});

test('AN UNUSED SUBSTITUTE IS NEVER AN APPEARANCE, all season', () => {
  const unused = RECORDS.filter((r) => r.unusedSubstitute);
  assert.ok(unused.length > 40, 'there were plenty of them');
  unused.forEach((r) => {
    assert.strictEqual(r.appearance, false);
    assert.strictEqual(r.minutesPlayed, 0);
  });
});

test('every goal in the timeline is credited to exactly one player, and no own goal is', () => {
  let realGoals = 0, ownGoals = 0;
  SEASON.forEach((m) => m.events.forEach((e) => {
    if (e.type === 'goal') realGoals++;
    if (e.type === 'own_goal') ownGoals++;
  }));
  const credited = RECORDS.reduce((n, r) => n + r.goals, 0);
  const ownCredited = RECORDS.reduce((n, r) => n + r.ownGoals, 0);
  assert.strictEqual(credited, realGoals, 'goals must not be lost or duplicated');
  assert.strictEqual(ownCredited, ownGoals);
  // The point of the rule: own goals appear in nobody's goal column.
  RECORDS.filter((r) => r.ownGoals > 0).forEach((r) => {
    const inThatMatch = SEASON.filter((m) => m.id === r.fixtureId)[0];
    const his = inThatMatch.events.filter((e) => P.norm(e.player) === P.norm(r.name));
    assert.strictEqual(r.goals, his.filter((e) => e.type === 'goal').length);
  });
});

test('nobody is sent off twice in one match', () => {
  RECORDS.forEach((r) => assert.ok(r.redCards <= 1, r.name + ' got ' + r.redCards + ' reds'));
});

test('a dismissed player stops playing at the dismissal', () => {
  RECORDS.filter((r) => r.dismissedMinute != null && r.minutesPlayed != null).forEach((r) => {
    const start = r.started ? 0 : r.enteredMinute;
    assert.strictEqual(r.minutesPlayed, r.dismissedMinute - start,
      r.name + ' kept playing after being sent off');
  });
});

test('minutes never exceed the match, and never go backwards', () => {
  RECORDS.forEach((r) => {
    if (r.minutesPlayed == null) return;
    assert.ok(r.minutesPlayed >= 0, r.name + ' played negative minutes');
    assert.ok(r.minutesPlayed <= 90, r.name + ' played ' + r.minutesPlayed + ' minutes');
  });
});

/* ── the totals ───────────────────────────────────────────────────────────── */

test('season totals reconcile with the match records they came from', () => {
  const totals = P.aggregate(OURS, { season: '2026-27' });
  totals.forEach((a) => {
    const his = OURS.filter((r) => P.norm(r.name) === P.norm(a.name));
    assert.strictEqual(a.appearances, his.filter((r) => r.appearance).length, a.name + ' appearances');
    assert.strictEqual(a.starts, his.filter((r) => r.started).length, a.name + ' starts');
    assert.strictEqual(a.goals, his.reduce((n, r) => n + r.goals, 0), a.name + ' goals');
    assert.strictEqual(a.appearances, a.starts + a.substituteAppearances, a.name + ' does not add up');
  });
});

test('the competition scopes partition the season exactly', () => {
  const all = P.aggregate(OURS, { season: '2026-27' });
  const total = all.reduce((n, a) => n + a.appearances, 0);
  const parts = ['league', 'league_cup', 'fa_competition', 'friendly']
    .map((c) => P.aggregate(OURS, { season: '2026-27', competitionType: c })
      .reduce((n, a) => n + a.appearances, 0))
    .reduce((n, x) => n + x, 0);
  assert.strictEqual(parts, total, 'every appearance belongs to exactly one competition');
});

test('THE WHOLE SEASON IS DETERMINISTIC', () => {
  // Same seed, same season, same records. Without this, a difference between
  // two runs could be a bug or could be the dice, and nobody could tell.
  const again = play(buildSeason(20260801));
  assert.deepStrictEqual(again, RECORDS);
  assert.deepStrictEqual(P.aggregate(again, {}), P.aggregate(RECORDS, {}));
  // A different season is genuinely different, or the seed is doing nothing.
  const other = play(buildSeason(1));
  assert.notDeepStrictEqual(other, RECORDS);
});

test('recomputing twice changes nothing; correcting once changes one thing', () => {
  const before = P.aggregate(OURS, { season: '2026-27' });
  assert.deepStrictEqual(P.aggregate(OURS, { season: '2026-27' }), before);

  // A scorer corrected: one goal moved from one player to another.
  const scorer = OURS.filter((r) => r.goals > 0)[0];
  const other = OURS.filter((r) => r.fixtureId === scorer.fixtureId
    && P.norm(r.name) !== P.norm(scorer.name) && r.appearance)[0];
  const corrected = OURS.map((r) => {
    if (r === scorer) return Object.assign({}, r, { goals: r.goals - 1 });
    if (r === other) return Object.assign({}, r, { goals: (r.goals || 0) + 1 });
    return r;
  });
  const after = P.aggregate(corrected, { season: '2026-27' });

  const totalBefore = before.reduce((n, a) => n + a.goals, 0);
  const totalAfter = after.reduce((n, a) => n + a.goals, 0);
  assert.strictEqual(totalAfter, totalBefore, 'the club still scored the same number');
  const find = (list, name) => list.filter((a) => P.norm(a.name) === P.norm(name))[0];
  assert.strictEqual(find(after, scorer.name).goals, find(before, scorer.name).goals - 1);
  assert.strictEqual(find(after, other.name).goals, (find(before, other.name) || { goals: 0 }).goals + 1);
});

/* ── identity, over a season of spellings ─────────────────────────────────── */

test('a season of misspellings never merges two different people', () => {
  const index = {};
  SQUAD.forEach((n, i) => {
    index['1|' + n.toLowerCase()] = { id: i + 1, canonical_name: n, current_team_id: 1 };
  });
  // The opposition list is full of initials — exactly the shape that tempts a
  // fuzzy matcher into merging strangers.
  OPPO.forEach((n, i) => {
    index['2|' + n.toLowerCase()] = { id: 100 + i, canonical_name: n, current_team_id: 2 };
  });

  let merged = 0;
  OPPO.forEach((n) => {
    const r = ID.resolve(n, 1, { index });   // the same name, but on OUR side
    if (r.playerId != null) merged++;
  });
  assert.strictEqual(merged, 0, 'an opposition name was attached to one of our players');

  // And our own squad still resolves cleanly to itself.
  SQUAD.forEach((n, i) => {
    assert.strictEqual(ID.resolve(n, 1, { index }).playerId, i + 1, n + ' failed to resolve');
    assert.strictEqual(ID.resolve(n + ' (C)', 1, { index }).playerId, i + 1, n + ' with the armband');
  });
});

test('the captain marker never doubles anybody up across a season', () => {
  const totals = P.aggregate(OURS, { season: '2026-27' });
  const names = totals.map((a) => P.norm(a.name));
  assert.strictEqual(new Set(names).size, names.length, 'a player appears twice in the totals');
  assert.ok(!names.some((n) => /\(c\)/.test(n)), 'an armband created a second player');
});
