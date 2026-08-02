// GATE 7 — who is this player?
//
// Most of these tests assert that something did NOT happen. That is the point:
// a wrong merge is silent, and the only defence is refusing to make it.

const test = require('node:test');
const assert = require('node:assert');
const ID = require('../netlify/functions/lib/football/identity');

const OURS = 1, THEM = 2;
const player = (id, name, teamId, o) => Object.assign(
  { id, canonical_name: name, current_team_id: teamId, identity_status: 'provisional' }, o || {});

function index(list) {
  const idx = {};
  list.forEach((p) => { idx[p.current_team_id + '|' + p.canonical_name.toLowerCase()] = p; });
  return idx;
}

const roster = [
  { id: 'player-michael-adefolami', name: 'Michael Adefolami' },
  { id: 'player-beau-pryce', name: 'Beau Pryce' },
];

test('an exact name at the same club is a match', () => {
  const r = ID.resolve('Beau Pryce', OURS, { index: index([player(9, 'Beau Pryce', OURS)]) });
  assert.strictEqual(r.action, 'match');
  assert.strictEqual(r.playerId, 9);
});

test('THE SAME NAME AT ANOTHER CLUB IS NOT THE SAME PERSON', () => {
  const r = ID.resolve('John Smith', OURS, { index: index([player(4, 'John Smith', THEM)]) });
  assert.strictEqual(r.playerId, null, 'it must never attach to the other club\'s record');
  assert.strictEqual(r.status, ID.STATUS.NAME_ELSEWHERE);
  assert.strictEqual(r.action, 'create_flagged');
  assert.ok(r.suggestions.some((s) => s.type === 'other_club_player'),
    'a human is told the collision exists');
});

test('an initial is never resolved automatically, only offered', () => {
  const idx = index([player(7, 'John Smith', OURS)]);
  const r = ID.resolve('J Smith', OURS, { index: idx });
  assert.strictEqual(r.playerId, null, '"J Smith" could be Jack, James or Jordan');
  assert.strictEqual(r.action, 'create_with_suggestions');
  assert.ok(r.suggestions.some((s) => s.playerId === 7 && s.strength === 'variant'));
});

test('a middle name coming and going is offered, not assumed', () => {
  const idx = index([player(7, 'Keiran James Barnard-White', OURS)]);
  const r = ID.resolve('Keiran Barnard-White', OURS, { index: idx });
  assert.strictEqual(r.playerId, null);
  assert.ok(r.suggestions.some((s) => s.playerId === 7));
});

test('the club roster is consulted only for OUR side', () => {
  const ours = ID.resolve('Beau Pryce', OURS, { index: {}, roster, ourTeamId: OURS });
  assert.ok(ours.suggestions.some((s) => s.clubPlayerId === 'player-beau-pryce'));

  const theirs = ID.resolve('Beau Pryce', THEM, { index: {}, roster, ourTeamId: OURS });
  assert.strictEqual(theirs.suggestions.length, 0,
    'an opposition player is not one of our registered players');
});

test('a roster suggestion is still only a suggestion', () => {
  const r = ID.resolve('Michael Adefolami', OURS, { index: {}, roster, ourTeamId: OURS });
  assert.strictEqual(r.playerId, null);
  assert.strictEqual(r.status, ID.STATUS.PROVISIONAL);
  assert.notStrictEqual(r.status, ID.STATUS.CONFIRMED, 'only a human confirms');
});

test('a rejected pairing is never offered again', () => {
  const rejections = [{ normalised: 'm adefolami', team_id: OURS, club_player_id: 'player-michael-adefolami' }];
  const before = ID.resolve('M Adefolami', OURS, { index: {}, roster, ourTeamId: OURS });
  assert.ok(before.suggestions.length, 'it would normally be offered');
  const after = ID.resolve('M Adefolami', OURS, { index: {}, roster, ourTeamId: OURS, rejections });
  assert.strictEqual(after.suggestions.length, 0, 'a human already said no');
});

