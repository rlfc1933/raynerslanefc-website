// ════════════════════════════════════════════════════════════════════════════
// STAFF INVITATIONS — how somebody gets an account without anybody handling
// their password.
//
// WHY THIS EXISTS
// ---------------
// The obvious way to onboard seven committee members is to set each a
// temporary password and hand it over. That was the plan, and it is wrong for
// a reason worth writing down: a temporary password has to travel. It gets
// typed into a message, pasted into a chat, read out on a phone call, written
// on a scrap of paper by the pitch. Between creation and first login it is a
// working credential in a channel nobody controls — and for the Chairman's
// account, that is a full administrative login sitting in somebody's WhatsApp.
//
// So no password is ever created for anyone. An administrator creates an
// INVITATION; the person follows it and sets a password only they ever know.
// There is nothing to hand over, because there is nothing to leak.
//
// WHAT IS STORED
// --------------
// Only a SHA-256 hash of the token. The raw token is returned exactly once,
// from the call that created it, and then it exists nowhere on the server.
// If the administrator loses it before passing it on, the invitation is
// revoked and replaced — it is not recoverable, by design.
//
// A token in a log is a token, so nothing here ever logs one. The audit trail
// records that an invitation was created, by whom and for whom. Never the
// value.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const crypto = require('crypto');

const STORE = 'rlfc-staff';
const KEY = 'invitations';

// 72 hours. Long enough to reach somebody who only checks email at the
// weekend; short enough that a forgotten link stops working before it is
// forgotten about entirely.
const TTL_HOURS = 72;

// The same pepper the staff store already uses for passwords, so hashing
// stays in one place rather than becoming two conventions.
const PEPPER = 'rlfc:staff:v1';

/** The one-time secret. 32 bytes of CSPRNG, URL-safe. */
function mintToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/** What we keep. Never reversible to the token. */
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token) + ':' + PEPPER).digest('hex');
}

/** Password hashing — identical to staff-users.js, deliberately not a second scheme. */
function hashPassword(pw) {
  return crypto.createHash('sha256').update(String(pw) + ':' + PEPPER).digest('hex');
}

/* The store, behind one function so it can be swapped in tests.
   Every piece of invitation state — tokens, accounts, activation — goes
   through here, which is why a single seam is enough to keep the whole suite
   off the club's real staff store. Production never sets this. */
let _storeFactory = null;
function _setStoreFactory(fn) { _storeFactory = fn; }

async function blobs() {
  if (_storeFactory) return _storeFactory(STORE);
  const { getStore } = await import('@netlify/blobs');
  return getStore(STORE);
}

async function readAll(store) {
  return (await store.get(KEY, { type: 'json' })) || {};
}

/**
 * The state of an invitation, as a single word.
 * Order matters: revoked beats expired beats used, because that is the order
 * a person asking "why did my link not work" needs to hear it.
 */
function statusOf(inv, now) {
  const t = now || Date.now();
  if (!inv) return 'unknown';
  if (inv.revoked_at) return 'revoked';
  if (inv.used_at) return 'used';
  if (Date.parse(inv.expires_at) <= t) return 'expired';
  return 'pending';
}

function isUsable(inv, now) {
  return statusOf(inv, now) === 'pending';
}

/** The safe shape. Carries no hash and no token. */
function publicInvite(inv, now) {
  return {
    id: inv.id,
    username: inv.username,
    name: inv.name,
    title: inv.title,
    profile: inv.profile,
    status: statusOf(inv, now),
    created_at: inv.created_at,
    created_by: inv.created_by,
    expires_at: inv.expires_at,
    used_at: inv.used_at || null,
    revoked_at: inv.revoked_at || null,
  };
}

/**
 * Create an invitation.
 *
 * Any existing pending invitation for the same username is revoked first — a
 * replacement must invalidate its predecessor, or "send them a new link"
 * quietly leaves two working ways in.
 *
 * @returns {{invite, token}} the RAW token, returned once and never stored.
 */
