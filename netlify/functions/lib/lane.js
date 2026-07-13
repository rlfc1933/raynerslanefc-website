// The Lane App — shared server helpers (service-key Supabase access, custom
// session auth, code hashing, permissions, audit). Required by the la-* funcs.
// Not a function itself (it lives in lib/, which Netlify doesn't treat as one).

const crypto = require('crypto');

const URL = process.env.SUPABASE_URL || 'https://rewkixywfgsyqinfbggv.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

function H(extra) { return Object.assign({ apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, extra || {}); }

function resp(code, obj) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' },
    body: JSON.stringify(obj),
  };
}

// ── REST helpers over PostgREST (service key bypasses RLS) ──
async function sel(path) {
  const r = await fetch(URL + '/rest/v1/' + path, { headers: H(), signal: AbortSignal.timeout(9000) });
  if (!r.ok) return [];
  return r.json().catch(function () { return []; });
}
async function ins(table, row, opts) {
  opts = opts || {};
  const prefer = (opts.upsert ? 'resolution=merge-duplicates,' : '') + 'return=representation';
  let url = URL + '/rest/v1/' + table;
  if (opts.onConflict) url += '?on_conflict=' + opts.onConflict;
  const r = await fetch(url, { method: 'POST', headers: H({ Prefer: prefer }), body: JSON.stringify(row), signal: AbortSignal.timeout(9000) });
  const j = await r.json().catch(function () { return null; });
  return { ok: r.ok, status: r.status, data: j };
}
async function upd(table, filter, patch) {
  const r = await fetch(URL + '/rest/v1/' + table + '?' + filter, { method: 'PATCH', headers: H({ Prefer: 'return=representation' }), body: JSON.stringify(patch), signal: AbortSignal.timeout(9000) });
  const j = await r.json().catch(function () { return null; });
  return { ok: r.ok, status: r.status, data: j };
}
async function del(table, filter) {
  const r = await fetch(URL + '/rest/v1/' + table + '?' + filter, { method: 'DELETE', headers: H(), signal: AbortSignal.timeout(9000) });
  return { ok: r.ok, status: r.status };
}

// ── code hashing (scrypt — built into Node, no dependency) ──
function hashCode(code) {
  const salt = crypto.randomBytes(16).toString('hex');
  const dk = crypto.scryptSync(String(code), salt, 32).toString('hex');
  return 'scrypt$' + salt + '$' + dk;
}
function verifyCode(code, stored) {
  try {
    const parts = String(stored).split('$');
    const salt = parts[1], dk = parts[2];
    const test = crypto.scryptSync(String(code), salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(dk, 'hex'));
  } catch (e) { return false; }
}
function newToken() { return crypto.randomBytes(24).toString('hex'); }

// ── session + permissions ──
async function session(token) {
  if (!token) return null;
  const rows = await sel('la_sessions?select=user_id,expires_at,la_app_users(id,role,player_id,status)&token=eq.' + encodeURIComponent(token));
  const s = rows[0];
  if (!s) return null;
  if (s.expires_at && new Date(s.expires_at) < new Date()) return null;
  const u = s.la_app_users;
  if (!u || u.status !== 'active') return null;
  return { user_id: u.id, role: u.role, player_id: u.player_id };
}
function isStaffRole(r) { return r === 'chairman' || r === 'manager' || r === 'coach' || r === 'staff'; }
async function can(sess, capability) {
  if (!sess) return false;
  const byUser = await sel('la_permissions?select=granted&user_id=eq.' + sess.user_id + '&capability=eq.' + capability);
  if (byUser.length) return !!byUser[0].granted;
  const byRole = await sel('la_permissions?select=granted&role=eq.' + sess.role + '&capability=eq.' + capability);
  if (byRole.length) return !!byRole[0].granted;
  return sess.role === 'chairman'; // chairman is all-powerful by default
}
async function audit(actorId, action, entity, entityId, before, after) {
  try { await ins('la_audit_log', { actor_id: actorId || null, action: action, entity: entity, entity_id: String(entityId == null ? '' : entityId), before: before || null, after: after || null }); } catch (e) {}
}

function tokenFrom(event, body) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  if (auth.indexOf('Bearer ') === 0) return auth.slice(7);
  return (body && body.token) || '';
}
function parseBody(event) { try { return JSON.parse(event.body || '{}'); } catch (e) { return {}; } }

module.exports = { URL, KEY, H, resp, sel, ins, upd, del, hashCode, verifyCode, newToken, session, can, isStaffRole, audit, tokenFrom, parseBody };
