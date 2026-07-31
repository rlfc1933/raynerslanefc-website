// MATCH DAY OPERATIONS — pricing source, Guest List / Complimentary, and token
// security.
//
//   npm test
//
// Two things this file exists to protect:
//
//  1. THERE IS ONE PRICE SOURCE. data/config.json → `admission`, the block the
//     public website already renders at the gate. If a second season price list
//     ever creeps back in, the club charges one price and reconciles against
//     another, and nobody notices until the numbers are already wrong.
//
//  2. FREE ADMISSION IS NOT MISSING MONEY. Guest List / Complimentary, season
//     tickets, officials and scouts all walk through the turnstile and must be
//     counted — and must produce no expectation of cash. Getting this backwards
//     either hides supporters from the attendance figure or invents a shortfall
//     for the treasurer to chase.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.MD_TOKEN_SECRET = 'test-secret-for-tests-only-long-enough';

const ROOT = path.join(__dirname, '..');
const MDC = require('../js/matchday-core.js');
const OPS = require('../netlify/functions/matchday-ops.js');
const { buildReports } = OPS._internal;

const CONFIG = require('../data/config.json');
const CATS = MDC.categoriesFromAdmission(CONFIG.admission);
const byKey = Object.fromEntries(CATS.map(c => [c.key, c]));
const GUEST = 'guest_list';

// ── 1 · NORMAL FIXTURES RESOLVE PRICES FROM THE MAIN-SITE CONFIG ───────────
test('1 · normal fixtures price from the main-site admission configuration', () => {
  assert.ok(CONFIG.admission && Array.isArray(CONFIG.admission.prices) && CONFIG.admission.prices.length,
    'data/config.json must carry the admission block the website renders');
  CONFIG.admission.prices.forEach(p => {
    const c = byKey[MDC.paidKeyFor(p.label)];
    assert.ok(c, `"${p.label}" from the website must exist as a category`);
    assert.strictEqual(c.price_pence, MDC.toPence(p.price),
      `${p.label} must be priced exactly as the website publishes it`);
  });
  // Move the website price and Match Day Ops moves with it — no second edit.
  const moved = MDC.categoriesFromAdmission({ prices: [{ label: 'General Admission', price: '£11.50' }] });
  assert.strictEqual(moved.find(c => c.key === 'adults').price_pence, 1150);
});

test('1b · Match Day Ops keeps NO competing season price source', () => {
  const store = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/md-store.js'), 'utf8');
  assert.ok(/config\.json/.test(store), 'the store must read the site admission config');
  assert.ok(!/priceListFor/.test(store), 'the old season-list resolver must be gone');
  const ops = fs.readFileSync(path.join(ROOT, 'netlify/functions/matchday-ops.js'), 'utf8');
  assert.ok(!/'prices-save'/.test(ops), 'there must be no season price-save action');
  const ui = fs.readFileSync(path.join(ROOT, 'js/matchday-ops.js'), 'utf8');
  assert.ok(!/Ticket prices<\/button>/.test(ui), 'there must be no season price-management screen');
});

// ── 2-4 · GUEST LIST / COMPLIMENTARY ───────────────────────────────────────
test('2 · Guest List / Complimentary always resolves to zero', () => {
  const g = byKey[GUEST];
  assert.ok(g, 'the Guest List / Complimentary category must exist');
  assert.strictEqual(g.label, 'Guest List / Complimentary', 'the wording must be unambiguous on the gate');
  assert.strictEqual(g.price_pence, 0);
  assert.strictEqual(g.revenue, false);
  assert.strictEqual(g.paid, false);
  // Even if the website config gained a row that normalised to the same key,
  // the free list is appended last and is always £0.
  MDC.FREE_CATEGORIES.forEach(fc => {
    const c = byKey[fc.key];
    assert.strictEqual(c.price_pence, 0, `${fc.key} must be free`);
    assert.strictEqual(c.revenue, false, `${fc.key} must never create revenue`);
  });
});

test('3 · Guest List / Complimentary increases calculated attendance', () => {
  const before = MDC.calcAttendance(CATS, { adults: 50 });
  const after = MDC.calcAttendance(CATS, { adults: 50, [GUEST]: 12 });
  assert.strictEqual(before, 50);
  assert.strictEqual(after, 62, 'twelve guests are twelve more people through the turnstile');
});

