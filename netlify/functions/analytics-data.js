// Rayners Lane FC — PRIVATE match finances (Netlify Blobs, ZERO setup).
//
// Match takings + attendance never touch the public repo — they live in Netlify
// Blobs, readable/writable only with the analytics PIN. This replaces the old
// setup where the data shipped in public data/analytics.json and the password
// hash sat in public data/config.json (a cosmetic, non-secure gate).
//
//   GET  ?pin=...                → { ok, matches:[...] }
//   POST { pin, matches:[...] }  → overwrite the finances
//
// Gate: ANALYTICS_PIN if set (a distinct chairman-only PIN), otherwise ADMIN_PIN.
// No table, no SQL, no dashboard step — Blobs is on by default on Netlify.

function resp(code, obj) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }, body: JSON.stringify(obj) };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});

  let pin = (event.queryStringParameters && event.queryStringParameters.pin) || '';
  let b = {};
  if (event.httpMethod === 'POST') { try { b = JSON.parse(event.body || '{}'); pin = b.pin || pin; } catch (e) {} }
  const gate = process.env.ANALYTICS_PIN || process.env.ADMIN_PIN || '19332026';
  if (String(pin) !== String(gate)) return resp(401, { ok: false, error: 'Unauthorized', matches: [] });

  let store;
  try { const { getStore } = await import('@netlify/blobs'); store = getStore('rlfc-analytics'); }
  catch (e) { return resp(200, { ok: false, error: 'no-store', matches: [] }); }

  if (event.httpMethod === 'POST') {
    const matches = Array.isArray(b.matches) ? b.matches : [];
    try { await store.setJSON('matches', matches); return resp(200, { ok: true, count: matches.length }); }
    catch (e) { return resp(200, { ok: false, error: e.message }); }
  }

  try { const matches = (await store.get('matches', { type: 'json' })) || []; return resp(200, { ok: true, matches: matches }); }
  catch (e) { return resp(200, { ok: false, error: e.message, matches: [] }); }
};
