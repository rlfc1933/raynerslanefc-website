// GATE 1 — the isolated Football Web Pages layer.
//
// Tested against real captured responses in tests/fixtures/fwp/, taken from the
// club's own season and from the 1 August fixture as it was actually played.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const F = require('../netlify/functions/lib/fwp');
const FX = path.join(__dirname, 'fixtures', 'fwp');
const read = (f) => fs.readFileSync(path.join(FX, f), 'utf8');

// ── identity ────────────────────────────────────────────────────────────────
test('one club, many spellings — collapsed to one key', () => {
  const same = [
    ['Wallingford & Crowmarsh', 'Wallingford and Crowmarsh'],
    ['Punjab Utd FC', 'Punjab United'],
    ['AFC Hayes', 'Hayes AFC'],
    ['Rayners Lane FC', 'Rayners Lane'],
    ['Penn & Tylers Green', 'Penn and Tylers Green FC'],
  ];
  for (const [a, b] of same) {
    assert.ok(F.sameClub(a, b), a + ' should equal ' + b);
  }
});

test('different clubs stay different', () => {
  const different = [
    ['Rayners Lane', 'Hilltop'],
    ['Burnham', 'Bedfont'],
    // A reserve side is NOT the first team. Collapsing these would file a
    // reserve result against the first team's record.
    ['Rayners Lane', 'Rayners Lane Reserves'],
    ['Bedfont', 'Bedfont U23'],
  ];
  for (const [a, b] of different) {
    assert.ok(!F.sameClub(a, b), a + ' must NOT equal ' + b);
  }
});

test('a club key is never a substring match', () => {
  // "Hayes" and "AFC Hayes" are different clubs in this pyramid.
  assert.notStrictEqual(F.clubKey('Hayes'), F.clubKey('Hayes & Yeading United'));
});

test('player keys fold the provider’s punctuation and captain suffix', () => {
  assert.strictEqual(F.playerKey('Keiran Barnard-White (C)'), F.playerKey('Keiran Barnard-White'));
  assert.strictEqual(F.playerKey('Tyler D’Cruz'), F.playerKey("Tyler D'Cruz"));
  assert.strictEqual(F.playerKey('Beau  Pryce'), F.playerKey('Beau Pryce'));
  assert.notStrictEqual(F.playerKey('Harry Bonner'), F.playerKey('Harry Bonnar'));
});

// ── season fixture list ─────────────────────────────────────────────────────
test('the season list parses with a provider id on every fixture', () => {
  const r = F.parseFixtureList(read('fixtures-results.html'));
  assert.ok(r.fixtures.length >= 38, 'expected a full season, got ' + r.fixtures.length);
  assert.deepStrictEqual(r.seasonsSeen, ['2026-2027']);
  for (const f of r.fixtures) {
    assert.match(f.externalFixtureId, /^\d+$/, 'every fixture needs a provider id');
    assert.match(f.date, /^\d{4}-\d{2}-\d{2}$/, 'ISO date');
    assert.ok(f.opponent, 'opponent present');
    assert.ok(typeof f.isHome === 'boolean');
  }
  const ids = r.fixtures.map((f) => f.externalFixtureId);
  assert.strictEqual(new Set(ids).size, ids.length, 'ids must be unique');
});

test('a played fixture reports no kick-off time rather than guessing 15:00', () => {
  // The kick-off cell becomes the score once the match is played. Defaulting it
  // would overwrite a real 19:45 midweek kick-off with three o'clock.
  const r = F.parseFixtureList(read('fixtures-results.html'));
  const played = r.fixtures.filter((f) => f.played);
  assert.ok(played.length >= 1, 'at least one played fixture in the capture');
  for (const f of played) assert.strictEqual(f.kickoff, null);

  const evening = r.fixtures.find((f) => f.kickoff === '19:45');
  assert.ok(evening, 'midweek evening kick-offs survive');
});

