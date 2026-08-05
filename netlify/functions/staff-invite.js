// Create, list and revoke staff invitations.
//
// Nobody's password passes through here — an administrator creates a link, the
// person follows it and sets their own. See lib/invitations.js for why.
//
//   POST { pin, action:'create',  username, name, title, profile }
//   POST { pin, action:'list' }
//   POST { pin, action:'revoke',  id }
//
// The raw token is returned ONCE, by 'create', and never again.
'use strict';

const adminOk = require('./lib/pin');
const AUTHZ = require('./lib/authz');
const INV = require('./lib/invitations');

// One list, on the server — see lib/roles.js. Chairman is handled separately
// below because inviting one is privilege escalation, not an ordinary invite.
const ROLES = require('./lib/roles');
const ASSIGNABLE = ROLES.ASSIGNABLE_ROLES;
const ADMIN_PROFILES = ROLES.ADMIN_ROLES;

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'private, no-store, max-age=0',
    },
    body: JSON.stringify(obj),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  if (!adminOk(b.pin)) return resp(401, { ok: false, error: 'Unauthorized' });

  const action = String(b.action || 'list');
  const NEEDED = { list: AUTHZ.CAP.VIEW_STAFF, create: AUTHZ.CAP.MANAGE_USERS, revoke: AUTHZ.CAP.MANAGE_USERS };
  const capability = NEEDED[action];
  if (!capability) return resp(400, { ok: false, error: 'bad-action' });

  const gate = await AUTHZ.requireCap(event, capability);
  if (!gate.ok) {
    if (action !== 'list') {
      await AUTHZ.audit({ action: 'invite.' + action, targetUser: b.username || b.id || null,
        actorUsername: gate.session ? gate.session.username : null,
        capability, result: 'rejected', reason: gate.reason });
    }
    return gate.response;
  }
  const actor = gate.session;

  try {
    if (action === 'list') return resp(200, { ok: true, invitations: await INV.list() });

    if (action === 'revoke') {
      const out = await INV.revoke(String(b.id || ''), actor.username);
      if (!out) return resp(404, { ok: false, error: 'That invitation does not exist.' });
      await AUTHZ.audit({ action: 'invite.revoke', targetUser: out.username,
        actorUsername: actor.username, actorRole: actor.role,
        capability, auth: actor.auth, result: 'success' });
      return resp(200, { ok: true, invitation: out });
    }

    // create
    const username = String(b.username || '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9._-]{1,30}$/.test(username)) {
      return resp(400, { ok: false, error: 'Usernames are lower case letters, numbers, dot, dash or underscore.' });
    }
    const profile = String(b.profile || '').trim();

    // A Chairman invitation is privilege escalation and needs the strongest right.
    if (ADMIN_PROFILES.indexOf(profile) > -1) {
      if (!(await AUTHZ.can(actor, AUTHZ.CAP.ASSIGN_ADMIN))) {
        await AUTHZ.audit({ action: 'invite.create', targetUser: username,
          actorUsername: actor.username, capability: AUTHZ.CAP.ASSIGN_ADMIN,
          result: 'rejected', reason: 'no_admin_assign' });
        return resp(403, { ok: false, error: 'Only a chairman-level account can invite another chairman.' });
      }
      if (!actor.elevated) {
        return resp(403, { ok: false, error: 'Inviting a chairman needs your own personal password.' });
      }
    } else if (ASSIGNABLE.indexOf(profile) === -1) {
      return resp(400, { ok: false, error: 'That is not a role this club uses.' });
    }

    await INV.ensurePendingAccount(username, b.name, b.title, profile);
    const made = await INV.create({
      username, name: String(b.name || '').slice(0, 80),
      title: String(b.title || '').slice(0, 60), profile,
      createdBy: actor.username,
    });

    await AUTHZ.audit({ action: 'invite.create', targetUser: username,
      actorUsername: actor.username, actorRole: actor.role,
      capability, auth: actor.auth, result: 'success',
      after: { profile, expires_at: made.invite.expires_at } });   // never the token

    return resp(200, {
      ok: true,
      invitation: made.invite,
      setupToken: made.token,     // ← the only time this is ever returned
      notice: 'Copy this link now. For security, it will not be shown again.',
    });
  } catch (e) {
    return resp(200, { ok: false, error: String((e && e.message) || e) });
  }
};

exports._internal = { ASSIGNABLE, ADMIN_PROFILES };
