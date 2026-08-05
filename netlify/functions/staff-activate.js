// Redeem a staff invitation and set a password.
//
// PUBLIC by necessity — the person has no account yet, so there is nothing to
// authenticate them with except the one-time token itself. That token is the
// credential: 32 bytes of CSPRNG, stored only as a hash, single-use, expiring.
//
//   POST { token, action:'check' }                → is this link still good?
//   POST { token, password, confirm }             → set the password, activate
//
// No PIN. Requiring the club PIN here would mean telling every new committee
// member the shared secret before they have an account — which is exactly the
// habit this whole piece of work exists to end.
'use strict';

const INV = require('./lib/invitations');
const AUTHZ = require('./lib/authz');

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'private, no-store, max-age=0',
    },
    body: JSON.stringify(obj),
  };
}

// One sentence per outcome, none of which tells a prober anything useful about
// whether a token ever existed.
const WHY = {
  invalid: 'This link is not valid. Ask whoever invited you for a new one.',
  expired: 'This link has expired. Ask whoever invited you for a new one.',
  used: 'This link has already been used. If that was not you, tell the chairman.',
  revoked: 'This link has been cancelled. Ask whoever invited you for a new one.',
  already_active: 'That account is already set up. Sign in as normal.',
  weak_password: 'Please choose a password of at least 10 characters.',
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  const token = String(b.token || '');
  if (!token) return resp(400, { ok: false, error: WHY.invalid });

  try {
    if (String(b.action || '') === 'check') {
      const inv = await INV.findByToken(token);
      const status = INV.statusOf(inv);
      if (status !== 'pending') return resp(200, { ok: false, status, error: WHY[status] || WHY.invalid });
      return resp(200, { ok: true, status: 'pending', name: inv.name, username: inv.username, title: inv.title });
    }

    if (String(b.password || '') !== String(b.confirm || '')) {
      return resp(200, { ok: false, error: 'Those two passwords do not match.' });
    }

    const out = await INV.redeem(token, String(b.password || ''));
    if (!out.ok) {
      await AUTHZ.audit({ action: 'invite.redeem', result: 'rejected', reason: out.reason });
      return resp(200, { ok: false, error: WHY[out.reason] || WHY.invalid });
    }

    await AUTHZ.audit({ action: 'invite.redeem', targetUser: out.username,
      actorUsername: out.username, actorRole: out.profile,
      result: 'success', after: { activated: true } });   // never the password

    return resp(200, {
      ok: true,
      username: out.username,
      message: 'Your account is ready. Sign in with your username and the password you just chose.',
    });
  } catch (e) {
    return resp(200, { ok: false, error: 'Something went wrong. Please try again.' });
  }
};
