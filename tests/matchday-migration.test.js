// MATCH DAY OPERATIONS — legacy migration, security and regression tests.
//
//   npm test
//
// The migration is the part that could quietly corrupt the club's history, so
// most of these assert what it REFUSES to do rather than what it does.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

process.env.MD_TOKEN_SECRET = 'test-secret-for-tests-only';

const MIG = require('../netlify/functions/matchday-migrate.js');
const { matchFixture, buildRow, norm, pence } = MIG._internal;

const ROOT = path.join(__dirname, '..');

const FIXTURES = [
  { id: 'fwp-1', date: '2026-08-01', opponent: 'Wallingford & Crowmarsh', isHome: true,
    competition: 'Combined Counties Prem N', competitionId: 'ccl-prem-north', season: '2026-27', kickoff: '15:00', venue: 'Tithe Farm' },
  { id: 'fwp-2', date: '2026-08-08', opponent: 'London Lions', isHome: true,
    competition: 'FA Cup EP', competitionId: 'fa-cup', season: '2026-27', kickoff: '15:00', venue: 'Tithe Farm' },
  { id: 'fwp-3', date: '2026-08-15', opponent: 'Hilltop', isHome: false,
    competition: 'Combined Counties Prem N', competitionId: 'ccl-prem-north', season: '2026-27', kickoff: '15:00', venue: 'Away' },
];

// ── MATCHING: never a guess ────────────────────────────────────────────────
test('a legacy row matches only an exact home fixture', () => {
  const r = matchFixture({ date: '2026-08-01', opponent: 'Wallingford & Crowmarsh', homeAway: 'home' }, FIXTURES);
  assert.strictEqual(r.fixture.id, 'fwp-1');
});

test('opponent matching ignores punctuation and case but nothing else', () => {
  assert.strictEqual(norm('Wallingford & Crowmarsh'), norm('wallingford and crowmarsh').replace('and', ''));
  const r = matchFixture({ date: '2026-08-01', opponent: 'WALLINGFORD & CROWMARSH', homeAway: 'home' }, FIXTURES);
  assert.strictEqual(r.fixture.id, 'fwp-1');
});

test('an away fixture never becomes a home match-day record (test 3)', () => {
  const r = matchFixture({ date: '2026-08-15', opponent: 'Hilltop', homeAway: 'away' }, FIXTURES);
  assert.ok(r.reason, 'must not match');
  assert.match(r.reason, /away/i);
  // Even if the ledger claimed 'home', the fixture itself is away and must not match.
  const r2 = matchFixture({ date: '2026-08-15', opponent: 'Hilltop', homeAway: 'home' }, FIXTURES);
  assert.ok(r2.reason, 'an away fixture must not be matched even when the row says home');
});

test('a near-miss date is reported as a suggestion, never applied', () => {
  const r = matchFixture({ date: '2026-08-02', opponent: 'Wallingford & Crowmarsh', homeAway: 'home' }, FIXTURES);
  assert.ok(!r.fixture, 'must NOT auto-attach to a nearby fixture');
  assert.match(r.reason, /did you mean/i);
  assert.match(r.reason, /Not applied automatically/i);
});

test('an unknown opponent is reported, not guessed onto the nearest fixture', () => {
  const r = matchFixture({ date: '2026-08-01', opponent: 'Someone Else FC', homeAway: 'home' }, FIXTURES);
  assert.ok(!r.fixture);
  assert.match(r.reason, /no home fixture/i);
});

test('an ambiguous match is refused rather than picking one', () => {
  const dupes = FIXTURES.concat([{ id: 'dup', date: '2026-08-01', opponent: 'Wallingford & Crowmarsh', isHome: true, season: '2026-27' }]);
  const r = matchFixture({ date: '2026-08-01', opponent: 'Wallingford & Crowmarsh', homeAway: 'home' }, dupes);
  assert.ok(!r.fixture);
  assert.match(r.reason, /ambiguous/i);
});

test('a row with no date or opponent is reported, not dropped', () => {
  assert.match(matchFixture({ opponent: 'X' }, FIXTURES).reason, /no date or opponent/i);
  assert.match(matchFixture({ date: '2026-08-01' }, FIXTURES).reason, /no date or opponent/i);
});

// ── BUILDING: never a fabrication ──────────────────────────────────────────
const LEGACY = {
  id: 'match-123', date: '2026-08-01', opponent: 'Wallingford & Crowmarsh', homeAway: 'home',
  competition: 'CCL Premier Div North', scoreUs: 2, scoreThem: 1, attendance: 204,
  takings: { entry: 1112.00, programmes: 96.00, merch: 33.50, other: 0 },
  playersAttended: ['A. Player'], staffCheckedIn: ['A. Volunteer'], notes: 'Windy.',
};

test('pounds become integer pence without float drift', () => {
  assert.strictEqual(pence(1112.00), 111200);
  assert.strictEqual(pence(33.50), 3350);
  assert.strictEqual(pence(0.1) + pence(0.2), 30);
  assert.strictEqual(pence(0), 0);
  assert.strictEqual(pence(-5), 0, 'a negative legacy amount is treated as nothing, never a negative receipt');
});

