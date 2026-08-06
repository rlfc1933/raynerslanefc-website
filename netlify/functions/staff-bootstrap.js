// RETIRED 5 Aug 2026 — superseded by staff-chairman-setup.js.
//
// This minted an invitation TOKEN for the first Chairman, which somebody then
// had to copy out of a terminal and carry to Pete. That is a live credential in
// transit, seen by whoever ran the command. chairman-setup.html asks Pete for
// the club PIN and lets him type his own password directly, so no token exists
// at any point.
//
// Two routes that can both create a first Chairman is one more than the club
// needs. This one now refuses, always.
//
// ── what it used to be ──────────────────────────────────────────────────────
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
  // Refused unconditionally — before the flag, before the body, before the
  // store. There is exactly one first-Chairman route now, and it is the page.
  console.warn('[staff-bootstrap] retired route called and refused — use chairman-setup.html');
  return resp(410, {
    ok: false, retired: true, closed: true,
    error: 'This route has been retired. The first Chairman is set up at /chairman-setup.html, '
         + 'which never produces a token for anyone to carry.',
  });
};
