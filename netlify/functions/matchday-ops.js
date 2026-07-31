// ═══════════════════════════════════════════════════════════════════════════
//  MATCH DAY OPERATIONS — the API.
//
//  POST { pin, token, action, ... }
//
//  TWO GATES. `pin` is the club access PIN (lib/pin.js). `token` is the signed
//  identity minted by md-session.js — it carries WHO, and capabilities are
//  derived from it server-side.
//
//  NOTHING THE BROWSER SENDS ABOUT ITSELF IS TRUSTED:
//    · the actor and role come from the signed token, never the body
//    · capabilities are derived here, never read from the body
//    · calculated attendance, expected revenue, declared receipts and both
//      variances are RECALCULATED here from the tallies and the snapshotted
//      prices — whatever the client computed is discarded
//    · the price snapshot is built here from the database, never accepted
//    · status is only ever moved through a validated transition
//    · timestamps are the database's (see the migration's triggers)
//
//  It also cannot create a fixture. A record attaches to a fixture that already
//  exists in data/fixtures.json, or it is refused.
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
const ok  = (o) => resp(200, Object.assign({ ok: true }, o));
const bad = (code, error, extra) => resp(code, Object.assign({ ok: false, error }, extra || {}));

// ── INPUT SANITISERS ───────────────────────────────────────────────────────
// Every number that reaches the database goes through one of these.

/** Whole, non-negative quantity. Throws on anything else. */
function qty(v, label) {
  if (v === '' || v == null) return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, `${label} must be a number`);
  if (n < 0) throw new HttpError(400, `${label} cannot be negative`);
  if (!Number.isInteger(n)) throw new HttpError(400, `${label} must be a whole number`);
  if (n > 1000000) throw new HttpError(400, `${label} is implausibly large`);
  return n;
}

/** Non-negative integer pence. */
function pence(v, label) {
  if (v === '' || v == null) return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, `${label} must be an amount`);
  if (n < 0) throw new HttpError(400, `${label} cannot be negative`);
  if (!Number.isInteger(n)) throw new HttpError(400, `${label} must be in whole pence`);
  if (n > 100000000) throw new HttpError(400, `${label} is implausibly large`);
  return n;
}

function text(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max || 2000) : null;
}

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra || {}; }
}

/** Clean an { key: qty } tally against the snapshotted categories. */
function cleanTally(input, categories) {
  const allowed = new Set((categories || []).map(c => c.key));
  const out = {};
  Object.keys(input || {}).forEach(k => {
    if (!allowed.has(k)) return;              // unknown category → dropped, not stored
    const n = qty(input[k], `attendance.${k}`);
    if (n > 0) out[k] = n;                    // zeros are absent, not stored
  });
  return out;
}

function cleanSales(input) {
  const s = input || {};
  const out = {};
  ['programmes', 'badges', 'merch'].forEach(k => {
    const line = s[k];
    if (!line) return;
    const q = qty(line.qty, `sales.${k}.qty`);
    const u = pence(line.unit_pence, `sales.${k}.unit price`);
    if (q || u) out[k] = { qty: q, unit_pence: u };
  });
  if (s.hospitality_pence != null) out.hospitality_pence = pence(s.hospitality_pence, 'hospitality');
  if (s.sponsorship_pence != null) out.sponsorship_pence = pence(s.sponsorship_pence, 'match sponsorship');
  if (Array.isArray(s.other)) {
    out.other = s.other.slice(0, 20).map((o, i) => ({
      label: text(o.label, 80) || `Other ${i + 1}`,
      qty: qty(o.qty, `sales.other[${i}].qty`),
      unit_pence: pence(o.unit_pence, `sales.other[${i}].unit price`),
    })).filter(o => o.qty || o.unit_pence);
  }
  return out;
}

function cleanReceipts(input) {
  const r = input || {};
  const out = {};
  ['cash_pence', 'card_pence', 'online_pence', 'other_pence'].forEach(k => {
    if (r[k] != null) out[k] = pence(r[k], k.replace('_pence', '') + ' receipts');
  });
  return out;
}

function cleanNotes(input) {
  const n = input || {};
  const out = {};
  MDC.NOTE_KEYS.forEach(k => { const v = text(n[k], 4000); if (v) out[k] = v; });
  return out;
}

// ── DERIVED FIELDS ─────────────────────────────────────────────────────────
// Recomputed on EVERY write from the tallies and the SNAPSHOTTED prices, so a
// later price change cannot rewrite a past record and a client cannot lie.
function derivedColumns(record) {
  const d = MDC.derive(record);
  return {
    attendance_calculated: d.attendance_calculated,
    attendance_variance: d.attendance_variance,
    expected_gate_pence: d.expected_gate_pence,
    sales_pence: d.sales_pence,
    expected_pence: d.expected_pence,
    declared_pence: d.declared_pence,
    financial_variance_pence: d.financial_variance_pence,
  };
}

/**
 * Shape a record for the client.
 *
 * WHO MAY SEE THIS MATCH'S MONEY: anyone who may RECORD it. The committee
 * member on the turnstile is the person counting the cash, selling the
 * programmes and closing the float — hiding those fields from them removed the
 * entire point of the module. That was the original mistake here.
 *
 * `can_matchday_finance` is a different thing: it gates SEASON-WIDE reporting,
 * the archive and CSV export — the aggregate view of what the club takes.
 * One match's own figures belong to whoever is working that match.
 */
