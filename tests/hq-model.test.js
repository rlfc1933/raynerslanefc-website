// LANE HQ — the Command Centre's decisions, pinned to the real week of
// Friday 9 October 2026 (the evening the old home page called a Saturday
// fixture "Today at the club" and showed four false red result alerts).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../js/hq-time');
const M = require('../js/hq-model');

// 21:30 BST on Friday 9 October 2026.
const FRI_EVENING = Date.parse('2026-10-09T20:30:00Z');
// 00:30 BST on Saturday 10 October — still Friday in UTC.
const SAT_SMALL_HOURS = Date.parse('2026-10-09T23:30:00Z');

const fx = (id, opp, at, extra) => Object.assign({ id, opponent: opp, kickoffAt: at, isHome: true, status: 'scheduled' }, extra || {});
const FIXTURES = [
  fx('fwp-578241', 'Hilltop', '2026-08-11T18:45:00Z', { status: 'postponed' }),
  fx('fwp-590749', 'Hilltop', '2026-09-08T18:45:00Z', { status: 'played', kickoffTimeConfirmed: false }),
  fx('fwp-578300', 'New Bradwell St Peter', '2026-08-15T14:00:00Z', { status: 'played' }),
  fx('fwp-578310', 'Harefield United', '2026-09-12T14:00:00Z', { status: 'played', isHome: false }),
  fx('fwp-578330', 'Ardley United', '2026-10-06T18:45:00Z', { status: 'played' }),
  fx('fwp-578321', 'Wokingham', '2026-09-19T14:00:00Z', { status: 'postponed' }),
  fx('fwp-593622', 'Holyport', '2026-10-10T14:00:00Z', { isHome: false }),
  fx('fwp-578400', 'Thatcham Town', '2026-10-31T15:00:00Z'),
];
const RESULTS = [
  { id: 'fwp-590749', us: 2, them: 1, hasScore: true },
  { id: 'fwp-578300', us: 1, them: 1, hasScore: true },
  { id: 'fwp-578310', us: 0, them: 5, hasScore: true },
  { id: 'fwp-578330', us: 3, them: 0, hasScore: true },
];

test('club time: Friday evening is Friday, and Saturday 00:30 is Saturday, whatever UTC says', () => {
  assert.strictEqual(T.londonDate(FRI_EVENING), '2026-10-09');
  assert.strictEqual(T.londonDate(SAT_SMALL_HOURS), '2026-10-10');
  assert.strictEqual(new Date(SAT_SMALL_HOURS).toISOString().slice(0, 10), '2026-10-09', 'the bug this replaces');
  assert.strictEqual(T.relativeDay('2026-10-10T14:00:00Z', FRI_EVENING), 'Tomorrow');
  assert.strictEqual(T.relativeDay('2026-10-10T14:00:00Z', SAT_SMALL_HOURS), 'Today');
});

test('kick-off label: tomorrow at 15:00, and date only when the time is unconfirmed', () => {
  assert.strictEqual(T.kickoffLabel(FIXTURES[6], FRI_EVENING), 'Tomorrow, Sat 10 Oct · 15:00');
  assert.match(T.kickoffLabel(FIXTURES[1], FRI_EVENING), /Tue 8 Sept? · time to be confirmed$/);
});

test('the next match on Friday 9 October is Holyport tomorrow — not North Leigh, not a postponed game', () => {
  const n = M.nextFixture(FIXTURES, FRI_EVENING, RESULTS);
  assert.strictEqual(n.fixture.opponent, 'Holyport');
  assert.strictEqual(n.state, 'upcoming');
  assert.strictEqual(M.nextHome(FIXTURES, FRI_EVENING).opponent, 'Thatcham Town');
});

test('a registry result IS the public result: no "result not recorded" alerts for scored games', () => {
  const issues = M.fixtureIssues({ now: FRI_EVENING, fixtures: FIXTURES, results: RESULTS, mdopsRows: [] });
  assert.deepStrictEqual(issues.filter((e) => e.public.length), []);
});

test('a played fixture the feed has no score for is flagged once, as a public-feed gap', () => {
  const issues = M.fixtureIssues({ now: FRI_EVENING, fixtures: FIXTURES, results: RESULTS.slice(1), mdopsRows: [] });
  const pub = issues.filter((e) => e.public.length);
  assert.strictEqual(pub.length, 1);
  assert.strictEqual(pub[0].opponent, 'Hilltop');
});

