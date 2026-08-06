// ════════════════════════════════════════════════════════════════════════════
// THE STAFF STORE — one place that knows where staff credentials live.
//
// WHY THIS REPLACED NETLIFY BLOBS
// -------------------------------
// Every staff function used getStore('rlfc-staff'). In production that store
// has never existed: Netlify answers
//
//     The environment has not been configured to use Netlify Blobs
//
// so no account, invitation or setup token could ever be written. The portal
// looked complete and had nothing underneath it, which is exactly why the
// shared committee password has been the only working way in.
//
// Supabase already holds the club's other server-side data and already has a
// proven service-key path. Moving here removes a dependency that never worked
// rather than adding one that might not.
//
// WHY AN ADAPTER RATHER THAN SIX REWRITES
// ---------------------------------------
// Six functions read and wrote that store, each with its own idea of the shape
// of a user record. One module means one definition of what an account is, one
// place where a password hash is written, and one place to look when the next
// storage question comes up. It also means the next migration is one file.
//
// WHAT NEVER LEAVES THIS MODULE
// -----------------------------
// `pass_hash`. Callers get accounts through publicUser(), which cannot return
// it. The only function that reads it is verifyPassword(), which takes a
// candidate password and returns a boolean — the hash itself is never handed
// out, not even to other server code.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const crypto = require('crypto');

const URL = process.env.SUPABASE_URL || 'https://rewkixywfgsyqinfbggv.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SECRET_KEY;

const USERS = 'la_staff_users';
const INVITES = 'la_staff_invitations';
const BOOTSTRAP = 'la_staff_bootstrap';

// The same pepper the staff store has always used, so existing hashes stay
// valid and there is one hashing convention rather than two.
const PEPPER = 'rlfc:staff:v1';
const TTL_HOURS = 72;

/* A seam for tests. Production never sets this; the suite swaps in an
   in-memory table so no test can reach the club's real committee records. */
let _driver = null;
function _setDriver(d) { _driver = d; }
function configured() { return !!KEY; }

function H(extra) {
  return Object.assign({
    apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json',
  }, extra || {});
}

async function sel(table, query) {
  if (_driver) return _driver.sel(table, query);
  const r = await fetch(URL + '/rest/v1/' + table + '?' + query, {
    headers: H(), signal: AbortSignal.timeout(9000),
  });
  if (!r.ok) throw new Error('store_read_failed:' + r.status);
  return r.json();
}
async function ins(table, row, onConflict) {
  if (_driver) return _driver.ins(table, row, onConflict);
  let url = URL + '/rest/v1/' + table;
  if (onConflict) url += '?on_conflict=' + onConflict;
  const r = await fetch(url, {
    method: 'POST',
    headers: H({ Prefer: (onConflict ? 'resolution=merge-duplicates,' : '') + 'return=representation' }),
    body: JSON.stringify(row), signal: AbortSignal.timeout(9000),
  });
  if (!r.ok) throw new Error('store_write_failed:' + r.status);
  return r.json();
}
async function upd(table, query, patch) {
  if (_driver) return _driver.upd(table, query, patch);
  const r = await fetch(URL + '/rest/v1/' + table + '?' + query, {
    method: 'PATCH', headers: H({ Prefer: 'return=representation' }),
    body: JSON.stringify(patch), signal: AbortSignal.timeout(9000),
  });
  if (!r.ok) throw new Error('store_write_failed:' + r.status);
  return r.json();
}

/** Usernames are case-insensitive everywhere. Normalised once, here. */
function norm(u) { return String(u == null ? '' : u).trim().toLowerCase(); }

function hashPassword(pw) {
  return crypto.createHash('sha256').update(String(pw) + ':' + PEPPER).digest('hex');
}
function hashToken(t) {
  return crypto.createHash('sha256').update(String(t) + ':' + PEPPER).digest('hex');
}
function mintToken() { return crypto.randomBytes(32).toString('base64url'); }

// ── ACCOUNTS ────────────────────────────────────────────────────────────────

