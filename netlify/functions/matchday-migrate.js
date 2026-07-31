// ═══════════════════════════════════════════════════════════════════════════
//  MATCH DAY OPERATIONS — migrate the old chairman's ledger.
//
//  POST { pin, token, mode }        mode: 'report' (default) | 'apply'
//
//  Moves the historical rows out of match_finances.matches[] and into
//  md_records, so the club ends with ONE match-day truth instead of two
//  competing ones.
//
//  ── WHAT THIS WILL NOT DO ─────────────────────────────────────────────────
//  The old ledger recorded ONE attendance integer and FOUR money buckets
//  (entry / programmes / merch / other). It did not record ticket categories,
//  a cash-versus-card split, quantities sold, an operator, an approver, or the
//  prices in force. Those facts do not exist. This migration therefore:
//
//    · does NOT spread the single attendance number across categories —
//      `attendance` stays {} and the number goes to attendance_official, which
//      is exactly what it was: a declared figure with no counted breakdown
//    · does NOT invent a cash/card split — the money lands in `other_pence`,
//      honestly labelled "method not recorded"
//    · does NOT invent quantities for programmes or merchandise — only the
//      amounts that were actually recorded, as flat lines
//    · does NOT fabricate a price snapshot, an operator or an approver
//    · does NOT invent a reconciliation. Expected is set equal to declared and
//      the variance to zero, with a note saying no reconciliation was performed
//      at the time — because inventing an expected figure would manufacture a
//      discrepancy that nobody ever observed
//    · does NOT guess a fixture. A row that does not match exactly one home
//      fixture is reported for a human, never attached to a near-miss
//    · does NOT discard anything. Every unmatched or skipped row comes back in
//      the report with the reason, and the original object is preserved
//      verbatim in legacy_source on any record it does create
//
//  Every migrated record is flagged is_legacy_import = true and locked, so it
//  is visibly different from a record the club actually counted.
//
//  match_finances is NOT modified or deleted. It stays exactly as it is until
//  the club has verified this migration.
// ═══════════════════════════════════════════════════════════════════════════

const adminOk = require('./lib/pin');
const AUTH = require('./lib/md-auth');
const S = require('./lib/md-store');
const MDC = require('./lib/matchday-core');

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(obj),
  };
}

/** Same normalisation the fixtures panel uses to compare opponent names. */
function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function pence(v) {
  var n = Number(v);
  if (!isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);           // the old ledger stored POUNDS as floats
}

/**
 * Match one legacy row to exactly one home fixture.
 * Returns { fixture } | { reason } — never a guess.
 */
function matchFixture(m, fixtures) {
  if (!m.date || !m.opponent) return { reason: 'no date or opponent recorded' };

  // An away game has no gate for this club to run, and the database refuses a
  // home operational record for one. Reported, not silently dropped.
  if (m.homeAway === 'away') return { reason: 'away fixture — Match Day Ops covers home matches only' };

  var candidates = fixtures.filter(function (f) {
    return f.isHome !== false && f.date === m.date && norm(f.opponent) === norm(m.opponent);
  });
  if (candidates.length === 1) return { fixture: candidates[0] };
  if (candidates.length > 1) {
    return { reason: 'ambiguous — ' + candidates.length + ' home fixtures share that date and opponent' };
  }
  // Same opponent, nearby date? Report it as a SUGGESTION for a human. It is
  // never applied automatically.
  var near = fixtures.filter(function (f) {
    if (f.isHome === false || norm(f.opponent) !== norm(m.opponent)) return false;
    var d = Math.abs(new Date(f.date) - new Date(m.date)) / 86400000;
    return d <= 3;
  });
  if (near.length === 1) {
    return { reason: 'no exact date match — did you mean ' + near[0].id + ' on ' + near[0].date + '? Not applied automatically.' };
  }
  return { reason: 'no home fixture in data/fixtures.json with that date and opponent' };
}