test('4 · Guest List / Complimentary does not increase expected revenue', () => {
  const before = MDC.calcExpectedPence(CATS, { adults: 50 });
  const after = MDC.calcExpectedPence(CATS, { adults: 50, [GUEST]: 12 });
  assert.strictEqual(before, after, 'a guest list must never be expected to produce cash');
  assert.strictEqual(MDC.calcExpectedPence(CATS, { [GUEST]: 500 }), 0);
});

test('4b · a big guest list does NOT read as a cash shortfall', () => {
  const rec = {
    price_snapshot: { categories: CATS },
    attendance: { adults: 100, [GUEST]: 80 },
    receipts: { cash_pence: 90000 },      // exactly the 100 paying adults
  };
  const d = MDC.derive(rec);
  assert.strictEqual(d.attendance_calculated, 180, 'all 180 count');
  assert.strictEqual(d.expected_gate_pence, 90000, 'only the 100 paying create an expectation');
  assert.strictEqual(d.financial_variance_pence, 0,
    'the books balance — the guest list is not a discrepancy the treasurer must chase');
});

// ── 5-7 · VISIBILITY IN REPORTS, CSV AND PRINT ─────────────────────────────
const RECORDS = [{
  fixture_id: 'f1', season: '2026-27', competition_id: 'ccl-prem-north',
  competition_label: 'Combined Counties Prem N', status: 'locked',
  attendance: { adults: 100, u16: 10, [GUEST]: 14, season_ticket: 20 },
  attendance_calculated: 144, attendance_official: 144, attendance_variance: 0,
  declared_pence: 92000, expected_pence: 92000, financial_variance_pence: 0,
  sales_pence: 0, sales: {}, receipts: { cash_pence: 92000 },
  operator: 'A. Volunteer',
  price_snapshot: { categories: CATS, source: 'Season admission prices (data/config.json)' },
  fixture_snapshot: { date: '2026-08-01', opponent: 'Wallingford' },
}];
const FIXTURES = [{ id: 'f1', date: '2026-08-01', opponent: 'Wallingford', isHome: true,
  competition: 'Combined Counties Prem N', us: 2, them: 1 }];

test('5 · Guest List / Complimentary appears in report output', () => {
  const r = buildReports('2026-27', RECORDS, FIXTURES);
  const cat = r.ticketCategories.find(c => c.key === GUEST);
  assert.ok(cat, 'the guest list must be a line in the report');
  assert.strictEqual(cat.total, 14);
  assert.strictEqual(cat.label, 'Guest List / Complimentary');
  assert.strictEqual(cat.free, true, 'it must be grouped as free, not paid');
  // Headline split, so a reader sees paid vs free without adding up.
  assert.strictEqual(r.attendance.guestList, 14);
  assert.strictEqual(r.attendance.free, 34, '14 guests + 20 season tickets');
  assert.strictEqual(r.attendance.paid, 110);
});

test('5b · the guest list is listed in reports even when nobody used it', () => {
  const none = [Object.assign({}, RECORDS[0], { attendance: { adults: 10 } })];
  const r = buildReports('2026-27', none, FIXTURES);
  const cat = r.ticketCategories.find(c => c.key === GUEST);
  assert.ok(cat, 'the category must still be listed at zero, not vanish');
  assert.strictEqual(cat.total, 0);
});

test('6 · Guest List / Complimentary has its own CSV column', () => {
  const ops = fs.readFileSync(path.join(ROOT, 'netlify/functions/matchday-ops.js'), 'utf8');
  assert.ok(/FREE_CATEGORIES\.forEach\(c => seenKeys\.add\(c\.key\)\)/.test(ops),
    'every free category must be forced into the CSV header, even at zero');
  assert.ok(/attendance_free_total/.test(ops) && /attendance_paid_total/.test(ops),
    'the CSV must carry paid and free subtotals');
  assert.ok(/'att_' \+ k/.test(ops), 'each category needs its own att_ column');
  assert.ok(/turnstile_operator/.test(ops), 'the CSV must name who was on the turnstile');
});

test('7 · Guest List / Complimentary appears in the printable sheet', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'js/matchday-ops.js'), 'utf8');
  // The print sheet splits paid and free into labelled blocks.
  assert.ok(/Paying at the gate/.test(ui), 'the print sheet must label the paid block');
  assert.ok(/Admitted free/.test(ui), 'the print sheet must label the free block');
  assert.ok(/rowsFor\(pg\.free, false\)/.test(ui), 'free categories must be printed');
  assert.ok(/On the turnstile:/.test(ui), 'the print sheet must have a turnstile name line');
});

