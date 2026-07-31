// MATCH DAY OPERATIONS — logic tests.
//
//   node --test tests/
//
// Uses node:test, built into Node 20 (the version netlify.toml pins). No
// dependencies, no build step, nothing to install — the same discipline as the
// rest of this repo.
//
// These cover the pure logic: season derivation, competition mapping, the
// calculations, the status machine, and the capability model. Database
// invariants are tested separately, against a real Postgres, by
// supabase/tests/matchday_ops_invariants.sql.

const test = require('node:test');
const assert = require('node:assert');

process.env.NODE_ENV = 'test';
process.env.MD_TOKEN_SECRET = 'test-secret-for-tests-only-long-enough';

const MDC = require('../js/matchday-core.js');
const AUTH = require('../netlify/functions/lib/md-auth.js');
const OPS = require('../netlify/functions/matchday-ops.js');
const { buildReports, cleanTally, cleanSales, cleanReceipts, derivedColumns, qty, pence, present } = OPS._internal;

// Categories now come from the MAIN SITE admission config — one source.
const CONFIG = require('../data/config.json');
const CATS = MDC.categoriesFromAdmission(CONFIG.admission);
const K = Object.fromEntries(CATS.map(c => [c.key, c]));

// ── SEASON ─────────────────────────────────────────────────────────────────
test('season turns over on 1 July', () => {
  assert.strictEqual(MDC.seasonOf('2026-06-30'), '2025-26', 'June belongs to the previous season');
  assert.strictEqual(MDC.seasonOf('2026-07-01'), '2026-27', 'July starts the new season');
  assert.strictEqual(MDC.seasonOf('2026-08-01'), '2026-27');
  assert.strictEqual(MDC.seasonOf('2027-01-02'), '2026-27', 'January is still the same season');
  assert.strictEqual(MDC.seasonOf('2027-05-31'), '2026-27');
  assert.strictEqual(MDC.seasonOf(''), '', 'no date means no season, not a guess');
});

test('season label pads the second year (1999-00, not 1999-0)', () => {
  assert.strictEqual(MDC.seasonOf('1999-08-01'), '1999-00');
  assert.strictEqual(MDC.seasonOf('2009-08-01'), '2009-10');
});

// ── COMPETITION MAPPING (test 19) ──────────────────────────────────────────
test('competition mapping is explicit and never guesses', () => {
  assert.strictEqual(MDC.competitionIdFor('Combined Counties Prem N'), 'ccl-prem-north');
  assert.strictEqual(MDC.competitionIdFor('FA Cup EP'), 'fa-cup', 'round suffixes are stripped');
  assert.strictEqual(MDC.competitionIdFor('FA Vase 1Q'), 'fa-vase');
  assert.strictEqual(MDC.competitionIdFor('Emirates FA Cup'), 'fa-cup');
  // The honest gap: a friendly is not a competition the club has entered.
  assert.strictEqual(MDC.competitionIdFor('Pre-Season Friendly'), '', 'a friendly must NOT be assigned a competition id');
  assert.strictEqual(MDC.competitionIdFor('Some Invented Trophy'), '', 'an unknown label maps to nothing, never the nearest guess');
  assert.strictEqual(MDC.fixtureKind('Pre-Season Friendly'), 'friendly');
  assert.strictEqual(MDC.fixtureKind('Charity Match'), 'charity');
});

test('competition mapping reads data/competitions.json so a new one needs no code change', () => {
  const known = [{ id: 'new-cup', name: 'Brand New Cup', short: 'BNC' }];
  assert.strictEqual(MDC.competitionIdFor('Brand New Cup', known), 'new-cup');
  assert.strictEqual(MDC.competitionIdFor('BNC', known), 'new-cup');
});

test('competition mapping does not change the public label', () => {
  // The mapping function returns an id; it never rewrites the label it was given.
  const label = 'Combined Counties Prem N';
  const id = MDC.competitionIdFor(label);
  assert.strictEqual(label, 'Combined Counties Prem N', 'the label passed in is untouched');
  assert.strictEqual(id, 'ccl-prem-north');
});

