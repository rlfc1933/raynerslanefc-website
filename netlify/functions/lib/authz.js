// ════════════════════════════════════════════════════════════════════════════
// THE CANONICAL PERMISSION PATH.
//
// WHY THIS FILE EXISTS
// --------------------
// The 2026-08-05 audit found three permission mechanisms competing to be the
// source of authority:
//
//   1. lib/pin.js      — one shared club PIN, guarding 41 functions. Knows
//                        WHETHER somebody got in, never WHO.
//   2. lib/md-auth.js  — signed, time-limited identity tokens with a role →
//                        capability map and an elevation rule. Correct, tested,
//                        in production — and used by 3 functions out of 79.
//   3. lib/lane.js     — per-user and per-role capability rows in
//                        la_permissions, resolved server-side. Also correct,
//                        also used by a minority.
//
// Three mechanisms means the answer to "may this person do this?" depended on
// which door they arrived through. This file makes ONE answer:
//
//   IDENTITY comes from a signed md-auth token (who).
//   AUTHORISATION comes from la_permissions, falling back to a server-side
//     default map (what they may do).
//   ELEVATION comes from md-auth's auth:'custom' rule (how well they proved it).
//
// WHAT THIS FILE IS NOT
// ---------------------
// Not a framework. Four exported functions. It establishes the pattern that
// later migrations follow; it does not migrate anything by itself.
//
// THE RULE IT ENFORCES ABOVE ALL OTHERS
// -------------------------------------
// Nothing in the request body is ever trusted as an authorisation claim. Not a
// role, not an isChairman flag, not a capability list. The audit's headline
// finding was a function that read `isChairman` straight out of the POST body.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const AUTH = require('./md-auth');

// ── STAFF ADMINISTRATION CAPABILITIES ──────────────────────────────────────
// Deliberately six, not one. A single `can_manage_users` would mean a deputy
// granted the power to disable a compromised account could also promote
// themselves to Chairman — which is precisely the escalation this work exists
// to close.
//
// `can_manage_users` already existed in the la_permissions vocabulary and is
// reused unchanged. The other five are new and each names one distinct act.
const CAP = {
  VIEW_STAFF:        'can_view_staff',          // see the account list
  MANAGE_USERS:      'can_manage_users',        // create an ORDINARY account  (pre-existing name)
  DISABLE_ACCOUNT:   'can_disable_account',     // stop somebody logging in
  RESET_CREDENTIALS: 'can_reset_credentials',   // set somebody else's password
  ASSIGN_ROLES:      'can_assign_roles',        // ordinary role assignment
  ASSIGN_ADMIN:      'can_assign_admin_roles',  // Chairman / admin — escalation

  // ── FOOTBALL RECORD ──────────────────────────────────────────────────────
  // Deciding that a name on a Full-Time team sheet IS one of our players. Not
  // a staff-administration power at all, which is why it is named separately:
  // the person who knows whether that is Josh Adams or a different Josh Adams
  // is the manager, not the treasurer. It is listed here because this file is
  // where the club's answer to "who may do what" lives, and a second
  // permission system would be a second place to get it wrong.
  CONFIRM_IDENTITY:  'can_confirm_player_identity',

  // Maintaining who is in the first-team squad — adding a signing, correcting a
  // number, standing somebody down when they leave. Distinct from
  // CONFIRM_IDENTITY: that decides which real person a Full-Time match-sheet
  // name refers to, this decides who plays for the club. The Programme Editor
  // needs the second and has no business with the first.
  MANAGE_ROSTER:     'can_manage_first_team_roster',
};

// Actions that additionally require a per-person password, never the shared
// committee default. md-auth already refuses ELEVATED capabilities on a shared
// login; this list extends the same honesty to staff administration.
const ELEVATED = [CAP.RESET_CREDENTIALS, CAP.ASSIGN_ADMIN, CAP.MANAGE_USERS];

// Roles that confer administrative authority over other accounts.
// Taken from lib/roles.js rather than restated, so the list that decides
// "is this escalation?" cannot drift from the list that decides "may this be
// assigned?". A role that escalates in one file and not the other is a hole.
const ADMIN_ROLES = require('./roles').ADMIN_ROLES;