test('an unusable string does not become a player', () => {
  ['', '   ', '(C)', null].forEach((bad) => {
    const r = ID.resolve(bad, OURS, { index: {} });
    assert.strictEqual(r.status, ID.STATUS.UNRESOLVED, JSON.stringify(bad));
    assert.strictEqual(r.action, 'skip');
  });
});

test('a captain marker does not create a second record', () => {
  const idx = index([player(9, 'Beau Pryce', OURS)]);
  assert.strictEqual(ID.resolve('Beau Pryce (C)', OURS, { index: idx }).playerId, 9);
});

// ── duplicates ──────────────────────────────────────────────────────────────
test('duplicates are found within a club and never across clubs', () => {
  const dups = ID.duplicateCandidates([
    player(1, 'John Smith', OURS), player(2, 'J Smith', OURS),
    player(3, 'John Smith', THEM),
  ]);
  assert.strictEqual(dups.length, 1);
  assert.deepStrictEqual([dups[0].a, dups[0].b], [1, 2]);
  assert.ok(!dups.some((d) => [d.a, d.b].includes(3)), 'the other club is a different person');
});

test('an already-merged record is not offered as a duplicate again', () => {
  const dups = ID.duplicateCandidates([
    player(1, 'John Smith', OURS), player(2, 'John Smith', OURS, { merged_into_id: 1 }),
  ]);
  assert.strictEqual(dups.length, 0);
});

// ── decisions ───────────────────────────────────────────────────────────────
test('confirming demands a person and a name against the decision', () => {
  const p = player(9, 'Beau Pryce', OURS);
  assert.throws(() => ID.confirmPatch(p, null, 'Chair'), /club player/);
  assert.throws(() => ID.confirmPatch(p, 'player-beau-pryce', null), /whoever decided/);
  const patch = ID.confirmPatch(p, 'player-beau-pryce', 'Chair', 'known to the committee');
  assert.strictEqual(patch.identity_status, 'confirmed');
  assert.strictEqual(patch.public_slug, 'beau-pryce');
  assert.strictEqual(patch.identity_decided_by, 'Chair');
});

test('a merged record keeps existing but loses its public page', () => {
  const loser = player(2, 'J Smith', OURS, { public_slug: 'j-smith' });
  const patch = ID.mergePatch(loser, 1, 'Chair');
  assert.strictEqual(patch.merged_into_id, 1);
  assert.strictEqual(patch.public_slug, null, 'one person, one page');
  assert.throws(() => ID.mergePatch(loser, 2, 'Chair'), /itself/);
});

test('a merge chain resolves to the surviving record', () => {
  const byId = { 3: { id: 3, merged_into_id: 2 }, 2: { id: 2, merged_into_id: 1 }, 1: { id: 1 } };
  assert.strictEqual(ID.canonicalId(3, byId), 1);
  const loop = { 1: { id: 1, merged_into_id: 2 }, 2: { id: 2, merged_into_id: 1 } };
  assert.ok(ID.canonicalId(1, loop), 'a cycle terminates rather than hanging');
});

test('ONLY a confirmed, unmerged record is public', () => {
  assert.strictEqual(ID.isPublic(player(1, 'A', OURS, { identity_status: 'confirmed', public_slug: 'a' })), true);
  assert.strictEqual(ID.isPublic(player(1, 'A', OURS, { identity_status: 'provisional', public_slug: 'a' })), false);
  assert.strictEqual(ID.isPublic(player(1, 'A', OURS, { identity_status: 'confirmed' })), false);
  assert.strictEqual(ID.isPublic(player(1, 'A', OURS,
    { identity_status: 'confirmed', public_slug: 'a', merged_into_id: 2 })), false);
});

test('the migration and the code agree on the identity vocabulary', () => {
  const fs = require('fs');
  const sql = fs.readFileSync(__dirname + '/../supabase/migrations/20260803060000_player_identity.sql', 'utf8');
  const inCheck = sql.match(/identity_status in \(([^)]+)\)/)[1];
  Object.values(ID.STATUS).forEach((s) => {
    assert.ok(inCheck.includes("'" + s + "'"), s + ' is not a state the database allows');
  });
});