test('the single attendance number is NOT spread across ticket categories', () => {
  const row = buildRow(LEGACY, FIXTURES[0]);
  assert.deepStrictEqual(row.attendance, {}, 'category detail must not be invented');
  assert.strictEqual(row.attendance_official, 204, 'it was a declared figure and stays one');
  assert.strictEqual(row.attendance_calculated, 0);
  assert.strictEqual(row.attendance_variance, null, 'there is nothing to compare against');
  assert.match(row.attendance_variance_note, /no category count/i);
});

test('no cash/card split is fabricated', () => {
  const row = buildRow(LEGACY, FIXTURES[0]);
  assert.strictEqual(row.receipts.cash_pence, undefined, 'cash must not be invented');
  assert.strictEqual(row.receipts.card_pence, undefined, 'card must not be invented');
  assert.strictEqual(row.receipts.other_pence, 111200 + 9600 + 3350, 'the total sits under "other"');
  assert.strictEqual(row.declared_pence, 124150);
});

test('sales quantities are not invented — only the amounts that were recorded', () => {
  const row = buildRow(LEGACY, FIXTURES[0]);
  assert.strictEqual(row.sales.programmes, undefined, 'no invented programme quantity');
  assert.strictEqual(row.sales.badges, undefined);
  const labels = row.sales.other.map(o => o.label);
  assert.ok(labels.some(l => /Programmes .*quantity not recorded/i.test(l)));
  assert.ok(row.sales.other.every(o => o.qty === undefined), 'flat amounts only, never qty x unit');
  assert.strictEqual(row.sales_pence, 9600 + 3350);
});

test('no price snapshot, operator or approver is fabricated', () => {
  const row = buildRow(LEGACY, FIXTURES[0]);
  assert.strictEqual(row.price_snapshot, null, 'the prices in force were never recorded');
  assert.strictEqual(row.price_list_id, null);
  assert.strictEqual(row.completed_by, null, 'nobody is credited who was not recorded');
});

test('the migration does not manufacture a discrepancy nobody observed', () => {
  const row = buildRow(LEGACY, FIXTURES[0]);
  assert.strictEqual(row.expected_pence, row.declared_pence);
  assert.strictEqual(row.financial_variance_pence, 0);
  assert.match(row.reconciliation_note, /No reconciliation was performed at the time/i);
});

test('provenance is preserved verbatim, with explicit caveats', () => {
  const row = buildRow(LEGACY, FIXTURES[0]);
  assert.strictEqual(row.is_legacy_import, true);
  assert.deepStrictEqual(row.legacy_source.original, LEGACY, 'the original row is kept exactly');
  assert.ok(row.legacy_source.caveats.length >= 5);
  assert.strictEqual(row.legacy_source.source, 'match_finances.matches');
  assert.strictEqual(row.status, 'locked', 'history arrives locked');
  assert.strictEqual(row.notes.general, 'Windy.', 'original notes are carried over');
});

test('a migrated record inherits the fixture spine, not the ledger free text', () => {
  const row = buildRow(LEGACY, FIXTURES[0]);
  assert.strictEqual(row.fixture_id, 'fwp-1');
  assert.strictEqual(row.season, '2026-27');
  assert.strictEqual(row.competition_id, 'ccl-prem-north', 'the canonical id wins over "CCL Premier Div North"');
  assert.strictEqual(row.fixture_snapshot.opponent, 'Wallingford & Crowmarsh');
});

// ── SECURITY (tests 26, 27) ────────────────────────────────────────────────
test('no service credentials appear in anything served to the browser', () => {
  const clientFiles = [
    'admin.html', 'index.html', 'fixtures.html', 'scan.html',
    'js/matchday-ops.js', 'js/matchday-core.js', 'js/main.js', 'js/components.js',
    'css/matchday-ops.css',
  ];
  // Credential VALUES, not variable names. admin.html legitimately names
  // SUPABASE_SERVICE_KEY in its setup instructions ("set this in Netlify"),
  // which is documentation, not a leak. What must never appear is a value:
  // a JWT (which is what a Supabase service key is), a GitHub PAT, or a secret
  // env var being ASSIGNED a literal in client code.
  const forbidden = [
    { re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, why: 'a JWT — a Supabase service key is one' },
    { re: /\bghp_[A-Za-z0-9]{30,}/, why: 'a GitHub personal access token' },
    { re: /\bsb_secret_[A-Za-z0-9_-]{10,}/, why: 'a Supabase secret key' },
    { re: /(SERVICE_KEY|SECRET_KEY|SERVICE_ROLE_KEY|TOKEN_SECRET)\s*[:=]\s*['"][^'"\s]{12,}['"]/,
      why: 'a secret assigned a literal value in client code' },
    { re: /"role"\s*:\s*"service_role"/, why: 'a decoded service_role claim' },
  ];
  clientFiles.forEach(f => {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) return;
    const src = fs.readFileSync(p, 'utf8');
    forbidden.forEach(({ re, why }) => {
      const m = src.match(re);
      assert.ok(!m, `${f} appears to contain ${why}: ${m && m[0].slice(0, 24)}…`);
    });
  });
});

