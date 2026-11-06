// Programme Studio, server side: who may do what, server-saved drafts with
// conflict protection, revision history, pictures, and publishing — through the
// REAL programme-admin / programme-sync / programme-data on the fake database
// for production, and the preview sandbox for deploy previews.
//
// TEST DATA ONLY. Nothing here is real club information.
'use strict';
process.env.SUPABASE_URL = 'https://fake-supabase.local';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SITE_ORIGIN = 'https://site.local';
process.env.NODE_ENV = 'test';
process.env.MD_TOKEN_SECRET = 'test-secret-for-tests-only-long-enough';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const FAKE = require('./helpers/programme-fake-db');
const BLOBS = require('./helpers/fake-blobs');
const SEASON = require('./fixtures/programme/season-2026-27');
const AUTH = require('../netlify/functions/lib/md-auth');

const PROD = 'raynerslanefc.co.uk';
const PREVIEW = 'deploy-preview-34--raynerslanefc.netlify.app';

// Every test runs against the fake database: the permission check itself reads
// la_permissions, and a test must never reach a real network address.
let baseRestore = null;
test.beforeEach(() => { baseRestore = FAKE.install(FAKE.makeDb()); });
test.afterEach(() => { if (baseRestore) baseRestore(); baseRestore = null; });

function load() {
  for (const k of Object.keys(require.cache)) if (/netlify[\\/]functions/.test(k)) delete require.cache[k];
  const STORE = require('../netlify/functions/lib/programme/studio-store');
  STORE.useBackend(BLOBS.makeStores());
  return { studio: require('../netlify/functions/programme-studio'), sync: require('../netlify/functions/programme-sync'),
    data: require('../netlify/functions/programme-data'), STORE };
}
const tok = (u, role, auth) => AUTH.issue({ username: u, role: role || 'Chairman', isChairman: (role || 'Chairman') === 'Chairman', auth: auth || 'custom' });
async function call(F, body, o) {
  const opt = o || {};
  const headers = { host: opt.host || PREVIEW };
  if (opt.token !== null) headers.authorization = 'Bearer ' + (opt.token || tok(opt.user || 'test.chair', opt.role, opt.auth));
  const r = await F.studio.handler({ httpMethod: 'POST', headers, body: JSON.stringify(body) });
  return Object.assign({ status: r.statusCode }, JSON.parse(r.body));
}

// A small, valid draft for the 31 Oct test fixture.
function draft(extra) {
  return Object.assign({
    fixture: { id: 'fwp-578384', date: '2026-10-31', kickoff: '15:00', opponent: 'Test Visitors FC', competition: 'Test League', season: '2026-27' },
    status: 'draft',
    pages: [
      { id: 'cover0001', type: 'cover', headline: 'TEST EDITION' },
      { id: 'chair0001', type: 'notes', role: 'chair', label: 'Chairman\'s notes', author: 'Test Chair', body: 'Test chair words.\n\nSecond paragraph.' },
      { id: 'prev00001', type: 'article', role: 'preview', label: 'Match preview', headline: 'Test preview', body: 'Test preview words.' },
      { id: 'back00001', type: 'back', body: 'Thanks for coming.' },
    ],
  }, extra || {});
}

// ── 1 · WHO MAY DO WHAT ─────────────────────────────────────────────────────
test('no session, a shared-password session and a forged token are all refused', async () => {
  const F = load();
  assert.strictEqual((await call(F, { action: 'list' }, { token: null })).status, 401);
  assert.strictEqual((await call(F, { action: 'list' }, { auth: 'shared' })).status, 403);
  assert.strictEqual((await call(F, { action: 'list' }, { token: tok('x') + 'x' })).status, 401);
  const r = await F.studio.handler({ httpMethod: 'GET', headers: { host: PREVIEW }, queryStringParameters: { asset: 'a'.repeat(64) } });
  assert.strictEqual(r.statusCode, 401, 'pictures need a session too');
});