function present(rec, session) {
  if (!rec) return null;
  const canMoney = AUTH.has(session, AUTH.CAP.RECORD) || AUTH.has(session, AUTH.CAP.FINANCE);
  const base = {
    id: rec.id,
    fixture_id: rec.fixture_id,
    season: rec.season,
    competition_id: rec.competition_id,
    competition_label: rec.competition_label,
    fixture_snapshot: rec.fixture_snapshot,
    status: rec.status,
    weather: rec.weather,
    operator: rec.operator,
    completed_by: rec.completed_by,
    attendance: rec.attendance,
    attendance_calculated: rec.attendance_calculated,
    attendance_official: rec.attendance_official,
    attendance_variance: rec.attendance_variance,
    attendance_variance_note: rec.attendance_variance_note,
    notes: rec.notes,
    version: rec.version,
    is_legacy_import: rec.is_legacy_import,
    legacy_source: rec.legacy_source,
    created_at: rec.created_at,
    updated_at: rec.updated_at,
    submitted_by: rec.submitted_by, submitted_at: rec.submitted_at,
    approved_by: rec.approved_by, approved_at: rec.approved_at,
    locked_at: rec.locked_at, reopen_count: rec.reopen_count,
  };
  if (!canMoney) return Object.assign(base, { finance_hidden: true });
  return Object.assign(base, {
    price_snapshot: rec.price_snapshot,
    price_list_id: rec.price_list_id,
    sales: rec.sales,
    sales_pence: rec.sales_pence,
    receipts: rec.receipts,
    float_open_pence: rec.float_open_pence,
    float_close_pence: rec.float_close_pence,
    expected_gate_pence: rec.expected_gate_pence,
    expected_pence: rec.expected_pence,
    declared_pence: rec.declared_pence,
    financial_variance_pence: rec.financial_variance_pence,
    reconciliation_note: rec.reconciliation_note,
  });
}

// ── GUARDS ─────────────────────────────────────────────────────────────────
function requireCap(session, cap, what) {
  if (!AUTH.has(session, cap)) {
    const why = AUTH.ELEVATED.indexOf(cap) > -1 && session.auth !== 'custom'
      ? ' — this action needs your own staff password, not the shared committee one. Ask the chairman to set you one in Manage Users.'
      : '';
    throw new HttpError(403, `You do not have permission to ${what}.${why}`, { capability: cap });
  }
}

async function requireHomeFixture(fixtureId) {
  const f = await S.fixtureById(fixtureId);
  if (!f) throw new HttpError(404, 'That fixture is not in the season schedule. Add it in Fixtures first — Match Day Ops never creates a fixture.');
  if (f.isHome === false) throw new HttpError(400, 'That is an away fixture. Match Day Ops covers home matches, where the club runs the gate.');
  return f;
}

function requireUnlocked(rec) {
  if (rec && rec.status === 'locked') {
    throw new HttpError(409, 'That record is locked. It must be reopened before it can be edited.', { status: 'locked' });
  }
}

function requireTransition(from, to) {
  if (!MDC.canTransition(from, to)) {
    throw new HttpError(409, `A record cannot go from ${from} to ${to}.`, { from, to });
  }
}

// ── ACTIONS ────────────────────────────────────────────────────────────────

/** Everything the season view needs: every home fixture, with its record state. */
async function actionList(b, session) {
  const season = text(b.season, 20) || (await currentSeason());
  const fixtures = await S.homeFixtures(season);
  const records = S.configured() ? await S.recordsForSeason(season) : [];
  const byFixture = {};
  records.forEach(r => { byFixture[r.fixture_id] = r; });

  const rows = fixtures.map(f => {
    const rec = byFixture[f.id] || null;
    const played = f.us != null && f.them != null;
    return {
      fixture: {
        id: f.id, date: f.date, kickoff: f.kickoff || '15:00',
        opponent: f.opponent, venue: f.venue || '', competition: f.competition || '',
        competitionId: f.competitionId || '', status: MDC.normaliseFixtureStatus(f.status),
        oppCrest: f.oppCrest || '', played,
      },
      // A home fixture with NO record still appears — as an upcoming operational
      // item. Rows are not pre-created in the database just to fill a table.
      record: rec ? present(rec, session) : null,
      recordStatus: rec ? rec.status : 'upcoming',
    };
  });

  // Records whose fixture has vanished from fixtures.json (renamed/deleted).
  // Surfaced rather than hidden — silently dropping a match's takings from a
  // season total is exactly the kind of quiet wrong number this replaces.
  const fixtureIds = new Set(fixtures.map(f => f.id));
  const orphans = records.filter(r => !fixtureIds.has(r.fixture_id)).map(r => present(r, session));

  return ok({
    season, rows, orphans,
    // Whoever may RECORD a match may see and enter that match's money — they
    // are the one holding the cash tin. Season-wide reporting is separate.
    canMoney: AUTH.has(session, AUTH.CAP.RECORD) || AUTH.has(session, AUTH.CAP.FINANCE),
    canReports: AUTH.has(session, AUTH.CAP.FINANCE),
  });
}

async function currentSeason() {
  // Derive from today using the shared rule. data/seasons.json is the club's
  // declaration, but the rule is the same one and needs no network call.
  return MDC.seasonOf(new Date().toISOString().slice(0, 10));
}

