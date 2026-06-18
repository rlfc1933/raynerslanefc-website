// Rayners Lane FC — verify a staff role login against custom passwords and log
// the sign-in. Reuses the Supabase project (SUPABASE_URL/SERVICE_KEY).
//
// Body: { pin, username, password }
// Returns:
//   { ok:true, role, isChairman }              — password matched
//   { ok:false, error:'wrong-password' }       — a CUSTOM password was set and missed
//   { ok:false, error:'not-found' }            — no custom row → client uses default pw
//   { ok:false, error:'no-supabase' }          — sync not configured → client uses default pw
//
// Passwords are stored as a salted SHA-256 hash, never in plain text or the repo.

const crypto = require('crypto');
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const PEPPER = 'rlfc:staff:v1';

function hash(pw) { return crypto.createHash('sha256').update(String(pw) + ':' + PEPPER).digest('hex'); }
function resp(code, obj) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: JSON.stringify(obj) };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  if (String(b.pin) !== String(process.env.ADMIN_PIN || '19332026')) return resp(401, { ok: false, error: 'Unauthorized' });
  if (!URL || !KEY) return resp(200, { ok: false, error: 'no-supabase' });
  if (!b.username || !b.password) return resp(400, { ok: false, error: 'missing' });

  const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  try {
    const r = await fetch(URL + '/rest/v1/staff_users?username=eq.' + encodeURIComponent(b.username) + '&active=eq.true&select=username,role,pass_hash,is_chairman', { headers, signal: AbortSignal.timeout(9000) });
    if (!r.ok) return resp(200, { ok: false, error: 'lookup ' + r.status });
    const rows = await r.json();
    if (!rows || !rows.length) return resp(200, { ok: false, error: 'not-found' });
    const u = rows[0];
    if (u.pass_hash !== hash(b.password)) return resp(200, { ok: false, error: 'wrong-password' });

    // Log the sign-in (best-effort — never block login on logging).
    try {
      await fetch(URL + '/rest/v1/staff_logins', {
        method: 'POST', headers: Object.assign({ Prefer: 'return=minimal' }, headers), signal: AbortSignal.timeout(6000),
        body: JSON.stringify({ username: u.username, role: u.role || '', user_agent: (event.headers && (event.headers['user-agent'] || event.headers['User-Agent'])) || '' }),
      });
    } catch (e) {}

    return resp(200, { ok: true, role: u.role || u.username, isChairman: !!u.is_chairman });
  } catch (e) {
    return resp(200, { ok: false, error: e.message });
  }
};
