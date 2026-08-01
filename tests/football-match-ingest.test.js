// GATE 3 — match state, events and line-ups into the registry.
//
// Run against the real full-time capture of Rayners Lane 3-3 Wallingford &
// Crowmarsh, including the seven substitutions and both 16-player squads.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const F = require('../netlify/functions/lib/fwp');
const I = require('../netlify/functions/lib/football/match-ingest');

const FX = path.join(__dirname, 'fixtures', 'fwp');
const parsed = F.parseMatch(fs.readFileSync(path.join(FX, 'match-fulltime.html'), 'utf8'));

test('both squads become line-up rows in provider order', () => {
  const home = I.lineupRows(parsed, 'home', 1, {});
  const away = I.lineupRows(parsed, 'away', 2, {});
  assert.strictEqual(home.rows.length, 16);
  assert.strictEqual(away.rows.length, 16);
  assert.deepStrictEqual(home.rows.map((r) => r.sort_order), home.rows.map((_, i) => i));
  assert.ok(home.rows.every((r) => r.provider_player_name), 'every row keeps the provider name verbatim');
});

test('both sides field exactly eleven starters', () => {
  // The provider's class="playing" means "on the pitch RIGHT NOW", not
  // "started". It is dropped when a player is withdrawn AND when one is sent
  // off, so reading the class alone gave Rayners Lane a starting ten.
  for (const side of ['home', 'away']) {
    const rows = I.lineupRows(parsed, side, 1, {}).rows;
    const starters = rows.filter((r) => r.lineup_role === 'starter');
    assert.strictEqual(starters.length, 11, side + ' should start eleven, got ' + starters.length);
    assert.strictEqual(rows.length, 16, side + ' squad size');
  }
});

test('a withdrawn starter is a starter, with the minute he came off', () => {
  const home = I.lineupRows(parsed, 'home', 1, {}).rows;
  const chevannes = home.find((r) => /Chevannes/.test(r.provider_player_name));
  assert.strictEqual(chevannes.lineup_role, 'starter', 'he started and was booked before coming off');
  assert.strictEqual(chevannes.exited_minute, 70);
  assert.strictEqual(chevannes.entered_minute, null);
});

test('a SENT-OFF player still counts as a starter', () => {
  // Beau Pryce started and was dismissed on 30. The provider drops his class
  // exactly as it does for a substituted player, leaving him indistinguishable
  // from an unused substitute — which is how the eleven became ten.
  const home = I.lineupRows(parsed, 'home', 1, {}).rows;
  const pryce = home.find((r) => /Pryce/.test(r.provider_player_name));
  assert.strictEqual(pryce.lineup_role, 'starter');
  assert.strictEqual(pryce.entered_minute, null, 'he did not come on');
  assert.strictEqual(pryce.exited_minute, null, 'he was not substituted');
});

test('a player who came on is a substitute, with the minute he entered', () => {
  const home = I.lineupRows(parsed, 'home', 1, {}).rows;
  const fuma = home.find((r) => /Fuma/.test(r.provider_player_name));
  assert.strictEqual(fuma.lineup_role, 'substitute');
  assert.strictEqual(fuma.entered_minute, 54);
});

test('an unused substitute is recorded as unused, not as having played', () => {
  const away = I.lineupRows(parsed, 'away', 2, {}).rows;
  const unused = away.filter((r) => r.lineup_role === 'unused');
  assert.strictEqual(unused.length, 1, 'the away side left one substitute on the bench');
  assert.strictEqual(unused[0].entered_minute, null);
  assert.strictEqual(unused[0].exited_minute, null);
});

test('the captain is flagged and his name is not carrying "(C)"', () => {
  const home = I.lineupRows(parsed, 'home', 1, {});
  const cap = home.rows.filter((r) => r.is_captain);
  assert.strictEqual(cap.length, 1);
  assert.strictEqual(cap[0].provider_player_name, 'Keiran Barnard-White');
});

test('a player is only matched on an exact key within the SAME club', () => {
  const idx = { '1|beau pryce': { id: 99, canonical_name: 'Beau Pryce', current_team_id: 1 } };
  assert.strictEqual(I.resolvePlayer('Beau Pryce', 1, idx).status, 'matched');
  assert.strictEqual(I.resolvePlayer('Beau  Pryce', 1, idx).status, 'matched', 'whitespace folded');
  // Same name at a different club must NOT be auto-merged onto that person.
  const other = I.resolvePlayer('Beau Pryce', 2, idx);
  assert.strictEqual(other.status, 'name_used_at_another_club');
  assert.strictEqual(other.player, null);
  // A similar-but-different name is a new person, never a fuzzy merge.
  assert.strictEqual(I.resolvePlayer('Beau Pryse', 1, idx).status, 'new');
});

