// The next HOME match: separate from the next match, honest about postponements,
// never showing a kick-off time the registry has not confirmed. Europe/London.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const NH = require('../js/next-home.js');

const NOW = Date.parse('2026-10-09T10:00:00+01:00');
const fx = (id, kickoffAt, isHome, opponent, status = 'scheduled', extra = {}) => ({ id, kickoffAt, isHome, opponent, status, ...extra });
const LIST = [
  fx('a', '2026-10-03T14:00:00Z', false, 'Easington Sports', 'played'),
  fx('b', '2026-10-10T14:00:00Z', false, 'Holyport'),
  fx('c', '2026-10-31T15:00:00Z', true, 'Thatcham Town'),
  fx('d', '2026-11-07T15:00:00Z', true, 'Abingdon United'),
];

test('next home match skips an away next match', () => {
  const r = NH.pick(LIST, NOW);
  assert.equal(r.next.opponent, 'Thatcham Town');
  assert.deepEqual(r.offList, []);
  assert.equal(NH.dateLong(r.next), 'Saturday 31 October');
  assert.equal(NH.kickOff(r.next), '3pm');   // after the clocks go back: 15:00Z is 3pm in London
});

test('BST kick-offs are read in London time', () => {
  assert.equal(NH.kickOff(fx('x', '2026-10-20T18:45:00Z', true, 'Amersham Town')), '7.45pm');
});

test('a postponed home match is reported and the next confirmed one is offered', () => {
  const list = LIST.concat([fx('p', '2026-10-20T18:45:00Z', true, 'Amersham Town', 'postponed')]);
  const r = NH.pick(list, NOW);
  assert.equal(r.next.opponent, 'Thatcham Town');
  assert.deepEqual(r.offList.map((f) => f.opponent), ['Amersham Town']);
  assert.equal(NH.statusWord(r.offList[0]), 'Postponed');
});

test('old postponements are not repeated, and an unconfirmed time is never shown', () => {
  const list = [fx('old', '2026-09-19T14:00:00Z', true, 'Wokingham', 'postponed'), fx('n', '2026-10-31T15:00:00Z', true, 'Thatcham Town', 'scheduled', { kickoffTimeConfirmed: false })];
  const r = NH.pick(list, NOW);
  assert.deepEqual(r.offList, []);
  assert.equal(r.timeTbc, true);
  assert.equal(NH.kickOff(r.next), '');
});

test('no home fixture → null, never a guess', () => {
  assert.equal(NH.pick([LIST[1]], NOW).next, null);
  assert.equal(NH.pick(null, NOW).next, null);
});

test('a home match that already kicked off is not "next"', () => {
  const r = NH.pick([fx('k', '2026-10-09T08:00:00Z', true, 'Earlier')].concat(LIST), NOW);
  assert.equal(r.next.opponent, 'Thatcham Town');
});