test('a Programme Editor edits but cannot approve or publish; nothing changes when refused', async () => {
  const F = load();
  const ed = { role: 'Programme Editor', user: 'test.editor' };
  const s = await call(F, { action: 'save', fixtureId: 'fwp-578384', baseRevision: 0, doc: draft() }, ed);
  assert.strictEqual(s.ok, true);
  assert.strictEqual((await call(F, { action: 'approve', fixtureId: 'fwp-578384', baseRevision: 1 }, ed)).status, 403);
  assert.strictEqual((await call(F, { action: 'publish', fixtureId: 'fwp-578384', baseRevision: 1, when: 'now' }, ed)).status, 403);
  // An editor cannot self-approve by saving status:'approved' either.
  const self = await call(F, { action: 'save', fixtureId: 'fwp-578384', baseRevision: 1, doc: draft({ status: 'approved' }) }, ed);
  assert.strictEqual(self.status, 200);
  assert.strictEqual(self.draftStatus, 'review');
  assert.strictEqual((await call(F, { action: 'get', fixtureId: 'fwp-578384' })).draft.status, 'review');
  // A role with neither right sees nothing.
  assert.strictEqual((await call(F, { action: 'list' }, { role: 'V Chairman' })).status, 403);
});

// ── 2 · SAVED MEANS SAVED ───────────────────────────────────────────────────
test('a save is stored on the server, reopens on another device, and is in the history', async () => {
  const F = load();
  const s = await call(F, { action: 'save', fixtureId: 'fwp-578384', baseRevision: 0, doc: draft() }, { user: 'russell.test' });
  assert.deepStrictEqual([s.ok, s.revision, s.savedBy], [true, 1, 'russell.test']);
  // "Another device": a different session, nothing shared but the server.
  const g = await call(F, { action: 'get', fixtureId: 'fwp-578384' }, { user: 'russell.test' });
  assert.strictEqual(g.draft.revision, 1);
  assert.strictEqual(g.draft.doc.pages[1].body, 'Test chair words.\n\nSecond paragraph.');
  const h = await call(F, { action: 'history', fixtureId: 'fwp-578384' });
  assert.deepStrictEqual(h.history.map((x) => [x.revision, x.savedBy]), [[1, 'russell.test']]);
  const l = await call(F, { action: 'list' });
  assert.deepStrictEqual(l.drafts.map((d) => d.fixtureId), ['fwp-578384']);
});

test('two editors saving from the same version: the second is told, and nothing is overwritten', async () => {
  const F = load();
  await call(F, { action: 'save', fixtureId: 'fwp-578384', baseRevision: 0, doc: draft() });
  const a = draft(); a.pages[1].body = 'Editor A wrote this.';
  const b = draft(); b.pages[1].body = 'Editor B wrote this.';
  const ra = await call(F, { action: 'save', fixtureId: 'fwp-578384', baseRevision: 1, doc: a }, { user: 'editor.a' });
  const rb = await call(F, { action: 'save', fixtureId: 'fwp-578384', baseRevision: 1, doc: b }, { user: 'editor.b' });
  assert.strictEqual(ra.revision, 2);
  assert.strictEqual(rb.status, 409);
  assert.strictEqual(rb.conflict, true);
  assert.strictEqual(rb.current.doc.pages[1].body, 'Editor A wrote this.', 'B is shown A\'s version to resolve against');
  const g = await call(F, { action: 'get', fixtureId: 'fwp-578384' });
  assert.strictEqual(g.draft.doc.pages[1].body, 'Editor A wrote this.', 'A\'s words survive');
});

