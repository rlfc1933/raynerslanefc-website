// publish_editorial + preflight + ensureEdition, through the real
// programme-admin / programme-sync / programme-data functions on the
// in-memory database. Fixtures here create SUBJECTS only (the registry season);
// every edition, section and approval under test is made through the product.
'use strict';
process.env.SUPABASE_URL = 'https://fake-supabase.local';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SITE_ORIGIN = 'https://site.local';

const test = require('node:test');
const assert = require('node:assert');
const FAKE = require('./helpers/programme-fake-db');
const SEASON = require('./fixtures/programme/season-2026-27');

const FX = 'fwp-578384';   // the 31 Oct home fixture
const SECTIONS = [
  { key: 'welcome', title: 'Welcome to Tithe Farm', body: 'A warm welcome to our visitors.' },
  { key: 'article:manager', title: 'Manager’s notes', body: 'Big game today.' },
];

function load() {
  for (const k of Object.keys(require.cache)) if (/netlify[\\/]functions/.test(k)) delete require.cache[k];
  return {
    admin: require('../netlify/functions/programme-admin'),
    sync: require('../netlify/functions/programme-sync'),
    data: require('../netlify/functions/programme-data'),
    ED: require('../netlify/functions/lib/programme/editions'),
  };
}
async function call(fn, body, noPin) {
  const r = await fn.handler({ httpMethod: 'POST', body: JSON.stringify(Object.assign(noPin ? {} : { pin: '1933' }, body)) });
  return Object.assign({ status: r.statusCode }, JSON.parse(r.body));
}
/** opts.sync: run the scheduled refresh first. opts.wrap(fetch) lets a test break one request. */
async function setup(opts) {
  const o = opts || {};
  const db = FAKE.makeDb();
  FAKE.seedRegistry(db, SEASON.corrected());
  const restore = FAKE.install(db);
  if (o.wrap) { const inner = global.fetch; global.fetch = o.wrap(inner); }
  const F = load();
  if (o.sync !== false) await F.sync.handler({ httpMethod: 'POST', body: '{}', _now: SEASON.NOW });
  return { db, restore, F };
}
const edOf = (db) => db.programme_editions.filter((e) => e.internal_fixture_id === FX);
const writes = (calls, from) => calls.slice(from).filter((c) => c.method !== 'GET');
const publish = (F, extra) => call(F.admin, Object.assign({ action: 'publish_editorial', fixtureId: FX, by: 'Jenny',
  sections: SECTIONS, clientRevision: 3 }, extra || {}));

/* ── authorisation ─────────────────────────────────────────────────────── */

test('publish_editorial and preflight refuse without the committee password; publish needs a name', async () => {
  const { db, restore, F } = await setup({ sync: false });
  try {
    for (const action of ['publish_editorial', 'preflight']) {
      const r = await call(F.admin, { action, fixtureId: FX, by: 'Jenny', sections: SECTIONS }, true);
      assert.strictEqual(r.status, 401, action);
      const w = await call(F.admin, { action, fixtureId: FX, by: 'Jenny', sections: SECTIONS, pin: '0000' }, true);
      assert.strictEqual(w.status, 401, action + ' wrong pin');
    }
    const n = await call(F.admin, { action: 'publish_editorial', fixtureId: FX, sections: SECTIONS });
    assert.strictEqual(n.status, 400);
    assert.match(n.error, /your name/);
    // The shared committee password is the gate, as for every HQ action; preflight needs no name.
    const p = await call(F.admin, { action: 'preflight', fixtureId: FX, sections: SECTIONS });
    assert.strictEqual(p.status, 200);
    assert.strictEqual(db.programme_editions.length, 0, 'refused calls wrote nothing');
    assert.strictEqual(db.programme_sections.length, 0);
  } finally { restore(); }
});

/* ── ensureEdition ─────────────────────────────────────────────────────── */

test('ensureEdition creates the record once; a second call (and the sync) reuse it', async () => {
  const { db, restore, F } = await setup({ sync: false });
  try {
    const r = await F.ED.resolveFixture(FX);
    assert.strictEqual(r.ok, true, r.reason);
    const a = await F.ED.ensureEdition(r.fx);
    const b = await F.ED.ensureEdition(r.fx);
    assert.strictEqual(a.created, true);
    assert.strictEqual(b.created, false);
    assert.strictEqual(a.edition.id, b.edition.id);
    await F.sync.handler({ httpMethod: 'POST', body: '{}', _now: SEASON.NOW });
    assert.strictEqual(edOf(db).length, 1, 'one edition per fixture');
  } finally { restore(); }
});