/** One fixture, its record, its price list and its audit history. */
async function actionGet(b, session) {
  const fixtureId = text(b.fixture_id, 120);
  if (!fixtureId) throw new HttpError(400, 'fixture_id required');
  const f = await requireHomeFixture(fixtureId);
  const rec = S.configured() ? await S.recordByFixture(fixtureId) : null;
  const season = f.season || MDC.seasonOf(f.date);
  const priceList = await S.pricingFor(fixtureId);
  const history = rec && AUTH.has(session, AUTH.CAP.FINANCE) ? await S.auditFor(rec.id) : [];
  return ok({
    fixture: f,
    record: present(rec, session),
    priceList,
    audit: history,
    capabilities: session.capabilities,
  });
}

/**
 * Create the record for a fixture, or return the one that exists. Idempotent:
 * calling it twice never produces two records — the unique fixture_id makes
 * that impossible at the database level, and a race is caught and re-read.
 *
 * NOTHING is carried over from any previous match. Attendance and receipts
 * start at zero, by the table's own defaults. Only OPERATIONAL defaults —
 * categories, prices, merch lines — come forward, and they come from the price
 * list, never from another record.
 */
async function actionPrepare(b, session) {
  requireCap(session, AUTH.CAP.RECORD, 'prepare a match-day record');
  if (!S.configured()) throw new HttpError(503, 'Match Day Ops storage is not configured on this site.');

  const fixtureId = text(b.fixture_id, 120);
  if (!fixtureId) throw new HttpError(400, 'fixture_id required');
  const f = await requireHomeFixture(fixtureId);

  const existing = await S.recordByFixture(fixtureId);
  if (existing) return ok({ record: present(existing, session), created: false });

  const season = f.season || MDC.seasonOf(f.date);
  // Prices come from the MAIN SITE admission config, not a second list here.
  const priceList = await S.pricingFor(fixtureId);

  const row = Object.assign({
    fixture_id: fixtureId,
    season,
    competition_id: f.competitionId || null,
    competition_label: f.competition || null,
    fixture_snapshot: S.snapshotFixture(f),
    price_list_id: priceList.overrideId || null,
    // The snapshot is taken now so the prepare screen shows what will be used,
    // and re-taken at submit so a mid-week price correction is picked up.
    price_snapshot: { categories: priceList.categories, source: priceList.source, at: new Date().toISOString() },
    status: 'ready',
    operator: text(b.operator, 120),
    created_by: AUTH.actorOf(session),
  }, MDC.emptyBody());

  let rec;
  try {
    rec = await S.insertRecord(row);
  } catch (e) {
    // Two staff tapping Prepare at once. The unique constraint won; re-read.
    if (e.status === 409 || /duplicate|unique/i.test(e.message || '')) {
      rec = await S.recordByFixture(fixtureId);
      if (rec) return ok({ record: present(rec, session), created: false });
    }
    throw e;
  }

  await S.audit({
    record_id: rec.id, fixture_id: fixtureId,
    actor: AUTH.actorOf(session), actor_role: session.role,
    action: 'created', before: null,
    after: { status: rec.status, price_list_id: priceList.id, operator: row.operator },
  });
  return ok({ record: present(rec, session), created: true });
}

/**
 * The tally / draft save. Accepts a partial patch of the editable sections and
 * recomputes every derived number. Version-checked: a stale write is refused
 * with the current record so the client can reconcile rather than clobber.
 */
async function actionSave(b, session) {
  requireCap(session, AUTH.CAP.RECORD, 'save a match-day record');
  if (!S.configured()) throw new HttpError(503, 'Match Day Ops storage is not configured on this site.');

  const fixtureId = text(b.fixture_id, 120);
  if (!fixtureId) throw new HttpError(400, 'fixture_id required');
  const rec = await S.recordByFixture(fixtureId);
  if (!rec) throw new HttpError(404, 'No match-day record yet — prepare the fixture first.');
  requireUnlocked(rec);

  const patch = b.patch || {};
  const cats = (rec.price_snapshot && rec.price_snapshot.categories)
    || (await S.pricingFor(rec.fixture_id)).categories;
  const next = {};

  if (patch.attendance != null)  next.attendance = cleanTally(patch.attendance, cats);
  if (patch.sales != null)       next.sales = cleanSales(patch.sales);
  if (patch.receipts != null)    next.receipts = cleanReceipts(patch.receipts);
  if (patch.notes != null)       next.notes = cleanNotes(patch.notes);
  if (patch.weather !== undefined)  next.weather = text(patch.weather, 120);
  if (patch.operator !== undefined) next.operator = text(patch.operator, 120);
  if (patch.completed_by !== undefined) next.completed_by = text(patch.completed_by, 120);
  if (patch.float_open_pence != null)  next.float_open_pence = pence(patch.float_open_pence, 'opening float');
  if (patch.float_close_pence != null) next.float_close_pence = pence(patch.float_close_pence, 'closing float');
  if (patch.attendance_official !== undefined) {
    next.attendance_official = patch.attendance_official === null || patch.attendance_official === ''
      ? null : qty(patch.attendance_official, 'official attendance');
  }
  if (patch.attendance_variance_note !== undefined) next.attendance_variance_note = text(patch.attendance_variance_note, 4000);
  if (patch.reconciliation_note !== undefined) next.reconciliation_note = text(patch.reconciliation_note, 4000);

  // Status may advance to in_progress as soon as counting starts.
  if (patch.status) {
    requireTransition(rec.status, patch.status);
    if (['completed', 'locked'].indexOf(patch.status) > -1) {
      throw new HttpError(403, 'Completing or locking is done through Approve, not a draft save.');
    }
    next.status = patch.status;
  } else if (rec.status === 'ready' && next.attendance && Object.keys(next.attendance).length) {
    next.status = 'in_progress';
  }

  const merged = Object.assign({}, rec, next);
  Object.assign(next, derivedColumns(merged));

  const expectedVersion = Number.isInteger(b.version) ? b.version : rec.version;
  const saved = await S.updateRecord(rec.id, expectedVersion, next);
  if (!saved) {
    // Another device saved first. Return theirs; never silently overwrite.
    const current = await S.recordByFixture(fixtureId);
    throw new HttpError(409,
      'Someone else saved this record while you were counting. Your numbers were NOT discarded — check the current figures and re-enter anything missing.',
      { conflict: true, current: present(current, session) });
  }
  return ok({ record: present(saved, session) });
}