test('a race the read cannot see is still caught by the conditional write', async () => {
  const F = load();
  await call(F, { action: 'save', fixtureId: 'fwp-578384', baseRevision: 0, doc: draft() });
  // Both requests read revision 1 before either writes.
  const [x, y] = await Promise.all([
    call(F, { action: 'save', fixtureId: 'fwp-578384', baseRevision: 1, doc: draft() }, { user: 'one' }),
    call(F, { action: 'save', fixtureId: 'fwp-578384', baseRevision: 1, doc: draft() }, { user: 'two' }),
  ]);
  assert.deepStrictEqual([x.status, y.status].sort(), [200, 409]);
  const h = await call(F, { action: 'history', fixtureId: 'fwp-578384' });
  assert.deepStrictEqual(h.history.map((v) => v.revision), [2, 1], 'one revision 2, never two');
});

test('restoring an old version makes a NEW revision; the history is never rewritten', async () => {
  const F = load();
  await call(F, { action: 'save', fixtureId: 'fwp-578384', baseRevision: 0, doc: draft() });
  const d2 = draft(); d2.pages[1].body = 'Changed.';
  await call(F, { action: 'save', fixtureId: 'fwp-578384', baseRevision: 1, doc: d2 });
  const r = await call(F, { action: 'restore', fixtureId: 'fwp-578384', revision: 1, baseRevision: 2 });
  assert.strictEqual(r.revision, 3);
  assert.strictEqual(r.doc.pages[1].body, 'Test chair words.\n\nSecond paragraph.');
  const v2 = await call(F, { action: 'revision', fixtureId: 'fwp-578384', revision: 2 });
  assert.strictEqual(v2.draft.doc.pages[1].body, 'Changed.', 'revision 2 is still exactly as saved');
});

test('the server keeps only known page types, plain text and real picture references', async () => {
  const F = load();
  const bad = draft(); bad.pages.push({ id: 'evil00001', type: 'script', body: 'x' });
  assert.strictEqual((await call(F, { action: 'save', fixtureId: 'fwp-578384', baseRevision: 0, doc: bad })).status, 400);
  const sneaky = draft(); sneaky.pages[1].photo = 'javascript:alert(1)'; sneaky.pages[1].onclick = 'x';
  sneaky.pages[0].photo = 'data:image/svg+xml;base64,PHN2Zy8+';
  await call(F, { action: 'save', fixtureId: 'fwp-578384', baseRevision: 0, doc: sneaky });
  const g = await call(F, { action: 'get', fixtureId: 'fwp-578384' });
  assert.strictEqual(g.draft.doc.pages[1].photo, undefined);
  assert.strictEqual(g.draft.doc.pages[1].onclick, undefined);
  assert.strictEqual(g.draft.doc.pages[0].photo, undefined);
});

// ── 3 · PICTURES ────────────────────────────────────────────────────────────
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
test('pictures are checked by their bytes, stored once by content, and only served to staff', async () => {
  const F = load();
  const ok = await call(F, { action: 'asset_put', dataUrl: 'data:image/png;base64,' + PNG_1PX, meta: { width: 1, height: 1 } });
  assert.match(ok.ref, /^asset:[a-f0-9]{64}$/);
  const again = await call(F, { action: 'asset_put', dataUrl: 'data:image/png;base64,' + PNG_1PX });
  assert.strictEqual(again.ref, ok.ref, 'the same picture is the same asset');
  const liar = await call(F, { action: 'asset_put', dataUrl: 'data:image/png;base64,' + Buffer.from('<script>x</script>').toString('base64') });
  assert.strictEqual(liar.status, 400);
  assert.match(liar.error, /not a JPG, PNG or WebP/);
  const id = ok.ref.slice(6);
  const r = await F.studio.handler({ httpMethod: 'GET', headers: { host: PREVIEW, authorization: 'Bearer ' + tok('t') }, queryStringParameters: { asset: id } });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.headers['Content-Type'], 'image/png');
  assert.strictEqual(r.headers['X-Content-Type-Options'], 'nosniff');
});

// ── 4 · PUBLISHING ──────────────────────────────────────────────────────────
async function approved(F, o) {
  await call(F, { action: 'save', fixtureId: 'fwp-578384', baseRevision: 0, doc: draft() }, o);
  return call(F, { action: 'approve', fixtureId: 'fwp-578384', baseRevision: 1 }, o);
}

