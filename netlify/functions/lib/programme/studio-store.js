// ════════════════════════════════════════════════════════════════════════════
// PROGRAMME STUDIO STORE — server-saved drafts, revision history and pictures.
//
// Netlify Blobs, with conditional writes: a save names the revision it was
// based on, and the write only lands if nobody else saved in between. That is
// what makes "Saved" true on the server and what stops two editors silently
// overwriting each other.
//
//   drafts/<fixtureId>              the current draft  { doc, revision, … }
//   history/<fixtureId>/<000123>    every saved revision, written once, never changed
//   exports/<fixtureId>/<stamp>     a record of each PDF made (who, revision, checksum)
//   assets/<sha256>                 pictures, by content hash, served only to staff
//
// WHICH STORE: deploy previews share the production DATABASE, so their Studio
// data must not share production's store. lib/deploy-scope.js decides — from
// the Host header Netlify routed on (never X-Forwarded-Host), failing closed
// to production for anything that is not this site's preview address.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const crypto = require('crypto');

// One answer to "is this the live site?", shared with the squad tools.
const SCOPE = require('../deploy-scope');
function hostOf(event) { return SCOPE.hostOf(event); }
function isProduction(event) { return SCOPE.scopeOf(event).production; }
function storeName(event) {
  const sc = SCOPE.scopeOf(event);
  return sc.production ? 'programme-studio' : 'programme-studio--' + sc.key.replace(/[^a-z0-9-]/g, '').slice(0, 40);
}

// Tests swap the backend for an in-memory one with the same semantics.
let backendFactory = null;
function useBackend(f) { backendFactory = f; }

async function open(event) {
  if (backendFactory) return backendFactory(storeName(event));
  const B = await import('@netlify/blobs');
  if (event && event.blobs) B.connectLambda(event);
  return B.getStore({ name: storeName(event), consistency: 'strong' });
}

const pad = (n) => String(n).padStart(6, '0');
const FIX = /^[A-Za-z0-9_-]{1,60}$/;
function checkFixture(id) { if (!FIX.test(String(id || ''))) throw Object.assign(new Error('bad fixture id'), { code: 400 }); }

async function readDraft(store, fixtureId) {
  checkFixture(fixtureId);
  const r = await store.getWithMetadata('drafts/' + fixtureId, { type: 'json' });
  return r ? { draft: r.data, etag: r.etag } : null;
}

/**
 * Save a draft only if it is still based on the latest revision.
 * @returns {{ok:true, revision, savedAt}|{ok:false, conflict:true, current}}
 */
async function saveDraft(store, fixtureId, doc, baseRevision, who, note) {
  checkFixture(fixtureId);
  const cur = await readDraft(store, fixtureId);
  const curRev = cur ? cur.draft.revision : 0;
  if ((baseRevision || 0) !== curRev) return { ok: false, conflict: true, current: cur && cur.draft };
  const revision = curRev + 1;
  const savedAt = new Date().toISOString();
  const rec = { fixtureId, revision, savedAt, savedBy: who, note: note || null, status: (doc && doc.status) || 'draft', doc };
  const w = cur
    ? await store.setJSON('drafts/' + fixtureId, rec, { onlyIfMatch: cur.etag })
    : await store.setJSON('drafts/' + fixtureId, rec, { onlyIfNew: true });
  if (!w || w.modified === false) {
    const now = await readDraft(store, fixtureId);
    return { ok: false, conflict: true, current: now && now.draft };
  }
  // History is append-only: the same revision number can never be rewritten.
  await store.setJSON('history/' + fixtureId + '/' + pad(revision), rec, { onlyIfNew: true });
  return { ok: true, revision, savedAt, savedBy: who };
}

async function listDrafts(store) {
  const out = [];
  const { blobs } = await store.list({ prefix: 'drafts/' });
  for (const b of blobs) {
    const d = await store.get(b.key, { type: 'json' });
    if (d) out.push({ fixtureId: d.fixtureId, revision: d.revision, savedAt: d.savedAt, savedBy: d.savedBy, status: d.status,
      opponent: d.doc && d.doc.fixture && d.doc.fixture.opponent, date: d.doc && d.doc.fixture && d.doc.fixture.date });
  }
  return out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

async function history(store, fixtureId) {
  checkFixture(fixtureId);
  const { blobs } = await store.list({ prefix: 'history/' + fixtureId + '/' });
  const out = [];
  for (const b of blobs) {
    const d = await store.get(b.key, { type: 'json' });
    if (d) out.push({ revision: d.revision, savedAt: d.savedAt, savedBy: d.savedBy, note: d.note, status: d.status });
  }
  return out.sort((a, b) => b.revision - a.revision);
}

async function revision(store, fixtureId, rev) {
  checkFixture(fixtureId);
  return store.get('history/' + fixtureId + '/' + pad(parseInt(rev, 10)), { type: 'json' });
}

async function recordExport(store, fixtureId, entry) {
  checkFixture(fixtureId);
  const key = 'exports/' + fixtureId + '/' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(3).toString('hex');
  await store.setJSON(key, entry, { onlyIfNew: true });
  return key;
}
async function exportsFor(store, fixtureId) {
  checkFixture(fixtureId);
  const { blobs } = await store.list({ prefix: 'exports/' + fixtureId + '/' });
  const out = [];
  for (const b of blobs) { const d = await store.get(b.key, { type: 'json' }); if (d) out.push(d); }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// ── PICTURES ────────────────────────────────────────────────────────────────
// Only real raster images, checked by their first bytes rather than trusting a
// declared type. Stored by content hash, so the same picture is stored once and
// a replaced picture is a NEW asset: an exported edition keeps pointing at the
// exact bytes it was made with.
const MAX_ASSET = 8 * 1024 * 1024;
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}
async function putAsset(store, dataUrl, who, meta) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw Object.assign(new Error('That file is not a JPG, PNG or WebP picture.'), { code: 400 });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_ASSET) throw Object.assign(new Error('That picture is larger than 8 MB. Please use a smaller copy.'), { code: 413 });
  const type = sniff(buf);
  if (!type) throw Object.assign(new Error('That file is not a JPG, PNG or WebP picture.'), { code: 400 });
  const id = crypto.createHash('sha256').update(buf).digest('hex');
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  await store.set('assets/' + id, ab, { onlyIfNew: true,
    metadata: Object.assign({ type, bytes: buf.length, by: who, at: new Date().toISOString() }, pickMeta(meta)) });
  return { id, type, bytes: buf.length };
}
function pickMeta(m) {
  const o = {};
  if (m && /^\d{1,5}$/.test(String(m.width))) o.width = +m.width;
  if (m && /^\d{1,5}$/.test(String(m.height))) o.height = +m.height;
  if (m && m.source) o.source = String(m.source).slice(0, 120);
  return o;
}
async function getAsset(store, id) {
  if (!/^[a-f0-9]{64}$/.test(String(id || ''))) return null;
  return store.getWithMetadata('assets/' + id, { type: 'arrayBuffer' });
}

module.exports = { open, useBackend, isProduction, storeName, hostOf, readDraft, saveDraft, listDrafts, history, revision,
  recordExport, exportsFor, putAsset, getAsset, sniff, MAX_ASSET };