/** Build the md_records row for a legacy entry. */
function buildRow(m, fixture) {
  var takings = m.takings || {};
  var entry = pence(takings.entry);
  var progs = pence(takings.programmes);
  var merch = pence(takings.merch);
  var other = pence(takings.other);
  var declared = entry + progs + merch + other;

  // Sales we KNOW the value of but not the quantity — recorded as flat lines,
  // never as an invented qty x unit price.
  var otherSales = [];
  if (progs) otherSales.push({ label: 'Programmes (legacy — quantity not recorded)', amount_pence: progs });
  if (merch) otherSales.push({ label: 'Merchandise (legacy — quantity not recorded)', amount_pence: merch });
  if (other) otherSales.push({ label: 'Other income (legacy)', amount_pence: other });

  var notes = {};
  if (m.notes) notes.general = String(m.notes);
  var provenance = [
    'Imported from the old Match Day Analytics ledger.',
    'The original recorded one attendance figure and four money totals.',
    'Ticket categories, the cash/card split, quantities sold, the prices in force,',
    'the operator and the approver were never recorded, so they are absent here',
    'rather than invented. No reconciliation was performed at the time.',
  ].join(' ');

  return {
    fixture_id: fixture.id,
    season: fixture.season || MDC.seasonOf(fixture.date),
    competition_id: fixture.competitionId || null,
    competition_label: fixture.competition || m.competition || null,
    fixture_snapshot: S.snapshotFixture(fixture),
    // No price snapshot: the prices in force were never recorded.
    price_snapshot: null,
    price_list_id: null,
    status: 'locked',

    // The single number is a DECLARED figure with no counted breakdown, which
    // is precisely what attendance_official means. `attendance` stays empty.
    attendance: {},
    attendance_calculated: 0,
    attendance_official: Number(m.attendance) > 0 ? Math.round(Number(m.attendance)) : null,
    attendance_variance: null,
    attendance_variance_note: 'Legacy import — no category count was taken, so there is nothing to compare the official figure against.',

    sales: otherSales.length ? { other: otherSales } : {},
    sales_pence: progs + merch + other,

    // Payment method was never recorded. It goes to `other`, not a made-up split.
    receipts: declared ? { other_pence: declared } : {},
    float_open_pence: 0,
    float_close_pence: 0,

    // Expected is set EQUAL to declared so the migration does not manufacture a
    // discrepancy that nobody ever observed.
    expected_gate_pence: entry,
    expected_pence: declared,
    declared_pence: declared,
    financial_variance_pence: 0,
    reconciliation_note: provenance,

    notes: notes,
    is_legacy_import: true,
    legacy_source: {
      source: 'match_finances.matches',
      original: m,
      imported_at: new Date().toISOString(),
      caveats: [
        'attendance was a single declared number with no category breakdown',
        'cash/card/online split was not recorded — total shown under "other"',
        'programme and merchandise QUANTITIES were not recorded, only amounts',
        'ticket prices in force were not recorded, so there is no price snapshot',
        'operator, completed-by and approver were not recorded',
        'no reconciliation was performed at the time',
      ],
    },
    created_by: 'migration',
    completed_by: null,
  };
}

// Exported for the test suite — pure functions, no network, no database.
exports._internal = { matchFixture, buildRow, norm, pence };

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return resp(400, { ok: false, error: 'Bad JSON' }); }
  if (!adminOk(b.pin)) return resp(401, { ok: false, error: 'Unauthorized' });

  const cfgErr = AUTH.configError();
  if (cfgErr) return resp(503, { ok: false, error: cfgErr, misconfigured: true });

  const session = AUTH.verify(b.token);
  if (!session) return resp(401, { ok: false, error: 'Your session has expired — sign in again.', reauth: true });
  // Migrating historical finances is a chairman-level act.
  if (!AUTH.has(session, AUTH.CAP.REOPEN) || !AUTH.has(session, AUTH.CAP.FINANCE)) {
    return resp(403, {
      ok: false,
      error: 'Migrating the old ledger needs chairman-level permission and your own staff password, not the shared committee one.',
    });
  }
  if (!S.configured()) return resp(503, { ok: false, error: 'Supabase is not configured on this site.' });

  const apply = b.mode === 'apply';

  let legacy, fixtures, existing;
  try {
    legacy = await S.legacyFinances();
    fixtures = await S.fetchFixtures(true);
    existing = await S.allRecords();
  } catch (e) {
    return resp(200, { ok: false, error: 'Could not read the data: ' + e.message });
  }

  const already = new Set(existing.map(r => r.fixture_id));
  const plan = { migrate: [], skipped: [], review: [] };

  legacy.forEach(function (m, i) {
    const res = matchFixture(m, fixtures);
    const label = (m.date || '?') + ' vs ' + (m.opponent || '?');
    if (res.reason) {
      plan.review.push({ index: i, label: label, reason: res.reason, original: m });
      return;
    }
    if (already.has(res.fixture.id)) {
      plan.skipped.push({
        index: i, label: label, fixture_id: res.fixture.id,
        reason: 'a match-day record already exists for this fixture — the existing record wins and was NOT overwritten',
        original: m,
      });
      return;
    }
    plan.migrate.push({ index: i, label: label, fixture_id: res.fixture.id, row: buildRow(m, res.fixture) });
  });

  const summary = {
    legacyRows: legacy.length,
    willMigrate: plan.migrate.length,
    skipped: plan.skipped.length,
    needsReview: plan.review.length,
  };

  if (!apply) {
    return resp(200, {
      ok: true, mode: 'report', summary,
      migrate: plan.migrate.map(p => ({ label: p.label, fixture_id: p.fixture_id,
        attendance_official: p.row.attendance_official, declared_pence: p.row.declared_pence })),
      skipped: plan.skipped, review: plan.review,
      note: 'Nothing was written. Re-run with mode:"apply" to migrate. match_finances is never modified.',
    });
  }

  // ── APPLY ────────────────────────────────────────────────────────────────
  const done = [], failed = [];
  for (const p of plan.migrate) {
    try {
      const rec = await S.insertRecord(p.row);
      await S.audit({
        record_id: rec.id, fixture_id: rec.fixture_id,
        actor: AUTH.actorOf(session), actor_role: session.role, action: 'migrated',
        reason: 'Imported from the legacy match_finances ledger',
        before: p.row.legacy_source.original, after: { status: 'locked', is_legacy_import: true },
      });
      done.push({ label: p.label, fixture_id: p.fixture_id });
    } catch (e) {
      // A failure is reported, never swallowed.
      failed.push({ label: p.label, fixture_id: p.fixture_id, error: e.message });
    }
  }

  return resp(200, {
    ok: true, mode: 'apply',
    summary: Object.assign({}, summary, { migrated: done.length, failed: failed.length }),
    migrated: done, failed: failed, skipped: plan.skipped, review: plan.review,
    note: 'match_finances was NOT modified. Keep it until these records have been checked against it.',
  });
};
