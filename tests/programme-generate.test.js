// GATE 6 — programme assembly.
//
// The point of the whole feature: a complete programme with NOBODY writing a
// word. The old system had eight fields, seven empty, so there was no programme.

const test = require('node:test');
const assert = require('node:assert');
const G = require('../netlify/functions/lib/programme/generate');

const base = () => ({
  homeTeam: 'Rayners Lane', awayTeam: 'Hilltop',
  homeCrest: 'img/badge.png', awayCrest: 'img/crests/hilltop.png',
  competition: 'Combined Counties Prem N', competitionType: 'league',
  kickoffAt: '2026-08-11T18:45:00Z', venue: 'Tithe Farm Sports & Social Club',
  season: '2026-27', opponent: 'Hilltop',
  staffGroups: [{ title: 'Committee', people: [{ role: 'Chairman', name: 'Pete Singh' }] }],
  sponsorTiers: [{ tier: 'Kit Partner', sponsors: [{ name: 'Acerbis' }] }],
  table: { lastSyncedAt: 'x', rows: [
    { position: 1, team: 'Burnham', played: 1, won: 1, drawn: 0, lost: 0, goalDifference: 4, points: 3, isUs: false },
    { position: 10, team: 'Rayners Lane', played: 1, won: 0, drawn: 1, lost: 0, goalDifference: 0, points: 1, isUs: true },
  ] },
  recentResults: [{ opponent: 'Wallingford & Crowmarsh', us: 3, them: 3 }],
  upcomingFixtures: [{ opponent: 'Burnham', date: '2026-08-19' }],
  clubHistory: { founded: 1933, body: 'Playing in Harrow since 1933.' },
  sponsorshipOptions: [{ name: 'Match sponsorship' }],
  sponsorshipContact: 'info@raynerslanefc.co.uk',
});

test('a complete programme exists with NO editorial input at all', () => {
  const p = G.build(base());
  assert.strictEqual(p.validation.ok, true, 'missing: ' + p.validation.missing.join(', '));
  assert.strictEqual(p.order.length, 10);
  // Every mandatory section has real content.
  ['cover', 'welcome', 'opposition', 'staff', 'sponsors', 'fixtures', 'join', 'history']
    .forEach((k) => assert.ok(p.sections[k], k + ' missing'));
});

test('missing chair and manager notes never block the programme', () => {
  const p = G.build(base());
  assert.strictEqual(p.validation.ok, true);
  assert.strictEqual(p.sections.chairNotes, undefined);
  assert.strictEqual(p.sections.managerNotes, undefined);
});

test('optional notes are added when supplied, and attributed honestly', () => {
  const p = G.build(Object.assign(base(), { chairNotes: 'Welcome all.', chairName: 'Pete Singh' }));
  assert.strictEqual(p.sections.chairNotes.body, 'Welcome all.');
  assert.strictEqual(p.sections.chairNotes.byline, 'Pete Singh');
});

test('generated welcome is NEVER attributed to a real person', () => {
  // Putting the Chairman's name on copy he did not write devalues every genuine
  // word in the programme.
  const w = G.welcomeCopy(base());
  assert.strictEqual(w.attributed, false);
  assert.match(w.lead, /warm welcome to the players, officials and supporters of Hilltop/);
  assert.match(w.lead, /Combined Counties Prem N/);
  assert.match(w.lead, /Tithe Farm/);
  assert.ok(!/Pete Singh|Chairman|Manager/.test(w.lead + w.body), 'no false byline');
});

test('the cover carries club time, not the reader’s', () => {
  const p = G.build(base());
  assert.strictEqual(p.sections.cover.kickoff, '19:45', 'BST kick-off shown in club time');
  assert.match(p.sections.cover.dateLong, /Tuesday, 11 August 2026/);
});

