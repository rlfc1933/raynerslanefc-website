// The Football Web Pages adapter, tested against REAL captured responses.
//
// Every fixture in tests/fixtures/fwp/ was captured from the provider during
// Rayners Lane 2-1 Wallingford & Crowmarsh on 1 August 2026 — the club's first
// competitive fixture of the season. Testing against invented HTML would only
// prove the parser agrees with my guess about the markup.
//
// The rules these lock down are the ones that would put a WRONG score on the
// public website, which is the only failure here that really matters.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const A = require('../netlify/functions/lib/fwp-adapter');
const sync = require('../netlify/functions/fwp-sync');

const FX = path.join(__dirname, 'fixtures', 'fwp');
const read = (f) => fs.readFileSync(path.join(FX, f), 'utf8');
const liveHtml = read('match-live.html');

test('parses the live match: score, clock, period', () => {
  const p = A.parseMatch(liveHtml);
  assert.ok(p, 'should parse');
  assert.strictEqual(p.home.name, 'Rayners Lane');
  assert.strictEqual(p.away.name, 'Wallingford & Crowmarsh');
  assert.strictEqual(p.homeScore, 2);
  assert.strictEqual(p.awayScore, 1);
  assert.strictEqual(p.period, 'first_half');
  assert.strictEqual(p.isLive, true);
  assert.strictEqual(p.isFinal, false);
});

test('reads stoppage time as minute + stoppage, not 455 minutes', () => {
  // "45+5'" is the format that would silently become nonsense under a naive
  // \d+ match.
  const p = A.parseMatch(liveHtml);
  assert.strictEqual(p.matchMinute, 45);
  assert.strictEqual(p.stoppageMinute, 5);
  assert.deepStrictEqual(A.parseMinute("45+1'"), { minute: 45, stoppage: 1 });
  assert.deepStrictEqual(A.parseMinute("13'"), { minute: 13, stoppage: 0 });
  assert.deepStrictEqual(A.parseMinute(''), { minute: null, stoppage: null });
});

test('carries competition, venue and referee', () => {
  const p = A.parseMatch(liveHtml);
  assert.match(p.competition, /Combined Counties/);
  assert.strictEqual(p.referee, 'Nathan Parrin');
  assert.match(p.venue, /Tithe Farm/);
});

test('every event is attributed to a team', () => {
  // Two events were unattributed on the first run: a red card (the sent-off
  // player's <li> has no class) and the captain's goal (his line-up name is
  // suffixed "(C)"). Both are permanent traps in this markup.
  const p = A.parseMatch(liveHtml);
  assert.ok(p.events.length >= 6, 'expected the full timeline');
  const orphans = p.events.filter((e) => !e.team);
  assert.deepStrictEqual(orphans.map((e) => e.player), [], 'unattributed events');
});

test('an own goal counts for the other team, but stays the scorer’s own event', () => {
  const p = A.parseMatch(liveHtml);
  const og = p.events.find((e) => e.ownGoal);
  assert.ok(og, 'own goal present');
  assert.strictEqual(og.player, 'Harry Bonner');
  assert.strictEqual(og.team, 'Rayners Lane', 'og credited to us');
  assert.strictEqual(og.playerTeam, 'Wallingford & Crowmarsh', 'scored by their player');
});

test('yellow and red cards are recognised from the provider’s own words', () => {
  const p = A.parseMatch(liveHtml);
  const reds = p.events.filter((e) => e.type === 'red_card');
  const yellows = p.events.filter((e) => e.type === 'yellow_card');
  assert.strictEqual(reds.length, 1);
  assert.strictEqual(reds[0].player, 'Beau Pryce');   // note: provider sends "Beau  Pryce"
  assert.strictEqual(yellows.length, 2);
});

test('line-ups include substitutes and the sent-off player', () => {
  const p = A.parseMatch(liveHtml);
  assert.strictEqual(p.home.lineUp.length, 16);
  assert.strictEqual(p.away.lineUp.length, 16);
  const cap = p.home.lineUp.find((x) => x.isCaptain);
  assert.ok(cap, 'captain flagged');
  assert.strictEqual(cap.name, 'Keiran Barnard-White', 'name stored without the (C) suffix');
});

test('HTML entities in names are decoded', () => {
  const p = A.parseMatch(liveHtml);
  const scorer = p.events.find((e) => /Cruz/.test(e.player));
  assert.ok(scorer, 'away scorer present');
  assert.ok(!/&rsquo;|&amp;/.test(scorer.player), 'no raw entities: ' + scorer.player);
});