// ── 8-9 · THE TWO WAYS THIS COULD GO WRONG ─────────────────────────────────
test('8 · a paid ticket cannot inherit the complimentary price', () => {
  const adults = byKey['adults'];
  assert.ok(adults.price_pence > 0, 'the adult category must carry a real price');
  assert.strictEqual(adults.revenue, true);
  assert.strictEqual(adults.paid, true);
  // 10 adults must be worth 10 adults, never zero.
  assert.strictEqual(MDC.calcExpectedPence(CATS, { adults: 10 }), adults.price_pence * 10);
  // Keys are distinct, so a tally can never land in the wrong bucket.
  assert.notStrictEqual(MDC.paidKeyFor('General Admission'), GUEST);
});

test('9 · a complimentary ticket cannot contribute revenue, even if mislabelled', () => {
  // Someone hand-edits a snapshot to give the guest list a price. calcExpected
  // honours `revenue`, which is false for every free category.
  const tampered = CATS.map(c => c.key === GUEST ? Object.assign({}, c, { price_pence: 900 }) : c);
  assert.strictEqual(MDC.calcExpectedPence(tampered, { [GUEST]: 10 }), 0,
    'a free category must not produce revenue even if it somehow carries a price');
});

test('9b · the override endpoint refuses to price a free category', () => {
  const ops = fs.readFileSync(path.join(ROOT, 'netlify/functions/matchday-ops.js'), 'utf8');
  assert.ok(/is a non-paying category and must stay at £0/.test(ops),
    'the server must reject an attempt to price the guest list');
  assert.ok(/FREE_CATEGORIES\.forEach\(fc => \{[\s\S]{0,200}clean\.push/.test(ops),
    'free categories must be re-added if an override omits them');
});

// ── 10 · SNAPSHOT IMMUTABILITY ─────────────────────────────────────────────
test('10 · a completed record keeps its price snapshot when the site prices change', () => {
  const rec = {
    price_snapshot: { categories: CATS },
    attendance: { adults: 100 }, status: 'locked',
  };
  const atTheTime = MDC.derive(rec).expected_gate_pence;

  // The club raises admission on the website next summer.
  const raised = MDC.categoriesFromAdmission({ prices: [{ label: 'General Admission', price: '£15' }] });
  assert.strictEqual(MDC.calcExpectedPence(raised, { adults: 100 }), 150000, 'new matches use the new price');
  assert.strictEqual(MDC.derive(rec).expected_gate_pence, atTheTime,
    'the locked record still derives from ITS OWN snapshot');

  const ops = fs.readFileSync(path.join(ROOT, 'netlify/functions/matchday-ops.js'), 'utf8');
  assert.ok(/rec\.price_snapshot && rec\.price_snapshot\.categories/.test(ops),
    'the server must prefer the stored snapshot over live prices');
});

// ── 11-13 · THE RARE FIXTURE OVERRIDE ──────────────────────────────────────
test('11 · a fixture-specific override requires senior permission', () => {
  const ops = fs.readFileSync(path.join(ROOT, 'netlify/functions/matchday-ops.js'), 'utf8');
  assert.ok(/requireCap\(session, AUTH\.CAP\.PRICES, 'set a fixture-specific price'\)/.test(ops));
  const AUTH = require('../netlify/functions/lib/md-auth.js');
  // Only chairman / vice chairman carry PRICES…
  assert.ok(AUTH.capabilitiesFor('Chairman', true, 'custom').includes(AUTH.CAP.PRICES));
  assert.ok(AUTH.capabilitiesFor('V Chairman', false, 'custom').includes(AUTH.CAP.PRICES));
  assert.ok(!AUTH.capabilitiesFor('Committee', false, 'custom').includes(AUTH.CAP.PRICES));
  assert.ok(!AUTH.capabilitiesFor('Match Day Secretary', false, 'custom').includes(AUTH.CAP.PRICES));
  // …and never on the shared committee password.
  assert.ok(!AUTH.capabilitiesFor('Chairman', true, 'shared').includes(AUTH.CAP.PRICES));
});

test('12 · a fixture-specific override requires a reason', () => {
  const ops = fs.readFileSync(path.join(ROOT, 'netlify/functions/matchday-ops.js'), 'utf8');
  assert.ok(/reason\.length < 10[\s\S]{0,400}needs: 'reason'/.test(ops),
    'the server must demand a reason of at least 10 characters');
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260730000000_matchday_ops.sql'), 'utf8');
  assert.ok(/reason\s+text not null/.test(sql), 'the database must require a reason too');
  assert.ok(/check \(btrim\(reason\) <> ''\)/.test(sql), 'an all-whitespace reason must be refused');
});

test('13 · a fixture override does not modify the main-site season prices', () => {
  const before = JSON.stringify(require('../data/config.json').admission);
  const store = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/md-store.js'), 'utf8');
  // The store only ever READS config.json. Nothing writes it.
  assert.ok(/fetch\(url, \{ signal/.test(store), 'config is fetched');
  assert.ok(!/save-data|PUT|method: 'PUT'/.test(store), 'nothing here writes site config');
  const ops = fs.readFileSync(path.join(ROOT, 'netlify/functions/matchday-ops.js'), 'utf8');
  assert.ok(!/config\.json[^\n]*write|writeFile/.test(ops));
  // The override is scoped to one fixture id.
  assert.ok(/S\.saveOverride\(\{[\s\S]{0,120}fixture_id: fixtureId/.test(ops),
    'an override must be stored against ONE fixture');
  assert.strictEqual(JSON.stringify(require('../data/config.json').admission), before,
    'the admission config is untouched');
});

test('13b · an override cannot rewrite an already completed or locked record', () => {
  const ops = fs.readFileSync(path.join(ROOT, 'netlify/functions/matchday-ops.js'), 'utf8');
  assert.ok(/Its prices are part of the historical record and cannot be changed/.test(ops));
});

// ── REGRESSION: idempotency must be scoped to the fixture ──────────────────
// Found by the live round-trip, not by unit tests. The replay check looked the
// key up across the WHOLE table, so a key reused on another fixture returned
// that other match's record — reporting a successful submission for a match
// nobody submitted, and skipping every discrepancy check on the real one.
test('a submission key from another fixture is a collision, not a duplicate', () => {
  const ops = fs.readFileSync(path.join(ROOT, 'netlify/functions/matchday-ops.js'), 'utf8');
  assert.ok(/already\.fixture_id === fixtureId/.test(ops),
    'the replay check must confirm the record belongs to THIS fixture');
  assert.ok(/has already been used for a different match/.test(ops),
    'a cross-fixture key collision must be refused, not silently honoured');
  // The fixture id must be resolved BEFORE the idempotency lookup.
  const submitBody = ops.slice(ops.indexOf('async function actionSubmit'));
  const fxAt = submitBody.indexOf("const fixtureId = text(b.fixture_id");
  const keyAt = submitBody.indexOf('const key = text(b.idempotency_key');
  assert.ok(fxAt > -1 && keyAt > -1 && fxAt < keyAt,
    'fixture_id must be known before the idempotency key is looked up');
});

// ── REGRESSION: a rejected session must never become a dead end ────────────
// Found in PRODUCTION by a committee member, not by any test here. The signing
// secret was rotated, which correctly invalidated every existing token. The
// panel then showed "Your session has expired" with ZERO fixture rows and a
// single "Try again" button that replayed the same dead token and failed
// identically — forever. The user could not click any match because there were
// no matches on screen and no route back to a sign-in.
test('a rejected token is discarded so the sign-in route is offered', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'js/matchday-ops.js'), 'utf8');

  // The API layer must drop a token the server rejected.
  assert.ok(/if \(j\.reauth \|\| \(r\.status === 401 && !j\.misconfigured\)\) dropToken\(\);/.test(ui),
    'a 401/reauth response must drop the dead token');
  assert.ok(/function dropToken\(\)/.test(ui), 'dropToken must exist');
  assert.ok(/sessionStorage\.removeItem\(TOKEN_KEY\)/.test(ui),
    'dropToken must clear the stored token');

  // render() short-circuits to the sign-in view when there is no token, so
  // dropping it is what surfaces the escape hatch.
  assert.ok(/if \(!token\(\)\) \{ el\.innerHTML = needSignIn\(\); return; \}/.test(ui),
    'render must show the sign-in view when no token is held');

  // The error view must ALSO offer sign-in, not just a retry.
  assert.ok(/Could not load Match Day Ops[\s\S]{0,400}MDOps\.reauth\(\)/.test(ui),
    'the load-error view must offer a sign-in route, not only Try again');

  // reauth must clear both the token and the stale error.
  assert.ok(/function reauth\(\)\s*\{\s*dropToken\(\);\s*S\.loadErr = '';/.test(ui),
    'reauth must clear the dead token and the stale error state');
});

test('a misconfigured server (503) does NOT wipe the session', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'js/matchday-ops.js'), 'utf8');
  // MD_TOKEN_SECRET missing is a server problem, not the user's session.
  // Dropping their token there would send them round a pointless sign-in loop.
  assert.ok(/!j\.misconfigured/.test(ui),
    'a misconfigured-server response must not be treated as an expired session');
});

// ── THE TURNSTILE ACCOUNTABILITY BOX ───────────────────────────────────────
test('the tally screen asks who is on the turnstile, and saves it immediately', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'js/matchday-ops.js'), 'utf8');
  assert.ok(/Who is on the turnstile today\?/.test(ui), 'the box must be on the tally screen');
  assert.ok(/md-operator-live/.test(ui));
  assert.ok(/setOperator: setOperator/.test(ui), 'it must be wired up');
  assert.ok(/every figure on this record is recorded against it/.test(ui),
    'the volunteer must be told why their name matters');
  const css = fs.readFileSync(path.join(ROOT, 'css/matchday-ops.css'), 'utf8');
  assert.ok(/\.md-operator--empty/.test(css), 'an empty turnstile box must be visually flagged');
});