/** Submit for reconciliation. Idempotent on idempotency_key. */
async function actionSubmit(b, session) {
  requireCap(session, AUTH.CAP.RECORD, 'submit a match-day record');
  if (!S.configured()) throw new HttpError(503, 'Match Day Ops storage is not configured on this site.');

  const fixtureId = text(b.fixture_id, 120);
  if (!fixtureId) throw new HttpError(400, 'fixture_id required');

  // Replay protection, SCOPED TO THE FIXTURE. The key is unique across the
  // whole table, so a key that belongs to a different match must be treated as
  // a collision and refused — returning that other record would report a
  // successful submission for a match nobody submitted, and silently skip
  // every discrepancy check on this one.
  const key = text(b.idempotency_key, 120);
  if (key) {
    const already = await S.findByIdempotencyKey(key);
    if (already) {
      if (already.fixture_id === fixtureId) {
        return ok({ record: present(already, session), duplicate: true });
      }
      throw new HttpError(409,
        'That submission reference has already been used for a different match. Reload the record and submit again.',
        { collision: true });
    }
  }

  const rec = await S.recordByFixture(fixtureId);
  if (!rec) throw new HttpError(404, 'No match-day record to submit.');
  requireUnlocked(rec);
  requireTransition(rec.status, 'awaiting_reconciliation');

  // Freeze the prices ACTUALLY used at the moment of submission.
  const snapshot = rec.price_snapshot && rec.price_snapshot.categories
    ? rec.price_snapshot
    : { categories: (await S.pricingFor(rec.fixture_id)).categories, source: (await S.pricingFor(rec.fixture_id)).source, at: new Date().toISOString() };

  const merged = Object.assign({}, rec, { price_snapshot: snapshot });
  const derived = derivedColumns(merged);

  // A discrepancy must be explained before it can be submitted. This is the
  // whole point of reconciling: an unexplained gap is not a finished record.
  if (derived.attendance_variance != null && derived.attendance_variance !== 0
      && !text(rec.attendance_variance_note, 10)) {
    throw new HttpError(400,
      `The official attendance (${rec.attendance_official}) does not match the ${derived.attendance_calculated} counted through the gate. Explain the difference before submitting.`,
      { needs: 'attendance_variance_note', variance: derived.attendance_variance });
  }
  if (derived.financial_variance_pence !== 0 && !text(rec.reconciliation_note, 10)) {
    throw new HttpError(400,
      `Declared receipts (${MDC.fmtGBP(derived.declared_pence)}) do not match the ${MDC.fmtGBP(derived.expected_pence)} expected. Explain the difference before submitting.`,
      { needs: 'reconciliation_note', variance: derived.financial_variance_pence });
  }

  const patch = Object.assign({
    status: 'awaiting_reconciliation',
    price_snapshot: snapshot,
    submitted_by: AUTH.actorOf(session),
    submitted_at: new Date().toISOString(),
    idempotency_key: key || null,
    completed_by: rec.completed_by || AUTH.actorOf(session),
  }, derived);

  const saved = await S.updateRecord(rec.id, Number.isInteger(b.version) ? b.version : rec.version, patch);
  if (!saved) throw new HttpError(409, 'Someone else changed this record — reload and submit again.', { conflict: true });

  await S.audit({
    record_id: rec.id, fixture_id: rec.fixture_id,
    actor: AUTH.actorOf(session), actor_role: session.role, action: 'submitted',
    before: { status: rec.status },
    after: { status: 'awaiting_reconciliation', attendance_official: rec.attendance_official, declared_pence: derived.declared_pence },
  });
  return ok({ record: present(saved, session) });
}

/** Approve → completed, or approve-and-lock. Needs can_matchday_approve. */
async function actionApprove(b, session) {
  requireCap(session, AUTH.CAP.APPROVE, 'approve a match-day record');
  const fixtureId = text(b.fixture_id, 120);
  const rec = await S.recordByFixture(fixtureId);
  if (!rec) throw new HttpError(404, 'No match-day record to approve.');
  requireUnlocked(rec);
  requireTransition(rec.status, 'completed');

  const patch = {
    status: 'completed',
    approved_by: AUTH.actorOf(session),
    approved_at: new Date().toISOString(),
  };
  const saved = await S.updateRecord(rec.id, Number.isInteger(b.version) ? b.version : rec.version, patch);
  if (!saved) throw new HttpError(409, 'Someone else changed this record — reload and try again.', { conflict: true });

  await S.audit({
    record_id: rec.id, fixture_id: rec.fixture_id,
    actor: AUTH.actorOf(session), actor_role: session.role, action: 'approved',
    before: { status: rec.status }, after: { status: 'completed' },
  });
  return ok({ record: present(saved, session) });
}

