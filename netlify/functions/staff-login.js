// Rayners Lane FC — verify an individual staff login.
//
// Body: { pin, username, password }
// Returns:
//   { ok:true, role, isChairman, name, title }
//   { ok:false, error:'wrong-password' }    a password is set and was missed
//   { ok:false, error:'setup-required' }    the account exists, no password yet
//   { ok:false, error:'account-disabled' }  switched off
//   { ok:false, error:'not-found' }         → client falls back to shared access
//   { ok:false, error:'no-store' }          → client falls back to shared access
//
// Accounts live in Supabase (lib/staff-store.js). They were previously in
// Netlify Blobs, which has never been provisioned for this site, so nothing
// could be stored and every login fell through to the shared committee
// password. Passwords are stored only as a peppered hash and are compared in
// constant time inside the store — the hash is never returned from it.
const adminOk = require('./lib/pin');
const STORE = require('./lib/staff-store');
const ROLES = require('./lib/roles');

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

  // The account store moved from Netlify Blobs to Supabase — the Blobs store
  // never existed in production, so no staff account could ever be persisted.
  // See lib/staff-store.js.
  //
  // verifyPassword refuses a disabled account and an account that has never
  // completed setup BEFORE comparing anything, so "disabled" is a real state
  // rather than a label, and a pending account cannot be guessed into.
  let v;
  try { v = await STORE.verifyPassword(b.username, b.password); }
  catch (e) { return resp(200, { ok: false, error: 'no-store' }); }

  if (!v.ok) return resp(200, { ok: false, error: v.reason });
  const u = v.user;
  STORE.recordLogin(b.username);
  // name and title are returned so the portal can greet a person by name and
  // show the job they actually hold. Both are optional: accounts created
  // before invitations existed have neither, and the portal falls back to
  // "Welcome back" rather than inventing one.
  return resp(200, {
    ok: true,
    role: u.role || b.username,
    // Derived from the role the SERVER holds, never from a stored flag and
    // never from anything the browser sent.
    isChairman: ROLES.ADMIN_ROLES.indexOf(u.role) > -1,
    name: u.name || null,
    title: u.title || null,
  });
};