// ── PHASE 3 · TOKEN AND SESSION SECURITY ───────────────────────────────────
// Loaded in a child process so NODE_ENV can be varied per case.
const { execFileSync } = require('node:child_process');
function inEnv(env, script) {
  return execFileSync(process.execPath, ['-e', script], {
    cwd: ROOT,
    env: Object.assign({}, process.env, env, { NODE_OPTIONS: '' }),
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

test('production REFUSES to mint or verify tokens without MD_TOKEN_SECRET', () => {
  const out = inEnv({ NODE_ENV: 'production', MD_TOKEN_SECRET: '', MD_ALLOW_DEV_SECRET: '1' },
    `const A=require('./netlify/functions/lib/md-auth.js');
     console.log(JSON.stringify({key:A.signingKey(), token:A.issue({username:'x',role:'Chairman',isChairman:true,auth:'custom'}), verify:A.verify('a.b'), err:!!A.configError()}));`);
  const r = JSON.parse(out.split('\n').pop());
  assert.strictEqual(r.key, '', 'no signing key in production without the secret');
  assert.strictEqual(r.token, '', 'no token may be minted');
  assert.strictEqual(r.verify, null, 'no token may verify');
  assert.strictEqual(r.err, true, 'and it must say so');
});

test('the dev fallback cannot activate in production, even when opted in', () => {
  const out = inEnv({ NODE_ENV: 'production', MD_TOKEN_SECRET: '', MD_ALLOW_DEV_SECRET: '1' },
    `const A=require('./netlify/functions/lib/md-auth.js'); console.log(JSON.stringify(A.signingKey()));`);
  assert.strictEqual(JSON.parse(out.split('\n').pop()), '');
});

test('an unset NODE_ENV is treated as production — failing closed', () => {
  const out = inEnv({ NODE_ENV: '', MD_TOKEN_SECRET: '', MD_ALLOW_DEV_SECRET: '1' },
    `const A=require('./netlify/functions/lib/md-auth.js'); console.log(JSON.stringify({p:A.isProduction(),k:A.signingKey()}));`);
  const r = JSON.parse(out.split('\n').pop());
  assert.strictEqual(r.p, true, 'an unset NODE_ENV must be assumed to be production');
  assert.strictEqual(r.k, '');
});

test('there is no ADMIN_PIN fallback for token signing', () => {
  const src = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/md-auth.js'), 'utf8');
  assert.ok(!/MD_TOKEN_SECRET \|\| process\.env\.ADMIN_PIN/.test(src),
    'the PIN must never sign authorisation tokens');
  const out = inEnv({ NODE_ENV: 'production', MD_TOKEN_SECRET: '', ADMIN_PIN: '19332026' },
    `const A=require('./netlify/functions/lib/md-auth.js'); console.log(JSON.stringify(A.signingKey()));`);
  assert.strictEqual(JSON.parse(out.split('\n').pop()), '',
    'setting ADMIN_PIN must not enable token signing');
});

test('a short MD_TOKEN_SECRET is refused rather than weakly accepted', () => {
  const out = inEnv({ NODE_ENV: 'production', MD_TOKEN_SECRET: 'tooshort' },
    `const A=require('./netlify/functions/lib/md-auth.js'); console.log(JSON.stringify(A.signingKey()));`);
  assert.strictEqual(JSON.parse(out.split('\n').pop()), '');
});

test('a token with a modified role, actor or capability list fails verification', () => {
  const AUTH = require('../netlify/functions/lib/md-auth.js');
  const crypto = require('node:crypto');
  const good = AUTH.issue({ username: 'a.volunteer', role: 'Committee', isChairman: false, auth: 'custom' });
  const [payload, sig] = good.split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());

  // Promote the role — signature no longer matches.
  const promoted = Buffer.from(JSON.stringify(Object.assign({}, decoded, { r: 'Chairman', c: true }))).toString('base64url');
  assert.strictEqual(AUTH.verify(promoted + '.' + sig), null, 'a modified role must fail');

  // Change the actor.
  const impersonated = Buffer.from(JSON.stringify(Object.assign({}, decoded, { u: 'p.singh' }))).toString('base64url');
  assert.strictEqual(AUTH.verify(impersonated + '.' + sig), null, 'a modified actor must fail');

  // Smuggle capabilities into the payload — they are ignored AND unsigned.
  const withCaps = Buffer.from(JSON.stringify(Object.assign({}, decoded, { capabilities: ['can_matchday_reopen'] }))).toString('base64url');
  assert.strictEqual(AUTH.verify(withCaps + '.' + sig), null);

  // Upgrade shared → custom to try to unlock the money rights. Start from a
  // genuinely SHARED token, or the "modified" payload is identical to the
  // original and its signature legitimately still matches.
  const sharedTok = AUTH.issue({ username: 'Committee', role: 'Chairman', isChairman: true, auth: 'shared' });
  const [sPayload, sSig] = sharedTok.split('.');
  const sDecoded = JSON.parse(Buffer.from(sPayload, 'base64url').toString());
  assert.strictEqual(sDecoded.a, 'shared', 'precondition: the token really is a shared login');
  assert.deepStrictEqual(AUTH.verify(sharedTok).capabilities, [AUTH.CAP.RECORD],
    'a shared login carries recording rights only');
  const upgraded = Buffer.from(JSON.stringify(Object.assign({}, sDecoded, { a: 'custom' }))).toString('base64url');
  assert.strictEqual(AUTH.verify(upgraded + '.' + sSig), null,
    'a shared session cannot be upgraded to a named one by editing the token');

  // A correctly RE-SIGNED token is only possible with the secret, which the
  // browser never has. Prove the signature is what does the work.
  const resigned = crypto.createHmac('sha256', process.env.MD_TOKEN_SECRET).update(promoted).digest('base64url');
  const forged = AUTH.verify(promoted + '.' + resigned);
  assert.ok(forged, 'with the secret it verifies — which is why the secret must never ship');
  assert.strictEqual(forged.role, 'Chairman');
});

test('capabilities are recomputed from the token, never read from it', () => {
  const AUTH = require('../netlify/functions/lib/md-auth.js');
  const t = AUTH.issue({ username: 'a.volunteer', role: 'Committee', isChairman: false, auth: 'custom' });
  const s = AUTH.verify(t);
  assert.deepStrictEqual(s.capabilities, AUTH.capabilitiesFor('Committee', false, 'custom'));
  assert.ok(!s.capabilities.includes(AUTH.CAP.APPROVE));
});

test('a shared-password session is clearly distinguished from a named user', () => {
  const AUTH = require('../netlify/functions/lib/md-auth.js');
  const shared = AUTH.verify(AUTH.issue({ username: 'Committee', role: 'Committee', auth: 'shared' }));
  const named = AUTH.verify(AUTH.issue({ username: 'e.galloway', role: 'Club Secretary', auth: 'custom' }));
  assert.strictEqual(shared.auth, 'shared');
  assert.strictEqual(named.auth, 'custom');
  assert.match(AUTH.actorOf(shared), /\[shared password\]/,
    'the audit trail must never present a shared login as a proven identity');
  assert.ok(!/shared/.test(AUTH.actorOf(named)));
  assert.deepStrictEqual(shared.capabilities, [AUTH.CAP.RECORD]);
});

test('tokens expire, and the browser stores them per-session only', () => {
  const AUTH = require('../netlify/functions/lib/md-auth.js');
  assert.strictEqual(AUTH.TTL_MS, 12 * 60 * 60 * 1000, 'one match day, not a standing key');
  const crypto = require('node:crypto');
  const stale = Buffer.from(JSON.stringify({ u: 'x', r: 'Chairman', c: true, a: 'custom', exp: Date.now() - 1 })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.MD_TOKEN_SECRET).update(stale).digest('base64url');
  assert.strictEqual(AUTH.verify(stale + '.' + sig), null, 'an expired token must fail even when correctly signed');

  const ui = fs.readFileSync(path.join(ROOT, 'js/matchday-ops.js'), 'utf8');
  assert.ok(/sessionStorage\.getItem\(TOKEN_KEY\)/.test(ui),
    'the token must live in sessionStorage — gone when the tab closes');
  assert.ok(!/localStorage\.[gs]etItem\(TOKEN_KEY/.test(ui),
    'the token must NOT persist in localStorage');
  // Signing out clears the staff session, which is what gates the token's use.
  assert.ok(/sessionStorage\.removeItem\('rlfc_staff'\)/.test(ui), 'reauth must clear the session');
});

test('the signing secret never reaches the browser', () => {
  ['admin.html', 'js/matchday-ops.js', 'js/matchday-core.js'].forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/MD_TOKEN_SECRET/.test(src), `${f} must not mention the signing secret`);
    assert.ok(!/createHmac/.test(src), `${f} must not sign anything client-side`);
  });
});

