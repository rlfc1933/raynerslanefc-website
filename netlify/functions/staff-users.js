// Rayners Lane FC — manage staff logins.
//
// ════════════════════════════════════════════════════════════════════════════
// WHAT THIS USED TO DO, AND WHY IT HAD TO CHANGE
// ════════════════════════════════════════════════════════════════════════════
// The only gate was the shared club PIN, and the chairman flag was read
// STRAIGHT OUT OF THE REQUEST BODY:
//
//     is_chairman: (b.isChairman != null ? !!b.isChairman : !!cur.is_chairman)
//                  || (b.role === 'Chairman') || username === 'Chairman'
//
// So anyone holding the PIN — a number typed into a phone at a turnstile, known
// to a great many people — could send one request and become Chairman:
//
//     POST /.netlify/functions/staff-users
//     { "pin": "…", "action": "add", "username": "me",
//       "password": "……", "isChairman": true }
//
// The portal's chairman check (`staffIsChairman()`) reads sessionStorage, so it
// could be defeated with one line in a browser console — and it was never the
// real gate anyway, because this endpoint never asked.
//
// ════════════════════════════════════════════════════════════════════════════
// WHAT IT DOES NOW
// ════════════════════════════════════════════════════════════════════════════
// Identity comes from a SIGNED md-auth token, minted by md-session.js only
// after a server-side password check. The browser cannot mint one.
// Authorisation comes from lib/authz.js → la_permissions → default map.
// Nothing in the body is read as a claim about who the caller is.
//
// The PIN is retained as a door, not as authority: it must still be present,
// because the rest of the portal expects it, and removing it would be a second
// change riding on a security fix. It no longer authorises anything.
//
//   GET  ?pin=…                         → list (needs can_view_staff)
//   POST { pin, action:'add',      … }  → create ordinary account
//   POST { pin, action:'setpassword' }  → reset credentials  (elevated)
//   POST { pin, action:'setrole',  … }  → assign a role
//   POST { pin, action:'disable',  … }  → stop a login       ← prefer this
//   POST { pin, action:'enable',   … }  → restore a login
//   POST { pin, action:'remove',   … }  → permanent deletion (elevated, last resort)
//
// Passwords remain salted SHA-256, never plain text, never returned.
'use strict';

const crypto = require('crypto');
const adminOk = require('./lib/pin');
const AUTHZ = require('./lib/authz');

const PEPPER = 'rlfc:staff:v1';
const CAP = AUTHZ.CAP;

// Roles a caller may assign. Validated against a SERVER-side list — a role
// string from the body can never introduce a new privilege level.
//
// The list itself now lives in lib/roles.js, so the portal, the invitation
// route and this route cannot drift apart. ASSIGNABLE_ROLES here is every role
// INCLUDING Chairman, because this route's own escalation check below is what
// gates Chairman — narrowing the list would turn an explained refusal
// ("only a chairman-level account can assign that role") into a bare
// "that is not a role this club uses", which is untrue and unhelpful.
const ROLES = require('./lib/roles');
const ASSIGNABLE_ROLES = ROLES.ROLES;
// Assigning any of these is privilege escalation and needs the strongest right.
const ADMIN_ROLES = ROLES.ADMIN_ROLES;

function hash(pw) { return crypto.createHash('sha256').update(String(pw) + ':' + PEPPER).digest('hex'); }

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Cache-Control': 'private, no-store, max-age=0',
    },
    body: JSON.stringify(obj),
  };
}