test('an unknown player becomes a provisional record, never a confirmed one', () => {
  const home = I.lineupRows(parsed, 'home', 1, {});
  assert.strictEqual(home.unresolved.length, 16, 'nothing is known yet, so all are unresolved');
  assert.ok(home.unresolved.every((u) => u.status === 'new'));
  assert.ok(home.unresolved.every((u) => u.key && u.key === u.key.toLowerCase()));
});

test('the shadow state matches what the live system holds', () => {
  const s = I.stateRow(parsed);
  assert.strictEqual(s.home_score, 3);
  assert.strictEqual(s.away_score, 3);
  assert.strictEqual(s.period, 'full_time');
  assert.strictEqual(s.is_final, true);
  assert.strictEqual(s.is_live, false);

  // Identical live row → no differences at all.
  assert.deepStrictEqual(I.compareState(Object.assign({}, s), s), []);
});

test('a state difference is reported rather than absorbed', () => {
  const s = I.stateRow(parsed);
  const stale = Object.assign({}, s, { home_score: 2, period: 'second_half', is_final: false });
  const diffs = I.compareState(stale, s);
  const fields = diffs.map((d) => d.field).sort();
  assert.deepStrictEqual(fields, ['home_score', 'is_final', 'period']);
});

test('missing live state is reported, not treated as agreement', () => {
  const diffs = I.compareState(null, I.stateRow(parsed));
  assert.strictEqual(diffs.length, 1);
  assert.match(diffs[0].note, /no live row/);
});

test('zero is not null when comparing scores', () => {
  const s = I.stateRow(parsed);
  const a = Object.assign({}, s, { away_score: 0 });
  const b = Object.assign({}, s, { away_score: null });
  const diffs = I.compareState(a, b);
  assert.ok(diffs.some((d) => d.field === 'away_score'), '0 and null must not compare equal');
});

test('shadow events key identically to the live ones', () => {
  const rows = I.eventRows('fwp-578225', parsed, F.eventKey);
  assert.ok(rows.length >= 20, 'full timeline, got ' + rows.length);
  const keys = rows.map((r) => r.dedupe_key);
  assert.strictEqual(new Set(keys).size, keys.length, 'no duplicate keys');

  // Same input twice → identical keys. This is what stops 30-second polling
  // turning one goal into a hundred.
  const again = I.eventRows('fwp-578225', F.parseMatch(fs.readFileSync(path.join(FX, 'match-fulltime.html'), 'utf8')), F.eventKey);
  assert.deepStrictEqual(again.map((r) => r.dedupe_key), keys);

  const cmp = I.compareEvents(rows.map((r) => ({ dedupe_key: r.dedupe_key })), rows);
  assert.strictEqual(cmp.identical, true);
  assert.strictEqual(cmp.onlyLive.length, 0);
  assert.strictEqual(cmp.onlyShadow.length, 0);
});

test('a retracted live event is not counted as a difference', () => {
  const rows = I.eventRows('fwp-578225', parsed, F.eventKey);
  const live = rows.map((r) => ({ dedupe_key: r.dedupe_key }));
  live.push({ dedupe_key: 'withdrawn', retracted_at: '2026-08-01T17:00:00Z' });
  const cmp = I.compareEvents(live, rows);
  assert.strictEqual(cmp.identical, true, 'a withdrawn event must not read as a disagreement');
});

test('substitutions survive into the registry rows with both players', () => {
  const rows = I.eventRows('fwp-578225', parsed, F.eventKey);
  const subs = rows.filter((r) => r.event_type === 'substitution');
  assert.ok(subs.length >= 7, 'expected the full set of substitutions, got ' + subs.length);
  assert.ok(subs.every((s) => s.player && s.related_player), 'both players recorded');
});

test('own goals and cards carry the right typing', () => {
  const rows = I.eventRows('fwp-578225', parsed, F.eventKey);
  const og = rows.find((r) => r.event_type === 'own_goal');
  assert.ok(og, 'own goal typed');
  assert.strictEqual(og.own_goal, true);
  assert.strictEqual(og.side, 'home', 'credited to us');
  assert.strictEqual(rows.find((r) => r.event_type === 'red_card').card_colour, 'red');
  assert.ok(rows.filter((r) => r.event_type === 'yellow_card').every((r) => r.card_colour === 'yellow'));
});