// ── DEFAULT MAP ────────────────────────────────────────────────────────────
// Used when la_permissions has no row for the role — and when Supabase is
// unreachable, so a database outage cannot silently widen access.
//
// V Chairman holds DISABLE permanently and nothing else permanently. That is
// the specification's continuity rule, and the reasoning matters: the club
// asked for two people able to disable a compromised account. A capability
// that must be granted through cover first is useless in the one situation it
// exists for — if the compromised account is the Chairman's, there is nobody
// left to grant the cover. Creation and role assignment stay Chairman-only,
// because those are the powers that can escalate anyone to anything.
//
// System Maintainer holds the same set as Chairman. Somebody has to be able to
// repair the permission system, including the case where the permission system
// is what is broken. It is NOT a shared administrator login: it belongs to one
// named person, it is subject to every rule below — no self-promotion, no
// self-disable, elevation required for the dangerous capabilities — and every
// action it takes carries that name in the audit trail.
//
// CONFIRM_IDENTITY deliberately does NOT follow the administrative pattern. It
// is held by the Team Manager, who is not a staff administrator and holds
// nothing else here — because he is the person who actually knows which Josh
// Adams played on Saturday. Tying that decision to Developer access would mean
// the only people permitted to answer a football question are the two people
// least likely to know the answer, and the queue would sit untouched, which is
// exactly what happened. Any other role can be granted it in la_permissions
// without a deploy; that is a club decision, not a code one.
const DEFAULT_CAPS = {
  'System Maintainer': [CAP.VIEW_STAFF, CAP.MANAGE_USERS, CAP.DISABLE_ACCOUNT,
                        CAP.RESET_CREDENTIALS, CAP.ASSIGN_ROLES, CAP.ASSIGN_ADMIN,
                        CAP.CONFIRM_IDENTITY, CAP.MANAGE_ROSTER],
  'Chairman':   [CAP.VIEW_STAFF, CAP.MANAGE_USERS, CAP.DISABLE_ACCOUNT,
                 CAP.RESET_CREDENTIALS, CAP.ASSIGN_ROLES, CAP.ASSIGN_ADMIN,
                 CAP.CONFIRM_IDENTITY, CAP.MANAGE_ROSTER],
  'V Chairman': [CAP.VIEW_STAFF, CAP.DISABLE_ACCOUNT],
  // The manager picks the squad, so the manager maintains the squad list.
  'Team Manager': [CAP.CONFIRM_IDENTITY, CAP.MANAGE_ROSTER],
  // The Programme Editor maintains the roster and nothing else. He needs it
  // because a signing on Thursday has to be in Saturday's programme, and
  // waiting for a developer is how the old programme ended up capped at 15.
  'Programme Editor': [CAP.MANAGE_ROSTER],
};

/**
 * The authenticated individual behind a request.
 *
 * Reads ONLY the signed token. A caller who supplies a role, a username or an
 * isChairman flag in the body is ignored entirely — those fields are not read
 * here and must not be read by callers either.
 *
 * @returns {{username,role,isChairman,auth,elevated}|null}
 */
function sessionFrom(event) {
  const h = (event && event.headers) || {};
  const raw = h.authorization || h.Authorization || '';
  let token = '';
  if (/^Bearer\s+/i.test(raw)) token = raw.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    // A token may also arrive in the body for form-style callers, but it is
    // still a SIGNED token — not a claim. Anything unsigned fails verify().
    try { token = (JSON.parse(event.body || '{}') || {}).token || ''; } catch (e) { token = ''; }
  }
  if (!token) return null;

  // md-auth.verify() returns the session object itself, or null. There is no
  // `ok` field — checking for one rejected every VALID token and turned a
  // "you lack permission" (403) into "who are you" (401). Caught by
  // tests/staff-users-authz.test.js before this shipped.
  const v = AUTH.verify(token);
  if (!v) return null;

  return {
    username: v.username,
    role: v.role,
    isChairman: !!v.isChairman,
    auth: v.auth,                       // 'custom' | 'shared'
    elevated: v.auth === 'custom',
  };
}