/** The safe shape. Cannot carry a password hash — there is no line that adds one. */
function publicUser(u) {
  if (!u) return null;
  return {
    username: u.username,
    name: u.display_name || null,
    title: u.club_title || null,
    role: u.role,
    status: u.disabled ? 'disabled' : (u.pass_hash ? 'active' : 'setup_required'),
    disabled: !!u.disabled,
    is_chairman: false,          // filled by the caller from the validated role
    must_change_password: !!u.must_change_password,
    created_at: u.created_at || null,
    last_login_at: u.last_login_at || null,
  };
}

async function listUsers() {
  const rows = await sel(USERS, 'select=*&order=display_name.asc');
  return rows.map(publicUser);
}

/** The RAW row, hash included. Private to this module and its callers' checks. */
async function _raw(username) {
  const rows = await sel(USERS, 'username=eq.' + encodeURIComponent(norm(username)) + '&select=*&limit=1');
  return rows[0] || null;
}

async function getUser(username) { return publicUser(await _raw(username)); }

async function createUser(o) {
  const row = {
    username: norm(o.username),
    display_name: o.name || null,
    club_title: o.title || null,
    role: o.role,
    status: 'setup_required',
    created_by: o.createdBy || null,
  };
  const out = await ins(USERS, row, 'username');
  return publicUser(Array.isArray(out) ? out[0] : out);
}

async function updateUser(username, patch) {
  const out = await upd(USERS, 'username=eq.' + encodeURIComponent(norm(username)), patch);
  return publicUser(Array.isArray(out) ? out[0] : out);
}

/**
 * Set a password. The ONLY way a hash is written, and it always moves the
 * account to 'active' in the same statement — an account cannot end up with a
 * password but still reading as pending.
 */
async function setPassword(username, password) {
  return updateUser(username, {
    pass_hash: hashPassword(password),
    status: 'active',
    must_change_password: false,
  });
}

/**
 * Is this the right password? Returns a reason rather than a bare false, so
 * callers can refuse a disabled or never-set-up account BEFORE the comparison
 * and say something true about why.
 */
async function verifyPassword(username, password) {
  const u = await _raw(username);
  if (!u) return { ok: false, reason: 'not-found' };
  if (u.disabled) return { ok: false, reason: 'account-disabled' };
  if (!u.pass_hash) return { ok: false, reason: 'setup-required' };
  const a = Buffer.from(hashPassword(password), 'hex');
  const b = Buffer.from(u.pass_hash, 'hex');
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return { ok: false, reason: 'wrong-password' };
  return { ok: true, user: publicUser(u) };
}

/**
 * Switch an account off, or back on. Nothing is deleted: the row, its history
 * and its role stay exactly as they were.
 *
 * Re-enabling restores the status the account actually deserves — 'active' if
 * it has a password, 'setup_required' if it never finished setup. Blindly
 * setting 'active' would let a never-activated account become signable-into
 * with no password, which the database's own check constraint would reject.
 */
async function setDisabled(username, disabled) {
  const current = await _raw(username);
  if (!current) return null;
  const status = disabled ? 'disabled' : (current.pass_hash ? 'active' : 'setup_required');
  return updateUser(username, { disabled: !!disabled, status: status });
}

/**
 * Delete an account outright. The last resort — disable is preferred
 * everywhere, because it stops the login while keeping the person's history.
 * Their invitations go with them (the foreign key cascades), which is correct:
 * a link to an account that no longer exists must not remain redeemable.
 */
async function removeUser(username) {
  if (_driver) return _driver.del(USERS, 'username=eq.' + norm(username));
  const r = await fetch(URL + '/rest/v1/' + USERS + '?username=eq.' + encodeURIComponent(norm(username)), {
    method: 'DELETE', headers: H(), signal: AbortSignal.timeout(9000),
  });
  if (!r.ok) throw new Error('store_write_failed:' + r.status);
  return true;
}

async function recordLogin(username) {
  try { await updateUser(username, { last_login_at: new Date().toISOString() }); } catch (e) { /* never block a login */ }
}

// ── INVITATIONS ─────────────────────────────────────────────────────────────

function publicInvite(i) {
  if (!i) return null;
  return {
    id: i.id, username: i.username, status: i.status,
    created_at: i.created_at, created_by: i.created_by,
    expires_at: i.expires_at, used_at: i.used_at || null, revoked_at: i.revoked_at || null,
  };
}