test('opposition with no approved profile gets facts, not invented history', () => {
  const ctx = Object.assign(base(), {
    oppositionRow: { position: 4, played: 1, points: 3, goalDifference: 2 },
    oppositionGround: 'Kings Langley',
  });
  const s = G.oppositionSection(ctx);
  assert.strictEqual(s.approvedProfile, null);
  assert.ok(s.facts.length >= 4, 'real facts present');
  assert.match(s.facts[0].value, /4th/);
  assert.match(s.note, /records grow/);
  // Nothing resembling a fabricated history.
  assert.ok(!/founded|formed in|history dates/i.test(JSON.stringify(s)), 'no invented heritage');
});

test('an approved opposition profile is used when it exists', () => {
  const s = G.oppositionSection(Object.assign(base(), { oppositionProfile: { body: 'Approved copy.' } }));
  assert.deepStrictEqual(s.approvedProfile, { body: 'Approved copy.' });
  assert.strictEqual(s.note, null);
});

test('a cup tie does not get a league table', () => {
  const s = G.standingsSection(Object.assign(base(), {
    competitionType: 'fa_competition', competition: 'FA Cup EP', round: 'Extra Preliminary',
  }));
  assert.strictEqual(s.type, 'cup');
  assert.strictEqual(s.rows, undefined);
  assert.match(s.note, /league standings do not apply/);
});

test('a league fixture highlights us in the table', () => {
  const s = G.standingsSection(base());
  assert.strictEqual(s.type, 'league');
  const us = s.rows.filter((r) => r.isUs);
  assert.strictEqual(us.length, 1);
  assert.strictEqual(us[0].team, 'Rayners Lane');
});

test('no table available simply omits the section rather than faking one', () => {
  const s = G.standingsSection(Object.assign(base(), { table: null }));
  assert.strictEqual(s, null);
  // And the programme is still publishable — standings are not mandatory.
  const p = G.build(Object.assign(base(), { table: null }));
  assert.strictEqual(p.validation.ok, true);
});

test('the squad page says it is waiting rather than showing an empty XI', () => {
  const s = G.squadsSection(base());
  assert.strictEqual(s.confirmed, false);
  assert.match(s.note, /once both teams are submitted/);
  assert.strictEqual(s.home, undefined);
});

test('confirmed squads render both sides with numbers and captain', () => {
  const lineups = {
    confirmed: true,
    home: { starters: [{ name: 'A', number: '1', isCaptain: false }, { name: 'B', number: '10', isCaptain: true }],
            substitutes: [{ name: 'C', number: '12', role: 'substitute' }, { name: 'D', role: 'unused' }] },
    away: { starters: [{ name: 'X', number: '1' }], substitutes: [] },
  };
  const s = G.squadsSection(Object.assign(base(), { lineups, referee: 'Nathan Parrin' }));
  assert.strictEqual(s.confirmed, true);
  assert.strictEqual(s.home.starters.length, 2);
  assert.strictEqual(s.home.starters[1].isCaptain, true);
  assert.strictEqual(s.home.substitutes.length, 1, 'unused substitutes are not listed as used');
  assert.strictEqual(s.referee, 'Nathan Parrin');
});

test('missing staff or sponsors DOES block publication — those pages cannot be empty', () => {
  const noStaff = G.build(Object.assign(base(), { staffGroups: [] }));
  assert.strictEqual(noStaff.validation.ok, false);
  assert.ok(noStaff.validation.missing.indexOf('staff') !== -1);

  const noSponsors = G.build(Object.assign(base(), { sponsorTiers: [] }));
  assert.strictEqual(noSponsors.validation.ok, false);
  assert.ok(noSponsors.validation.missing.indexOf('sponsors') !== -1);
});

test('Join The Lane never invents a package or a price', () => {
  const p = G.build(Object.assign(base(), { sponsorshipOptions: [] }));
  assert.deepStrictEqual(p.sections.join.options, []);
  assert.ok(!/£|price|per season|package deal/i.test(JSON.stringify(p.sections.join)),
    'no invented commercial terms');
});

test('building twice from the same input produces the same programme', () => {
  assert.deepStrictEqual(G.build(base()), G.build(base()), 'generation must be deterministic');
});
