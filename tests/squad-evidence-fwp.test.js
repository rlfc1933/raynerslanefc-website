// The Football Web Pages appearance list read on 2026-11-06, run through the
// squad review queue's OWN matching logic against the club's squad file.
// Proves on real names what the queue promises: nothing is added, merged or
// removed automatically; spelling variants become questions; players missing
// from the source are not treated as departed.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const SRC = require('../netlify/functions/lib/squad/sources');
const LOGIC = require('../netlify/functions/lib/squad/review-logic');

const ev = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/squad-evidence/fwp-appearances-2026-11-06.json'), 'utf8'));
const roster = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/squad.json'), 'utf8')).players
  .map((p) => ({ id: p.id, name: p.name, status: 'active' }));
const rows = SRC.manual(ev.players.map((p) => p.name), { sourceUrl: ev.url, sourceName: ev.source, season: ev.season, now: Date.parse('2026-11-06T12:00:00Z') });
const props = LOGIC.proposalsFromSource(roster, rows, {});
const byName = (n) => props.filter((p) => p.name === n)[0];

test('every source row becomes a question for a person — nothing is applied automatically', () => {
  assert.strictEqual(props.length, ev.players.length);
  assert.ok(props.every((p) => p.status === 'pending'));
  assert.ok(props.every((p) => p.evidence[0].url === ev.url && p.evidence[0].season === '2026-27'), 'source link and season kept');
});

test('a player with appearances but not in the squad is proposed, not added', () => {
  assert.strictEqual(byName('Godwin Fuma').kind, 'new_player');
});

test('spelling variants are asked about, never merged', () => {
  // Each of these is very probably a squad player spelled differently on the
  // source. Offering them as NEW players would invite duplicate records.
  [['Mateo Dos Reis Guerra', 'Mateo Dos Reis'], ['Temiloluwa Animashaun', 'Temi Animashaun'],
   ['Josh Andrew', 'Joshua Andrews'], ['Daniel Udanoh', 'Daniel Ezeigwe Udanoh']].forEach(([src, squad]) => {
    const v = byName(src);
    assert.strictEqual(v.kind, 'name_variant', src);
    assert.ok(v.candidates.some((c) => c.name === squad), src + ' should be asked about ' + squad);
  });
});

test('squad players with no appearance on the source produce no departure proposal', () => {
  const listed = new Set(ev.players.map((p) => LOGIC.norm(p.name)));
  const absent = roster.filter((p) => !listed.has(LOGIC.norm(p.name)));
  assert.ok(absent.length > 0, 'the fixture really has absent players');
  absent.forEach((p) => assert.ok(!props.some((x) => x.kind === 'departure' && x.name === p.name), p.name));
});
