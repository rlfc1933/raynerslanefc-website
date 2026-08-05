// The very first Chairman — and nothing else, ever.
//
// The secured account system needs an authorised administrator to create
// accounts, and there is no first administrator. That is a real chicken-and-egg
// and it has exactly one safe answer: a route that can do ONE thing, once,
// only when the owner explicitly switches it on.
//
//   POST { }   → { ok, setupToken }   creates the first Chairman INVITATION
//
// It sets no password. It returns an invitation link, which the owner follows
// to choose their own. So even the bootstrap never handles a credential.
//
// It is off unless STAFF_BOOTSTRAP_ENABLED is set in Netlify, it refuses once
// any Chairman exists, and it cannot be told which role to create.
'use strict';

const INV = require('./lib/invitations');
const AUTHZ = require('./lib/authz');

function resp(code, obj) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0' },
    body: JSON.stringify(obj),
  };
}

const CLOSED = {
  ok: false,
  error: 'Staff setup is closed. Accounts are created in the portal under Staff Access.',
  closed: true,
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });

  // OFF by default. An absent flag is a closed door, not an open one.
  if (!process.env.STAFF_BOOTSTRAP_ENABLED) return resp(410, CLOSED);

  try {
    // Self-closing: the moment a Chairman exists this route is finished
    // forever, whatever the flag says.
    if (await INV.chairmanExists()) {
      console.warn('[staff-bootstrap] refused — a chairman already exists.');
      return resp(410, CLOSED);
    }

    const username = String((JSON.parse(event.body || '{}') || {}).username || 'pete')
      .trim().toLowerCase();
    if (!/^[a-z][a-z0-9._-]{1,30}$/.test(username)) {
      return resp(400, { ok: false, error: 'Invalid username.' });
    }

    // The role is NOT read from the request. This route makes a Chairman or
    // nothing — an attacker who reaches it cannot ask for something else,
    // because there is nothing else to ask for.
    await INV.ensurePendingAccount(username, null, 'Chairman', 'Chairman');
    const made = await INV.create({
      username, title: 'Chairman', profile: 'Chairman', createdBy: 'bootstrap',
    });

    await AUTHZ.audit({
      action: 'staff.bootstrap', targetUser: username,
      actorUsername: 'bootstrap', actorRole: 'bootstrap',
      capability: 'bootstrap', result: 'success',
      after: { profile: 'Chairman', expires_at: made.invite.expires_at },
    });

    return resp(200, {
      ok: true,
      invitation: made.invite,
      setupToken: made.token,
      notice: 'Copy this link now. For security, it will not be shown again. ' +
              'Then remove STAFF_BOOTSTRAP_ENABLED from Netlify.',
    });
  } catch (e) {
    return resp(200, { ok: false, error: String((e && e.message) || e) });
  }
};