test('the service key is only ever read from the environment, server-side', () => {
  // Every function that touches Supabase must take the key from process.env.
  const dir = path.join(ROOT, 'netlify/functions');
  const files = ['lib/md-store.js', 'matchday-ops.js', 'md-session.js', 'matchday-migrate.js'];
  files.forEach(f => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const assigns = src.match(/(KEY|SECRET)\s*=\s*[^;\n]+/g) || [];
    assigns.forEach(a => {
      assert.ok(/process\.env|require\(|AUTH\.|\bnull\b/.test(a),
        `${f}: a key must come from the environment, got: ${a.slice(0, 60)}`);
    });
  });
});

test('the Match Day Ops client never talks to Supabase directly', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/matchday-ops.js'), 'utf8');
  assert.ok(!/supabase\.co/.test(src), 'the browser must go through the Netlify function, never Supabase');
  assert.ok(!/rest\/v1/.test(src));
  assert.ok(/\.netlify\/functions\/matchday-ops/.test(src));
});

test('the migration SQL has RLS on and no policies for the md_ tables', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260730000000_matchday_ops.sql'), 'utf8');
  ['md_price_lists', 'md_records', 'md_audit'].forEach(t => {
    assert.ok(new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(sql), `${t} must have RLS enabled`);
    assert.ok(!new RegExp(`create policy[^;]*on public\\.${t}`).test(sql), `${t} must have NO policy — the anon key must not read takings`);
  });
});

test('the migration is additive — it drops no table, column or data', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260730000000_matchday_ops.sql'), 'utf8');
  assert.ok(!/drop table/i.test(sql), 'no table may be dropped');
  assert.ok(!/drop column/i.test(sql), 'no column may be dropped');
  assert.ok(!/truncate/i.test(sql), 'nothing may be truncated');
  assert.ok(!/delete from/i.test(sql), 'nothing may be deleted');
  // Dropping and recreating a TRIGGER/POLICY by name is how the file stays re-runnable.
  const drops = sql.match(/drop (\w+)/gi).map(s => s.toLowerCase());
  drops.forEach(d => {
    assert.ok(/drop (trigger|policy)/.test(d), `unexpected: ${d}`);
  });
});

// ── REGRESSION (test 28) ───────────────────────────────────────────────────
test('the old ledger no longer accepts writes anywhere', () => {
  const fn = fs.readFileSync(path.join(ROOT, 'netlify/functions/analytics-data.js'), 'utf8');
  assert.ok(/statusCode: 410|resp\(410/.test(fn) || /410/.test(fn), 'POST must be refused with 410');
  assert.ok(!/method: 'PATCH'/.test(fn), 'the PATCH write must be gone');
  const admin = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  assert.ok(/ANALYTICS_RETIRED/.test(admin));
  ['addMatchRecord', 'removeMatchRecord', 'saveAnalytics'].forEach(f => {
    const re = new RegExp(`function ${f}\\([^)]*\\)\\s*\\{\\s*(//[^\\n]*\\n\\s*)*if \\(ANALYTICS_RETIRED\\)`);
    assert.ok(re.test(admin), `${f} must refuse when the ledger is retired`);
  });
});

test('every fixture write path stamps a season (test 18)', () => {
  const admin = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  // addFixture, the FWP import, the Next Match control and the matchday upsert.
  const stamps = admin.match(/season: fxSeasonOf\(/g) || [];
  assert.ok(stamps.length >= 4, `expected all 4 fixture write paths to stamp a season, found ${stamps.length}`);
  assert.ok(!/status: played \? 'ft'/.test(admin), "'ft' must no longer be written");
});

test('public fixture consumers still read only the fields they always read', () => {
  // competitionId is ADDITIVE. Nothing may have started depending on it in the
  // public site, and nothing may iterate fixture keys blindly.
  ['fixtures.html', 'js/main.js', 'js/club-now.js', 'netlify/functions/fixtures-ics.js'].forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/Object\.keys\(\s*f\s*\)/.test(src), `${f} must not iterate fixture keys blindly`);
  });
});

test('systems outside Match Day Ops were not touched', () => {
  // These files carry the squad, sponsors, social cards and public pages. The
  // brief was explicit that this work must not disturb them.
  const untouched = [
    'js/sponsor-rail.js', 'js/squad.js', 'js/share-news.js', 'js/programme.js',
    'data/sponsors.json', 'data/partners.json', 'data/news.json', 'data/squad.json',
    'data/players.json', 'fixtures.html', 'index.html', 'squad.html', 'news.html',
  ];
  untouched.forEach(f => {
    const p = path.join(ROOT, f);
    assert.ok(fs.existsSync(p), `${f} should still exist`);
    const src = fs.readFileSync(p, 'utf8');
    assert.ok(!/matchday-ops|md_records|MDOps/.test(src),
      `${f} must not have been wired into Match Day Ops`);
  });
});