// ── REGRESSION: the update bar must not throw you out mid-count ────────────
// Reported from production: after any deploy an "Update now" bar appears at the
// bottom, and tapping it reloads to the DASHBOARD — losing the screen you were
// on. On a match day that is not a small annoyance; it interrupts a live gate
// count and the volunteer has to navigate all the way back in.
test('an update reload returns the user to the screen they were on', () => {
  const admin = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  assert.ok(/rlfc_return_panel/.test(admin), 'the open panel must be remembered before reloading');
  assert.ok(/function restoreReturnPanel\(\)/.test(admin), 'and restored after boot');
  assert.ok(/restoreReturnPanel\(\);/.test(admin), 'restoreReturnPanel must be called from enterApp');
  // The chairman-gated panel must still demand its password after a reload.
  assert.ok(/if \(name === 'analytics'\) return;/.test(admin),
    'the password-gated panel must not auto-open after a reload');
});

test('the update bar defers while a gate count is unsaved', () => {
  const admin = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  assert.ok(/MDOps\.isBusy && MDOps\.isBusy\(\)/.test(admin),
    'the update bar must check whether Match Day Ops is mid-count');
  const ui = fs.readFileSync(path.join(ROOT, 'js/matchday-ops.js'), 'utf8');
  assert.ok(/isBusy: function \(\)/.test(ui), 'MDOps must expose isBusy');
  assert.ok(/\['dirty', 'saving', 'offline', 'error'\]\.indexOf\(S\.saveState\)/.test(ui),
    'isBusy must be true whenever work is not safely on the server');
});