test('our view puts Rayners Lane goals first, home or away', () => {
  const p = A.parseMatch(liveHtml);
  const v = A.ourView(p);
  assert.strictEqual(v.isHome, true);
  assert.strictEqual(v.us, 2);
  assert.strictEqual(v.them, 1);
  assert.strictEqual(v.opponent, 'Wallingford & Crowmarsh');

  // Same fixture with the teams swapped — the orientation must follow the club,
  // not the column. This is the bug the old manual system shipped twice.
  const away = JSON.parse(JSON.stringify(p));
  away.home = p.away; away.away = p.home;
  away.homeScore = p.awayScore; away.awayScore = p.homeScore;
  const v2 = A.ourView(away);
  assert.strictEqual(v2.isHome, false);
  assert.strictEqual(v2.us, 2, 'our goals stay ours when away');
  assert.strictEqual(v2.them, 1);
});

test('half time stops the clock instead of freezing it at 45', () => {
  const files = fs.existsSync(path.join(FX, 'timeline'))
    ? fs.readdirSync(path.join(FX, 'timeline')).filter((f) => /Half-Time/i.test(f))
    : [];
  if (!files.length) return;   // captured opportunistically; absence is not failure
  const p = A.parseMatch(fs.readFileSync(path.join(FX, 'timeline', files[0]), 'utf8'));
  assert.strictEqual(p.period, 'half_time');
  assert.strictEqual(p.matchMinute, null, 'no running clock at half time');
  assert.strictEqual(p.isLive, true, 'still a live match, just not a running clock');
  assert.strictEqual(p.isFinal, false);
});

test('rejects a response that is not our match', () => {
  const p = A.parseMatch(liveHtml);
  const wrongOpp = A.validateMatch(p, { opponent: 'Hilltop', isHome: true });
  assert.strictEqual(wrongOpp.ok, false);
  assert.match(wrongOpp.errors.join(' '), /opponent mismatch/);

  const wrongVenue = A.validateMatch(p, { opponent: 'Wallingford & Crowmarsh', isHome: false });
  assert.strictEqual(wrongVenue.ok, false);
  assert.match(wrongVenue.errors.join(' '), /home\/away mismatch/);

  const right = A.validateMatch(p, { opponent: 'Wallingford & Crowmarsh', isHome: true });
  assert.strictEqual(right.ok, true);
});

test('rejects rubbish rather than publishing 0-0', () => {
  // Every one of these used to be a plausible route to a fake scoreline.
  for (const junk of ['', null, undefined, '<html><body>Just a moment...</body></html>', '{"type":"refresh"}', '<div>nothing</div>']) {
    assert.strictEqual(A.parseMatch(junk), null, 'should refuse: ' + String(junk).slice(0, 30));
  }
  assert.strictEqual(A.validateMatch(null, {}).ok, false);
});

test('an unreadable status is never treated as live', () => {
  const s = A.parseStatus('<span class="status">Something we have never seen</span>');
  assert.strictEqual(s.period, 'unknown');
  assert.strictEqual(s.isLive, false, 'unknown must not imply live');
  assert.strictEqual(s.isFinal, false);
});

test('full time is final and not live', () => {
  const s = A.parseStatus('<span class="status">Full Time</span>');
  assert.strictEqual(s.period, 'full_time');
  assert.strictEqual(s.isFinal, true);
  assert.strictEqual(s.isLive, false);
  assert.strictEqual(s.matchMinute, null);
});

test('off-states are recognised and are not live', () => {
  for (const [text, want] of [['Postponed', 'postponed'], ['Match Abandoned', 'abandoned'], ['Cancelled', 'cancelled']]) {
    const s = A.parseStatus('<span class="status">' + text + '</span>');
    assert.strictEqual(s.period, want);
    assert.strictEqual(s.isLive, false, text + ' must not be live');
  }
});

test('event keys are stable across polls but distinct between events', () => {
  const p = A.parseMatch(liveHtml);
  const keys = p.events.map((e) => A.eventKey('fwp-578225', e));
  assert.strictEqual(new Set(keys).size, keys.length, 'no two events share a key');

  // Re-parsing the identical payload must produce identical keys — this is what
  // stops 30-second polling turning one goal into a hundred.
  const again = A.parseMatch(liveHtml).events.map((e) => A.eventKey('fwp-578225', e));
  assert.deepStrictEqual(again, keys);

  // Provider tidying whitespace in a name must NOT read as a new event.
  const messy = Object.assign({}, p.events[1], { player: 'Beau  Pryce ' });
  assert.strictEqual(A.eventKey('fwp-578225', messy), A.eventKey('fwp-578225', p.events[1]));
});

