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
const STORE = require('./lib/staff-store');

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

// The shape of an account, and the word for its state, are decided once in
// lib/staff-store.js. This function used to derive them a second time from the
// raw record — which meant two places had an opinion about what "active" means
// and about which fields are safe to send. There is now one.

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});

  let pin = (event.queryStringParameters || {}).pin;
  if (!pin && event.body) {
    try { pin = JSON.parse(event.body).pin; } catch (e) { /* not JSON */ }
  }
  if (!adminOk(pin)) return resp(401, { ok: false, error: 'Unauthorized' });

  try {
    const rows = await STORE.listUsers();
    const staff = rows.map((u) => ({
      username: u.username,
      name: u.name || null,
      title: u.title || null,
      role: u.role,
      status: u.status,
    }));
    return resp(200, { ok: true, staff: staff, store: true });
  } catch (e) {
    // A store failure is REPORTED, not swallowed. Silently returning an empty
    // list is what made the original fault invisible: the screen fell back to
    // generic role names and looked like "the accounts were never created".
    // The caller shows a message and keeps temporary access available.
    console.error('[staff-roster] store unavailable:', (e && e.message) || e);
    return resp(200, {
      ok: false, store: false, staff: [],
      error: 'The staff list could not be loaded. Temporary committee access is still available.',
    });
  }
};

// Re-exported so the sign-in tests can assert the shape without reaching
// into the store's internals.
exports._internal = {
  statusOf: function (u) { return STORE.publicUser(u).status; },
  publicEntry: function (username, u) {
    const p = STORE.publicUser(Object.assign({ username: username }, u, {
      display_name: u.display_name || u.name || null,
      club_title: u.club_title || u.title || null,
    }));
    return { username: p.username, name: p.name, title: p.title, role: p.role, status: p.status };
  },
};