// ── REGRESSION: a committee member must be able to record the money ────────
// Found in production. An ordinary Committee session resolves to
// can_matchday_record only, and every money field was gated on
// can_matchday_finance — so the volunteer on the turnstile could count heads
// but could NOT enter the float, programmes, badges, merchandise, hospitality,
// sponsorship, cash, card or online receipts, nor see the reconciliation.
// That removed the entire purpose of the module for the person who actually
// runs the gate. Recording a match and viewing season-wide finance are two
// different rights and must stay separate.
test('a Committee (record-only) session can see and enter this match\'s money', () => {
  const AUTH = require('../netlify/functions/lib/md-auth.js');
  const { present } = require('../netlify/functions/matchday-ops.js')._internal;
  const caps = AUTH.capabilitiesFor('Committee', false, 'shared');
  assert.deepStrictEqual(caps, [AUTH.CAP.RECORD], 'precondition: a shared committee login records only');

  const rec = { id: 1, fixture_id: 'f1', season: '2026-27', status: 'in_progress',
    attendance: { adults: 10 }, attendance_calculated: 10,
    declared_pence: 9000, receipts: { cash_pence: 9000 },
    sales: { programmes: { qty: 40, unit_pence: 200 } },
    float_open_pence: 5000, expected_pence: 9000, financial_variance_pence: 0 };
  const view = present(rec, { capabilities: caps });

  assert.strictEqual(view.finance_hidden, undefined, 'money must NOT be hidden from a recorder');
  assert.strictEqual(view.receipts.cash_pence, 9000, 'cash receipts must be visible');
  assert.strictEqual(view.sales.programmes.qty, 40, 'programme sales must be visible');
  assert.strictEqual(view.float_open_pence, 5000, 'the float must be visible');
  assert.strictEqual(view.financial_variance_pence, 0, 'the reconciliation must be visible');

  const ops = fs.readFileSync(path.join(ROOT, 'netlify/functions/matchday-ops.js'), 'utf8');
  assert.ok(/canMoney: AUTH\.has\(session, AUTH\.CAP\.RECORD\) \|\| AUTH\.has\(session, AUTH\.CAP\.FINANCE\)/.test(ops),
    'the list action must report canMoney for recorders');
});