test('club name normalisation matches the fixtures importer', () => {
  assert.strictEqual(A.normClub('Punjab Utd FC'), A.normClub('Punjab United'));
  assert.strictEqual(A.normClub('Wallingford & Crowmarsh'), A.normClub('Wallingford and Crowmarsh'));
  assert.notStrictEqual(A.normClub('Rayners Lane'), A.normClub('Hilltop'));
});

// ── sync decision logic (no network) ───────────────────────────────────────
test('only fixtures carrying a provider id are eligible', () => {
  const { externalIdOf } = sync._internal;
  assert.strictEqual(externalIdOf({ id: 'fwp-578225' }), '578225');
  assert.strictEqual(externalIdOf({ id: 'friendly-cockfosters-20260718' }), null);
  assert.strictEqual(externalIdOf({ id: 'facup-ep-london-lions-20260808' }), null);
  assert.strictEqual(externalIdOf({}), null);
});

test('the match window opens before kick-off and closes after', () => {
  const { inWindow, ukEpoch } = sync._internal;
  const f = { date: '2026-08-01', kickoff: '15:00' };
  const ko = ukEpoch('2026-08-01', '15:00');
  assert.strictEqual(inWindow(f, ko), true, 'at kick-off');
  assert.strictEqual(inWindow(f, ko + 60 * 60000), true, 'an hour in');
  assert.strictEqual(inWindow(f, ko - 5 * 60000), true, 'just before');
  assert.strictEqual(inWindow(f, ko - 120 * 60000), false, 'two hours before');
  assert.strictEqual(inWindow(f, ko + 300 * 60000), false, 'five hours after');
});

test('two Rayners Lane fixtures at once are BOTH eligible', () => {
  const { candidates, ukEpoch } = sync._internal;
  const ko = ukEpoch('2026-08-01', '15:00');
  const list = [
    { id: 'fwp-578225', date: '2026-08-01', kickoff: '15:00' },
    { id: 'fwp-999999', date: '2026-08-01', kickoff: '15:00' },
    { id: 'friendly-x', date: '2026-08-01', kickoff: '15:00' },   // no provider id
    { id: 'fwp-111111', date: '2026-09-30', kickoff: '15:00' },   // not today
  ];
  const due = candidates(list, ko + 10 * 60000);
  assert.deepStrictEqual(due.map((f) => f.id), ['fwp-578225', 'fwp-999999']);
});

test('the fingerprint changes on a goal and not on a re-send', () => {
  const { fingerprint } = sync._internal;
  const p = A.parseMatch(liveHtml);
  assert.strictEqual(fingerprint(p), fingerprint(A.parseMatch(liveHtml)), 're-send is identical');
  const scored = Object.assign({}, p, { homeScore: 3 });
  assert.notStrictEqual(fingerprint(p), fingerprint(scored), 'a goal must change it');
  const ticked = Object.assign({}, p, { matchMinute: 46 });
  assert.notStrictEqual(fingerprint(p), fingerprint(ticked), 'the clock must change it');
});

test('goal rows are typed correctly for the database', () => {
  const { eventRow } = sync._internal;
  const p = A.parseMatch(liveHtml);
  const og = p.events.find((e) => e.ownGoal);
  const row = eventRow('fwp-578225', p, og);
  assert.strictEqual(row.event_type, 'own_goal');
  assert.strictEqual(row.own_goal, true);
  assert.strictEqual(row.side, 'home');
  assert.strictEqual(row.player_side, 'away');

  const red = eventRow('fwp-578225', p, p.events.find((e) => e.type === 'red_card'));
  assert.strictEqual(red.event_type, 'red_card');
  assert.strictEqual(red.card_colour, 'red');

  const yellow = eventRow('fwp-578225', p, p.events.find((e) => e.type === 'yellow_card'));
  assert.strictEqual(yellow.card_colour, 'yellow');
});