test('private takings records are grouped per fixture, historic ones are low severity, postponed ones are not "missing"', () => {
  const rows = [
    { fixture: { id: 'fwp-590749', opponent: 'Hilltop', date: '2026-09-08' }, recordStatus: 'upcoming' },
    { fixture: { id: 'fwp-578300', opponent: 'New Bradwell St Peter', date: '2026-08-15' }, recordStatus: 'in_progress', record: {} },
    { fixture: { id: 'fwp-578241', opponent: 'Hilltop', date: '2026-08-11' }, recordStatus: 'upcoming' },            // postponed, no record: fine
    { fixture: { id: 'fwp-578321', opponent: 'Wokingham', date: '2026-09-19' }, recordStatus: 'in_progress', record: {} }, // postponed WITH a record: conflict
    { fixture: { id: 'fwp-578400', opponent: 'Thatcham Town', date: '2026-10-31' }, recordStatus: 'upcoming' },       // future: fine
  ];
  const g = M.buildPriorities({ now: FRI_EVENING, fixtures: FIXTURES, results: RESULTS, mdopsRows: rows });
  const rec = g.filter((x) => x.id === 'reconcile');
  assert.strictEqual(rec.length, 1, 'one group, not one red alert per gap');
  assert.strictEqual(rec[0].severity, 'low', 'every one of them is more than a fortnight old');
  assert.strictEqual(rec[0].items.length, 3);
  assert.match(rec[0].title, /^3 fixtures need reconciliation$/);
  assert.ok(rec[0].items.some((i) => /postponed/.test(i.meta)), 'a record on a postponed fixture is a conflict to check');
  assert.ok(!g.some((x) => x.severity === 'critical'), 'nothing here is critical');
  assert.ok(!g.some((x) => x.id === 'results-missing'));
});

test('a recent home match without its record is normal severity, not historic', () => {
  const rows = [{ fixture: { id: 'fwp-578330', opponent: 'Ardley United', date: '2026-10-06' }, recordStatus: 'upcoming' }];
  const g = M.buildPriorities({ now: FRI_EVENING, fixtures: FIXTURES, results: RESULTS, mdopsRows: rows });
  assert.strictEqual(g.find((x) => x.id === 'reconcile').severity, 'normal');
});

test('critical is reserved for the public seeing something wrong right now', () => {
  const g = M.buildPriorities({ now: FRI_EVENING, fixtures: FIXTURES, results: RESULTS, scoreboardOn: true });
  assert.strictEqual(g[0].id, 'scoreboard-on');
  assert.strictEqual(g[0].severity, 'critical');
});

test('next-match preparation: none, partial, and a fixture that moved', () => {
  let g = M.buildPriorities({ now: FRI_EVENING, fixtures: FIXTURES, results: RESULTS, cos: { items: { task: [] } } });
  assert.match(g.find((x) => /^prep:/.test(x.id)).title, /Holyport \(away\), tomorrow: no matchday checklist/);
  const tasks = [
    { id: 't1', kind: 'task', title: 'Kit', stage: 'done', owner: 'Jenny', data: { fixture: 'fwp-593622', fixture_date: '2026-10-10' } },
    { id: 't2', kind: 'task', title: 'Travel', stage: 'open', data: { fixture: 'fwp-593622', fixture_date: '2026-10-10' } },
  ];
  g = M.buildPriorities({ now: FRI_EVENING, fixtures: FIXTURES, results: RESULTS, cos: { items: { task: tasks } } });
  const prep = g.find((x) => /^prep:/.test(x.id));
  assert.match(prep.title, /1 of 2 matchday jobs done/);
  assert.match(prep.detail, /1 job still need/);
  // The registry moves the game a week; the tasks still carry the old date.
  const moved = FIXTURES.map((f) => f.id === 'fwp-593622' ? Object.assign({}, f, { kickoffAt: '2026-10-17T14:00:00Z' }) : f);
  g = M.buildPriorities({ now: FRI_EVENING, fixtures: moved, results: RESULTS, cos: { items: { task: tasks } } });
  const mv = g.find((x) => /^fixture-moved:/.test(x.id));
  assert.ok(mv, 'a moved fixture is surfaced');
  assert.match(mv.title, /Holyport \(away\) has moved to Sat 17 Oct/);
  assert.strictEqual(mv.items.length, 1, 'only the open task needs moving');
});

