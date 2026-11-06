// ════════════════════════════════════════════════════════════════════════════
// PROGRAMME STUDIO — server side of programme-studio.html.
//
// Every action needs a personal staff session (lib/programme/gate.js):
// preparing a programme is can_edit_programme; approving it or publishing it
// to the website is can_publish_programme. Who did what comes from the signed
// session, never from the request body.
//
// "Saved" means stored here: a save that lost a race returns 409 with the
// other person's version, and nothing is overwritten.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const GATE = require('./lib/programme/gate');
const STORE = require('./lib/programme/studio-store');
const DOC = require('./lib/programme/studio-doc');

function resp(code, obj, extra) {
  return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0' }, extra || {}),
    body: JSON.stringify(obj) };
}

const PUBLISHING = ['approve', 'publish'];

exports.handler = async function (event) {
  // Pictures are fetched by the Studio with its session header and shown from a
  // local object URL, so a draft's pictures are never at a public address.
  if (event.httpMethod === 'GET') {
    const id = ((event.queryStringParameters || {}).asset) || '';
    const g = await GATE.gate(event, GATE.CAP.EDIT);
    if (!g.ok) return g.response;
    const store = await STORE.open(event);
    const a = await STORE.getAsset(store, id);
    if (!a) return resp(404, { ok: false, error: 'not found' });
    return { statusCode: 200, isBase64Encoded: true, body: Buffer.from(a.data).toString('base64'),
      headers: { 'Content-Type': a.metadata.type || 'application/octet-stream', 'Cache-Control': 'private, max-age=86400, immutable',
        'X-Content-Type-Options': 'nosniff' } };
  }
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return resp(400, { ok: false, error: 'bad request' }); }
  const action = String(b.action || '');
  const g = await GATE.gate(event, PUBLISHING.indexOf(action) > -1 ? GATE.CAP.PUBLISH : GATE.CAP.EDIT);
  if (!g.ok) return g.response;
  const who = g.who;

  try {
    const store = await STORE.open(event);

    if (action === 'whoami') {
      const canPublish = (await GATE.gate(event, GATE.CAP.PUBLISH)).ok;
      return resp(200, { ok: true, username: who, role: g.session.role, canPublish, production: STORE.isProduction(event) });
    }

    if (action === 'list') return resp(200, { ok: true, drafts: await STORE.listDrafts(store) });

    if (action === 'get') {
      const r = await STORE.readDraft(store, b.fixtureId);
      return resp(200, { ok: true, draft: r ? r.draft : null });
    }

    if (action === 'save') {
      const c = DOC.clean(b.doc);
      if (!c.ok) return resp(400, { ok: false, error: c.error });
      if (c.doc.fixture.id !== b.fixtureId) return resp(400, { ok: false, error: 'The draft does not match this match.' });
      // Approval is a publishing decision; an editor's save returns it to review.
      const cur = await STORE.readDraft(store, b.fixtureId);
      const wasApproved = cur && cur.draft.status === 'approved';
      if (c.doc.status === 'approved' && !wasApproved) c.doc.status = 'review';
      if (wasApproved && JSON.stringify(cur.draft.doc.pages) !== JSON.stringify(c.doc.pages)) c.doc.status = 'review';
      const r = await STORE.saveDraft(store, b.fixtureId, c.doc, parseInt(b.baseRevision, 10) || 0, who, String(b.note || '').slice(0, 200));
      if (!r.ok) return resp(409, { ok: false, conflict: true, current: r.current,
        error: 'Someone else saved this programme while you were editing.' });
      return resp(200, Object.assign({ ok: true, draftStatus: c.doc.status }, r));
    }

    if (action === 'history') return resp(200, { ok: true, history: await STORE.history(store, b.fixtureId),
      exports: await STORE.exportsFor(store, b.fixtureId) });

    if (action === 'revision') {
      const r = await STORE.revision(store, b.fixtureId, b.revision);
      return r ? resp(200, { ok: true, draft: r }) : resp(404, { ok: false, error: 'That version was not found.' });
    }

    if (action === 'restore') {
      const old = await STORE.revision(store, b.fixtureId, b.revision);
      if (!old) return resp(404, { ok: false, error: 'That version was not found.' });
      const doc = Object.assign({}, old.doc, { status: 'draft' });
      const r = await STORE.saveDraft(store, b.fixtureId, doc, parseInt(b.baseRevision, 10) || 0, who, 'Restored version ' + old.revision);
      if (!r.ok) return resp(409, { ok: false, conflict: true, current: r.current, error: 'Someone else saved this programme meanwhile.' });
      return resp(200, Object.assign({ ok: true, doc }, r));
    }

    if (action === 'asset_put') {
      const a = await STORE.putAsset(store, b.dataUrl, who, b.meta);
      return resp(200, Object.assign({ ok: true, ref: 'asset:' + a.id }, a));
    }

    if (action === 'record_export') {
      const cur = await STORE.readDraft(store, b.fixtureId);
      if (!cur || cur.draft.revision !== parseInt(b.revision, 10)) {
        return resp(409, { ok: false, error: 'Save your latest changes before recording this PDF.' });
      }
      const entry = { at: new Date().toISOString(), by: who, revision: cur.draft.revision, kind: b.kind === 'print' ? 'print' : 'proof',
        filename: String(b.filename || '').slice(0, 120), sha256: /^[a-f0-9]{64}$/.test(String(b.sha256)) ? b.sha256 : null,
        pages: parseInt(b.pages, 10) || null, profile: String(b.profile || '').slice(0, 200) };
      await STORE.recordExport(store, b.fixtureId, entry);
      return resp(200, { ok: true, export: entry });
    }

    if (action === 'approve') {
      const cur = await STORE.readDraft(store, b.fixtureId);
      if (!cur) return resp(404, { ok: false, error: 'There is no saved draft for this match.' });
      if (cur.draft.revision !== parseInt(b.baseRevision, 10)) return resp(409, { ok: false, conflict: true, current: cur.draft,
        error: 'The programme changed since you looked at it. Check the latest version before approving.' });
      const doc = Object.assign({}, cur.draft.doc, { status: 'approved' });
      const r = await STORE.saveDraft(store, b.fixtureId, doc, cur.draft.revision, who, 'Approved');
      if (!r.ok) return resp(409, { ok: false, conflict: true, current: r.current, error: 'Someone else saved this programme meanwhile.' });
      return resp(200, Object.assign({ ok: true, draftStatus: 'approved' }, r));
    }

    if (action === 'publish') {
      const PUB = require('./lib/programme/studio-publish');
      const out = await PUB.publish(event, store, b, who);
      return resp(out.code || 200, out.body);
    }

    return resp(400, { ok: false, error: 'unknown action' });
  } catch (e) {
    return resp(e.code || 500, { ok: false, error: e.code ? e.message : 'The server could not complete that. Nothing was changed — please try again.' });
  }
};