// ── FIXTURE STATUS ─────────────────────────────────────────────────────────
test("fixture status has one vocabulary — 'ft' normalises to 'played'", () => {
  assert.strictEqual(MDC.normaliseFixtureStatus('ft'), 'played');
  assert.strictEqual(MDC.normaliseFixtureStatus('FT'), 'played');
  assert.strictEqual(MDC.normaliseFixtureStatus('played'), 'played');
  assert.strictEqual(MDC.normaliseFixtureStatus('scheduled'), 'scheduled');
  assert.strictEqual(MDC.normaliseFixtureStatus('postponed'), 'postponed');
  assert.strictEqual(MDC.normaliseFixtureStatus('nonsense'), 'scheduled', 'junk falls back safely');
});

// ── MONEY ──────────────────────────────────────────────────────────────────
test('money parses to integer pence and never floats', () => {
  assert.strictEqual(MDC.toPence('£9'), 900);
  assert.strictEqual(MDC.toPence('9.50'), 950);
  assert.strictEqual(MDC.toPence('Free'), 0);
  assert.strictEqual(MDC.toPence(''), null, 'empty is unknown, not zero');
  assert.strictEqual(MDC.toPence('abc'), null);
  // The classic float trap: 0.1 + 0.2 in pounds.
  assert.strictEqual(MDC.toPence('0.10') + MDC.toPence('0.20'), 30);
});

// ── TEST 1 · new records start at zero ─────────────────────────────────────
test('a new record body starts at zero attendance and zero receipts', () => {
  const body = MDC.emptyBody();
  assert.deepStrictEqual(body.attendance, {});
  assert.deepStrictEqual(body.receipts, {});
  assert.deepStrictEqual(body.sales, {});
  assert.strictEqual(body.attendance_official, null);
  assert.strictEqual(body.float_open_pence, 0);
  const d = MDC.derive(body);
  assert.strictEqual(d.attendance_calculated, 0);
  assert.strictEqual(d.expected_pence, 0);
  assert.strictEqual(d.declared_pence, 0);
});

test('no totals are ever carried forward from a previous match', () => {
  // emptyBody is a fresh object each call — a previous record cannot leak in.
  const a = MDC.emptyBody();
  a.attendance.adults = 250;
  a.receipts.cash_pence = 180000;
  const b = MDC.emptyBody();
  assert.deepStrictEqual(b.attendance, {}, 'a new record must not inherit attendance');
  assert.deepStrictEqual(b.receipts, {}, 'a new record must not inherit receipts');
});

// ── TEST 7 · calculated attendance counts only what it should ──────────────
test('calculated attendance includes only categories configured to count', () => {
  const tallies = { adults: 100, u16: 20, guest_list: 5, season_ticket: 30, officials: 4 };
  assert.strictEqual(MDC.calcAttendance(CATS, tallies), 159, 'everyone through the gate counts');

  // A category configured NOT to count is excluded.
  const cats = CATS.map(c => c.key === 'officials' ? Object.assign({}, c, { counts: false }) : c);
  assert.strictEqual(MDC.calcAttendance(cats, tallies), 155, 'officials excluded when counts:false');

  // A disabled category is excluded too.
  const disabled = CATS.map(c => c.key === 'u16' ? Object.assign({}, c, { enabled: false }) : c);
  assert.strictEqual(MDC.calcAttendance(disabled, tallies), 139);
});

// ── TEST 5 · expected revenue uses SNAPSHOT prices ─────────────────────────
test('expected gate revenue is calculated from snapshotted prices', () => {
  const tallies = { adults: 100, concessions: 10, u16: 20, u10: 15, guest_list: 5, season_ticket: 30 };
  // 100×900 + 10×600 + 20×200 = 90000 + 6000 + 4000 = 100000
  assert.strictEqual(MDC.calcExpectedPence(CATS, tallies), 100000);
  // u10, guest list and season ticket walk in but pay nothing at the gate.
  assert.strictEqual(MDC.calcAttendance(CATS, tallies), 180, 'they still COUNT as attendance');
});