test('club office records are de-duplicated across groups', () => {
  const late = { id: 'e1', kind: 'enquiry', title: 'Sponsorship enquiry — Test Ltd', stage: 'new', due_date: '2026-10-01' };
  const att = { overdue: [late], today: [], week: [], unowned: [late], enquiriesOver48h: [late], invoicesUnpaid: [] };
  const g = M.buildPriorities({ now: FRI_EVENING, fixtures: [], cos: { attention: att, items: {} } });
  const ids = g.flatMap((x) => x.items.map((i) => i.id));
  assert.deepStrictEqual(ids, ['e1'], 'one record, one line');
  assert.strictEqual(g[0].id, 'enquiries-48h');
});

test('approvals are gathered into one group with the reason for each', () => {
  const items = { comms: [{ id: 'c1', kind: 'comms', title: 'Matchday post', stage: 'review' }],
    invoice: [{ id: 'i1', kind: 'invoice', title: 'Invoice — Test', stage: 'draft' }, { id: 'i2', kind: 'invoice', stage: 'issued', title: 'x' }],
    opportunity: [{ id: 'o1', kind: 'opportunity', title: 'Matchball', stage: 'proposal' }] };
  const g = M.buildPriorities({ now: FRI_EVENING, fixtures: [], cos: { items } });
  const a = g.find((x) => x.id === 'approvals');
  assert.strictEqual(a.items.length, 3);
  assert.match(a.title, /^3 approvals waiting$/);
});

test('notifications: one per group, read is not resolved, and a fixed problem becomes resolved', () => {
  const att = { overdue: [{ id: 'a', kind: 'task', title: 'A', stage: 'open', owner: 'Pete' }], today: [], week: [], unowned: [], enquiriesOver48h: [], invoicesUnpaid: [] };
  let g = M.buildPriorities({ now: FRI_EVENING, fixtures: [], cos: { attention: att } });
  let n = M.notifications(g, null, FRI_EVENING);
  assert.strictEqual(n.list.length, 1);
  assert.strictEqual(n.unread, 1);
  // Marked read: still listed (the work is not done), no longer unread.
  n.state.read[n.list[0].key] = FRI_EVENING;
  n = M.notifications(g, n.state, FRI_EVENING + 1000);
  assert.strictEqual(n.unread, 0);
  assert.strictEqual(n.list.length, 1, 'reading a notification does not make the problem go away');
  // The same group with a different record is a new notification.
  att.overdue.push({ id: 'b', kind: 'task', title: 'B', stage: 'open' });
  g = M.buildPriorities({ now: FRI_EVENING, fixtures: [], cos: { attention: att } });
  n = M.notifications(g, n.state, FRI_EVENING + 2000);
  assert.strictEqual(n.unread, 1);
  // Fixed in the records → resolved.
  n = M.notifications([], n.state, FRI_EVENING + 3000);
  assert.strictEqual(n.list.length, 0);
  assert.strictEqual(n.resolved[0].id, 'overdue');
});

test('navigation: six sections, every portal tool in exactly one, nothing that is not a tool', () => {
  global.window = {};
  require('../js/portal-tools.js');
  const PT = global.window.PortalTools;
  delete global.window;
  assert.deepStrictEqual(M.SECTIONS.map((s) => s.name),
    ['Overview', 'Football', 'Club and community', 'Commercial', 'Media', 'Administration']);
  const ids = M.SECTIONS.flatMap((s) => s.items.map((i) => i.id)).filter((id) => id !== 'home');
  assert.strictEqual(new Set(ids).size, ids.length, 'no destination twice');
  for (const id of ids) assert.ok(PT.byId(id), id + ' is not a real tool');
  for (const t of PT.TOOLS) assert.ok(ids.includes(t.id), t.id + ' has no place in the navigation');
  for (const s of M.SECTIONS) for (const i of s.items) assert.match(i.label, /^[A-Z][^A-Z]*( [A-Z][a-z]+)*$|^[A-Z]/, 'sentence case: ' + i.label);
  // Permission-aware: a person who may not see Staff Access does not get the link.
  const nav = M.navFor((id) => id !== 'users' && id !== 'developer', (id) => !!PT.byId(id));
  assert.ok(!nav.flatMap((s) => s.items).some((i) => i.id === 'users'));
});