/** Lock a completed record. Needs can_matchday_approve. */
async function actionLock(b, session) {
  requireCap(session, AUTH.CAP.APPROVE, 'lock a match-day record');
  const rec = await S.recordByFixture(text(b.fixture_id, 120));
  if (!rec) throw new HttpError(404, 'No match-day record to lock.');
  if (rec.status === 'locked') return ok({ record: present(rec, session), duplicate: true });
  requireTransition(rec.status, 'locked');

  const saved = await S.updateRecord(rec.id, Number.isInteger(b.version) ? b.version : rec.version, {
    status: 'locked', locked_at: new Date().toISOString(),
  });
  if (!saved) throw new HttpError(409, 'Someone else changed this record — reload and try again.', { conflict: true });

  await S.audit({
    record_id: rec.id, fixture_id: rec.fixture_id,
    actor: AUTH.actorOf(session), actor_role: session.role, action: 'locked',
    before: { status: rec.status }, after: { status: 'locked' },
  });
  return ok({ record: present(saved, session) });
}

/**
 * Reopen a locked record. Needs can_matchday_reopen AND a reason. The database
 * enforces the reason too — see md_guard_locked in the migration.
 */
async function actionReopen(b, session) {
  requireCap(session, AUTH.CAP.REOPEN, 'reopen a locked record');
  const reason = text(b.reason, 2000);
  if (!reason || reason.length < 10) {
    throw new HttpError(400, 'Reopening a locked record requires a reason of at least 10 characters. It goes into the audit history.', { needs: 'reason' });
  }
  const rec = await S.recordByFixture(text(b.fixture_id, 120));
  if (!rec) throw new HttpError(404, 'No match-day record to reopen.');
  if (rec.status !== 'locked') throw new HttpError(409, 'That record is not locked.', { status: rec.status });

  const saved = await S.updateRecord(rec.id, Number.isInteger(b.version) ? b.version : rec.version, {
    status: 'awaiting_reconciliation',
    reconciliation_note: reason,
  });
  if (!saved) throw new HttpError(409, 'Someone else changed this record — reload and try again.', { conflict: true });

  await S.audit({
    record_id: rec.id, fixture_id: rec.fixture_id,
    actor: AUTH.actorOf(session), actor_role: session.role, action: 'reopened', reason,
    before: { status: 'locked', locked_at: rec.locked_at, approved_by: rec.approved_by },
    after: { status: 'awaiting_reconciliation' },
  });
  return ok({ record: present(saved, session) });
}

/** Mark a fixture's operation cancelled / postponed / abandoned. */
async function actionSetStatus(b, session) {
  requireCap(session, AUTH.CAP.RECORD, 'change a record status');
  const to = text(b.status, 40);
  if (['cancelled', 'postponed', 'abandoned', 'upcoming', 'ready', 'in_progress'].indexOf(to) === -1) {
    throw new HttpError(400, 'That status cannot be set directly.');
  }
  const rec = await S.recordByFixture(text(b.fixture_id, 120));
  if (!rec) throw new HttpError(404, 'No match-day record.');
  requireUnlocked(rec);
  requireTransition(rec.status, to);

  const saved = await S.updateRecord(rec.id, Number.isInteger(b.version) ? b.version : rec.version, { status: to });
  if (!saved) throw new HttpError(409, 'Someone else changed this record — reload and try again.', { conflict: true });
  await S.audit({
    record_id: rec.id, fixture_id: rec.fixture_id,
    actor: AUTH.actorOf(session), actor_role: session.role, action: 'status',
    reason: text(b.reason, 2000),
    before: { status: rec.status }, after: { status: to },
  });
  return ok({ record: present(saved, session) });
}

// ── PRICING ────────────────────────────────────────────────────────────────
// There is NO price-management screen. The season prices live in
// data/config.json → `admission`, edited on the main site like any other site
// content, and Match Day Ops reads them. What follows is only the rare,
// audited, single-fixture exception.

/** Show what a fixture will be priced at, and where that came from. */
async function actionPricesGet(b, session) {
  const fixtureId = text(b.fixture_id, 120);
  const pricing = await S.pricingFor(fixtureId);
  const admission = await S.fetchAdmission();
  return ok({
    pricing,
    seasonSource: 'data/config.json → admission (the prices published on the website)',
    seasonPrices: admission ? admission.prices : null,
    canOverride: AUTH.has(session, AUTH.CAP.PRICES),
  });
}

/**
 * Override the prices for ONE fixture. Chairman / V Chairman only, reason
 * mandatory, fully audited. It does NOT touch data/config.json, so the season
 * prices on the website are unaffected.
 */
