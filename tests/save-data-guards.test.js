// The programme's saving rules, enforced on the server (netlify/functions/save-data.js):
//   · a stale device cannot overwrite a newer draft (expectRevision)
//   · a draft save can never replace a PUBLISHED archive edition (protectPublished)
//   · two people publishing at once cannot overwrite each other (expectRevisions)
//   · the editor can read the authoritative copy, not the lagging site copy (read)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

process.env.GITHUB_TOKEN = 'fake';
process.env.ADMIN_PIN = 'guard-test-pin-123456';
const PIN = process.env.ADMIN_PIN;

let files, n;
function reset(seed) { files = {}; n = 0; Object.keys(seed || {}).forEach((p) => { files[p] = { content: Buffer.from(JSON.stringify(seed[p])).toString('base64'), sha: 's' + (++n) }; }); }
const realFetch = global.fetch;
global.fetch = async (url, opt = {}) => {
  url = String(url);
  if (url.startsWith('https://purge.jsdelivr.net')) return { ok: true };
  const m = url.match(/contents\/([^?]+)/);
  if (!m) return realFetch(url, opt);
  const p = m[1];
  if (!opt.method || opt.method === 'GET') {
    const f = files[p]; if (!f) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ content: f.content, sha: f.sha }) };
  }
  const b = JSON.parse(opt.body); const f = files[p];
  if (f && b.sha !== f.sha) return { ok: false, status: 409, json: async () => ({ message: 'sha' }) };
  files[p] = { content: b.content, sha: 's' + (++n) };
  return { ok: true, status: 200, json: async () => ({ commit: { sha: 'c' + n } }) };
};
const save = require(path.join(__dirname, '..', 'netlify/functions/save-data.js'));
const call = async (b) => { const r = await save.handler({ httpMethod: 'POST', body: JSON.stringify(Object.assign({ pin: PIN }, b)) }); return { status: r.statusCode, j: JSON.parse(r.body) }; };
const json = (p) => JSON.parse(Buffer.from(files[p].content, 'base64').toString());
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');

test('a stale device cannot overwrite a newer programme draft', async () => {
  reset({ 'data/programme-draft.json': { revision: 3, savedBy: 'Russell', savedAt: '2026-11-16T10:00:00Z', opponent: 'Burnham' } });
  const r = await call({ path: 'data/programme-draft.json', content: b64({ revision: 3, opponent: 'Hilltop' }), expectRevision: 2 });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.j.current.savedBy, 'Russell', 'the refusal says who saved the newer one');
  assert.strictEqual(json('data/programme-draft.json').opponent, 'Burnham', 'nothing was overwritten');
  const ok = await call({ path: 'data/programme-draft.json', content: b64({ revision: 4, opponent: 'Burnham' }), expectRevision: 3 });
  assert.strictEqual(ok.status, 200);
});

test('a first save is refused if someone else created the draft meanwhile', async () => {
  reset({ 'data/programme-draft.json': { revision: 1 } });
  const r = await call({ path: 'data/programme-draft.json', content: b64({ revision: 1 }), expectRevision: 0 });
  assert.strictEqual(r.status, 409);
});

test('a draft can never replace a published archive edition', async () => {
  reset({ 'data/programmes.json': { items: [{ id: 'a', published: true, opponent: 'Hilltop', revision: 1 }] } });
  const r = await call({ merge: true, domain: 'programmes', key: 'items', idField: 'id', protectPublished: true,
    upserts: [{ id: 'a', published: false, opponent: 'Hilltop (edited draft)' }, { id: 'b', published: false }] });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.j.skipped, ['a']);
  const items = json('data/programmes.json').items;
  assert.strictEqual(items.find((i) => i.id === 'a').published, true, 'the published edition is untouched');
  assert.ok(items.find((i) => i.id === 'b'), 'other drafts still save');
});

test('two publishes of the same edition cannot overwrite each other', async () => {
  reset({ 'data/programmes.json': { items: [{ id: 'a', published: true, revision: 2 }] } });
  const stale = await call({ merge: true, domain: 'programmes', key: 'items', idField: 'id', expectRevisions: { a: 1 }, upserts: [{ id: 'a', published: true, revision: 2 }] });
  assert.strictEqual(stale.status, 409);
  const fresh = await call({ merge: true, domain: 'programmes', key: 'items', idField: 'id', expectRevisions: { a: 2 }, upserts: [{ id: 'a', published: true, revision: 3 }] });
  assert.strictEqual(fresh.status, 200);
});

test('the editor can read the authoritative copy, and only data files', async () => {
  reset({ 'data/programme-draft.json': { revision: 7 } });
  const r = await call({ read: true, path: 'data/programme-draft.json' });
  assert.strictEqual(r.j.data.revision, 7);
  const missing = await call({ read: true, path: 'data/nothing.json' });
  assert.strictEqual(missing.j.exists, false);
  const bad = await call({ read: true, path: '../netlify.toml' });
  assert.strictEqual(bad.status, 400);
  const anon = await save.handler({ httpMethod: 'POST', body: JSON.stringify({ read: true, path: 'data/programme-draft.json' }) });
  assert.strictEqual(anon.statusCode, 401, 'reading still needs the committee password');
});
