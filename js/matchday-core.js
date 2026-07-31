/**
 * MATCH DAY OPERATIONS — shared core.
 *
 * ONE owner for the rules that both the browser and the server must agree on:
 * which season a date belongs to, which competition a label maps to, what the
 * ticket categories are, and how attendance and money are calculated.
 *
 * The browser uses this for instant on-screen feedback while a volunteer taps.
 * The SERVER uses the same functions to RECALCULATE everything before it writes.
 * The browser's arithmetic is never trusted — it is only ever a preview.
 *
 * Loads in both worlds:
 *   Node    →  const MDC = require('./lib/matchday-core');
 *   Browser →  <script src="js/matchday-core.js"></script>  → window.MatchdayCore
 *
 * Money is INTEGER PENCE everywhere. Never floats. £9.00 is 900.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MatchdayCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── SEASON ──────────────────────────────────────────────────────────────
  // A season starts 1 July. This is the same rule tools-archive-match.js has
  // always used (seasonOf) and the rule data/seasons.json documents.
  var SEASON_STARTS_MONTH = 7;

  function seasonOf(iso) {
    var m = /^(\d{4})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    var y = parseInt(m[1], 10), mo = parseInt(m[2], 10);
    var start = mo >= SEASON_STARTS_MONTH ? y : y - 1;
    return start + '-' + String((start + 1) % 100).padStart(2, '0');
  }

  // ── COMPETITION MAPPING ─────────────────────────────────────────────────
  // EXPLICIT and REVIEWABLE, exactly as the brief requires. A label that is not
  // in this table returns '' — it is NEVER guessed into the nearest-looking id.
  // An empty competitionId is an honest "not a registered competition" (a
  // pre-season friendly is not a competition the club has entered) and the
  // human-readable `competition` label is always preserved untouched.
  //
  // Keys are normalised: lowercase, punctuation stripped, whitespace collapsed.
  var COMPETITION_ALIASES = {
    // Combined Counties Premier Division North → ccl-prem-north
    'combined counties prem n': 'ccl-prem-north',
    'combined counties prem north': 'ccl-prem-north',
    'combined counties premier division north': 'ccl-prem-north',
    'combined counties premier north': 'ccl-prem-north',
    'ccl premier div north': 'ccl-prem-north',
    'ccl prem north': 'ccl-prem-north',
    // Combined Counties League Cup
    'combined counties league cup': 'ccl-league-cup',
    'ccl league cup': 'ccl-league-cup',
    // Middlesex County Senior Cup
    'middlesex county senior cup': 'middlesex-senior-cup',
    'middlesex senior cup': 'middlesex-senior-cup',
    // Emirates FA Cup — round suffixes are stripped before lookup
    'fa cup': 'fa-cup',
    'emirates fa cup': 'fa-cup',
    // Isuzu FA Vase
    'fa vase': 'fa-vase',
    'isuzu fa vase': 'fa-vase'
  };

  // Round/qualifier suffixes that qualify a competition without changing which
  // competition it is: "FA Cup EP" and "FA Cup 1Q" are both the FA Cup.
  var ROUND_SUFFIX = /\b(ep|epr|extra preliminary( round)?|preliminary( round)?|[1-6]q|q[1-6]|[1-6](st|nd|rd|th)? ?(qualifying|round)( round)?|r[1-6]|round [1-6]|semi ?final|final|quarter ?final)\b/g;

  function normaliseCompLabel(label) {
    return String(label || '')
      .toLowerCase()
      .replace(/[.,'’\-–—/()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * label → competition id, or '' when there is no confident mapping.
   * `known` (optional) is the array from data/competitions.json; when supplied,
   * an exact match on a competition's `name` or `short` also counts, so a new
   * competition added to that file maps without a code change.
   */
  function competitionIdFor(label, known) {
    var n = normaliseCompLabel(label);
    if (!n) return '';

    // 1. registry first — data/competitions.json is the canonical list
    if (known && known.length) {
      for (var i = 0; i < known.length; i++) {
        var c = known[i];
        if (!c || !c.id) continue;
        if (normaliseCompLabel(c.name) === n) return c.id;
        if (normaliseCompLabel(c.short) === n) return c.id;
        if (normaliseCompLabel(c.id) === n) return c.id;
      }
    }
    // 2. explicit alias table
    if (COMPETITION_ALIASES[n]) return COMPETITION_ALIASES[n];
    // 3. same, with round/qualifier suffixes removed ("FA Cup EP" → "fa cup")
    var stripped = n.replace(ROUND_SUFFIX, ' ').replace(/\s+/g, ' ').trim();
    if (stripped !== n && COMPETITION_ALIASES[stripped]) return COMPETITION_ALIASES[stripped];
    if (stripped !== n && known && known.length) {
      for (var j = 0; j < known.length; j++) {
        var k = known[j];
        if (!k || !k.id) continue;
        if (normaliseCompLabel(k.name) === stripped) return k.id;
        if (normaliseCompLabel(k.short) === stripped) return k.id;
      }
    }
    return ''; // honest unknown — flagged, never guessed
  }

  // A friendly/testimonial/charity game is a real match-day operation but not a
  // registered competition. This classifies it for REPORTING only; it never
  // invents a competitionId.
  function fixtureKind(label) {
    var n = normaliseCompLabel(label);
    if (/friendly/.test(n)) return 'friendly';
    if (/testimonial/.test(n)) return 'testimonial';
    if (/charity/.test(n)) return 'charity';
    return '';
  }

  // ── FIXTURE STATUS ──────────────────────────────────────────────────────
  // The canonical vocabulary for data/fixtures.json .status. 'ft' was a second
  // spelling of 'played' and is normalised away on read.
  var FIXTURE_STATUSES = ['scheduled', 'played', 'postponed', 'cancelled', 'abandoned'];

  function normaliseFixtureStatus(s) {
    var v = String(s || '').toLowerCase().trim();
    if (v === 'ft' || v === 'full time' || v === 'fulltime' || v === 'final') return 'played';
    return FIXTURE_STATUSES.indexOf(v) > -1 ? v : 'scheduled';
  }

  // ── RECORD LIFECYCLE ────────────────────────────────────────────────────
  var RECORD_STATUSES = ['upcoming', 'ready', 'in_progress', 'awaiting_reconciliation',
                         'completed', 'locked', 'cancelled', 'postponed', 'abandoned'];

  // Which transitions are legal. The SERVER enforces this; the UI only uses it
  // to decide which buttons to show.
  var TRANSITIONS = {
    upcoming:                ['ready', 'cancelled', 'postponed'],
    ready:                   ['in_progress', 'upcoming', 'cancelled', 'postponed', 'abandoned'],
    in_progress:             ['awaiting_reconciliation', 'abandoned', 'cancelled', 'postponed'],
    awaiting_reconciliation: ['completed', 'in_progress', 'abandoned'],
    completed:               ['locked', 'awaiting_reconciliation'],
    locked:                  ['awaiting_reconciliation'],   // reopen only — permission + reason
    cancelled:               ['upcoming'],
    postponed:               ['upcoming'],
    abandoned:               ['awaiting_reconciliation']    // an abandoned game still took money
  };

  function canTransition(from, to) {
    if (from === to) return true;
    var allowed = TRANSITIONS[from];
    return !!allowed && allowed.indexOf(to) > -1;
  }

  // A record in one of these is finished business and must not be edited in
  // place. 'locked' additionally needs can_matchday_reopen + a reason.
  function isLocked(status) { return status === 'locked'; }

  // ── TICKET CATEGORIES ───────────────────────────────────────────────────
  // Every category is CONFIGURABLE. These are only the seed defaults used when
  // a season has no price list yet. `counts` = counts toward official
  // attendance. `revenue` = contributes to expected gate revenue.
  //
  // Complimentary, season-ticket, officials and scouts all walk through the
  // gate (so they count as attendance) but produce no gate cash on the day —
  // which is precisely why declared receipts must be compared against expected
  // revenue and not against the headcount.
  var DEFAULT_CATEGORIES = [
    { key: 'adults',        label: 'Adults',                 price_pence: 900, counts: true,  revenue: true,  order: 1,  enabled: true },
    { key: 'concessions',   label: 'Concessions',            price_pence: 600, counts: true,  revenue: true,  order: 2,  enabled: true },
    { key: 'seniors',       label: 'Senior citizens',        price_pence: 600, counts: true,  revenue: true,  order: 3,  enabled: true },
    { key: 'students',      label: 'Students',               price_pence: 600, counts: true,  revenue: true,  order: 4,  enabled: true },
    { key: 'u16',           label: 'Under 16s',              price_pence: 200, counts: true,  revenue: true,  order: 5,  enabled: true },
    { key: 'u10',           label: 'Under 10s',              price_pence: 0,   counts: true,  revenue: false, order: 6,  enabled: true },
    { key: 'complimentary', label: 'Complimentary',          price_pence: 0,   counts: true,  revenue: false, order: 7,  enabled: true },
    { key: 'season_ticket', label: 'Season ticket',          price_pence: 0,   counts: true,  revenue: false, order: 8,  enabled: true },
    { key: 'officials',     label: 'Match officials',        price_pence: 0,   counts: true,  revenue: false, order: 9,  enabled: true },
    { key: 'scouts',        label: 'Scouts',                 price_pence: 0,   counts: true,  revenue: false, order: 10, enabled: true },
    { key: 'away',          label: 'Away supporters',        price_pence: 900, counts: true,  revenue: true,  order: 11, enabled: true },
    { key: 'other',         label: 'Other',                  price_pence: 0,   counts: true,  revenue: false, order: 12, enabled: true }
  ];

  // ── MONEY ───────────────────────────────────────────────────────────────
  // Parse a human "£9", "9.50", "Free" into integer pence. Returns null when
  // the input is not a number at all, so a caller can tell "0" from "junk".
  function toPence(v) {
    if (v === 0) return 0;
    if (v == null) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
    var s = String(v).trim().replace(/[£$,\s]/g, '');
    if (!s) return null;
    if (/^(free|n\/?a|-)$/i.test(s)) return 0;
    if (!/^-?\d*\.?\d+$/.test(s)) return null;
    return Math.round(parseFloat(s) * 100);
  }

  function fmtGBP(pence) {
    var n = (Number(pence) || 0) / 100;
    return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function intOrZero(v) {
    var n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  // ── CALCULATION ─────────────────────────────────────────────────────────
  // These are the numbers the server recalculates on EVERY write. A client may
  // send them; the server ignores what it is sent and recomputes from the
  // tallies and the snapshotted prices.

  /** Counted attendance = Σ quantities of categories flagged `counts`. */
  function calcAttendance(categories, tallies) {
    var t = tallies || {}, total = 0;
    (categories || []).forEach(function (c) {
      if (!c || c.enabled === false || !c.counts) return;
      total += intOrZero(t[c.key]);
    });
    return total;
  }

  /** Expected gate revenue = Σ qty × SNAPSHOT price, for `revenue` categories. */
  function calcExpectedPence(categories, tallies) {
    var t = tallies || {}, total = 0;
    (categories || []).forEach(function (c) {
      if (!c || c.enabled === false || !c.revenue) return;
      total += intOrZero(t[c.key]) * (parseInt(c.price_pence, 10) || 0);
    });
    return total;
  }

  /** Sales revenue = Σ qty × unit price, plus the flat income lines. */
  function calcSalesPence(sales) {
    var s = sales || {}, total = 0;
    ['programmes', 'badges', 'merch'].forEach(function (k) {
      var line = s[k];
      if (!line) return;
      total += intOrZero(line.qty) * (parseInt(line.unit_pence, 10) || 0);
    });
    total += parseInt(s.hospitality_pence, 10) || 0;
    total += parseInt(s.sponsorship_pence, 10) || 0;
    (s.other || []).forEach(function (o) {
      total += o && o.qty != null
        ? intOrZero(o.qty) * (parseInt(o.unit_pence, 10) || 0)
        : (parseInt(o && o.amount_pence, 10) || 0);
    });
    return total;
  }

  /** Declared receipts = what was actually counted in the tin and on the reader. */
  function calcDeclaredPence(receipts) {
    var r = receipts || {};
    return (parseInt(r.cash_pence, 10) || 0)
         + (parseInt(r.card_pence, 10) || 0)
         + (parseInt(r.online_pence, 10) || 0)
         + (parseInt(r.other_pence, 10) || 0);
  }

  /**
   * The full derived picture. SIGNS MATTER and are fixed here once:
   *   attendance_variance = declared official − calculated
   *        positive → the official figure is HIGHER than we counted
   *   financial_variance  = declared receipts − expected
   *        positive → MORE money than the prices predict (surplus)
   *        negative → a SHORTFALL
   */
  function derive(record) {
    var r = record || {};
    var cats = (r.price_snapshot && r.price_snapshot.categories) || r.categories || [];
    var calculated = calcAttendance(cats, r.attendance);
    var expectedGate = calcExpectedPence(cats, r.attendance);
    var sales = calcSalesPence(r.sales);
    var declared = calcDeclaredPence(r.receipts);
    var official = r.attendance_official == null ? null : intOrZero(r.attendance_official);

    // Expected total = gate + sales. The float is working capital, not income:
    // it is added at the open and removed at the close, so it nets to zero and
    // is deliberately NOT part of expected receipts.
    var expectedTotal = expectedGate + sales;

    return {
      attendance_calculated: calculated,
      attendance_official: official,
      attendance_variance: official == null ? null : official - calculated,
      expected_gate_pence: expectedGate,
      sales_pence: sales,
      expected_pence: expectedTotal,
      declared_pence: declared,
      financial_variance_pence: declared - expectedTotal,
      float_open_pence: parseInt(r.float_open_pence, 10) || 0,
      float_close_pence: parseInt(r.float_close_pence, 10) || 0
    };
  }

  /** An empty record body. Every new fixture starts here — all zeros, always. */
  function emptyBody() {
    return {
      attendance: {},          // no categories tallied
      attendance_official: null,
      sales: {},
      receipts: {},
      float_open_pence: 0,
      float_close_pence: 0,
      notes: {}
    };
  }

  var NOTE_KEYS = ['incidents', 'turnstile', 'cash', 'attendance', 'general'];

  return {
    SEASON_STARTS_MONTH: SEASON_STARTS_MONTH,
    seasonOf: seasonOf,
    COMPETITION_ALIASES: COMPETITION_ALIASES,
    normaliseCompLabel: normaliseCompLabel,
    competitionIdFor: competitionIdFor,
    fixtureKind: fixtureKind,
    FIXTURE_STATUSES: FIXTURE_STATUSES,
    normaliseFixtureStatus: normaliseFixtureStatus,
    RECORD_STATUSES: RECORD_STATUSES,
    TRANSITIONS: TRANSITIONS,
    canTransition: canTransition,
    isLocked: isLocked,
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    NOTE_KEYS: NOTE_KEYS,
    toPence: toPence,
    fmtGBP: fmtGBP,
    intOrZero: intOrZero,
    calcAttendance: calcAttendance,
    calcExpectedPence: calcExpectedPence,
    calcSalesPence: calcSalesPence,
    calcDeclaredPence: calcDeclaredPence,
    derive: derive,
    emptyBody: emptyBody
  };
}));