async function actionPriceOverride(b, session) {
  requireCap(session, AUTH.CAP.PRICES, 'set a fixture-specific price');
  const fixtureId = text(b.fixture_id, 120);
  if (!fixtureId) throw new HttpError(400, 'fixture_id required');
  const reason = text(b.reason, 2000);
  if (!reason || reason.length < 10) {
    throw new HttpError(400,
      'A fixture-specific price needs a reason of at least 10 characters — a cup instruction, a charity match, a promotion. It goes into the audit history.',
      { needs: 'reason' });
  }
  const f = await requireHomeFixture(fixtureId);

  const rec = S.configured() ? await S.recordByFixture(fixtureId) : null;
  if (rec && ['completed', 'locked'].indexOf(rec.status) > -1) {
    throw new HttpError(409,
      'That record is already ' + rec.status + '. Its prices are part of the historical record and cannot be changed.');
  }

  const cats = Array.isArray(b.categories) ? b.categories : null;
  if (!cats || !cats.length) throw new HttpError(400, 'categories must be a list');

  const clean = cats.slice(0, 40).map((c, i) => {
    const key = text(c.key, 40);
    if (!key || !/^[a-z0-9_]+$/.test(key)) {
      throw new HttpError(400, `Category ${i + 1} needs a simple key (lowercase letters, numbers, underscores).`);
    }
    const price = pence(c.price_pence, `${key} price`);
    const isFree = MDC.FREE_CATEGORIES.some(fc => fc.key === key);
    if (isFree && price !== 0) {
      // Guest List, season tickets, officials and scouts are non-paying by
      // definition. Letting one carry a price would put revenue against people
      // who never handed over money and invent a shortfall.
      throw new HttpError(400, `"${key}" is a non-paying category and must stay at £0.`);
    }
    return {
      key,
      label: text(c.label, 80) || key,
      hint: text(c.hint, 160) || '',
      price_pence: isFree ? 0 : price,
      counts: c.counts !== false,
      revenue: isFree ? false : price > 0,
      paid: !isFree,
      order: qty(c.order == null ? i + 1 : c.order, 'order'),
      enabled: c.enabled !== false,
    };
  });
  if (new Set(clean.map(c => c.key)).size !== clean.length) {
    throw new HttpError(400, 'Two categories share the same key.');
  }
  // Every non-paying category must still be present, or a volunteer loses the
  // Guest List box on exactly the fixture most likely to have one.
  MDC.FREE_CATEGORIES.forEach(fc => {
    if (!clean.some(c => c.key === fc.key)) {
      clean.push({ key: fc.key, label: fc.label, hint: fc.hint, price_pence: 0,
                   counts: true, revenue: false, paid: false, order: fc.order, enabled: true });
    }
  });

  const before = await S.pricingFor(fixtureId);
  const saved = await S.saveOverride({
    fixture_id: fixtureId,
    season: f.season || MDC.seasonOf(f.date),
    competition_id: f.competitionId || null,
    label: text(b.label, 120) || 'Fixture-specific pricing',
    reason,
    categories: clean,
    effective_from: new Date().toISOString().slice(0, 10),
    created_by: AUTH.actorOf(session),
  });

  // If the record already exists and is still editable, re-snapshot so the
  // tally screen immediately shows what will actually be charged.
  if (rec) {
    const merged = Object.assign({}, rec, { price_snapshot: { categories: clean, source: 'Fixture-specific override — ' + reason, at: new Date().toISOString() } });
    await S.updateRecord(rec.id, rec.version, Object.assign(
      { price_snapshot: merged.price_snapshot }, derivedColumns(merged)));
  }

  await S.audit({
    record_id: rec ? rec.id : null, fixture_id: fixtureId,
    actor: AUTH.actorOf(session), actor_role: session.role, action: 'price_override', reason,
    before: { source: before.source, categories: before.categories },
    after: { categories: clean },
  });
  return ok({ override: saved, pricing: await S.pricingFor(fixtureId) });
}

/** Remove a fixture override and fall back to the season website prices. */
async function actionPriceOverrideClear(b, session) {
  requireCap(session, AUTH.CAP.PRICES, 'remove a fixture-specific price');
  const fixtureId = text(b.fixture_id, 120);
  const rec = S.configured() ? await S.recordByFixture(fixtureId) : null;
  if (rec && ['completed', 'locked'].indexOf(rec.status) > -1) {
    throw new HttpError(409, 'That record is already ' + rec.status + ' — its prices are historical.');
  }
  const before = await S.pricingFor(fixtureId);
  await S.clearOverride(fixtureId);
  await S.audit({
    record_id: rec ? rec.id : null, fixture_id: fixtureId,
    actor: AUTH.actorOf(session), actor_role: session.role, action: 'price_override_cleared',
    reason: text(b.reason, 2000),
    before: { categories: before.categories }, after: { source: 'season website prices' },
  });
  return ok({ pricing: await S.pricingFor(fixtureId) });
}

// ── AUDIT + REPORTS ────────────────────────────────────────────────────────
async function actionAudit(b, session) {
  // A recorder may see the history of the record they are working on. Hiding
  // who changed what from the person doing the work helps nobody.
  requireCap(session, AUTH.CAP.RECORD, 'view audit history');
  const rec = await S.recordByFixture(text(b.fixture_id, 120));
  if (!rec) return ok({ audit: [] });
  return ok({ audit: await S.auditFor(rec.id) });
}

async function actionReports(b, session) {
  requireCap(session, AUTH.CAP.FINANCE, 'view match-day reports');
  const season = text(b.season, 20) || (await currentSeason());
  const records = await S.recordsForSeason(season);
  const fixtures = await S.homeFixtures(season);
  return ok(buildReports(season, records, fixtures));
}

/**
 * Reports are built from COMPLETED/LOCKED records only — a half-counted match
 * must not drag an average down. Everything else is surfaced as an exception,
 * not silently excluded.
 */