test('invalid fixtures are refused with the reason, and nothing is written', async () => {
  const { db, restore, F } = await setup({ sync: false });
  try {
    const away = db.football_fixtures.filter((f) => f.is_home_fixture === false)[0];
    const off = db.football_fixtures.filter((f) => f.fixture_status === 'postponed')[0];
    const keyOf = (f) => f.internal_fixture_id || 'fwp-' + f.external_fixture_id;
    const cases = [['fwp-999999', /not in the .* registry/], [keyOf(away), /away fixture/], [keyOf(off), /postponed|superseded/]];
    for (const [id, re] of cases) {
      const r = await publish(F, { fixtureId: id });
      assert.strictEqual(r.status, 422, id);
      assert.match(r.error, re);
    }
    assert.strictEqual(db.programme_editions.length, 0);
    assert.strictEqual(db.programme_sections.length, 0);
  } finally { restore(); }
});

/* ── publish_editorial ─────────────────────────────────────────────────── */

test('happy path with NO prior refresh: the edition is created, sections approved, canonical state returned', async () => {
  const { db, restore, F } = await setup({ sync: false });
  try {
    const r = await publish(F);
    assert.strictEqual(r.status, 200, r.error);
    assert.strictEqual(r.ok, true);
    const ed = edOf(db);
    assert.strictEqual(ed.length, 1);
    assert.strictEqual(ed[0].editorial_approved_by, 'Jenny');
    assert.strictEqual(r.edition.id, ed[0].id, 'response is the re-read edition');
    const secs = db.programme_sections.filter((s) => s.edition_id === ed[0].id);
    assert.deepStrictEqual(secs.map((s) => s.section_key).sort(), ['article:manager', 'welcome']);
    assert.ok(secs.every((s) => s.approved_by === 'Jenny' && s.approved_at));
    assert.deepStrictEqual(r.sections.map((s) => s.section_key), ['article:manager', 'welcome']);
    const ev = db.programme_publication_events.filter((e) => e.event_type === 'editorial_published');
    assert.strictEqual(ev.length, 1);
    assert.strictEqual(ev[0].actor, 'Jenny');
    assert.strictEqual(ev[0].detail.clientRevision, 3);
  } finally { restore(); }
});

test('mandatory content missing → refused, and zero sections or approvals are written', async () => {
  const { db, restore, F } = await setup({
    wrap: (inner) => async (url, init) => (/\/data\/committee\.json/.test(String(url))
      ? new Response('gone', { status: 404 }) : inner(url, init)),
  });
  try {
    const before = JSON.stringify(edOf(db)[0]);
    const r = await publish(F);
    assert.strictEqual(r.status, 422);
    assert.ok(r.blocking.includes('mandatory'));
    assert.match(r.error, /staff/);
    assert.strictEqual(db.programme_sections.length, 0, 'no section rows');
    assert.strictEqual(db.programme_section_revisions.length, 0);
    assert.strictEqual(JSON.stringify(edOf(db)[0]), before, 'edition untouched — not approved');
    assert.ok(!db.programme_publication_events.some((e) => e.event_type === 'editorial_published'));
  } finally { restore(); }
});