// ── TEST 6 · a price change cannot rewrite a locked record ─────────────────
test('changing current prices does not rewrite historical totals', () => {
  const snapshot = { categories: CATS };
  const record = { price_snapshot: snapshot, attendance: { adults: 100 }, receipts: { cash_pence: 90000 } };
  const before = MDC.derive(record);
  assert.strictEqual(before.expected_gate_pence, 90000);

  // The club raises adult admission to £11 for next season.
  const raised = CATS.map(c => c.key === 'adults' ? Object.assign({}, c, { price_pence: 1100 }) : c);
  const newSeasonRecord = { price_snapshot: { categories: raised }, attendance: { adults: 100 } };
  assert.strictEqual(MDC.derive(newSeasonRecord).expected_gate_pence, 110000, 'new records use the new price');

  // The historical record still derives from ITS OWN snapshot.
  const after = MDC.derive(record);
  assert.strictEqual(after.expected_gate_pence, 90000, 'history is unchanged by a later price rise');
});

// ── TESTS 8 + 9 · variance signs ───────────────────────────────────────────
test('attendance discrepancy keeps the correct sign', () => {
  const base = { price_snapshot: { categories: CATS }, attendance: { adults: 100 } };
  // Official HIGHER than counted → positive.
  assert.strictEqual(MDC.derive(Object.assign({}, base, { attendance_official: 110 })).attendance_variance, 10);
  // Official LOWER than counted → negative.
  assert.strictEqual(MDC.derive(Object.assign({}, base, { attendance_official: 90 })).attendance_variance, -10);
  // Not yet declared → null, not zero. "Unknown" is not "agreed".
  assert.strictEqual(MDC.derive(base).attendance_variance, null);
  assert.strictEqual(MDC.derive(Object.assign({}, base, { attendance_official: 100 })).attendance_variance, 0);
});

test('financial discrepancy keeps the correct sign (a shortfall is negative)', () => {
  const rec = {
    price_snapshot: { categories: CATS },
    attendance: { adults: 100 },              // expected gate £900.00
    receipts: { cash_pence: 85000, card_pence: 3000 },  // declared £880.00
  };
  const d = MDC.derive(rec);
  assert.strictEqual(d.expected_pence, 90000);
  assert.strictEqual(d.declared_pence, 88000);
  assert.strictEqual(d.financial_variance_pence, -2000, 'a £20 shortfall is NEGATIVE');

  const over = MDC.derive(Object.assign({}, rec, { receipts: { cash_pence: 95000 } }));
  assert.strictEqual(over.financial_variance_pence, 5000, 'a surplus is positive');
});

test('the float is working capital and is excluded from expected receipts', () => {
  const rec = {
    price_snapshot: { categories: CATS },
    attendance: { adults: 10 },
    float_open_pence: 5000, float_close_pence: 5000,
    receipts: { cash_pence: 9000 },
  };
  const d = MDC.derive(rec);
  assert.strictEqual(d.expected_pence, 9000, 'the float must not inflate expected takings');
  assert.strictEqual(d.financial_variance_pence, 0);
});

test('sales revenue counts quantity x unit price plus flat income lines', () => {
  const sales = {
    programmes: { qty: 40, unit_pence: 200 },
    badges: { qty: 12, unit_pence: 300 },
    merch: { qty: 3, unit_pence: 2000 },
    hospitality_pence: 15000,
    sponsorship_pence: 25000,
    other: [{ label: '50/50 draw', qty: 60, unit_pence: 100 }],
  };
  // 8000 + 3600 + 6000 + 15000 + 25000 + 6000
  assert.strictEqual(MDC.calcSalesPence(sales), 63600);
});

// ── TEST 10 · negative quantities rejected ─────────────────────────────────
test('negative and fractional quantities are rejected at the server boundary', () => {
  assert.throws(() => qty(-1, 'adults'), /cannot be negative/);
  assert.throws(() => qty(2.5, 'adults'), /whole number/);
  assert.throws(() => qty('abc', 'adults'), /must be a number/);
  assert.throws(() => pence(-500, 'cash'), /cannot be negative/);
  assert.throws(() => pence(10.5, 'cash'), /whole pence/);
  assert.strictEqual(qty('', 'adults'), 0, 'blank is zero, not an error');
  assert.strictEqual(qty(0, 'adults'), 0);
});

