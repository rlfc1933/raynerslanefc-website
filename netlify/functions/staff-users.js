// Rayners Lane FC — manage staff logins (Chairman, via the PIN-gated admin).
// Stored in Netlify Blobs (built-in, ZERO setup — no database, no SQL).
//   GET  ?pin=...                                   → { ok, users:[{username,role,is_chairman}] }
//   POST { pin, action:'add'|'setpassword', username, password, role?, isChairman? }
//   POST { pin, action:'remove', username }
// Passwords stored as a salted SHA-256 hash — never plain text, never returned.

const crypto = require('crypto');
const PEPPER = 'rlfc:staff:v1';

function hash(pw) { return crypto.createHash('sha256').update(String(pw) + ':' + PEPPER).digest('hex'); }
function resp(code, obj) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }, body: JSON.stringify(obj) };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});

  let pin = (event.queryStringParameters && event.queryStringParameters.pin) || '';
  let b = {};
  if (event.httpMethod === 'POST') { try { b = JSON.parse(event.body || '{}'); pin = b.pin || pin; } catch (e) {} }
  if (String(pin) !== String(process.env.ADMIN_PIN || '19332026')) return resp(401, { ok: false, error: 'Unauthorized' });

  let store, users;
  try { const { getStore } = await import('@netlify/blobs'); store = getStore('rlfc-staff'); users = (await store.get('users', { type: 'json' })) || {}; }
  catch (e) { return resp(200, { ok: false, error: 'no-store' }); }

  if (event.httpMethod === 'GET') {
    var list = Object.keys(users).map(function (k) { return { username: k, role: users[k].role || k, is_chairman: !!users[k].is_chairman }; });
    return resp(200, { ok: true, users: list });
  }
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });

  var username = b.username;
  if (!username) return resp(400, { ok: false, error: 'no-username' });

  try {
    if (b.action === 'remove') {
      delete users[username];
      await store.setJSON('users', users);
      return resp(200, { ok: true });
    }
    if (b.action === 'add' || b.action === 'setpassword') {
      if (!b.password || String(b.password).length < 6) return resp(400, { ok: false, error: 'weak-password' });
      var cur = users[username] || {};
      users[username] = {
        role: b.role || cur.role || username,
        pass_hash: hash(b.password),
        is_chairman: (b.isChairman != null ? !!b.isChairman : !!cur.is_chairman) || (b.role === 'Chairman') || username === 'Chairman',
      };
      await store.setJSON('users', users);
      return resp(200, { ok: true });
    }
    return resp(400, { ok: false, error: 'bad-action' });
  } catch (e) { return resp(200, { ok: false, error: e.message }); }
};
