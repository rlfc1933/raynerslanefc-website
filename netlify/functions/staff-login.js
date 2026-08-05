// Rayners Lane FC — verify a staff role login against custom passwords.
// Stored in Netlify Blobs (built-in, ZERO setup — no database, no SQL).
//
// Body: { pin, username, password }
// Returns:
//   { ok:true, role, isChairman }        — custom password matched
//   { ok:false, error:'wrong-password' } — a custom password was set and missed
//   { ok:false, error:'not-found' }      — no custom password → client uses the default
//   { ok:false, error:'no-store' }       — store unavailable → client uses the default
//
// Passwords are stored as a salted SHA-256 hash — never plain text, never in the repo.
// (The sign-in is logged by the client via staff-logins so default logins count too.)

const crypto = require('crypto');
const adminOk = require('./lib/pin');
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
  if (!adminOk(b.pin)) return resp(401, { ok: false, error: 'Unauthorized' });
  if (!b.username || !b.password) return resp(400, { ok: false, error: 'missing' });

  let users;
  try { const { getStore } = await import('@netlify/blobs'); users = (await getStore('rlfc-staff').get('users', { type: 'json' })) || {}; }
  catch (e) { return resp(200, { ok: false, error: 'no-store' }); }

  const u = users[b.username];
  if (!u) return resp(200, { ok: false, error: 'not-found' });
  // A disabled account is refused BEFORE the password is considered. Without
  // this, "disable" in Manage Users would be a label with no effect — the
  // person would keep signing in and nobody would know.
  if (u.disabled) return resp(200, { ok: false, error: 'account-disabled' });
  if (u.pass_hash !== hash(b.password)) return resp(200, { ok: false, error: 'wrong-password' });
  // name and title are returned so the portal can greet a person by name and
  // show the job they actually hold. Both are optional: accounts created
  // before invitations existed have neither, and the portal falls back to
  // "Welcome back" rather than inventing one.
  return resp(200, {
    ok: true,
    role: u.role || b.username,
    isChairman: !!u.is_chairman,
    name: u.name || null,
    title: u.title || null,
  });
};