test('unknown ticket categories are dropped, not stored', () => {
  const clean = cleanTally({ adults: 10, not_a_category: 999 }, CATS);
  assert.deepStrictEqual(clean, { adults: 10 });
});

test('zero tallies are not stored, so a record stays honest about what was counted', () => {
  assert.deepStrictEqual(cleanTally({ adults: 10, u16: 0 }, CATS), { adults: 10 });
});

// ── CAPABILITIES (tests 11, 12) ────────────────────────────────────────────
test('the shared committee password grants recording only', () => {
  const caps = AUTH.capabilitiesFor('Chairman', true, 'shared');
  assert.deepStrictEqual(caps, [AUTH.CAP.RECORD], 'no approve, reopen, prices or finance on a shared password');
});

test('a custom per-person password unlocks the role\'s full rights', () => {
  const caps = AUTH.capabilitiesFor('Chairman', true, 'custom');
  assert.ok(caps.includes(AUTH.CAP.APPROVE));
  assert.ok(caps.includes(AUTH.CAP.REOPEN));
  assert.ok(caps.includes(AUTH.CAP.PRICES));
});

test('an ordinary committee member can record but never approve or reopen', () => {
  const caps = AUTH.capabilitiesFor('Committee', false, 'custom');
  assert.ok(caps.includes(AUTH.CAP.RECORD), 'the person on the gate must not be blocked');
  assert.ok(!caps.includes(AUTH.CAP.APPROVE), 'unauthorised approval is impossible');
  assert.ok(!caps.includes(AUTH.CAP.REOPEN), 'unauthorised reopening is impossible');
  assert.ok(!caps.includes(AUTH.CAP.PRICES));
});

test('Match Day Secretary finally carries the rights its name implies', () => {
  const caps = AUTH.capabilitiesFor('Match Day Secretary', false, 'custom');
  assert.ok(caps.includes(AUTH.CAP.RECORD));
  assert.ok(caps.includes(AUTH.CAP.APPROVE));
  assert.ok(!caps.includes(AUTH.CAP.REOPEN), 'reopening a locked record stays with the chairman');
});

test('Marketing/Media cannot see the money', () => {
  const caps = AUTH.capabilitiesFor('Marketing/Media', false, 'custom');
  assert.ok(!caps.includes(AUTH.CAP.FINANCE));
});

// ── TOKENS (test 27 support) ───────────────────────────────────────────────
test('an identity token is signed, and a tampered one is refused', () => {
  const t = AUTH.issue({ username: 'p.singh', role: 'Chairman', isChairman: true, auth: 'custom' });
  const s = AUTH.verify(t);
  assert.strictEqual(s.username, 'p.singh');
  assert.strictEqual(s.auth, 'custom');
  assert.strictEqual(AUTH.verify(t.slice(0, -2) + 'xx'), null, 'a tampered signature is refused');
  assert.strictEqual(AUTH.verify('garbage'), null);
  assert.strictEqual(AUTH.verify(''), null);
  assert.strictEqual(AUTH.verify(null), null);
});

test('a token cannot smuggle in capabilities — they are derived server-side', () => {
  // Forge a payload claiming every capability. It is unsigned, so it dies.
  const forged = Buffer.from(JSON.stringify({
    u: 'attacker', r: 'Chairman', c: true, a: 'custom',
    capabilities: ['can_matchday_reopen'], exp: Date.now() + 100000,
  })).toString('base64url') + '.notarealsignature';
  assert.strictEqual(AUTH.verify(forged), null);
});