test('publishing needs an approved, current revision', async () => {
  const F = load();
  await call(F, { action: 'save', fixtureId: 'fwp-578384', baseRevision: 0, doc: draft() });
  const notYet = await call(F, { action: 'publish', fixtureId: 'fwp-578384', baseRevision: 1, when: 'now' });
  assert.strictEqual(notYet.status, 400);
  assert.strictEqual(notYet.fix, 'approve');
  await call(F, { action: 'approve', fixtureId: 'fwp-578384', baseRevision: 1 });
  const stale = await call(F, { action: 'publish', fixtureId: 'fwp-578384', baseRevision: 1, when: 'now' });
  assert.strictEqual(stale.status, 409, 'approval made revision 2; publishing revision 1 is refused');
});

test('editing an approved programme sends it back for review', async () => {
  const F = load();
  await approved(F);
  const d = draft({ status: 'approved' }); d.pages[2].body = 'A late change.';
  const s = await call(F, { action: 'save', fixtureId: 'fwp-578384', baseRevision: 2, doc: d }, { role: 'Programme Editor' });
  assert.strictEqual(s.draftStatus, 'review');
});

test('PREVIEW: publishing writes only to the preview\'s own store and shows in the preview\'s collection', async () => {
  const db = FAKE.makeDb(); FAKE.seedRegistry(db, SEASON.corrected());
  const restore = FAKE.install(db);
  try {
    const F = load();
    await F.sync.handler({ httpMethod: 'POST', body: '{}', _now: SEASON.NOW });
    const before = JSON.stringify([db.programme_editions, db.programme_versions, db.programme_sections]);
    await approved(F);
    const p = await call(F, { action: 'publish', fixtureId: 'fwp-578384', baseRevision: 2, when: 'now' });
    assert.deepStrictEqual([p.ok, p.state, p.verified, p.sandbox], [true, 'published', true, true]);
    assert.strictEqual(JSON.stringify([db.programme_editions, db.programme_versions, db.programme_sections]), before,
      'the shared production database is untouched by a preview');
    const list = JSON.parse((await F.data.handler({ headers: { host: PREVIEW }, queryStringParameters: {} })).body);
    assert.strictEqual(list.editions[0].fixtureId, 'fwp-578384');
    assert.strictEqual(list.editions[0].sandbox, true);
    const prod = JSON.parse((await F.data.handler({ headers: { host: PROD }, queryStringParameters: {} })).body);
    assert.ok(!prod.editions.some((e) => e.sandbox), 'production never sees a preview publication');
    const one = JSON.parse((await F.data.handler({ headers: { host: PREVIEW }, queryStringParameters: { id: 'fwp-578384' } })).body);
    assert.strictEqual(one.locked, true, 'the supporter-membership gate still applies');
    assert.ok(one.cover, 'the public still gets the cover');
  } finally { restore(); }
});