test('the provider is never contacted unless explicitly enabled', () => {
  // The permission gate. Default-off is the whole safety story here.
  const client = require('../netlify/functions/lib/fwp-client');
  const before = process.env.FWP_SYNC_ENABLED;
  delete process.env.FWP_SYNC_ENABLED;
  assert.strictEqual(client.isEnabled(), false, 'unset must mean off');
  process.env.FWP_SYNC_ENABLED = 'false';
  assert.strictEqual(client.isEnabled(), false);
  process.env.FWP_SYNC_ENABLED = 'yes';
  assert.strictEqual(client.isEnabled(), false, 'only the literal "true" enables it');
  process.env.FWP_SYNC_ENABLED = 'true';
  assert.strictEqual(client.isEnabled(), true);
  if (before === undefined) delete process.env.FWP_SYNC_ENABLED;
  else process.env.FWP_SYNC_ENABLED = before;
});

test('the request identifies the club and asks the embed path', () => {
  const client = require('../netlify/functions/lib/fwp-client');
  const url = client.embedUrl('match/2026-2027/comp/a/b/578225', { from: 'embed', loaded: '123' });
  assert.match(url, /^https:\/\/www\.footballwebpages\.co\.uk\/embed\//, 'must use the embed path');
  assert.match(url, /from=embed/);
  assert.match(url, /loaded=123/);
  assert.ok(url.indexOf('origin=') !== -1, 'declares our origin');
});

test('the second half is live and the clock has restarted', () => {
  // Captured from the same match: the provider resumes the clock at 46', which
  // is what proves the minute is real and not our own timer guessing.
  const dir = path.join(FX, 'timeline');
  const f = fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => /Second-Half/i.test(x))[0] : null;
  if (!f) return;
  const p2 = A.parseMatch(fs.readFileSync(path.join(dir, f), 'utf8'));
  assert.strictEqual(p2.period, 'second_half');
  assert.strictEqual(p2.isLive, true);
  assert.strictEqual(p2.isFinal, false);
  assert.ok(p2.matchMinute >= 46, 'clock restarted after the interval, got ' + p2.matchMinute);
});

test('the same match parsed at three points keeps one identity and one timeline shape', () => {
  // First half → half time → second half. Score and events may grow; the teams,
  // the fixture and the orientation must never move.
  const dir = path.join(FX, 'timeline');
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((x) => x.endsWith('.html')).sort();
  if (files.length < 2) return;
  const seen = files.map((f) => A.parseMatch(fs.readFileSync(path.join(dir, f), 'utf8'))).filter(Boolean);
  const homes = new Set(seen.map((x) => x.home.name));
  const aways = new Set(seen.map((x) => x.away.name));
  assert.strictEqual(homes.size, 1, 'home team changed between polls');
  assert.strictEqual(aways.size, 1, 'away team changed between polls');
  seen.forEach((x) => {
    assert.strictEqual(A.ourView(x).isHome, true);
    // Scores only ever move forward within one match.
    assert.ok(x.homeScore >= 2, 'home score went backwards: ' + x.homeScore);
  });
});

test('substitutions are read as two players, not a generic note', () => {
  // The provider writes "Godwin Fuma replaced Alfie Campbell". Matching only
  // "replaced by" left every substitution filed as an anonymous info row.
  const p = A.parseMatch(read('match-subs.html'));
  const subs = p.events.filter((e) => e.type === 'substitution');
  assert.strictEqual(subs.length, 4, 'expected four substitutions');
  const first = subs[0];
  assert.strictEqual(first.player, 'Godwin Fuma', 'player coming on');
  assert.strictEqual(first.assistant, 'Alfie Campbell', 'player going off');
  assert.strictEqual(first.team, 'Rayners Lane');
  // An away substitution must attribute to the away side.
  const theirs = subs.find((e) => e.player === 'Ty Hamilton');
  assert.strictEqual(theirs.team, 'Wallingford & Crowmarsh');
});

test('a half-time summary line is not a person', () => {
  // "Half-time: Rayners Lane 2-1 Wallingford & Crowmarsh" was being stored as a
  // player name and rendered on the public timeline as if someone was called that.
  const p = A.parseMatch(read('match-subs.html'));
  const ht = p.events.filter((e) => e.type === 'half_time');
  assert.ok(ht.length >= 1, 'half-time marker present');
  ht.forEach((e) => {
    assert.strictEqual(e.player, '', 'summary lines carry no player');
    assert.strictEqual(e.isSummary, true);
  });
  // And no event anywhere should have a scoreline sitting in the player field.
  p.events.forEach((e) => {
    assert.ok(!/\d\s*-\s*\d/.test(e.player || ''), 'scoreline leaked into a name: ' + e.player);
  });
});