/**
 * May this authenticated person do this?
 *
 * Order: la_permissions by role → default map → refuse.
 * There is no "chairman is all-powerful" shortcut here: the Chairman's rights
 * are listed explicitly in DEFAULT_CAPS so they can be read, tested and argued
 * with, rather than being an invisible bypass.
 */
async function can(sess, capability) {
  if (!sess || !capability) return false;

  // 1. The database is the canonical source when it has an opinion.
  try {
    const S = require('./football/store');
    if (S.configured()) {
      const rows = await S.rest('la_permissions?select=granted&role=eq.' +
        encodeURIComponent(sess.role) + '&capability=eq.' + encodeURIComponent(capability));
      if (rows && rows.length) return !!rows[0].granted;
    }
  } catch (e) {
    // Fall through to the default map. An unreachable database must never
    // widen access, and it must never be the reason the Chairman is locked out
    // of disabling a compromised account.
  }

  // 2. The default map.
  const byRole = DEFAULT_CAPS[sess.role] || [];
  if (byRole.indexOf(capability) > -1) return true;

  // 3. The chairman FLAG from the signed token — not from the request.
  if (sess.isChairman && (DEFAULT_CAPS['Chairman'] || []).indexOf(capability) > -1) return true;

  return false;
}

/**
 * The canonical guard.
 *
 *   const gate = await requireCap(event, CAP.MANAGE_USERS);
 *   if (!gate.ok) return gate.response;
 *   // gate.session is trusted from here on
 *
 * Fails closed on every branch: no token, bad token, missing capability,
 * missing elevation.
 */
async function requireCap(event, capability, opts) {
  const o = opts || {};
  const sess = sessionFrom(event);

  if (!sess) {
    return { ok: false, reason: 'no_session', response: deny(401,
      'Please sign in with your own staff password to do this.') };
  }

  const allowed = await can(sess, capability);
  if (!allowed) {
    return { ok: false, session: sess, reason: 'no_capability', response: deny(403,
      'Your account does not have permission for this.') };
  }

  const needsElevation = o.elevated === true || ELEVATED.indexOf(capability) > -1;
  if (needsElevation && !sess.elevated) {
    return { ok: false, session: sess, reason: 'needs_elevated', response: deny(403,
      'This needs your own personal password, not the shared committee one. ' +
      'Ask the chairman to set one for you.') };
  }

  return { ok: true, session: sess };
}

/** A refusal that says what to do next and leaks nothing about the system. */
function deny(code, message) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store, max-age=0',
    },
    body: JSON.stringify({ ok: false, error: message }),
  };
}

/**
 * Record what happened, to the existing audit table.
 *
 * Never receives a password, a hash, a token or a PIN — callers pass states and
 * roles, never secrets. `la_audit_log` is the log the Lane App already writes
 * to, so this is one trail rather than a second disconnected one.
 */
async function audit(entry) {
  const e = entry || {};
  try {
    const S = require('./football/store');
    if (!S.configured()) return null;
    return await S.rest('la_audit_log', {
      method: 'POST',
      body: [{
        actor_id: null,
        action: String(e.action || 'unknown'),
        entity: 'staff_account',
        entity_id: String(e.targetUser == null ? '' : e.targetUser),
        before: e.before || null,
        after: Object.assign({
          actor: e.actorUsername || null,
          actor_role: e.actorRole || null,
          capability: e.capability || null,
          auth: e.auth || null,            // 'custom' | 'shared' — strength, not the secret
          result: e.result || null,        // 'success' | 'rejected'
          reason: e.reason || null,        // category only
          cover: e.cover || null,
          at: new Date().toISOString(),
        }, e.after || {}),
      }],
      headers: { Prefer: 'return=minimal' },
    });
  } catch (err) {
    // An audit failure must never block or reverse a security decision. It is
    // recorded as a console error so it surfaces in Netlify logs.
    console.error('[authz] audit write failed:', String((err && err.message) || err));
    return null;
  }
}

module.exports = {
  CAP, ELEVATED, ADMIN_ROLES, DEFAULT_CAPS,
  sessionFrom, can, requireCap, audit, deny,
};