test('a failure at the approval step compensates: no approved sections on an unapproved edition', async () => {
  let breakAudit = false;
  const { db, restore, F } = await setup({
    wrap: (inner) => async (url, init) => {
      const s = String(url);
      if (breakAudit && init && init.method === 'POST' && /programme_publication_events$/.test(s) &&
        /"editorial_published"/.test(String(init.body))) {
        return new Response(JSON.stringify({ message: 'audit down' }), { status: 500 });
      }
      return inner(url, init);
    },
  });
  try {
    // An earlier approved welcome exists; the failed publish must put it back exactly.
    const pre = await call(F.admin, { action: 'save_section', fixtureId: FX, by: 'Pete', sectionKey: 'welcome',
      title: 'Old', body: 'Old welcome', approve: true });
    assert.strictEqual(pre.ok, true);
    const oldWelcome = JSON.stringify(db.programme_sections.filter((s) => s.section_key === 'welcome')[0]);
    breakAudit = true;
    const from = restore.calls.length;
    const r = await publish(F);
    assert.ok(writes(restore.calls, from).some((c) => c.method === 'DELETE'), 'writes were made and then compensated');
    assert.strictEqual(r.status, 500);
    assert.match(r.error, /nothing was approved/);
    const ed = edOf(db)[0];
    assert.strictEqual(ed.editorial_approved_at || null, null, 'edition not approved');
    const secs = db.programme_sections.filter((s) => s.edition_id === ed.id);
    assert.deepStrictEqual(secs.map((s) => s.section_key), ['welcome'], 'the new section was removed');
    const w = JSON.parse(oldWelcome), now = secs[0];
    ['title', 'body', 'approved_by', 'approved_at'].forEach((k) => assert.strictEqual(now[k], w[k], k + ' restored'));
    assert.strictEqual(db.programme_section_revisions.length, 0, 'the compensating revision was removed');
    assert.ok(db.programme_publication_events.some((e) => e.event_type === 'editorial_publish_failed'), 'the failed attempt is on record');
    breakAudit = false;
    const retry = await publish(F);
    assert.strictEqual(retry.ok, true, 'a retry after the failure can run: ' + retry.error);
  } finally { restore(); }
});

test('a double click (same content) returns the same result with no duplicate revisions or events', async () => {
  const { db, restore, F } = await setup();
  try {
    const a = await publish(F);
    assert.strictEqual(a.ok, true, a.error);
    const counts = () => [db.programme_sections.length, db.programme_section_revisions.length,
      db.programme_publication_events.length, JSON.stringify(edOf(db)[0].editorial_approved_at)];
    const snap = counts();
    const [b, c] = await Promise.all([publish(F), publish(F)]);
    assert.strictEqual(b.ok, true); assert.strictEqual(c.ok, true);
    assert.strictEqual(b.idempotent, true);
    assert.deepStrictEqual(counts(), snap);
    assert.strictEqual(b.edition.id, a.edition.id);

    // Changed writing is a new approval: one revision for the one changed section.
    const d = await publish(F, { clientRevision: 4, sections: [SECTIONS[0], { key: 'article:manager', title: 'Manager’s notes', body: 'Bigger game.' }] });
    assert.strictEqual(d.ok, true, d.error);
    assert.strictEqual(db.programme_section_revisions.length, 1);
    assert.strictEqual(db.programme_publication_events.filter((e) => e.event_type === 'editorial_published').length, 2);
  } finally { restore(); }
});

test('two identical first-time submissions racing leave one approval and one event', async () => {
  const { db, restore, F } = await setup();
  try {
    const both = await Promise.all([publish(F), publish(F)]);
    // One writes; the other gets the same result or "in progress" — never a half-write.
    assert.ok(both.some((r) => r.ok && !r.idempotent), JSON.stringify(both.map((r) => r.error)));
    both.filter((r) => !r.ok).forEach((r) => { assert.strictEqual(r.status, 409); assert.strictEqual(r.inProgress, true); });
    const ed = edOf(db)[0];
    assert.strictEqual(ed.editorial_approved_by, 'Jenny', 'still approved');
    assert.strictEqual(db.programme_publication_events.filter((e) => e.event_type === 'editorial_published').length, 1);
    assert.strictEqual(db.programme_sections.filter((s) => s.edition_id === ed.id).length, 2);
    assert.ok(db.programme_sections.every((s) => s.approved_by === 'Jenny'));
  } finally { restore(); }
});

test('a stale draft revision is refused once a newer one was sent', async () => {
  const { db, restore, F } = await setup();
  try {
    assert.strictEqual((await publish(F, { clientRevision: 7 })).ok, true);
    const before = db.programme_sections.map((s) => s.body).join('|');
    const r = await publish(F, { clientRevision: 5, sections: [{ key: 'welcome', title: 'x', body: 'older text' }] });
    assert.strictEqual(r.status, 409);
    assert.ok(r.blocking.includes('draft_current'));
    assert.match(r.error, /older than revision 7/);
    assert.strictEqual(db.programme_sections.map((s) => s.body).join('|'), before);
  } finally { restore(); }
});