test('the later score is parsed correctly as the match progresses', () => {
  const p = A.parseMatch(read('match-subs.html'));
  assert.strictEqual(p.homeScore, 3);
  assert.strictEqual(p.awayScore, 2);
  assert.strictEqual(p.period, 'second_half');
  assert.strictEqual(p.isLive, true);
});

test('FULL TIME: the score does not vanish when the whistle goes', () => {
  // The provider stops advertising a status at full time — it rewrites the
  // heading to "Today's Result" and DELETES the status span. Reading only the
  // span gave period 'unknown', neither live nor final, and the score
  // disappeared from the website the moment the match ended.
  const html = read('match-fulltime.html');
  assert.ok(!/<span class="status"/i.test(html), 'fixture should have no status span');
  assert.match(html, /Today&#39;s Result|Today's Result/, 'heading should say Result');

  const p = A.parseMatch(html);
  assert.strictEqual(p.period, 'full_time');
  assert.strictEqual(p.isFinal, true);
  assert.strictEqual(p.isLive, false);
  assert.strictEqual(p.homeScore, 3);
  assert.strictEqual(p.awayScore, 3, 'they equalised late — the final score is 3-3');
});

test('the full-time timeline keeps every event', () => {
  const p = A.parseMatch(read('match-fulltime.html'));
  assert.ok(p.events.length >= 20, 'expected the complete timeline, got ' + p.events.length);
  assert.ok(p.events.some((e) => e.type === 'red_card'), 'red card retained');
  assert.ok(p.events.filter((e) => e.type === 'substitution').length >= 7, 'substitutions retained');
  assert.ok(p.events.filter((e) => e.type === 'goal').length >= 5, 'all goals retained');
  // No event may end up unattributed once the match is over.
  assert.deepStrictEqual(p.events.filter((e) => !e.team && !e.isSummary).map((e) => e.player), []);
});

test('a heading with no result word is still not treated as final', () => {
  // Guard the guard: "Today's Match" with no status must stay unknown, never
  // silently become full time.
  const s = A.parseStatus('<p class="match-heading" id="fwp-heading">Today\'s Match - </p>');
  assert.strictEqual(s.period, 'unknown');
  assert.strictEqual(s.isFinal, false);
  assert.strictEqual(s.isLive, false);
});

test('the result write-back must never send a partial fixture', () => {
  // save-data's merge replaces the whole object by id, so a partial upsert
  // silently deletes every other field. That is exactly what happened in
  // production: the Wallingford fixture lost its date, opponent, venue, crest,
  // competition and season, leaving five fields behind.
  const src = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'fwp-sync.js'), 'utf8');
  assert.match(src, /Object\.assign\(\{\},\s*fixture,/,
    'the upsert must start from the whole fixture, not build a new object');
  assert.match(src, /refusing to write an incomplete fixture record/,
    'there must be a guard against writing a fixture with no identity');
  // And the guard must check the fields whose loss was actually observed.
  assert.match(src, /!upsert\.id \|\| !upsert\.date \|\| !upsert\.opponent/);
});

test('every fixture on record keeps its identifying fields', () => {
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'fixtures.json'), 'utf8')).fixtures;
  const broken = fx.filter((f) => !f.date || !f.opponent || f.isHome === undefined);
  assert.deepStrictEqual(broken.map((f) => f.id), [],
    'fixtures stripped of identity: ' + broken.map((f) => f.id).join(', '));
});

test('an own goal is credited to us but never listed as one of our scorers', () => {
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'fixtures.json'), 'utf8')).fixtures;
  const f = fx.find((x) => x.id === 'fwp-578225');
  assert.ok(f, 'the reference fixture exists');
  assert.strictEqual(f.us, 3);
  assert.strictEqual(f.them, 3);
  assert.match(f.scorers, /Harry Bonner \(og\)/, 'the own goal must be marked (og)');
  // Bonner is a Wallingford player — the marker is what stops the club record
  // crediting an opponent with a Rayners Lane goal.
  const p = A.parseMatch(read('match-fulltime.html'));
  const og = p.events.find((e) => e.ownGoal && /Bonner/.test(e.player));
  assert.strictEqual(og.team, 'Rayners Lane', 'the goal counts for us');
  assert.strictEqual(og.playerTeam, 'Wallingford & Crowmarsh', 'the player is theirs');
});