test('season-wide reporting stays restricted to the finance capability', () => {
  const AUTH = require('../netlify/functions/lib/md-auth.js');
  const caps = AUTH.capabilitiesFor('Committee', false, 'shared');
  assert.ok(!caps.includes(AUTH.CAP.FINANCE), 'committee must not hold the finance capability');
  const ops = fs.readFileSync(path.join(ROOT, 'netlify/functions/matchday-ops.js'), 'utf8');
  ['view match-day reports', 'view the archive', 'export match-day data'].forEach(what => {
    assert.ok(new RegExp(`requireCap\\(session, AUTH\\.CAP\\.FINANCE, '${what}'\\)`).test(ops),
      `${what} must remain finance-gated`);
  });
  const ui = fs.readFileSync(path.join(ROOT, 'js/matchday-ops.js'), 'utf8');
  const gate = ui.indexOf("if (has('can_matchday_finance'))");
  assert.ok(gate > -1, 'the UI must gate the season-wide buttons on the finance capability');
  const block = ui.slice(gate, gate + 400);
  assert.ok(/reports/.test(block) && /archive/.test(block),
    'the Reports and Archive buttons must sit inside that finance gate');
});

// ── REGRESSION: the match must be clickable ────────────────────────────────
// Reported from production: "you cant physically click on any matches". Making
// the Gate receipts column visible to recorders widened the season table past
// its own scroll container, so the action button was rendered but clipped off
// the right-hand edge and could not be reached with a mouse.
test('every fixture row is clickable, not just the action button', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'js/matchday-ops.js'), 'utf8');
  assert.ok(/<tr class="md-row" tabindex="0" role="button"/.test(ui),
    'the row itself must be an operable control');
  assert.ok(/onclick="MDOps\.open\(/.test(ui), 'the row must open the fixture');
  assert.ok(/onkeydown="if\(event\.key===/.test(ui), 'the row must be keyboard-operable');
  assert.ok(/aria-label="Open /.test(ui), 'the row needs an accessible name');
  assert.ok(/onclick="event\.stopPropagation\(\);MDOps\.open\(/.test(ui),
    'the inner button must not double-fire the row handler');
});

test('the action column cannot be clipped out of reach', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/matchday-ops.css'), 'utf8');
  // The panel is a ~700px content column at EVERY viewport width, so a
  // viewport media query was the wrong measurement entirely. Cards always.
  assert.ok(!/@media \([^)]*width[^)]*\)\s*\{[^}]*\.md-table, \.md-table tbody/.test(css),
    'the card layout must not be behind a viewport media query');
  assert.ok(/\.md-table, \.md-table tbody, \.md-table tr, \.md-table td \{ display: block/.test(css),
    'rows must be cards unconditionally');
  assert.ok(/\.md-table td\.md-cell-action \{ justify-content: stretch/.test(css),
    'the action button must be full width in every card');
  assert.ok(/\.md-row \{ cursor: pointer; \}/.test(css), 'the row must look clickable');
});
