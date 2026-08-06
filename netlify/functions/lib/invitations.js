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
// WHERE IT IS STORED  (CHANGED 5 Aug 2026)
// -----------------------------------------
// This module used Netlify Blobs. In production that store has never been
// provisioned — every call returned "The environment has not been configured
// to use Netlify Blobs" — so no invitation could ever be written and the whole
// flow was inert. It now delegates to lib/staff-store.js (Supabase), which is
// the club's working server-side store. The public shape of this module is
// unchanged, so every caller keeps working.
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

const STORE = require('./staff-store');

const TTL_HOURS = STORE.TTL_HOURS;
const PEPPER = STORE.PEPPER;

/** Kept for callers and tests that hash directly. */
const mintToken = STORE.mintToken;
const hashToken = STORE.hashToken;
const hashPassword = STORE.hashPassword;

/** No-op seam retained so older tests that swapped the Blobs store still load. */
function _setStoreFactory() { /* storage now lives in lib/staff-store.js */ }

function statusOf(inv, now) {
  const t = now || Date.now();
  if (!inv) return 'unknown';
  if (inv.revoked_at || inv.status === 'revoked') return 'revoked';
  if (inv.used_at || inv.status === 'used') return 'used';
  if (Date.parse(inv.expires_at) <= t) return 'expired';
  return 'pending';
}
function isUsable(inv, now) { return statusOf(inv, now) === 'pending'; }

/** The safe shape. Carries no hash and no token. */
function publicInvite(inv) { return STORE.publicInvite(inv); }

/**
 * Create an invitation. Any live invitation for the same person is revoked
 * first — a replacement must invalidate its predecessor, or "send them a new
 * link" quietly leaves two working ways in. The database enforces the same
 * rule with a partial unique index, so a race cannot produce two either.
 *
 * @returns {{invite, token}} the RAW token, returned once and never stored.
 */
async function create(opts) {
  const o = opts || {};
  // The account must exist before it can be invited. Creating it here as a
  // pending row keeps "invite somebody new" working in one step.
  const existing = await STORE.getUser(o.username);
  if (!existing) {
    await STORE.createUser({
      username: o.username, name: o.name, title: o.title,
      role: o.profile, createdBy: o.createdBy,
    });
  }
  return STORE.createInvite({ username: o.username, createdBy: o.createdBy });
}

async function list() { return STORE.listInvites(); }
async function revoke(id, by) { return STORE.revokeInvite(id, by); }
async function redeem(token, password) { return STORE.redeemInvite(token, password); }

async function findByToken(token) {
  const all = await STORE.listInvites();
  return all.find(function (i) { return i.token_hash === STORE.hashToken(token); }) || null;
}

/** Is there an activated administrative account? Used by the bootstrap. */
async function chairmanExists() {
  return STORE.adminExists(require('./roles').ADMIN_ROLES);
}

/** A pending account row. Cannot log in: no hash means nothing can match. */
async function ensurePendingAccount(username, name, title, profile) {
  const existing = await STORE.getUser(username);
  if (existing) return existing;
  return STORE.createUser({ username: username, name: name, title: title, role: profile });
}

module.exports = {
  TTL_HOURS, PEPPER, _setStoreFactory,
  mintToken, hashToken, hashPassword,
  statusOf, isUsable, publicInvite,
  create, list, revoke, redeem, findByToken,
  chairmanExists, ensurePendingAccount,
};
