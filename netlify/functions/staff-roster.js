// ════════════════════════════════════════════════════════════════════════════
// WHO CAN SIGN IN — the list the sign-in screen needs BEFORE anyone has.
//
// THE BUG THIS EXISTS TO FIX
// --------------------------
// The sign-in screen asked staff-users.js for the roster through
// staffAdminFetch(), which attaches a SIGNED SESSION token. At the sign-in
// screen nobody has a session — that is the entire point of the screen. So the
// call 401'd, the .catch() swallowed it, and the selector silently fell back to
// seven generic role names. Nobody's actual name ever appeared, and the failure
// looked exactly like "the accounts were never created".
//
// It was worse than silent: staffAdminFetch() responds to a missing token by
// PROMPTING for a password, so the sign-in screen could sit behind a dialog
// asking to authenticate before you could authenticate.
//
// WHAT THIS RETURNS, AND WHAT IT DELIBERATELY DOES NOT
// ---------------------------------------------------
// Only what a person needs to recognise themselves in a list: username, display
// name, club title, and whether the account is ready to use. Never a password
// hash, never a capability, never a token, never an email, never a sign-in
// history. If a field is not needed to draw the button, it is not here.
//
// WHY THE CLUB PIN IS THE RIGHT GATE
// ----------------------------------
// It is the only credential that exists at this point in the flow, and what it
// protects is not a secret: the committee's names and titles are published on
// the club's own About page. Knowing that Jenny is the Secretary tells an
// attacker nothing they could not read on the website. Knowing her PASSWORD is
// the thing that matters, and that is not here.
//
// Listing an account is not admitting it. Every one of these still has to pass
// staff-login.js, which checks the password, refuses disabled accounts, and
// refuses accounts that have never completed setup.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const adminOk = require('./lib/pin');

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      // Never cached: an account activated a minute ago must show as Active.
      'Cache-Control': 'private, no-store, max-age=0',
    },
    body: JSON.stringify(obj),
  };
}

/**
 * One word for the state of an account, in the words the club uses.
 *
 *   active          has a password and may sign in
 *   setup_required  exists, has no password yet, cannot sign in
 *   disabled        switched off; refused before the password is even checked
 */
function statusOf(u) {
  if (u.disabled) return 'disabled';
  if (!u.pass_hash) return 'setup_required';
  return 'active';
}

/** The safe shape. Everything else about the account stays on the server. */
function publicEntry(username, u) {
  return {
    username: username,
    name: u.name || null,
    title: u.title || null,
    role: u.role || username,
    status: statusOf(u),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});

  let pin = (event.queryStringParameters || {}).pin;
  if (!pin && event.body) {
    try { pin = JSON.parse(event.body).pin; } catch (e) { /* not JSON */ }
  }
  if (!adminOk(pin)) return resp(401, { ok: false, error: 'Unauthorized' });

  let users;
  try {
    const { getStore } = await import('@netlify/blobs');
    users = (await getStore('rlfc-staff').get('users', { type: 'json' })) || {};
  } catch (e) {
    // The store being unavailable must not lock the committee out of the
    // screen entirely — the caller falls back to temporary access.
    return resp(200, { ok: true, staff: [], store: false });
  }

  const staff = Object.keys(users)
    .map((k) => publicEntry(k, users[k]))
    .sort((a, b) => String(a.name || a.username).localeCompare(String(b.name || b.username)));

  return resp(200, { ok: true, staff: staff, store: true });
};

exports._internal = { statusOf, publicEntry };