async function create(opts) {
  const o = opts || {};
  const store = await blobs();
  const all = await readAll(store);
  const now = Date.now();

  Object.keys(all).forEach((id) => {
    if (all[id].username === o.username && isUsable(all[id], now)) {
      all[id].revoked_at = new Date(now).toISOString();
      all[id].revoked_by = o.createdBy || null;
      all[id].revoked_reason = 'replaced';
    }
  });

  const token = mintToken();
  const id = crypto.randomBytes(9).toString('base64url');
  const invite = {
    id,
    username: o.username,
    name: o.name || null,
    title: o.title || null,
    profile: o.profile || null,
    token_hash: hashToken(token),          // ← the only form we keep
    created_by: o.createdBy || null,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + TTL_HOURS * 3600 * 1000).toISOString(),
    used_at: null,
    revoked_at: null,
  };
  all[id] = invite;
  await store.setJSON(KEY, all);

  // The token leaves this function and is never seen again.
  return { invite: publicInvite(invite, now), token };
}

/** Find the invitation a raw token belongs to, without ever comparing raw values. */
async function findByToken(token) {
  if (!token) return null;
  const store = await blobs();
  const all = await readAll(store);
  const hash = hashToken(token);
  const id = Object.keys(all).find((k) => all[k].token_hash === hash);
  return id ? all[id] : null;
}

async function list() {
  const store = await blobs();
  const all = await readAll(store);
  const now = Date.now();
  return Object.keys(all)
    .map((k) => publicInvite(all[k], now))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

async function revoke(id, by) {
  const store = await blobs();
  const all = await readAll(store);
  const inv = all[id];
  if (!inv) return null;
  if (!isUsable(inv)) return publicInvite(inv);
  inv.revoked_at = new Date().toISOString();
  inv.revoked_by = by || null;
  inv.revoked_reason = 'revoked';
  await store.setJSON(KEY, all);
  return publicInvite(inv);
}

/**
 * Redeem an invitation and set the password.
 *
 * The account only becomes usable at this moment. Before it, there is a row
 * with no password that cannot log in; after it, there is an active account
 * whose password has never existed anywhere but in the holder's head and this
 * one hash.
 */
async function redeem(token, password) {
  const store = await blobs();
  const all = await readAll(store);
  const hash = hashToken(token);
  const id = Object.keys(all).find((k) => all[k].token_hash === hash);
  const now = Date.now();

  // One refusal message for every failure mode. A caller probing tokens must
  // not learn whether one existed, was used, or merely expired.
  if (!id) return { ok: false, reason: 'invalid' };
  const inv = all[id];
  const status = statusOf(inv, now);
  if (status !== 'pending') return { ok: false, reason: status };

  if (typeof password !== 'string' || password.length < 10) {
    return { ok: false, reason: 'weak_password' };
  }

  const users = (await store.get('users', { type: 'json' })) || {};
  const existing = users[inv.username] || {};

  // Already activated? Then this invitation is stale whatever its own state
  // says, and re-running it would reset a live account's password.
  if (existing.pass_hash && !existing.pending) {
    return { ok: false, reason: 'already_active' };
  }

  users[inv.username] = Object.assign({}, existing, {
    role: inv.profile || existing.role || inv.username,
    title: inv.title || existing.title || null,
    name: inv.name || existing.name || null,
    pass_hash: hashPassword(password),
    is_chairman: inv.profile === 'Chairman',
    pending: false,
    disabled: false,
    activated_at: new Date(now).toISOString(),
  });
  await store.setJSON('users', users);

  inv.used_at = new Date(now).toISOString();
  await store.setJSON(KEY, all);

  return { ok: true, username: inv.username, profile: inv.profile, title: inv.title };
}

/** Is there an activated Chairman? Used by the bootstrap to refuse itself. */
async function chairmanExists() {
  const store = await blobs();
  const users = (await store.get('users', { type: 'json' })) || {};
  return Object.keys(users).some((k) => users[k].is_chairman && !users[k].pending);
}

/** A pending account row, created alongside an invitation. Cannot log in. */
async function ensurePendingAccount(username, name, title, profile) {
  const store = await blobs();
  const users = (await store.get('users', { type: 'json' })) || {};
  if (!users[username]) {
    users[username] = {
      role: profile || username,
      title: title || null,
      name: name || null,
      pending: true,          // no pass_hash → staff-login cannot admit it
      disabled: false,
      is_chairman: profile === 'Chairman',
      created_at: new Date().toISOString(),
    };
    await store.setJSON('users', users);
  }
  return users[username];
}

module.exports = {
  TTL_HOURS, STORE, KEY, _setStoreFactory,
  mintToken, hashToken, hashPassword,
  statusOf, isUsable, publicInvite,
  create, list, revoke, redeem, findByToken,
  chairmanExists, ensurePendingAccount,
};
