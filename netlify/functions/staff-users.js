// Rayners Lane FC — manage staff logins (Chairman, via the PIN-gated admin).
//   GET  ?pin=...                                   → { ok, users:[{username,role,is_chairman}] }
//   POST { pin, action:'add'|'setpassword', username, password, role?, isChairman? }
//   POST { pin, action:'remove', username }
// Passwords stored as salted SHA-256 — never plain text, never in the repo.

const crypto = require('crypto');
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
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
  if (!URL || !KEY) return resp(200, { ok: false, error: 'no-supabase' });

  const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

  // List (no hashes returned)
  if (event.httpMethod === 'GET') {
    try {
      const r = await fetch(URL + '/rest/v1/staff_users?active=eq.true&select=username,role,is_chairman&order=username.asc', { headers, signal: AbortSignal.timeout(9000) });
      if (!r.ok) return resp(200, { ok: false, error: 'list ' + r.status });
      return resp(200, { ok: true, users: await r.json() });
    } catch (e) { return resp(200, { ok: false, error: e.message }); }
  }

  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });
  const action = b.action, username = b.username;
  if (!username) return resp(400, { ok: false, error: 'no-username' });

  try {
    if (action === 'remove') {
      const r = await fetch(URL + '/rest/v1/staff_users?username=eq.' + encodeURIComponent(username), { method: 'DELETE', headers, signal: AbortSignal.timeout(9000) });
      return resp(200, r.ok ? { ok: true } : { ok: false, error: 'remove ' + r.status });
    }
    if (action === 'add' || action === 'setpassword') {
      if (!b.password || String(b.password).length < 6) return resp(400, { ok: false, error: 'weak-password' });
      const row = { username: username, pass_hash: hash(b.password) };
      if (action === 'add') { row.role = b.role || username; row.is_chairman = !!b.isChairman || (b.role === 'Chairman'); row.active = true; }
      else if (b.role) { row.role = b.role; }
      const r = await fetch(URL + '/rest/v1/staff_users?on_conflict=username', {
        method: 'POST', headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, headers),
        signal: AbortSignal.timeout(9000), body: JSON.stringify(row),
      });
      if (!r.ok && r.status !== 201 && r.status !== 200) { const t = await r.text().catch(function () { return ''; }); return resp(200, { ok: false, error: 'save ' + r.status + ' ' + t.slice(0, 100) }); }
      return resp(200, { ok: true });
    }
    return resp(400, { ok: false, error: 'bad-action' });
  } catch (e) { return resp(200, { ok: false, error: e.message }); }
};
