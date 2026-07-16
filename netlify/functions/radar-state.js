// Sponsor Radar — STATE. The PRIVATE prospecting store: which businesses staff
// have saved, the "do not contact" flag, pipeline status, notes, and the edited
// AI brief. PIN-gated; lives in Netlify Blobs (server-side) — NEVER in the public
// repo, never public. This is the record the Sponsor Hub reads so radar prospects
// flow into the pipeline the club already uses.
//
// ⛔ Stores only what staff choose to save about a business + public data already
//    fetched. No bulk personal data, no scraping. Honours "do not contact".

const adminOk = require('./lib/pin');
const { cacheGet, cacheSet, resp } = require('./lib/radar');

const KEY = 'state';   // one map keyed by business id, in the rlfc-radar store

async function loadState() { const c = await cacheGet(KEY, null); return (c && c.data) || {}; }
async function saveState(s) { await cacheSet(KEY, s); }

const PIPE_STATUSES = ['new', 'researching', 'contacted', 'meeting', 'won', 'declined'];

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  if (!adminOk(b.pin)) return resp(401, { ok: false, error: 'Unauthorized' });

  const action = b.action || 'get';
  const state = await loadState();

  if (action === 'get') return resp(200, { ok: true, state: state });

  const id = b.id || (b.business && b.business.id);
  if (!id) return resp(400, { ok: false, error: 'no-id' });
  const rec = state[id] || {};

  if (action === 'upsert') {
    // Save the identifying + public fields, plus pipeline/flags supplied.
    const src = b.business || {};
    ['id', 'name', 'category', 'category_label', 'address', 'postcode', 'lat', 'lng', 'phone', 'website', 'email', 'distance_miles', 'fit_score', 'osm_url'].forEach(function (f) { if (src[f] != null) rec[f] = src[f]; });
    if (b.do_not_contact != null) rec.do_not_contact = !!b.do_not_contact;
    if (b.brief != null) rec.brief = String(b.brief);
    if (b.ch != null) rec.ch = b.ch;               // cached public CH record
    if (b.pipeline) {
      rec.pipeline = rec.pipeline || {};
      if (b.pipeline.status && PIPE_STATUSES.indexOf(b.pipeline.status) > -1) rec.pipeline.status = b.pipeline.status;
      if (b.pipeline.next_action != null) rec.pipeline.next_action = String(b.pipeline.next_action);
      if (b.pipeline.owner != null) rec.pipeline.owner = String(b.pipeline.owner);
      if (b.pipeline.last_contact != null) rec.pipeline.last_contact = String(b.pipeline.last_contact);
      if (!rec.pipeline.added_at) rec.pipeline.added_at = new Date().toISOString();
    }
    rec.updated_at = new Date().toISOString();
    state[id] = rec; await saveState(state);
    return resp(200, { ok: true, record: rec });
  }

  if (action === 'note') {
    rec.notes = rec.notes || [];
    rec.notes.unshift({ at: new Date().toISOString(), text: String(b.text || '').slice(0, 2000), by: String(b.by || 'staff') });
    rec.updated_at = new Date().toISOString();
    state[id] = rec; await saveState(state);
    return resp(200, { ok: true, record: rec });
  }

  if (action === 'remove') { delete state[id]; await saveState(state); return resp(200, { ok: true }); }

  return resp(400, { ok: false, error: 'unknown-action' });
};
