// OPPONENT RECENT RESULTS — for the programme's opposition page.
//
// POST { pin, club, refresh?: true, n?: 5, cutoff?: 'YYYY-MM-DD' }
//   → { ok, club, automation: { enabled, reason }, state, fetchedAt, sourceUrl,
//       items: [last N completed, corrections applied], manual: [...] }
//
// SOURCES, in the order the project already permits them:
//   1. Football Web Pages' public club embed (the same /embed/ path and HTTP
//      client the club's own fixture import uses, lib/fwp-client). It is
//      gated by FWP_SYNC_ENABLED — the switch that stays OFF until Football
//      Web Pages confirm automated reading is acceptable. While it is off this
//      function makes NO network call and reports automation as unavailable.
//   2. Manual entries and corrections, kept in the private drafts store
//      (data/opponent-results.json through save-data). Each carries who
//      entered it, the source text and when.
// No new credential is used. The FWP API adapter needs a key the club does
// not hold, so it is not called.
//
// CACHE: provider reads are cached per club in the same private Blobs store
// (key 'opponent-results-auto'). Older than three days → state 'stale'.
'use strict';

const adminOk = require('./lib/pin');
const client = require('./lib/fwp-client');
const { parseFixtureList } = require('./lib/fwp/parse-fixtures');
const OR = require('../../js/opp-results');

const AUTO_KEY = 'opponent-results-auto';
const MANUAL_KEY = 'opponent-results';
let store = null, lastEvent = null;
// The private drafts store, reached through save-data so there is one Blobs owner.
async function blobs() { return store || require('./save-data')._privateStore(lastEvent); }

function resp(code, obj) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
}

function automation() {
  return client.isEnabled()
    ? { enabled: true, reason: null }
    : { enabled: false, reason: 'Automatic results are switched off (FWP_SYNC_ENABLED is not set: Football Web Pages have not confirmed automated reading). Add results by hand from the league or FA Full-Time page.' };
}

/** Read one club's results from the provider's public embed. */
async function fetchClub(club, fetchImpl) {
  const slug = client.slug(club);
  const url = client.embedUrl(slug + '/fixtures-results', {});
  const r = fetchImpl ? await fetchImpl(url) : await client.request(url);
  const fetchedAt = new Date().toISOString();
  const publicUrl = client.EMBED_ORIGIN + '/' + slug + '/fixtures-results';
  if (!r.ok || !r.body) return { ok: false, error: r.error || ('provider answered ' + (r.status || 'nothing')), fetchedAt };
  const parsed = parseFixtureList(r.body);
  const items = parsed.fixtures.map((row) => OR.fromProviderRow(row, club, publicUrl, fetchedAt));
  return { ok: true, items, fetchedAt, sourceUrl: publicUrl };
}

async function handle(payload, opts) {
  opts = opts || {};
  if (!adminOk(payload.pin)) return resp(401, { error: 'Unauthorized' });
  const club = String(payload.club || '').trim().slice(0, 80);
  if (!club) return resp(400, { error: 'Name the club (club).' });
  const n = Math.max(1, Math.min(10, Number(payload.n) || 5));
  const cutoff = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.cutoff || '')) ? payload.cutoff : null;
  const st = await blobs();
  const k = OR.key(club);
  const auto = (await st.get(AUTO_KEY, { type: 'json' })) || { byClub: {} };
  const manualDoc = (await st.get(MANUAL_KEY, { type: 'json' })) || { items: [] };
  const manual = (manualDoc.items || []).filter((r) => OR.key(r.club) === k);
  const au = automation();
  let cached = auto.byClub && auto.byClub[k] || null;
  let refreshError = null;

  if (payload.refresh === true && au.enabled) {
    const got = await fetchClub(club, opts.fetchImpl);
    if (got.ok) {
      cached = { items: got.items, fetchedAt: got.fetchedAt, sourceUrl: got.sourceUrl };
      auto.byClub = auto.byClub || {}; auto.byClub[k] = cached;
      await st.setJSON(AUTO_KEY, auto);
    } else refreshError = got.error;     // the previous cache, if any, is kept and labelled by its own age
  }

  const merged = OR.merge(cached ? cached.items : [], manual);
  const items = OR.lastCompleted(merged, n, cutoff);
  const newestManual = manual.map((r) => r.enteredAt).sort().pop() || null;
  const fetchedAt = cached ? cached.fetchedAt : newestManual;
  const state = items.length ? OR.state(fetchedAt, opts.now) : 'unavailable';
  return resp(200, {
    ok: true, club, automation: au, refreshError, state, fetchedAt,
    sourceUrl: cached ? cached.sourceUrl : null,
    source: cached ? 'Football Web Pages (public club page)' + (manual.length ? ' + manual entries' : '') : (manual.length ? 'Manual entries' : null),
    items, manual, cutoff,
  });
}

exports._setStore = function (s) { store = s; };
exports._handle = handle;
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return resp(405, { error: 'POST only' });
  lastEvent = event;
  let payload; try { payload = JSON.parse(event.body || '{}'); } catch (e) { return resp(400, { error: 'Invalid request body' }); }
  try { return await handle(payload); }
  catch (e) { return resp(502, { error: 'Could not read results: ' + (e && e.message || e) }); }
};
