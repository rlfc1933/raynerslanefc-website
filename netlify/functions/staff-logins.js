// ════════════════════════════════════════════════════════════════════════════
// STAFF SIGN-IN HISTORY.
//
// This kept its own list in Netlify Blobs. That store has never been
// provisioned for this site, so every write went nowhere and the panel has
// always shown "no sign-ins recorded yet" no matter who signed in.
//
// It now reads la_audit_log, which the club already has and which every other
// staff action already writes to. One history rather than two, and the one that
// survives is the one with an owner.
//
//   GET  ?pin=...                  → { ok, logins:[{username, role, at}] }
//   POST { pin, username, role }   → record a sign-in
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const adminOk = require('./lib/pin');
const L = require('./lib/lane');

const TABLE = 'la_audit_log';
const ACTION = 'staff.signin';

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Cache-Control': 'private, no-store, max-age=0',
    },
    body: JSON.stringify(obj),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});

  let pin = (event.queryStringParameters && event.queryStringParameters.pin) || '';
  let b = {};
  if (event.httpMethod === 'POST') {
    try { b = JSON.parse(event.body || '{}'); pin = b.pin || pin; } catch (e) {}
  }
  if (!adminOk(pin)) return resp(401, { ok: false, error: 'Unauthorized', logins: [] });

  if (event.httpMethod === 'POST') {
    if (!b.username) return resp(400, { ok: false, error: 'no-username' });
    try {
      // Who and when. Never what they typed.
      await L.ins(TABLE, {
        action: ACTION,
        actor_username: String(b.username).slice(0, 60),
        actor_role: String(b.role || '').slice(0, 40),
        result: 'success',
      });
      return resp(200, { ok: true });
    } catch (e) {
      // A sign-in must never fail because its history could not be written.
      return resp(200, { ok: false, error: 'not-recorded' });
    }
  }

  try {
    const rows = await L.sel(TABLE +
      '?action=eq.' + ACTION + '&select=actor_username,actor_role,created_at' +
      '&order=created_at.desc&limit=60');
    return resp(200, {
      ok: true,
      logins: (rows || []).map(function (r) {
        return { username: r.actor_username, role: r.actor_role, at: r.created_at };
      }),
    });
  } catch (e) {
    return resp(200, { ok: false, error: 'no-store', logins: [] });
  }
};