function buildReports(season, records, fixtures) {
  const counted = records.filter(r => ['completed', 'locked'].indexOf(r.status) > -1);
  const n = counted.length;
  const sum = (f) => counted.reduce((a, r) => a + (Number(f(r)) || 0), 0);

  const attendances = counted.map(r => Number(r.attendance_official != null ? r.attendance_official : r.attendance_calculated) || 0);
  const totalAtt = attendances.reduce((a, b) => a + b, 0);
  const gate = sum(r => r.declared_pence);

  // Per competition
  const byComp = {};
  counted.forEach(r => {
    const k = r.competition_id || r.competition_label || 'Other';
    if (!byComp[k]) byComp[k] = { key: k, label: r.competition_label || k, matches: 0, attendance: 0, receipts_pence: 0 };
    byComp[k].matches++;
    byComp[k].attendance += Number(r.attendance_official != null ? r.attendance_official : r.attendance_calculated) || 0;
    byComp[k].receipts_pence += Number(r.declared_pence) || 0;
  });

  // Ticket-category trend. Free categories are ALWAYS listed, even at zero, so
  // Guest List / Complimentary is a visible line in every report rather than
  // something that only appears once somebody has used it.
  const freeKeys = MDC.FREE_CATEGORIES.map(c => c.key);
  const freeLabel = {};
  MDC.FREE_CATEGORIES.forEach(c => { freeLabel[c.key] = c.label; });
  const catTotals = {};
  freeKeys.forEach(k => { catTotals[k] = 0; });
  counted.forEach(r => {
    Object.keys(r.attendance || {}).forEach(k => {
      catTotals[k] = (catTotals[k] || 0) + (Number(r.attendance[k]) || 0);
    });
  });
  const freeTotal = freeKeys.reduce((a, k) => a + (catTotals[k] || 0), 0);
  const paidTotal = Object.keys(catTotals)
    .filter(k => freeKeys.indexOf(k) === -1)
    .reduce((a, k) => a + catTotals[k], 0);

  const salesQty = (key) => counted.reduce((a, r) => a + (Number(((r.sales || {})[key] || {}).qty) || 0), 0);
  const receipts = (key) => counted.reduce((a, r) => a + (Number((r.receipts || {})[key]) || 0), 0);

  const recByFixture = {};
  records.forEach(r => { recByFixture[r.fixture_id] = r; });
  const today = new Date().toISOString().slice(0, 10);

  return {
    season,
    matches: n,
    attendance: {
      total: totalAtt,
      average: n ? Math.round(totalAtt / n) : 0,
      highest: n ? Math.max(...attendances) : 0,
      lowest: n ? Math.min(...attendances) : 0,
      paid: paidTotal,
      free: freeTotal,
      guestList: catTotals.guest_list || 0,
      seasonTicket: catTotals.season_ticket || 0,
    },
    money: {
      total_receipts_pence: gate,
      average_per_attendee_pence: totalAtt ? Math.round(gate / totalAtt) : 0,
      expected_pence: sum(r => r.expected_pence),
      cash_pence: receipts('cash_pence'),
      card_pence: receipts('card_pence'),
      online_pence: receipts('online_pence'),
      other_pence: receipts('other_pence'),
    },
    sales: {
      programmes: salesQty('programmes'),
      badges: salesQty('badges'),
      merch: salesQty('merch'),
      sales_pence: sum(r => r.sales_pence),
    },
    byCompetition: Object.values(byComp).sort((a, b) => b.receipts_pence - a.receipts_pence),
    ticketCategories: Object.keys(catTotals).map(k => ({
      key: k,
      label: freeLabel[k] || k,
      free: freeKeys.indexOf(k) > -1,
      total: catTotals[k],
    })).sort((a, b) => (a.free === b.free) ? b.total - a.total : (a.free ? 1 : -1)),
    exceptions: {
      // A home fixture that has been played but has no completed record.
      missingRecords: fixtures
        .filter(f => (f.us != null && f.them != null) || f.date < today)
        .filter(f => { const r = recByFixture[f.id]; return !r || ['completed', 'locked'].indexOf(r.status) === -1; })
        .map(f => ({ fixture_id: f.id, date: f.date, opponent: f.opponent, competition: f.competition,
                     recordStatus: recByFixture[f.id] ? recByFixture[f.id].status : 'none' })),
      unreconciled: records
        .filter(r => ['in_progress', 'awaiting_reconciliation'].indexOf(r.status) > -1)
        .map(r => ({ fixture_id: r.fixture_id, status: r.status, opponent: (r.fixture_snapshot || {}).opponent })),
      attendanceDiscrepancies: records
        .filter(r => r.attendance_variance != null && r.attendance_variance !== 0)
        .map(r => ({ fixture_id: r.fixture_id, opponent: (r.fixture_snapshot || {}).opponent,
                     variance: r.attendance_variance, note: r.attendance_variance_note })),
      financialDiscrepancies: records
        .filter(r => Number(r.financial_variance_pence) !== 0)
        .map(r => ({ fixture_id: r.fixture_id, opponent: (r.fixture_snapshot || {}).opponent,
                     variance_pence: r.financial_variance_pence, note: r.reconciliation_note })),
    },
  };
}

/** Archive: seasons → competitions → fixtures. Never one giant dropdown. */
async function actionArchive(b, session) {
  requireCap(session, AUTH.CAP.FINANCE, 'view the archive');
  const records = await S.allRecords();
  const seasons = {};
  records.forEach(r => {
    if (!seasons[r.season]) seasons[r.season] = { season: r.season, matches: 0, attendance: 0, receipts_pence: 0, competitions: {} };
    const s = seasons[r.season];
    const att = Number(r.attendance_official != null ? r.attendance_official : r.attendance_calculated) || 0;
    s.matches++; s.attendance += att; s.receipts_pence += Number(r.declared_pence) || 0;
    const ck = r.competition_id || r.competition_label || 'Other';
    if (!s.competitions[ck]) s.competitions[ck] = { key: ck, label: r.competition_label || ck, matches: 0, attendance: 0, receipts_pence: 0, fixtures: [] };
    const c = s.competitions[ck];
    c.matches++; c.attendance += att; c.receipts_pence += Number(r.declared_pence) || 0;
    c.fixtures.push({
      fixture_id: r.fixture_id,
      date: (r.fixture_snapshot || {}).date,
      opponent: (r.fixture_snapshot || {}).opponent,
      attendance: att,
      receipts_pence: Number(r.declared_pence) || 0,
      status: r.status,
      is_legacy_import: r.is_legacy_import,
    });
  });
  const out = Object.values(seasons)
    .map(s => Object.assign(s, {
      competitions: Object.values(s.competitions).map(c =>
        Object.assign(c, { fixtures: c.fixtures.sort((a, b) => String(b.date).localeCompare(String(a.date))) })),
    }))
    .sort((a, b) => b.season.localeCompare(a.season));
  return ok({ seasons: out });
}