test('PRODUCTION: publishing goes through the edition model and is only "Published" once read back', async () => {
  const db = FAKE.makeDb(); FAKE.seedRegistry(db, SEASON.corrected());
  const restore = FAKE.install(db);
  try {
    const F = load();
    await F.sync.handler({ httpMethod: 'POST', body: '{}', _now: SEASON.NOW });
    const o = { host: PROD, user: 'test.chair' };
    const d0 = draft(); d0.fixture = Object.assign({}, d0.fixture, { id: 'fwp-578395', date: '2026-11-07' });
    await call(F, { action: 'save', fixtureId: 'fwp-578395', baseRevision: 0, doc: d0 }, o);
    await call(F, { action: 'approve', fixtureId: 'fwp-578395', baseRevision: 1 }, o);
    const p = await call(F, { action: 'publish', fixtureId: 'fwp-578395', baseRevision: 2, when: 'now' }, o);
    assert.strictEqual(p.ok, true, p.error);
    const secs = db.programme_sections.filter((s) => s.section_key === 'chairNotes' || s.section_key === 'preview');
    assert.strictEqual(secs.length, 2);
    assert.ok(secs.every((s) => s.approved_by === 'test.chair' && s.updated_by === 'test.chair'), 'named from the session');
    assert.strictEqual(secs.filter((s) => s.section_key === 'chairNotes')[0].byline, 'Test Chair');
    const ed = db.programme_editions.filter((e) => e.internal_fixture_id === 'fwp-578395')[0];
    assert.ok(ed.editorial_approved_at && ed.publish_not_before, 'approved, with a publish-from time');
    assert.deepStrictEqual([p.state, p.verified], ['published', true], 'publish now → read back from the published version');
    const v = db.programme_versions.filter((x) => x.edition_id === ed.id && x.published_at).pop();
    assert.match(JSON.stringify(v.payload.sections.chairNotes), /Test chair words/);
    assert.match(JSON.stringify(v.payload.sections.preview), /Test preview words/);
    assert.strictEqual(p.viewUrl, '/programme.html?id=fwp-578395');
    // A second press of Publish does not make a second edition or version.
    const again = await call(F, { action: 'publish', fixtureId: 'fwp-578395', baseRevision: 2, when: 'now' }, o);
    assert.strictEqual(again.state, 'published');
    assert.strictEqual(db.programme_editions.filter((e) => e.internal_fixture_id === 'fwp-578395').length, 1);
    assert.strictEqual(db.programme_versions.filter((x) => x.edition_id === ed.id).length, 1, 'no duplicate version');
    // A changed, re-approved revision goes out as a labelled correction; v1 is kept.
    const d3 = draft(); d3.fixture = Object.assign({}, d3.fixture, { id: 'fwp-578395', date: '2026-11-07' });
    d3.pages[2].body = 'Corrected preview words.';
    const s3 = await call(F, { action: 'save', fixtureId: 'fwp-578395', baseRevision: 2, doc: d3 }, o);
    await call(F, { action: 'approve', fixtureId: 'fwp-578395', baseRevision: s3.revision }, o);
    const c = await call(F, { action: 'publish', fixtureId: 'fwp-578395', baseRevision: s3.revision + 1, when: 'now' }, o);
    assert.deepStrictEqual([c.state, c.verified, c.correction], ['published', true, true], c.error);
    const all = db.programme_versions.filter((x) => x.edition_id === ed.id).sort((a, b) => a.version - b.version);
    assert.strictEqual(all.length, 2);
    assert.match(JSON.stringify(all[0].payload.sections.preview), /Test preview words/, 'the first version is unchanged');
    assert.match(JSON.stringify(all[1].payload.sections.preview), /Corrected preview words/);
    assert.strictEqual(all[1].stage, 'correction');
  } finally { restore(); }
});

test('the chairman\'s notes never reach the website without a named author', () => {
  const P = require('../netlify/functions/lib/programme/studio-publish');
  const d = draft(); d.pages[1].author = '';
  assert.ok(!P.sectionsFrom(d).some((s) => s.section_key === 'chairNotes'));
});

// ── 5 · ONE SCHEMA ──────────────────────────────────────────────────────────
test('the browser and the server agree on every page type and its fields', () => {
  const DOC = require('../netlify/functions/lib/programme/studio-doc');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'programme-studio.js'), 'utf8');
  Object.keys(DOC.TYPES).forEach((t) => {
    const m = new RegExp('\\n    ' + t + ': \\{ name: [^\\n]*?fields: \\[([^\\n]*?)\\],\\s*\\n').exec(src);
    assert.ok(m, 'the browser has no page type ' + t);
    const keys = (m[1].match(/\['([a-z]+)'/g) || []).map((x) => x.slice(2, -1));
    assert.deepStrictEqual(keys, DOC.TYPES[t], t + ' fields differ');
  });
});
