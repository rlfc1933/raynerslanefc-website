const adminOk = require('./lib/pin');
// Rayners Lane FC — staff sign-in history (Netlify Blobs, ZERO setup).
//   GET  ?pin=...                          → { ok, logins:[{username,role,at}] } (latest 60)
//   POST { pin, username, role }           → append a sign-in (called by the client on
//                                            EVERY successful login, default password too)

function resp(code, obj) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }, body: JSON.stringify(obj) };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});

  let pin = (event.queryStringParameters && event.queryStringParameters.pin) || '';
  let b = {};
  if (event.httpMethod === 'POST') { try { b = JSON.parse(event.body || '{}'); pin = b.pin || pin; } catch (e) {} }
  if (!adminOk(pin)) return resp(401, { ok: false, error: 'Unauthorized', logins: [] });

  let store, logins;
  try { const { getStore } = await import('@netlify/blobs'); store = getStore('rlfc-staff'); logins = (await store.get('logins', { type: 'json' })) || []; }
  catch (e) { return resp(200, { ok: false, error: 'no-store', logins: [] }); }

  if (event.httpMethod === 'POST') {
    if (!b.username) return resp(400, { ok: false, error: 'no-username' });
    try {
      logins.unshift({ username: String(b.username).slice(0, 60), role: String(b.role || '').slice(0, 40), at: new Date().toISOString() });
      await store.setJSON('logins', logins.slice(0, 300));
      return resp(200, { ok: true });
    } catch (e) { return resp(200, { ok: false, error: e.message }); }
  }

  return resp(200, { ok: true, logins: logins.slice(0, 60) });
};