/** CSV export of a season's records. */
async function actionExport(b, session) {
  requireCap(session, AUTH.CAP.FINANCE, 'export match-day data');
  const season = text(b.season, 20) || (await currentSeason());
  const records = await S.recordsForSeason(season);
  // Every ticket category that appears anywhere in the season gets its own
  // column, so Guest List / Complimentary is explicit in the export and can
  // never be lost inside a total. Paid categories first, then the free ones.
  const seenKeys = new Set();
  records.forEach(r => Object.keys(r.attendance || {}).forEach(k => seenKeys.add(k)));
  MDC.FREE_CATEGORIES.forEach(c => seenKeys.add(c.key));   // always present, even at zero
  const freeKeys = MDC.FREE_CATEGORIES.map(c => c.key);
  const paidKeys = [...seenKeys].filter(k => freeKeys.indexOf(k) === -1).sort();
  const catKeys = paidKeys.concat(freeKeys);

  const cols = [
    'date', 'opponent', 'competition', 'record_status', 'turnstile_operator',
  ].concat(catKeys.map(k => 'att_' + k))
   .concat([
    'attendance_paid_total', 'attendance_free_total',
    'attendance_calculated', 'attendance_official', 'attendance_variance', 'attendance_variance_note',
    'price_source', 'expected_gate_pence', 'sales_pence',
    'expected_pence', 'cash_pence', 'card_pence', 'online_pence', 'other_pence',
    'declared_pence', 'financial_variance_pence', 'reconciliation_note',
    'float_open_pence', 'float_close_pence',
    'completed_by', 'approved_by', 'updated_at',
  ]);
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = records.map(r => {
    const fs = r.fixture_snapshot || {}, rc = r.receipts || {}, att = r.attendance || {};
    const freeTotal = freeKeys.reduce((a, k) => a + (Number(att[k]) || 0), 0);
    const paidTotal = paidKeys.reduce((a, k) => a + (Number(att[k]) || 0), 0);
    return [
      fs.date, fs.opponent, r.competition_label, r.status, r.operator,
    ].concat(catKeys.map(k => Number(att[k]) || 0))
     .concat([
      paidTotal, freeTotal,
      r.attendance_calculated, r.attendance_official, r.attendance_variance, r.attendance_variance_note,
      (r.price_snapshot && r.price_snapshot.source) || '',
      r.expected_gate_pence, r.sales_pence,
      r.expected_pence, rc.cash_pence || 0, rc.card_pence || 0, rc.online_pence || 0, rc.other_pence || 0,
      r.declared_pence, r.financial_variance_pence, r.reconciliation_note,
      r.float_open_pence, r.float_close_pence,
      r.completed_by, r.approved_by, r.updated_at,
    ]).map(esc).join(',');
  });
  return ok({ season, csv: [cols.join(',')].concat(rows).join('\r\n'), count: records.length });
}

// ── ROUTER ─────────────────────────────────────────────────────────────────
const ACTIONS = {
  list: actionList,
  get: actionGet,
  prepare: actionPrepare,
  save: actionSave,
  submit: actionSubmit,
  approve: actionApprove,
  lock: actionLock,
  reopen: actionReopen,
  status: actionSetStatus,
  'prices-get': actionPricesGet,
  'price-override': actionPriceOverride,
  'price-override-clear': actionPriceOverrideClear,
  audit: actionAudit,
  reports: actionReports,
  archive: actionArchive,
  export: actionExport,
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return bad(405, 'POST only');

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return bad(400, 'Bad JSON'); }

  // Gate 1 — the club PIN.
  if (!adminOk(b.pin)) return bad(401, 'Unauthorized');

  // Gate 2 — a signed identity. Capabilities come from HERE, never the body.
  // Fail closed and SAY WHY if the signing secret is missing, rather than
  // telling a volunteer their session expired when it never could be minted.
  const cfgErr = AUTH.configError();
  if (cfgErr) return bad(503, cfgErr, { misconfigured: true });

  const session = AUTH.verify(b.token);
  if (!session) return bad(401, 'Your session has expired — sign in again.', { reauth: true });

  const fn = ACTIONS[b.action];
  if (!fn) return bad(400, 'Unknown action: ' + String(b.action).slice(0, 40));

  try {
    return await fn(b, session);
  } catch (e) {
    if (e instanceof HttpError) return resp(e.status, Object.assign({ ok: false, error: e.message }, e.extra));
    // A database check-constraint violation is a real, explainable refusal.
    if (e && /locked|append-only|negative|whole number/i.test(e.message || '')) {
      return bad(409, e.message);
    }
    console.error('matchday-ops error:', e && e.stack ? e.stack : e);
    return bad(500, 'Something went wrong saving that. Nothing was changed.');
  }
};

// Exported for the test suite (no network, no database).
exports._internal = { buildReports, cleanTally, cleanSales, cleanReceipts, cleanNotes, derivedColumns, qty, pence, present };