test('an expired token is refused', () => {
  const key = AUTH.signingKey();
  const crypto = require('node:crypto');
  const payload = Buffer.from(JSON.stringify({ u: 'x', r: 'Chairman', c: true, a: 'custom', exp: Date.now() - 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', key).update(payload).digest('base64url');
  assert.strictEqual(AUTH.verify(payload + '.' + sig), null);
});

test('the actor string marks a shared-password login so it is never mistaken for proof', () => {
  const shared = AUTH.actorOf({ username: 'Committee', role: 'Committee', auth: 'shared' });
  assert.match(shared, /shared password/);
  const custom = AUTH.actorOf({ username: 'e.galloway', role: 'Club Secretary', auth: 'custom' });
  assert.strictEqual(custom, 'e.galloway (Club Secretary)');
  assert.ok(!/shared/.test(custom));
});

// ── STATUS MACHINE (tests 13, 14) ──────────────────────────────────────────
test('the status machine allows only sensible transitions', () => {
  assert.ok(MDC.canTransition('upcoming', 'ready'));
  assert.ok(MDC.canTransition('ready', 'in_progress'));
  assert.ok(MDC.canTransition('in_progress', 'awaiting_reconciliation'));
  assert.ok(MDC.canTransition('awaiting_reconciliation', 'completed'));
  assert.ok(MDC.canTransition('completed', 'locked'));
  // The only way out of locked is a reopen.
  assert.ok(MDC.canTransition('locked', 'awaiting_reconciliation'));
  assert.ok(!MDC.canTransition('locked', 'in_progress'));
  assert.ok(!MDC.canTransition('locked', 'completed'));
  assert.ok(!MDC.canTransition('upcoming', 'completed'), 'a match cannot be completed before it is counted');
  assert.ok(!MDC.canTransition('upcoming', 'locked'));
  // An abandoned game still took money and must still be reconciled.
  assert.ok(MDC.canTransition('abandoned', 'awaiting_reconciliation'));
});

test('every status in the vocabulary is reachable and spelled once', () => {
  const expected = ['upcoming', 'ready', 'in_progress', 'awaiting_reconciliation',
                    'completed', 'locked', 'cancelled', 'postponed', 'abandoned'];
  assert.deepStrictEqual(MDC.RECORD_STATUSES, expected);
});

// ── DERIVED COLUMNS ────────────────────────────────────────────────────────
test('the server recalculates every derived figure and ignores what the client sent', () => {
  const record = {
    price_snapshot: { categories: CATS },
    attendance: { adults: 200 },
    receipts: { cash_pence: 100000 },
    // A client lying about its totals.
    attendance_calculated: 99999,
    expected_pence: 1,
    declared_pence: 1,
  };
  const d = derivedColumns(record);
  assert.strictEqual(d.attendance_calculated, 200, 'recalculated, not trusted');
  assert.strictEqual(d.expected_pence, 180000);
  assert.strictEqual(d.declared_pence, 100000);
  assert.strictEqual(d.financial_variance_pence, -80000);
});

// ── FINANCIAL VISIBILITY ───────────────────────────────────────────────────
test('money is withheld from a session without the finance capability', () => {
  const rec = {
    id: 1, fixture_id: 'f1', season: '2026-27', status: 'completed',
    attendance: { adults: 10 }, attendance_calculated: 10,
    declared_pence: 9000, receipts: { cash_pence: 9000 }, sales: {},
  };
  const noMoney = present(rec, { capabilities: [AUTH.CAP.RECORD] });
  assert.strictEqual(noMoney.finance_hidden, true);
  assert.strictEqual(noMoney.declared_pence, undefined, 'takings must not leak to a role without finance rights');
  assert.strictEqual(noMoney.attendance_calculated, 10, 'attendance is still visible');

  const withMoney = present(rec, { capabilities: [AUTH.CAP.RECORD, AUTH.CAP.FINANCE] });
  assert.strictEqual(withMoney.declared_pence, 9000);
});

// ── REPORTS (tests 16, 17) ─────────────────────────────────────────────────
const FIXTURES = [
  { id: 'f1', date: '2026-08-01', opponent: 'Wallingford', competition: 'Combined Counties Prem N', competitionId: 'ccl-prem-north', isHome: true, us: 2, them: 1 },
  { id: 'f2', date: '2026-08-08', opponent: 'London Lions', competition: 'FA Cup EP', competitionId: 'fa-cup', isHome: true, us: 1, them: 0 },
  { id: 'f3', date: '2099-05-01', opponent: 'Future FC', competition: 'Combined Counties Prem N', competitionId: 'ccl-prem-north', isHome: true, us: null, them: null },
];
const RECORDS = [
  { fixture_id: 'f1', season: '2026-27', competition_id: 'ccl-prem-north', competition_label: 'Combined Counties Prem N',
    status: 'locked', attendance: { adults: 100, u16: 20 }, attendance_calculated: 120, attendance_official: 120,
    attendance_variance: 0, declared_pence: 94000, expected_pence: 94000, financial_variance_pence: 0,
    sales_pence: 8000, sales: { programmes: { qty: 40, unit_pence: 200 } },
    receipts: { cash_pence: 80000, card_pence: 14000 }, fixture_snapshot: { date: '2026-08-01', opponent: 'Wallingford' } },
  { fixture_id: 'f2', season: '2026-27', competition_id: 'fa-cup', competition_label: 'FA Cup EP',
    status: 'completed', attendance: { adults: 200 }, attendance_calculated: 200, attendance_official: 210,
    attendance_variance: 10, attendance_variance_note: 'Ten walked in during the delay.',
    declared_pence: 175000, expected_pence: 180000, financial_variance_pence: -5000,
    reconciliation_note: 'Card reader dropped out for 20 minutes.',
    sales_pence: 0, sales: {}, receipts: { cash_pence: 175000 }, fixture_snapshot: { date: '2026-08-08', opponent: 'London Lions' } },
];

test('reports aggregate attendance and money correctly', () => {
  const r = buildReports('2026-27', RECORDS, FIXTURES);
  assert.strictEqual(r.matches, 2);
  assert.strictEqual(r.attendance.total, 330, '120 + 210 (official wins over counted)');
  assert.strictEqual(r.attendance.average, 165);
  assert.strictEqual(r.attendance.highest, 210);
  assert.strictEqual(r.attendance.lowest, 120, 'lowest attendance — which the old ledger never reported');
  assert.strictEqual(r.money.total_receipts_pence, 269000);
  assert.strictEqual(r.money.cash_pence, 255000);
  assert.strictEqual(r.money.card_pence, 14000);
  assert.strictEqual(r.money.average_per_attendee_pence, Math.round(269000 / 330));
  assert.strictEqual(r.sales.programmes, 40);
});

test('reports break down by competition', () => {
  const r = buildReports('2026-27', RECORDS, FIXTURES);
  const byId = Object.fromEntries(r.byCompetition.map(c => [c.key, c]));
  assert.strictEqual(byId['ccl-prem-north'].attendance, 120);
  assert.strictEqual(byId['fa-cup'].attendance, 210);
  assert.strictEqual(byId['fa-cup'].receipts_pence, 175000);
});

test('reports surface missing records and unreconciled fixtures instead of hiding them', () => {
  const withGap = FIXTURES.concat([
    { id: 'f4', date: '2026-08-15', opponent: 'Forgotten FC', competition: 'Combined Counties Prem N', isHome: true, us: 3, them: 0 },
  ]);
  const r = buildReports('2026-27', RECORDS, withGap);
  const missing = r.exceptions.missingRecords.map(m => m.fixture_id);
  assert.ok(missing.includes('f4'), 'a played home fixture with no record is reported');
  assert.ok(!missing.includes('f1'), 'a locked record is not missing');
  assert.ok(!missing.includes('f3'), 'a future fixture is not overdue');
});

test('reports list attendance and financial discrepancies with their explanations', () => {
  const r = buildReports('2026-27', RECORDS, FIXTURES);
  assert.strictEqual(r.exceptions.attendanceDiscrepancies.length, 1);
  assert.strictEqual(r.exceptions.attendanceDiscrepancies[0].variance, 10);
  assert.match(r.exceptions.attendanceDiscrepancies[0].note, /walked in/);
  assert.strictEqual(r.exceptions.financialDiscrepancies.length, 1);
  assert.strictEqual(r.exceptions.financialDiscrepancies[0].variance_pence, -5000);
  assert.match(r.exceptions.financialDiscrepancies[0].note, /Card reader/);
});

test('an in-progress record does not drag the averages down', () => {
  const withDraft = RECORDS.concat([{
    fixture_id: 'f3', season: '2026-27', status: 'in_progress',
    attendance: { adults: 3 }, attendance_calculated: 3, declared_pence: 0,
    expected_pence: 0, financial_variance_pence: 0, sales_pence: 0, sales: {}, receipts: {},
    fixture_snapshot: { date: '2099-05-01', opponent: 'Future FC' },
  }]);
  const r = buildReports('2026-27', withDraft, FIXTURES);
  assert.strictEqual(r.matches, 2, 'only completed and locked records count');
  assert.strictEqual(r.attendance.average, 165, 'a half-counted match must not skew the average');
  assert.strictEqual(r.exceptions.unreconciled.length, 1, 'but it IS surfaced as unreconciled');
});

// ── FIXTURE DATA (tests 18, 20) ────────────────────────────────────────────
test('every fixture in data/fixtures.json carries a season', () => {
  const fx = require('../data/fixtures.json').fixtures;
  const missing = fx.filter(f => !f.season);
  assert.strictEqual(missing.length, 0, 'season-less fixtures: ' + missing.map(f => f.id).join(', '));
});

test('fixture competition ids are valid, or honestly absent', () => {
  const fx = require('../data/fixtures.json').fixtures;
  const known = new Set(require('../data/competitions.json').competitions.map(c => c.id));
  fx.forEach(f => {
    if (f.competitionId) {
      assert.ok(known.has(f.competitionId), `${f.id} has unknown competitionId ${f.competitionId}`);
    }
  });
  const unmapped = fx.filter(f => !f.competitionId);
  unmapped.forEach(f => {
    assert.ok(MDC.fixtureKind(f.competition), `${f.id} ("${f.competition}") has no competitionId and is not a friendly/testimonial/charity — it should be mapped or explained`);
  });
});

test('fixture status uses one vocabulary across the whole file', () => {
  const fx = require('../data/fixtures.json').fixtures;
  fx.forEach(f => {
    assert.ok(MDC.FIXTURE_STATUSES.includes(f.status), `${f.id} has status "${f.status}"`);
    assert.notStrictEqual(f.status, 'ft', "'ft' must have been normalised to 'played'");
  });
});

test('fixture ids are unique — a record keys on them', () => {
  const fx = require('../data/fixtures.json').fixtures;
  const ids = fx.map(f => f.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'duplicate fixture ids would break the unique record constraint');
});

test('prices ARE the published gate prices — there is no second source to drift', () => {
  const published = CONFIG.admission.prices;
  published.forEach(p => {
    const key = MDC.paidKeyFor(p.label);
    assert.ok(K[key], `published category "${p.label}" must appear in Match Day Ops`);
    assert.strictEqual(K[key].price_pence, MDC.toPence(p.price),
      `${p.label} must charge exactly what the website says`);
    assert.strictEqual(K[key].label, p.label, 'the label shown is the label published');
  });
  // Change the website config and the categories change with it, with no
  // second list to update.
  const raised = MDC.categoriesFromAdmission({ prices: [{ label: 'General Admission', price: '£12' }] });
  assert.strictEqual(raised.find(c => c.key === 'adults').price_pence, 1200);
});

// ── SANITISERS ─────────────────────────────────────────────────────────────
test('sales and receipts are sanitised before they reach the database', () => {
  assert.deepStrictEqual(
    cleanSales({ programmes: { qty: '40', unit_pence: '200' }, junk: { qty: 5 } }),
    { programmes: { qty: 40, unit_pence: 200 } });
  assert.throws(() => cleanSales({ programmes: { qty: -1, unit_pence: 200 } }), /cannot be negative/);
  assert.deepStrictEqual(cleanReceipts({ cash_pence: 1000, nonsense: 5 }), { cash_pence: 1000 });
  assert.throws(() => cleanReceipts({ card_pence: -1 }), /cannot be negative/);
});