/** Never returns pass_hash. The list is for managing people, not credentials. */
function publicUser(username, u) {
  return {
    username: username,
    role: u.role || username,
    is_chairman: !!u.is_chairman,
    disabled: !!u.disabled,
    disabled_at: u.disabled_at || null,
    has_custom_password: !!u.pass_hash,
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});

  let body = {};
  if (event.httpMethod === 'POST') { try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; } }
  const pin = (event.queryStringParameters && event.queryStringParameters.pin) || body.pin || '';

  // The door. Necessary, not sufficient — see the header.
  if (!adminOk(pin)) return resp(401, { ok: false, error: 'Unauthorized' });

  const action = event.httpMethod === 'GET' ? 'list' : String(body.action || '');

  // Which capability does THIS action need? Deliberately not one blanket right:
  // the deputy who can disable a compromised account must not thereby be able
  // to promote themselves.
  const NEEDED = {
    list:        CAP.VIEW_STAFF,
    add:         CAP.MANAGE_USERS,
    setpassword: CAP.RESET_CREDENTIALS,
    setrole:     CAP.ASSIGN_ROLES,
    disable:     CAP.DISABLE_ACCOUNT,
    enable:      CAP.DISABLE_ACCOUNT,
    remove:      CAP.MANAGE_USERS,
  };
  const capability = NEEDED[action];
  if (!capability) return resp(400, { ok: false, error: 'bad-action' });

  const gate = await AUTHZ.requireCap(event, capability);
  if (!gate.ok) {
    // A refused sensitive action is itself worth recording.
    if (action !== 'list') {
      await AUTHZ.audit({
        action: 'staff.' + action, targetUser: body.username || null,
        actorUsername: gate.session ? gate.session.username : null,
        actorRole: gate.session ? gate.session.role : null,
        capability: capability, auth: gate.session ? gate.session.auth : null,
        result: 'rejected', reason: gate.reason,
      });
    }
    return gate.response;
  }
  const actor = gate.session;

  let store, users;
  try {
    const { getStore } = await import('@netlify/blobs');
    store = getStore('rlfc-staff');
    users = (await store.get('users', { type: 'json' })) || {};
  } catch (e) {
    return resp(200, { ok: false, error: 'no-store' });
  }

  if (action === 'list') {
    return resp(200, {
      ok: true,
      users: Object.keys(users).map(function (k) { return publicUser(k, users[k]); }),
      actor: { username: actor.username, role: actor.role, auth: actor.auth },
    });
  }

  const username = String(body.username || '').trim();
  if (!username) return resp(400, { ok: false, error: 'no-username' });

  const existing = users[username] || null;
  const before = existing ? publicUser(username, existing) : null;

  // ── SELF-PROTECTION ──────────────────────────────────────────────────────
  // An administrator may not use this endpoint to raise their OWN authority,
  // and may not disable or delete themselves. Self-promotion is the shape the
  // original vulnerability took, and it stays closed even for a legitimate
  // Chairman: a second person must be the one who makes you more powerful.
  const isSelf = username.toLowerCase() === String(actor.username || '').toLowerCase();

  async function refuse(reason, message, code) {
    await AUTHZ.audit({
      action: 'staff.' + action, targetUser: username, before: before,
      actorUsername: actor.username, actorRole: actor.role,
      capability: capability, auth: actor.auth, result: 'rejected', reason: reason,
    });
    return resp(code || 403, { ok: false, error: message });
  }

  try {
    // ── DISABLE / ENABLE ───────────────────────────────────────────────────
    // Preferred over deletion: the login stops, the person's history stays.
    if (action === 'disable' || action === 'enable') {
      if (!existing) return refuse('not_found', 'That account does not exist.', 404);
      if (action === 'disable' && isSelf) {
        return refuse('self_disable', 'You cannot disable your own account.');
      }
      // Disabling an administrator needs administrator-level authority.
      if (action === 'disable' && (existing.is_chairman || ADMIN_ROLES.indexOf(existing.role) > -1)) {
        if (!(await AUTHZ.can(actor, CAP.ASSIGN_ADMIN))) {
          return refuse('admin_target', 'Only a chairman-level account can disable another chairman.');
        }
      }
      users[username] = Object.assign({}, existing, {
        disabled: action === 'disable',
        disabled_at: action === 'disable' ? new Date().toISOString() : null,
        disabled_by: action === 'disable' ? actor.username : null,
      });
      await store.setJSON('users', users);
      await AUTHZ.audit({
        action: 'staff.' + action, targetUser: username, before: before,
        after: publicUser(username, users[username]),
        actorUsername: actor.username, actorRole: actor.role,
        capability: capability, auth: actor.auth, result: 'success',
      });
      return resp(200, { ok: true, user: publicUser(username, users[username]) });
    }

    // ── REMOVE ─────────────────────────────────────────────────────────────
    // Kept, but demoted to a last resort behind elevated proof, and refused for
    // administrators and for self.
    if (action === 'remove') {
      if (!existing) return refuse('not_found', 'That account does not exist.', 404);
      if (isSelf) return refuse('self_remove', 'You cannot remove your own account.');
      if (!actor.elevated) {
        return refuse('needs_elevated',
          'Removing an account needs your own personal password, not the shared one.');
      }
      if (existing.is_chairman || ADMIN_ROLES.indexOf(existing.role) > -1) {
        if (!(await AUTHZ.can(actor, CAP.ASSIGN_ADMIN))) {
          return refuse('admin_target', 'Only a chairman-level account can remove another chairman.');
        }
      }
      delete users[username];
      await store.setJSON('users', users);
      await AUTHZ.audit({
        action: 'staff.remove', targetUser: username, before: before,
        actorUsername: actor.username, actorRole: actor.role,
        capability: capability, auth: actor.auth, result: 'success',
        reason: 'permanent_deletion',
      });
      return resp(200, { ok: true, removed: username });
    }

    // ── SETROLE ────────────────────────────────────────────────────────────
    if (action === 'setrole') {
      if (!existing) return refuse('not_found', 'That account does not exist.', 404);
      const role = String(body.role || '').trim();
      if (ASSIGNABLE_ROLES.indexOf(role) === -1) {
        return refuse('bad_role', 'That is not a role this club uses.', 400);
      }
      const escalating = ADMIN_ROLES.indexOf(role) > -1;
      if (escalating) {
        if (isSelf) return refuse('self_promotion', 'You cannot promote your own account.');
        if (!(await AUTHZ.can(actor, CAP.ASSIGN_ADMIN))) {
          return refuse('no_admin_assign', 'Only a chairman-level account can assign that role.');
        }
        if (!actor.elevated) {
          return refuse('needs_elevated',
            'Assigning a chairman role needs your own personal password.');
        }
      }
      users[username] = Object.assign({}, existing, {
        role: role,
        // The chairman flag is derived from the SERVER-validated role. It is
        // never read from the request — that was the original vulnerability.
        is_chairman: escalating,
      });
      await store.setJSON('users', users);
      await AUTHZ.audit({
        action: 'staff.setrole', targetUser: username, before: before,
        after: publicUser(username, users[username]),
        actorUsername: actor.username, actorRole: actor.role,
        capability: escalating ? CAP.ASSIGN_ADMIN : capability,
        auth: actor.auth, result: 'success',
      });
      return resp(200, { ok: true, user: publicUser(username, users[username]) });
    }

    // ── ADD / SETPASSWORD ──────────────────────────────────────────────────
    if (action === 'add' || action === 'setpassword') {
      const password = String(body.password || '');
      if (password.length < 10) {
        return refuse('weak_password',
          'Please use a password of at least 10 characters.', 400);
      }
      if (action === 'setpassword' && !existing) {
        return refuse('not_found', 'That account does not exist.', 404);
      }

      const cur = existing || {};
      // A role may be supplied on create; it is validated server-side and can
      // never be an admin role without ASSIGN_ADMIN.
      let role = cur.role || username;
      if (action === 'add') {
        const wanted = String(body.role || '').trim();
        if (wanted) {
          if (ASSIGNABLE_ROLES.indexOf(wanted) === -1) {
            return refuse('bad_role', 'That is not a role this club uses.', 400);
          }
          if (ADMIN_ROLES.indexOf(wanted) > -1 && !(await AUTHZ.can(actor, CAP.ASSIGN_ADMIN))) {
            return refuse('no_admin_assign',
              'You cannot create an account with that level of access.');
          }
          role = wanted;
        }
      }

      // Resetting an administrator's password is a route into their account.
      if (action === 'setpassword' && (cur.is_chairman || ADMIN_ROLES.indexOf(cur.role) > -1)) {
        if (!(await AUTHZ.can(actor, CAP.ASSIGN_ADMIN))) {
          return refuse('admin_target',
            'Only a chairman-level account can reset a chairman password.');
        }
      }

      users[username] = {
        role: role,
        pass_hash: hash(password),
        // Derived from the validated role, never from body.isChairman.
        is_chairman: ADMIN_ROLES.indexOf(role) > -1,
        disabled: !!cur.disabled,
        disabled_at: cur.disabled_at || null,
      };
      await store.setJSON('users', users);
      await AUTHZ.audit({
        action: 'staff.' + action, targetUser: username, before: before,
        after: publicUser(username, users[username]),
        actorUsername: actor.username, actorRole: actor.role,
        capability: capability, auth: actor.auth, result: 'success',
      });
      return resp(200, { ok: true, user: publicUser(username, users[username]) });
    }

    return resp(400, { ok: false, error: 'bad-action' });
  } catch (e) {
    return resp(200, { ok: false, error: String((e && e.message) || e) });
  }
};

exports._internal = { ASSIGNABLE_ROLES, ADMIN_ROLES, publicUser };