test('home and away orientation comes from the provider, not from us', () => {
  const r = F.parseFixtureList(read('fixtures-results.html'));
  const home = r.fixtures.find((f) => f.isHome);
  const away = r.fixtures.find((f) => !f.isHome);
  assert.strictEqual(home.homeTeam, 'Rayners Lane');
  assert.strictEqual(away.awayTeam, 'Rayners Lane');
  assert.strictEqual(away.homeTeam, away.opponent);
});

test('a wrong season is rejected outright', () => {
  const r = F.parseFixtureList(read('fixtures-results.html'));
  assert.strictEqual(F.validateFixtureList(r, '2026-2027').ok, true);
  const wrong = F.validateFixtureList(r, '2024-2025');
  assert.strictEqual(wrong.ok, false);
  assert.match(wrong.errors.join(' '), /season mismatch/);
});

// ── league table ────────────────────────────────────────────────────────────
test('the league table parses and adds up', () => {
  const t = F.parseLeagueTable(read('league-table.html'));
  assert.ok(t, 'table parsed');
  assert.ok(t.rows.length >= 16, 'expected a full division, got ' + t.rows.length);
  assert.strictEqual(t.rows[0].position, 1);
  // The arithmetic is the real test of the column mapping: if the stats were
  // read from the wrong columns, W+D+L would stop equalling P.
  for (const r of t.rows) {
    assert.strictEqual(r.won + r.drawn + r.lost, r.played,
      r.providerTeamName + ': W+D+L != P');
    assert.strictEqual(r.goalsFor - r.goalsAgainst, r.goalDifference,
      r.providerTeamName + ': GF-GA != GD');
  }
});

test('Rayners Lane is identified by the provider’s own marker', () => {
  const t = F.parseLeagueTable(read('league-table.html'));
  assert.ok(t.ourRow, 'our row found');
  assert.ok(F.sameClub(t.ourRow.providerTeamName, 'Rayners Lane'));
  assert.strictEqual(F.validateLeagueTable(t, { minTeams: 16 }).ok, true);
});

test('a table without Rayners Lane is rejected as the wrong division', () => {
  const t = F.parseLeagueTable(read('league-table.html'));
  const foreign = { rows: t.rows.map((r) => Object.assign({}, r, { isUs: false })), ourRow: null };
  const v = F.validateLeagueTable(foreign, { minTeams: 16 });
  assert.strictEqual(v.ok, false);
  assert.match(v.errors.join(' '), /not in this table/);
});

test('table parsing refuses rubbish instead of returning empty standings', () => {
  for (const junk of ['', null, undefined, '<div>no table here</div>', 'Just a moment...']) {
    assert.strictEqual(F.parseLeagueTable(junk), null, 'should refuse: ' + String(junk).slice(0, 24));
  }
});

// ── the proven match parser is reachable through the new surface ────────────
test('the layer exposes the production match parser unchanged', () => {
  const p = F.parseMatch(read('match-fulltime.html'));
  assert.strictEqual(p.homeScore, 3);
  assert.strictEqual(p.awayScore, 3);
  assert.strictEqual(p.period, 'full_time');
  assert.strictEqual(F.ourView(p).us, 3);
  // Same function object as the proven adapter — re-exported, not forked.
  assert.strictEqual(F.parseMatch, require('../netlify/functions/lib/fwp-adapter').parseMatch);
  assert.strictEqual(F.fetchMatch, require('../netlify/functions/lib/fwp-client').fetchMatch);
});

test('the permission gate still governs every provider call', () => {
  const before = process.env.FWP_SYNC_ENABLED;
  delete process.env.FWP_SYNC_ENABLED;
  assert.strictEqual(F.isEnabled(), false);
  process.env.FWP_SYNC_ENABLED = 'true';
  assert.strictEqual(F.isEnabled(), true);
  if (before === undefined) delete process.env.FWP_SYNC_ENABLED;
  else process.env.FWP_SYNC_ENABLED = before;
});