/** Anything past its expiry reads as expired even if the row still says pending. */
function settle(i) {
  if (!i) return i;
  if (i.status === 'pending' && Date.parse(i.expires_at) <= Date.now()) {
    return Object.assign({}, i, { status: 'expired' });
  }
  return i;
}

async function listInvites() {
  const rows = await sel(INVITES, 'select=*&order=created_at.desc');
  return rows.map(settle).map(publicInvite);
}

/**
 * Create an invitation, revoking any live one for the same person first — a
 * replacement must invalidate its predecessor, or "send them a new link"
 * leaves two working ways in. The database also enforces this with a partial
 * unique index, so a race cannot produce two.
 */
async function createInvite(o) {
  const username = norm(o.username);
  await upd(INVITES,
    'username=eq.' + encodeURIComponent(username) + '&status=eq.pending',
    { status: 'revoked', revoked_at: new Date().toISOString(),
      revoked_by: o.createdBy || null, revoked_reason: 'replaced' });

  const token = mintToken();
  const row = {
    id: crypto.randomBytes(9).toString('base64url'),
    username: username,
    token_hash: hashToken(token),       // ← the only form kept
    status: 'pending',
    expires_at: new Date(Date.now() + TTL_HOURS * 3600 * 1000).toISOString(),
    created_by: o.createdBy || null,
  };
  const out = await ins(INVITES, row);
  return { invite: publicInvite(Array.isArray(out) ? out[0] : out), token };
}

async function revokeInvite(id, by) {
  const out = await upd(INVITES, 'id=eq.' + encodeURIComponent(id) + '&status=eq.pending',
    { status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: by || null, revoked_reason: 'revoked' });
  return publicInvite((Array.isArray(out) ? out[0] : out) || null);
}

/**
 * Redeem an invitation and set the person's own password.
 *
 * One refusal shape for every failure. A caller probing tokens must not learn
 * whether one existed, was used, or merely expired.
 */
async function redeemInvite(token, password) {
  if (typeof password !== 'string' || password.length < 10) {
    return { ok: false, reason: 'weak_password' };
  }
  const rows = await sel(INVITES, 'token_hash=eq.' + encodeURIComponent(hashToken(token)) + '&select=*&limit=1');
  const inv = settle(rows[0]);
  if (!inv || inv.status !== 'pending') return { ok: false, reason: 'invalid' };

  const u = await _raw(inv.username);
  if (!u) return { ok: false, reason: 'invalid' };
  if (u.pass_hash && !u.disabled) return { ok: false, reason: 'already_active' };

  await setPassword(inv.username, password);
  await upd(INVITES, 'id=eq.' + encodeURIComponent(inv.id),
    { status: 'used', used_at: new Date().toISOString() });

  const fresh = await getUser(inv.username);
  return { ok: true, username: inv.username, user: fresh };
}

// ── BOOTSTRAP STATE ─────────────────────────────────────────────────────────

async function bootstrapConsumed() {
  const rows = await sel(BOOTSTRAP, 'select=*&limit=1');
  return !!(rows[0] && rows[0].consumed_at);
}

async function consumeBootstrap(by, note) {
  await upd(BOOTSTRAP, 'id=eq.true', {
    consumed_at: new Date().toISOString(), consumed_by: by || null, consumed_note: note || null,
  });
}

/** Is there an active Chairman-level account? Used to refuse a second bootstrap. */
async function adminExists(adminRoles) {
  const roles = (adminRoles || ['Chairman']).map(encodeURIComponent).join(',');
  const rows = await sel(USERS, 'role=in.(' + roles + ')&status=eq.active&select=username&limit=1');
  return rows.length > 0;
}

module.exports = {
  USERS, INVITES, BOOTSTRAP, TTL_HOURS, PEPPER,
  configured, norm, hashPassword, hashToken, mintToken, publicUser, publicInvite,
  listUsers, getUser, createUser, updateUser, setPassword, verifyPassword,
  setDisabled, recordLogin, removeUser,
  listInvites, createInvite, revokeInvite, redeemInvite,
  bootstrapConsumed, consumeBootstrap, adminExists,
  _setDriver, _raw,
};