test('an already-published edition is refused; its published version is unchanged', async () => {
  const { db, restore, F } = await setup();
  try {
    assert.strictEqual((await publish(F)).ok, true);
    await F.sync.handler({ httpMethod: 'POST', body: '{}', _now: Date.parse('2026-10-31T09:00:00Z') });
    const ed = edOf(db)[0];
    assert.ok(ed.published_at, 'published on matchday');
    const versions = JSON.stringify(db.programme_versions.filter((v) => v.edition_id === ed.id));
    const sections = JSON.stringify(db.programme_sections);
    const r = await publish(F, { sections: [{ key: 'welcome', title: 'New', body: 'Rewritten after publication' }] });
    assert.strictEqual(r.status, 409);
    assert.ok(r.blocking.includes('not_published'));
    assert.match(r.error, /never overwritten.*correction/);
    assert.strictEqual(JSON.stringify(db.programme_versions.filter((v) => v.edition_id === ed.id)), versions);
    assert.strictEqual(JSON.stringify(db.programme_sections), sections);
  } finally { restore(); }
});

test('the public reader shows the edition only once its publish rule (matchday morning) is met', async () => {
  const { db, restore, F } = await setup();
  try {
    const list = async () => JSON.parse((await F.data.handler({ queryStringParameters: {} })).body).editions || [];
    assert.strictEqual((await publish(F)).ok, true);
    assert.ok(!(await list()).some((e) => e.fixtureId === FX), 'approval alone is not publication');
    await F.sync.handler({ httpMethod: 'POST', body: '{}', _now: Date.parse('2026-10-30T12:00:00Z') });
    assert.ok(!(await list()).some((e) => e.fixtureId === FX), 'not the day before');
    await F.sync.handler({ httpMethod: 'POST', body: '{}', _now: Date.parse('2026-10-31T09:00:00Z') });
    assert.ok((await list()).some((e) => e.fixtureId === FX), 'public on matchday morning');
    const v = db.programme_versions.filter((x) => x.edition_id === edOf(db)[0].id)[0];
    assert.match(JSON.stringify(v.payload), /A warm welcome to our visitors/);
  } finally { restore(); }
});

/* ── preflight ─────────────────────────────────────────────────────────── */

test('preflight makes zero writes and reports readiness in plain checks', async () => {
  const { db, restore, F } = await setup({ sync: false });
  try {
    const from = restore.calls.length;
    const r = await call(F.admin, { action: 'preflight', fixtureId: FX, sections: SECTIONS, clientRevision: 1 });
    assert.deepStrictEqual(writes(restore.calls, from), [], 'only GETs');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.ready, true, JSON.stringify(r.checks.filter((c) => !c.ok)));
    const ids = r.checks.map((c) => c.id);
    ['database', 'schema', 'fixture_registry', 'fixture_eligible', 'edition', 'not_published', 'mandatory', 'sponsors', 'last_sync']
      .forEach((id) => assert.ok(ids.includes(id), id));
    assert.match(r.checks.filter((c) => c.id === 'edition')[0].detail, /will create it from registry fixture/);
    assert.strictEqual(db.programme_editions.length, 0);
  } finally { restore(); }
});

test('preflight reports a missing table as a schema problem, still without writing', async () => {
  const { db, restore, F } = await setup();
  try {
    delete db.programme_section_revisions;   // the fake now 404s it, as PostgREST does
    const from = restore.calls.length;
    const r = await call(F.admin, { action: 'preflight', fixtureId: FX, sections: SECTIONS });
    assert.deepStrictEqual(writes(restore.calls, from), []);
    assert.strictEqual(r.ready, false);
    const s = r.checks.filter((c) => c.id === 'schema')[0];
    assert.strictEqual(s.ok, false);
    assert.match(s.detail, /programme_section_revisions \(table missing\)/);
    // and publish refuses for the same reason, before writing
    const p = await publish(F);
    assert.strictEqual(p.ok, false);
    assert.ok(p.blocking.includes('schema'));
    assert.strictEqual(db.programme_sections.length, 0);
  } finally { restore(); }
});

test('preflight on an already-published edition says so', async () => {
  const { restore, F } = await setup();
  try {
    await publish(F);
    await F.sync.handler({ httpMethod: 'POST', body: '{}', _now: Date.parse('2026-10-31T09:00:00Z') });
    const from = restore.calls.length;
    const r = await call(F.admin, { action: 'preflight', fixtureId: FX, sections: SECTIONS });
    assert.deepStrictEqual(writes(restore.calls, from), []);
    assert.strictEqual(r.ready, false);
    assert.strictEqual(r.checks.filter((c) => c.id === 'not_published')[0].ok, false);
  } finally { restore(); }
});
